/**
 * Domain types shared by every part of FrameFR.
 *
 * The app never talks to a concrete ADS-B endpoint: it only knows about the
 * `Aircraft` shape and the `AircraftProvider` contract defined here. Adding a
 * new feed (OpenSky, ADS-B Exchange, a local dump1090...) means writing a new
 * provider module and registering it in `src/data/registry.ts`.
 */

import type { SilhouetteId } from './aircraftTypes'

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

/**
 * Route information.
 *
 * Simulated providers fill the full `Airport` objects; live feeds usually only
 * know the IATA codes and the city names, so both shapes are supported.
 */
export interface FlightRoute {
  origin?: string
  originCity?: string
  destination?: string
  destinationCity?: string
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

  /* ------------------------------------------- live feed extras (AeroScope) */
  /** Commercial flight number with the IATA prefix (e.g. `LH419`). */
  flightNumber?: string
  /** Marketing airline name resolved from the callsign prefix. */
  airlineName?: string
  /** Full aircraft model, e.g. `Airbus A340-600`. */
  fullModel?: string
  /** Route as reported by the feed (IATA codes + city names). */
  route?: FlightRoute
  /** Silhouette family used to draw the icon on the map. */
  silhouette?: SilhouetteId
  /** Receiver signal strength in dB, when the feed reports it. */
  rssi?: number
  /** Seconds since the last position report, when the feed reports it. */
  seen?: number
  /** Emergency squawk/flag reported by the feed. */
  emergency?: string
  /** Identifier of the feed that produced this observation. */
  sourceId?: string
  /** Internal id of the zone in the Flightradar24 feed (needed for the trail). */
  zoneId?: string
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
   * Name of the network that answered the last poll, when the provider talks
   * to more than one feed (the "auto" mode).
   */
  readonly activeSource?: string

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
