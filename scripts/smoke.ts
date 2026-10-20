const nodeGlobals = globalThis as typeof globalThis & { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown }
nodeGlobals.requestAnimationFrame ??= () => 0
nodeGlobals.cancelAnimationFrame ??= () => undefined
import { sampleGrid, rasterizeForecast } from '../src/data/weather/raster'
import { FleetController, shouldCollectInBackground } from '../src/engine/fleetController'
import { normalizeGuiVisibility, normalizeInterfaceScale } from '../src/config'
import {
  headingToRotationY,
  matchAircraft3D,
  modelAltitudeY,
  modelScaleFor,
} from '../src/data/aircraft3d'
import {
  decodeTerrariumPixel,
  groundWindow,
  metersPerPixel,
  terrainTilesOf,
  tilePosition,
  tileUrl,
  tileZoomForAltitude,
  viewWindow,
} from '../src/data/mapTiles'
import { motionTarget, MotionSampler, shortestArcDeg } from '../src/engine/motionSampler'
import { northResetDelta } from '../src/components/MapCompass'
import { SphereGeometry } from 'three'
import { simplifyGeometry, triangleCount } from '../src/data/aircraft3dModels'
import {
  GROUND_TILE_PX,
  MESH_SEGMENTS,
  MIN_AUTO_RATIO,
  MODEL_MIN_TRIANGLES,
  MODEL_SIMPLIFY,
  MODEL_TEXTURE_MAX,
  TERRAIN_STRIDE,
  isPerformanceSettings,
  mapPixelRatio,
  normalizePerformance,
  viewerPixelRatio,
} from '../src/data/quality'
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
import { forecastPoints, latestRadar, normalizeForecastGrid, sectorForViewport, sectorSafelyCovers } from '../src/data/weather'
import { classifyBasemapLayer } from '../src/map/style'
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
  check(mergeAircraft(incoming, base).lat === 40.5, 'fusión: una observación antigua no debe mover el avión atrás')
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

/* Aircraft render only exact reports and survive a style swap. */
{
  const sourceSets: Array<[string, number, number]> = []
  const fakeSources = new Map<string, { setData: (d: unknown) => Promise<void> }>()
  for (const name of ['old', 'fresh']) fakeSources.set(name, {
    setData: (data: unknown) => {
      const features = (data as { features: Array<{ geometry: { coordinates: number[] } }> }).features
      sourceSets.push([name, features.length, features[0]?.geometry.coordinates[1] ?? NaN])
      return Promise.resolve()
    },
  })
  let active = 'old'
  const fakeMap = {
    getSource: () => fakeSources.get(active),
    on: () => undefined, off: () => undefined,
    getBounds: () => ({ getCenter: () => ({ lat: 40, lng: -3 }), getWest: () => -10, getSouth: () => 35, getEast: () => 5, getNorth: () => 45, getNorthEast: () => ({ lat: 45, lng: 5 }) }),
    getZoom: () => 6, getCenter: () => ({ lat: 40, lng: -3 }),
    jumpTo: () => undefined,
  } as unknown as import('maplibre-gl').Map
  const controller = new FleetController({ map: fakeMap, providerId: 'demo', fleetSize: 5, filters: { query: '', categories: [], airborneOnly: false }, onFollowChange: () => undefined })
  const base = { id: 'test1', callsign: 'TEST1', flightNumber: 'TEST1', registration: 'EC-TEST', type: 'B738', category: 'commercial', silhouette: 'narrow2', lat: 40, lon: -3, altitude: 30000, groundSpeed: 450, verticalRate: 0, heading: 90, onGround: false, observedAt: 2000 } as unknown as Aircraft
  controller.upsertAircraft(base)
  controller.upsertAircraft({ ...base, id: 'test2', lat: 41 })
  const internals = controller as unknown as { pushData: () => void; renderDirty: boolean }
  internals.pushData()
  check(sourceSets.at(-1)?.[0] === 'old' && sourceSets.at(-1)?.[1] === 2 && sourceSets.at(-1)?.[2] === 40, 'render: posición exacta del informe')
  await Promise.resolve()
  internals.renderDirty = false
  controller.upsertAircraft({ ...base, lat: 50, observedAt: 1000 })
  check(controller.positionOf('test1')?.lat === 40 && !internals.renderDirty, 'render: informe antiguo ignorado')
  controller.upsertAircraft({ ...base, lat: 42, observedAt: 3000 })
  check(internals.renderDirty && controller.positionOf('test1')?.lat === 42, 'render: sin coordenadas intermedias')
  internals.pushData()
  await Promise.resolve()
  internals.renderDirty = false
  controller.upsertAircraft({ ...base, lat: 42, observedAt: 4000 })
  check(!internals.renderDirty, 'render: un informe idéntico no vuelve a enviar geometría')
  active = 'fresh'
  internals.pushData()
  check(sourceSets.at(-1)?.[0] === 'fresh' && sourceSets.at(-1)?.[1] === 2, 'fuente de repuesto recibe los aviones')
  controller.restoreStyle()
  check(sourceSets.at(-1)?.[0] === 'fresh' && sourceSets.at(-1)?.[1] === 2, 'restoreStyle repone los aviones tras cambiar el mapa')

  const trailInternals = controller as unknown as {
    ingest: (list: Aircraft[], now: number) => void
    buildTrailLine: (track: unknown) => { geometry: { type: string; coordinates: unknown } } | null
    tracks: Map<string, unknown>
  }
  controller.setSelected('test1')
  trailInternals.ingest([{ ...base, lat: 42.1, lon: -2.9, observedAt: 10_000 }], performance.now())
  const selectedTrack = trailInternals.tracks.get('test1')
  check(trailInternals.buildTrailLine(selectedTrack)?.geometry.type === 'LineString', 'estela: informes seguidos forman una línea')
  trailInternals.ingest([{ ...base, lat: 43, lon: -2, observedAt: 200_000 }], performance.now())
  trailInternals.ingest([{ ...base, lat: 43.1, lon: -1.9, observedAt: 206_000 }], performance.now())
  const brokenTrail = trailInternals.buildTrailLine(selectedTrack)
  check(
    brokenTrail?.geometry.type === 'MultiLineString' &&
      Array.isArray(brokenTrail.geometry.coordinates) &&
      brokenTrail.geometry.coordinates.length === 2,
    'estela: un hueco largo no se une con una recta inventada',
  )
  controller.setExternalTrail('test1', [
    { lon: -4, lat: 39, altitude: 30000 },
    { lon: -3, lat: 40, altitude: 30000 },
  ])
  trailInternals.ingest([{ ...base, lat: 43.2, lon: -1.8, observedAt: 212_000 }], performance.now())
  const continuedTrail = trailInternals.buildTrailLine(selectedTrack)
  check(
    continuedTrail?.geometry.type === 'LineString' &&
      Array.isArray(continuedTrail.geometry.coordinates) &&
      continuedTrail.geometry.coordinates.length === 4 &&
      JSON.stringify(continuedTrail.geometry.coordinates).includes('[-1.9,43.1]') &&
      JSON.stringify(continuedTrail.geometry.coordinates).includes('[-1.8,43.2]'),
    'estela: los informes en vivo continúan la trayectoria histórica',
  )
  check(controller.trailAltitudes('test1').length === 4, 'estela: altitudes históricas y en vivo combinadas')
  controller.destroy()
}

console.log('· Meteorología: sectores estables, valores ausentes y radar…')
{
  const spain = sectorForViewport({ west: -12, south: 35, east: 5, north: 44 })!
  const zoomed = sectorForViewport({ west: -6, south: 38, east: 0, north: 42 })!
  check(Boolean(spain && zoomed), 'meteorología: sectores válidos')
  check(sectorSafelyCovers(spain, { west: -6, south: 38, east: 0, north: 42 }), 'meteorología: acercar reutiliza el sector')
  check(sectorForViewport({ west: -12.2, south: 35.2, east: 4.8, north: 43.8 })?.key === spain.key, 'meteorología: pequeños desplazamientos reutilizan caché')
  const pacific = sectorForViewport({ west: 170, south: -10, east: 190, north: 10 })!
  const points = forecastPoints(pacific)
  check(points.length === 99 && points.every((point) => point.lon >= -180 && point.lon <= 180), 'meteorología: antimeridiano')
  check(sectorForViewport({ west: 0, south: 90, east: 1, north: 100 }) === null, 'meteorología: latitudes fuera del modelo')
  check(sectorForViewport({ west: NaN, south: 0, east: 1, north: 1 }) === null, 'meteorología: coordenadas inválidas')
  const data = normalizeForecastGrid([{ current: { temperature_2m: 0 } }, { current: { temperature_2m: null } }], spain)
  check(data.values.temp[0] === 0 && data.values.temp[1] === undefined, 'meteorología: conservar cero, omitir nulos')
  check(normalizeForecastGrid({}, spain).values.wind.every((value) => value === undefined), 'meteorología: no inventar datos')
  const allFields = normalizeForecastGrid(points.map((_, i) => ({ current: { temperature_2m: i % 11, wind_speed_10m: i, precipitation: 0, weather_code: 0 } })), pacific)
  check(allFields.values.temp.some((value) => value !== undefined) && allFields.values.wind.some((value) => value !== undefined), 'meteorología: una respuesta alimenta todas las capas')
  check(latestRadar({ radar: { past: [{ path: '/v2/radar/123', time: 123 }] } }).time === 123, 'meteorología: radar válido')
  for (const payload of [{}, { radar: { past: [{ path: '//evil.test', time: 1 }] } }]) {
    let rejected = false
    try { latestRadar(payload) } catch { rejected = true }
    check(rejected, 'meteorología: rechazar metadatos inválidos')
  }
}

{
  check(sampleGrid([0, 10, 20, 30], .5, .5, 2) === 15, 'suavizado bilineal continuo')
  check(sampleGrid([0, undefined, 20, 30], .5, .5, 2) === null, 'datos ausentes transparentes')
  const sector = sectorForViewport({ west: -10, south: 30, east: 10, north: 50 })!
  const points = forecastPoints(sector)
  const data = normalizeForecastGrid(points.map((_, i) => ({ current: { temperature_2m: (i % sector.columns) * 4, precipitation: 0 } })), sector)
  const raster = rasterizeForecast(data, 'temp', 32, 24)
  check(raster.pixels.length === 32 * 24 * 4, 'dimensiones raster')
  check(Math.abs(raster.coordinates[0][0] - sector.west) < 1e-9 && Math.abs(raster.coordinates[0][1] - sector.north) < 1e-9, 'georreferencia raster')
  check(new Set(Array.from(raster.pixels).filter((_, i) => i % 4 === 0)).size > sector.columns, 'gradiente continuo, no bloques')
  check(rasterizeForecast(data, 'rain', 8, 8).pixels.every((value, i) => i % 4 !== 3 || value === 0), 'sin lluvia: transparente')
}

console.log('· Clasificación de elementos del mapa base…')
{
  const city = classifyBasemapLayer({ id: 'label_city', type: 'symbol', 'source-layer': 'place', layout: { 'icon-image': 'circle', 'text-field': ['get', 'name'] } })
  check(city.placeIcon && city.name && !city.border, 'mapa: icono y nombre de ciudad separables')
  const poi = classifyBasemapLayer({ id: 'poi_r1', type: 'symbol', 'source-layer': 'poi', layout: { 'icon-image': ['get', 'class'], 'text-field': ['get', 'name'] } })
  check(poi.placeIcon && poi.name, 'mapa: POI clasificado')
  const roadName = classifyBasemapLayer({ id: 'highway-name', type: 'symbol', 'source-layer': 'transportation_name', layout: { 'text-field': ['get', 'name'] } })
  check(!roadName.placeIcon && roadName.name, 'mapa: nombre de vía clasificado')
  const oneway = classifyBasemapLayer({ id: 'road_oneway', type: 'symbol', 'source-layer': 'transportation', layout: { 'icon-image': 'oneway' } })
  check(!oneway.placeIcon && !oneway.name, 'mapa: flecha de sentido no es un pin de lugar')
  const border = classifyBasemapLayer({ id: 'boundary_2', type: 'line', 'source-layer': 'boundary' })
  check(border.border, 'mapa: frontera clasificada')
}

console.log('· Ajustes, segundo plano y brújula…')
{
  check(normalizeInterfaceScale(0.5) === 0.9, 'escala: ×0.5 guardado migra a ×0.9')
  check(normalizeInterfaceScale(1) === 1, 'escala: ×1 se conserva')
  check(normalizeInterfaceScale(2) === 1.25, 'escala: ×2 guardado migra a ×1.25')
  check(normalizeInterfaceScale('sin escala') === 1, 'escala: valor inválido vuelve a ×1')
  const gui = normalizeGuiVisibility({ clock: false, compass: false, bottomControls: 'no' })
  check(gui.clock === false && gui.compass === false && gui.bottomControls === true, 'GUI: fusionar ajustes antiguos y nuevos')
  check(shouldCollectInBackground(true, true), 'segundo plano: pestaña oculta y opción activa')
  check(!shouldCollectInBackground(true, false), 'segundo plano: opción desactivada para equipos modestos')
  check(!shouldCollectInBackground(false, true), 'segundo plano: no duplicar el bucle visible')
  check(northResetDelta(350) === 10 && northResetDelta(-350) === -10, 'brújula: giro corto al norte')
  check(northResetDelta(45) === -45 && northResetDelta(0) === 0, 'brújula: restablecer rumbo')
}

console.log('· Modelos 3D y vista orbital…')
{
  check(matchAircraft3D('A320')?.id === 'a320', '3D: A320 compatible')
  check(matchAircraft3D('A20N')?.id === 'a320', '3D: A320neo compatible')
  check(matchAircraft3D('A359')?.id === 'a350', '3D: A350-900 compatible')
  check(matchAircraft3D('A350')?.id === 'a350', '3D: código suelto A350 compatible')
  check(matchAircraft3D('A388')?.id === 'a380', '3D: A380 compatible')
  check(matchAircraft3D('B738')?.id === 'b737', '3D: B737-800 compatible')
  check(matchAircraft3D('B789')?.id === 'b787', '3D: B787-9 compatible')
  check(matchAircraft3D('A333') === null, '3D: A330 sin modelo')
  check(matchAircraft3D('B77W') === null, '3D: B777 sin modelo')
  check(matchAircraft3D(undefined, 'Boeing 737 MAX 8')?.id === 'b737', '3D: nombre libre resuelve B737')
  check(matchAircraft3D(undefined, 'Airbus A350-900')?.id === 'a350', '3D: nombre libre resuelve A350')
  check(Math.abs(modelScaleFor(176, 72.72) - 0.4132) < 0.001, '3D: A380 normalizado a longitud real')
  check(Math.abs(modelScaleFor(37.7, 37.57) - 0.9966) < 0.001, '3D: A320 normalizado a escala 1:1')
  check(modelScaleFor(0, 40) === 1, '3D: dimensión inválida no divide entre cero')
  check(Math.abs(headingToRotationY(0) - Math.PI / 2) < 1e-9, '3D: rumbo 0 apunta al norte')
  check(Math.abs(headingToRotationY(90)) < 1e-9, '3D: rumbo 90 apunta al este')
  check(Math.abs(headingToRotationY(180) + Math.PI / 2) < 1e-9, '3D: rumbo 180 apunta al sur')
  check(Math.abs(modelAltitudeY(32808, false, 11) - 10000) < 0.5, '3D: altitud real en metros sobre el mapa')
  check(modelAltitudeY(0, true, 11) === 5.5, '3D: en tierra las ruedas tocan el mapa')
  check(modelAltitudeY(0, false, 11) === 5.5, '3D: altitud 0 se trata como suelo')
}

console.log('· Teselas del terreno del visor 3D…')
{
  check(Math.abs(metersPerPixel(0, 0) - 156_543.03) < 0.01, 'teselas: escala mercator en el ecuador')
  check(Math.abs(metersPerPixel(60, 0) - 156_543.03 * 0.5) < 0.01, 'teselas: corrección de latitud')
  check(tileZoomForAltitude(0) === 14 && tileZoomForAltitude(799) === 14, 'teselas: zoom 14 cerca del suelo')
  check(tileZoomForAltitude(800) === 13 && tileZoomForAltitude(2999) === 13, 'teselas: zoom 13 en aproximación')
  check(tileZoomForAltitude(3000) === 12 && tileZoomForAltitude(8999) === 12, 'teselas: zoom 12 en ascenso')
  check(tileZoomForAltitude(9000) === 11 && tileZoomForAltitude(12_000) === 11, 'teselas: zoom 11 en crucero')
  const pos = tilePosition(0, 0, 1)
  check(pos.fx === 1 && Math.abs(pos.fy - 1) < 1e-9, 'teselas: posición mundial en el centro')
  const win = groundWindow(0, 0, 13)
  check(win.x0 === 4092 && win.y0 === 4092 && win.n === 8, 'teselas: ventana alineada a teselas')
  check(Math.abs(win.offsetEastM) < 1e-6 && Math.abs(win.offsetNorthM) < 1e-6, 'teselas: centro exacto sin desfase')
  check(Math.abs(win.sizeMeters - 8 * 256 * (156_543.03 / 8192)) < 1, 'teselas: 39 km de lado en z13')
  const cruise = groundWindow(40, -3.5, 11)
  check(cruise.sizeMeters > 115_000 && cruise.sizeMeters < 125_000, 'teselas: ~120 km de lado en z11 a latitud media')
  const terrain = terrainTilesOf(win)
  check(
    terrain.z === 11 && terrain.x0 === Math.floor(win.x0 / 4) && terrain.y0 === Math.floor(win.y0 / 4),
    'teselas: el DEM z-2 cubre exactamente la misma ventana',
  )
  check(
    terrain.offsetX === (win.x0 - terrain.x0 * 4) * 64 &&
      terrain.offsetY === (win.y0 - terrain.y0 * 4) * 64 &&
      terrain.offsetX + 512 <= terrain.blockX * 256 &&
      terrain.offsetY + 512 <= terrain.blockY * 256,
    'teselas: la ventana del DEM cabe en su bloque de teselas',
  )
  const off = groundWindow(40, -3.5, 13)
  check(
    Math.abs(off.offsetEastM) <= off.sizeMeters / 2 && Math.abs(off.offsetNorthM) <= off.sizeMeters / 2,
    'teselas: el desfase queda dentro de la ventana',
  )
  const terrainOff = terrainTilesOf(off)
  check(
    [0, 64, 128, 192].includes(terrainOff.offsetX) && [0, 64, 128, 192].includes(terrainOff.offsetY),
    'teselas: el desfase del DEM cae en la rejilla de píxel',
  )
  check(decodeTerrariumPixel(128, 0, 0) === 0, 'teselas: terrarium nivel del mar')
  check(decodeTerrariumPixel(129, 0, 0) === 256, 'teselas: terrarium +256 m')
  check(Math.abs(decodeTerrariumPixel(128, 1, 0) - 1) < 0.01, 'teselas: terrarium +1 m')
  check(tileUrl('https://x/{z}/{x}/{y}.png', 5, 9, 3) === 'https://x/5/9/3.png', 'teselas: URL XYZ')
  const base = viewWindow(40, -3.5, 11_000, 1)
  check(base.z === 11 && base.n === 8, 'teselas: distancia ×1 usa la ventana base')
  const d2 = viewWindow(40, -3.5, 11_000, 2)
  check(d2.z === 10 && d2.n === 8 && Math.abs(d2.sizeMeters - 2 * base.sizeMeters) < 1, 'teselas: ×2 duplica el lado')
  const d3 = viewWindow(40, -3.5, 11_000, 3)
  check(d3.z === 9 && d3.n === 6 && Math.abs(d3.sizeMeters - 3 * base.sizeMeters) < 1, 'teselas: ×3 triplica el lado')
  const d5 = viewWindow(40, -3.5, 11_000, 5)
  check(d5.z === 9 && d5.n === 10 && Math.abs(d5.sizeMeters - 5 * base.sizeMeters) < 1, 'teselas: ×5 quintuplica el lado')
  const terrain5 = terrainTilesOf(d5)
  check(
    terrain5.offsetX + 10 * 64 <= terrain5.blockX * 256 && terrain5.offsetY + 10 * 64 <= terrain5.blockY * 256,
    'teselas: el DEM de ×5 cubre su ventana',
  )
  check(viewWindow(40, -3.5, 11_000, 9).n === 10, 'teselas: la distancia se recorta en 5')
  const demHalf = terrainTilesOf(win, 2)
  check(
    demHalf.samples === 256 && demHalf.stride === 2 && demHalf.blockX * 256 >= demHalf.offsetX + 512,
    'teselas: el DEM a media resolución cubre la misma ventana con la mitad de muestras',
  )
}

console.log('· Calidad gráfica y LOD del visor 3D…')
{
  check(
    MESH_SEGMENTS.alta > MESH_SEGMENTS.media && MESH_SEGMENTS.media > MESH_SEGMENTS.baja,
    'calidad: la malla baja reduce los vértices del terreno',
  )
  check(
    GROUND_TILE_PX.alta === 256 && GROUND_TILE_PX.baja < GROUND_TILE_PX.media,
    'calidad: las texturas del terreno bajan de resolución',
  )
  check(
    MODEL_TEXTURE_MAX.alta === 0 && MODEL_TEXTURE_MAX.media === 512 && MODEL_TEXTURE_MAX.baja === 256,
    'calidad: la textura del avión conserva el original o baja a 512/256',
  )
  check(
    MODEL_SIMPLIFY.baja < MODEL_SIMPLIFY.media && MODEL_SIMPLIFY.media < 1,
    'calidad: el LOD del avión reduce triángulos',
  )
  check(TERRAIN_STRIDE.alta === 1 && TERRAIN_STRIDE.baja === 2, 'calidad: el DEM se muestrea a la mitad en baja')
  check(!isPerformanceSettings({ mesh: 'alta' }), 'calidad: un ajuste incompleto no es válido')
  const normalized = normalizePerformance({ mesh: 'baja', textures: 'raro', resolution: 42 })
  check(
    normalized.mesh === 'baja' &&
      normalized.textures === 'alta' &&
      normalized.resolution === 'auto' &&
      normalized.map === 'auto',
    'calidad: los campos inválidos caen al valor por defecto',
  )
  check(
    viewerPixelRatio('1') === 1 && viewerPixelRatio('0.75') === 0.75 && MIN_AUTO_RATIO === 0.75,
    'calidad: resoluciones fijas del visor',
  )
  check(mapPixelRatio('rendimiento') === 1, 'calidad: el mapa en rendimiento dibuja un píxel por CSS px')

  const geometry = new SphereGeometry(1, 32, 32)
  const before = triangleCount(geometry)
  const simplified = await simplifyGeometry(geometry, 0.5)
  const after = triangleCount(simplified)
  check(before >= 1500, 'calidad: la esfera de prueba tiene detalle suficiente')
  check(
    after < before * 0.8 && after >= MODEL_MIN_TRIANGLES * 0.6,
    'calidad: la simplificación reduce triángulos sin destruir el modelo',
  )
  check(triangleCount(geometry) === before, 'calidad: la geometría original no se modifica')
}

console.log('· Interpolación de movimiento del visor 3D…')
{
  check(shortestArcDeg(350, 10) === 20 && shortestArcDeg(10, 350) === -20, 'movimiento: arco de rumbo más corto')
  const prev = { t: 0, lat: 40, lon: -3, altM: 10_000, headingDeg: 350, speedMs: 230, vsMs: 0, onGround: false }
  const last = { t: 1000, lat: 40.002, lon: -3, altM: 10_000, headingDeg: 10, speedMs: 230, vsMs: 0, onGround: false }
  const mid = motionTarget(prev, last, 500)
  check(Math.abs(mid.lat - 40.001) < 1e-9, 'movimiento: interpolación lineal entre informes')
  check(Math.abs(shortestArcDeg(0, mid.headingDeg)) < 1e-9, 'movimiento: el rumbo cruza el norte sin dar la vuelta')
  const stale = motionTarget(prev, last, 30_000)
  const travelledM = (stale.lat - last.lat) * 111_320
  check(travelledM > 200 && travelledM < 230 * 2.5, 'movimiento: la deriva muerta queda limitada a segundos')
  const single = motionTarget(null, { ...last, headingDeg: 0 }, 12_000)
  check(single.lat > last.lat && Math.abs(single.lon - last.lon) < 1e-6, 'movimiento: el primer informe avanza al norte')
  const sampler = new MotionSampler()
  sampler.push(prev)
  check(sampler.stateAt(0) !== null, 'movimiento: estado inicial disponible')
  sampler.push({ ...last, lat: 45 })
  const afterJump = sampler.stateAt(2000)
  check((afterJump?.lat ?? 0) > 44.9, 'movimiento: el teletransporte reinicia la pista')
}

if (failures > 0) {
  console.error(`\n✗ ${failures} comprobación(es) fallidas`)
  process.exit(1)
}
console.log('\n✓ Todas las comprobaciones OK')
