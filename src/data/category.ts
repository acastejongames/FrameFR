/**
 * Classification of an aircraft into the four buckets shown in the UI.
 *
 * The ADS-B feeds give us different amounts of information, so the decision
 * tree goes from the most explicit signal to the least:
 *
 *  1. the feed flags the aircraft as military,
 *  2. the callsign prefix matches a known cargo operator,
 *  3. the ICAO type designator belongs to an airliner,
 *  4. the aircraft is fast enough to be a transport category.
 */

import type { AircraftCategory } from './types'

/** ICAO type designators we consider airliners. */
const AIRLINER_TYPES = new Set([
  'A220', 'A20N', 'A318', 'A319', 'A320', 'A321', 'A332', 'A333', 'A338', 'A339', 'A342', 'A343',
  'A345', 'A346', 'A359', 'A35K', 'A388', 'B37M', 'B38M', 'B39M', 'B737', 'B738', 'B739', 'B744',
  'B748', 'B752', 'B753', 'B762', 'B763', 'B764', 'B772', 'B77L', 'B77W', 'B788', 'B789', 'B78X',
  'E170', 'E175', 'E190', 'E195', 'E290', 'E295', 'CRJ2', 'CRJ7', 'CRJ9', 'CRJX', 'MD80', 'MD81',
  'MD82', 'MD83', 'MD88', 'MD11', 'BCS1', 'BCS3', 'A21N', 'A19N', 'A310', 'A306', 'AT76', 'AT75',
])

/** Callsign prefixes of well known cargo operators. */
const CARGO_PREFIXES = [
  'FDX', 'UPS', 'GTI', 'CLX', 'BOX', 'SQC', 'ABX', 'ATN', 'GEC', 'CKS', 'CPA', 'SIA', 'NCA', 'GTI',
]

export interface CategoryInput {
  /** Feed specific "military" flag, when available. */
  military?: boolean
  /** Callsign, e.g. `DLH419`. */
  callsign?: string
  /** ICAO type designator, e.g. `A320`. */
  type?: string
  /** Ground speed in knots. */
  groundSpeed?: number
}

/** Resolves the UI category of an aircraft. */
export function categoryOf(input: CategoryInput): AircraftCategory {
  if (input.military === true) return 'military'
  const prefix = (input.callsign ?? '').slice(0, 3).toUpperCase()
  if (CARGO_PREFIXES.includes(prefix)) return 'cargo'
  const type = (input.type ?? '').toUpperCase()
  if (type && AIRLINER_TYPES.has(type)) return 'commercial'
  if ((input.groundSpeed ?? 0) >= 260) return 'commercial'
  return 'general'
}
