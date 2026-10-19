/**
 * Generic provider for the "v2" family of public ADS-B APIs.
 *
 * Four independent networks publish the very same JSON schema
 * (`{ ac: [...] }` with `hex`, `flight`, `alt_baro`, `gs`, `track`…):
 *
 *  - adsb.lol        `https://api.adsb.lol/v2/point/{lat}/{lon}/{radius}`
 *  - ADSB.one       `https://api.adsb.one/v2/point/{lat}/{lon}/{radius}`
 *  - adsb.fi        `https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{radius}`
 *  - airplanes.live `https://api.airplanes.live/v2/point/{lat}/{lon}/{radius}`
 *
 * Only the URL shape differs, so a single implementation covers all of them.
 */

import { categoryOf } from '../category'
import { clamp } from '../geo'
import { enrichWithAirline } from '../airlineCodes'
import { aircraftModelName, resolveSilhouette } from '../aircraftTypes'
import type { Aircraft, AircraftProvider, Viewport } from '../types'

/** Radius (NM) accepted by the point endpoints of the v2 family. */
const MAX_RADIUS_NM = 250
const REQUEST_TIMEOUT_MS = 12_000

/** Raw shape of one aircraft in the v2 schema. */
export interface AdsbV2Aircraft {
  hex?: string
  type?: string
  flight?: string
  r?: string
  t?: string
  desc?: string
  alt_baro?: number | 'ground'
  alt_geom?: number
  gs?: number
  tas?: number
  ias?: number
  track?: number
  true_heading?: number
  mag_heading?: number
  baro_rate?: number
  geom_rate?: number
  squawk?: string
  emergency?: string
  category?: string
  lat?: number
  lon?: number
  military?: boolean
  registration?: string
  seen?: number
  rssi?: number
  own_op?: string
}

export interface AdsbV2Response {
  now?: number
  total?: number
  ac?: AdsbV2Aircraft[]
}

/** Builds the request URL for a given viewport. */
export type AdsbV2UrlBuilder = (lat: number, lon: number, radiusNm: number) => string

export interface AdsbV2ProviderOptions {
  id: string
  label: string
  description: string
  buildUrl: AdsbV2UrlBuilder
  pollIntervalMs?: number
  /** Attribution shown in the status bar. */
  attribution?: string
  /** Base URL override, handy for tests and self-hosted mirrors. */
  baseUrl?: string
}

/**
 * Shared implementation of the v2 feeds. Subclasses (or plain instances
 * created by the registry) only differ in their URL builder.
 */
export class AdsbV2Provider implements AircraftProvider {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly mode = 'live' as const
  readonly pollIntervalMs: number
  readonly attribution?: string

  private readonly buildUrl: AdsbV2UrlBuilder
  private controller: AbortController | null = null
  private lastRadiusNm = 0

  constructor(options: AdsbV2ProviderOptions) {
    this.id = options.id
    this.label = options.label
    this.description = options.description
    this.pollIntervalMs = options.pollIntervalMs ?? 8_000
    this.attribution = options.attribution ?? `Datos ADS-B vía ${options.label}`
    this.buildUrl = options.buildUrl
  }

  /** Non-null when the service radius (250 NM) is smaller than the viewport. */
  get notice(): string | undefined {
    if (this.lastRadiusNm <= MAX_RADIUS_NM) return undefined
    return `Radio limitado a ${MAX_RADIUS_NM} NM por el proveedor — amplía el zoom para ver más tráfico.`
  }

  async poll(viewport: Viewport, externalSignal?: AbortSignal): Promise<Aircraft[]> {
    const radiusNm = clamp(Math.ceil(viewport.radiusNm), 25, MAX_RADIUS_NM)
    this.lastRadiusNm = viewport.radiusNm

    const url = this.buildUrl(
      viewport.center.lat,
      viewport.center.lon,
      radiusNm,
    )

    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const onExternalAbort = () => controller.abort()
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true })

    try {
      const signals = [controller.signal]
      if (externalSignal) signals.push(externalSignal)
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.any ? AbortSignal.any(signals) : controller.signal,
        mode: 'cors',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
      const payload = (await response.json()) as AdsbV2Response
      const now = Date.now()
      const list: Aircraft[] = []

      for (const raw of payload.ac ?? []) {
        const aircraft = normalizeV2Aircraft(raw, now, this.id)
        if (aircraft) list.push(aircraft)
      }
      return list
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(
          controller.signal.aborted
            ? `Tiempo de espera agotado al consultar ${this.label}`
            : 'Consulta cancelada',
        )
      }
      throw error instanceof Error ? error : new Error(`No se ha podido consultar ${this.label}`)
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

/**
 * Converts one raw v2 aircraft into the internal model, filling in everything
 * the feed does not report (airline name, commercial flight number, model and
 * silhouette family).
 */
export function normalizeV2Aircraft(
  raw: AdsbV2Aircraft,
  observedAt: number,
  sourceId?: string,
): Aircraft | null {
  const hex = (raw.hex ?? '').trim().toLowerCase()
  if (!hex) return null
  if (typeof raw.lat !== 'number' || typeof raw.lon !== 'number') return null

  const rawCallsign = (raw.flight ?? '').trim()
  const registration = (raw.r ?? raw.registration ?? '').trim()
  const callsign = rawCallsign || registration || hex.toUpperCase()
  if (!rawCallsign && !registration && !raw.t) return null

  const onGround = raw.alt_baro === 'ground'
  const altitude =
    typeof raw.alt_baro === 'number'
      ? raw.alt_baro
      : typeof raw.alt_geom === 'number'
        ? raw.alt_geom
        : 0

  const heading = raw.track ?? raw.true_heading ?? raw.mag_heading ?? 0
  const type = (raw.t ?? raw.type ?? '').trim() || undefined
  const groundSpeed = Math.round(raw.gs ?? raw.tas ?? raw.ias ?? 0)

  const aircraft: Aircraft = {
    id: hex,
    callsign,
    type,
    registration: registration || undefined,
    category: categoryOf({
      military: raw.military,
      callsign,
      type,
      groundSpeed,
    }),
    lat: raw.lat,
    lon: raw.lon,
    altitude: onGround ? 0 : Math.round(altitude),
    groundSpeed,
    verticalRate: Math.round((raw.baro_rate ?? raw.geom_rate ?? 0) / 50) * 50,
    heading,
    onGround,
    squawk: raw.squawk,
    emergency: raw.emergency,
    observedAt,
    sourceId,
  }

  const operator = (raw.own_op ?? '').trim()
  if (operator) aircraft.operator = operator
  aircraft.airlineName = operator || undefined

  enrichWithAirline(aircraft)
  aircraft.fullModel = aircraftModelName(type) ?? ((raw.desc ?? '').trim() || undefined)
  aircraft.silhouette = resolveSilhouette(type, raw.category)
  aircraft.rssi = typeof raw.rssi === 'number' ? raw.rssi : undefined
  aircraft.seen = typeof raw.seen === 'number' ? raw.seen : undefined

  return aircraft
}
