import { useEffect, useRef, useState } from 'react'
import { Map, type MapLayerMouseEvent, type MapMouseEvent } from 'maplibre-gl'
import { DEFAULT_VIEW } from '@/config'
import type { ProviderId } from '@/data/registry'
import { FleetController, type FleetFilters } from '@/engine/fleetController'
import { AIRCRAFT_LAYER, addAircraftLayers, setLabelsVisible, setTrailVisible } from '@/map/aircraftLayers'
import {
  basemapSource,
  captureBasemapLayers,
  getBasemap,
  setBasemapLayerVisibility,
  type BasemapId,
  type BasemapLayerVisibility,
} from '@/map/style'
import { formatAltitude, formatSpeed } from '@/lib/format'

export interface MapCanvasHandle {
  map: Map
  controller: FleetController
}

interface MapCanvasProps {
  providerId: ProviderId
  fleetSize: number
  speedFactor: number
  filters: FleetFilters
  selectedId: string | null
  follow: boolean
  maxAircraft: number
  pollIntervalMs: number
  backgroundUpdates: boolean
  labels: boolean
  trail: boolean
  basemap: BasemapId
  basemapLayers: BasemapLayerVisibility
  is3D: boolean
  /** Drawing-buffer scale of the map canvas (quality setting). */
  pixelRatio: number
  onReady: (handle: MapCanvasHandle | null) => void
  onSelect: (id: string | null) => void
  onFollowChange: (follow: boolean) => void
  onError: (message: string | null) => void
}

interface HoverInfo {
  callsign: string
  detail: string
}

/**
 * Owns the MapLibre instance and the fleet controller. Everything that must
 * run at animation speed lives here (or in the controller) so React only sees
 * a couple of renders per second.
 */
export function MapCanvas({
  providerId,
  fleetSize,
  speedFactor,
  filters,
  selectedId,
  follow,
  maxAircraft,
  pollIntervalMs,
  backgroundUpdates,
  labels,
  trail,
  basemap,
  basemapLayers,
  is3D,
  pixelRatio,
  onReady,
  onSelect,
  onFollowChange,
  onError,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const controllerRef = useRef<FleetController | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const pointRef = useRef({ x: 0, y: 0 })
  const hoverIdRef = useRef<string | null>(null)
  const appliedBasemap = useRef(basemap)
  const latest = useRef({
    providerId,
    fleetSize,
    filters,
    labels,
    trail,
    basemap,
    basemapLayers,
    is3D,
    pixelRatio,
    maxAircraft,
    pollIntervalMs,
    backgroundUpdates,
    onReady,
    onSelect,
    onFollowChange,
    onError,
  })
  const [ready, setReady] = useState(false)
  const [hover, setHover] = useState<HoverInfo | null>(null)

  useEffect(() => {
    latest.current = {
      providerId,
      fleetSize,
      filters,
      labels,
      trail,
      basemap,
      basemapLayers,
      is3D,
      maxAircraft,
      pollIntervalMs,
      backgroundUpdates,
      pixelRatio,
      onReady,
      onSelect,
      onFollowChange,
      onError,
    }
  })

  /* ------------------------------------------------------ map lifecycle */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const initialBasemap = getBasemap(latest.current.basemap)
    const map = new Map({
      container,
      style: basemapSource(initialBasemap),
      center: DEFAULT_VIEW.center,
      // Photographic basemaps need more texels per screen pixel than a vector
      // style to look right on a dense phone screen, so they start one level
      // deeper (about twice the effective imagery resolution).
      zoom: DEFAULT_VIEW.zoom + (initialBasemap.id === 'satellite' ? 1 : 0),
      pitch: latest.current.is3D ? 54 : initialBasemap.pitch,
      bearing: 0,
      minZoom: 1.5,
      maxZoom: 16,
      maxPitch: 70,
      // Built-in right-drag rotation is replaced below by an explicit
      // middle-button gesture, as requested for 3D navigation.
      dragRotate: false,
      attributionControl: false,
      fadeDuration: 120,
      refreshExpiredTiles: false,
    })
    mapRef.current = map
    // Quality setting: MapLibre defaults to devicePixelRatio, which is 3× on
    // many phones. Rendering one pixel per CSS pixel is a big GPU saving.
    map.setPixelRatio(latest.current.pixelRatio)
    let lastErrorAt = 0

    // Runs on the first style and again after every basemap change (setStyle
    // wipes runtime layers, so the traffic layers must be registered again).
    const handleStyleLoad = () => {
      addAircraftLayers(map)
      setLabelsVisible(map, latest.current.labels)
      setTrailVisible(map, latest.current.trail)
      captureBasemapLayers(map, latest.current.basemapLayers)
      controllerRef.current?.restoreStyle()
    }

    const handleLoad = () => {
      if (controllerRef.current) return
      const controller = new FleetController({
        map,
        providerId: latest.current.providerId,
        fleetSize: latest.current.fleetSize,
        filters: latest.current.filters,
        backgroundUpdates: latest.current.backgroundUpdates,
        onFollowChange: (value) => latest.current.onFollowChange(value),
      })
      controller.setMaxAircraft(latest.current.maxAircraft)
      controller.setPollInterval(latest.current.pollIntervalMs)
      controller.setBackgroundUpdates(latest.current.backgroundUpdates)
      controller.start()
      controllerRef.current = controller
      setReady(true)
      latest.current.onReady({ map, controller })
    }

    const handleError = (event: unknown) => {
      const message = (event as { error?: { message?: string } }).error?.message
      // Aborted requests and missing glyphs/sprites are not worth a warning:
      // the map keeps rendering, only the text labels are affected.
      if (!message || message.includes('aborted') || /glyph|font|sprite/i.test(message)) return
      const now = Date.now()
      if (now - lastErrorAt < 5000) return
      lastErrorAt = now
      latest.current.onError(message)
    }

    const handleClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      if (!feature) return
      const id = (feature.properties as { id?: string } | null)?.id
      if (id) latest.current.onSelect(id)
    }

    const handleMapClick = (event: MapMouseEvent) => {
      if (!map.getLayer(AIRCRAFT_LAYER)) return
      const hits = map.queryRenderedFeatures(event.point, { layers: [AIRCRAFT_LAYER] })
      if (hits.length === 0) latest.current.onSelect(null)
    }

    const handleEnter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const handleLeave = () => {
      map.getCanvas().style.cursor = ''
      hoverIdRef.current = null
      setHover(null)
    }
    const handleMove = (event: MapLayerMouseEvent) => {
      pointRef.current = { x: event.point.x, y: event.point.y }
      const element = tooltipRef.current
      if (element) {
        element.style.transform = `translate3d(${event.point.x + 14}px, ${event.point.y + 14}px, 0)`
      }
      const feature = event.features?.[0]
      const id = (feature?.properties as { id?: string } | null)?.id
      if (!id || id === hoverIdRef.current) return
      hoverIdRef.current = id

      // Prefer the live snapshot (it carries the smoothed ground speed).
      const track = controllerRef.current?.getSnapshot().aircraft.find((a) => a.id === id)
      const altitude = track?.altitude ?? Number((feature?.properties as { altitude?: number } | null)?.altitude ?? 0)
      setHover({
        callsign: track?.callsign ?? (feature?.properties as { callsign?: string } | null)?.callsign ?? '—',
        detail: `${formatAltitude(altitude)} · ${formatSpeed(track?.groundSpeed ?? 0)}`,
      })
    }

    // Manual 3D navigation: hold the mouse wheel/middle button and move.
    // Horizontal movement changes bearing; moving up increases pitch and
    // moving down returns towards a top-down view. The centre and zoom are
    // intentionally untouched. MapLibre's right-button handler stays off.
    const canvas = map.getCanvas()
    let middleDrag: { pointerId: number; x: number; y: number } | null = null

    const stopMiddleDrag = (event?: PointerEvent): void => {
      if (!middleDrag || (event && event.pointerId !== middleDrag.pointerId)) return
      const { pointerId } = middleDrag
      middleDrag = null
      map.dragPan.enable()
      if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId)
      canvas.style.cursor = ''
    }

    const handleMiddlePointerDown = (event: PointerEvent): void => {
      if (event.button !== 1) return
      event.preventDefault()
      event.stopPropagation()
      middleDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      canvas.setPointerCapture(event.pointerId)
      map.dragPan.disable()
      canvas.style.cursor = 'grabbing'
    }

    const handleMiddlePointerMove = (event: PointerEvent): void => {
      if (!middleDrag || event.pointerId !== middleDrag.pointerId) return
      if ((event.buttons & 4) === 0) {
        stopMiddleDrag(event)
        return
      }
      const dx = event.clientX - middleDrag.x
      const dy = event.clientY - middleDrag.y
      middleDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      if (dx === 0 && dy === 0) return
      event.preventDefault()
      map.jumpTo({
        bearing: map.getBearing() + dx * 0.35,
        pitch: Math.min(map.getMaxPitch(), Math.max(0, map.getPitch() - dy * 0.25)),
      })
    }

    const preventMiddleButtonDefault = (event: MouseEvent): void => {
      if (event.button === 1) event.preventDefault()
    }
    const preventContextMenu = (event: Event): void => event.preventDefault()

    canvas.addEventListener('pointerdown', handleMiddlePointerDown)
    canvas.addEventListener('pointermove', handleMiddlePointerMove)
    canvas.addEventListener('pointerup', stopMiddleDrag)
    canvas.addEventListener('pointercancel', stopMiddleDrag)
    canvas.addEventListener('mousedown', preventMiddleButtonDefault)
    canvas.addEventListener('auxclick', preventMiddleButtonDefault)
    canvas.addEventListener('contextmenu', preventContextMenu)

    map.on('style.load', handleStyleLoad)
    map.on('load', handleLoad)
    map.on('error', handleError)
    map.on('click', AIRCRAFT_LAYER, handleClick)
    map.on('click', handleMapClick)
    map.on('mouseenter', AIRCRAFT_LAYER, handleEnter)
    map.on('mousemove', AIRCRAFT_LAYER, handleMove)
    map.on('mouseleave', AIRCRAFT_LAYER, handleLeave)

    return () => {
      stopMiddleDrag()
      canvas.removeEventListener('pointerdown', handleMiddlePointerDown)
      canvas.removeEventListener('pointermove', handleMiddlePointerMove)
      canvas.removeEventListener('pointerup', stopMiddleDrag)
      canvas.removeEventListener('pointercancel', stopMiddleDrag)
      canvas.removeEventListener('mousedown', preventMiddleButtonDefault)
      canvas.removeEventListener('auxclick', preventMiddleButtonDefault)
      canvas.removeEventListener('contextmenu', preventContextMenu)
      controllerRef.current?.destroy()
      controllerRef.current = null
      map.remove()
      mapRef.current = null
      setReady(false)
      latest.current.onReady(null)
    }
  }, [])

  /* ------------------------------------------------------- prop syncing */
  useEffect(() => {
    mapRef.current?.setPixelRatio(pixelRatio)
  }, [pixelRatio, ready])

  useEffect(() => {
    controllerRef.current?.setSelected(selectedId)
  }, [selectedId, ready])

  useEffect(() => {
    controllerRef.current?.setFollow(follow)
  }, [follow, ready])

  useEffect(() => {
    controllerRef.current?.setMaxAircraft(maxAircraft)
  }, [maxAircraft, ready])

  useEffect(() => {
    controllerRef.current?.setPollInterval(pollIntervalMs)
  }, [pollIntervalMs, ready])

  useEffect(() => {
    controllerRef.current?.setBackgroundUpdates(backgroundUpdates)
  }, [backgroundUpdates, ready])

  useEffect(() => {
    controllerRef.current?.setFilters(filters)
  }, [filters, ready])

  useEffect(() => {
    controllerRef.current?.setSpeedFactor(speedFactor)
  }, [speedFactor, ready])

  useEffect(() => {
    controllerRef.current?.setFleetSize(fleetSize)
  }, [fleetSize, ready])

  useEffect(() => {
    controllerRef.current?.setProvider(providerId)
  }, [providerId, ready])

  useEffect(() => {
    if (mapRef.current) setLabelsVisible(mapRef.current, labels)
  }, [labels, ready])

  useEffect(() => {
    if (mapRef.current) setTrailVisible(mapRef.current, trail)
  }, [trail, ready])

  useEffect(() => {
    if (mapRef.current) setBasemapLayerVisibility(mapRef.current, basemapLayers)
  }, [basemapLayers, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || appliedBasemap.current === basemap) return
    appliedBasemap.current = basemap
    const option = getBasemap(basemap)
    // Full rebuild (not diff) so the aircraft layers are cleanly re-added on style.load.
    map.setStyle(basemapSource(option), { diff: false })
    map.setMaxPitch(70)
    map.easeTo({ pitch: latest.current.is3D ? 54 : option.pitch, bearing: option.bearing, duration: 600 })
  }, [basemap])

  /* 3D tilt is independent of the basemap. */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const target = is3D ? 54 : 0
    if (Math.abs(map.getPitch() - target) < 0.5) return
    map.easeTo({ pitch: target, duration: 700 })
  }, [is3D, ready])

  /* Keep the tooltip glued to the cursor between renders. */
  useEffect(() => {
    const element = tooltipRef.current
    if (element && hover) {
      element.style.transform = `translate3d(${pointRef.current.x + 14}px, ${pointRef.current.y + 14}px, 0)`
    }
  }, [hover])

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      {hover && (
        <div
          data-clean-hide
          ref={tooltipRef}
          className="pointer-events-none absolute left-0 top-0 z-20 rounded-lg border border-white/10 bg-[#0b0d12]/92 px-2.5 py-1.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.9)] backdrop-blur-md"
        >
          <div className="text-[11.5px] font-medium tracking-wide">{hover.callsign}</div>
          <div className="tech mt-0.5 text-[10px] text-white/45">{hover.detail}</div>
        </div>
      )}
    </div>
  )
}
