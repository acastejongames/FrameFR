/**
 * Headless check of the photogrammetry layer (Cesium ion → Google 3D Tiles).
 *
 * Cesium ion cannot be reached from CI, so the network is mocked with the
 * exact shape of the real responses. What this proves, which is what actually
 * broke before:
 *
 *  - the token reaches the ion endpoint and the root tileset is loaded;
 *  - the tiles end up in the viewer's frame (+X east, +Y up, −Z north), which
 *    needs radians and a half turn of azimuth;
 *  - a rejected token produces a message a human can act on;
 *  - tearing the layer down does not throw (the GLTF plugin disposes loaders
 *    that were never passed).
 *
 * Run with:  npm run check:photo
 */
import { PerspectiveCamera, Vector3 } from 'three'
import { loadPhotogrammetry, type PhotogrammetryHandle } from '../src/data/photogrammetry'

const DEG = Math.PI / 180
const LAT = 39.55
const LON = 2.65

// The tiles renderer resolves relative URLs against `window.location` and
// schedules work with requestAnimationFrame; neither exists in Node.
const globals = globalThis as unknown as {
  window?: unknown
  requestAnimationFrame?: unknown
  cancelAnimationFrame?: unknown
}
globals.window ??= {
  location: { href: 'https://app.test/' },
  addEventListener() {},
  removeEventListener() {},
}
globals.requestAnimationFrame ??= () => 0
globals.cancelAnimationFrame ??= () => undefined

const TILESET = {
  asset: { version: '1.0' },
  geometricError: 0,
  root: {
    boundingVolume: { sphere: [0, 0, 0, 100] },
    geometricError: 0,
    content: { uri: 'tile.gltf' },
  },
}

let ionStatus = 200
const requests: string[] = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  requests.push(url)
  if (url.includes('api.cesium.com')) {
    if (ionStatus !== 200) return new Response('denied', { status: ionStatus })
    return new Response(
      JSON.stringify({
        type: '3DTILES',
        externalType: '3DTILES',
        // Shape of the real ion response for Google Photorealistic 3D Tiles.
        options: { url: 'https://tile.test/root.json?key=TEST' },
        attributions: [{ html: '<span>Google</span>', collapsible: false }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
  if (url.includes('root.json')) {
    return new Response(JSON.stringify(TILESET), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return new Response('not found', { status: 404 })
}) as typeof fetch

let failures = 0
const check = (condition: boolean, message: string): void => {
  if (!condition) failures += 1
  console.log(`${condition ? '✓' : '✗'} ${message}`)
}

const camera = new PerspectiveCamera(45, 1, 1, 1e6)
// Enough of a renderer for the tiles' screen-space error calculation.
const renderer = {
  getSize: (target: { set: (x: number, y: number) => unknown }) => target.set(1280, 720),
  getPixelRatio: () => 1,
} as unknown as Parameters<PhotogrammetryHandle['update']>[1]
const states: string[] = []
const errors: string[] = []

const handle = await loadPhotogrammetry({
  token: 'TEST-TOKEN',
  lat: LAT,
  lon: LON,
  quality: 'media',
  onState: (state) => states.push(state),
  onError: (message) => errors.push(message),
})
for (let step = 0; step < 20; step += 1) {
  handle.update(camera, renderer)
  await new Promise((resolve) => setTimeout(resolve, 10))
}

check(states[0] === 'loading', 'arranca en estado «loading»')
check(errors.length === 0, `la raíz carga sin errores (${errors.join(' | ') || 'ninguno'})`)
check(
  requests[0]?.startsWith('https://api.cesium.com/v1/assets/2275207/endpoint') === true &&
    requests[0].includes('access_token=TEST-TOKEN'),
  'pide el asset 2275207 con el token del usuario',
)
check(
  requests.some((url) => url.startsWith('https://tile.test/root.json')),
  'sigue la URL externa de Google que devuelve Cesium ion',
)

// Orientation: the tiles have to use the same axes as the aircraft and camera.
const lat = LAT * DEG
const lon = LON * DEG
const east = new Vector3(-Math.sin(lon), Math.cos(lon), 0).normalize()
const north = new Vector3(
  -Math.sin(lat) * Math.cos(lon),
  -Math.sin(lat) * Math.sin(lon),
  Math.cos(lat),
).normalize()
const up = new Vector3(
  Math.cos(lat) * Math.cos(lon),
  Math.cos(lat) * Math.sin(lon),
  Math.sin(lat),
).normalize()
const frame = handle.group.quaternion.clone().invert()
const x = new Vector3(1, 0, 0).applyQuaternion(frame)
const y = new Vector3(0, 1, 0).applyQuaternion(frame)
const z = new Vector3(0, 0, 1).applyQuaternion(frame)
check(x.dot(east) > 0.99, 'las teselas miran al este en +X')
check(y.dot(up) > 0.99, 'las teselas crecen hacia arriba en +Y')
check(z.dot(north) < -0.99, 'las teselas dejan el norte en −Z, como la escena')

let disposed = true
try {
  handle.dispose()
} catch {
  disposed = false
}
check(disposed, 'desmontar la capa no lanza excepciones')

// A rejected token must produce an actionable reason, not a blank screen.
ionStatus = 401
const rejected = await loadPhotogrammetry({
  token: 'BAD',
  lat: LAT,
  lon: LON,
  quality: 'media',
  onState: () => undefined,
  onError: (message) => errors.push(message),
})
rejected.update(camera, renderer)
await new Promise((resolve) => setTimeout(resolve, 30))
check(
  errors.some((message) => message.includes('401') && message.includes('token')),
  `un token rechazado explica el motivo (${errors.at(-1) ?? 'nada'})`,
)
rejected.dispose()

globalThis.fetch = realFetch

if (failures > 0) {
  console.error(`\n✗ ${failures} comprobación(es) fallidas`)
  process.exit(1)
}
console.log('\n✓ Fotogrametría OK')
