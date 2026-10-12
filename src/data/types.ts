/**
 * Domain types shared by every part of FrameFR.
 *
 * The app never talks to a concrete ADS-B endpoint: it only knows about the
 * `Aircraft` shape and the `AircraftProvider` contract defined here. Adding a
 * new feed (OpenSky, ADS-B Exchange, a local dump1090...) means writing a new
 * provider module and registering it in `src/data/registry.ts`.
 */

/** High level aircraft grouping. */
export type AircraftCategory = 'commercial' | 'cargo' | 'general' | 'military'

/** `simulated` providers own a clock, `live` providers poll a remote feed. */
export type ProviderMode = 'simulated' | 'live'

export interface Airport {
  icao: string
  iata: string
  name: string
  city: string
  country: string
  lat: number
  lon: number
  /** Relative traffic weight used when generating demo routes. */
  weight?: number
}

/** A single aircraft observation. */
export interface Aircraft {
  /** Stable id, normally the ICAO 24-bit address (lowercase hex). */
  id: string
  /** Callsign or registration, already trimmed. */
  callsign: string
  operator?: string
  /** ICAO type designator (A320, B738, C172...). */
  type?: string
  registration?: string
  category: AircraftCategory
  origin?: Airport
  destination?: Airport
  lat: number
  lon: number
  /** Barometric altitude in feet; `0` when on the ground. */
  altitude: number
  /** Ground speed in knots. */
  groundSpeed: number
  /** Vertical rate in feet per minute (positive = climbing). */
  verticalRate: number
  /** True track in degrees. */
  heading: number
  onGround: boolean
  squawk?: string
  /** Epoch milliseconds reported by the provider for this observation. */
  observedAt: number
  /** Progress along the route, 0..1. Only filled by simulated providers. */
  progress?: number
}

/** Geographic area the map is currently showing. */
export interface Viewport {
  center: { lat: number; lon: number }
  zoom: number
  bounds: { west: number; south: number; east: number; north: number }
  /** Diagonal of the viewport in nautical miles. */
  radiusNm: number
}

/** Health of the active provider, surfaced in the UI. */
export interface ProviderStatus {
  state: 'idle' | 'loading' | 'live' | 'error'
  /** Human readable detail (last error, rate limit notice...). */
  message?: string
  /** Epoch ms of the last successful poll. */
  lastUpdate?: number
  /** Duration of the last successful poll in ms. */
  latencyMs?: number
}

/**
 * Contract every data source must fulfil.
 *
 * Providers are stateless from the app's point of view: `poll()` returns the
 * full list of aircraft relevant to the given viewport. Smoothing, dead
 * reckoning and rendering live in the engine (see `src/engine`), so a provider
 * only needs to answer *"what do you see right now?"*.
 */
export interface AircraftProvider {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly mode: ProviderMode
  /** Minimum delay between two polls, in ms. */
  readonly pollIntervalMs: number
  /** Attribution / credit line rendered in the status bar. */
  readonly attribution?: string
  /** Optional hint surfaced in the UI (e.g. "radius capped to 250 NM"). */
  readonly notice?: string

  /**
   * Optional: advance an internal simulation clock.
   * Only implemented by simulated providers; the engine calls it every frame
   * with the elapsed time already multiplied by the speed factor.
   */
  advance?(deltaMs: number): void

  /**
   * Optional: reconfigure the provider at runtime (fleet size for simulators,
   * region or credentials for live feeds).
   */
  configure?(options: { fleetSize?: number }): void

  /** Fetch the aircraft relevant to the current viewport. */
  poll(viewport: Viewport, signal?: AbortSignal): Promise<Aircraft[]>

  /** Release timers, sockets or caches. */
  dispose?(): void
}
