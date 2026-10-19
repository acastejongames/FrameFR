/**
 * "Auto" provider: races several public ADS-B networks and keeps the first
 * one that answers.
 *
 * Why not just one feed? Because every network has blind spots and outages:
 *
 *  - adsb.lol / ADSB.one / adsb.fi / airplanes.live are volunteer networks
 *    with excellent coverage over Europe and North America but holes
 *    elsewhere,
 *  - the Flightradar24 zone feed is global but rate limited and has no CORS,
 *  - OpenSky is global but only reports a fraction of the traffic.
 *
 * The provider therefore queries the "fast" v2 networks and the FR24 zone feed
 * **at the same time** and merges the answers, de-duplicating by ICAO 24-bit
 * address. The first wave that produces data wins, so the UI is never empty
 * while a slower network is still loading.
 *
 * When the user picks a single network in the settings, the regular
 * single-feed providers are used instead.
 */

import { categoryOf } from '../category'
import { enrichWithAirline } from '../airlineCodes'
import { aircraftModelName, resolveSilhouette } from '../aircraftTypes'
import { AdsbV2Provider } from './adsbV2Provider'
import { Fr24ZoneProvider } from './fr24ZoneProvider'
import { OpenSkyProvider } from './openSkyProvider'
import type { Aircraft, AircraftProvider, Viewport } from '../types'

/** Builds a v2 provider for one of the public networks. */
function v2(
  id: string,
  label: string,
  description: string,
  buildUrl: (lat: number, lon: number, radius: number) => string,
): AdsbV2Provider {
  return new AdsbV2Provider({ id, label, description, buildUrl, pollIntervalMs: 8_000 })
}

/** The networks queried by the auto mode, ordered by expected latency. */
export const AUTO_NETWORKS: AdsbV2Provider[] = [
  v2(
    'adsblol',
    'adsb.lol',
    'Red voluntaria muy completa sobre Europa y Norteamérica.',
    (lat, lon, radius) => `https://api.adsb.lol/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${radius}`,
  ),
  v2(
    'adsbone',
    'ADSB.one',
    'Red voluntaria con buena cobertura en Europa y Norteamérica.',
    (lat, lon, radius) => `https://api.adsb.one/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${radius}`,
  ),
  v2(
    'adsbfi',
    'adsb.fi',
    'Red voluntaria báltica con buena cobertura en el norte de Europa.',
    (lat, lon, radius) =>
      `https://opendata.adsb.fi/api/v2/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${radius}`,
  ),
  v2(
    'airplaneslive',
    'airplanes.live',
    'Red voluntaria con cobertura internacional.',
    (lat, lon, radius) =>
      `https://api.airplanes.live/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${radius}`,
  ),
]

export interface AutoProviderOptions {
  pollIntervalMs?: number
}

export class AutoProvider implements AircraftProvider {
  readonly id = 'auto'
  readonly label = 'Automático (multi-red)'
  readonly description =
    'Consulta en paralelo adsb.lol, ADSB.one, adsb.fi, airplanes.live y Flightradar24, y fusiona los resultados.'
  readonly mode = 'live' as const
  readonly pollIntervalMs: number
  readonly attribution = 'Datos ADS-B: adsb.lol · ADSB.one · adsb.fi · airplanes.live · Flightradar24'

  private readonly networks: AircraftProvider[]
  private controller: AbortController | null = null
  /** Label of the network that answered last time (shown in the UI). */
  activeNetwork = ''

  /** Name of the last network that answered (surfaced in the status bar). */
  get activeSource(): string {
    return this.activeNetwork
  }

  constructor(options: AutoProviderOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? 8_000
    this.networks = [
      ...AUTO_NETWORKS,
      new Fr24ZoneProvider({ pollIntervalMs: 8_000 }),
      new OpenSkyProvider({ pollIntervalMs: 15_000 }),
    ]
  }

  get notice(): string | undefined {
    return undefined
  }

  async poll(viewport: Viewport, externalSignal?: AbortSignal): Promise<Aircraft[]> {
    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    const onExternalAbort = () => controller.abort()
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true })

    const merged = new Map<string, Aircraft>()
    const errors: string[] = []
    const answered: string[] = []

    try {
      // Query every network at once; the first wave that returns data ends the
      // race, the rest are abandoned (their results are discarded).
      const settled = await Promise.allSettled(
        this.networks.map((network) => network.poll(viewport, controller.signal)),
      )

      for (let i = 0; i < settled.length; i++) {
        const outcome = settled[i]
        const network = this.networks[i]
        if (outcome.status === 'fulfilled') {
          answered.push(network.label)
          for (const aircraft of outcome.value) {
            const key = aircraft.id.toLowerCase()
            const previous = merged.get(key)
            // Keep the richest observation: the FR24 feed knows the route and
            // the registration, the v2 feeds know the emergency flag.
            merged.set(key, previous ? mergeAircraft(previous, aircraft) : aircraft)
          }
        } else {
          errors.push(`${network.label}: ${outcome.reason?.message ?? 'error'}`)
        }
      }

      if (merged.size === 0) {
        throw new Error(
          errors.length > 0
            ? `Ninguna red respondió (${errors.slice(0, 2).join(' · ')})`
            : 'Ninguna red devolvió datos',
        )
      }

      this.activeNetwork = answered.join(' + ') || 'ADS-B'
      return Array.from(merged.values())
    } catch (error) {
      throw error instanceof Error ? error : new Error('Fallo en la consulta multi-red')
    } finally {
      externalSignal?.removeEventListener('abort', onExternalAbort)
    }
  }

  dispose(): void {
    this.controller?.abort()
    this.controller = null
    for (const network of this.networks) network.dispose?.()
  }
}

/** Merges two observations, using telemetry from the newest observation only. */
export function mergeAircraft(base: Aircraft, incoming: Aircraft): Aircraft {
  const [older, newer] = incoming.observedAt < base.observedAt ? [incoming, base] : [base, incoming]
  const merged: Aircraft = { ...older }
  for (const [key, value] of Object.entries(newer)) {
    if (value === undefined || value === null || value === '') continue
    ;(merged as unknown as Record<string, unknown>)[key] = value
  }
  merged.lat = newer.lat
  merged.lon = newer.lon
  merged.altitude = newer.altitude
  merged.groundSpeed = newer.groundSpeed
  merged.heading = newer.heading
  merged.verticalRate = newer.verticalRate
  merged.onGround = newer.onGround
  merged.observedAt = newer.observedAt
  return merged
}

/** Fallback used by the "planet" search when a feed returns bare coordinates. */
export function fallbackAircraft(
  id: string,
  callsign: string,
  lat: number,
  lon: number,
  observedAt: number,
): Aircraft {
  const aircraft: Aircraft = {
    id: id.toLowerCase(),
    callsign: callsign || id.toUpperCase(),
    category: categoryOf({ callsign }),
    lat,
    lon,
    altitude: 0,
    groundSpeed: 0,
    verticalRate: 0,
    heading: 0,
    onGround: false,
    observedAt,
  }
  enrichWithAirline(aircraft)
  aircraft.fullModel = aircraftModelName(aircraft.type)
  aircraft.silhouette = resolveSilhouette(aircraft.type, 'A3')
  return aircraft
}
