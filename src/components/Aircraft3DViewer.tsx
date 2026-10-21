import { Orbit, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  headingToRotationY,
  modelAltitudeY,
  modelScaleFor,
  type Aircraft3DModel,
} from '@/data/aircraft3d'
import { buildAircraftObject } from '@/data/aircraft3dModels'
import {
  DEFAULT_PERFORMANCE,
  GROUND_TILE_PX,
  MESH_SEGMENTS,
  MIN_AUTO_RATIO,
  QUALITY_LABELS,
  QUALITY_TIERS,
  RENDER_RESOLUTIONS,
  RESOLUTION_LABELS,
  cameraNearFor,
  TERRAIN_STRIDE,
  isPerformanceSettings,
  normalizePerformance,
  viewerPixelRatio,
  type PerformanceSettings,
  type QualityTier,
  type RenderResolution,
} from '@/data/quality'
import {
  DETAIL_ZOOM_JUMP,
  VIEW_DISTANCES,
  baseSurfaceHeight,
  detailWindow,
  farWindow,
  fetchFarPatch,
  fetchGroundDetail,
  fetchGroundPatch,
  fetchTerrainPatch,
  sampleHeight,
  viewWindow,
  windowOffset,
  type GroundPatch,
  type GroundWindow,
  type TerrainPatch,
} from '@/data/mapTiles'
import {
  cesiumIonToken,
  REANCHOR_DRIFT_M,
  TOKEN_EVENT,
  type PhotogrammetryState,
} from '@/data/photogrammetrySettings'
import type { PhotogrammetryHandle } from '@/data/photogrammetry'
import { MotionSampler, EARTH_M_PER_DEG, type MotionSample } from '@/engine/motionSampler'
import type { RenderAircraft } from '@/engine/fleetController'
import { formatHeading, formatSpeed } from '@/lib/format'
import { usePersistentState } from '@/hooks/usePersistentState'

interface Aircraft3DViewerProps {
  aircraft: RenderAircraft
  model: Aircraft3DModel
  onClose: () => void
}

const SKY_TOP = '#2e5f96'
const SKY_HORIZON = '#d4e4f0'
const GROUND_BG = 0x0d1218
/** Minimum drift before the ground patch re-centres, meters (scales with the window). */
const REFRESH_DRIFT_M = 2_000
/** Orbit damping time constant, seconds (applied per frame, frame-rate independent). */
const DAMPING_TAU_S = 0.22
/** How far the plane may leave the sharp patch before it is renewed. */
const DETAIL_DRIFT_FRACTION = 0.22
/** Resolution governor: measurement window and warm-up before adapting. */
const ADAPT_WINDOW_MS = 2_000
const ADAPT_WARMUP_MS = 4_000

interface SceneState {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  pivot: THREE.Group
  groundGroup: THREE.Group
  groundObject: THREE.Object3D | null
  /** Sharp patch drawn on top of the wide one. */
  detailObject: THREE.Object3D | null
  detailWindow: GroundWindow | null
  detailToken: number
  /** Imagery of the sharp patch, kept across wide-patch refreshes. */
  detailCanvas: HTMLCanvasElement | null
  /** Where the sharp patch was fetched, to know when it has to be renewed. */
  detailCentre: { lat: number; lon: number } | null
  /** Optional photogrammetric tiles from Cesium ion (null when off). */
  photogrammetry: PhotogrammetryHandle | null
  photoAnchor: { lat: number; lon: number } | null
  /** Key tail + mesh tier the live tiles were built with. */
  photoSignature: string
  /** Guards against a late tiles module landing after a toggle. */
  photoToken: number
  /** True while the lazy tiles module is still on its way. */
  photoPending: boolean
  /** Sharp/satellite ground is hidden while the photogrammetry covers it. */
  flatHidden: boolean
  /** Low zoom backdrop that reaches the horizon. */
  farObject: THREE.Object3D | null
  farWindow: GroundWindow | null
  farToken: number
  farFetching: boolean
  farSizeMeters: number
  scaledHeightM: number
  raf: number
  disposed: boolean
  /** Smoothed telemetry track of the model. */
  sampler: MotionSampler
  /** Last report fed to the sampler (to detect new observations). */
  lastPushed: Omit<MotionSample, 't'> | null
  /** Position of the current ground window centre (patch anchor). */
  anchorLat: number
  anchorLon: number
  patchWindow: GroundWindow | null
  terrain: TerrainPatch | null
  fetching: boolean
  fetchToken: number
  abort: AbortController
  nextGroundCheckAt: number
  /** Next time the provider attributions are refreshed (ms). */
  nextAttributionAt: number
  /** Render distance multiplier (1–5) of the current patch. */
  range: number
  lastFrameAt: number
  /** Currently installed aircraft object (quality rebuilds replace it). */
  modelObject: THREE.Object3D | null
  modelDispose: (() => void) | null
  /** Guards against a slow quality rebuild landing after a newer one. */
  modelToken: number
  modelReady: boolean
  /** Quality tier the scene was built with. */
  quality: { mesh: QualityTier; textures: QualityTier }
  /** Ground signature (segments/tile pixels/DEM stride) of the current mesh. */
  groundKey: string
  /** Effective drawing-buffer scale and the mode that governs it. */
  resolution: RenderResolution
  pixelRatio: number
  autoScale: number
  perf: { frames: number; since: number; low: number; high: number; warmupUntil: number }
  /** Re-applies persisted quality settings to the live scene. */
  applyQuality: () => void
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
  const [range, setRange] = usePersistentState<number>(
    'aeroscope:viewer3d:range',
    1,
    (value): value is number => typeof value === 'number' && value >= 1 && value <= 5,
    (value) => Math.max(1, Math.min(5, Math.round(Number(value) || 1))),
  )
  const rangeRef = useRef(range)
  rangeRef.current = range

  // Shared with Settings › Rendimiento; both stay live through the persistent
  // state broadcaster, so changing quality in either place updates the scene.
  const [performance, setPerformance] = usePersistentState<PerformanceSettings>(
    'performance',
    DEFAULT_PERFORMANCE,
    isPerformanceSettings,
    normalizePerformance,
  )
  const performanceRef = useRef(performance)
  performanceRef.current = performance
  // Photogrammetry is opt-in: it streams Google Photorealistic 3D Tiles through
  // Cesium ion's free plan, so it only needs a free token. Without one the
  // viewer keeps the satellite + relief ground.
  const [photogrammetryOn, setPhotogrammetryOn] = usePersistentState<boolean>(
    'photogrammetry',
    false,
    (value): value is boolean => typeof value === 'boolean',
  )
  const photogrammetryRef = useRef(photogrammetryOn)
  photogrammetryRef.current = photogrammetryOn
  const [photoState, setPhotoState] = useState<PhotogrammetryState>('off')
  /** Why the layer failed (empty unless `photoState` is 'error'). */
  const [photoError, setPhotoError] = useState('')
  const photoStateRef = useRef<PhotogrammetryState>('off')
  photoStateRef.current = photoState
  // Attribution the tiles themselves require (Google, data providers…).
  const [photoAttribution, setPhotoAttribution] = useState('')
  const photoAttributionRef = useRef('')
  const [autoScale, setAutoScale] = useState(() => viewerPixelRatio(performance.resolution))
  const [qualityOpen, setQualityOpen] = useState(false)
  const qualityPanelRef = useRef<HTMLDivElement>(null)

  // Close the quality popover when clicking anywhere else in the viewer.
  useEffect(() => {
    if (!qualityOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      if (qualityPanelRef.current?.contains(event.target as Node)) return
      setQualityOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [qualityOpen])

  /** Mirror of the photogrammetry preference for the frame loop. */
  const photoRefs = useRef({ on: photogrammetryOn, token: cesiumIonToken() })
  photoRefs.current = {
    on: photogrammetryOn,
    token: photogrammetryOn ? cesiumIonToken() : '',
  }

  /**
   * Creates, keeps or tears down the photogrammetry layer.
   *
   * Called on mount and whenever the setting changes. It never blocks: if the
   * token is missing or Cesium rejects it, the satellite ground stays as is.
   */
  const syncPhotogrammetry = (state: SceneState): void => {
    const { on, token: ionToken } = photoRefs.current
    if (!on || !ionToken) {
      teardownPhotogrammetry(state)
      setPhotoError('')
      // Two different situations for the hint: the layer is simply off, or it
      // is on but this browser has no Cesium ion token yet.
      setPhotoState(on ? 'nokey' : 'off')
      return
    }
    const signature = `${ionToken.slice(-6)}/${state.quality.mesh}`
    if (state.photoSignature === signature) {
      // Already waiting for the module: a second call (mount + toggle effect)
      // must not start a duplicate tileset request.
      if (state.photoPending) return
      if (state.photogrammetry) {
        const drift = driftFromAnchor(state.photoAnchor, liveRef.current.aircraft)
        if (drift < REANCHOR_DRIFT_M) return
      } else if (photoStateRef.current !== 'error') {
        return
      }
    }
    // New anchor, new key or new mesh tier: rebuild from scratch.
    teardownPhotogrammetry(state)
    const aircraft = liveRef.current.aircraft
    const mesh = state.quality.mesh
    const generation = ++state.photoToken
    state.photoAnchor = { lat: aircraft.lat, lon: aircraft.lon }
    state.photoSignature = signature
    state.photoPending = true
    setPhotoState('loading')
    setPhotoError('')
    // The tiles renderer is a heavy module: it only loads when the feature is
    // actually requested.
    void import('@/data/photogrammetry')
      .then(({ loadPhotogrammetry }) =>
        loadPhotogrammetry({
          token: ionToken,
          lat: aircraft.lat,
          lon: aircraft.lon,
          quality: mesh,
          onError: (message) => {
            if (!state || state.disposed || generation !== state.photoToken) return
            setPhotoError(message)
          },
          onState: (next) => {
            if (!state || state.disposed || generation !== state.photoToken) return
            setPhotoState(next)
            if (next === 'error') {
              // Keep the satellite ground; the token can be checked in Settings.
              teardownPhotogrammetry(state)
            }
          },
        }),
      )
      .then((handle) => {
        if (!state || state.disposed || generation !== state.photoToken) {
          handle.dispose()
          return
        }
        state.photoPending = false
        state.photogrammetry = handle
        state.scene.add(handle.group)
        state.scene.fog = null
        state.camera.far = Math.max(1_500_000, state.camera.far)
        state.camera.updateProjectionMatrix()
      })
      .catch(() => {
        if (!state || state.disposed || generation !== state.photoToken) return
        teardownPhotogrammetry(state)
        setPhotoState('error')
      })
      .finally(() => {
        if (state && generation === state.photoToken) state.photoPending = false
      })
  }

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
      const initialQuality = performanceRef.current
      const initialRatio = viewerPixelRatio(initialQuality.resolution)
      // MSAA is the one renderer setting that cannot change without rebuilding
      // the context: skip it on the low tier, where pixel ratio matters more.
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: initialQuality.mesh !== 'baja',
      })
      renderer.setPixelRatio(initialRatio)
      renderer.setSize(container.clientWidth, container.clientHeight, false)
      renderer.setClearColor(GROUND_BG, 1)

      const scene = new THREE.Scene()
      scene.background = skyTexture()
      scene.fog = new THREE.Fog(new THREE.Color(SKY_HORIZON), 12_000, 46_000)

      const camera = new THREE.PerspectiveCamera(
        45,
        Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
        1,
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
        detailObject: null,
        detailWindow: null,
        detailToken: 0,
        detailCanvas: null,
        detailCentre: null,
        photogrammetry: null,
        photoAnchor: null,
        photoSignature: '',
        photoToken: 0,
        photoPending: false,
        flatHidden: false,
        farObject: null,
        farWindow: null,
        farToken: 0,
        farFetching: false,
        farSizeMeters: 0,
        scaledHeightM: model.realLengthM * 0.3,
        raf: 0,
        disposed: false,
        sampler: new MotionSampler(),
        lastPushed: null,
        anchorLat: liveRef.current.aircraft.lat,
        anchorLon: liveRef.current.aircraft.lon,
        patchWindow: null,
        terrain: null,
        fetching: false,
        fetchToken: 0,
        abort,
        nextGroundCheckAt: 0,
        nextAttributionAt: 0,
        range: rangeRef.current,
        lastFrameAt: 0,
        modelObject: null,
        modelDispose: null,
        modelToken: 0,
        modelReady: false,
        quality: { mesh: initialQuality.mesh, textures: initialQuality.textures },
        groundKey: '',
        resolution: initialQuality.resolution,
        pixelRatio: initialRatio,
        autoScale: initialRatio,
        perf: { frames: 0, since: 0, low: 0, high: 0, warmupUntil: 0 },
        applyQuality: () => undefined,
      }
      sceneRef.current = state
      setAutoScale(initialRatio)

      // Dev/test seam: browser tests read the live camera state from here to
      // assert the camera stays where the user put it across telemetry ticks.
      if (import.meta.env.DEV) {
        const w = window as unknown as {
          __viewer3d?: { setups: number; snap?: () => Record<string, unknown> }
        }
        w.__viewer3d = {
          setups: (w.__viewer3d?.setups ?? 0) + 1,
          snap: () => ({
            cam: state?.camera.position.toArray() ?? null,
            target: state?.controls.target.toArray() ?? null,
            aircraftId: liveRef.current.aircraft.id,
            modelId: liveRef.current.model.id,
            pixelRatio: state?.renderer.getPixelRatio() ?? null,
            triangles: state?.modelObject ? countTriangles(state.modelObject) : 0,
            textureSize: state?.modelObject ? maxTextureSize(state.modelObject) : 0,
            groundVertices:
              (state?.groundObject as THREE.Mesh | null)?.geometry?.getAttribute('position')
                ?.count ?? 0,
            detail: Boolean(state?.detailObject),
            detailVertices:
              (state?.detailObject as THREE.Mesh | null)?.geometry?.getAttribute('position')
                ?.count ?? 0,
            far: Boolean(state?.farObject),
            photogrammetry: state?.photogrammetry ? state.photoSignature : null,
            photoState: photoStateRef.current,
            flatHidden: state?.flatHidden ?? false,
            farWindow: state?.farWindow
              ? { z: state.farWindow.z, size: Math.round(state.farWindow.sizeMeters) }
              : null,
            farFetching: state?.farFetching ?? null,
            quality: state
              ? {
                  mesh: state.quality.mesh,
                  textures: state.quality.textures,
                  resolution: state.resolution,
                }
              : null,
            loading: !state?.modelReady,
          }),
        }
      }

      // Builds (or rebuilds) the aircraft for the selected quality tier.
      const loadModel = (): void => {
        if (!state) return
        const scene = state
        const token = ++scene.modelToken
        const firstLoad = !scene.modelReady
        if (firstLoad) {
          setLoading(true)
          setLoadError(false)
        }
        void buildAircraftObject(
          model.modelUrl,
          scene.quality.mesh,
          scene.quality.textures,
          renderer.capabilities.getMaxAnisotropy(),
        )
          .then((prepared) => {
            // A newer rebuild or a closed viewer wins over this result.
            if (scene.disposed || token !== scene.modelToken) {
              prepared.dispose()
              return
            }
            if (scene.modelObject) {
              scene.modelObject.removeFromParent()
              scene.modelDispose?.()
            }
            const object = prepared.object
            const box = new THREE.Box3().setFromObject(object)
            const size = box.getSize(new THREE.Vector3())
            const center = box.getCenter(new THREE.Vector3())
            const scale = modelScaleFor(size.x, model.realLengthM)
            object.position.sub(center)
            const inner = new THREE.Group()
            inner.add(object)
            inner.scale.setScalar(scale)
            scene.pivot.add(inner)
            scene.modelObject = inner
            scene.modelDispose = prepared.dispose
            scene.scaledHeightM = size.y * scale
            if (firstLoad) {
              scene.modelReady = true
              setLoading(false)
              // Chase view from behind the tail at 1:1 scale.
              const live = liveRef.current.aircraft
              const y = modelAltitudeY(live.altitude, live.onGround, scene.scaledHeightM)
              const distance = Math.max(model.realLengthM * 2.3, 70)
              const theta = (live.heading * Math.PI) / 180
              scene.controls.maxDistance = Math.max(6_000, y * 2.5, model.realLengthM * 60)
              scene.controls.target.set(0, y, 0)
              scene.camera.position.set(
                -Math.sin(theta) * distance * 0.9,
                y + distance * 0.45,
                Math.cos(theta) * distance * 0.9,
              )
              scene.controls.update()
            }
          })
          .catch(() => {
            if (scene.disposed || token !== scene.modelToken) return
            if (firstLoad) {
              setLoadError(true)
              setLoading(false)
            }
          })
      }
      loadModel()

      // Live quality switch: pixel ratio is free, the model and the ground
      // mesh are rebuilt, but the camera keeps its exact position.
      state.applyQuality = (): void => {
        if (!state) return
        const scene = state
        const next = performanceRef.current
        const ratio = viewerPixelRatio(next.resolution)
        if (next.resolution !== scene.resolution || ratio !== scene.pixelRatio) {
          scene.resolution = next.resolution
          scene.pixelRatio = ratio
          scene.autoScale = ratio
          scene.renderer.setPixelRatio(ratio)
          scene.perf = {
            frames: 0,
            since: 0,
            low: 0,
            high: 0,
            warmupUntil: window.performance.now() + ADAPT_WARMUP_MS,
          }
          setAutoScale(ratio)
        }
        if (next.mesh !== scene.quality.mesh || next.textures !== scene.quality.textures) {
          scene.quality = { mesh: next.mesh, textures: next.textures }
          scene.groundKey = ''
          loadModel()
        }
      }

      const frame = (now: number): void => {
        if (!state || state.disposed) return
        state.raf = window.requestAnimationFrame(frame)

        // A hidden tab gets no frames from the browser, but some contexts still
        // deliver a few: skip rendering and map work entirely, and re-measure
        // once the viewer is visible again.
        if (typeof document !== 'undefined' && document.hidden) {
          state.lastFrameAt = now
          state.perf.frames = 0
          state.perf.since = 0
          state.perf.warmupUntil = now + ADAPT_WARMUP_MS
          return
        }

        // Feed the motion sampler once per telemetry observation; the
        // rendered state interpolates smoothly between reports.
        const live = liveRef.current.aircraft
        const observed: Omit<MotionSample, 't'> = {
          lat: live.lat,
          lon: live.lon,
          altM: modelAltitudeY(live.altitude, live.onGround, state.scaledHeightM),
          headingDeg: live.heading,
          speedMs: live.groundSpeed * 0.514_444,
          vsMs: live.verticalRate * 0.005_08,
          onGround: live.onGround,
        }
        if (
          !state.lastPushed ||
          state.lastPushed.lat !== observed.lat ||
          state.lastPushed.lon !== observed.lon ||
          state.lastPushed.altM !== observed.altM ||
          state.lastPushed.headingDeg !== observed.headingDeg ||
          state.lastPushed.speedMs !== observed.speedMs ||
          state.lastPushed.vsMs !== observed.vsMs ||
          state.lastPushed.onGround !== observed.onGround
        ) {
          state.sampler.push({ t: now, ...observed })
          state.lastPushed = observed
        }
        const motion = state.sampler.stateAt(now)
        if (motion) {
          const y = motion.altM
          state.pivot.position.y = y
          state.pivot.rotation.y = headingToRotationY(
            motion.headingDeg,
            liveRef.current.model.noseAlongPositiveX,
          )
          // The orbit target rides the smoothed altitude so the camera keeps
          // the framing the user chose instead of pitching with each report.
          state.controls.target.y = y

          // The map moves under the aircraft so the flight is visible against
          // the real terrain. Scene axes: +X = east, -Z = north.
          if (state.patchWindow) {
            const driftNorthM = (motion.lat - state.anchorLat) * EARTH_M_PER_DEG
            const driftEastM =
              (motion.lon - state.anchorLon) *
              EARTH_M_PER_DEG *
              Math.cos((state.anchorLat * Math.PI) / 180)
            state.groundGroup.position.set(
              state.patchWindow.offsetEastM - driftEastM,
              0,
              -(state.patchWindow.offsetNorthM - driftNorthM),
            )
          }
        }

        if (now >= state.nextGroundCheckAt) {
          state.nextGroundCheckAt = now + 500
          requestGround(state, motion, live, setGroundLoading, setAttribution, rangeRef.current)
        }

        // Time-based damping: the orbit settles in the same time at any fps.
        const dtS = state.lastFrameAt ? Math.min((now - state.lastFrameAt) / 1000, 0.5) : 1 / 60
        state.lastFrameAt = now
        state.controls.dampingFactor = 1 - Math.exp(-dtS / DAMPING_TAU_S)
        state.controls.update()

        // Depth precision follows the orbit: without this, the layers of ground
        // two metres apart fight for the same depth values beyond a few km.
        const orbit = state.camera.position.distanceTo(state.controls.target)
        const near = cameraNearFor(orbit)
        if (Math.abs(near - state.camera.near) > state.camera.near * 0.25) {
          state.camera.near = near
          state.camera.updateProjectionMatrix()
        }
        state.camera.updateMatrixWorld()

        if (state.photogrammetry) {
          const photo = state.photogrammetry
          offsetPhotogrammetry(state, motion ?? live)
          // The tiles need the camera matrix of *this* frame: updating them
          // before the orbit was applied made every tile decision one frame old.
          photo.update(state.camera, state.renderer)
          if (now >= state.nextAttributionAt) {
            state.nextAttributionAt = now + 2000
            const text = photo.attributions().join(' · ')
            if (text !== photoAttributionRef.current) {
              photoAttributionRef.current = text
              setPhotoAttribution(text)
            }
          }
          if (!state.flatHidden && photo.loaded()) {
            // The tiles now cover the terrain: retire the flat satellite ground
            // (it would otherwise z-fight with the real geometry).
            state.groundGroup.visible = false
            state.flatHidden = true
          }
        } else if (state.flatHidden) {
          state.groundGroup.visible = true
          state.flatHidden = false
        } else if (photoAttributionRef.current) {
          photoAttributionRef.current = ''
          setPhotoAttribution('')
        }

        if (container.clientWidth > 0 && container.clientHeight > 0) {
          state.renderer.render(state.scene, state.camera)
        }

        // Automatic resolution governor: on a device that cannot hold ~30 fps,
        // trade pixels (not features) until the camera moves fluidly again.
        // It only ever lowers the ratio the user's mode allows, and recovers
        // when the device proves it has headroom.
        if (state.resolution !== 'auto' || now < state.perf.warmupUntil) return
        if (!state.perf.since) state.perf.since = now
        state.perf.frames += 1
        const windowMs = now - state.perf.since
        if (windowMs < ADAPT_WINDOW_MS) return
        const fps = (state.perf.frames * 1000) / windowMs
        state.perf.frames = 0
        state.perf.since = now
        const current = state.renderer.getPixelRatio()
        if (fps < 28) {
          state.perf.low += 1
          state.perf.high = 0
          if (state.perf.low >= 2 && current > MIN_AUTO_RATIO + 0.001) {
            const next = Math.max(MIN_AUTO_RATIO, Math.round((current - 0.25) * 100) / 100)
            state.renderer.setPixelRatio(next)
            state.autoScale = next
            state.perf.low = 0
            setAutoScale(next)
          }
        } else if (fps > 55) {
          state.perf.high += 1
          state.perf.low = 0
          if (state.perf.high >= 3 && current < state.pixelRatio - 0.001) {
            const next = Math.min(state.pixelRatio, Math.round((current + 0.25) * 100) / 100)
            state.renderer.setPixelRatio(next)
            state.autoScale = next
            state.perf.high = 0
            setAutoScale(next)
          }
        } else {
          state.perf.low = 0
          state.perf.high = 0
        }
      }
      frame(0)
      syncPhotogrammetry(state)

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
        // Prepared aircraft own their geometries/materials; the shared base
        // GLB stays cached for the next opening.
        state.modelObject?.removeFromParent()
        state.modelDispose?.()
        state.modelObject = null
        state.modelDispose = null
        teardownPhotogrammetry(state)
        dropDetail(state)
        if (state.farObject) disposeObject3D(state.farObject)
        if (state.groundObject) disposeObject3D(state.groundObject)
        if (state.scene.background instanceof THREE.Texture) state.scene.background.dispose()
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

  // Quality changes are applied to the live scene: pixel ratio, model LOD and
  // ground resolution change, but the camera stays exactly where the user left
  // it (the scene, renderer and controls are not rebuilt).
  useEffect(() => {
    sceneRef.current?.applyQuality()
  }, [performance])

  // Photogrammetry is toggled from Settings: apply it to the live scene.
  useEffect(() => {
    const state = sceneRef.current
    if (state) syncPhotogrammetry(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photogrammetryOn])

  // Saving a new token in Settings applies to the viewer that is already open,
  // without closing and reopening it.
  useEffect(() => {
    const onToken = (): void => {
      const state = sceneRef.current
      if (!state) return
      state.photoSignature = ''
      syncPhotogrammetry(state)
    }
    window.addEventListener(TOKEN_EVENT, onToken)
    return () => window.removeEventListener(TOKEN_EVENT, onToken)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          aria-label="Modelo 3D de la aeronave"
        />
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
              {aircraft.callsign} · {aircraft.type ?? model.representative} · modelo{' '}
              {model.representative} a escala 1:1
            </p>
          </div>
        </div>
      </div>

      {photogrammetryOn && photoState === 'error' && photoError && (
        <div className="pointer-events-none absolute left-3 top-[5.4rem] max-w-[min(420px,calc(100vw-1.5rem))]">
          <div className="tech rounded border border-[#ffbe0066] bg-[#ffbe001f] px-3 py-2 text-[10px] leading-snug text-[#ffe6a8]">
            <strong className="font-semibold text-[#ffd158]">Fotogrametría 3D: </strong>
            {photoError}
          </div>
        </div>
      )}

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

      {/* HUD: stats on one row, viewer controls above them. On phones the
          column stacks so nothing overlaps the telemetry bar. */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col-reverse items-stretch gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-full flex-wrap items-center gap-x-4 gap-y-1 self-start rounded-lg border border-white/[0.09] bg-black/55 px-3 py-2">
          <HudStat label="Altitud real" value={`${altitudeM.toLocaleString('es-ES')} m`} />
          <HudStat
            label="Sobre el mapa"
            value={
              aircraft.onGround ? 'En tierra' : `${aircraft.altitude.toLocaleString('es-ES')} ft`
            }
          />
          <HudStat label="Rumbo" value={formatHeading(aircraft.heading)} />
          <HudStat label="Velocidad" value={formatSpeed(aircraft.groundSpeed)} />
          <HudStat
            label="Escala"
            value={`1:1 · ${model.realLengthM.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`}
          />
        </div>

        <div className="flex max-w-full flex-col items-end gap-1 self-end sm:max-w-[46vw]">
          <div
            className="tech pointer-events-auto flex items-center gap-1 rounded border border-white/[0.09] bg-black/55 px-2 py-1"
            role="group"
            aria-label="Distancia de renderizado"
          >
            <span className="text-[9px] uppercase tracking-wider text-white/45">
              Distancia de renderizado
            </span>
            {VIEW_DISTANCES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRange(value)}
                aria-label={`Distancia de renderizado ×${value}`}
                aria-pressed={range === value}
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition ${
                  range === value
                    ? 'bg-accent text-[#111317]'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                ×{value}
              </button>
            ))}
          </div>
          <div className="relative pointer-events-auto" ref={qualityPanelRef}>
            <button
              type="button"
              onClick={() => setQualityOpen((open) => !open)}
              aria-expanded={qualityOpen}
              aria-haspopup="true"
              aria-label="Calidad del visor 3D"
              className={`tech flex items-center gap-1 rounded border border-white/[0.09] px-2 py-1 text-[10px] transition ${
                qualityOpen
                  ? 'bg-accent text-[#111317]'
                  : 'bg-black/55 text-white/70 hover:bg-white/10'
              }`}
            >
              <SlidersHorizontal className="h-3 w-3" />
              Calidad
            </button>
            {qualityOpen && (
              <div
                role="group"
                aria-label="Ajustes de calidad del visor 3D"
                className="absolute bottom-full right-0 mb-1.5 w-[256px] rounded-lg border border-white/[0.12] bg-[#0b0f14]/95 p-2.5 shadow-2xl backdrop-blur"
              >
                <QualitySelect
                  id="viewer-mesh-quality"
                  label="Malla"
                  value={performance.mesh}
                  options={QUALITY_TIERS}
                  labels={QUALITY_LABELS}
                  onChange={(value) => setPerformance({ ...performance, mesh: value })}
                />
                <QualitySelect
                  id="viewer-texture-quality"
                  label="Texturas"
                  value={performance.textures}
                  options={QUALITY_TIERS}
                  labels={QUALITY_LABELS}
                  onChange={(value) => setPerformance({ ...performance, textures: value })}
                />
                <QualitySelect
                  id="viewer-resolution"
                  label="Resolución"
                  value={performance.resolution}
                  options={RENDER_RESOLUTIONS}
                  labels={RESOLUTION_LABELS}
                  onChange={(value) => setPerformance({ ...performance, resolution: value })}
                />
                <label
                  htmlFor="viewer-photogrammetry"
                  className="mt-2 flex items-center justify-between gap-2 border-t border-white/[0.08] pt-1.5"
                >
                  <span className="tech text-[10px] uppercase tracking-wider text-white/45">
                    Fotogrametría 3D
                  </span>
                  <input
                    id="viewer-photogrammetry"
                    type="checkbox"
                    checked={photogrammetryOn}
                    onChange={(event) => setPhotogrammetryOn(event.target.checked)}
                    className="h-3.5 w-3.5 cursor-pointer accent-[#ffbe00]"
                  />
                </label>
                <p className="mt-1 text-[9px] leading-snug text-white/40">
                  {photogrammetryOn
                    ? photoState === 'ready'
                      ? 'Google 3D Tiles vía Cesium ion · terreno y edificios reales.'
                      : photoState === 'error'
                        ? photoError ||
                          'Cesium ion rechazó el token: se mantiene el satélite + relieve.'
                        : photoState === 'nokey'
                          ? 'Añade tu token gratuito de Cesium ion en Ajustes › Fotogrametría 3D.'
                          : 'Cargando fotogrametría desde Cesium ion…'
                    : 'Fotogrametría gratis con Cesium ion (sin tarjeta). Se activa en Ajustes.'}
                </p>
                <p className="mt-2 border-t border-white/[0.08] pt-1.5 text-[9px] leading-snug text-white/40">
                  {performance.resolution === 'auto'
                    ? `Resolución automática · aplicando ×${autoScale.toLocaleString('es-ES')}`
                    : 'Se aplica al instante; la cámara no se mueve.'}
                </p>
              </div>
            )}
          </div>
          <span className="tech hidden rounded border border-white/[0.09] bg-black/55 px-2.5 py-1 text-[10px] text-white/60 sm:inline-flex">
            Arrastra para orbitar · Rueda para acercar
          </span>
          <span className="tech text-right text-[9px] leading-tight text-white/45">
            {photoState === 'ready'
              ? `${photoAttribution || 'Google · Cesium ion'} · Modelos 3D del proyecto`
              : `${attribution ? `${attribution} · ` : 'Cartografía procedural · '}Modelos 3D del proyecto`}
          </span>
        </div>
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

interface QualitySelectProps<T extends string> {
  id: string
  label: string
  value: T
  options: readonly T[]
  labels: Record<T, string>
  onChange: (value: T) => void
}

function QualitySelect<T extends string>({
  id,
  label,
  value,
  options,
  labels,
  onChange,
}: QualitySelectProps<T>) {
  return (
    <label htmlFor={id} className="mb-1.5 flex items-center justify-between gap-2 last:mb-0">
      <span className="tech text-[10px] uppercase tracking-wider text-white/45">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="tech h-6 max-w-[150px] rounded border border-white/[0.12] bg-[#12151a] px-1 text-[10px] text-white/80 outline-none focus:border-accent"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Triangles drawn by an object tree (DEV diagnostics for the LOD ladder). */
function countTriangles(root: THREE.Object3D): number {
  let total = 0
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const index = mesh.geometry.getIndex()
    const count = index ? index.count : (mesh.geometry.getAttribute('position')?.count ?? 0)
    total += Math.floor(count / 3)
  })
  return total
}

/** Longest texture edge of an object tree (DEV diagnostics for texture tiers). */
function maxTextureSize(root: THREE.Object3D): number {
  let longest = 0
  const seen = new Set<THREE.Texture>()
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : []
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (!(value instanceof THREE.Texture) || seen.has(value)) continue
        seen.add(value)
        const image = value.image as { width?: number; height?: number } | null
        longest = Math.max(longest, Number(image?.width) || 0, Number(image?.height) || 0)
      }
    }
  })
  return longest
}

/** Frees the geometries, materials and textures of a scene subtree. */
function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : []
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      material.dispose()
    }
  })
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

/** Metres between the tiles anchor and the aircraft's live position. */
function driftFromAnchor(
  anchor: { lat: number; lon: number } | null,
  position: { lat: number; lon: number },
): number {
  if (!anchor) return Number.POSITIVE_INFINITY
  const north = (position.lat - anchor.lat) * EARTH_M_PER_DEG
  const east =
    (position.lon - anchor.lon) * EARTH_M_PER_DEG * Math.cos((anchor.lat * Math.PI) / 180)
  return Math.hypot(east, north)
}

/**
 * Slides the tiles under the aircraft, exactly like the flat ground, so the
 * plane stays at the origin of the scene while the world streams past it.
 */
function offsetPhotogrammetry(state: SceneState, position: { lat: number; lon: number }): void {
  if (!state.photogrammetry || !state.photoAnchor) return
  const north = (position.lat - state.photoAnchor.lat) * EARTH_M_PER_DEG
  const east =
    (position.lon - state.photoAnchor.lon) *
    EARTH_M_PER_DEG *
    Math.cos((state.photoAnchor.lat * Math.PI) / 180)
  state.photogrammetry.group.position.set(-east, 0, north)
}

/** Drops the tiles and restores the satellite ground + atmospheric haze. */
function teardownPhotogrammetry(state: SceneState): void {
  state.photoToken += 1
  state.photoPending = false
  if (state.photogrammetry) {
    state.photogrammetry.dispose()
    state.photogrammetry = null
  }
  state.photoAnchor = null
  state.photoSignature = ''
  if (state.flatHidden) {
    state.groundGroup.visible = true
    state.flatHidden = false
  }
  // The flat ground relies on the fog for its horizon.
  if (state.patchWindow && (!state.scene.fog || !(state.scene.fog instanceof THREE.Fog))) {
    state.scene.fog = new THREE.Fog(
      new THREE.Color(SKY_HORIZON),
      state.patchWindow.sizeMeters * 0.5,
      state.patchWindow.sizeMeters * 0.75,
    )
  }
}

/** Loads (or re-loads) the ground patch under the aircraft. */
function requestGround(
  state: SceneState,
  motion: { lat: number; lon: number; altM: number; onGround: boolean } | null,
  live: RenderAircraft,
  setGroundLoading: (value: boolean) => void,
  setAttribution: (value: string) => void,
  range: number,
): void {
  const position = motion ?? {
    lat: live.lat,
    lon: live.lon,
    altM: modelAltitudeY(live.altitude, live.onGround, state.scaledHeightM),
    onGround: live.onGround,
  }
  const altitudeM = position.onGround ? 0 : position.altM
  const win = viewWindow(position.lat, position.lon, altitudeM, range)
  const driftNorthM = (position.lat - state.anchorLat) * EARTH_M_PER_DEG
  const driftEastM =
    (position.lon - state.anchorLon) * EARTH_M_PER_DEG * Math.cos((state.anchorLat * Math.PI) / 180)
  const drift = Math.hypot(driftEastM, driftNorthM)
  // Wide cruise windows tolerate more drift before paying for a re-fetch.
  const driftLimit = Math.max(REFRESH_DRIFT_M, (state.patchWindow?.sizeMeters ?? 0) * 0.08)
  const mesh = state.quality.mesh
  const textures = state.quality.textures
  const qualityKey = `${MESH_SEGMENTS[mesh]}/${GROUND_TILE_PX[textures]}/${TERRAIN_STRIDE[mesh]}`
  const needs =
    !state.patchWindow ||
    state.patchWindow.z !== win.z ||
    state.patchWindow.n !== win.n ||
    state.range !== range ||
    state.groundKey !== qualityKey ||
    drift > driftLimit
  requestFarGround(state, position, win)
  if (!needs || state.fetching) return
  state.fetching = true
  state.range = range
  state.groundKey = qualityKey
  if (!state.patchWindow) setGroundLoading(true)
  const token = ++state.fetchToken
  void Promise.all([
    fetchGroundPatch(win, state.abort.signal, GROUND_TILE_PX[textures]),
    fetchTerrainPatch(win, state.abort.signal, TERRAIN_STRIDE[mesh]),
  ])
    .then(([patch, terrain]) => {
      if (state.disposed || token !== state.fetchToken) return
      state.fetching = false
      applyPatch(state, patch, terrain, position)
      setGroundLoading(false)
      setAttribution(
        patch.attribution ? `${patch.attribution}${terrain ? ' · Elevación: Mapzen/AWS' : ''}` : '',
      )
      requestDetail(state, position, terrain, patch)
    })
    .catch(() => {
      if (state.disposed || token !== state.fetchToken) return
      state.fetching = false
      // Retry on the next heartbeat (a quality change may be waiting).
      state.groundKey = ''
      setGroundLoading(false)
    })
}

/**
 * Ground plane for a window, with the DEM relief sampled over a UV sub-rect.
 *
 * `heightAt` overrides the DEM sampling; the sharp patch uses it to sit on the
 * surface of the wide mesh instead of on its own interpolation of the DEM.
 */
function groundGeometry(
  win: GroundWindow,
  terrain: TerrainPatch | null,
  span: number,
  uv: { u0: number; v0: number; du: number; dv: number } = { u0: 0, v0: 0, du: 1, dv: 1 },
  heightAt?: (u: number, v: number) => number,
): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(win.sizeMeters, win.sizeMeters, span, span)
  const positions = geometry.attributes.position as THREE.BufferAttribute
  for (let j = 0; j <= span; j++) {
    for (let i = 0; i <= span; i++) {
      const u = uv.u0 + (i / span) * uv.du
      const v = uv.v0 + (j / span) * uv.dv
      let height: number
      if (heightAt) height = heightAt(u, v)
      else height = terrain ? sampleHeight(terrain, u, v) : 0
      positions.setZ(j * (span + 1) + i, height)
    }
  }
  positions.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

/**
 * Material of a ground raster.
 *
 * The satellite image already carries its own lighting, so it is drawn
 * unlit: re-lighting it washed the colours out and made the terrain look
 * muddy. Relief still reads through the silhouette and the imagery itself.
 * The sharp detail patch is transparent at its feathered rim and never
 * writes depth, so it blends into the wide patch underneath.
 */
function groundMaterial(
  state: SceneState,
  canvas: HTMLCanvasElement,
  detail = false,
  backdrop = false,
): THREE.MeshBasicMaterial {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = state.renderer.capabilities.getMaxAnisotropy()
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: detail,
    // The wide patch is the only layer that writes depth. The backdrop is
    // always behind it and the sharp patch always in front, so neither needs
    // to fight for the same depth values.
    depthWrite: !detail && !backdrop,
    // Depth bias for the sharp patch: it sits on the wide mesh, and at long
    // orbit radii both fall inside the same depth quantum.
    polygonOffset: detail,
    polygonOffsetFactor: detail ? -2 : 0,
    polygonOffsetUnits: detail ? -2 : 0,
    fog: true,
  })
}

/** Removes the sharp patch (the wide one no longer matches it). */
function dropDetail(state: SceneState): void {
  state.detailToken += 1
  state.detailWindow = null
  state.detailCanvas = null
  state.detailCentre = null
  if (!state.detailObject) return
  state.groundGroup.remove(state.detailObject)
  disposeObject3D(state.detailObject)
  state.detailObject = null
}

/**
 * Streams the sharp patch of the area around the plane on top of the wide
 * one. It is requested after the wide patch is already on screen, so the
 * viewer never waits for it and the ground refines itself in place.
 */
function requestDetail(
  state: SceneState,
  position: { lat: number; lon: number },
  terrain: TerrainPatch | null,
  patch: GroundPatch,
): void {
  const base = state.patchWindow
  if (!patch.canvas || !base || state.quality.textures !== 'alta') return
  const win = detailWindow(position.lat, position.lon, base.z)
  // Keeping the current patch while the plane is near its centre is what stops
  // the middle of the view from pulsing sharp → blurry → sharp every time the
  // wide patch refreshes (every couple of kilometres).
  const current = state.detailWindow
  const centre = state.detailCentre
  if (current && centre && current.z === win.z) {
    const drift = Math.hypot(
      (position.lat - centre.lat) * EARTH_M_PER_DEG,
      (position.lon - centre.lon) * EARTH_M_PER_DEG * Math.cos((centre.lat * Math.PI) / 180),
    )
    if (drift < current.sizeMeters * DETAIL_DRIFT_FRACTION) return
  }
  const canvas = patch.canvas
  const token = ++state.detailToken
  void fetchGroundDetail(
    win,
    base,
    canvas,
    state.abort.signal,
    GROUND_TILE_PX[state.quality.textures],
  )
    .then((detail) => {
      if (state.disposed || token !== state.detailToken) return
      if (state.patchWindow !== base || !detail) return
      applyDetail(state, detail, win, terrain, base)
      state.detailCentre = { lat: position.lat, lon: position.lon }
    })
    .catch(() => undefined)
}

/** Installs the sharp patch: same terrain, sharper imagery, feathered rim. */
function applyDetail(
  state: SceneState,
  canvas: HTMLCanvasElement,
  win: GroundWindow,
  terrain: TerrainPatch | null,
  base: GroundWindow,
): void {
  dropDetail(state)
  const jump = win.z - base.z
  const span = 1 << jump
  const u0 = (win.x0 / span - base.x0) / base.n
  const v0 = (win.y0 / span - base.y0) / base.n
  const size = win.n / span / base.n
  const segments = Math.max(32, Math.round(MESH_SEGMENTS[state.quality.mesh] / 2))
  const baseSpan = MESH_SEGMENTS[state.quality.mesh]
  // Fine relief, but never below the wide mesh: a mesh that sinks under its
  // underlay shows the blurry image through the sharp one.
  const heightAt = terrain
    ? (u: number, v: number) =>
        Math.max(sampleHeight(terrain, u, v), baseSurfaceHeight(terrain, baseSpan, u, v) + 0.2)
    : undefined
  const geometry = groundGeometry(win, terrain, segments, { u0, v0, du: size, dv: size }, heightAt)
  const mesh = new THREE.Mesh(geometry, groundMaterial(state, canvas, true))
  mesh.renderOrder = 2
  // Relative to the wide patch centre, from the tile indices: `groundGroup`
  // already carries the patch position and the drift, and this mesh is a child
  // of it.
  const offset = windowOffset(win, base)
  mesh.position.set(offset.east, 0.5, -offset.north)
  state.groundGroup.add(mesh)
  state.detailObject = mesh
  state.detailWindow = win
  state.detailCanvas = canvas
}

/**
 * Keeps a low zoom backdrop under the sharp patch that reaches the horizon.
 *
 * Without it the terrain ends inside the view at low altitude (the sky shows
 * under the plane). It is only re-fetched when the plane leaves the middle of
 * the current far window, so it costs ~16 requests per hundreds of km.
 */
function requestFarGround(
  state: SceneState,
  position: { lat: number; lon: number; altM: number; onGround: boolean },
  base: GroundWindow,
): void {
  const altitudeM = position.onGround ? 0 : position.altM
  const win = farWindow(position.lat, position.lon, altitudeM, base.sizeMeters * 2.5)
  const current = state.farWindow
  const drift = current
    ? Math.hypot(
        (position.lat - state.anchorLat) * EARTH_M_PER_DEG,
        (position.lon - state.anchorLon) *
          EARTH_M_PER_DEG *
          Math.cos((state.anchorLat * Math.PI) / 180),
      )
    : Number.POSITIVE_INFINITY
  const stale =
    !current ||
    current.z !== win.z ||
    current.x0 !== win.x0 ||
    current.y0 !== win.y0 ||
    drift > win.sizeMeters * 0.18
  if (!stale || state.farFetching) return
  state.farFetching = true
  const token = ++state.farToken
  void fetchFarPatch(win, state.abort.signal)
    .then((patch) => {
      if (state.disposed || token !== state.farToken) return
      state.farFetching = false
      if (!patch.canvas) return
      if (state.farObject) {
        state.groundGroup.remove(state.farObject)
        disposeObject3D(state.farObject)
      }
      const geometry = new THREE.PlaneGeometry(win.sizeMeters, win.sizeMeters, 1, 1)
      geometry.rotateX(-Math.PI / 2)
      // A backdrop, not another ground: drawn first and without depth writes,
      // so the wide patch always wins where they overlap (the 2 m gap is below
      // the depth resolution at horizon distances, and that flicker is what
      // read as two meshes fighting).
      const mesh = new THREE.Mesh(geometry, groundMaterial(state, patch.canvas, false, true))
      mesh.renderOrder = -1
      const offset = windowOffset(win, base)
      mesh.position.set(offset.east, -2, -offset.north)
      state.groundGroup.add(mesh)
      state.farObject = mesh
      state.farWindow = win
      state.farSizeMeters = win.sizeMeters
      // The haze now belongs to the far ground: rebuild it for the wider view.
      if (state.patchWindow) {
        state.scene.fog = new THREE.Fog(
          new THREE.Color(SKY_HORIZON),
          Math.max(state.patchWindow.sizeMeters * 0.5, win.sizeMeters * 0.16),
          Math.max(state.patchWindow.sizeMeters * 0.75, win.sizeMeters * 0.44),
        )
        state.camera.far = Math.max(
          200_000,
          win.sizeMeters * 0.8,
          state.patchWindow.sizeMeters * 1.1,
        )
        state.camera.updateProjectionMatrix()
      }
    })
    .catch(() => {
      if (state.disposed || token !== state.farToken) return
      state.farFetching = false
    })
}

/**
 * True when the sharp patch of `win` still fits inside the wide patch `base`.
 *
 * The patch covers a quarter of the wide side two zoom levels up; a change of
 * tier or altitude can move the wide window under it.
 */
function reusableDetail(
  detail: GroundWindow,
  base: GroundWindow,
  textureTier: QualityTier,
): boolean {
  if (textureTier !== 'alta' || detail.z !== base.z + DETAIL_ZOOM_JUMP) return false
  const factor = 1 << DETAIL_ZOOM_JUMP
  return (
    detail.x0 >= base.x0 * factor &&
    detail.x0 + detail.n <= (base.x0 + base.n) * factor &&
    detail.y0 >= base.y0 * factor &&
    detail.y0 + detail.n <= (base.y0 + base.n) * factor
  )
}

/** Replaces the ground object with a textured terrain mesh (or a grid). */
function applyPatch(
  state: SceneState,
  patch: GroundPatch,
  terrain: TerrainPatch | null,
  position: { lat: number; lon: number },
): void {
  const win = patch.window
  if (state.groundObject) {
    state.groundGroup.remove(state.groundObject)
    state.groundObject.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : []
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose()
        }
        material.dispose()
      }
    })
    state.groundObject = null
  }

  // The sharp patch keeps its imagery: it is re-fitted to the new wide patch
  // below instead of being dropped, which used to make the centre of the view
  // jump between sharp and blurry on every refresh.
  const previousDetail =
    state.detailCanvas && state.detailWindow
      ? { canvas: state.detailCanvas, window: state.detailWindow, centre: state.detailCentre }
      : null

  if (patch.canvas) {
    const geometry = groundGeometry(win, terrain, MESH_SEGMENTS[state.quality.mesh])
    const material = groundMaterial(state, patch.canvas)
    state.groundObject = new THREE.Mesh(geometry, material)
  } else {
    state.groundObject = new THREE.GridHelper(win.sizeMeters, 40, 0x2f3d4d, 0x1b232d)
  }
  state.groundGroup.add(state.groundObject)
  state.patchWindow = win
  // The horizon backdrop stays on screen: only its position relative to the
  // new wide patch is recomputed. Dropping it here left a frame without ground
  // and re-downloaded the whole cover every few kilometres.
  if (state.farObject && state.farWindow) {
    const farOffset = windowOffset(state.farWindow, win)
    state.farObject.position.set(farOffset.east, state.farObject.position.y, -farOffset.north)
  }
  if (previousDetail && reusableDetail(previousDetail.window, win, state.quality.textures)) {
    applyDetail(state, previousDetail.canvas, previousDetail.window, terrain, win)
    state.detailCentre = previousDetail.centre ?? { lat: position.lat, lon: position.lon }
  } else if (previousDetail) {
    // The wide patch changed tier or zoom: the sharp patch no longer matches.
    dropDetail(state)
  }
  state.terrain = terrain
  state.anchorLat = position.lat
  state.anchorLon = position.lon
  // Far plane always reaches the faded patch rim (needed at distance ×5).
  state.camera.far = Math.max(200_000, win.sizeMeters * 1.1)
  state.camera.updateProjectionMatrix()
  const farSize = state.farSizeMeters
  state.scene.fog = new THREE.Fog(
    new THREE.Color(SKY_HORIZON),
    Math.max(win.sizeMeters * 0.5, farSize * 0.16),
    Math.max(win.sizeMeters * 0.75, farSize * 0.44),
  )
  state.camera.far = Math.max(200_000, farSize * 0.8, win.sizeMeters * 1.1)
}
