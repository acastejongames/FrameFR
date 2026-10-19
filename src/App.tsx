import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import {
  DEFAULT_GUI_VISIBILITY,
  DEFAULT_MAX_AIRCRAFT,
  DEFAULT_SORT_KEY,
  normalizeGuiVisibility,
  normalizeInterfaceScale,
  type GuiVisibility,
  type InterfaceScale,
  type SortKey,
} from '@/config'
import { fetchFlightTrail } from '@/data/flightTrail'
import { loadHubItems, type HubItem } from '@/data/hubs'
import { resolveAircraftPhoto, type AircraftPhoto } from '@/data/photos'
import { defaultProviderId, type ProviderId } from '@/data/registry'
import type { Aircraft } from '@/data/types'
import { ALL_CATEGORIES, type FleetFilters } from '@/engine/fleetController'
import { useFleetSnapshot } from '@/hooks/useFleetSnapshot'
import { useGlobalSearch } from '@/hooks/useGlobalSearch'
import { usePersistentState } from '@/hooks/usePersistentState'
import { DEFAULT_BASEMAP, DEFAULT_BASEMAP_LAYERS, type BasemapId, type BasemapLayerVisibility } from '@/map/style'
import { AircraftDetail } from '@/components/AircraftDetail'
import { AirportHubs } from '@/components/AirportHubs'
import { HubsManager } from '@/components/HubsManager'
import { FlightTable } from '@/components/FlightTable'
import { MapCanvas, type MapCanvasHandle } from '@/components/MapCanvas'
import { MapCompass } from '@/components/MapCompass'
import { MapControls } from '@/components/MapControls'
import { SettingsModal } from '@/components/SettingsModal'
import { StatusLegend } from '@/components/StatusLegend'
import { Toast } from '@/components/Toast'
import { TopBar } from '@/components/TopBar'

/** Toast helper: a message plus a monotonically increasing key. */
interface ToastMessage {
  text: string
  key: number
}

export default function App() {
  /* ------------------------------------------------------------ settings */
  const [providerId, setProviderId] = usePersistentState<ProviderId>(
    'provider',
    defaultProviderId(),
  )
  const [pollIntervalMs, setPollIntervalMs] = usePersistentState<number>('poll-interval', 6_000)
  const [maxAircraft, setMaxAircraft] = usePersistentState<number>(
    'max-aircraft',
    DEFAULT_MAX_AIRCRAFT,
  )
  const [basemap, setBasemap] = usePersistentState<BasemapId>('basemap', DEFAULT_BASEMAP)
  const [showLabels, setShowLabels] = usePersistentState<boolean>('labels', true)
  const [mapLayers, setMapLayers] = usePersistentState<BasemapLayerVisibility>(
    'map-layers',
    DEFAULT_BASEMAP_LAYERS,
    (value): value is BasemapLayerVisibility =>
      typeof value === 'object' && value !== null &&
      typeof (value as BasemapLayerVisibility).placeIcons === 'boolean' &&
      typeof (value as BasemapLayerVisibility).names === 'boolean' &&
      typeof (value as BasemapLayerVisibility).borders === 'boolean',
  )
  const [gui, setGui] = usePersistentState<GuiVisibility>(
    'gui',
    DEFAULT_GUI_VISIBILITY,
    undefined,
    normalizeGuiVisibility,
  )
  const [backgroundUpdates, setBackgroundUpdates] = usePersistentState<boolean>(
    'background-updates',
    true,
    (value): value is boolean => typeof value === 'boolean',
  )
  const [sortBy, setSortBy] = usePersistentState<SortKey>('sort', DEFAULT_SORT_KEY)
  const [hubItems, setHubItems] = usePersistentState<HubItem[]>('hubs', loadHubItems)

  const [uiScale, setUiScale] = usePersistentState<InterfaceScale>(
    'ui-scale',
    1,
    undefined,
    normalizeInterfaceScale,
  )

  /* --------------------------------------------------------- local state */
  const [fleetSize] = useState(Number(import.meta.env.VITE_FLEET_SIZE ?? 600) || 600)
  const [speedFactor] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [follow, setFollow] = useState(false)
  const [is3D, setIs3D] = useState(false)
  const [cleanMode, setCleanMode] = useState(false)
  const [tableOpen, setTableOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hubsManagerOpen, setHubsManagerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [photo, setPhoto] = useState<AircraftPhoto | null | undefined>(undefined)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [handle, setHandle] = useState<MapCanvasHandle | null>(null)
  const [trailAltitudes, setTrailAltitudes] = useState<number[]>([])

  const searchRef = useRef<HTMLInputElement>(null)
  const toastKey = useRef(0)
  const filters = useMemo<FleetFilters>(
    () => ({ query: '', categories: ALL_CATEGORIES, airborneOnly: false }),
    [],
  )

  const snapshot = useFleetSnapshot(handle?.controller ?? null)
  const search = useGlobalSearch()
  const selected = snapshot.selected && snapshot.selected.id === selectedId ? snapshot.selected : null

  const showToast = useCallback((text: string) => {
    toastKey.current += 1
    setToast({ text, key: toastKey.current })
  }, [])

  /* ---------------------------------------------------------- shortcuts */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement

      if (event.key === '/' && !typing) {
        event.preventDefault()
        if (cleanMode) setCleanMode(false)
        searchRef.current?.focus()
        return
      }

      if ((event.key === 'u' || event.key === 'U') && !typing && !event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        setCleanMode((value) => !value)
        return
      }

      if (event.key === 'Escape') {
        if (settingsOpen) setSettingsOpen(false)
        else if (tableOpen) setTableOpen(false)
        else if (selectedId) setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cleanMode, selectedId, settingsOpen, tableOpen])

  // The clean mode is a class on <body> so the CSS can hide every panel.
  useEffect(() => {
    document.body.classList.toggle('ui-clean-mode', cleanMode)
    if (cleanMode && document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }, [cleanMode])

  /* ------------------------------------------------- photo and trail */
  useEffect(() => {
    if (!selected) {
      setPhoto(undefined)
      setTrailAltitudes([])
      return
    }

    let cancelled = false
    setPhotoLoading(true)
    setPhoto(undefined)

    void resolveAircraftPhoto({
      id: selected.id,
      registration: selected.registration,
      airlineName: selected.airlineName,
      fullModel: selected.fullModel,
    }).then((result) => {
      if (cancelled) return
      setPhoto(result)
      setPhotoLoading(false)
    })

    const controller = new AbortController()
    void fetchFlightTrail(selected.id, selected.zoneId, controller.signal)
      .then((result) => {
        if (cancelled || !result || !handle) return
        handle.controller.setExternalTrail(
          selected.id,
          result.points.map((point) => ({
            lon: point.lon,
            lat: point.lat,
            altitude: point.altitude,
          })),
        )
        setTrailAltitudes(result.points.map((point) => point.altitude))
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [selected?.id, handle])

  // Keep the sparkline up to date with the live trail.
  useEffect(() => {
    if (!selectedId || !handle) return
    const timer = setInterval(() => {
      setTrailAltitudes(handle.controller.trailAltitudes(selectedId))
    }, 1000)
    return () => clearInterval(timer)
  }, [selectedId, handle])

  /* ------------------------------------------------------------ actions */
  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id)
    if (!id) setFollow(false)
  }, [])

  const handleSearchSelect = useCallback(
    (aircraft: Aircraft) => {
      // Inject the result so it is drawn on the map even when the active feed
      // does not cover that area of the planet.
      handle?.controller.upsertAircraft(aircraft)
      setSelectedId(aircraft.id)
      setFollow(false)
      handle?.map.flyTo({
        center: [aircraft.lon, aircraft.lat],
        zoom: Math.max(handle.map.getZoom(), 8.5),
        speed: 1.6,
        essential: true,
      })
    },
    [handle],
  )

  const handleFlyTo = useCallback(
    (lat: number, lon: number, zoom: number, _label: string) => {
      setFollow(false)
      handle?.map.flyTo({ center: [lon, lat], zoom, speed: 1.4, essential: true })
    },
    [handle],
  )

  const handleRefresh = useCallback(() => {
    handle?.controller.refresh()
    showToast('Actualizando sector ADS-B…')
  }, [handle, showToast])

  const handleFollowChange = useCallback(
    (value: boolean) => {
      setFollow(value)
      if (value && selected) {
        handle?.map.easeTo({
          center: [selected.lon, selected.lat],
          duration: 800,
        })
      }
    },
    [handle, selected],
  )

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      showToast('Geolocalización no soportada')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        handle?.map.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: 8.5,
          speed: 1.3,
          essential: true,
        }),
      () => showToast('Permiso de ubicación denegado'),
    )
  }, [handle, showToast])

  const handleProviderChange = useCallback(
    (id: ProviderId) => {
      setProviderId(id)
      setSelectedId(null)
      setFollow(false)
      showToast('Fuente ADS-B actualizada')
    },
    [setProviderId, showToast],
  )

  /* --------------------------------------------------------------- view */
  const sourceLabel = snapshot.status.state === 'error' ? 'Reintentando…' : snapshot.status.state === 'live' ? snapshot.status.message ?? 'ADS-B en directo' : 'Conectando…'

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-950 text-fg">
      <MapCanvas
        providerId={providerId}
        fleetSize={fleetSize}
        speedFactor={speedFactor}
        filters={filters}
        selectedId={selectedId}
        follow={follow}
        maxAircraft={maxAircraft}
        pollIntervalMs={pollIntervalMs}
        backgroundUpdates={backgroundUpdates}
        labels={showLabels}
        trail
        basemap={basemap}
        basemapLayers={mapLayers}
        is3D={is3D}
        onReady={setHandle}
        onSelect={handleSelect}
        onFollowChange={setFollow}
        onError={setMapError}
      />

      <div className="ui-overlay" inert={cleanMode} style={{
        width: `${100 / uiScale}%`, height: `${100 / uiScale}%`,
        transform: `scale(${uiScale})`,
        '--ui-height': `calc(100dvh / ${uiScale})`,
      } as CSSProperties}>
      <TopBar
        showHubs={gui.hubs}
        showClock={gui.clock}
        showCounter={gui.counter}
        ref={searchRef}
        query={query}
        onQueryChange={(value) => {
          setQuery(value)
          search.schedule(value)
        }}
        results={search.results}
        searching={search.searching}
        onSelectResult={handleSearchSelect}
        aircraftCount={snapshot.stats.filtered}
        sourceLabel={sourceLabel}
        live={snapshot.status.state === 'live'}
        onRefresh={handleRefresh}
        refreshing={snapshot.status.state === 'loading'}
        tableOpen={tableOpen}
        onToggleTable={() => setTableOpen((value) => !value)}
        onOpenSettings={() => setSettingsOpen(true)}
      >
        <AirportHubs
          items={hubItems}
          onFlyTo={handleFlyTo}
          visible={gui.hubs}
          onManagerOpenChange={setHubsManagerOpen}
        />
      </TopBar>

      {selected && (
        <AircraftDetail
          aircraft={selected}
          photo={photo}
          photoLoading={photoLoading}
          trailAltitudes={trailAltitudes}
          follow={follow}
          is3D={is3D}
          onClose={() => handleSelect(null)}
          onFollowChange={handleFollowChange}
          on3DChange={setIs3D}
          onClearTrail={() => {
            if (selectedId) handle?.controller.clearExternalTrail(selectedId)
            setTrailAltitudes([])
            showToast('Estela limpiada')
          }}
          onCenter={() =>
            handle?.map.flyTo({
              center: [selected.lon, selected.lat],
              duration: 800,
              essential: true,
            })
          }
        />
      )}

      {tableOpen && (
        <FlightTable
          aircraft={snapshot.aircraft}
          total={snapshot.stats.filtered}
          selectedId={selectedId}
          sortBy={sortBy}
          onSortChange={setSortBy}
          onSelect={(id) => {
            handleSelect(id)
            const aircraft = snapshot.aircraft.find((item) => item.id === id)
            if (aircraft) {
              handle?.map.flyTo({
                center: [aircraft.lon, aircraft.lat],
                zoom: Math.max(handle.map.getZoom(), 8.5),
                duration: 650,
                essential: true,
              })
            }
          }}
          onClose={() => setTableOpen(false)}
        />
      )}

      <footer className="map-footer">
        <StatusLegend
          visible={gui.legend}
          count={snapshot.stats.filtered}
          sourceLabel={sourceLabel}
          live={snapshot.status.state === 'live'}
          latencyMs={snapshot.status.latencyMs}
          updatedAgo={
            snapshot.status.lastUpdate
              ? Math.max(0, Math.round((Date.now() - snapshot.status.lastUpdate) / 1000))
              : undefined
          }
        />
        <MapControls
          map={handle?.map ?? null}
          basemap={basemap}
          onBasemapChange={setBasemap}
          mapLayers={mapLayers}
          onMapLayersChange={setMapLayers}
          showLabels={showLabels}
          onShowLabelsChange={setShowLabels}
          is3D={is3D}
          on3DChange={setIs3D}
          cleanMode={cleanMode}
          onCleanModeToggle={() => setCleanMode((value) => !value)}
          onLocate={handleLocate}
          visible={gui.bottomControls}
        />
      </footer>

      {handle && gui.compass && <MapCompass map={handle.map} />}



      <SettingsModal
        uiScale={uiScale}
        onUiScaleChange={setUiScale}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        providerId={providerId}
        onProviderChange={handleProviderChange}
        pollIntervalMs={pollIntervalMs}
        onPollIntervalChange={setPollIntervalMs}
        backgroundUpdates={backgroundUpdates}
        onBackgroundUpdatesChange={setBackgroundUpdates}
        maxAircraft={maxAircraft}
        onMaxAircraftChange={setMaxAircraft}
        basemap={basemap}
        onBasemapChange={setBasemap}
        gui={gui}
        onGuiChange={setGui}
        showLabels={showLabels}
        onShowLabelsChange={setShowLabels}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      {hubsManagerOpen && (
        <HubsManager
          items={hubItems}
          onChange={setHubItems}
          onClose={() => setHubsManagerOpen(false)}
          onFlyTo={(lat, lon, zoom, label) => {
            setHubsManagerOpen(false)
            handleFlyTo(lat, lon, zoom, label)
          }}
        />
      )}

      <Toast key={toast?.key ?? 'toast'} message={toast?.text ?? null} />

      {mapError && (
        <div className="pointer-events-auto absolute bottom-[70px] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[11.5px] text-amber-100/90 backdrop-blur-md">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{mapError}</span>
          <button
            type="button"
            onClick={() => setMapError(null)}
            className="text-amber-100/50 hover:text-amber-100"
            aria-label="Cerrar aviso"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      </div>
    </div>
  )
}
