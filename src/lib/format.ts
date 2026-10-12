/** Spanish-locale formatters for the values shown in the UI. */

const nf = new Intl.NumberFormat('es-ES')
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

export const formatNumber = (v: number): string => nf.format(Math.round(v))

export const formatAltitude = (ft: number): string => `${nf.format(Math.round(ft))} ft`

export const formatSpeed = (kt: number): string => `${nf.format(Math.round(kt))} kt`

export const formatVerticalRate = (fpm: number): string => {
  if (Math.abs(fpm) < 100) return '0 fpm'
  const sign = fpm > 0 ? '▲' : '▼'
  return `${sign} ${nf.format(Math.round(Math.abs(fpm)))} fpm`
}

export const formatHeading = (deg: number): string => `${nf.format(Math.round(deg) % 360)}°`

export const formatCoord = (lat: number, lon: number): string =>
  `${nf1.format(lat)}°, ${nf1.format(lon)}°`

/** Nautical miles → kilometres (Spanish users think in km). */
export const nmToKm = (nm: number): number => nm * 1.852

export const formatDistance = (nm: number): string => {
  const km = nmToKm(nm)
  return km >= 100 ? `${nf.format(Math.round(km))} km` : `${nf1.format(km)} km`
}

export const formatDuration = (minutes: number): string => {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h} h ${m % 60} min` : `${m} min`
}

export const formatRelativeTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 2) return 'ahora'
  if (s < 60) return `hace ${s} s`
  const m = Math.floor(s / 60)
  return `hace ${m} min`
}

/** Squawk codes are zero padded to 4 digits. */
export const formatSquawk = (code?: string): string => (code ? code.padStart(4, '0') : '—')
