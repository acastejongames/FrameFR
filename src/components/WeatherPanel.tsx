import { forecastImage } from '@/data/weather/raster'
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
import { ToolPopover } from './ToolPopover'
import { useEffect, useRef, useState } from 'react'
import type { Map } from 'maplibre-gl'
import {
  WEATHER_MODES,
  fetchForecast,
  latestRadar,
  weatherGrid,
  type WeatherMode,
} from '@/data/weather'
import { AIRCRAFT_LAYER, TRAIL_GLOW_LAYER } from '@/map/aircraftLayers'

const SOURCE = 'aeroscope-weather'
const LAYER = 'aeroscope-weather-fill'
const LEGENDS: Record<WeatherMode, string> = {
  none: '',
  radar: 'Radar observado · cobertura variable. Sin eco no significa sin lluvia.',
  temp: 'Azul: 0° · verde: 15° · amarillo: 30° · rojo: 45°',
  wind: 'Azul: 20 · verde: 40 · amarillo: 70 · rojo: 100 km/h',
  rain: 'Azul: 0,5 · verde: 2 · amarillo: 5 · violeta: 20 mm',
  storm: 'Rojo: código WMO ≥ 95 (tormenta). No son rayos observados.',
}

/** Weather lifecycle is independent of aircraft polling and rendering. */
export function WeatherPanel({
  map,
  open,
  onToggle,
  onClose,
}: {
  map: Map | null
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<WeatherMode>('none')
  const [opacity, setOpacity] = useState(0.45)
  const [status, setStatus] = useState('')
  const opacityRef = useRef(opacity)
  opacityRef.current = opacity
  useEffect(() => {
    const layer = map?.getLayer(LAYER)
    if (layer)
      map?.setPaintProperty(
        LAYER,
        'raster-opacity',
        opacity,
      )
  }, [map, opacity])

  useEffect(() => {
    if (!map || mode === 'none') {
      setStatus('')
      return
    }
    let disposed = false
    let request: AbortController | undefined
    let debounce: ReturnType<typeof setTimeout> | undefined
    const clear = () => {
      if (map.getLayer(LAYER)) map.removeLayer(LAYER)
      if (map.getSource(SOURCE)) map.removeSource(SOURCE)
    }
    const update = async () => {
      if (disposed || !map.getLayer(AIRCRAFT_LAYER) || document.hidden) return
      request?.abort()
      const controller = new AbortController()
      request = controller
      const timeout = setTimeout(() => controller.abort(), 15_000)
      setStatus('Cargando meteorología…')
      try {
        let radar: { path: string; time: number } | undefined
        let data
        if (mode === 'radar') {
          const response = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
            signal: controller.signal,
          })
          if (!response.ok) throw new Error(`RainViewer: HTTP ${response.status}`)
          radar = latestRadar(await response.json())
        } else {
          const bounds = map.getBounds()
          data = await fetchForecast(
            weatherGrid(bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()),
            mode,
            controller.signal,
          )
        }
        if (disposed || controller.signal.aborted || !map.getLayer(AIRCRAFT_LAYER)) return
        clear()
        const before = map.getLayer(TRAIL_GLOW_LAYER)
          ? TRAIL_GLOW_LAYER
          : map.getLayer(AIRCRAFT_LAYER)
            ? AIRCRAFT_LAYER
            : undefined
        if (radar) {
          map.addSource(SOURCE, {
            type: 'raster',
            tiles: [`https://tilecache.rainviewer.com${radar.path}/256/{z}/{x}/{y}/2/1_1.png`],
            tileSize: 256,
            maxzoom: 7,
            attribution: '<a href="https://www.rainviewer.com/">RainViewer</a>',
          })
          map.addLayer(
            {
              id: LAYER,
              type: 'raster',
              source: SOURCE,
              paint: { 'raster-opacity': opacityRef.current },
            },
            before,
          )
          setStatus(`Radar · ${new Date(radar.time * 1000).toISOString().slice(11, 16)} UTC`)
        } else if (data) {
          const image = forecastImage(data, mode as Exclude<WeatherMode, 'none' | 'radar'>)
          map.addSource(SOURCE, { type: 'image', ...image })
          map.addLayer({ id: LAYER, type: 'raster', source: SOURCE,
            paint: { 'raster-opacity': opacityRef.current, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, before)
          setStatus('Open-Meteo · modelo interpolado · no añade precisión a los datos')
        }
      } catch (error) {
        if (disposed || request !== controller) return
        clear()
        setStatus(
          controller.signal.aborted
            ? 'Tiempo de espera agotado; se reintentará.'
            : `${error instanceof Error ? error.message : 'Error meteorológico'}. Se reintentará.`,
        )
      } finally {
        clearTimeout(timeout)
      }
    }
    const schedule = () => {
      request?.abort()
      clearTimeout(debounce)
      debounce = setTimeout(() => void update(), 700)
    }
    const visibility = () => {
      if (!document.hidden) schedule()
      else request?.abort()
    }
    map.on('style.load', schedule)
    if (mode !== 'radar') map.on('moveend', schedule)
    document.addEventListener('visibilitychange', visibility)
    const interval = setInterval(() => void update(), 300_000)
    void update()
    return () => {
      disposed = true
      request?.abort()
      clearTimeout(debounce)
      clearInterval(interval)
      map.off('style.load', schedule)
      map.off('moveend', schedule)
      document.removeEventListener('visibilitychange', visibility)
      clear()
    }
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
          <span className="dock-label-small" aria-hidden="true">
            Tiempo
          </span>
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
            onChange={(e) => setOpacity(Number(e.target.value))}
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
      <div className="tool-footnote">Información orientativa. No usar para navegación aérea.</div>
    </ToolPopover>
  )
}
