import { TRAIL_LENGTH, UI_INTERVAL_MS, MAX_LIST_ROWS } from '@/config'
import { clamp, distanceNm } from '@/data/geo'
import { createProvider, type ProviderId } from '@/data/registry'
import type {
  Aircraft,
  AircraftCategory,
  AircraftProvider,
  ProviderStatus,
  Viewport,
} from '@/data/types'
import {
  AIRCRAFT_SOURCE,
  EMPTY_FC,
  TRAIL_SOURCE,
  type AircraftFeature,
  type TrailFeature,
} from '@/map/aircraftLayers'
import { aircraftIconId } from '@/map/aircraftIcons'
import { bandKey } from '@/map/palette'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'

export interface FleetFilters {
  /** Free text matched against callsign, operator, registration, type or hex. */
  query: string
  /** Categories to display; an empty array means "all". */
  categories: readonly AircraftCategory[]
  airborneOnly: boolean
}

export const ALL_CATEGORIES: readonly AircraftCategory[] = ['commercial', 'cargo', 'general', 'military']

export const DEFAULT_FILTERS: FleetFilters = {
  query: '',
  categories: ALL_CATEGORIES,
  airborneOnly: false,
}

export interface RenderAircraft extends Aircraft {
  /** Distance from the current map centre, in nautical miles. */
  distanceNm: number
  band: string
  selected: boolean
}

export interface FleetStats {
  total: number
  filtered: number
  airborne: number
  onGround: number
  maxAltitude: number
  avgAltitude: number
}

export interface FleetSnapshot {
  /** Nearest aircraft first, already filtered and capped for rendering. */
  aircraft: RenderAircraft[]
  /** Selected aircraft, kept even when it falls outside the current filters. */
  selected: RenderAircraft | null
  stats: FleetStats
  status: ProviderStatus
  providerId: ProviderId
  updatedAt: number
  selectedId: string | null
  follow: boolean
}

export interface FleetControllerOptions {
  map: MapLibreMap
  providerId: ProviderId
  fleetSize: number
  filters?: FleetFilters
  onFollowChange?: (follow: boolean) => void
}

interface Pos {
  lat: number
  lon: number
  alt: number
  heading: number
}

interface Track {
  ac: Aircraft
  /** Exact coordinates of the newest accepted observation. Never synthesized. */
  reported: Pos
  /** Upper-cased search corpus, rebuilt on every ingest. */
  hay: string
  /** `performance.now()` of the last poll that reported this track. */
  lastSeenAt: number
  /** Trail history as [lon, lat] pairs (only filled for the selection). */
  history: Array<[number, number]>
  /** Altitude of every point of the trail, in feet (parallel to `history`). */
  altitudes: number[]
  /**
   * Historical trajectory injected by the UI (Flightradar24 / OpenSky).
   * When present it replaces the live trail, because it covers the whole
   * flight instead of only the last few minutes.
   */
  externalTrail: Array<{ lon: number; lat: number; altitude: number }> | null
}

export const EMPTY_SNAPSHOT: FleetSnapshot = {
  aircraft: [],
  selected: null,
  stats: { total: 0, filtered: 0, airborne: 0, onGround: 0, maxAltitude: 0, avgAltitude: 0 },
  status: { state: 'loading' },
  providerId: 'demo',
  updatedAt: 0,
  selectedId: null,
  follow: false,
}

/**
 * Owns the animation loop and the state of every track.
 *
 * Responsibilities:
 *  - advance simulated providers and poll live ones at their own cadence,
 *  - render the newest reported position only (no dead reckoning),
 *  - push a GeoJSON snapshot to MapLibre only when a report changes it,
 *    React (~2 fps), so the UI never re-renders at animation speed.
 */
export class FleetController {
  private readonly map: MapLibreMap
  private readonly listeners = new Set<() => void>()
  private readonly onFollowChange?: (follow: boolean) => void

  private provider: AircraftProvider
  private providerId: ProviderId
  private fleetSize: number

  private tracks = new Map<string, Track>()
  private filters: FleetFilters = DEFAULT_FILTERS
  private normalizedQuery = ''

  private raf = 0
  private lastFrame = 0
  private lastPollAt = 0
  private renderDirty = true
  private lastUiAt = 0
  private pollDelay = 1000
  /** Effective poll cadence of the active provider. */
  private pollIntervalMs = 0
  /** Cadence chosen by the user; `null` means "follow the provider". */
  private pollIntervalOverride: number | null = null
  private polling = false
  private abort: AbortController | null = null
  private pendingSource: GeoJSONSource | null = null
  private queuedAircraftData: { type: 'FeatureCollection'; features: AircraftFeature[] } | null = null
  private trailHadData = false

  private selectedId: string | null = null
  private follow = false
  private maxAircraft = Number.POSITIVE_INFINITY
  private speedFactor = 1

  private status: ProviderStatus = { state: 'loading' }
  private snapshot: FleetSnapshot = EMPTY_SNAPSHOT

  constructor(options: FleetControllerOptions) {
    this.map = options.map
    this.providerId = options.providerId
    this.fleetSize = options.fleetSize
    this.onFollowChange = options.onFollowChange
    if (options.filters) this.setFilters(options.filters)
    this.provider = createProvider(options.providerId, { fleetSize: options.fleetSize })
    this.pollIntervalMs = this.provider.pollIntervalMs
    this.pollDelay = this.provider.pollIntervalMs
  }

  /* ---------------------------------------------------------------- public */

  /** Rehydrate a replacement style immediately, without waiting for a feed poll. */
  restoreStyle(): void {
    this.pendingSource = null
    this.queuedAircraftData = null
    this.trailHadData = false
    this.renderDirty = false
    this.pushData()
  }

  start(): void {
    this.lastFrame = performance.now()
    this.raf = requestAnimationFrame(this.loop)
    this.map.on('dragstart', this.handleUserDrag)
    void this.poll()
  }

  destroy(): void {
    cancelAnimationFrame(this.raf)
    this.map.off('dragstart', this.handleUserDrag)
    this.abort?.abort()
    this.provider.dispose?.()
    this.tracks.clear()
    this.listeners.clear()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): FleetSnapshot => this.snapshot

  getProviderId = (): ProviderId => this.providerId

  setFilters(filters: FleetFilters): void {
    this.filters = filters
    this.normalizedQuery = filters.query.trim().toUpperCase()
    this.renderDirty = true
    this.lastUiAt = 0
  }

  setSelected(id: string | null): void {
    if (this.selectedId === id) return
    const previous = this.selectedId ? this.tracks.get(this.selectedId) : undefined
    if (previous) {
      previous.history = []
      previous.altitudes = []
      previous.externalTrail = null
    }
    this.selectedId = id
    const next = id ? this.tracks.get(id) : undefined
    if (next) {
      next.history = []
      next.altitudes = []
      next.externalTrail = null
    }
    this.renderDirty = true
    this.lastUiAt = 0
  }

  setFollow(follow: boolean): void {
    this.follow = follow
    this.lastUiAt = 0
    if (follow) this.renderDirty = true
  }

  /** Maximum number of aircraft rendered on the map. */
  setMaxAircraft(max: number): void {
    this.maxAircraft = max > 0 ? max : Number.POSITIVE_INFINITY
    this.renderDirty = true
    this.lastUiAt = 0
  }

  setSpeedFactor(factor: number): void {
    this.speedFactor = clamp(factor, 0.25, 20)
  }

  setFleetSize(size: number): void {
    this.fleetSize = size
    this.provider.configure?.({ fleetSize: size })
  }

  /** Swap the data source at runtime (demo ⇄ adsb.lol). */
  /** Forces an immediate poll of the active provider. */
  refresh(): void {
    this.lastPollAt = 0
    void this.poll()
  }

  setProvider(id: ProviderId): void {
    if (id === this.providerId) return
    this.abort?.abort()
    this.provider.dispose?.()
    this.providerId = id
    this.provider = createProvider(id, { fleetSize: this.fleetSize })
    this.provider.configure?.({ fleetSize: this.fleetSize })
    this.pollIntervalMs = this.provider.mode === 'simulated' ? this.provider.pollIntervalMs : this.pollIntervalOverride ?? this.provider.pollIntervalMs
    this.pollDelay = this.pollIntervalMs
    this.tracks.clear()
    this.selectedId = null
    this.status = { state: 'loading' }
    this.lastPollAt = 0
    this.renderDirty = false
    this.lastUiAt = 0
    this.pushData()
    void this.poll()
  }

  /** Smoothly centre the camera on a track. */
  centerOn(id: string): void {
    const track = this.tracks.get(id)
    if (!track) return
    this.map.flyTo({
      center: [track.reported.lon, track.reported.lat],
      duration: 1100,
      essential: true,
    })
  }

  /** Look up the live state of a track (used by the follow camera). */
  positionOf(id: string): { lat: number; lon: number } | undefined {
    const track = this.tracks.get(id)
    if (!track) return undefined
    return { lat: track.reported.lat, lon: track.reported.lon }
  }

  /**
   * Injects a historical trajectory for a track.
   *
   * Live feeds only report the current position, so the trail drawn behind the
   * selected aircraft is rebuilt from the Flightradar24 detail payload or from
   * the OpenSky track history. When such a trail is available it replaces the
   * "live" accumulation, which only covers the last few minutes.
   */
  setExternalTrail(id: string, points: Array<{ lon: number; lat: number; altitude: number }>): void {
    const track = this.tracks.get(id)
    if (!track || points.length < 2) return
    track.externalTrail = points
    this.renderDirty = true
    this.lastUiAt = 0
  }

  /**
   * Injects an observation that did not come from the feed.
   *
   * The planet-wide search finds aircraft anywhere on the planet; when the
   * user picks one of them, it has to appear on the map even if the active
   * feed does not cover that area.
   */
  upsertAircraft(aircraft: Aircraft): void {
    const now = performance.now()
    const existing = this.tracks.get(aircraft.id)
    const reported: Pos = {
      lat: aircraft.lat,
      lon: aircraft.lon,
      alt: aircraft.altitude,
      heading: aircraft.heading,
    }
    if (existing) {
      if (isStaleObservation(existing.ac.observedAt, aircraft.observedAt)) return
      if (
        !samePos(existing.reported, reported) ||
        existing.ac.silhouette !== aircraft.silhouette ||
        existing.ac.onGround !== aircraft.onGround ||
        (existing.ac.flightNumber || existing.ac.callsign) !== (aircraft.flightNumber || aircraft.callsign)
      ) this.renderDirty = true
      existing.reported = reported
      existing.ac = aircraft
      existing.hay = searchCorpus(aircraft)
      existing.lastSeenAt = now
    } else {
      this.tracks.set(aircraft.id, {
        ac: aircraft,
        reported,
        hay: searchCorpus(aircraft),
        lastSeenAt: now,
        history: [],
        altitudes: [],
        externalTrail: null,
      })
      this.renderDirty = true
    }
    this.lastUiAt = 0
  }

  /** Altitudes of the trail currently drawn for a track. */
  trailAltitudes(id: string): number[] {
    const track = this.tracks.get(id)
    if (!track) return []
    if (track.externalTrail && track.externalTrail.length > 1) {
      return track.externalTrail.map((point) => point.altitude)
    }
    return [...track.altitudes]
  }

  /** Removes the historical trajectory of a track. */
  clearExternalTrail(id: string): void {
    const track = this.tracks.get(id)
    if (!track) return
    track.externalTrail = null
    track.history = []
    track.altitudes = []
    this.renderDirty = true
    this.lastUiAt = 0
  }

  /** Overrides the polling cadence of the active provider. */
  setPollInterval(ms: number): void {
    this.pollIntervalOverride = clamp(ms, 2_000, 60_000)
    // A simulator can report its actual generated position every second;
    // stretching that poll only adds larger steps, never smoother motion.
    this.pollIntervalMs = this.provider.mode === 'simulated' ? this.provider.pollIntervalMs : this.pollIntervalOverride
    this.pollDelay = this.pollIntervalMs
    this.lastPollAt = 0
  }

  /* --------------------------------------------------------------- private */

  private readonly handleUserDrag = (): void => {
    if (!this.follow) return
    this.follow = false
    this.onFollowChange?.(false)
  }

  private readonly loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(now - this.lastFrame, 1000)
    this.lastFrame = now

    this.provider.advance?.(dt * this.speedFactor)

    if (!this.polling && now - this.lastPollAt >= this.pollDelay) {
      void this.poll()
    }

    if (this.renderDirty) {
      this.renderDirty = false
      this.pushData()
      // Following recentres only when a new report (or follow itself) arrives.
      // No zoom is specified, so wheel/pinch zoom remains entirely the user's.
      if (this.follow && this.selectedId) {
        const track = this.tracks.get(this.selectedId)
        if (track) this.map.jumpTo({ center: [track.reported.lon, track.reported.lat] })
      }
    }

    if (now - this.lastUiAt >= UI_INTERVAL_MS) {
      this.lastUiAt = now
      this.publish()
    }
  }

  private readViewport(): Viewport {
    const bounds = this.map.getBounds()
    const center = this.map.getCenter()
    const ne = bounds.getNorthEast()
    return {
      center: { lat: center.lat, lon: center.lng },
      zoom: this.map.getZoom(),
      bounds: {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      },
      radiusNm: distanceNm({ lat: center.lat, lon: center.lng }, { lat: ne.lat, lon: ne.lng }),
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    this.lastPollAt = performance.now()
    this.abort = new AbortController()
    const started = performance.now()
    if (this.status.state !== 'live') {
      this.status = { ...this.status, state: 'loading' }
    }
    try {
      const list = await this.provider.poll(this.readViewport(), this.abort.signal)
      this.ingest(list, performance.now())
      const source = this.provider.activeSource
      const notice = this.provider.notice
      this.status = {
        state: 'live',
        lastUpdate: Date.now(),
        latencyMs: Math.round(performance.now() - started),
        message: [source, notice].filter(Boolean).join(' · ') || undefined,
      }
      this.pollDelay = this.pollIntervalMs
    } catch (error) {
      this.status = {
        state: 'error',
        message: error instanceof Error ? error.message : 'Error desconocido',
        lastUpdate: this.status.lastUpdate,
      }
      // Back off a little before retrying a failing feed.
      this.pollDelay = Math.max(this.pollIntervalMs, 15_000)
    } finally {
      this.polling = false
    }
  }

  private ingest(list: Aircraft[], now: number): void {
    const seen = new Set<string>()

    for (const ac of list) {
      seen.add(ac.id)
      const reported: Pos = { lat: ac.lat, lon: ac.lon, alt: ac.altitude, heading: ac.heading }
      const existing = this.tracks.get(ac.id)

      if (!existing) {
        this.tracks.set(ac.id, {
          ac,
          reported,
          hay: searchCorpus(ac),
          lastSeenAt: now,
          history: [],
          altitudes: [],
          externalTrail: null,
        })
        this.renderDirty = true
        continue
      }

      if (isStaleObservation(existing.ac.observedAt, ac.observedAt)) {
        existing.lastSeenAt = now
        continue
      }

      const positionChanged = !samePos(existing.reported, reported)
      const iconChanged = existing.ac.silhouette !== ac.silhouette || existing.ac.onGround !== ac.onGround
      const labelChanged = (existing.ac.flightNumber || existing.ac.callsign) !== (ac.flightNumber || ac.callsign)
      if (positionChanged || iconChanged || labelChanged) this.renderDirty = true
      existing.reported = reported
      existing.ac = ac
      existing.hay = searchCorpus(ac)
      existing.lastSeenAt = now

      if (ac.id === this.selectedId && positionChanged) {
        const last = existing.history.at(-1)
        if (!last || last[0] !== reported.lon || last[1] !== reported.lat) {
          existing.history.push([reported.lon, reported.lat])
          existing.altitudes.push(reported.alt)
          if (existing.history.length > TRAIL_LENGTH) {
            existing.history.shift()
            existing.altitudes.shift()
          }
        }
      }
    }

    // Forget tracks that are gone: immediately for simulated fleets, after a
    // grace period for live feeds (temporary coverage gaps are common).
    const graceMs = this.provider.mode === 'simulated' ? 2500 : 90_000
    for (const [id, track] of this.tracks) {
      if (seen.has(id)) continue
      if (now - track.lastSeenAt > graceMs) {
        this.tracks.delete(id)
        this.renderDirty = true
        if (this.selectedId === id) this.selectedId = null
      }
    }
  }

  private matches(track: Track): boolean {
    const ac = track.ac
    if (this.filters.airborneOnly && ac.onGround) return false
    if (this.filters.categories.length > 0 && !this.filters.categories.includes(ac.category)) return false
    if (this.normalizedQuery && !track.hay.includes(this.normalizedQuery)) return false
    return true
  }

  /** Build the GeoJSON pushed to MapLibre and refresh the selection trail. */
  private pushData(): void {
    const features: AircraftFeature[] = []
    for (const [id, track] of this.tracks) {
      if (features.length >= this.maxAircraft) break
      const selected = id === this.selectedId
      if (!selected && !this.matches(track)) continue
      const altitude = Math.round(track.reported.alt)
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [track.reported.lon, track.reported.lat] },
        properties: {
          id,
          callsign: track.ac.callsign,
          heading: track.reported.heading,
          altitude,
          icon: aircraftIconId(track.ac.silhouette, track.ac.onGround, selected),
          selected: selected ? 1 : 0,
          label: track.ac.flightNumber || track.ac.callsign,
        },
      })
    }

    const source = this.map.getSource(AIRCRAFT_SOURCE) as GeoJSONSource | undefined
    if (source) {
      const collection = { type: 'FeatureCollection' as const, features }
      if (this.pendingSource === source) {
        // Keep only the newest queued snapshot; stale intermediate frames
        // would otherwise land later and make icons jump backwards.
        this.queuedAircraftData = collection
      } else {
        this.flushAircraftData(source, collection)
      }
    }

    // Trail of the selected aircraft (only pushed when it actually changes).
    const trailSource = this.map.getSource(TRAIL_SOURCE) as GeoJSONSource | undefined
    if (trailSource) {
      const track = this.selectedId ? this.tracks.get(this.selectedId) : undefined
      const line: TrailFeature | null = this.buildTrailLine(track)
      if (line || this.trailHadData) {
        this.trailHadData = Boolean(line)
        trailSource
          .setData(line ? { type: 'FeatureCollection', features: [line] } : EMPTY_FC)
          .catch(() => undefined)
      }
    }
  }

  private flushAircraftData(
    source: GeoJSONSource,
    collection: { type: 'FeatureCollection'; features: AircraftFeature[] },
  ): void {
    this.pendingSource = source
    void Promise.resolve(source.setData(collection))
      .catch(() => undefined)
      .finally(() => {
        if (this.pendingSource !== source) return
        this.pendingSource = null
        const queued = this.queuedAircraftData
        this.queuedAircraftData = null
        if (queued) this.flushAircraftData(source, queued)
      })
  }

  /**
   * Builds the GeoJSON line of the selected aircraft.
   *
   * The historical trajectory (when it could be downloaded) wins over the live
   * accumulation, because it covers the whole flight and not only the last
   * couple of minutes.
   */
  private buildTrailLine(track: Track | undefined): TrailFeature | null {
    if (!track) return null

    if (track.externalTrail && track.externalTrail.length > 1) {
      const coordinates: Array<[number, number]> = track.externalTrail.map((point) => [
        point.lon,
        point.lat,
      ])
      coordinates.push([track.reported.lon, track.reported.lat])
      return { type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} }
    }

    if (track.history.length > 1) {
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [...track.history, [track.reported.lon, track.reported.lat]],
        },
        properties: {},
      }
    }

    return null
  }

  /** Recompute the React-visible snapshot and notify subscribers. */
  private publish(): void {
    const center = this.map.getCenter()
    const centerLatLon = { lat: center.lat, lon: center.lng }
    const list: RenderAircraft[] = []
    let selectedEntry: RenderAircraft | null = null
    let airborne = 0
    let onGround = 0
    let maxAltitude = 0
    let sumAltitude = 0

    for (const [id, track] of this.tracks) {
      const altitude = Math.round(track.reported.alt)
      if (track.ac.onGround) {
        onGround++
      } else {
        airborne++
        sumAltitude += altitude
        if (altitude > maxAltitude) maxAltitude = altitude
      }
      if (!this.matches(track) && id !== this.selectedId) continue
      const entry: RenderAircraft = {
        ...track.ac,
        lat: track.reported.lat,
        lon: track.reported.lon,
        altitude,
        heading: track.reported.heading,
        distanceNm: distanceNm(centerLatLon, { lat: track.reported.lat, lon: track.reported.lon }),
        band: bandKey(altitude, track.ac.onGround),
        selected: id === this.selectedId,
      }
      if (id === this.selectedId) selectedEntry = entry
      if (this.matches(track)) list.push(entry)
    }

    list.sort((a, b) => a.distanceNm - b.distanceNm)

    this.snapshot = {
      aircraft: list.slice(0, MAX_LIST_ROWS),
      selected: selectedEntry,
      stats: {
        total: this.tracks.size,
        filtered: list.length,
        airborne,
        onGround,
        maxAltitude,
        avgAltitude: airborne > 0 ? Math.round(sumAltitude / airborne) : 0,
      },
      status: this.status,
      providerId: this.providerId,
      updatedAt: Date.now(),
      selectedId: this.selectedId,
      follow: this.follow,
    }
    for (const listener of this.listeners) listener()
  }
}

function samePos(a: Pos, b: Pos): boolean {
  return a.lat === b.lat && a.lon === b.lon && a.alt === b.alt && a.heading === b.heading
}

/** Epoch timestamps carried by each observation define the only valid order. */
function isStaleObservation(current: number, incoming: number): boolean {
  return Number.isFinite(current) && Number.isFinite(incoming) && current > 0 && incoming > 0 && incoming < current
}

function searchCorpus(ac: Aircraft): string {
  return [
    ac.callsign,
    ac.flightNumber ?? '',
    ac.airlineName ?? '',
    ac.operator ?? '',
    ac.registration ?? '',
    ac.type ?? '',
    ac.fullModel ?? '',
    ac.id,
    ac.origin?.iata ?? '',
    ac.origin?.icao ?? '',
    ac.destination?.iata ?? '',
    ac.destination?.icao ?? '',
    ac.route?.origin ?? '',
    ac.route?.destination ?? '',
    ac.route?.originCity ?? '',
    ac.route?.destinationCity ?? '',
  ]
    .join(' ')
    .toUpperCase()
}
