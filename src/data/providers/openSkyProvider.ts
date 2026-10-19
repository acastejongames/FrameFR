/**
 * Provider for the OpenSky Network (the reference open ADS-B aggregator).
 *
 * The endpoint answers with a `states` array whose rows follow the official
 * schema:
 *
 * ```
 *  0 icao24        6 on_ground      12 squawk
 *  1 callsign      7 velocity (m/s) 13 spi
 *  2 country       8 track (rad)    14 position_source
 *  3 lon           9 vrate (m/s)
 *  4 lat          10 sensors
 *  5 baro_alt (m) 11 geo_alt (m)
 * ```
 *
 * OpenSky is heavily rate limited for anonymous clients, so it is used as a
 * *filler*: the "auto" provider only asks it for what the other networks did
 * not return.
 */

import { categoryOf } from '../category'
import { enrichWithAirline } from '../airlineCodes'
import { aircraftModelName, resolveSilhouette } from '../aircraftTypes'
import type { Aircraft, AircraftProvider, Viewport } from '../types'

const OPENSKY_URL = 'https://opensky-network.org/api/states/all'
const REQUEST_TIMEOUT_MS = 15_000

/** Feet per metre. */
const FT_PER_M = 3.28084
/** Knots per m/s. */
const KT_PER_MS = 1.94384
/** Feet per minute per m/s. */
const FPM_PER_MS = 196.85

type StateVector = (string | number | boolean | null)[]

export interface OpenSkyResponse {
  time?: number
  states?: StateVector[]
}

export interface OpenSkyProviderOptions {
  pollIntervalMs?: number
}

export class OpenSkyProvider implements AircraftProvider {
  readonly id = 'opensky'
  readonly label = 'OpenSky'
  readonly description = 'Red abierta OpenSky (cobertura global, refresco limitado).'
  readonly mode = 'live' as const
  readonly pollIntervalMs: number
  readonly attribution = 'Datos ADS-B vía OpenSky Network'

  private controller: AbortController | null = null

  constructor(options: OpenSkyProviderOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? 12_000
  }

  async poll(viewport: Viewport, externalSignal?: AbortSignal): Promise<Aircraft[]> {
    const { west, south, east, north } = viewport.bounds
    const params = new URLSearchParams({
      lamin: south.toFixed(2),
      lomin: west.toFixed(2),
      lamax: north.toFixed(2),
      lomax: east.toFixed(2),
    })

    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const onExternalAbort = () => controller.abort()
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true })

    try {
      const response = await fetch(`${OPENSKY_URL}?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.any
          ? AbortSignal.any([controller.signal, externalSignal].filter(Boolean) as AbortSignal[])
          : controller.signal,
        mode: 'cors',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
      const payload = (await response.json()) as OpenSkyResponse
      const now = Date.now()
      const list: Aircraft[] = []
      for (const state of payload.states ?? []) {
        const aircraft = normalizeStateVector(state, now)
        if (aircraft) list.push(aircraft)
      }
      return list
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(
          controller.signal.aborted ? 'Tiempo de espera agotado al consultar OpenSky' : 'Consulta cancelada',
        )
      }
      throw error instanceof Error ? error : new Error('No se ha podido consultar OpenSky')
    } finally {
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onExternalAbort)
    }
  }

  dispose(): void {
    this.controller?.abort()
    this.controller = null
  }
}

/** Converts one OpenSky state vector into the internal aircraft model. */
export function normalizeStateVector(state: StateVector, observedAt: number): Aircraft | null {
  const icao24 = String(state[0] ?? '').trim().toLowerCase()
  if (!icao24) return null

  const lon = state[3]
  const lat = state[4]
  if (typeof lat !== 'number' || typeof lon !== 'number') return null

  const callsign = String(state[1] ?? '').trim()
  const country = String(state[2] ?? '').trim()
  const onGround = Boolean(state[6])
  const baroAltM = typeof state[5] === 'number' ? state[5] : 0
  const geoAltM = typeof state[11] === 'number' ? state[11] : baroAltM
  const altitudeM = baroAltM || geoAltM
  const velocity = typeof state[7] === 'number' ? state[7] : 0
  const trackRad = typeof state[8] === 'number' ? state[8] : 0
  const verticalRate = typeof state[9] === 'number' ? state[9] : 0
  const squawk = String(state[12] ?? '').trim()

  const groundSpeed = Math.round(velocity * KT_PER_MS)
  const type = 'A320'

  const aircraft: Aircraft = {
    id: icao24,
    callsign: callsign || icao24.toUpperCase(),
    type,
    category: categoryOf({ callsign, type, groundSpeed }),
    lat,
    lon,
    altitude: onGround ? 0 : Math.max(0, Math.round(altitudeM * FT_PER_M)),
    groundSpeed,
    verticalRate: Math.round(verticalRate * FPM_PER_MS),
    heading: Math.round(((trackRad * 180) / Math.PI + 360) % 360),
    onGround,
    squawk: squawk || undefined,
    observedAt,
    sourceId: 'opensky',
  }

  if (country) aircraft.route = { originCity: country }
  enrichWithAirline(aircraft)
  aircraft.fullModel = aircraftModelName(type)
  aircraft.silhouette = resolveSilhouette(type, 'A3')
  aircraft.seen = 0.5
  aircraft.rssi = -6.5

  return aircraft
}
