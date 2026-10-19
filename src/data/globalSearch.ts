/**
 * Planet-wide aircraft search.
 *
 * The map only shows the sector the user is looking at, but the search box is
 * global: typing `LH419`, `Lufthansa`, `A340` or `G-XWBA` looks for that
 * aircraft anywhere on the planet and flies to it.
 *
 * Two families of endpoints are used:
 *
 *  - the Flightradar24 zone feed accepts `callsign`, `type`, `airline` and
 *    `reg` filters and answers with JSONP (no CORS),
 *  - ADSB.one and adsb.fi expose `/v2/{callsign|type|reg|hex}/{value}` with
 *    plain JSON and CORS enabled.
 *
 * Every query is fired in parallel and the results are streamed to the caller
 * as soon as each one lands, so the dropdown fills progressively.
 */

import { ICAO_AIRLINES, icaoPrefixesForIata } from './airlineCodes'
import { AIRCRAFT_TYPE_NAMES } from './aircraftTypes'
import { jsonp } from './providers/jsonp'
import { unwrapZonePayload, normalizeZoneRow } from './providers/fr24ZoneProvider'
import { normalizeV2Aircraft } from './providers/adsbV2Provider'
import { fallbackAircraft } from './providers/autoProvider'
import type { Aircraft } from './types'

/** Search intent extracted from the raw query. */
export interface SearchIntent {
  callsigns: Set<string>
  types: Set<string>
  airlines: Set<string>
  regs: Set<string>
  hexes: Set<string>
}

const ZONE_FEED = 'https://data-cloud.flightradar24.com/zones/fcgi/feed.js'
const ZONE_FLAGS =
  'faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=1&air=1&vehicles=0&estimated=0&maxage=14400&gliders=0&stats=0'

/** A JSONP zone query for the whole planet, filtered by the given parameters. */
function zoneQuery(params: Record<string, string>): string {
  const search = new URLSearchParams({
    bounds: '85,-85,-180,180',
    ...Object.fromEntries(ZONE_FLAGS.split('&').map((pair) => pair.split('='))),
    ...params,
  })
  return `${ZONE_FEED}?${search.toString()}&callback=__CALLBACK__`
}

/**
 * Extracts the intent of a free-text query.
 *
 * The query may be an IATA flight number (`LH419`), an ICAO callsign
 * (`DLH419`), an aircraft model (`A340`, `Airbus A340-600`), an airline name
 * or code (`Lufthansa`, `DLH`), a registration (`G-XWBA`) or a hex address
 * (`3C4B26`).
 */
export function resolveSearchIntent(rawQuery: string): SearchIntent {
  const q = rawQuery.trim().toUpperCase()
  const compact = q.replace(/\s+/g, '')
  const intent: SearchIntent = {
    callsigns: new Set(),
    types: new Set(),
    airlines: new Set(),
    regs: new Set(),
    hexes: new Set(),
  }
  if (!q) return intent

  // 1. IATA flight number, e.g. `LH419` → ICAO `DLH419`.
  const iataFlight = compact.match(/^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/)
  if (iataFlight) {
    const [, iataPrefix, digits] = iataFlight
    intent.callsigns.add(compact)
    for (const icao of icaoPrefixesForIata(iataPrefix)) {
      intent.callsigns.add(`${icao}${digits}`)
    }
  }

  // 2. ICAO callsign, e.g. `DLH419`.
  if (/^[A-Z]{3}\d{1,4}[A-Z]{0,2}$/.test(compact)) intent.callsigns.add(compact)

  // 3. Aircraft model: `A346`, `A340`, `Airbus A340-600`.
  const tokens = q.split(/[\s-]+/).filter((t) => t.length >= 3)
  for (const [code, model] of Object.entries(AIRCRAFT_TYPE_NAMES)) {
    const upperModel = model.toUpperCase()
    if (
      code === compact ||
      upperModel.includes(q) ||
      q.includes(code) ||
      (tokens.length > 0 && tokens.every((tok) => upperModel.includes(tok) || code.includes(tok)))
    ) {
      intent.types.add(code)
    }
  }
  // Direct 4-character designators that are not in the dictionary.
  if (/^[A-Z]\d[A-Z0-9]{2}$/.test(compact)) intent.types.add(compact)

  // 4. Airline by name or code.
  for (const [icao, info] of Object.entries(ICAO_AIRLINES)) {
    const upperName = info.name.toUpperCase()
    if (icao === compact || info.iata === compact || (q.length >= 3 && upperName.includes(q))) {
      intent.airlines.add(icao)
    }
  }

  // 5. Registration, e.g. `G-XWBA`, `EC-MXY`, `N123AB`.
  if (
    /^[A-Z0-9]{1,2}-[A-Z0-9]{2,5}$/.test(compact) ||
    /^(N\d{1,5}[A-Z]{0,2}|JA\d{3,4}[A-Z0-9]|HL\d{4})$/.test(compact)
  ) {
    intent.regs.add(compact)
  }

  // 6. ICAO 24-bit hex address.
  if (/^[0-9A-F]{6}$/.test(compact)) intent.hexes.add(compact)

  return intent
}

/** One pending search request. */
export interface GlobalSearchResult {
  /** Aircraft found, keyed by ICAO 24-bit address. */
  results: Map<string, Aircraft>
  /** `true` while at least one endpoint is still running. */
  pending: boolean
}

/**
 * Runs a global search.
 *
 * @param query      Raw text typed by the user.
 * @param onUpdate   Called every time new aircraft are found.
 * @param signal     Cancels the whole search.
 */
export async function searchPlanet(
  query: string,
  onUpdate: (aircraft: Aircraft[]) => void,
  signal?: AbortSignal,
): Promise<void> {
  const intent = resolveSearchIntent(query)
  const results = new Map<string, Aircraft>()
  const seen = new Set<string>()

  const publish = (list: Aircraft[]): void => {
    if (list.length > 0) onUpdate(list)
  }

  const tasks: Array<Promise<void>> = []

  const push = (incoming: Aircraft[]): void => {
    const fresh: Aircraft[] = []
    for (const aircraft of incoming) {
      const key = aircraft.id.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      results.set(key, aircraft)
      fresh.push(aircraft)
    }
    publish(fresh)
  }

  /* ------------------------------------------------------ Flightradar24 */
  const zoneCall = async (params: Record<string, string>): Promise<void> => {
    try {
      const payload = await jsonp<unknown>(zoneQuery(params), 6000)
      const zones = unwrapZonePayload(payload)
      const now = Date.now()
      const list: Aircraft[] = []
      for (const [zoneId, row] of Object.entries(zones)) {
        const aircraft = normalizeZoneRow(zoneId, row, now)
        if (aircraft) list.push(aircraft)
      }
      push(list)
    } catch {
      // A failed endpoint is simply ignored: the others may still answer.
    }
  }

  if (intent.callsigns.size > 0) {
    const value = Array.from(intent.callsigns).slice(0, 6).join(',')
    tasks.push(zoneCall({ callsign: value }))
  }
  if (intent.types.size > 0) {
    const value = Array.from(intent.types).slice(0, 8).join(',')
    tasks.push(zoneCall({ type: value }))
  }
  if (intent.airlines.size > 0) {
    const value = Array.from(intent.airlines).slice(0, 5).join(',')
    tasks.push(zoneCall({ airline: value }))
  }
  if (intent.regs.size > 0) {
    const value = Array.from(intent.regs).slice(0, 4).join(',')
    tasks.push(zoneCall({ reg: value }))
  }

  /* ------------------------------------------------ ADSB.one / adsb.fi */
  const v2Call = async (url: string): Promise<void> => {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal })
      if (!response.ok) return
      const payload = (await response.json()) as { ac?: Parameters<typeof normalizeV2Aircraft>[0][] }
      const now = Date.now()
      const list: Aircraft[] = []
      for (const raw of payload.ac ?? []) {
        const aircraft = normalizeV2Aircraft(raw, now)
        if (aircraft) list.push(aircraft)
      }
      push(list)
    } catch {
      // Ignored on purpose.
    }
  }

  for (const callsign of Array.from(intent.callsigns).slice(0, 3)) {
    tasks.push(v2Call(`https://api.adsb.one/v2/callsign/${encodeURIComponent(callsign)}`))
    tasks.push(v2Call(`https://opendata.adsb.fi/api/v2/callsign/${encodeURIComponent(callsign)}`))
  }
  for (const type of Array.from(intent.types).slice(0, 2)) {
    tasks.push(v2Call(`https://api.adsb.one/v2/type/${encodeURIComponent(type)}`))
  }
  for (const reg of Array.from(intent.regs).slice(0, 2)) {
    tasks.push(v2Call(`https://api.adsb.one/v2/reg/${encodeURIComponent(reg)}`))
    tasks.push(v2Call(`https://opendata.adsb.fi/api/v2/reg/${encodeURIComponent(reg)}`))
  }
  for (const hex of Array.from(intent.hexes).slice(0, 3)) {
    tasks.push(v2Call(`https://api.adsb.one/v2/hex/${encodeURIComponent(hex)}`))
    tasks.push(v2Call(`https://opendata.adsb.fi/api/v2/hex/${encodeURIComponent(hex)}`))
  }

  // Free-form query that matched nothing specific: try it as a callsign.
  if (tasks.length === 0) {
    const clean = query.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
    if (clean.length >= 2) tasks.push(zoneCall({ callsign: clean }))
  }

  if (tasks.length === 0) return

  await Promise.allSettled(tasks)
}

/** Exposed for the UI: builds a placeholder aircraft for a raw hex address. */
export function placeholderAircraft(hex: string): Aircraft {
  return fallbackAircraft(hex, hex.toUpperCase(), 0, 0, Date.now())
}
