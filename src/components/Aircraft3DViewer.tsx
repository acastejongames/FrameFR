import { Orbit, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  headingToRotationY,
  modelAltitudeY,
  modelScaleFor,
  type Aircraft3DModel,
} from '@/data/aircraft3d'
import type { RenderAircraft } from '@/engine/fleetController'
import { formatHeading, formatSpeed } from '@/lib/format'

interface Aircraft3DViewerProps {
  aircraft: RenderAircraft
  model: Aircraft3DModel
  onClose: () => void
}

const GROUND_BG = 0x0d1218
/** Ground grid extent and cell size, in meters. */
const GRID_SIZE = 40_000
const GRID_CELLS = 40
const CELL_M = GRID_SIZE / GRID_CELLS

interface SceneState {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  pivot: THREE.Group
  grid: THREE.GridHelper
  dropLine: THREE.Line
  scaledHeightM: number
  raf: number
  disposed: boolean
  lastLat: number
  lastLon: number
  groundEastM: number
  groundNorthM: number
}

/**
 * Orbit viewer for the selected aircraft: a 3D model at true 1:1 scale whose
 * altitude over the ground plane is the real altitude above the map.
 * Drag orbits the camera around the aircraft, the wheel zooms.
 */
export default function Aircraft3DViewer({ aircraft, model, onClose }: Aircraft3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<SceneState | null>(null)
  const liveRef = useRef({ aircraft, model })
  liveRef.current = { aircraft, model }
  const [webglError, setWebglError] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    let state: SceneState | null = null
    let resizeObserver: ResizeObserver | null = null

    try {
      // Probe for a real WebGL 2 context first: headless environments may
      // hand back a stub canvas context that three.js cannot drive.
      const probe = canvas.getContext('webgl2') as WebGL2RenderingContext | null
      if (!probe || typeof probe.getParameter !== 'function') {
        setWebglError(true)
        setLoading(false)
        return
      }
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(container.clientWidth, container.clientHeight, false)
      renderer.setClearColor(GROUND_BG, 1)

      const scene = new THREE.Scene()
      scene.fog = new THREE.Fog(GROUND_BG, 12_000, 46_000)

      const camera = new THREE.PerspectiveCamera(
        45,
        Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
        0.5,
        120_000,
      )

      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.08
      controls.enablePan = false
      controls.minDistance = Math.max(model.realLengthM * 0.55, 20)
      controls.maxDistance = Math.max(6_000, model.realLengthM * 60)
      controls.minPolarAngle = Math.PI * 0.05
      controls.maxPolarAngle = Math.PI * 0.62

      // Light: soft sky fill + warm sun + cool fill for readable PBR.
      scene.add(new THREE.HemisphereLight(0x9db8ff, 0x131a22, 1.25))
      const sun = new THREE.DirectionalLight(0xffffff, 2.1)
      sun.position.set(600, 1_200, 450)
      scene.add(sun)
      const fill = new THREE.DirectionalLight(0x88aaff, 0.5)
      fill.position.set(-800, 350, -600)
      scene.add(fill)

      // The map plane: sliding kilometre grid (moves under the aircraft).
      const grid = new THREE.GridHelper(GRID_SIZE, GRID_CELLS, 0x2f3d4d, 0x1b232d)
      scene.add(grid)

      // North direction on the map plane (-Z is north).
      const northMaterial = new THREE.LineBasicMaterial({ color: 0xffbe00, transparent: true, opacity: 0.55 })
      const northGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 2, -4_200),
        new THREE.Vector3(0, 2, -6_800),
      ])
      scene.add(new THREE.Line(northGeometry, northMaterial))
      const nCanvas = document.createElement('canvas')
      nCanvas.width = nCanvas.height = 128
      const nCtx = nCanvas.getContext('2d')
      if (nCtx) {
        nCtx.fillStyle = '#ffbe00'
        nCtx.font = 'bold 92px system-ui, sans-serif'
        nCtx.textAlign = 'center'
        nCtx.textBaseline = 'middle'
        nCtx.fillText('N', 64, 70)
        const nTexture = new THREE.CanvasTexture(nCanvas)
        nTexture.colorSpace = THREE.SRGBColorSpace
        const nPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(700, 700),
          new THREE.MeshBasicMaterial({ map: nTexture, transparent: true, side: THREE.DoubleSide }),
        )
        nPlane.rotation.x = -Math.PI / 2
        nPlane.position.set(0, 3, -7_600)
        scene.add(nPlane)
      }

      // Drop line from the map plane up to the aircraft (real altitude).
      const dropMaterial = new THREE.LineBasicMaterial({ color: 0xffbe00, transparent: true, opacity: 0.75 })
      const dropGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 1, 0),
      ])
      const dropLine = new THREE.Line(dropGeometry, dropMaterial)
      scene.add(dropLine)

      // Pivot centred where the model's bounding-box centre will sit.
      const pivot = new THREE.Group()
      scene.add(pivot)

      state = {
        renderer,
        scene,
        camera,
        controls,
        pivot,
        grid,
        dropLine,
        scaledHeightM: model.realLengthM * 0.3,
        raf: 0,
        disposed: false,
        lastLat: liveRef.current.aircraft.lat,
        lastLon: liveRef.current.aircraft.lon,
        groundEastM: 0,
        groundNorthM: 0,
      }
      sceneRef.current = state

      const loader = new GLTFLoader()
      loader.load(
        model.modelUrl,
        (gltf) => {
          if (state?.disposed) return
          const object = gltf.scene
          const box = new THREE.Box3().setFromObject(object)
          const size = box.getSize(new THREE.Vector3())
          const center = box.getCenter(new THREE.Vector3())
          const scale = modelScaleFor(size.x, model.realLengthM)
          object.position.sub(center)
          const inner = new THREE.Group()
          inner.add(object)
          inner.scale.setScalar(scale)
          pivot.add(inner)
          if (state) {
            state.scaledHeightM = size.y * scale
            setLoading(false)
            // Frame the aircraft from a three-quarter view at 1:1 scale.
            const live = liveRef.current.aircraft
            const y = modelAltitudeY(live.altitude, live.onGround, state.scaledHeightM)
            const distance = Math.max(model.realLengthM * 2.3, 70)
            state.controls.maxDistance = Math.max(6_000, y * 2.5, model.realLengthM * 60)
            state.controls.target.set(0, y, 0)
            state.camera.position.set(
              distance * 0.85,
              y + distance * 0.5,
              distance * 0.85,
            )
            state.controls.update()
          }
        },
        undefined,
        () => {
          if (state?.disposed) return
          setLoadError(true)
          setLoading(false)
        },
      )

      const frame = (): void => {
        if (!state || state.disposed) return
        state.raf = window.requestAnimationFrame(frame)
        const live = liveRef.current.aircraft
        const y = modelAltitudeY(live.altitude, live.onGround, state.scaledHeightM)
        state.pivot.position.y = y
        state.pivot.rotation.y = headingToRotationY(
          live.heading,
          liveRef.current.model.noseAlongPositiveX,
        )
        state.controls.target.y = y
        const positions = state.dropLine.geometry.attributes.position as THREE.BufferAttribute
        positions.setXYZ(0, 0, 0, 0)
        positions.setXYZ(1, 0, y, 0)
        positions.needsUpdate = true

        // The grid slides under the aircraft so the flight is visible against
        // the map plane. Scene axes: +X = east, -Z = north.
        const dLat = live.lat - state.lastLat
        const dLon = live.lon - state.lastLon
        if (dLat !== 0 || dLon !== 0) {
          state.groundNorthM += dLat * 111_320
          state.groundEastM += dLon * 111_320 * Math.cos((live.lat * Math.PI) / 180)
          state.lastLat = live.lat
          state.lastLon = live.lon
        }
        state.grid.position.x = -(((state.groundEastM % CELL_M) + CELL_M) % CELL_M)
        state.grid.position.z = ((state.groundNorthM % CELL_M) + CELL_M) % CELL_M

        state.controls.update()
        state.renderer.render(state.scene, state.camera)
      }
      frame()

      const handleResize = (): void => {
        if (!state || state.disposed) return
        const width = Math.max(container.clientWidth, 1)
        const height = Math.max(container.clientHeight, 1)
        state.camera.aspect = width / height
        state.camera.updateProjectionMatrix()
        state.renderer.setSize(width, height, false)
      }
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(handleResize)
        resizeObserver.observe(container)
      } else {
        window.addEventListener('resize', handleResize)
      }

      return () => {
        resizeObserver?.disconnect()
        window.removeEventListener('resize', handleResize)
        if (!state) return
        state.disposed = true
        window.cancelAnimationFrame(state.raf)
        state.controls.dispose()
        state.scene.traverse((node) => {
          const mesh = node as THREE.Mesh
          if (mesh.geometry) mesh.geometry.dispose()
          const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
          for (const material of materials) {
            for (const value of Object.values(material)) {
              if (value instanceof THREE.Texture) value.dispose()
            }
            material.dispose()
          }
        })
        state.renderer.dispose()
        sceneRef.current = null
      }
    } catch {
      setWebglError(true)
      setLoading(false)
      return () => {
        resizeObserver?.disconnect()
        if (state) {
          state.disposed = true
          window.cancelAnimationFrame(state.raf)
          state.renderer.dispose()
        }
      }
    }
  }, [model.id, model.modelUrl, model.realLengthM, model.noseAlongPositiveX])

  // Close with ESC. The handler is registered in the capture phase so the
  // topmost overlay wins the key before global shortcuts, and a stable ref
  // avoids re-subscribing (and losing the key) on every telemetry re-render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  const altitudeM = aircraft.onGround
    ? 0
    : Math.round(aircraft.altitude * 0.3048)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Vista 3D de ${aircraft.callsign}`}
        className="panel-raised flex h-full w-full max-w-[1100px] flex-col overflow-hidden rounded-lg"
        style={{ maxHeight: 'calc(var(--ui-height, 100dvh) * .92)' }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#14171c] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Orbit className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="cond truncate text-sm font-bold uppercase tracking-wider text-white">
                Vista 3D · {model.label}
              </h2>
              <p className="tech truncate text-[11px] text-white/55">
                {aircraft.callsign} · {aircraft.type ?? model.representative} · modelo {model.representative} a escala 1:1
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn h-7 w-7 rounded border border-white/[0.09] bg-ink-700"
            aria-label="Cerrar vista 3D"
            title="Cerrar (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Canvas */}
        <div ref={containerRef} className="relative min-h-0 flex-1 bg-[#0d1218]">
          <canvas ref={canvasRef} className="block h-full w-full" aria-label="Modelo 3D de la aeronave" />
          {(loading || webglError || loadError) && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="tech rounded border border-white/[0.09] bg-black/60 px-4 py-2.5 text-xs text-white/70">
                {webglError
                  ? 'WebGL no está disponible en este navegador.'
                  : loadError
                    ? 'No se pudo cargar el modelo 3D.'
                    : 'Cargando modelo 3D…'}
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
            <span className="tech rounded border border-white/[0.09] bg-black/55 px-2.5 py-1 text-[10px] text-white/60">
              Arrastra para orbitar · Rueda para acercar
            </span>
          </div>
        </div>

        {/* HUD */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/[0.07] bg-[#14171c] px-4 py-2.5">
          <HudStat label="Altitud real" value={`${Math.round(altitudeM).toLocaleString('es-ES')} m`} />
          <HudStat label="Sobre el mapa" value={aircraft.onGround ? 'En tierra' : `${aircraft.altitude.toLocaleString('es-ES')} ft`} />
          <HudStat label="Rumbo" value={formatHeading(aircraft.heading)} />
          <HudStat label="Velocidad" value={formatSpeed(aircraft.groundSpeed)} />
          <HudStat label="Escala" value={`1:1 · ${model.realLengthM.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`} />
        </div>
      </div>
    </div>
  )
}

function HudStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="tech text-[9px] uppercase tracking-wider text-white/40">{label}</span>
      <span className="tech text-xs font-bold text-white/85">{value}</span>
    </div>
  )
}
