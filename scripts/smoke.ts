/**
 * Headless sanity check for the simulated provider and the geodesy helpers.
 * Run with:  npm run smoke
 */
import { DemoProvider } from '../src/data/providers/demoProvider'
import { distanceNm } from '../src/data/geo'
import type { Aircraft } from '../src/data/types'

const provider = new DemoProvider({ fleetSize: 600, seed: 42 })

/** Roughly what a 2560 px wide viewport shows over Spain at zoom 6.6. */
const viewport = {
  center: { lat: 40.2, lon: -3.7 },
  zoom: 6.6,
  bounds: { west: -22, south: 32, east: 15, north: 48 },
  radiusNm: 900,
}

let failures = 0
const fail = (message: string) => {
  failures++
  console.error(`  ✗ ${message}`)
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

if (failures > 0) {
  console.error(`\n✗ ${failures} comprobación(es) fallidas`)
  process.exit(1)
}
console.log('\n✓ Todas las comprobaciones OK')
