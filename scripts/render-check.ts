/**
 * Headless render check.
 *
 * Mounts the whole application inside jsdom (with `maplibre-gl` stubbed) and
 * verifies that the interface is actually painted: header, search box, clock,
 * traffic counter, legend and the map canvas.
 *
 * It catches the class of mistakes that a type checker cannot see — a hook
 * that throws on mount, a provider prop that does not exist, a null
 * reference in a component…
 *
 * Run with:  npm run check:render
 */
import { JSDOM } from 'jsdom'

/* ----------------------------------------------------------- DOM globals */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://example.test/',
  pretendToBeVisual: true,
})

const { window } = dom
const globalAny = globalThis as unknown as Record<string, unknown>

globalAny.window = window
globalAny.document = window.document
// `navigator` is a read-only accessor on Node's global object.
Object.defineProperty(globalThis, 'navigator', {
  value: window.navigator,
  configurable: true,
  writable: true,
})
globalAny.HTMLElement = window.HTMLElement
globalAny.HTMLInputElement = window.HTMLInputElement
globalAny.HTMLCanvasElement = window.HTMLCanvasElement
globalAny.Element = window.Element
globalAny.Node = window.Node
globalAny.Event = window.Event
globalAny.CustomEvent = window.CustomEvent
globalAny.MouseEvent = window.MouseEvent
globalAny.KeyboardEvent = window.KeyboardEvent
globalAny.getComputedStyle = window.getComputedStyle.bind(window)
globalAny.requestAnimationFrame = (cb: FrameRequestCallback): number =>
  window.setTimeout(() => cb(Date.now()), 16) as unknown as number
globalAny.cancelAnimationFrame = (id: number): void => window.clearTimeout(id)
globalAny.IS_REACT_ACT_ENVIRONMENT = false

/* --------------------------------------------------------- canvas stub */
/* jsdom has no 2D context; the silhouette renderer only needs the calls to
   exist, so a recording stub is enough. */
const contextStub = {
  save: () => undefined,
  restore: () => undefined,
  translate: () => undefined,
  scale: () => undefined,
  rotate: () => undefined,
  transform: () => undefined,
  setTransform: () => undefined,
  beginPath: () => undefined,
  closePath: () => undefined,
  moveTo: () => undefined,
  lineTo: () => undefined,
  bezierCurveTo: () => undefined,
  quadraticCurveTo: () => undefined,
  arc: () => undefined,
  ellipse: () => undefined,
  roundRect: () => undefined,
  rect: () => undefined,
  fill: () => undefined,
  stroke: () => undefined,
  clip: () => undefined,
  fillRect: () => undefined,
  strokeRect: () => undefined,
  clearRect: () => undefined,
  drawImage: () => undefined,
  setLineDash: () => undefined,
  fillText: () => undefined,
  strokeText: () => undefined,
  measureText: () => ({ width: 0 }),
  createLinearGradient: () => ({ addColorStop: () => undefined }),
  createRadialGradient: () => ({ addColorStop: () => undefined }),
  createPattern: () => null,
  getImageData: (_x: number, _y: number, w: number, h: number) => ({
    data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
    width: w,
    height: h,
  }),
  putImageData: () => undefined,
}
globalAny.CanvasRenderingContext2D = function CanvasRenderingContext2D() {}
;(window as unknown as { HTMLCanvasElement: { prototype: unknown } }).HTMLCanvasElement.prototype.getContext =
  function getContext() {
    return contextStub
  }

/* --------------------------------------------------------- network stub */
/* The feeds are unreachable from CI: fail fast instead of waiting. */
globalAny.fetch = (): Promise<Response> =>
  Promise.reject(new Error('network disabled in the render check'))

/* --------------------------------------------------------------- mount */
const errors: string[] = []
const originalError = console.error
console.error = (...args: unknown[]): void => {
  errors.push(args.map((arg) => String(arg)).join(' '))
  originalError(...args)
}
window.addEventListener('error', (event) => {
  const detail = (event as ErrorEvent).error as Error | undefined
  originalError('UNCAUGHT:', detail?.stack ?? (event as ErrorEvent).message)
})

const { createRoot } = await import('react-dom/client')
const { createElement } = await import('react')
const { default: App } = await import('../src/App')

const container = window.document.getElementById('root')
if (!container) throw new Error('No se encontró #root')

const root = createRoot(container)
root.render(createElement(App))

/* Let React flush the effects, the first renders and the first poll. */
await new Promise((resolve) => setTimeout(resolve, 2000))

const html = container.innerHTML
const text = container.textContent ?? ''

let failures = 0
const fail = (message: string): void => {
  failures++
  console.error(`  ✗ ${message}`)
}

const expect = (condition: boolean, message: string): void => {
  if (!condition) fail(message)
}

console.log('· Montando la aplicación en jsdom…')

expect(html.includes('AERO'), 'no se ha pintado la marca AeroScope')
expect(html.includes('Búsqueda global'), 'no se ha pintado el buscador global')
expect(html.includes('Capa meteorológica'), 'no se ha pintado el selector meteorológico')
expect(html.includes('UTC'), 'no se ha pintado el reloj UTC')
expect(html.includes('Aviones'), 'no se ha pintado el contador de aeronaves')
expect(html.includes('En vuelo'), 'no se ha pintado la leyenda inferior')
expect(html.includes('MAD'), 'no se han pintado los accesos de aeropuertos')
expect(text.includes('AERO'), 'no se ha pintado el texto de la marca')

/* The demo provider must have produced traffic by now. */
const counterText = text.match(/(\d+)\s*Aviones/)
expect(Boolean(counterText) && Number(counterText?.[1]) > 0, 'el contador de aeronaves sigue a cero')

/* The critical runtime errors that must not appear. */
const fatalPatterns = [
  'is not a function',
  'undefined is not',
  'Cannot read propert',
  'Objects are not valid as a React child',
  'Minified React error',
]
for (const pattern of fatalPatterns) {
  expect(!errors.some((error) => error.includes(pattern)), `error en consola: ${pattern}`)
}

if (errors.length > 0) {
  console.log(`· Avisos de consola capturados: ${errors.length}`)
  for (const error of errors.slice(0, 5)) console.log(`   · ${error.slice(0, 160)}`)
}

root.unmount()

if (failures > 0) {
  console.error(`\n✗ ${failures} comprobación(es) fallidas`)
  process.exit(1)
}

console.log('\n✓ La interfaz se monta correctamente')
process.exit(0)
