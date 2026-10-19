/**
 * Aircraft type dictionary and silhouette resolver.
 *
 * Two independent things live here:
 *
 *  1. `AIRCRAFT_TYPE_NAMES` — a readable name for every ICAO type designator
 *     we know about ("A346" → "Airbus A340-600"). Used by the detail panel and
 *     by the global search to resolve free-text queries such as "A340".
 *  2. `resolveSilhouette()` — maps a type designator to one of the eight
 *     silhouette families drawn on the map, so an A380 does not look like a
 *     Cessna.
 *
 * The resolver is intentionally regex based: the ADS-B feeds only report the
 * 4-character type designator, so the family has to be inferred from it.
 */

/** The eight silhouette families rendered on the map. */
export const SILHOUETTE_IDS = [
  'heavy4',
  'wide2',
  'narrow2',
  'bizjet',
  'turboprop',
  'lightprop',
  'heli',
  'fastjet',
] as const

export type SilhouetteId = (typeof SILHOUETTE_IDS)[number]

/** Readable name for every ICAO aircraft type designator we know about. */
export const AIRCRAFT_TYPE_NAMES: Record<string, string> = {
  A388: 'Airbus A380-800',
  A346: 'Airbus A340-600',
  A345: 'Airbus A340-500',
  A343: 'Airbus A340-300',
  A342: 'Airbus A340-200',
  A35K: 'Airbus A350-1000',
  A359: 'Airbus A350-900',
  A339: 'Airbus A330-900neo',
  A338: 'Airbus A330-800neo',
  A333: 'Airbus A330-300',
  A332: 'Airbus A330-200',
  A306: 'Airbus A300-600',
  A310: 'Airbus A310',
  A21N: 'Airbus A321neo',
  A321: 'Airbus A321-200',
  A20N: 'Airbus A320neo',
  A320: 'Airbus A320-200',
  A19N: 'Airbus A319neo',
  A319: 'Airbus A319-100',
  A318: 'Airbus A318',
  BCS3: 'Airbus A220-300',
  BCS1: 'Airbus A220-100',
  B748: 'Boeing 747-8',
  B744: 'Boeing 747-400',
  B77W: 'Boeing 777-300ER',
  B773: 'Boeing 777-300',
  B77L: 'Boeing 777-200LR / Freighter',
  B772: 'Boeing 777-200ER',
  B78X: 'Boeing 787-10 Dreamliner',
  B789: 'Boeing 787-9 Dreamliner',
  B788: 'Boeing 787-8 Dreamliner',
  B764: 'Boeing 767-400ER',
  B763: 'Boeing 767-300ER',
  B753: 'Boeing 757-300',
  B752: 'Boeing 757-200',
  B39M: 'Boeing 737 MAX 9',
  B38M: 'Boeing 737 MAX 8',
  B37M: 'Boeing 737 MAX 7',
  B739: 'Boeing 737-900ER',
  B738: 'Boeing 737-800',
  B737: 'Boeing 737-700',
  B734: 'Boeing 737-400',
  B712: 'Boeing 717-200',
  E295: 'Embraer E195-E2',
  E290: 'Embraer E190-E2',
  E195: 'Embraer E195',
  E190: 'Embraer E190',
  E175: 'Embraer E175',
  E75L: 'Embraer E175LR',
  E75S: 'Embraer E175',
  E170: 'Embraer E170',
  E145: 'Embraer ERJ-145',
  E135: 'Embraer ERJ-135',
  E55P: 'Embraer Phenom 300',
  E50P: 'Embraer Phenom 100',
  CRJ9: 'Bombardier CRJ-900',
  CRJX: 'Bombardier CRJ-1000',
  CRJ7: 'Bombardier CRJ-700',
  CRJ2: 'Bombardier CRJ-200',
  CL60: 'Bombardier Challenger 600/650',
  CL35: 'Bombardier Challenger 350',
  GLEX: 'Bombardier Global Express',
  GL7T: 'Bombardier Global 7500',
  GL6T: 'Bombardier Global 6000',
  GLF6: 'Gulfstream G650',
  GLF5: 'Gulfstream G550',
  GLF4: 'Gulfstream G450',
  C68A: 'Cessna Citation Latitude',
  C56X: 'Cessna Citation Excel/XLS',
  C25A: 'Cessna Citation CJ2',
  C25B: 'Cessna Citation CJ3',
  C172: 'Cessna 172 Skyhawk',
  C152: 'Cessna 152',
  PC12: 'Pilatus PC-12',
  PC24: 'Pilatus PC-24',
  AT76: 'ATR 72-600',
  AT75: 'ATR 72-500',
  AT72: 'ATR 72',
  AT46: 'ATR 42-600',
  DH8D: 'De Havilland Dash 8 Q400',
  A400: 'Airbus A400M Atlas',
  C130: 'Lockheed C-130 Hercules',
  C30J: 'Lockheed C-130J Super Hercules',
  EUFI: 'Eurofighter Typhoon',
  F16: 'General Dynamics F-16 Fighting Falcon',
  F18: 'McDonnell Douglas F/A-18 Hornet',
  EC35: 'Airbus Helicopters H135',
  EC45: 'Airbus Helicopters H145',
  AS50: 'Airbus Helicopters H125 Écureuil',
  R44: 'Robinson R44',
}

/** Readable model name for a type designator, with a graceful fallback. */
export function aircraftModelName(type?: string): string | undefined {
  const code = (type ?? '').trim().toUpperCase()
  if (!code) return undefined
  return AIRCRAFT_TYPE_NAMES[code] ?? `Aeronave ${code}`
}

/*
 * The rules below are ordered from the most specific family to the least
 * specific one, and the first match wins.
 *
 * They are anchored at the start of the designator and only use prefixes that
 * cannot collide between families. Note that some ICAO designators end with a
 * letter (`B77W`, `A35K`, `B78X`), so plain `\d` wildcards are not enough.
 */

/** Helicopters: 2 or 3 letter European prefix, plus the usual US designs. */
const HELI =
  /^(EC\d\d|H\d\d\d|AS\d\d|R22|R44|R66|B06|B21\d|B4\d\d|B429|S7[6]|S92|A1\d\d|AW\d\d|UH1\d?|UH60|CH47|MI\d\d?|NH90|BK17|CABR|G2CA)/

/** Four engines and heavy transports. */
const HEAVY4 =
  /^(A388|A380|A34|B74|BLCF|B52|C5M|C17$|C135|IL7[69]|IL96|AN1[24]|E3T|E3C|K35R)/

/** Fighters, supersonic transport and trainer jets. */
const FASTJET =
  /^(EUFI|TYPH|F1[568]|F2[25]|F35|MIR2|RAFL|SB39|TORN|CONC|M346|HAWK|T38|L159)/

/** Twin engine widebodies. */
const WIDE2 = /^(A33|A35|A306|A310|B76|B77|B78|IL86|KC46)/

/** Turboprops and piston twins used as airliners or freighters. */
const TURBOPROP =
  /^(AT4|AT7|ATR|DH8|DHC|SF34|SB20|SW4|B190|BE20|BE30|BE9L|C208|DO28|DO32|E110|E120|F27|F50|JS3|JS41|L410|P180|PA31|PA34|PA44|PC12|PC24|TBM|C295|CN35|C130|C30J|A400)/

/** Light single engine piston aircraft. */
const LIGHTPROP =
  /^(C1[5-8]\d|C206|C210|PA18|PA24|PA28|PA32|PA38|PA46|SR20|SR22|DA20|DA40|DA42|DA62|DR40|RV\d|TB\d\d|M20\d|BE3[3-6]|BE5[58]|DV20|P28\d|P208|GLID|G1[12]0|PC21|PC9|T6)/

/** Business jets and regional jets with rear engines. */
const BIZJET =
  /^(CRJ\d|CL3\d|CL6\d|BD10|GL5T|GL6T|GL7T|GLEX|GLF\d|G150|G280|C25\d|C50\d|C510|C525|C55\d|C56\d|C650|C68\d|C700|C750|E135|E145|E50P|E55P|EA50|FA10|FA20|FA50|FA7X|FA8X|F900|F2TH|H25\d|HA4T|HDJT|LJ\d\d|PRM1|GALX|ASTR|B46\d|RJ\d\d|F70|F100)/

/**
 * Maps an ICAO type designator (and, when available, the ADS-B emitter
 * category) to one of the eight silhouette families.
 */
export function resolveSilhouette(typeCode?: string, categoryCode?: string): SilhouetteId {
  const t = (typeCode ?? '').trim().toUpperCase()
  if (!t) return 'narrow2'

  if (categoryCode === 'A7' || HELI.test(t)) return 'heli'
  if (HEAVY4.test(t)) return 'heavy4'
  if (FASTJET.test(t)) return 'fastjet'
  if (WIDE2.test(t)) return 'wide2'
  if (TURBOPROP.test(t)) return 'turboprop'
  if (categoryCode === 'A1' || LIGHTPROP.test(t)) return 'lightprop'
  if (BIZJET.test(t)) return 'bizjet'

  // Default: 2-engine narrowbody airliner (A319/A320/A321, B737, B757, E190…).
  return 'narrow2'
}

/** Human readable label of a silhouette family (used in the legend). */
export const SILHOUETTE_LABELS: Record<SilhouetteId, string> = {
  heavy4: 'Cuatrimotor pesado',
  wide2: 'Fuselaje ancho',
  narrow2: 'Fuselaje estrecho',
  bizjet: 'Jet Business / Regional',
  turboprop: 'Turbopropulsor',
  lightprop: 'Avión ligero',
  heli: 'Helicóptero',
  fastjet: 'Caza / Supersónico',
}
