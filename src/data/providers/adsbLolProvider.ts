import { clamp, inBounds } from '../geo'
import type { Aircraft, AircraftCategory, AircraftProvider, Viewport } from '../types'

/**
 * Live feed backed by the public adsb.lol API.
 *
 * Docs: https://api.adsb.lol/ — endpoint `GET /v2/point/{lat}/{lon}/{radius}`
 * where `radius` is expressed in nautical miles and capped at 250 NM by the
 * service (that is why zoomed-out views show a notice in the UI).
 */

interface AdsbLolAircraft {
  hex?: string
  type?: string
  flight?: string
  r?: string
  t?: string
  alt_baro?: number | 'ground'
  alt_geom?: number
  gs?: number
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
}

interface AdsbLolResponse {
  now?: number
  total?: number
  ac?: AdsbLolAircraft[]
}

/** ICAO type designators we consider airliners. */
const AIRLINER_TYPES = new Set([
  'A220', 'A20N', 'A318', 'A319', 'A320', 'A321', 'A332', 'A333', 'A338', 'A339', 'A342', 'A343',
  'A345', 'A346', 'A359', 'A35K', 'A388', 'B37M', 'B38M', 'B39M', 'B737', 'B738', 'B739', 'B744',
  'B748', 'B752', 'B753', 'B762', 'B763', 'B764', 'B772', 'B77L', 'B77W', 'B788', 'B789', 'B78X',
  'E170', 'E175', 'E190', 'E195', 'E290', 'E295', 'CRJ2', 'CRJ7', 'CRJ9', 'CRJX', 'MD80', 'MD81',
  'MD82', 'MD83', 'MD88', 'MD11', 'BCS1', 'BCS3', 'A21N', 'A19N',
])

const CARGO_PREFIXES = ['FDX', 'UPS', 'GTI', 'CLX', 'BOX', 'SQC', 'ABX', 'ATN', 'GEC', 'CKS', 'CPA', 'SIA']

const REQUEST_TIMEOUT_MS = 12_000
const MAX_RADIUS_NM = 250

export interface AdsbLolOptions {
  /** Override the base URL (proxy, self-hosted replayer...). */
  baseUrl?: string
}

export class AdsbLolProvider implements AircraftProvider {
  readonly id = 'adsblol'
  readonly label = 'adsb.lol'
  readonly description = 'Feed ADS-B comunitario en directo (hasta 250 NM de radio).'
  readonly mode = 'live' as const
  readonly pollIntervalMs = 10_000
  readonly attribution = 'Datos ADS-B vía adsb.lol'

  private readonly baseUrl: string
  private controller: AbortController | null = null
  private lastRadiusNm = 0

  constructor(options: AdsbLolOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://api.adsb.lol/v2').replace(/\/$/, '')
  }

  /** Non-null when the service radius (250 NM) is smaller than the viewport. */
  get notice(): string | undefined {
    if (this.lastRadiusNm <= MAX_RADIUS_NM) return undefined
    return `Radio limitado a ${MAX_RADIUS_NM} NM por el proveedor — amplía el zoom para ver más tráfico.`
  }

  async poll(viewport: Viewport, externalSignal?: AbortSignal): Promise<Aircraft[]> {
    const radiusNm = clamp(Math.ceil(viewport.radiusNm), 25, MAX_RADIUS_NM)
    this.lastRadiusNm = viewport.radiusNm

    const url = `${this.baseUrl}/point/${viewport.center.lat.toFixed(4)}/${viewport.center.lon.toFixed(4)}/${radiusNm}`
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
      const payload = (await response.json()) as AdsbLolResponse
      const now = Date.now()
      const list: Aircraft[] = []

      for (const ac of payload.ac ?? []) {
        if (typeof ac.lat !== 'number' || typeof ac.lon !== 'number') continue
        if (!inBounds(ac.lat, ac.lon, viewport.bounds)) continue
        const aircraft = toAircraft(ac, now)
        if (aircraft) list.push(aircraft)
      }
      return list
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(controller.signal.aborted ? 'Tiempo de espera agotado al consultar adsb.lol' : 'Consulta cancelada')
      }
      throw error instanceof Error ? error : new Error('No se ha podido consultar adsb.lol')
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

function toAircraft(ac: AdsbLolAircraft, now: number): Aircraft | null {
  const id = (ac.hex ?? '').trim().toLowerCase()
  if (!id) return null

  const rawCallsign = (ac.flight ?? '').trim()
  const registration = (ac.r ?? ac.registration ?? '').trim() || undefined
  const callsign = rawCallsign || registration || id.toUpperCase()
  if (!rawCallsign && !registration && !ac.t) return null

  const onGround = ac.alt_baro === 'ground'
  const altitude =
    typeof ac.alt_baro === 'number' ? ac.alt_baro : typeof ac.alt_geom === 'number' ? ac.alt_geom : 0

  const heading = ac.track ?? ac.true_heading ?? ac.mag_heading ?? 0
  const type = (ac.t ?? ac.type ?? '').trim() || undefined

  return {
    id,
    callsign,
    type,
    registration,
    category: categoryOf(ac, callsign, type),
    lat: ac.lat as number,
    lon: ac.lon as number,
    altitude: onGround ? 0 : Math.round(altitude),
    groundSpeed: Math.round(ac.gs ?? 0),
    verticalRate: Math.round((ac.baro_rate ?? ac.geom_rate ?? 0) / 50) * 50,
    heading,
    onGround,
    squawk: ac.squawk,
    observedAt: now,
  }
}

function categoryOf(ac: AdsbLolAircraft, callsign: string, type?: string): AircraftCategory {
  if (ac.military === true) return 'military'
  const prefix = callsign.slice(0, 3).toUpperCase()
  if (CARGO_PREFIXES.includes(prefix)) return 'cargo'
  if (type && AIRLINER_TYPES.has(type.toUpperCase())) return 'commercial'
  if ((ac.gs ?? 0) >= 260) return 'commercial'
  return 'general'
}
