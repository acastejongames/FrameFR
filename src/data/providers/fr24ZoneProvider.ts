/**
 * Provider for the Flightradar24 "zone feed".
 *
 * The endpoint is a JSONP API that answers with a map of aircraft arrays:
 *
 * ```
 * { "3c4b26": [hex, lat, lon, track, altFt, gsKt, squawk, ?, type, reg, ?,
 *              origin, destination, flightNo, onGround, verticalRate, callsign] }
 * ```
 *
 * It is by far the richest public feed (routes, registrations, vertical rate),
 * but it does not send CORS headers, so it has to be read through JSONP.
 */

import { categoryOf } from '../category'
import { enrichWithAirline } from '../airlineCodes'
import { aircraftModelName, resolveSilhouette } from '../aircraftTypes'
import { jsonp } from './jsonp'
import type { Aircraft, AircraftProvider, Viewport } from '../types'

/** Base of the JSONP endpoint. */
const ZONE_FEED = 'https://data-cloud.flightradar24.com/zones/fcgi/feed.js'

/** Query flags copied from the reference client: everything, no gliders. */
const ZONE_FLAGS =
  'faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=1&air=1&vehicles=0&estimated=0&maxage=14400&gliders=0&stats=0'

export interface Fr24ZoneProviderOptions {
  /** Poll cadence in ms. */
  pollIntervalMs?: number
  /** Timeout of the JSONP request. */
  timeoutMs?: number
}

type ZoneRow = unknown[]
type ZonePayload = Record<string, ZoneRow>

/**
 * Extracts the payload from the several shapes the endpoint may answer with:
 * a plain object, a `{ contents: "…" }` wrapper (base64 or plain JSON) or a
 * JSONP envelope that the transport already unwrapped.
 */
export function unwrapZonePayload(raw: unknown): ZonePayload {
  let data: unknown = raw

  if (data && typeof data === 'object' && 'contents' in (data as Record<string, unknown>)) {
    const inner = String((data as { contents: unknown }).contents ?? '').trim()
    if (!inner) return {}
    if (inner.startsWith('data:')) {
      const base64 = inner.slice(inner.indexOf(',') + 1)
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      data = JSON.parse(new TextDecoder('utf-8').decode(bytes))
    } else {
      data = JSON.parse(inner)
    }
  }

  if (typeof data === 'string') {
    const trimmed = data.trim()
    const firstParen = trimmed.indexOf('(')
    const lastParen = trimmed.lastIndexOf(')')
    if (firstParen !== -1 && lastParen > firstParen && /^[a-zA-Z0-9_$.]+\s*\(/.test(trimmed)) {
      return unwrapZonePayload(trimmed.slice(firstParen + 1, lastParen))
    }
    return unwrapZonePayload(JSON.parse(trimmed))
  }

  if (!data || typeof data !== 'object') return {}
  return data as ZonePayload
}

/** Converts one zone row into the internal aircraft model. */
export function normalizeZoneRow(zoneId: string, row: ZoneRow, observedAt: number): Aircraft | null {
  if (!Array.isArray(row) || row.length < 14) return null

  const lat = Number(row[1])
  const lon = Number(row[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat === 0 && lon === 0) return null

  const hex = String(row[0] ?? zoneId).trim().toUpperCase()
  if (!hex) return null

  const track = Math.round(Number(row[3]) || 0)
  const altitude = Math.max(0, Math.round(Number(row[4]) || 0))
  const groundSpeed = Math.max(0, Math.round(Number(row[5]) || 0))
  const squawk = String(row[6] ?? '').trim()
  const type = String(row[8] ?? '').trim() || 'A320'
  const registration = String(row[9] ?? '').trim()
  const origin = String(row[11] ?? '').trim()
  const destination = String(row[12] ?? '').trim()
  const flightNumber = String(row[13] ?? '').trim()
  const onGround = Boolean(row[14]) || altitude <= 100
  const verticalRate = Math.round(Number(row[15]) || 0)
  const callsign = String(row[16] ?? flightNumber ?? registration ?? hex).trim()

  const aircraft: Aircraft = {
    id: hex.toLowerCase(),
    callsign: callsign || hex,
    type,
    registration: registration && registration !== 'N/A' ? registration : undefined,
    category: categoryOf({ callsign, type, groundSpeed }),
    lat,
    lon,
    altitude: onGround ? 0 : altitude,
    groundSpeed,
    verticalRate,
    heading: track,
    onGround,
    squawk: squawk || undefined,
    flightNumber: flightNumber || undefined,
    observedAt,
    sourceId: 'fr24',
    zoneId,
  }

  if (origin || destination) {
    aircraft.route = { origin: origin || undefined, destination: destination || undefined }
  }

  enrichWithAirline(aircraft)
  aircraft.fullModel = aircraftModelName(type)
  aircraft.silhouette = resolveSilhouette(type, 'A3')
  aircraft.seen = 0.2
  aircraft.rssi = -5.4

  return aircraft
}

export class Fr24ZoneProvider implements AircraftProvider {
  readonly id = 'fr24'
  readonly label = 'Global ADS-B'
  readonly description = 'Feed global de Flightradar24 (JSONP, incluye ruta y matrícula).'
  readonly mode = 'live' as const
  readonly pollIntervalMs: number
  readonly attribution = 'Datos ADS-B vía Flightradar24'

  private readonly timeoutMs: number

  constructor(options: Fr24ZoneProviderOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? 6_000
    this.timeoutMs = options.timeoutMs ?? 7_000
  }

  async poll(viewport: Viewport): Promise<Aircraft[]> {
    const { west, south, east, north } = viewport.bounds
    // A small padding keeps aircraft that just entered the viewport visible.
    const pad = 0.8
    const clampLat = (v: number) => Math.max(-85, Math.min(85, v)).toFixed(2)
    const clampLon = (v: number) => Math.max(-180, Math.min(180, v)).toFixed(2)
    const params = new URLSearchParams({
      bounds: [
        clampLat(north + pad),
        clampLat(south - pad),
        clampLon(west - pad),
        clampLon(east + pad),
      ].join(','),
      ...Object.fromEntries(ZONE_FLAGS.split('&').map((pair) => pair.split('='))),
    })
    const url = `${ZONE_FEED}?${params.toString()}&callback=__CALLBACK__`

    const payload = await jsonp<unknown>(url, this.timeoutMs)
    const zones = unwrapZonePayload(payload)
    const now = Date.now()
    const list: Aircraft[] = []
    for (const [zoneId, row] of Object.entries(zones)) {
      const aircraft = normalizeZoneRow(zoneId, row, now)
      if (aircraft) list.push(aircraft)
    }
    return list
  }
}
