import { pick, randInt, randRange, createRng } from '@/lib/rng'
import { AIRPORTS, weightedAirport } from '../airports'
import {
  AIRLINES,
  GA_TYPES,
  MILITARY,
  REG_PREFIX_BY_REGION,
  regionOf,
  type Airline,
} from '../airlines'
import {
  bearingDeg,
  clamp,
  distanceNm,
  expandBounds,
  inBounds,
  interpolateGreatCircle,
  lerp,
  lerpAngle,
} from '../geo'
import type { Aircraft, AircraftCategory, AircraftProvider, Airport, Viewport } from '../types'

/** Mutable state of a simulated flight. */
interface SimFlight {
  id: string
  callsign: string
  operator: string
  type: string
  registration?: string
  category: AircraftCategory
  origin: Airport
  destination: Airport
  routeNm: number
  cruiseAlt: number
  cruiseSpeed: number
  /** Nautical miles already flown; negative means "still at the gate". */
  travelledNm: number
  holdMs: number
  wobble: number
  squawk: string
  lat: number
  lon: number
  altitude: number
  groundSpeed: number
  verticalRate: number
  heading: number
  onGround: boolean
}

export interface DemoProviderOptions {
  fleetSize?: number
  seed?: number
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

/** Deterministic pseudo elevation (ft) so climbs start from a plausible field. */
function fieldElevation(airport: Airport): number {
  let h = 0
  for (let i = 0; i < airport.icao.length; i++) h = (h * 31 + airport.icao.charCodeAt(i)) % 2600
  return h
}

function registration(rng: () => number, prefix: string): string {
  const letters = (n: number) =>
    Array.from({ length: n }, () => LETTERS[Math.floor(rng() * LETTERS.length)]).join('')
  if (prefix === 'N') return `N${randInt(rng, 100, 9899)}${letters(rng() < 0.5 ? 1 : 2)}`
  if (prefix === 'JA') return `JA${randInt(rng, 1000, 8999)}${rng() < 0.5 ? letters(1) : ''}`
  if (prefix === 'HL') return `HL${randInt(rng, 7000, 8999)}`
  return `${prefix}${letters(3)}`
}

function icao24(rng: () => number): string {
  return Math.floor(rng() * 0xffffff)
    .toString(16)
    .padStart(6, '0')
}

function pickCategory(rng: () => number): AircraftCategory {
  const r = rng()
  if (r < 0.72) return 'commercial'
  if (r < 0.82) return 'cargo'
  if (r < 0.95) return 'general'
  return 'military'
}

/** Distance band used to keep route lengths believable. */
function bandOf(distance: number): 'short' | 'medium' | 'long' {
  if (distance < 800) return 'short'
  if (distance < 2500) return 'medium'
  return 'long'
}

/**
 * Simulated ADS-B feed.
 *
 * Generates a fleet of flights following great-circle routes between real
 * airports, with a climb / cruise / descent profile, and moves them forward on
 * every `advance()` call. It implements the same `AircraftProvider` contract as
 * the live feeds, so the rest of the app cannot tell the difference.
 */
export class DemoProvider implements AircraftProvider {
  readonly id = 'demo'
  readonly label = 'Demo'
  readonly description = 'Flota simulada con rutas reales. Ideal para probar la app sin conexión.'
  readonly mode = 'simulated' as const
  readonly pollIntervalMs = 1000
  readonly attribution = 'Datos de demostración generados localmente'

  private flights: SimFlight[] = []
  private rng: () => number
  private fleetSize: number
  /** Elapsed time not yet applied to the fleet (see `advance`). */
  private accumulatorMs = 0

  constructor(options: DemoProviderOptions = {}) {
    this.fleetSize = options.fleetSize ?? 600
    this.rng = createRng(options.seed)
    this.reset(this.fleetSize)
  }

  /** Rebuild the fleet with `size` aircraft (keeps the existing ones). */
  configure(options: { fleetSize?: number }): void {
    if (typeof options.fleetSize === 'number' && options.fleetSize !== this.fleetSize) {
      this.reset(clamp(Math.round(options.fleetSize), 10, 4000))
    }
  }

  private reset(size: number): void {
    this.fleetSize = size
    if (this.flights.length > size) {
      this.flights.length = size
      return
    }
    while (this.flights.length < size) {
      this.flights.push(this.createFlight())
    }
  }

  private pickRoute(): { origin: Airport; destination: Airport } {
    const origin = weightedAirport(this.rng)
    const roll = this.rng()
    const wanted: 'short' | 'medium' | 'long' = roll < 0.46 ? 'short' : roll < 0.8 ? 'medium' : 'long'
    const candidates = AIRPORTS.filter(
      (a) => a.icao !== origin.icao && bandOf(distanceNm(origin, a)) === wanted,
    )
    if (candidates.length === 0) {
      let destination = weightedAirport(this.rng)
      let guard = 0
      while (destination.icao === origin.icao && guard++ < 12) destination = weightedAirport(this.rng)
      return { origin, destination }
    }
    return { origin, destination: pick(this.rng, candidates) }
  }

  private createFlight(): SimFlight {
    const rng = this.rng
    const category = pickCategory(rng)
    const { origin, destination } = this.pickRoute()
    const routeNm = Math.max(40, distanceNm(origin, destination))

    let airline: Airline | null = null
    let callsign: string
    let type: string
    let operator: string
    let reg: string | undefined
    let cruiseAlt: number
    let cruiseSpeed: number

    if (category === 'military') {
      callsign = `${pick(rng, MILITARY.prefixes)}${randInt(rng, 10, 99)}`
      type = pick(rng, MILITARY.types)
      operator = 'Fuerzas aéreas'
      cruiseAlt = clamp(randRange(rng, 24000, 38000), 20000, 42000)
      cruiseSpeed = randRange(rng, 380, 500)
    } else if (category === 'general') {
      reg = registration(rng, pick(rng, REG_PREFIX_BY_REGION[regionOf(origin.country)]))
      callsign = reg
      type = pick(rng, GA_TYPES)
      operator = 'Aviación general'
      cruiseAlt = randRange(rng, 4500, 16000)
      cruiseSpeed = randRange(rng, 120, 260)
    } else {
      // Prefer an operator based in the same region as the origin airport so
      // the generated routes look plausible.
      const region = regionOf(origin.country)
      const local = AIRLINES.filter((a) => a.category === category && a.region === region)
      const global = AIRLINES.filter((a) => a.category === category)
      const pool = local.length > 0 && rng() < 0.8 ? local : global
      airline = pick(rng, pool.length > 0 ? pool : AIRLINES)
      const number = randInt(rng, 100, 9899)
      const suffix = rng() < 0.12 ? LETTERS[Math.floor(rng() * LETTERS.length)] : ''
      callsign = `${airline.code}${number}${suffix}`
      type = pick(rng, airline.types)
      operator = airline.name
      reg = registration(rng, airline.reg)
      const [low, high] = airline.cruise
      const longHaul = routeNm > 2500 ? 2000 : routeNm > 800 ? 500 : -1500
      cruiseAlt = clamp(randRange(rng, low, high) + longHaul, 21000, 43000)
      cruiseSpeed = randRange(rng, 420, 500)
    }

    const flight: SimFlight = {
      id: icao24(rng),
      callsign,
      operator,
      type,
      registration: reg,
      category,
      origin,
      destination,
      routeNm,
      cruiseAlt: Math.round(cruiseAlt / 500) * 500,
      cruiseSpeed: Math.round(cruiseSpeed),
      travelledNm: 0,
      holdMs: 0,
      wobble: rng() * Math.PI * 2,
      squawk: String(randInt(rng, 1000, 7677)),
      lat: origin.lat,
      lon: origin.lon,
      altitude: fieldElevation(origin),
      groundSpeed: 0,
      verticalRate: 0,
      heading: bearingDeg(origin, destination),
      onGround: true,
    }

    // Spread the fleet along their routes on creation.
    flight.travelledNm = rng() * routeNm
    this.applyProfile(flight, 1000)
    flight.heading = bearingDeg(origin, destination)
    return flight
  }

  /** Altitude / speed model for the current position of the flight. */
  private profile(f: SimFlight): { alt: number; gs: number; onGround: boolean } {
    const elevO = fieldElevation(f.origin)
    const elevD = fieldElevation(f.destination)
    const d = f.travelledNm
    const r = f.routeNm

    if (d <= 0) return { alt: elevO, gs: 0, onGround: true }
    if (d >= r) return { alt: elevD, gs: 0, onGround: true }

    const climbNm = Math.min(r * 0.2, 110)
    const descentNm = Math.min(r * 0.22, 130)
    const cruiseNm = Math.max(1, r - climbNm - descentNm)

    if (d < climbNm) {
      const t = d / climbNm
      const alt = lerp(elevO + 300, f.cruiseAlt, Math.pow(t, 0.7))
      return { alt, gs: lerp(210, f.cruiseSpeed * 0.88, t), onGround: d < 1.5 }
    }
    if (d < climbNm + cruiseNm) {
      const wobble = Math.sin(d * 0.05 + f.wobble) * 125
      return { alt: f.cruiseAlt + wobble, gs: f.cruiseSpeed, onGround: false }
    }
    const t = clamp((d - climbNm - cruiseNm) / descentNm, 0, 1)
    const alt = lerp(f.cruiseAlt, elevD + 300, Math.pow(t, 1.35))
    return { alt, gs: lerp(f.cruiseSpeed * 0.92, 165, t), onGround: d > r - 1.2 }
  }

  /** Move one flight forward and refresh its derived values. */
  private applyProfile(f: SimFlight, dtMs: number): void {
    const hours = dtMs / 3_600_000
    const prev = { lat: f.lat, lon: f.lon }
    const prevAlt = f.altitude

    const p = this.profile(f)
    if (f.holdMs > 0) {
      f.holdMs -= dtMs
    } else {
      f.travelledNm = Math.min(f.routeNm, f.travelledNm + p.gs * hours)
    }

    const frac = clamp(f.travelledNm / f.routeNm, 0, 1)
    const pos = interpolateGreatCircle(f.origin, f.destination, frac)
    f.lat = pos.lat
    f.lon = pos.lon
    f.altitude = Math.max(0, p.alt)
    f.onGround = p.onGround
    f.groundSpeed = p.onGround ? 0 : p.gs

    const moved = distanceNm(prev, { lat: f.lat, lon: f.lon })
    if (!p.onGround && moved > 1e-5 && hours > 0) {
      const raw = bearingDeg(prev, { lat: f.lat, lon: f.lon })
      // Frame-rate independent turn: 0.3 per 16 ms frame ≈ τ 60 ms.
      f.heading = lerpAngle(f.heading, raw, 1 - Math.exp(-dtMs / 60))
    }

    const minutes = dtMs / 60_000
    const rawVs = minutes > 0 ? (f.altitude - prevAlt) / minutes : 0
    f.verticalRate = clamp(rawVs, -4500, 4500)

    // Recycle the flight once it reaches the gate: new route, short turnaround.
    if (f.travelledNm >= f.routeNm) {
      const recycled = this.createFlight()
      recycled.id = f.id
      recycled.travelledNm = 0
      recycled.holdMs = randRange(this.rng, 15_000, 180_000)
      Object.assign(f, recycled)
    }
  }

  /** Advance the simulation clock (called by the engine every frame). */
  advance(deltaMs: number): void {
    if (deltaMs <= 0) return
    // The model is parametric, so it does not need one step per animation
    // frame: accumulating to 20 Hz cuts the trigonometry of the whole fleet
    // by ~3× on every device (positions are only published on poll anyway).
    this.accumulatorMs += deltaMs
    if (this.accumulatorMs < 50) return
    const elapsed = this.accumulatorMs
    this.accumulatorMs = 0
    // Sub-step so long frames (background tabs, slow devices) stay stable.
    const steps = clamp(Math.ceil(elapsed / 2000), 1, 8)
    const dt = elapsed / steps
    for (let s = 0; s < steps; s++) {
      for (const f of this.flights) this.applyProfile(f, dt)
    }
  }

  async poll(viewport: Viewport): Promise<Aircraft[]> {
    const box = expandBounds(viewport.bounds, 0.12, 1)
    const now = Date.now()
    const out: Aircraft[] = []
    for (const f of this.flights) {
      if (!inBounds(f.lat, f.lon, box)) continue
      out.push({
        id: f.id,
        callsign: f.callsign,
        operator: f.operator,
        type: f.type,
        registration: f.registration,
        category: f.category,
        origin: f.origin,
        destination: f.destination,
        lat: f.lat,
        lon: f.lon,
        altitude: Math.round(f.altitude),
        groundSpeed: Math.round(f.groundSpeed),
        verticalRate: Math.round(f.verticalRate / 50) * 50,
        heading: f.heading,
        onGround: f.onGround,
        squawk: f.squawk,
        observedAt: now,
        progress: clamp(f.travelledNm / f.routeNm, 0, 1),
      })
    }
    return out
  }

  dispose(): void {
    this.flights = []
  }
}
