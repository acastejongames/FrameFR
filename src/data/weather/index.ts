import type { FeatureCollection, Polygon } from 'geojson'

export const WEATHER_MODES = {
  none: 'Sin meteorología', radar: 'Radar de lluvia', wind: 'Viento · km/h',
  temp: 'Temperatura · °C', rain: 'Precipitación · mm', storm: 'Tormentas · código WMO',
} as const
export type WeatherMode = keyof typeof WEATHER_MODES
export type ForecastMode = Exclude<WeatherMode, 'none' | 'radar'>
export const WEATHER_FIELDS: Record<ForecastMode, string> = {
  wind: 'wind_speed_10m', temp: 'temperature_2m', rain: 'precipitation', storm: 'weather_code',
}
export const WEATHER_GRID_SIZE = 7
export interface WeatherCell { lat: number; lon: number; polygon: number[][] }

/** A bounded 7×7 grid: one API request, not one request per point. */
export function weatherGrid(west: number, south: number, east: number, north: number): WeatherCell[] {
  if (![west, south, east, north].every(Number.isFinite)) return []
  const s = Math.max(-80, south), n = Math.min(80, north)
  const width = Math.min(360, east - west)
  if (width <= 0 || n <= s) return []
  const cells: WeatherCell[] = []
  for (let r = 0; r < WEATHER_GRID_SIZE; r++) for (let c = 0; c < WEATHER_GRID_SIZE; c++) {
    const x = west + width * c / WEATHER_GRID_SIZE, y = s + (n - s) * r / WEATHER_GRID_SIZE
    const x2 = x + width / WEATHER_GRID_SIZE, y2 = y + (n - s) / WEATHER_GRID_SIZE
    cells.push({ lat: (y + y2) / 2, lon: (((x + x2) / 2 + 180) % 360 + 360) % 360 - 180,
      polygon: [[x, y], [x2, y], [x2, y2], [x, y2], [x, y]] })
  }
  return cells
}

export function normalizeForecast(payload: unknown, cells: WeatherCell[], mode: ForecastMode): FeatureCollection<Polygon> {
  const list = Array.isArray(payload) ? payload : [payload]
  return { type: 'FeatureCollection', bbox: cells.length ? [...cells[0].polygon[0], ...cells.at(-1)!.polygon[2]] as [number, number, number, number] : undefined, features: cells.flatMap((cell, i) => {
    const value = list[i]?.current?.[WEATHER_FIELDS[mode]]
    // Missing data is a hole, never a fabricated temperature or zero rainfall.
    if (typeof value !== 'number' || !Number.isFinite(value)) return []
    return [{ type: 'Feature' as const, properties: { value, gridIndex: i },
      geometry: { type: 'Polygon' as const, coordinates: [cell.polygon] } }]
  }) }
}

const forecastCache = new Map<string, { at: number; data: FeatureCollection<Polygon> }>()

export async function fetchForecast(cells: WeatherCell[], mode: ForecastMode, signal: AbortSignal) {
  const params = new URLSearchParams({
    latitude: cells.map(c => c.lat.toFixed(3)).join(','),
    longitude: cells.map(c => c.lon.toFixed(3)).join(','),
    current: WEATHER_FIELDS[mode], wind_speed_unit: 'kmh', timezone: 'GMT',
  })
  signal.throwIfAborted()
  const key = params.toString()
  const cached = forecastCache.get(key)
  if (cached && Date.now() - cached.at < 300_000) return cached.data
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal })
  if (!response.ok) throw new Error(`Open-Meteo: HTTP ${response.status}`)
  const data = normalizeForecast(await response.json(), cells, mode)
  if (!data.features.length) throw new Error('Sin datos meteorológicos en este sector')
  signal.throwIfAborted()
  forecastCache.delete(key)
  forecastCache.set(key, { at: Date.now(), data })
  if (forecastCache.size > 12) forecastCache.delete(forecastCache.keys().next().value!)
  return data
}

export function latestRadar(payload: unknown): { path: string; time: number } {
  const frames = (payload as { radar?: { past?: { path?: unknown; time?: unknown }[] } })?.radar?.past
  const frame = Array.isArray(frames) ? frames.at(-1) : undefined
  if (!frame || typeof frame.path !== 'string' || !/^\/v2\/radar\/[a-zA-Z0-9/_-]+$/.test(frame.path) ||
    typeof frame.time !== 'number' || !Number.isFinite(frame.time)) throw new Error('Radar no disponible')
  return { path: frame.path, time: frame.time }
}
