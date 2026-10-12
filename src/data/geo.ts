/** Small, dependency-free geodesy helpers (spherical earth approximation). */

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const EARTH_RADIUS_NM = 3440.065

export interface LatLon {
  lat: number
  lon: number
}

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/** Great circle distance in nautical miles. */
export function distanceNm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD
  const dLon = (b.lon - a.lon) * RAD
  const lat1 = a.lat * RAD
  const lat2 = b.lat * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Initial bearing from `a` to `b`, in degrees (0..360). */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const lat1 = a.lat * RAD
  const lat2 = b.lat * RAD
  const dLon = (b.lon - a.lon) * RAD
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (Math.atan2(y, x) * DEG + 360) % 360
}

/** Point at `f` (0..1) along the great circle from `a` to `b`. */
export function interpolateGreatCircle(a: LatLon, b: LatLon, f: number): LatLon {
  const lat1 = a.lat * RAD
  const lon1 = a.lon * RAD
  const lat2 = b.lat * RAD
  const lon2 = b.lon * RAD
  const d = 2 * Math.asin(Math.min(1, Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
  )))
  if (d < 1e-9) return { lat: a.lat, lon: a.lon }
  const sinD = Math.sin(d)
  const A = Math.sin((1 - f) * d) / sinD
  const B = Math.sin(f * d) / sinD
  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2)
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2)
  const z = A * Math.sin(lat1) + B * Math.sin(lat2)
  return {
    lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * DEG,
    lon: Math.atan2(y, x) * DEG,
  }
}

/** Shortest signed difference between two headings, in degrees (-180..180). */
export function angleDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

/** Interpolate two headings along the shortest arc. */
export function lerpAngle(from: number, to: number, t: number): number {
  return (from + angleDelta(from, to) * t + 360) % 360
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Longitude wrapped to [-180, 180). */
export function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

/** `true` when the point falls inside the (possibly antimeridian-crossing) box. */
export function inBounds(lat: number, lon: number, b: { west: number; south: number; east: number; north: number }): boolean {
  if (lat < b.south || lat > b.north) return false
  return b.west <= b.east ? lon >= b.west && lon <= b.east : lon >= b.west || lon <= b.east
}

/** Grow a bounding box by a fraction of its own span (and a minimum padding). */
export function expandBounds(
  b: { west: number; south: number; east: number; north: number },
  factor: number,
  minDeg = 1,
): { west: number; south: number; east: number; north: number } {
  const latPad = Math.max((b.north - b.south) * factor, minDeg)
  const lonSpan = b.east >= b.west ? b.east - b.west : b.east + 360 - b.west
  const lonPad = Math.max(lonSpan * factor, minDeg)
  return {
    west: b.west - lonPad,
    east: b.east + lonPad,
    south: Math.max(-89, b.south - latPad),
    north: Math.min(89, b.north + latPad),
  }
}
