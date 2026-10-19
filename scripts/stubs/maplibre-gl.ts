/**
 * Stub of `maplibre-gl` used by the headless render check.
 *
 * The real library needs WebGL, which jsdom does not provide. This stub
 * implements just enough of the API for the app to mount: the map reports a
 * plausible viewport and swallows every styling call.
 */

interface FakeCanvas {
  style: Record<string, string>
  addEventListener: (event: string, handler: (event: never) => void) => void
  removeEventListener: (event: string, handler: (event: never) => void) => void
  dispatchEvent: (event: { type: string }) => boolean
  setPointerCapture: () => void
  hasPointerCapture: () => boolean
  releasePointerCapture: () => void
}

export class Map {
  static instances: Map[] = []

  container: unknown
  style: unknown
  options: Record<string, unknown>
  dragPan = { enable: () => undefined, disable: () => undefined }
  // NOTE: the field cannot be called `Map`: inside the class body the name
  // would resolve to the class itself instead of the global constructor.
  private handlers = new globalThis.Map<string, Set<(payload?: unknown) => void>>()
  private center = { lat: 40.2, lng: -3.7 }
  private zoom = 6.6
  private pitch = 0
  private bearing = 0
  private maxPitch = 70
  private canvasListeners = new globalThis.Map<string, Set<(event: never) => void>>()
  private canvas: FakeCanvas = {
    style: {},
    addEventListener: (event, handler) => {
      const handlers = this.canvasListeners.get(event) ?? new Set()
      handlers.add(handler)
      this.canvasListeners.set(event, handlers)
    },
    removeEventListener: (event, handler) => {
      this.canvasListeners.get(event)?.delete(handler)
    },
    dispatchEvent: (event) => {
      for (const handler of this.canvasListeners.get(event.type) ?? []) {
        handler(event as never)
      }
      return true
    },
    setPointerCapture: () => undefined,
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
  }

  constructor(
    options: {
      container?: unknown
      style?: unknown
      center?: [number, number]
      zoom?: number
      pitch?: number
      bearing?: number
      maxPitch?: number
      dragRotate?: boolean
    } = {},
  ) {
    this.container = options.container
    this.style = options.style
    this.options = options as Record<string, unknown>
    if (options.center) this.center = { lng: options.center[0], lat: options.center[1] }
    if (typeof options.zoom === 'number') this.zoom = options.zoom
    if (typeof options.pitch === 'number') this.pitch = options.pitch
    if (typeof options.bearing === 'number') this.bearing = options.bearing
    if (typeof options.maxPitch === 'number') this.maxPitch = options.maxPitch
    Map.instances.push(this)
    // MapLibre fires `load` and `style.load` once the style is ready.
    setTimeout(() => {
      this.emit('style.load')
      this.emit('load')
    }, 0)
  }

  /** Notifies the listeners registered for an event. */
  emit(event: string, payload?: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(payload)
  }

  on(event: string, handler: (payload?: unknown) => void): this {
    const set = this.handlers.get(event) ?? new Set()
    set.add(handler)
    this.handlers.set(event, set)
    return this
  }

  off(event: string, handler?: (payload?: unknown) => void): this {
    if (!handler) this.handlers.delete(event)
    else this.handlers.get(event)?.delete(handler)
    return this
  }

  remove(): void {
    this.handlers.clear()
  }

  getCanvas(): FakeCanvas {
    return this.canvas
  }

  getCenter(): { lat: number; lng: number } {
    return { ...this.center }
  }

  getZoom(): number {
    return this.zoom
  }

  getPitch(): number {
    return this.pitch
  }

  getBearing(): number {
    return this.bearing
  }

  getMaxPitch(): number {
    return this.maxPitch
  }

  getBounds(): {
    getNorthEast: () => { lat: number; lng: number }
    getSouthWest: () => { lat: number; lng: number }
    getWest: () => number
    getEast: () => number
    getSouth: () => number
    getNorth: () => number
  } {
    return {
      getNorthEast: () => ({ lat: 50, lng: 10 }),
      getSouthWest: () => ({ lat: 30, lng: -20 }),
      getWest: () => -20,
      getEast: () => 10,
      getSouth: () => 30,
      getNorth: () => 50,
    }
  }

  getSource(): undefined {
    return undefined
  }

  getLayer(): undefined {
    return undefined
  }

  getStyle(): { layers: unknown[] } {
    return { layers: [] }
  }

  addSource(): void {}
  addLayer(): void {}
  removeLayer(): void {}
  addImage(): void {}
  hasImage(): boolean {
    return false
  }
  setLayoutProperty(): void {}
  setPaintProperty(): void {}
  setFilter(): void {}
  setMaxPitch(maxPitch: number): void {
    this.maxPitch = maxPitch
  }
  setStyle(): void {}
  isStyleLoaded(): boolean {
    return true
  }
  queryRenderedFeatures(): unknown[] {
    return []
  }
  easeTo(options: { center?: [number, number]; zoom?: number; pitch?: number; bearing?: number } = {}): void {
    this.applyCamera(options)
  }
  flyTo(options: { center?: [number, number]; zoom?: number; pitch?: number; bearing?: number } = {}): void {
    this.applyCamera(options)
  }
  jumpTo(options: { center?: [number, number]; zoom?: number; pitch?: number; bearing?: number } = {}): void {
    this.applyCamera(options)
  }

  private applyCamera(options: {
    center?: [number, number]
    zoom?: number
    pitch?: number
    bearing?: number
  }): void {
    if (options.center) this.center = { lng: options.center[0], lat: options.center[1] }
    if (typeof options.zoom === 'number') this.zoom = options.zoom
    if (typeof options.pitch === 'number') this.pitch = options.pitch
    if (typeof options.bearing === 'number') this.bearing = options.bearing
    this.emit('rotate')
    this.emit('move')
  }
}

export class Popup {
  setLngLat(): this {
    return this
  }
  setHTML(): this {
    return this
  }
  setText(): this {
    return this
  }
  addTo(): this {
    return this
  }
  remove(): void {}
}

export class NavigationControl {
  constructor(_options?: unknown) {}
}

export class ScaleControl {
  constructor(_options?: unknown) {}
}

export type MapLayerMouseEvent = { features?: Array<{ properties?: Record<string, unknown> | null }> }
export type MapMouseEvent = { point: { x: number; y: number } }
export type GeoJSONSource = { setData: (data: unknown) => Promise<void> }
export type StyleSpecification = Record<string, unknown>
export type MapOptions = Record<string, unknown>
