import type { AircraftCategory } from './types'

export type Region = 'europe' | 'americas' | 'asia' | 'africa' | 'middleeast' | 'oceania'

export interface Airline {
  /** ICAO callsign prefix, e.g. `IBE`. */
  code: string
  name: string
  /** ICAO type designators typically flown by the operator. */
  types: string[]
  /** Typical cruise band in feet. */
  cruise: [number, number]
  /** Registration prefix, e.g. `EC-`. */
  reg: string
  category: AircraftCategory
  /** Home region, used to keep demo routes plausible. */
  region: Region
  /** Relative probability of being picked for a demo flight. */
  weight?: number
}

/** Country → region lookup used to pick a plausible operator per route. */
const COUNTRY_REGION: Record<string, Region> = {
  España: 'europe',
  Portugal: 'europe',
  'Reino Unido': 'europe',
  Irlanda: 'europe',
  Francia: 'europe',
  'Países Bajos': 'europe',
  Bélgica: 'europe',
  Alemania: 'europe',
  Suiza: 'europe',
  Austria: 'europe',
  Italia: 'europe',
  Dinamarca: 'europe',
  Noruega: 'europe',
  Suecia: 'europe',
  Finlandia: 'europe',
  Islandia: 'europe',
  Polonia: 'europe',
  'República Checa': 'europe',
  Hungría: 'europe',
  Rumanía: 'europe',
  Grecia: 'europe',
  Rusia: 'europe',
  Turquía: 'europe',
  Catar: 'middleeast',
  EAU: 'middleeast',
  Jordania: 'middleeast',
  Irán: 'middleeast',
  Egipto: 'africa',
  Marruecos: 'africa',
  Argelia: 'africa',
  Sudáfrica: 'africa',
  Nigeria: 'africa',
  Kenia: 'africa',
  'EE. UU.': 'americas',
  Canadá: 'americas',
  México: 'americas',
  Brasil: 'americas',
  Argentina: 'americas',
  Chile: 'americas',
  Perú: 'americas',
  Colombia: 'americas',
  Ecuador: 'americas',
  India: 'asia',
  China: 'asia',
  Japón: 'asia',
  'Corea del Sur': 'asia',
  Taiwán: 'asia',
  Singapur: 'asia',
  Malasia: 'asia',
  Tailandia: 'asia',
  Indonesia: 'asia',
  Filipinas: 'asia',
  Australia: 'oceania',
  'Nueva Zelanda': 'oceania',
}

export function regionOf(country: string): Region {
  return COUNTRY_REGION[country] ?? 'europe'
}

/** Registration prefixes typically seen in each region. */
export const REG_PREFIX_BY_REGION: Record<Region, string[]> = {
  europe: ['EC-', 'G-', 'D-', 'F-', 'PH-', 'I-', 'HB-', 'SE-', 'OY-', 'LN-', 'OE-', 'OO-', 'CS-', 'SP-', 'HA-', 'TC-', 'EI-', 'OH-'],
  americas: ['N', 'C-', 'XA-', 'PR-', 'PP-', 'LV-', 'CC-', 'N'],
  asia: ['JA', 'B-', 'HL', '9V-', 'HS-', 'VT-', 'PK-', 'B-'],
  middleeast: ['A7-', 'A6-', 'A6-', '4X-', 'EP-', 'JY-', 'A9C-'],
  africa: ['ZS-', 'CN-', '7T-', 'SU-', '5N-', '5Y-'],
  oceania: ['VH-', 'ZK-'],
}

export const AIRLINES: Airline[] = [
  { code: 'IBE', name: 'Iberia', types: ['A319', 'A320', 'A321', 'A330', 'A350'], cruise: [33000, 40000], reg: 'EC-', region: 'europe', category: 'commercial', weight: 8 },
  { code: 'IBS', name: 'Iberia Express', types: ['A320', 'A321'], cruise: [31000, 38000], reg: 'EC-', region: 'europe', category: 'commercial', weight: 4 },
  { code: 'AEA', name: 'Air Europa', types: ['B738', 'B789'], cruise: [33000, 40000], reg: 'EC-', region: 'europe', category: 'commercial', weight: 4 },
  { code: 'RYR', name: 'Ryanair', types: ['B738', 'B38M'], cruise: [31000, 38000], reg: 'EI-', region: 'europe', category: 'commercial', weight: 9 },
  { code: 'VLG', name: 'Vueling', types: ['A319', 'A320', 'A321'], cruise: [31000, 37000], reg: 'EC-', region: 'europe', category: 'commercial', weight: 7 },
  { code: 'EZY', name: 'easyJet', types: ['A319', 'A320', 'A321'], cruise: [31000, 37000], reg: 'G-', region: 'europe', category: 'commercial', weight: 7 },
  { code: 'BAW', name: 'British Airways', types: ['A319', 'A320', 'A321', 'B772', 'B788', 'A388'], cruise: [34000, 41000], reg: 'G-', region: 'europe', category: 'commercial', weight: 8 },
  { code: 'AFR', name: 'Air France', types: ['A220', 'A320', 'A321', 'B77W', 'A359'], cruise: [34000, 40000], reg: 'F-', region: 'europe', category: 'commercial', weight: 7 },
  { code: 'DLH', name: 'Lufthansa', types: ['A319', 'A320', 'A321', 'A346', 'B789', 'A359'], cruise: [34000, 41000], reg: 'D-', region: 'europe', category: 'commercial', weight: 8 },
  { code: 'KLM', name: 'KLM', types: ['B738', 'B789', 'A333', 'B77W'], cruise: [34000, 40000], reg: 'PH-', region: 'europe', category: 'commercial', weight: 6 },
  { code: 'SWR', name: 'SWISS', types: ['A220', 'A320', 'A321', 'A333', 'B77W'], cruise: [34000, 40000], reg: 'HB-', region: 'europe', category: 'commercial', weight: 4 },
  { code: 'AZA', name: 'ITA Airways', types: ['A220', 'A320', 'A321', 'A359'], cruise: [33000, 39000], reg: 'I-', region: 'europe', category: 'commercial', weight: 4 },
  { code: 'SAS', name: 'SAS', types: ['A20N', 'A21N', 'A333'], cruise: [33000, 39000], reg: 'LN-', region: 'europe', category: 'commercial', weight: 4 },
  { code: 'THY', name: 'Turkish Airlines', types: ['A321', 'A333', 'B77W', 'A359'], cruise: [34000, 41000], reg: 'TC-', region: 'europe', category: 'commercial', weight: 7 },
  { code: 'AFL', name: 'Aeroflot', types: ['A320', 'A321', 'A333', 'B77W'], cruise: [34000, 39000], reg: 'RA-', region: 'europe', category: 'commercial', weight: 3 },
  { code: 'QTR', name: 'Qatar Airways', types: ['A359', 'B77W', 'A388'], cruise: [36000, 43000], reg: 'A7-', region: 'middleeast', category: 'commercial', weight: 5 },
  { code: 'UAE', name: 'Emirates', types: ['B77W', 'A388', 'A359'], cruise: [36000, 43000], reg: 'A6-', region: 'middleeast', category: 'commercial', weight: 6 },
  { code: 'ETD', name: 'Etihad Airways', types: ['B789', 'A359', 'A321'], cruise: [36000, 42000], reg: 'A6-', region: 'middleeast', category: 'commercial', weight: 3 },
  { code: 'AAL', name: 'American Airlines', types: ['A319', 'A321', 'B738', 'B772', 'B789'], cruise: [34000, 40000], reg: 'N', region: 'americas', category: 'commercial', weight: 8 },
  { code: 'DAL', name: 'Delta Air Lines', types: ['A220', 'A321', 'B739', 'A333', 'A359'], cruise: [34000, 40000], reg: 'N', region: 'americas', category: 'commercial', weight: 8 },
  { code: 'UAL', name: 'United Airlines', types: ['A320', 'B739', 'B772', 'B789'], cruise: [34000, 41000], reg: 'N', region: 'americas', category: 'commercial', weight: 8 },
  { code: 'SWA', name: 'Southwest', types: ['B737', 'B738', 'B38M'], cruise: [30000, 38000], reg: 'N', region: 'americas', category: 'commercial', weight: 6 },
  { code: 'ACA', name: 'Air Canada', types: ['A220', 'A320', 'A333', 'B789'], cruise: [34000, 40000], reg: 'C-', region: 'americas', category: 'commercial', weight: 5 },
  { code: 'AMX', name: 'Aeroméxico', types: ['B738', 'B789', 'A321'], cruise: [34000, 40000], reg: 'XA-', region: 'americas', category: 'commercial', weight: 4 },
  { code: 'LAN', name: 'LATAM', types: ['A320', 'A321', 'B789', 'A359'], cruise: [34000, 41000], reg: 'CC-', region: 'americas', category: 'commercial', weight: 5 },
  { code: 'SIA', name: 'Singapore Airlines', types: ['A359', 'B77W', 'A388'], cruise: [36000, 43000], reg: '9V-', region: 'asia', category: 'commercial', weight: 5 },
  { code: 'CPA', name: 'Cathay Pacific', types: ['A333', 'A359', 'B77W'], cruise: [36000, 42000], reg: 'B-', region: 'asia', category: 'commercial', weight: 4 },
  { code: 'ANA', name: 'ANA', types: ['B788', 'B789', 'A321'], cruise: [34000, 41000], reg: 'JA', region: 'asia', category: 'commercial', weight: 5 },
  { code: 'JAL', name: 'Japan Airlines', types: ['B788', 'B789', 'A359'], cruise: [34000, 41000], reg: 'JA', region: 'asia', category: 'commercial', weight: 5 },
  { code: 'KAL', name: 'Korean Air', types: ['B789', 'A333', 'B77W'], cruise: [34000, 41000], reg: 'HL', region: 'asia', category: 'commercial', weight: 4 },
  { code: 'QFA', name: 'Qantas', types: ['B789', 'A333', 'A388'], cruise: [36000, 42000], reg: 'VH-', region: 'oceania', category: 'commercial', weight: 4 },

  // Carga
  { code: 'FDX', name: 'FedEx', types: ['B763', 'B77F', 'MD11'], cruise: [32000, 40000], reg: 'N', region: 'americas', category: 'cargo', weight: 5 },
  { code: 'UPS', name: 'UPS', types: ['B763', 'B748', 'A306'], cruise: [32000, 40000], reg: 'N', region: 'americas', category: 'cargo', weight: 5 },
  { code: 'GTI', name: 'Atlas Air', types: ['B744', 'B748', 'B77F'], cruise: [32000, 40000], reg: 'N', region: 'americas', category: 'cargo', weight: 3 },
  { code: 'CLX', name: 'Cargolux', types: ['B748', 'B77F'], cruise: [34000, 41000], reg: 'LX-', region: 'europe', category: 'cargo', weight: 2 },
  { code: 'BOX', name: 'AeroLogic', types: ['B77F'], cruise: [34000, 41000], reg: 'D-', region: 'europe', category: 'cargo', weight: 2 },
  { code: 'SQC', name: 'SF Airlines', types: ['B763', 'B77F'], cruise: [32000, 39000], reg: 'B-', region: 'asia', category: 'cargo', weight: 2 },
]

/** General aviation / business types used for the small traffic. */
export const GA_TYPES = ['C172', 'PA28', 'SR22', 'DA42', 'PC12', 'TBM9', 'BE20', 'C525', 'LJ45', 'CL30', 'GLF5', 'E55P']

/** Military-ish callsign prefixes and airframes. */
export const MILITARY = {
  prefixes: ['SPAR', 'HAWK', 'VIPER', 'DUKE', 'REAPER', 'TORRE', 'ARMY', 'NAVY', 'FAF', 'GAF', 'TOPG', 'SENTRY'],
  types: ['F16', 'F18', 'F35A', 'EF2000', 'RAFALE', 'C130', 'A400M', 'KC135', 'P8', 'E3TF', 'B52'],
}

const TOTAL_WEIGHT = AIRLINES.reduce((sum, a) => sum + (a.weight ?? 1), 0)

/** Pick a random operator, favouring the biggest ones. */
export function weightedAirline(rng: () => number): Airline {
  let r = rng() * TOTAL_WEIGHT
  for (const airline of AIRLINES) {
    r -= airline.weight ?? 1
    if (r <= 0) return airline
  }
  return AIRLINES[AIRLINES.length - 1]
}
