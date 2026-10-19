/**
 * Airline code dictionary used to enrich live ADS-B feeds.
 *
 * Public feeds report the ICAO callsign prefix (`DLH419`) but not the airline
 * name nor the commercial flight number (`LH419`). This table maps the ICAO
 * prefix to the marketing name and to the IATA code, which is what a user
 * actually types when searching (`LH419`, `Lufthansa`).
 */

export interface AirlineCode {
  /** Marketing name. */
  name: string
  /** IATA two-letter code. */
  iata: string
}

export const ICAO_AIRLINES: Record<string, AirlineCode> = {
  DLH: { name: 'Lufthansa', iata: 'LH' },
  IBE: { name: 'Iberia', iata: 'IB' },
  IBS: { name: 'Iberia Express', iata: 'I2' },
  ANE: { name: 'Air Nostrum', iata: 'YW' },
  RYR: { name: 'Ryanair', iata: 'FR' },
  RUK: { name: 'Ryanair UK', iata: 'RK' },
  MAY: { name: 'Malta Air', iata: 'AL' },
  VLG: { name: 'Vueling', iata: 'VY' },
  AEA: { name: 'Air Europa', iata: 'UX' },
  BAW: { name: 'British Airways', iata: 'BA' },
  AFR: { name: 'Air France', iata: 'AF' },
  KLM: { name: 'KLM Royal Dutch Airlines', iata: 'KL' },
  EZY: { name: 'easyJet', iata: 'U2' },
  EJU: { name: 'easyJet Europe', iata: 'EC' },
  EZS: { name: 'easyJet Switzerland', iata: 'DS' },
  SWR: { name: 'SWISS', iata: 'LX' },
  AUA: { name: 'Austrian Airlines', iata: 'OS' },
  BEL: { name: 'Brussels Airlines', iata: 'SN' },
  EWZ: { name: 'Eurowings', iata: 'EW' },
  EWG: { name: 'Eurowings', iata: 'EW' },
  TAP: { name: 'TAP Air Portugal', iata: 'TP' },
  ITY: { name: 'ITA Airways', iata: 'AZ' },
  SAS: { name: 'SAS Scandinavian Airlines', iata: 'SK' },
  FIN: { name: 'Finnair', iata: 'AY' },
  NAX: { name: 'Norwegian Air Shuttle', iata: 'DY' },
  NSZ: { name: 'Norwegian Air Sweden', iata: 'D8' },
  EIN: { name: 'Aer Lingus', iata: 'EI' },
  THY: { name: 'Turkish Airlines', iata: 'TK' },
  PGT: { name: 'Pegasus Airlines', iata: 'PC' },
  UAE: { name: 'Emirates', iata: 'EK' },
  QTR: { name: 'Qatar Airways', iata: 'QR' },
  ETD: { name: 'Etihad Airways', iata: 'EY' },
  SVA: { name: 'Saudia', iata: 'SV' },
  RJA: { name: 'Royal Jordanian', iata: 'RJ' },
  RAM: { name: 'Royal Air Maroc', iata: 'AT' },
  AAL: { name: 'American Airlines', iata: 'AA' },
  DAL: { name: 'Delta Air Lines', iata: 'DL' },
  UAL: { name: 'United Airlines', iata: 'UA' },
  SWA: { name: 'Southwest Airlines', iata: 'WN' },
  JBU: { name: 'JetBlue Airways', iata: 'B6' },
  ASA: { name: 'Alaska Airlines', iata: 'AS' },
  ACA: { name: 'Air Canada', iata: 'AC' },
  WJA: { name: 'WestJet', iata: 'WS' },
  AMX: { name: 'Aeroméxico', iata: 'AM' },
  AVA: { name: 'Avianca', iata: 'AV' },
  LAN: { name: 'LATAM Airlines', iata: 'LA' },
  TAM: { name: 'LATAM Brasil', iata: 'JJ' },
  ARG: { name: 'Aerolíneas Argentinas', iata: 'AR' },
  CMP: { name: 'Copa Airlines', iata: 'CM' },
  QFA: { name: 'Qantas', iata: 'QF' },
  ANZ: { name: 'Air New Zealand', iata: 'NZ' },
  SIA: { name: 'Singapore Airlines', iata: 'SQ' },
  CPA: { name: 'Cathay Pacific', iata: 'CX' },
  ANA: { name: 'All Nippon Airways (ANA)', iata: 'NH' },
  JAL: { name: 'Japan Airlines (JAL)', iata: 'JL' },
  KAL: { name: 'Korean Air', iata: 'KE' },
  AAR: { name: 'Asiana Airlines', iata: 'OZ' },
  EVA: { name: 'EVA Air', iata: 'BR' },
  CAL: { name: 'China Airlines', iata: 'CI' },
  CCA: { name: 'Air China', iata: 'CA' },
  CES: { name: 'China Eastern', iata: 'MU' },
  CSN: { name: 'China Southern', iata: 'CZ' },
  AIC: { name: 'Air India', iata: 'AI' },
  IGO: { name: 'IndiGo', iata: '6E' },
  THA: { name: 'Thai Airways', iata: 'TG' },
  MAS: { name: 'Malaysia Airlines', iata: 'MH' },
  HVN: { name: 'Vietnam Airlines', iata: 'VN' },
  WZZ: { name: 'Wizz Air', iata: 'W6' },
  WMT: { name: 'Wizz Air Malta', iata: 'W4' },
  WUK: { name: 'Wizz Air UK', iata: 'W9' },
  LOT: { name: 'LOT Polish Airlines', iata: 'LO' },
  CSA: { name: 'Czech Airlines', iata: 'OK' },
  TVS: { name: 'Smartwings', iata: 'QS' },
  BTI: { name: 'airBaltic', iata: 'BT' },
  AEE: { name: 'Aegean Airlines', iata: 'A3' },
  TAR: { name: 'Tunisair', iata: 'TU' },
  MSR: { name: 'EgyptAir', iata: 'MS' },
  ETH: { name: 'Ethiopian Airlines', iata: 'ET' },
  SAA: { name: 'South African Airways', iata: 'SA' },
  EXS: { name: 'Jet2.com', iata: 'LS' },
  TOM: { name: 'TUI Airways', iata: 'BY' },
  TUI: { name: 'TUI fly', iata: 'X3' },
  CFG: { name: 'Condor', iata: 'DE' },
  TRA: { name: 'Transavia', iata: 'HV' },
  TVF: { name: 'Transavia France', iata: 'TO' },
  VOE: { name: 'Volotea', iata: 'V7' },
  NTB: { name: 'Binter Canarias', iata: 'NT' },
  IBB: { name: 'Binter Canarias', iata: 'NT' },
  LZB: { name: 'Bulgaria Air', iata: 'FB' },
  ROU: { name: 'Air Canada Rouge', iata: 'RV' },
  FDX: { name: 'FedEx Express', iata: 'FX' },
  UPS: { name: 'UPS Airlines', iata: '5X' },
  DHK: { name: 'DHL Air', iata: 'D0' },
  BCS: { name: 'European Air Transport (DHL)', iata: 'QY' },
  CLX: { name: 'Cargolux', iata: 'CV' },
  GTI: { name: 'Atlas Air', iata: '5Y' },
  BOX: { name: 'AeroLogic', iata: '3S' },
  NJE: { name: 'NetJets Europe', iata: '1I' },
  EJA: { name: 'NetJets', iata: '1I' },
  VJT: { name: 'VistaJet', iata: 'VJ' },
}

/** Reverse index: IATA code → list of ICAO prefixes (a few share an IATA code). */
const ICAO_BY_IATA: Map<string, string[]> = (() => {
  const index = new Map<string, string[]>()
  for (const [icao, info] of Object.entries(ICAO_AIRLINES)) {
    const list = index.get(info.iata) ?? []
    list.push(icao)
    index.set(info.iata, list)
  }
  return index
})()

/** All the ICAO prefixes that share an IATA code (e.g. `LH` → `DLH`). */
export function icaoPrefixesForIata(iata: string): string[] {
  return ICAO_BY_IATA.get(iata.toUpperCase()) ?? []
}

/**
 * Enriches an aircraft observation with the airline name and the commercial
 * flight number derived from its callsign.
 *
 * `DLH419` → airline `Lufthansa`, flight number `LH419`.
 */
export function enrichWithAirline(
  aircraft: { callsign?: string; airlineName?: string; flightNumber?: string },
): void {
  const cs = (aircraft.callsign ?? '').trim().toUpperCase()
  if (cs.length < 4) return

  const prefix = cs.slice(0, 3)
  const suffix = cs.slice(3)
  const info = ICAO_AIRLINES[prefix]
  if (!info) return

  if (!aircraft.airlineName) aircraft.airlineName = info.name
  if (!aircraft.flightNumber && /^\d+[A-Z]?$/.test(suffix)) {
    aircraft.flightNumber = `${info.iata}${suffix}`
  }
}
