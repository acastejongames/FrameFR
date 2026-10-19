import { wrapLon } from '../geo'

export const WEATHER_MODES = {
  none: 'Sin meteorología',
  radar: 'Radar de lluvia',
  wind: 'Viento · km/h',
  temp: 'Temperatura · °C',
  rain: 'Precipitación · mm',
  storm: 'Tormentas · código WMO',
} as const

export type WeatherMode = keyof typeof WEATHER_MODES
export type ForecastMode = Exclude<WeatherMode, 'none' | 'radar'>

export const WEATHER_FIELDS: Record<ForecastMode, string> = {
  wind: 'wind_speed_10m',
  temp: 'temperature_2m',
  rain: 'precipitation',
  storm: 'weather_code',
}

export const FORECAST_COLUMNS = 11
export const FORECAST_ROWS = 9
export const FORECAST_TTL_MS = 600_000

export interface WeatherBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface WeatherSector extends WeatherBounds {
  key: string
  columns: number
  rows: number
}

export interface ForecastPoint {
  lat: number
  lon: number
}

export interface ForecastGrid {
  sector: WeatherSector
  fetchedAt: number
  /** Row-major values, south to north. Missing observations stay undefined. */
  values: Record<ForecastMode, Array<number | undefined>>
}

const WIDTHS = [5, 8, 12, 18, 27, 40, 60, 90, 135, 200, 300, 360]
const HEIGHTS = [4, 6, 9, 14, 21, 32, 48, 72, 108, 160]
const MODES = Object.keys(WEATHER_FIELDS) as ForecastMode[]

function longitudeWidth(bounds: WeatherBounds): number {
  let width = bounds.east - bounds.west
  while (width <= 0) width += 360
  return Math.min(360, width)
}

function shiftNear(value: number, reference: number): number {
  return value + Math.round((reference - value) / 360) * 360
}

function shiftedBounds(bounds: WeatherBounds, referenceCenter: number): WeatherBounds {
  const width = longitudeWidth(bounds)
  const center = shiftNear(bounds.west + width / 2, referenceCenter)
  return { ...bounds, west: center - width / 2, east: center + width / 2 }
}

export function sectorSafelyCovers(
  sector: WeatherBounds,
  bounds: WeatherBounds,
  marginRatio = 0.05,
): boolean {
  if (![sector.west, sector.south, sector.east, sector.north, bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite)) return false
  const sectorCenter = (sector.west + sector.east) / 2
  const view = shiftedBounds(bounds, sectorCenter)
  const marginX = (sector.east - sector.west) * marginRatio
  const marginY = (sector.north - sector.south) * marginRatio
  return (
    view.west >= sector.west + marginX &&
    view.east <= sector.east - marginX &&
    view.south >= sector.south + marginY &&
    view.north <= sector.north - marginY
  )
}

/**
 * A stable, snapped sector around the viewport.
 *
 * The old implementation sampled the exact screen bounds, so every wheel tick
 * changed the sampling points, the cache key and the image registration. A
 * sector is instead rounded to a coarse ladder and snapped to a fixed lattice:
 * ordinary zooms simply reuse it, and panning only fetches near its edge.
 */
export function sectorForViewport(bounds: WeatherBounds): WeatherSector | null {
  if (![bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite)) return null
  const viewWidth = longitudeWidth(bounds)
  const viewHeight = Math.max(0, bounds.north - bounds.south)
  if (viewWidth <= 0 || viewHeight <= 0 || bounds.south >= 80 || bounds.north <= -80) return null

  let widthIndex = Math.max(0, WIDTHS.findIndex((width) => width >= viewWidth * 1.35))
  let heightIndex = Math.max(0, HEIGHTS.findIndex((height) => height >= viewHeight * 1.35))
  if (WIDTHS[widthIndex] < viewWidth * 1.35) widthIndex = WIDTHS.length - 1
  if (HEIGHTS[heightIndex] < viewHeight * 1.35) heightIndex = HEIGHTS.length - 1

  const rawCenterLon = bounds.west + viewWidth / 2
  const rawCenterLat = Math.max(-80, Math.min(80, (bounds.south + bounds.north) / 2))

  for (;;) {
    const width = WIDTHS[widthIndex]
    const height = HEIGHTS[heightIndex]
    const canonicalCenter = wrapLon(Math.round(wrapLon(rawCenterLon) / (width / 6)) * (width / 6))
    const centerLon = shiftNear(canonicalCenter, rawCenterLon)
    const centerLat = Math.max(
      -80 + height / 2,
      Math.min(80 - height / 2, Math.round(rawCenterLat / (height / 6)) * (height / 6)),
    )
    const sector: WeatherSector = {
      west: centerLon - width / 2,
      east: centerLon + width / 2,
      south: centerLat - height / 2,
      north: centerLat + height / 2,
      columns: FORECAST_COLUMNS,
      rows: FORECAST_ROWS,
      key: '',
    }
    if (sectorSafelyCovers(sector, bounds, 0)) {
      sector.key = [wrapLon(sector.west), sector.south, width, height, sector.columns, sector.rows]
        .map((value) => Number(value).toFixed(3))
        .join('/')
      return sector
    }
    if (widthIndex < WIDTHS.length - 1) widthIndex++
    else if (heightIndex < HEIGHTS.length - 1) heightIndex++
    else {
      sector.key = [wrapLon(sector.west), sector.south, width, height, sector.columns, sector.rows]
        .map((value) => Number(value).toFixed(3))
        .join('/')
      return sector
    }
  }
}

export function forecastPoints(sector: WeatherSector): ForecastPoint[] {
  const points: ForecastPoint[] = []
  const cellWidth = (sector.east - sector.west) / sector.columns
  const cellHeight = (sector.north - sector.south) / sector.rows
  for (let row = 0; row < sector.rows; row++) {
    for (let column = 0; column < sector.columns; column++) {
      points.push({
        lat: sector.south + cellHeight * (row + 0.5),
        lon: wrapLon(sector.west + cellWidth * (column + 0.5)),
      })
    }
  }
  return points
}

interface ForecastResponseItem {
  current?: Record<string, unknown>
}

export function normalizeForecastGrid(
  payload: unknown,
  sector: WeatherSector,
  fetchedAt = Date.now(),
): ForecastGrid {
  const list = (Array.isArray(payload) ? payload : [payload]) as ForecastResponseItem[]
  const values = Object.fromEntries(
    MODES.map((mode) => [
      mode,
      Array.from({ length: sector.columns * sector.rows }, (_, index) => {
        const value = list[index]?.current?.[WEATHER_FIELDS[mode]]
        return typeof value === 'number' && Number.isFinite(value) ? value : undefined
      }),
    ]),
  ) as ForecastGrid['values']
  return { sector, fetchedAt, values }
}

const forecastCache = new Map<string, ForecastGrid>()
const forecastInflight = new Map<string, Promise<ForecastGrid>>()

export function getCachedForecastGrid(
  sector: WeatherSector,
  maxAgeMs = FORECAST_TTL_MS,
): ForecastGrid | undefined {
  const grid = forecastCache.get(sector.key)
  if (!grid || Date.now() - grid.fetchedAt > maxAgeMs) return undefined
  forecastCache.delete(sector.key)
  forecastCache.set(sector.key, grid)
  return grid
}

/** One request returns every forecast field, so switching layers is local. */
export async function fetchForecastGrid(
  sector: WeatherSector,
  signal?: AbortSignal,
  maxAgeMs = FORECAST_TTL_MS,
): Promise<ForecastGrid> {
  signal?.throwIfAborted()
  const cached = getCachedForecastGrid(sector, maxAgeMs)
  if (cached) return cached
  const existing = forecastInflight.get(sector.key)
  if (existing) return existing

  const points = forecastPoints(sector)
  const params = new URLSearchParams({
    latitude: points.map((point) => point.lat.toFixed(3)).join(','),
    longitude: points.map((point) => point.lon.toFixed(3)).join(','),
    current: MODES.map((mode) => WEATHER_FIELDS[mode]).join(','),
    wind_speed_unit: 'kmh',
    timezone: 'GMT',
  })
  const request = (async (): Promise<ForecastGrid> => {
    // A shared in-flight request deliberately does not belong to one caller:
    // aborting a stale UI update must not cancel the sector another update
    // is already waiting for. Callers use generation checks for relevance.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal })
      if (!response.ok) throw new Error(`Open-Meteo: HTTP ${response.status}`)
      const grid = normalizeForecastGrid(await response.json(), sector)
      if (!MODES.some((mode) => grid.values[mode].some((value) => value !== undefined))) {
        throw new Error('Sin datos meteorológicos en este sector')
      }
      forecastCache.delete(sector.key)
      forecastCache.set(sector.key, grid)
      while (forecastCache.size > 8) forecastCache.delete(forecastCache.keys().next().value!)
      return grid
    } finally {
      clearTimeout(timeout)
    }
  })()

  forecastInflight.set(sector.key, request)
  try {
    return await request
  } finally {
    if (forecastInflight.get(sector.key) === request) forecastInflight.delete(sector.key)
  }
}

export function latestRadar(payload: unknown): { path: string; time: number } {
  const frames = (payload as { radar?: { past?: { path?: unknown; time?: unknown }[] } })?.radar?.past
  const frame = Array.isArray(frames) ? frames.at(-1) : undefined
  if (!frame || typeof frame.path !== 'string' || !/^\/v2\/radar\/[a-zA-Z0-9/_-]+$/.test(frame.path) ||
    typeof frame.time !== 'number' || !Number.isFinite(frame.time)) throw new Error('Radar no disponible')
  return { path: frame.path, time: frame.time }
}

let radarCache: { at: number; data: { path: string; time: number } } | undefined
let radarInflight: Promise<{ path: string; time: number }> | undefined

export async function fetchLatestRadar(signal?: AbortSignal): Promise<{ path: string; time: number }> {
  signal?.throwIfAborted()
  if (radarCache && Date.now() - radarCache.at < 60_000) return radarCache.data
  if (radarInflight) return radarInflight
  const request = (async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetch('https://api.rainviewer.com/public/weather-maps.json', { signal: controller.signal })
      if (!response.ok) throw new Error(`RainViewer: HTTP ${response.status}`)
      const data = latestRadar(await response.json())
      radarCache = { at: Date.now(), data }
      return data
    } finally {
      clearTimeout(timeout)
    }
  })()
  radarInflight = request
  try {
    return await request
  } finally {
    if (radarInflight === request) radarInflight = undefined
  }
}
