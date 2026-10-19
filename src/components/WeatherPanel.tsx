import { useEffect, useRef, useState } from 'react'
import type { ExpressionSpecification, Map } from 'maplibre-gl'
import { WEATHER_MODES, fetchForecast, latestRadar, weatherGrid, type WeatherMode } from '@/data/weather'
import { AIRCRAFT_LAYER, TRAIL_GLOW_LAYER } from '@/map/aircraftLayers'

const SOURCE = 'aeroscope-weather'
const LAYER = 'aeroscope-weather-fill'
const COLORS: Record<string, ExpressionSpecification> = {
  temp: ['interpolate', ['linear'], ['get', 'value'], -20, '#6366f1', 0, '#38bdf8', 15, '#34d399', 30, '#fbbf24', 45, '#ef4444'],
  wind: ['interpolate', ['linear'], ['get', 'value'], 0, '#475569', 20, '#38bdf8', 40, '#34d399', 70, '#fbbf24', 100, '#ef4444'],
  rain: ['interpolate', ['linear'], ['get', 'value'], 0, '#475569', 0.5, '#38bdf8', 2, '#34d399', 5, '#fbbf24', 20, '#e879f9'],
  storm: ['case', ['>=', ['get', 'value'], 95], '#f43f5e', '#475569'],
}
const LEGENDS: Record<WeatherMode, string> = {
  none: '', radar: 'Radar observado · cobertura variable. Sin eco no significa sin lluvia.',
  temp: 'Azul: 0° · verde: 15° · amarillo: 30° · rojo: 45°',
  wind: 'Azul: 20 · verde: 40 · amarillo: 70 · rojo: 100 km/h',
  rain: 'Azul: 0,5 · verde: 2 · amarillo: 5 · violeta: 20 mm',
  storm: 'Rojo: código WMO ≥ 95 (tormenta). No son rayos observados.',
}

/** Weather lifecycle is independent of aircraft polling and rendering. */
export function WeatherPanel({ map }: { map: Map | null }) {
  const [mode, setMode] = useState<WeatherMode>('none')
  const [opacity, setOpacity] = useState(0.45)
  const [status, setStatus] = useState('')
  const opacityRef = useRef(opacity)
  opacityRef.current = opacity
  useEffect(() => {
    const layer = map?.getLayer(LAYER)
    if (layer) map?.setPaintProperty(LAYER, layer.type === 'raster' ? 'raster-opacity' : 'fill-opacity', opacity)
  }, [map, opacity])

  useEffect(() => {
    if (!map || mode === 'none') { setStatus(''); return }
    let disposed = false
    let request: AbortController | undefined
    let debounce: ReturnType<typeof setTimeout> | undefined
    const clear = () => {
      if (map.getLayer(LAYER)) map.removeLayer(LAYER)
      if (map.getSource(SOURCE)) map.removeSource(SOURCE)
    }
    const update = async () => {
      if (disposed || !map.isStyleLoaded() || document.hidden) return
      request?.abort()
      const controller = new AbortController()
      request = controller
      const timeout = setTimeout(() => controller.abort(), 15_000)
      setStatus('Cargando meteorología…')
      try {
        let radar: { path: string; time: number } | undefined
        let data
        if (mode === 'radar') {
          const response = await fetch('https://api.rainviewer.com/public/weather-maps.json', { signal: controller.signal })
          if (!response.ok) throw new Error(`RainViewer: HTTP ${response.status}`)
          radar = latestRadar(await response.json())
        } else {
          const bounds = map.getBounds()
          data = await fetchForecast(weatherGrid(bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()), mode, controller.signal)
        }
        if (disposed || controller.signal.aborted || !map.isStyleLoaded()) return
        clear()
        const before = map.getLayer(TRAIL_GLOW_LAYER) ? TRAIL_GLOW_LAYER : map.getLayer(AIRCRAFT_LAYER) ? AIRCRAFT_LAYER : undefined
        if (radar) {
          map.addSource(SOURCE, { type: 'raster', tiles: [`https://tilecache.rainviewer.com${radar.path}/256/{z}/{x}/{y}/2/1_1.png`], tileSize: 256, maxzoom: 7, attribution: '<a href="https://www.rainviewer.com/">RainViewer</a>' })
          map.addLayer({ id: LAYER, type: 'raster', source: SOURCE, paint: { 'raster-opacity': opacityRef.current } }, before)
          setStatus(`Radar · ${new Date(radar.time * 1000).toISOString().slice(11, 16)} UTC`)
        } else if (data) {
          map.addSource(SOURCE, { type: 'geojson', data, attribution: '<a href="https://open-meteo.com/">Open-Meteo</a> · CC BY 4.0' })
          map.addLayer({ id: LAYER, type: 'fill', source: SOURCE, paint: { 'fill-color': COLORS[mode], 'fill-opacity': opacityRef.current } }, before)
          setStatus('Open-Meteo · modelo actual · cuadrícula de baja resolución')
        }
      } catch (error) {
        if (disposed || request !== controller) return
        clear()
        setStatus(controller.signal.aborted ? 'Tiempo de espera agotado; se reintentará.' : `${error instanceof Error ? error.message : 'Error meteorológico'}. Se reintentará.`)
      } finally { clearTimeout(timeout) }
    }
    const schedule = () => {
      request?.abort()
      clearTimeout(debounce)
      debounce = setTimeout(() => void update(), 700)
    }
    const visibility = () => { if (!document.hidden) schedule(); else request?.abort() }
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

  return (
    <details className="panel absolute right-3 top-32 z-20 w-64 max-w-[calc(100%-24px)] rounded-lg p-3 text-xs" data-clean-hide>
      <summary className="cursor-pointer font-semibold text-accent">Meteorología</summary>
      <label className="mt-3 block">Capa
        <select aria-label="Capa meteorológica" className="mt-1 w-full rounded bg-ink-700 p-2" value={mode} onChange={e => setMode(e.target.value as WeatherMode)}>
          {Object.entries(WEATHER_MODES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      {mode !== 'none' && <>
        <label className="mt-3 block">Opacidad · {Math.round(opacity * 100)}%
          <input aria-label="Opacidad meteorológica" className="mt-1 w-full" type="range" min="0.1" max="0.8" step="0.1" value={opacity} onChange={e => setOpacity(Number(e.target.value))} />
        </label>
        <p className="mt-2 text-white/70" role="status">{map ? status : 'Esperando al mapa…'}</p>
        <p className="mt-2 text-white/60">{LEGENDS[mode]}</p>
        <p className="mt-2 text-white/40">Solo información orientativa. No usar para navegación aérea.</p>
      </>}
    </details>
  )
}
