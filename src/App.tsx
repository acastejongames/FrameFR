import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { VIEW_PRESETS } from '@/config'
import { defaultProviderId, type ProviderId } from '@/data/registry'
import { DEFAULT_BASEMAP, type BasemapId } from '@/map/style'
import type { AircraftCategory } from '@/data/types'
import { ALL_CATEGORIES, type FleetFilters } from '@/engine/fleetController'
import { useFleetSnapshot } from '@/hooks/useFleetSnapshot'
import { AircraftDetail } from '@/components/AircraftDetail'
import { FlightList } from '@/components/FlightList'
import { MapCanvas, type MapCanvasHandle } from '@/components/MapCanvas'
import { MapControls } from '@/components/MapControls'
import { SettingsPanel } from '@/components/SettingsPanel'
import { StatusBar } from '@/components/StatusBar'
import { TopBar } from '@/components/TopBar'

const DEFAULT_FLEET_SIZE = Number(import.meta.env.VITE_FLEET_SIZE ?? 600) || 600

export default function App() {
  const [providerId, setProviderId] = useState<ProviderId>(defaultProviderId)
  const [fleetSize, setFleetSize] = useState(DEFAULT_FLEET_SIZE)
  const [speedFactor, setSpeedFactor] = useState(1)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<AircraftCategory | null>(null)
  const [airborneOnly, setAirborneOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [follow, setFollow] = useState(false)
  const [labels, setLabels] = useState(true)
  const [trail, setTrail] = useState(true)
  const [basemap, setBasemap] = useState<BasemapId>(DEFAULT_BASEMAP)
  const [basemapNames, setBasemapNames] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [handle, setHandle] = useState<MapCanvasHandle | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)

  const filters = useMemo<FleetFilters>(
    () => ({
      query,
      categories: category ? [category] : ALL_CATEGORIES,
      airborneOnly,
    }),
    [query, category, airborneOnly],
  )

  const snapshot = useFleetSnapshot(handle?.controller ?? null)
  const selected = snapshot.selected && snapshot.selected.id === selectedId ? snapshot.selected : null

  /* ------------------------------------------------------------ shortcuts */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (settingsOpen) setSettingsOpen(false)
        else if (document.activeElement === searchRef.current) setQuery('')
        else setSelectedId(null)
        return
      }
      if (event.key === '/' && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settingsOpen])

  /* -------------------------------------------------------------- actions */
  const handleProviderChange = useCallback(
    (id: ProviderId) => {
      setProviderId(id)
      setSelectedId(null)
      setFollow(false)
    },
    [],
  )

  const handlePreset = useCallback(
    (center: [number, number], zoom: number) => {
      handle?.map.flyTo({ center, zoom, duration: 1400, essential: true })
    },
    [handle],
  )

  const handleWorldView = useCallback(() => {
    const world = VIEW_PRESETS[0]
    handle?.map.flyTo({ center: world.center, zoom: world.zoom, duration: 1400, essential: true })
  }, [handle])

  const handleCenter = useCallback(
    (id: string) => {
      handle?.controller.centerOn(id)
    },
    [handle],
  )

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id)
    if (!id) setFollow(false)
  }, [])

  // Clear the error banner after a few seconds.
  useEffect(() => {
    if (!mapError) return
    const timer = setTimeout(() => setMapError(null), 8000)
    return () => clearTimeout(timer)
  }, [mapError])

  // Never stay behind the loading veil: if MapLibre has not reported `load`
  // after a while we reveal the UI anyway (any error is shown as a banner).
  const [veilTimedOut, setVeilTimedOut] = useState(false)
  useEffect(() => {
    if (handle) return
    const timer = setTimeout(() => setVeilTimedOut(true), 15_000)
    return () => clearTimeout(timer)
  }, [handle])

  const providerLabel = providerId === 'adsblol' ? 'adsb.lol' : 'Demo'
  const mode = providerId === 'adsblol' ? 'live' : 'simulated'

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-950 text-fg">
      <MapCanvas
        providerId={providerId}
        fleetSize={fleetSize}
        speedFactor={speedFactor}
        filters={filters}
        selectedId={selectedId}
        follow={follow}
        labels={labels}
        trail={trail}
        basemap={basemap}
        basemapNames={basemapNames}
        onReady={setHandle}
        onSelect={handleSelect}
        onFollowChange={setFollow}
        onError={setMapError}
      />

      {/* Loading veil */}
      {!handle && !veilTimedOut && (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-ink-950">
          <div className="flex flex-col items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" />
            <span className="text-[11px] uppercase tracking-[0.2em] text-white/35">
              Cargando cartografía
            </span>
          </div>
        </div>
      )}

      <TopBar
        ref={searchRef}
        status={snapshot.status}
        mode={mode}
        providerLabel={providerLabel}
        stats={snapshot.stats}
        query={query}
        onQueryChange={setQuery}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((open) => !open)}
      />

      <FlightList
        aircraft={snapshot.aircraft}
        total={snapshot.stats.total}
        filtered={snapshot.stats.filtered}
        selectedId={selectedId}
        onSelect={handleSelect}
        category={category}
        onCategoryChange={setCategory}
      />

      {selected && (
        <AircraftDetail
          aircraft={selected}
          onClose={() => handleSelect(null)}
          onCenter={handleCenter}
          follow={follow}
          onFollowChange={setFollow}
          updatedAt={snapshot.updatedAt}
        />
      )}

      <MapControls map={handle?.map ?? null} onWorldView={handleWorldView} />

      <StatusBar
        status={snapshot.status}
        providerLabel={providerLabel}
        mode={mode}
        stats={snapshot.stats}
        updatedAt={snapshot.updatedAt}
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        providerId={providerId}
        onProviderChange={handleProviderChange}
        basemap={basemap}
        onBasemapChange={setBasemap}
        mode={mode}
        fleetSize={fleetSize}
        onFleetSizeChange={setFleetSize}
        speedFactor={speedFactor}
        onSpeedFactorChange={setSpeedFactor}
        labels={labels}
        onLabelsChange={setLabels}
        trail={trail}
        onTrailChange={setTrail}
        basemapNames={basemapNames}
        onBasemapNamesChange={setBasemapNames}
        airborneOnly={airborneOnly}
        onAirborneOnlyChange={setAirborneOnly}
        onPreset={handlePreset}
      />

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
  )
}
