import {
  CloudSun,
  CloudRain,
  Wind,
  Thermometer,
  CloudLightning,
  Radar,
  CircleOff,
  ChevronUp,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ImageSource, Map as MapLibreMap, RasterTileSource } from 'maplibre-gl'
import {
  FORECAST_TTL_MS,
  WEATHER_MODES,
  fetchForecastGrid,
  fetchLatestRadar,
  getCachedForecastGrid,
  sectorForViewport,
  sectorSafelyCovers,
  type ForecastGrid,
  type ForecastMode,
  type WeatherBounds,
  type WeatherMode,
} from '@/data/weather'
import { rasterizeForecast } from '@/data/weather/raster'
import { AIRCRAFT_LAYER, TRAIL_GLOW_LAYER } from '@/map/aircraftLayers'
import { ToolPopover } from './ToolPopover'

const FORECAST_SOURCE = 'aeroscope-weather-forecast'
const FORECAST_LAYER = 'aeroscope-weather-forecast-layer'
const RADAR_SOURCE = 'aeroscope-weather-radar'
const RADAR_LAYER = 'aeroscope-weather-radar-layer'
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='

const LEGENDS: Record<WeatherMode, string> = {
  none: '',
  radar: 'Radar observado · cobertura variable. Sin eco no significa sin lluvia.',
  temp: 'Azul: 0° · verde: 15° · amarillo: 30° · rojo: 45°',
  wind: 'Azul: 20 · verde: 40 · amarillo: 70 · rojo: 100 km/h',
  rain: 'Azul: 0,5 · verde: 2 · amarillo: 5 · violeta: 20 mm',
  storm: 'Rojo: código WMO ≥ 95 (tormenta). No son rayos observados.',
}

const utcTime = (timestamp: number): string => new Date(timestamp).toISOString().slice(11, 16)

/** Weather is sampled in stable sectors and never blocks aircraft updates. */
export function WeatherPanel({
  map,
  open,
  onToggle,
  onClose,
}: {
  map: MapLibreMap | null
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<WeatherMode>('none')
  const [opacity, setOpacity] = useState(0.45)
  const [status, setStatus] = useState('')
  const modeRef = useRef(mode)
  modeRef.current = mode
  const opacityRef = useRef(opacity)
  opacityRef.current = opacity
  const updateRef = useRef<(() => void) | null>(null)
  const forecastRef = useRef<ForecastGrid | null>(null)
  const radarRef = useRef<{ path: string; time: number } | null>(null)
  const imageCacheRef = useRef(new Map<string, ImageData>())

  useEffect(() => {
    if (!map) return
    for (const layer of [FORECAST_LAYER, RADAR_LAYER]) {
      if (map.getLayer(layer)) map.setPaintProperty(layer, 'raster-opacity', opacity)
    }
  }, [map, opacity])

  useEffect(() => {
    if (!map) {
      updateRef.current = null
      return
    }

    let disposed = false
    let generation = 0
    let failures = 0
    let renderedForecastKey = ''
    let appliedRadarPath = ''
    let request: AbortController | undefined
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let debounce: ReturnType<typeof setTimeout> | undefined

    const removeLayerAndSource = (layer: string, source: string): void => {
      try {
        if (map.getLayer(layer)) map.removeLayer(layer)
        if (map.getSource(source)) map.removeSource(source)
      } catch {
        // The map may already be tearing down; MapLibre owns that cleanup.
      }
    }

    const setVisibility = (layer: string, visible: boolean): void => {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', visible ? 'visible' : 'none')
    }

    const beforeLayer = (): string | undefined =>
      map.getLayer(TRAIL_GLOW_LAYER)
        ? TRAIL_GLOW_LAYER
        : map.getLayer(AIRCRAFT_LAYER)
          ? AIRCRAFT_LAYER
          : undefined

    const renderForecast = (grid: ForecastGrid, selected: ForecastMode): boolean => {
      const key = `${grid.sector.key}:${grid.fetchedAt}:${selected}`
      const existing = map.getSource(FORECAST_SOURCE) as ImageSource | undefined
      if (existing && map.getLayer(FORECAST_LAYER) && renderedForecastKey === key) {
        setVisibility(FORECAST_LAYER, true)
        return true
      }

      let image = imageCacheRef.current.get(key)
      if (!image) {
        const raster = rasterizeForecast(grid, selected)
        image = new ImageData(raster.pixels, raster.width, raster.height)
        imageCacheRef.current.set(key, image)
        while (imageCacheRef.current.size > 4) {
          imageCacheRef.current.delete(imageCacheRef.current.keys().next().value!)
        }
      }
      const { west, south, east, north } = grid.sector
      const coordinates = [[west, north], [east, north], [east, south], [west, south]] as [
        [number, number],
        [number, number],
        [number, number],
        [number, number],
      ]

      let source = existing
      if (!source) {
        map.addSource(FORECAST_SOURCE, { type: 'image', url: TRANSPARENT_PIXEL, coordinates })
        source = map.getSource(FORECAST_SOURCE) as ImageSource
      }
      if (!map.getLayer(FORECAST_LAYER)) {
        map.addLayer(
          {
            id: FORECAST_LAYER,
            type: 'raster',
            source: FORECAST_SOURCE,
            paint: {
              'raster-opacity': opacityRef.current,
              'raster-resampling': 'linear',
              'raster-fade-duration': 0,
            },
          },
          beforeLayer(),
        )
      }
      source.updateImage({ image, coordinates })
      renderedForecastKey = key
      setVisibility(FORECAST_LAYER, true)
      return true
    }

    const renderRadar = (radar: { path: string; time: number }): void => {
      const tiles = [`https://tilecache.rainviewer.com${radar.path}/256/{z}/{x}/{y}/2/1_1.png`]
      let source = map.getSource(RADAR_SOURCE) as RasterTileSource | undefined
      if (!source) {
        map.addSource(RADAR_SOURCE, {
          type: 'raster',
          tiles,
          tileSize: 256,
          maxzoom: 7,
          attribution: '<a href="https://www.rainviewer.com/">RainViewer</a>',
        })
        source = map.getSource(RADAR_SOURCE) as RasterTileSource
        appliedRadarPath = radar.path
      } else if (appliedRadarPath !== radar.path) {
        source.setTiles(tiles)
        appliedRadarPath = radar.path
      }
      if (!map.getLayer(RADAR_LAYER)) {
        map.addLayer(
          {
            id: RADAR_LAYER,
            type: 'raster',
            source: RADAR_SOURCE,
            paint: { 'raster-opacity': opacityRef.current, 'raster-fade-duration': 0 },
          },
          beforeLayer(),
        )
      }
      setVisibility(RADAR_LAYER, true)
    }

    const restore = (): void => {
      const selected = modeRef.current
      if (selected === 'none') {
        setVisibility(FORECAST_LAYER, false)
        setVisibility(RADAR_LAYER, false)
      } else if (selected === 'radar') {
        setVisibility(FORECAST_LAYER, false)
        if (radarRef.current) renderRadar(radarRef.current)
      } else {
        setVisibility(RADAR_LAYER, false)
        if (forecastRef.current) renderForecast(forecastRef.current, selected)
      }
    }

    const scheduleRetry = (): void => {
      failures++
      clearTimeout(retryTimer)
      const delay = Math.min(120_000, 5_000 * 2 ** Math.min(5, failures - 1))
      retryTimer = setTimeout(() => void update(), delay)
    }

    const beginRequest = (): { generation: number; signal: AbortSignal } => {
      generation++
      request?.abort()
      const controller = new AbortController()
      request = controller
      const timeout = setTimeout(() => controller.abort(), 20_000)
      controller.signal.addEventListener('abort', () => clearTimeout(timeout), { once: true })
      return { generation, signal: controller.signal }
    }

    const bounds = (): WeatherBounds => {
      const value = map.getBounds()
      return {
        west: value.getWest(),
        south: value.getSouth(),
        east: value.getEast(),
        north: value.getNorth(),
      }
    }

    const forecastStatus = (grid: ForecastGrid, selected: ForecastMode): void => {
      const hasData = grid.values[selected].some((value) => value !== undefined)
      setStatus(
        hasData
          ? `Open-Meteo · actualizado ${utcTime(grid.fetchedAt)} UTC`
          : 'Open-Meteo no ha devuelto datos para esta capa en el sector.',
      )
    }

    async function update(): Promise<void> {
      if (disposed || document.hidden) return
      const selected = modeRef.current
      clearTimeout(retryTimer)

      if (selected === 'none') {
        generation++
        request?.abort()
        restore()
        setStatus('')
        return
      }

      if (selected === 'radar') {
        setVisibility(FORECAST_LAYER, false)
        if (radarRef.current) renderRadar(radarRef.current)
        else setStatus('Cargando radar…')
        const call = beginRequest()
        try {
          const radar = await fetchLatestRadar(call.signal)
          if (disposed || call.generation !== generation || modeRef.current !== 'radar') return
          radarRef.current = radar
          failures = 0
          renderRadar(radar)
          setStatus(`Radar · ${utcTime(radar.time * 1000)} UTC`)
        } catch (error) {
          if (disposed || call.generation !== generation || call.signal.aborted) return
          setStatus(
            radarRef.current
              ? 'No se pudo actualizar el radar; se mantiene la última imagen.'
              : `${error instanceof Error ? error.message : 'Error de radar'}. Reintentando…`,
          )
          scheduleRetry()
        }
        return
      }

      setVisibility(RADAR_LAYER, false)
      const view = bounds()
      const current = forecastRef.current
      if (current) {
        renderForecast(current, selected)
        const viewWidth = Math.min(360, view.east - view.west > 0 ? view.east - view.west : view.east - view.west + 360)
        const viewHeight = Math.max(0.001, view.north - view.south)
        const sectorWidth = current.sector.east - current.sector.west
        const sectorHeight = current.sector.north - current.sector.south
        const fresh = Date.now() - current.fetchedAt <= FORECAST_TTL_MS
        const covered = sectorSafelyCovers(current.sector, view)
        const tooCoarse = sectorWidth / viewWidth > 4 || sectorHeight / viewHeight > 4
        if (fresh && covered && !tooCoarse) {
          failures = 0
          forecastStatus(current, selected)
          return
        }
      }

      const sector = sectorForViewport(view)
      if (!sector) {
        setStatus('Sector fuera de la cobertura del modelo.')
        return
      }
      const cached = getCachedForecastGrid(sector)
      if (cached && cached !== current) {
        forecastRef.current = cached
        renderForecast(cached, selected)
        forecastStatus(cached, selected)
        return
      }
      if (!current) setStatus('Cargando meteorología…')
      else setStatus('Actualizando el sector; se mantiene la capa anterior…')

      const call = beginRequest()
      try {
        const grid = await fetchForecastGrid(sector, call.signal)
        if (disposed || call.generation !== generation) return
        const active = modeRef.current
        if (active === 'none' || active === 'radar') return
        forecastRef.current = grid
        failures = 0
        renderForecast(grid, active)
        forecastStatus(grid, active)
      } catch (error) {
        if (disposed || call.generation !== generation || call.signal.aborted) return
        setStatus(
          forecastRef.current
            ? 'No se pudo actualizar; se mantiene la última capa válida.'
            : `${error instanceof Error ? error.message : 'Error meteorológico'}. Reintentando…`,
        )
        scheduleRetry()
      }
    }

    const schedule = (): void => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void update(), 700)
    }
    const handleStyleLoad = (): void => {
      renderedForecastKey = ''
      appliedRadarPath = ''
      restore()
      schedule()
    }
    const handleVisibility = (): void => {
      if (document.hidden) {
        generation++
        request?.abort()
        clearTimeout(debounce)
        clearTimeout(retryTimer)
      } else {
        schedule()
      }
    }

    updateRef.current = () => void update()
    map.on('style.load', handleStyleLoad)
    map.on('moveend', schedule)
    document.addEventListener('visibilitychange', handleVisibility)
    const interval = setInterval(() => void update(), 300_000)
    restore()

    return () => {
      disposed = true
      generation++
      request?.abort()
      clearTimeout(debounce)
      clearTimeout(retryTimer)
      clearInterval(interval)
      map.off('style.load', handleStyleLoad)
      map.off('moveend', schedule)
      document.removeEventListener('visibilitychange', handleVisibility)
      if (updateRef.current) updateRef.current = null
      removeLayerAndSource(FORECAST_LAYER, FORECAST_SOURCE)
      removeLayerAndSource(RADAR_LAYER, RADAR_SOURCE)
    }
  }, [map])

  useEffect(() => {
    updateRef.current?.()
  }, [map, mode])

  const icons = {
    none: CircleOff,
    radar: Radar,
    wind: Wind,
    temp: Thermometer,
    rain: CloudRain,
    storm: CloudLightning,
  }
  const descriptions = {
    none: 'Solo tráfico aéreo',
    radar: 'Observaciones · RainViewer',
    wind: 'Velocidad a 10 m · km/h',
    temp: 'Temperatura a 2 m · °C',
    rain: 'Precipitación · mm',
    storm: 'Condiciones · código WMO',
  }
  const names = {
    none: 'Desactivada',
    radar: 'Radar de lluvia',
    wind: 'Viento',
    temp: 'Temperatura',
    rain: 'Precipitación',
    storm: 'Tormentas',
  }

  return (
    <ToolPopover
      id="weather-tools"
      title="Meteorología"
      subtitle="Una nueva perspectiva del cielo"
      open={open}
      onClose={onClose}
      trigger={
        <button
          type="button"
          className="dock-button"
          data-active={open || mode !== 'none'}
          onClick={onToggle}
          aria-label="Meteorología"
          aria-expanded={open}
          aria-controls="weather-tools"
          aria-haspopup="dialog"
        >
          <CloudSun size={20} />
          <span className="dock-label-wide">Meteorología</span>
          <span className="dock-label-small" aria-hidden="true">Tiempo</span>
          <ChevronUp size={13} className="dock-chevron" />
          {mode !== 'none' && <i className="tool-active-dot" />}
        </button>
      }
    >
      <div className="weather-options" role="group" aria-label="Capa meteorológica">
        {(Object.keys(WEATHER_MODES) as WeatherMode[]).map((id) => {
          const Icon = icons[id]
          return (
            <button
              key={id}
              type="button"
              className="weather-option"
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
            >
              <Icon size={21} />
              <span>
                <strong>{names[id]}</strong>
                <small>{descriptions[id]}</small>
              </span>
            </button>
          )
        })}
      </div>
      {mode !== 'none' ? (
        <div className="weather-readout">
          <label className="opacity-label" htmlFor="weather-opacity">
            Opacidad <span>{Math.round(opacity * 100)}%</span>
          </label>
          <input
            id="weather-opacity"
            aria-label="Opacidad meteorológica"
            className="w-full"
            type="range"
            min="0.1"
            max="0.8"
            step="0.1"
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
          />
          <p className="weather-status" role="status">
            {map ? status : 'Esperando al mapa…'}
          </p>
          <p className="weather-legend">{LEGENDS[mode]}</p>
        </div>
      ) : (
        <p className="tool-hint">
          Elige una capa para explorar el tiempo sin perder de vista los vuelos.
        </p>
      )}
      <div className="tool-footnote">
        Información orientativa. No usar para navegación aérea. Open-Meteo · CC BY 4.0.
      </div>
    </ToolPopover>
  )
}
