/**
 * Historical flight trail.
 *
 * The live feeds only report the current position, so the "estela" (the line
 * drawn behind the selected aircraft) is rebuilt from a historical source:
 *
 *  1. the **Flightradar24 detail handler**, which returns the full trajectory
 *     of the flight plus the airline, the aircraft registration, the route and
 *     — when available — a JetPhotos image. It has no CORS, so it is read
 *     through one of the public CORS proxies.
 *  2. the **OpenSky tracks** endpoint, used as a fallback
 *     (`GET /api/tracks/all?icao24=…&time=0`).
 *
 * The result is a list of `[lon, lat]` points plus the matching altitudes, so
 * the UI can draw both the map trail and the altitude sparkline.
 */

import { cachePhoto, type AircraftPhoto } from './photos'

/** One point of a historical trajectory. */
export interface TrailPoint {
  lon: number
  lat: number
  /** Altitude in feet. */
  altitude: number
  /** Epoch seconds. */
  time?: number
}

export interface TrailResult {
  points: TrailPoint[]
  /** Extra data the FR24 detail payload may carry. */
  airlineName?: string
  fullModel?: string
  registration?: string
  origin?: string
  originCity?: string
  destination?: string
  destinationCity?: string
  photo?: AircraftPhoto
}

const FR24_DETAIL = 'https://data-live.flightradar24.com/clickhandler/'
const OPENSKY_TRACKS = 'https://opensky-network.org/api/tracks/all'

/** Public CORS proxies used to read the FR24 detail handler. */
const PROXIES = [
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
]

const REQUEST_TIMEOUT_MS = 8000

function isHex(value: string): boolean {
  return /^[0-9a-fA-F]{6}$/.test(value)
}

/** Reads the FR24 detail payload and turns it into a trail. */
function parseFr24Detail(payload: unknown, hex: string): TrailResult | null {
  let data = payload as Record<string, unknown> | null
  if (!data || typeof data !== 'object') return null

  if (typeof data.contents === 'string') {
    try {
      data = JSON.parse(data.contents) as Record<string, unknown>
    } catch {
      return null
    }
  }

  const result: TrailResult = { points: [] }

  const airline = data.airline as { name?: string } | undefined
  if (airline?.name) result.airlineName = airline.name

  const aircraft = data.aircraft as
    | { model?: { text?: string }; registration?: string; images?: Record<string, unknown> }
    | undefined
  if (aircraft?.model?.text) result.fullModel = aircraft.model.text
  if (aircraft?.registration) result.registration = aircraft.registration

  const airport = data.airport as
    | {
        origin?: { code?: { iata?: string }; name?: string; position?: { region?: { city?: string } } }
        destination?: { code?: { iata?: string }; name?: string; position?: { region?: { city?: string } } }
      }
    | undefined
  if (airport?.origin) {
    result.origin = airport.origin.code?.iata
    result.originCity = airport.origin.position?.region?.city ?? airport.origin.name
  }
  if (airport?.destination) {
    result.destination = airport.destination.code?.iata
    result.destinationCity = airport.destination.position?.region?.city ?? airport.destination.name
  }

  // JetPhotos image bundled with the detail payload.
  const images = aircraft?.images as
    | { medium?: Array<{ src?: string; link?: string; copyright?: string }>; large?: Array<{ src?: string; link?: string; copyright?: string }> }
    | undefined
  const image = images?.medium?.[0] ?? images?.large?.[0]
  if (image?.src) {
    const photo: AircraftPhoto = {
      src: image.src,
      link: image.link ?? image.src,
      credit: `${image.copyright ?? 'Spotter'} · JetPhotos`,
      source: 'JetPhotos',
    }
    result.photo = photo
    cachePhoto(hex, photo)
  }

  const trail = data.trail as Array<{ lat?: number; lng?: number; alt?: number; time?: number }> | undefined
  if (Array.isArray(trail)) {
    const points = trail
      .filter((pt) => typeof pt.lat === 'number' && typeof pt.lng === 'number')
      .map((pt) => ({
        lon: pt.lng as number,
        lat: pt.lat as number,
        altitude: Math.max(0, Math.round(Number(pt.alt) || 0)),
        time: pt.time,
      }))
    // The feed returns the trajectory backwards (latest first).
    result.points = points.reverse()
  }

  return result.points.length > 1 ? result : null
}

/** Reads the OpenSky track history. */
async function fetchOpenSkyTrack(hex: string, signal?: AbortSignal): Promise<TrailResult | null> {
  if (!isHex(hex)) return null
  const url = `${OPENSKY_TRACKS}?icao24=${hex.toLowerCase()}&time=0`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
    })
    if (!response.ok) return null
    const data = (await response.json()) as {
      path?: Array<[number, number, number, number] | null>
    }
    const path = (data.path ?? [])
      .filter((pt): pt is [number, number, number, number] => Array.isArray(pt) && pt.length >= 3)
      .map((pt) => ({
        time: pt[0],
        lon: pt[2],
        lat: pt[1],
        altitude: Math.max(0, Math.round((Number(pt[3]) || 0) * 3.28084)),
      }))
    if (path.length < 2) return null
    return { points: path }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetches the historical trail of an aircraft.
 *
 * @param hex        ICAO 24-bit address.
 * @param zoneId     Optional Flightradar24 zone id, when the feed provided one.
 * @param signal     Cancels the request.
 */
export async function fetchFlightTrail(
  hex: string,
  zoneId?: string,
  signal?: AbortSignal,
): Promise<TrailResult | null> {
  if (zoneId) {
    const detailUrl = `${FR24_DETAIL}?version=1.5&flight=${encodeURIComponent(zoneId)}`
    for (const proxy of PROXIES) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        const response = await fetch(proxy(detailUrl), {
          signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
        })
        clearTimeout(timer)
        if (!response.ok) continue
        const payload = (await response.json()) as unknown
        const parsed = parseFr24Detail(payload, hex)
        if (parsed) return parsed
      } catch {
        // Try the next proxy.
      }
    }
  }

  return fetchOpenSkyTrack(hex, signal)
}
