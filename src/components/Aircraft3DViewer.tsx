import { Orbit, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  headingToRotationY,
  modelAltitudeY,
  modelScaleFor,
  type Aircraft3DModel,
} from '@/data/aircraft3d'
import {
  fetchGroundPatch,
  fetchTerrainPatch,
  groundWindow,
  tileZoomForAltitude,
  type GroundPatch,
  type GroundWindow,
  type TerrainPatch,
} from '@/data/mapTiles'
import type { RenderAircraft } from '@/engine/fleetController'
import { formatHeading, formatSpeed } from '@/lib/format'

interface Aircraft3DViewerProps {
  aircraft: RenderAircraft
  model: Aircraft3DModel
  onClose: () => void
}

const SKY_TOP = '#2e5f96'
const SKY_HORIZON = '#d4e4f0'
const GROUND_BG = 0x0d1218
/** Terrain mesh resolution (vertices per side). */
const MESH_SEGMENTS = 256
/** Minimum drift before the ground patch re-centres, meters (scales with the window). */
const REFRESH_DRIFT_M = 2_000

interface SceneState {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  pivot: THREE.Group
  groundGroup: THREE.Group
  groundObject: THREE.Object3D | null
  scaledHeightM: number
  raf: number
  disposed: boolean
  lastLat: number
  lastLon: number
  groundEastM: number
  groundNorthM: number
  patchWindow: GroundWindow | null
  terrain: TerrainPatch | null
  fetching: boolean
  fetchToken: number
  abort: AbortController
  nextGroundCheckAt: number
}

/**
 * Full-screen orbit viewer: the aircraft at true 1:1 scale flying over its real
 * position on the map (satellite imagery + terrain relief), with the camera
 * orbiting around it. Drag orbits, the wheel zooms, `Esc` closes.
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
  const [groundLoading, setGroundLoading] = useState(true)
  const [attribution, setAttribution] = useState('')

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
        setGroundLoading(false)
        return
      }
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(container.clientWidth, container.clientHeight, false)
      renderer.setClearColor(GROUND_BG, 1)

      const scene = new THREE.Scene()
      scene.background = skyTexture()
      scene.fog = new THREE.Fog(new THREE.Color(SKY_HORIZON), 12_000, 46_000)

      const camera = new THREE.PerspectiveCamera(
        45,
        Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
        0.5,
        200_000,
      )

      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.08
      controls.enablePan = false
      controls.minDistance = Math.max(model.realLengthM * 0.55, 20)
      controls.maxDistance = Math.max(6_000, model.realLengthM * 60)
      controls.minPolarAngle = Math.PI * 0.05
      controls.maxPolarAngle = Math.PI * 0.62

      // Sun + sky fill so terrain relief shades like the reference views.
      scene.add(new THREE.HemisphereLight(0xbcd7f2, 0x3a4038, 1.15))
      const sun = new THREE.DirectionalLight(0xfff4e0, 2.0)
      sun.position.set(600, 900, 350)
      scene.add(sun)
      const fill = new THREE.DirectionalLight(0x9db8ff, 0.4)
      fill.position.set(-800, 350, -600)
      scene.add(fill)

      const groundGroup = new THREE.Group()
      scene.add(groundGroup)

      // Pivot centred where the model's bounding-box centre will sit.
      const pivot = new THREE.Group()
      scene.add(pivot)

      const abort = new AbortController()
      state = {
        renderer,
        scene,
        camera,
        controls,
        pivot,
        groundGroup,
        groundObject: null,
        scaledHeightM: model.realLengthM * 0.3,
        raf: 0,
        disposed: false,
        lastLat: liveRef.current.aircraft.lat,
        lastLon: liveRef.current.aircraft.lon,
        groundEastM: 0,
        groundNorthM: 0,
        patchWindow: null,
        terrain: null,
        fetching: false,
        fetchToken: 0,
        abort,
        nextGroundCheckAt: 0,
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
            // Chase view from behind the tail at 1:1 scale.
            const live = liveRef.current.aircraft
            const y = modelAltitudeY(live.altitude, live.onGround, state.scaledHeightM)
            const distance = Math.max(model.realLengthM * 2.3, 70)
            const theta = (live.heading * Math.PI) / 180
            state.controls.maxDistance = Math.max(6_000, y * 2.5, model.realLengthM * 60)
            state.controls.target.set(0, y, 0)
            state.camera.position.set(
              -Math.sin(theta) * distance * 0.9,
              y + distance * 0.45,
              Math.cos(theta) * distance * 0.9,
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

      const frame = (now: number): void => {
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

        // The map moves under the aircraft so the flight is visible against the
        // real terrain. Scene axes: +X = east, -Z = north.
        const dLat = live.lat - state.lastLat
        const dLon = live.lon - state.lastLon
        if (dLat !== 0 || dLon !== 0) {
          state.groundNorthM += dLat * 111_320
          state.groundEastM += dLon * 111_320 * Math.cos((live.lat * Math.PI) / 180)
          state.lastLat = live.lat
          state.lastLon = live.lon
        }
        if (state.patchWindow) {
          state.groundGroup.position.set(
            state.patchWindow.offsetEastM - state.groundEastM,
            0,
            -(state.patchWindow.offsetNorthM - state.groundNorthM),
          )
        }

        if (now >= state.nextGroundCheckAt) {
          state.nextGroundCheckAt = now + 500
          requestGround(state, live, setGroundLoading, setAttribution)
        }

        state.controls.update()
        state.renderer.render(state.scene, state.camera)
      }
      frame(0)

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
        state.abort.abort()
        window.cancelAnimationFrame(state.raf)
        state.controls.dispose()
        if (state.scene.background instanceof THREE.Texture) state.scene.background.dispose()
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
      setGroundLoading(false)
      return () => {
        resizeObserver?.disconnect()
        if (state) {
          state.disposed = true
          state.abort.abort()
          window.cancelAnimationFrame(state.raf)
          state.renderer.dispose()
        }
      }
    }
    // The scene is created once per model; telemetry flows through liveRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const altitudeM = aircraft.onGround ? 0 : Math.round(aircraft.altitude * 0.3048)
  const busy = loading || groundLoading

  const portalHost =
    (typeof document !== 'undefined' && document.querySelector('.ui-overlay')) || document.body

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Vista 3D de ${aircraft.callsign}`}
      className="fixed inset-0 z-[60] overflow-hidden bg-[#0d1218]"
    >
      <div ref={containerRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block h-full w-full" aria-label="Modelo 3D de la aeronave" />
      </div>

      {/* Header */}
      <div className="pointer-events-none absolute left-3 top-3 max-w-[min(420px,calc(100vw-96px))]">
        <div className="panel-raised flex items-start gap-2.5 rounded-lg px-3.5 py-2.5">
          <Orbit className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="cond truncate text-sm font-bold uppercase tracking-wider text-white">
              Vista 3D · {model.label}
            </h2>
            <p className="tech mt-0.5 truncate text-[11px] text-white/60">
              {aircraft.callsign} · {aircraft.type ?? model.representative} · modelo {model.representative} a escala 1:1
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="icon-btn absolute right-3 top-3 h-9 w-9 rounded border border-white/[0.09] bg-ink-700/90"
        aria-label="Cerrar vista 3D"
        title="Cerrar (Esc)"
      >
        <X className="h-4 w-4" />
      </button>

      {(busy || webglError || loadError) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="tech rounded border border-white/[0.09] bg-black/60 px-4 py-2.5 text-xs text-white/70">
            {webglError
              ? 'WebGL no está disponible en este navegador.'
              : loadError
                ? 'No se pudo cargar el modelo 3D.'
                : loading
                  ? 'Cargando modelo 3D…'
                  : 'Cargando el mapa del terreno…'}
          </div>
        </div>
      )}

      {/* HUD */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100vw-24px)] flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-white/[0.09] bg-black/55 px-3 py-2">
        <HudStat label="Altitud real" value={`${altitudeM.toLocaleString('es-ES')} m`} />
        <HudStat
          label="Sobre el mapa"
          value={aircraft.onGround ? 'En tierra' : `${aircraft.altitude.toLocaleString('es-ES')} ft`}
        />
        <HudStat label="Rumbo" value={formatHeading(aircraft.heading)} />
        <HudStat label="Velocidad" value={formatSpeed(aircraft.groundSpeed)} />
        <HudStat
          label="Escala"
          value={`1:1 · ${model.realLengthM.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`}
        />
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 flex max-w-[46vw] flex-col items-end gap-1">
        <span className="tech rounded border border-white/[0.09] bg-black/55 px-2.5 py-1 text-[10px] text-white/60">
          Arrastra para orbitar · Rueda para acercar
        </span>
        <span className="tech text-right text-[9px] leading-tight text-white/45">
          {attribution ? `${attribution} · ` : 'Cartografía procedural · '}
          Modelos 3D del proyecto
        </span>
      </div>
    </div>,
    portalHost,
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

/** Equirectangular sky gradient: deep blue overhead, pale haze at the horizon. */
function skyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 256)
    gradient.addColorStop(0, SKY_TOP)
    gradient.addColorStop(0.4, '#8fb8d8')
    gradient.addColorStop(0.5, SKY_HORIZON)
    gradient.addColorStop(0.56, '#c2d4e2')
    gradient.addColorStop(1, '#7a8fa3')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 8, 256)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Loads (or re-loads) the ground patch under the aircraft. */
function requestGround(
  state: SceneState,
  live: RenderAircraft,
  setGroundLoading: (value: boolean) => void,
  setAttribution: (value: string) => void,
): void {
  const altitudeM = live.onGround ? 0 : live.altitude * 0.3048
  const z = tileZoomForAltitude(altitudeM)
  const drift = Math.hypot(state.groundEastM, state.groundNorthM)
  // Wide cruise windows tolerate more drift before paying for a re-fetch.
  const driftLimit = Math.max(REFRESH_DRIFT_M, (state.patchWindow?.sizeMeters ?? 0) * 0.08)
  const needs =
    !state.patchWindow ||
    state.patchWindow.z !== z ||
    drift > driftLimit
  if (!needs || state.fetching) return
  state.fetching = true
  if (!state.patchWindow) setGroundLoading(true)
  const win = groundWindow(live.lat, live.lon, z)
  const token = ++state.fetchToken
  void Promise.all([
    fetchGroundPatch(win, state.abort.signal),
    fetchTerrainPatch(win, state.abort.signal),
  ])
    .then(([patch, terrain]) => {
      if (state.disposed || token !== state.fetchToken) return
      state.fetching = false
      applyPatch(state, patch, terrain, live)
      setGroundLoading(false)
      setAttribution(
        patch.attribution ? `${patch.attribution}${terrain ? ' · Elevación: Mapzen/AWS' : ''}` : '',
      )
    })
    .catch(() => {
      if (state.disposed || token !== state.fetchToken) return
      state.fetching = false
      setGroundLoading(false)
    })
}

/** Replaces the ground object with a textured terrain mesh (or a grid). */
function applyPatch(
  state: SceneState,
  patch: GroundPatch,
  terrain: TerrainPatch | null,
  live: RenderAircraft,
): void {
  const win = patch.window
  if (state.groundObject) {
    state.groundGroup.remove(state.groundObject)
    state.groundObject.traverse((node) => {
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
    state.groundObject = null
  }

  if (patch.canvas) {
    const geometry = new THREE.PlaneGeometry(win.sizeMeters, win.sizeMeters, MESH_SEGMENTS, MESH_SEGMENTS)
    const positions = geometry.attributes.position as THREE.BufferAttribute
    const span = MESH_SEGMENTS
    for (let j = 0; j <= span; j++) {
      for (let i = 0; i <= span; i++) {
        const height = terrain ? sampleHeight(terrain, i / span, j / span) : 0
        positions.setZ(j * (span + 1) + i, height)
      }
    }
    positions.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.rotateX(-Math.PI / 2)
    const texture = new THREE.CanvasTexture(patch.canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0 })
    state.groundObject = new THREE.Mesh(geometry, material)
  } else {
    state.groundObject = new THREE.GridHelper(win.sizeMeters, 40, 0x2f3d4d, 0x1b232d)
  }
  state.groundGroup.add(state.groundObject)
  state.patchWindow = win
  state.terrain = terrain
  state.groundEastM = 0
  state.groundNorthM = 0
  state.lastLat = live.lat
  state.lastLon = live.lon
  state.scene.fog = new THREE.Fog(
    new THREE.Color(SKY_HORIZON),
    win.sizeMeters * 0.3,
    win.sizeMeters * 0.6,
  )
}

/** Bilinear terrain sample at plane UV coordinates (row 0 = north edge). */
function sampleHeight(terrain: TerrainPatch, u: number, v: number): number {
  const { heights, samples } = terrain
  const fx = u * (samples - 1)
  const fy = v * (samples - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(x0 + 1, samples - 1)
  const y1 = Math.min(y0 + 1, samples - 1)
  const tx = fx - x0
  const ty = fy - y0
  const h00 = heights[y0 * samples + x0]
  const h10 = heights[y0 * samples + x1]
  const h01 = heights[y1 * samples + x0]
  const h11 = heights[y1 * samples + x1]
  return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) + h01 * (1 - tx) * ty + h11 * tx * ty
}
