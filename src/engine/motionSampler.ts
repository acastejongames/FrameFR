/**
 * Smooth, evidence-based motion reconstruction for the 3D viewer.
 *
 * The map must keep drawing only reported coordinates; the 3D view, in
 * contrast, renders continuous motion. This module turns the discrete
 * telemetry reports into a smooth track without inventing long-range paths:
 * between two reports the state is a plain interpolation of the evidence, and
 * past the newest report the motion dead-reckons with the reported velocity
 * but decays to a stop within a couple of seconds, so an outage never sends
 * the model flying off along a fabricated route.
 */

export interface MotionSample {
  /** Arrival time of the report, in the caller's monotonic ms clock. */
  t: number
  lat: number
  lon: number
  /** Altitude above the map plane, meters. */
  altM: number
  /** Compass heading, degrees (0 = north). */
  headingDeg: number
  /** Ground speed, m/s. */
  speedMs: number
  /** Vertical speed, m/s (positive = climbing). */
  vsMs: number
  onGround: boolean
}

export interface MotionState {
  lat: number
  lon: number
  altM: number
  headingDeg: number
  onGround: boolean
}

/** Meters per degree of latitude (good enough at flight scales). */
export const EARTH_M_PER_DEG = 111_320

/** Exponential smoothing time of the rendered state, seconds. */
const SMOOTH_TAU_S = 0.25
/** Dead-reckoning decay time past the newest report, seconds. */
const DR_TAU_S = 2
/** Reports further apart than this do not define a usable velocity. */
const MAX_PAIR_MS = 30_000
/** Turn-rate cap, deg/s (a bit above a standard-rate turn). */
const MAX_TURN_DEG_S = 5
/** A jump faster than this is a teleport (demo recycle, feed glitch). */
const TELEPORT_SPEED_MS = 400
/** A climb faster than this is a teleport, m/s. */
const TELEPORT_CLIMB_MS = 50

/** Signed shortest arc from `a` to `b` in degrees, within ±180. */
export function shortestArcDeg(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180
}

/**
 * Motion state implied by the evidence at render time `t` (same clock as
 * `MotionSample.t`, already lagged by the caller).
 *
 * - Between `prev` and `last`: linear interpolation (heading takes the
 *   shortest arc, so 350° → 10° passes through north).
 * - Past `last`: dead reckoning with the velocity of the pair (or the
 *   reported speed/vector as fallback), decaying to zero within
 *   `DR_TAU_S` seconds.
 */
export function motionTarget(prev: MotionSample | null, last: MotionSample, t: number): MotionState {
  if (prev && t <= prev.t) {
    return {
      lat: prev.lat,
      lon: prev.lon,
      altM: prev.altM,
      headingDeg: prev.headingDeg,
      onGround: prev.onGround,
    }
  }
  if (prev && t < last.t) {
    const u = (t - prev.t) / (last.t - prev.t)
    return {
      lat: prev.lat + (last.lat - prev.lat) * u,
      lon: prev.lon + (last.lon - prev.lon) * u,
      altM: prev.altM + (last.altM - prev.altM) * u,
      headingDeg: prev.headingDeg + shortestArcDeg(prev.headingDeg, last.headingDeg) * u,
      onGround: u < 0.5 ? prev.onGround : last.onGround,
    }
  }

  // Past the newest report: bounded dead reckoning.
  const pairDtMs = prev ? last.t - prev.t : 0
  const usePair = prev !== null && pairDtMs > 200 && pairDtMs < MAX_PAIR_MS
  const dtPairS = usePair ? pairDtMs / 1000 : 1
  const headingRad = (last.headingDeg * Math.PI) / 180
  let vNorth: number
  let vEast: number
  if (usePair && prev) {
    vNorth = ((last.lat - prev.lat) * EARTH_M_PER_DEG) / dtPairS
    vEast =
      ((last.lon - prev.lon) * EARTH_M_PER_DEG * Math.cos((last.lat * Math.PI) / 180)) / dtPairS
  } else {
    vNorth = Math.cos(headingRad) * last.speedMs
    vEast = Math.sin(headingRad) * last.speedMs
  }
  const vs = usePair && prev ? (last.altM - prev.altM) / dtPairS : last.vsMs
  const turn =
    usePair && prev
      ? Math.max(-MAX_TURN_DEG_S, Math.min(MAX_TURN_DEG_S, shortestArcDeg(prev.headingDeg, last.headingDeg) / dtPairS))
      : 0

  const dtS = Math.max(0, (t - last.t) / 1000)
  const travelS = DR_TAU_S * (1 - Math.exp(-dtS / DR_TAU_S))
  return {
    lat: last.lat + (vNorth * travelS) / EARTH_M_PER_DEG,
    lon:
      last.lon +
      (vEast * travelS) / (EARTH_M_PER_DEG * Math.cos((last.lat * Math.PI) / 180)),
    altM: last.altM + vs * travelS,
    headingDeg: last.headingDeg + turn * travelS,
    onGround: last.onGround,
  }
}

/** Compares two observations field by field (reports are recreated objects). */
export function sameObservation(a: MotionSample, b: Omit<MotionSample, 't'>): boolean {
  return (
    a.lat === b.lat &&
    a.lon === b.lon &&
    a.altM === b.altM &&
    a.headingDeg === b.headingDeg &&
    a.speedMs === b.speedMs &&
    a.vsMs === b.vsMs &&
    a.onGround === b.onGround
  )
}

/**
 * Rolling tracker that answers "where is the aircraft now" with a smooth,
 * frame-rate independent filter on top of `motionTarget`.
 */
export class MotionSampler {
  private prev: MotionSample | null = null
  private last: MotionSample | null = null
  private rendered: MotionState | null = null
  private renderedAt = 0

  /** Feeds one report; ignored when stale or identical to the previous one. */
  push(sample: MotionSample): void {
    if (this.last && sample.t <= this.last.t) return
    if (this.last && sameObservation(this.last, sample)) return
    if (this.last) {
      const dtS = (sample.t - this.last.t) / 1000
      const dNorth = (sample.lat - this.last.lat) * EARTH_M_PER_DEG
      const dEast =
        (sample.lon - this.last.lon) *
        EARTH_M_PER_DEG *
        Math.cos((this.last.lat * Math.PI) / 180)
      const jumpSpeed = dtS > 0 ? Math.hypot(dNorth, dEast) / dtS : Number.POSITIVE_INFINITY
      const climb = dtS > 0 ? Math.abs(sample.altM - this.last.altM) / dtS : Number.POSITIVE_INFINITY
      if (jumpSpeed > TELEPORT_SPEED_MS || climb > TELEPORT_CLIMB_MS) {
        // The evidence discontinuity (recycled demo flight, feed glitch):
        // restart the track instead of smoothing a 500 km sweep.
        this.prev = null
        this.last = sample
        this.rendered = null
        return
      }
    }
    this.prev = this.last
    this.last = sample
  }

  /** Smoothed state at `t`, or null before the first report. */
  stateAt(t: number): MotionState | null {
    const last = this.last
    if (!last) return null
    const target = motionTarget(this.prev, last, t - this.lagMs())
    if (!this.rendered) {
      this.rendered = { ...target }
      this.renderedAt = t
      return { ...this.rendered }
    }
    const dtS = Math.min(Math.max((t - this.renderedAt) / 1000, 0), 0.5)
    this.renderedAt = t
    const k = 1 - Math.exp(-dtS / SMOOTH_TAU_S)
    const r = this.rendered
    r.lat += (target.lat - r.lat) * k
    r.lon += (target.lon - r.lon) * k
    r.altM += (target.altM - r.altM) * k
    r.headingDeg += shortestArcDeg(r.headingDeg, target.headingDeg) * k
    r.onGround = target.onGround
    return { ...r }
  }

  /** Render lag keeps the state inside the evidence window when reports are slow. */
  private lagMs(): number {
    if (!this.prev || !this.last) return 800
    return Math.min(Math.max((this.last.t - this.prev.t) * 0.6, 400), 2500)
  }
}
