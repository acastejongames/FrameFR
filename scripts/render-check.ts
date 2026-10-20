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
globalAny.HTMLTextAreaElement = window.HTMLTextAreaElement
globalAny.HTMLSelectElement = window.HTMLSelectElement
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
const { Map: StubMap } = (await import('maplibre-gl')) as unknown as {
  Map: { instances: Array<Record<string, any>> }
}

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

console.log('· Herramientas: desplegables, teclado, exclusión mutua y modo limpio…')
const flush = () => new Promise(resolve => setTimeout(resolve, 40))

console.log('· Navegación 3D con botón central y brújula…')
const stubMap = StubMap.instances.at(-1)!
expect(stubMap.options.dragRotate === false, 'el arrastre con botón derecho debe estar desactivado')
const stubCanvas = stubMap.getCanvas()
const pointerEvent = (type: string, values: Record<string, unknown>) => ({
  type,
  pointerId: 7,
  button: 0,
  buttons: 0,
  clientX: 0,
  clientY: 0,
  preventDefault: () => undefined,
  stopPropagation: () => undefined,
  ...values,
})
stubCanvas.dispatchEvent(pointerEvent('pointerdown', { button: 2, buttons: 2, clientX: 100, clientY: 100 }))
stubCanvas.dispatchEvent(pointerEvent('pointermove', { button: 2, buttons: 2, clientX: 180, clientY: 60 }))
expect(stubMap.getBearing() === 0 && stubMap.getPitch() === 0, 'el botón derecho no rota ni inclina el mapa')
stubCanvas.dispatchEvent(pointerEvent('pointerdown', { button: 1, buttons: 4, clientX: 100, clientY: 100 }))
stubCanvas.dispatchEvent(pointerEvent('pointermove', { button: 1, buttons: 4, clientX: 200, clientY: 60 }))
stubCanvas.dispatchEvent(pointerEvent('pointerup', { button: 1, buttons: 0, clientX: 200, clientY: 60 }))
expect(Math.abs(stubMap.getBearing() - 35) < 0.001, 'botón central + movimiento horizontal rota el mapa')
expect(Math.abs(stubMap.getPitch() - 10) < 0.001, 'botón central + movimiento vertical inclina el mapa')
await flush()
const compassDial = () => container.querySelector<HTMLElement>('.map-compass-dial')
expect(compassDial()?.style.transform === 'rotate(-35deg)', 'la brújula contrarota con el mapa')
container.querySelector<HTMLButtonElement>('.map-compass')!.click()
await flush()
expect(Math.abs(stubMap.getBearing()) < 0.001, 'pulsar la brújula restablece el norte')
expect(compassDial()?.style.transform === 'rotate(0deg)', 'la brújula vuelve al norte')

const weatherTrigger = container.querySelector<HTMLButtonElement>('[aria-controls="weather-tools"]')!
const mapTrigger = container.querySelector<HTMLButtonElement>('[aria-controls="map-tools"]')!
const weatherPanel = container.querySelector<HTMLElement>('#weather-tools')!
const mapPanel = container.querySelector<HTMLElement>('#map-tools')!
expect(weatherPanel.hidden && mapPanel.hidden, 'los paneles deben comenzar cerrados')
weatherTrigger.click()
await flush()
expect(!weatherPanel.hidden && weatherTrigger.getAttribute('aria-expanded') === 'true', 'meteorología no abre')
expect(window.document.activeElement?.getAttribute('aria-label') === 'Cerrar Meteorología', 'foco inicial del desplegable')
mapTrigger.click()
await flush()
expect(weatherPanel.hidden && !mapPanel.hidden, 'solo puede haber un desplegable abierto')
window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
await flush()
expect(mapPanel.hidden && window.document.activeElement === mapTrigger, 'Escape debe cerrar y restaurar foco')
weatherTrigger.click()
await flush()
window.document.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true }))
await flush()
expect(weatherPanel.hidden, 'clic fuera debe cerrar meteorología')
const labels = container.querySelector<HTMLButtonElement>('[title="Mostrar u ocultar etiquetas de vuelo"]')!
labels.click()
await flush()
expect(labels.getAttribute('aria-pressed') === 'false', 'etiquetas debe actualizar su estado accesible')
container.querySelector<HTMLButtonElement>('[title="Ocultar interfaz (U)"]')!.click()
await flush()
expect(window.document.body.classList.contains('ui-clean-mode'), 'no se activa el modo limpio')
expect(!container.querySelector('.restore-ui'), 'modo limpio no debe dejar botones visibles')
expect(container.querySelector('.ui-overlay')?.hasAttribute('inert') ?? false, 'UI oculta no debe aceptar foco')
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'u', bubbles: true }))
await flush()
expect(!window.document.body.classList.contains('ui-clean-mode'), 'U debe recuperar la interfaz')
expect(container.querySelectorAll('#map-tools .basemap-option').length === 6, 'todos los mapas disponibles en la barra')
mapTrigger.click()
await flush()
const layerToggles = [...container.querySelectorAll<HTMLButtonElement>('#map-tools .map-layer-toggle')]
expect(layerToggles.length === 3, 'faltan iconos/nombres/fronteras del mapa base')
layerToggles[1].click()
await flush()
expect(layerToggles[1].getAttribute('aria-pressed') === 'false', 'nombres del mapa no cambia de estado')
expect(JSON.parse(window.localStorage.getItem('aeroscope:map-layers') ?? '{}').names === false, 'capas del mapa no persistidas')
window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
await flush()
expect(!text.includes('Zoom de seguimiento'), 'la ficha no debe incluir zoom de seguimiento')
expect(Boolean(container.querySelector('header .airport-strip')), 'aeropuertos integrados en cabecera')
expect(Boolean(container.querySelector('.map-compass')), 'brújula visible junto al mapa')
container.querySelector<HTMLButtonElement>('.map-compass')!.click()
await flush()
container.querySelector<HTMLButtonElement>('[aria-label="Ajustes"]')!.click()
await flush()
const settingsDialog = container.querySelector<HTMLElement>('[role="dialog"]')!
const settingsTabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
expect(settingsTabs.map((tab) => tab.textContent?.trim()).join('|') === 'General|Interfaz|Telemetría', 'ajustes divididos en tres pestañas')
expect(settingsTabs[0].getAttribute('aria-selected') === 'true', 'General es la pestaña inicial')
expect(!settingsDialog.textContent?.includes('Modo limpio'), 'Modo limpio no debe duplicarse en Ajustes')
expect(!settingsDialog.textContent?.includes('Configurar aeropuertos y carpetas'), 'aeropuertos no debe duplicarse en Ajustes')
const backgroundToggle = container.querySelector<HTMLInputElement>('#background-updates')!
expect(backgroundToggle.checked, 'actualizaciones en segundo plano activadas por defecto')
backgroundToggle.click()
await flush()
expect(window.localStorage.getItem('aeroscope:background-updates') === 'false', 'segundo plano desactivado persistido')
backgroundToggle.click()
await flush()
expect(window.localStorage.getItem('aeroscope:background-updates') === 'true', 'segundo plano reactivado persistido')
settingsTabs[1].click()
await flush()
expect(settingsTabs[1].getAttribute('aria-selected') === 'true', 'pestaña Interfaz seleccionable')
const scale = container.querySelector<HTMLSelectElement>('#ui-scale')!
expect(Boolean(scale), 'selector de escala presente en Interfaz')
expect([...scale.options].map((option) => option.value).join('|') === '0.9|1|1.25', 'escalas ×0.9, ×1 y ×1.25')
scale.value = '1.25'
scale.dispatchEvent(new window.Event('change', { bubbles: true }))
await flush()
expect(container.querySelector<HTMLElement>('.ui-overlay')?.style.transform === 'scale(1.25)', 'escala aplicada solo a UI')
expect(window.localStorage.getItem('aeroscope:ui-scale') === '1.25', 'escala persistida')
const compassToggle = [...container.querySelectorAll<HTMLLabelElement>('label')]
  .find((label) => label.textContent?.trim() === 'Brújula')
  ?.querySelector<HTMLInputElement>('input')!
expect(Boolean(compassToggle), 'interruptor de brújula en Interfaz')
compassToggle.click()
await flush()
expect(!container.querySelector('.map-compass'), 'la brújula se puede ocultar desde Ajustes')
compassToggle.click()
await flush()
expect(Boolean(container.querySelector('.map-compass')), 'la brújula se puede volver a mostrar')
settingsTabs[2].click()
await flush()
expect(Boolean(container.querySelector('#telemetry-provider')), 'proveedor ADS-B en Telemetría')
expect(Boolean(container.querySelector('#telemetry-poll-interval')), 'frecuencia en Telemetría')
container.querySelector<HTMLButtonElement>('[aria-label="Cerrar ajustes"]')!.click()
await flush()
const madButton = [...container.querySelectorAll<HTMLButtonElement>('header button')]
  .find((button) => button.textContent?.trim().startsWith('MAD'))
expect(Boolean(madButton), 'acceso MAD disponible para comprobar el vuelo de cámara')
madButton!.click()
await flush()
expect(!container.textContent?.includes('Volando a'), 'sin aviso «Volando a» al mover la cámara')

console.log('· Vista 3D con modelos orbitales…')
const { matchAircraft3D } = await import('../src/data/aircraft3d')
const tableTrigger = container.querySelector<HTMLButtonElement>('[aria-label="Tabla de tráfico"]')!
tableTrigger.click()
await flush()
const typeTokenOf = (button: HTMLButtonElement): string | null => {
  for (const span of button.querySelectorAll('span')) {
    const token = span.textContent?.trim() ?? ''
    if (/^[A-Za-z0-9]{3,5}$/.test(token) && matchAircraft3D(token)) return token
  }
  return null
}
const currentRows = (): HTMLButtonElement[] =>
  [...container.querySelectorAll<HTMLButtonElement>('aside.flight-side-right button')].filter((button) =>
    /kts/.test(button.textContent ?? ''),
  )
const compatibleRow = currentRows().find(typeTokenOf)
expect(Boolean(compatibleRow), 'la tabla debe contener un avión con modelo 3D')
compatibleRow!.click()
await flush()
await new Promise((resolve) => setTimeout(resolve, 600))
const detailPanel = container.querySelector<HTMLElement>('aside.flight-side-left')!
const viewerTrigger = [...detailPanel.querySelectorAll<HTMLButtonElement>('button')]
  .find((button) => button.textContent?.trim() === 'Vista 3D')
expect(Boolean(viewerTrigger), 'avión compatible muestra el botón Vista 3D')
expect(
  [...detailPanel.querySelectorAll<HTMLButtonElement>('button')].some(
    (button) => button.textContent?.trim() === 'Inclinación',
  ),
  'el control de inclinación sigue disponible',
)
viewerTrigger!.click()
await new Promise((resolve) => setTimeout(resolve, 900))
const viewerDialog = container.querySelector<HTMLElement>('[role="dialog"][aria-label^="Vista 3D de"]')
expect(Boolean(viewerDialog), 'el visor 3D abre su diálogo')
expect(viewerDialog?.textContent?.includes('escala 1:1') ?? false, 'el visor declara la escala 1:1')
expect(viewerDialog?.textContent?.includes('Altitud real') ?? false, 'el visor muestra la altitud real sobre el mapa')
expect(viewerDialog?.textContent?.includes('orbitar') ?? false, 'el visor explica cómo orbitar la cámara')
expect(
  viewerDialog?.textContent?.includes('Distancia de renderizado') ?? false,
  'el visor ofrece la distancia de renderizado',
)
expect(Boolean(viewerDialog?.querySelector('[aria-label="Distancia de renderizado ×5"]')), 'el visor llega a ×5')
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
await flush()
expect(!container.querySelector('[role="dialog"][aria-label^="Vista 3D de"]'), 'Escape cierra el visor 3D')
// The traffic table keeps re-rendering as the demo fleet moves; pick the
// incompatible row from the live DOM immediately before clicking it.
const incompatibleRow = currentRows().find(
  (button) => !typeTokenOf(button) && !/Vista 3D/.test(button.textContent ?? ''),
)
if (incompatibleRow) {
  incompatibleRow.click()
  await flush()
  await new Promise((resolve) => setTimeout(resolve, 300))
  const incompatiblePanel = container.querySelector<HTMLElement>('aside.flight-side-left')!
  expect(
    ![...incompatiblePanel.querySelectorAll<HTMLButtonElement>('button')].some(
      (button) => button.textContent?.trim() === 'Vista 3D',
    ),
    'avión sin modelo no ofrece Vista 3D',
  )
}

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
