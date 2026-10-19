/**
 * Headless sanity check for the data layer.
 *
 * It exercises, without a browser:
 *  - the simulated provider and the geodesy helpers,
 *  - the normalizers of the live feeds (v2, Flightradar24 zone, OpenSky),
 *  - the resolution of the search intent,
 *  - the silhouette resolver and the airline enrichment.
 *
 * Run with:  npm run smoke
 */
import { DemoProvider } from '../src/data/providers/demoProvider'
import { distanceNm } from '../src/data/geo'
import { resolveSearchIntent } from '../src/data/globalSearch'
import { resolveSilhouette, aircraftModelName } from '../src/data/aircraftTypes'
import { enrichWithAirline } from '../src/data/airlineCodes'
import { normalizeV2Aircraft } from '../src/data/providers/adsbV2Provider'
import { normalizeZoneRow, unwrapZonePayload } from '../src/data/providers/fr24ZoneProvider'
import { normalizeStateVector } from '../src/data/providers/openSkyProvider'
import { mergeAircraft } from '../src/data/providers/autoProvider'
import { categoryOf } from '../src/data/category'
import type { Aircraft } from '../src/data/types'

let failures = 0
const fail = (message: string) => {
  failures++
  console.error(`  ✗ ${message}`)
}

const check = (condition: boolean, message: string): void => {
  if (!condition) fail(message)
}

const provider = new DemoProvider({ fleetSize: 600, seed: 42 })

/** Roughly what a 2560 px wide viewport shows over Spain at zoom 6.6. */
const viewport = {
  center: { lat: 40.2, lon: -3.7 },
  zoom: 6.6,
  bounds: { west: -22, south: 32, east: 15, north: 48 },
  radiusNm: 900,
}

const checkAircraft = (ac: Aircraft, label: string) => {
  if (!Number.isFinite(ac.lat) || !Number.isFinite(ac.lon)) fail(`${label}: posición no finita`)
  if (ac.lat < -90 || ac.lat > 90 || ac.lon < -180 || ac.lon > 180) fail(`${label}: posición fuera de rango`)
  if (!Number.isFinite(ac.altitude) || ac.altitude < 0) fail(`${label}: altitud inválida (${ac.altitude})`)
  if (ac.altitude > 45_000) fail(`${label}: altitud excesiva (${ac.altitude})`)
  if (!Number.isFinite(ac.heading) || ac.heading < 0 || ac.heading >= 360) fail(`${label}: rumbo inválido (${ac.heading})`)
  if (!Number.isFinite(ac.groundSpeed) || ac.groundSpeed < 0) fail(`${label}: velocidad inválida`)
  if (!ac.callsign) fail(`${label}: sin callsign`)
  if (!ac.id) fail(`${label}: sin id`)
}

console.log('· Simulando 60 s de tráfico (paso de 100 ms)…')
let inView = 0
let maxAlt = 0
let airborne = 0
let samples: Aircraft[] = []

for (let step = 0; step < 600; step++) {
  provider.advance(100)
  if (step % 10 !== 0) continue

  const list = await provider.poll(viewport)
  if (step === 300) samples = list.slice(0, 5)
  for (const ac of list) checkAircraft(ac, `${ac.callsign}@${step}`)
  inView = list.length
  for (const ac of list) {
    if (ac.altitude > maxAlt) maxAlt = ac.altitude
    if (!ac.onGround) airborne++
  }
}

if (inView === 0) fail('no aparece ninguna aeronave en la vista de España')
console.log(`· Aeronaves en vista: ${inView} · altitud máxima: ${maxAlt} ft · en vuelo (acumulado): ${airborne}`)

for (const ac of samples) {
  const route = ac.origin && ac.destination ? `${ac.origin.iata}→${ac.destination.iata}` : '—'
  console.log(
    `   ${ac.callsign.padEnd(9)} ${route.padEnd(9)} ${String(ac.altitude).padStart(5)} ft  ${String(ac.groundSpeed).padStart(3)} kt  ${ac.heading.toFixed(0).padStart(3)}°  ${ac.type ?? ''}`,
  )
}

// Density check across several viewports.
for (const [name, box] of [
  ['España (z6.6)', { west: -22, south: 32, east: 15, north: 48 }],
  ['Europa (z5.7)', { west: -25, south: 33, east: 45, north: 62 }],
  ['Mundo (z2.6)', { west: -180, south: -80, east: 180, north: 84 }],
] as const) {
  const list = await provider.poll({ ...viewport, bounds: box })
  console.log(`· ${name}: ${list.length} aeronaves visibles`)
}

// Geodesy smoke checks (known distances, ±1 %).
const cases: Array<[string, { lat: number; lon: number }, { lat: number; lon: number }, number]> = [
  ['MAD→BCN', { lat: 40.4719, lon: -3.5626 }, { lat: 41.2974, lon: 2.0833 }, 262],
  ['LHR→JFK', { lat: 51.47, lon: -0.4543 }, { lat: 40.6413, lon: -73.7781 }, 2995],
  ['MAD→CDG', { lat: 40.4719, lon: -3.5626 }, { lat: 49.0097, lon: 2.5479 }, 566],
]
for (const [name, a, b, expected] of cases) {
  const actual = distanceNm(a, b)
  const error = Math.abs(actual - expected) / expected
  if (error > 0.02) fail(`${name}: ${actual.toFixed(0)} NM, se esperaban ~${expected} NM`)
  else console.log(`· ${name}: ${actual.toFixed(0)} NM (esperado ~${expected})`)
}

// Movement check: an aircraft must actually travel.
const start = (await provider.poll(viewport))[0]
provider.advance(30_000)
const later = (await provider.poll(viewport)).find((ac) => ac.id === start?.id)
if (start && later) {
  const moved = distanceNm(start, later)
  console.log(`· ${start.callsign} se desplazó ${moved.toFixed(1)} NM en 30 s`)
  if (moved < 0.5) fail('la aeronave no se mueve')
} else {
  console.log('· (sin aeronave común para medir el desplazamiento)')
}

provider.dispose()

/* ------------------------------------------------------------------ feeds */

console.log('\n· Normalizador del feed "v2" (adsb.lol / ADSB.one / adsb.fi)…')
{
  const aircraft = normalizeV2Aircraft(
    {
      hex: '3c4b26',
      flight: 'DLH419',
      r: 'D-AIHN',
      t: 'A346',
      alt_baro: 36_000,
      gs: 460,
      track: 84,
      baro_rate: 0,
      squawk: '1000',
      category: 'A3',
      lat: 40.4719,
      lon: -3.5626,
      seen: 0.3,
      rssi: -7.8,
    },
    1_700_000_000_000,
    'adsblol',
  )
  check(aircraft !== null, 'v2: no se ha normalizado la aeronave')
  if (aircraft) {
    check(aircraft.id === '3c4b26', `v2: id incorrecto (${aircraft.id})`)
    check(aircraft.callsign === 'DLH419', `v2: callsign incorrecto (${aircraft.callsign})`)
    check(aircraft.altitude === 36_000, `v2: altitud incorrecta (${aircraft.altitude})`)
    check(aircraft.groundSpeed === 460, `v2: velocidad incorrecta (${aircraft.groundSpeed})`)
    check(aircraft.heading === 84, `v2: rumbo incorrecto (${aircraft.heading})`)
    check(aircraft.airlineName === 'Lufthansa', `v2: aerolínea incorrecta (${aircraft.airlineName})`)
    check(aircraft.flightNumber === 'LH419', `v2: número de vuelo incorrecto (${aircraft.flightNumber})`)
    check(aircraft.fullModel === 'Airbus A340-600', `v2: modelo incorrecto (${aircraft.fullModel})`)
    check(aircraft.silhouette === 'heavy4', `v2: silueta incorrecta (${aircraft.silhouette})`)
    check(aircraft.category === 'commercial', `v2: categoría incorrecta (${aircraft.category})`)
  }

  const grounded = normalizeV2Aircraft(
    { hex: 'abc123', flight: 'TEST01', t: 'A320', alt_baro: 'ground', lat: 1, lon: 2 },
    Date.now(),
  )
  check(grounded?.onGround === true, 'v2: no se ha detectado el avión en tierra')
  check(grounded?.altitude === 0, 'v2: la altitud en tierra debe ser 0')
}

console.log('· Normalizador del feed global de Flightradar24…')
{
  const payload = {
    '3c4b26': [
      '3C4B26', 40.4, -3.5, 84, 36_000, 460, '1000', 0, 'A346', 'D-AIHN', 0,
      'MAD', 'FRA', 'LH419', 0, 0, 'DLH419',
    ],
  }
  const zones = unwrapZonePayload(payload)
  check(Object.keys(zones).length === 1, 'fr24: no se ha desenvuelto la carga')

  const aircraft = normalizeZoneRow('3c4b26', zones['3c4b26'], Date.now())
  check(aircraft !== null, 'fr24: no se ha normalizado la aeronave')
  if (aircraft) {
    check(aircraft.callsign === 'DLH419', `fr24: callsign incorrecto (${aircraft.callsign})`)
    check(aircraft.route?.origin === 'MAD', `fr24: origen incorrecto (${aircraft.route?.origin})`)
    check(aircraft.route?.destination === 'FRA', `fr24: destino incorrecto (${aircraft.route?.destination})`)
    check(aircraft.flightNumber === 'LH419', `fr24: vuelo incorrecto (${aircraft.flightNumber})`)
    check(aircraft.registration === 'D-AIHN', `fr24: matrícula incorrecta (${aircraft.registration})`)
    check(aircraft.airlineName === 'Lufthansa', `fr24: aerolínea incorrecta (${aircraft.airlineName})`)
  }

  /* The endpoint also answers with a `{ contents: "…" }` wrapper. */
  const wrapped = unwrapZonePayload({ contents: JSON.stringify(payload) })
  check(Object.keys(wrapped).length === 1, 'fr24: no se ha desenvuelto el envoltorio "contents"')
}

console.log('· Normalizador de los vectores de estado de OpenSky…')
{
  const state = ['3c4b26', 'DLH419', 'Germany', -3.5, 40.4, 10_972, false, 237, 1.46, 0, null, 10_973, '1000']
  const aircraft = normalizeStateVector(state, Date.now())
  check(aircraft !== null, 'opensky: no se ha normalizado la aeronave')
  if (aircraft) {
    check(Math.abs(aircraft.lat - 40.4) < 0.001, `opensky: latitud incorrecta (${aircraft.lat})`)
    check(Math.abs(aircraft.lon + 3.5) < 0.001, `opensky: longitud incorrecta (${aircraft.lon})`)
    check(aircraft.altitude > 35_900 && aircraft.altitude < 36_100, `opensky: altitud incorrecta (${aircraft.altitude})`)
    check(aircraft.groundSpeed > 450 && aircraft.groundSpeed < 470, `opensky: velocidad incorrecta (${aircraft.groundSpeed})`)
    check(aircraft.heading > 80 && aircraft.heading < 90, `opensky: rumbo incorrecto (${aircraft.heading})`)
    check(aircraft.airlineName === 'Lufthansa', `opensky: aerolínea incorrecta (${aircraft.airlineName})`)
  }
}

console.log('· Fusión de observaciones de redes distintas…')
{
  const base = normalizeV2Aircraft(
    { hex: '3c4b26', flight: 'DLH419', t: 'A346', alt_baro: 36_000, gs: 460, lat: 40.4, lon: -3.5 },
    1,
  )!
  const incoming = normalizeZoneRow(
    '3c4b26',
    ['3C4B26', 40.5, -3.4, 85, 37_000, 462, '1000', 0, 'A346', 'D-AIHN', 0, 'MAD', 'FRA', 'LH419', 0, 0, 'DLH419'],
    2,
  )!
  const merged = mergeAircraft(base, incoming)
  check(merged.route?.destination === 'FRA', 'fusión: se ha perdido la ruta')
  check(merged.registration === 'D-AIHN', 'fusión: se ha perdido la matrícula')
  check(merged.lat === 40.5, 'fusión: la posición no es la más reciente')
}

console.log('· Categorización de aeronaves…')
{
  check(categoryOf({ military: true }) === 'military', 'categoría: no se detecta lo militar')
  check(categoryOf({ callsign: 'FDX1234', type: 'B763' }) === 'cargo', 'categoría: no se detecta la carga')
  check(categoryOf({ callsign: 'IBE1234', type: 'A321' }) === 'commercial', 'categoría: no se detecta el tráfico comercial')
  check(categoryOf({ callsign: 'G-XX', type: 'C172', groundSpeed: 90 }) === 'general', 'categoría: no se detecta la aviación general')
}

console.log('· Resolución de la intención de búsqueda…')
{
  const iata = resolveSearchIntent('LH419')
  check(iata.callsigns.has('LH419'), 'búsqueda: no se reconoce el vuelo IATA')
  check(iata.callsigns.has('DLH419'), 'búsqueda: no se traduce IATA → ICAO')

  const icao = resolveSearchIntent('DLH419')
  check(icao.callsigns.has('DLH419'), 'búsqueda: no se reconoce el callsign ICAO')

  const type = resolveSearchIntent('A340')
  check(type.types.size > 0, 'búsqueda: no se reconoce el tipo de aeronave')

  const airline = resolveSearchIntent('Lufthansa')
  check(airline.airlines.has('DLH'), 'búsqueda: no se reconoce la aerolínea')

  const reg = resolveSearchIntent('G-XWBA')
  check(reg.regs.has('G-XWBA'), 'búsqueda: no se reconoce la matrícula')

  const hex = resolveSearchIntent('3c4b26')
  check(hex.hexes.has('3C4B26'), 'búsqueda: no se reconoce el hex')
}

console.log('· Siluetas por tipo de aeronave…')
{
  const cases: Array<[string, string]> = [
    ['A388', 'heavy4'],
    ['B748', 'heavy4'],
    ['A346', 'heavy4'],
    ['C17', 'heavy4'],
    ['B77W', 'wide2'],
    ['A35K', 'wide2'],
    ['A350', 'wide2'],
    ['A320', 'narrow2'],
    ['B738', 'narrow2'],
    ['B712', 'narrow2'],
    ['E195', 'narrow2'],
    ['CRJ9', 'bizjet'],
    ['GLF6', 'bizjet'],
    ['C172', 'lightprop'],
    ['C152', 'lightprop'],
    ['PA28', 'lightprop'],
    ['AT76', 'turboprop'],
    ['PC12', 'turboprop'],
    ['EC35', 'heli'],
    ['R44', 'heli'],
    ['EUFI', 'fastjet'],
    ['F16', 'fastjet'],
  ]
  for (const [type, expected] of cases) {
    const actual = resolveSilhouette(type, 'A3')
    check(actual === expected, `silueta: ${type} debería ser ${expected} y es ${actual}`)
  }
  check(aircraftModelName('A346') === 'Airbus A340-600', 'modelo: A346 mal resuelto')
  check(aircraftModelName('ZZZZ') === 'Aeronave ZZZZ', 'modelo: fallback incorrecto')
}

console.log('· Enriquecimiento con el código de aerolínea…')
{
  const aircraft: Aircraft = {
    id: '3c4b26',
    callsign: 'RYR1234',
    category: 'commercial',
    lat: 0,
    lon: 0,
    altitude: 0,
    groundSpeed: 0,
    verticalRate: 0,
    heading: 0,
    onGround: false,
    observedAt: 0,
  }
  enrichWithAirline(aircraft)
  check(aircraft.airlineName === 'Ryanair', `aerolínea: incorrecta (${aircraft.airlineName})`)
  check(aircraft.flightNumber === 'FR1234', `vuelo: incorrecto (${aircraft.flightNumber})`)
}

if (failures > 0) {
  console.error(`\n✗ ${failures} comprobación(es) fallidas`)
  process.exit(1)
}
console.log('\n✓ Todas las comprobaciones OK')
