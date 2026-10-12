/**
 * Colour language shared by the map layer, the flight list and the legend.
 * Altitude bands follow the convention used by flight trackers: cool colours
 * low, warm colours high.
 */

export interface AltitudeBand {
  key: string
  label: string
  min: number
  max: number
  color: string
}

export const ALTITUDE_BANDS: AltitudeBand[] = [
  { key: 'ground', label: 'En tierra', min: -1, max: 0, color: '#94a3b8' },
  { key: 'b1', label: '0 – 10 000 ft', min: 0, max: 10_000, color: '#38bdf8' },
  { key: 'b2', label: '10 – 25 000 ft', min: 10_000, max: 25_000, color: '#4ade80' },
  { key: 'b3', label: '25 – 35 000 ft', min: 25_000, max: 35_000, color: '#facc15' },
  { key: 'b4', label: '35 – 45 000 ft', min: 35_000, max: 45_000, color: '#fb923c' },
  { key: 'b5', label: '> 45 000 ft', min: 45_000, max: Number.MAX_SAFE_INTEGER, color: '#f87171' },
]

export const SELECTED_COLOR = '#5eead4'
export const TRAIL_COLOR = '#5eead4'

const BAND_BY_KEY = new Map(ALTITUDE_BANDS.map((b) => [b.key, b]))

export function bandKey(altitude: number, onGround: boolean): string {
  if (onGround || altitude <= 0) return 'ground'
  for (const band of ALTITUDE_BANDS) {
    if (band.key === 'ground') continue
    if (altitude >= band.min && altitude < band.max) return band.key
  }
  return 'b5'
}

export function bandColor(key: string): string {
  return BAND_BY_KEY.get(key)?.color ?? SELECTED_COLOR
}

export function bandLabel(key: string): string {
  return BAND_BY_KEY.get(key)?.label ?? '—'
}

export const CATEGORY_LABELS: Record<string, string> = {
  commercial: 'Comercial',
  cargo: 'Carga',
  general: 'Aviación general',
  military: 'Militar',
}

export const CATEGORY_COLORS: Record<string, string> = {
  commercial: '#38bdf8',
  cargo: '#a78bfa',
  general: '#4ade80',
  military: '#f87171',
}
