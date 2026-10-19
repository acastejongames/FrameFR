/**
 * Stub of `maplibre-gl` used by the headless render check.
 *
 * The real library needs WebGL, which jsdom does not provide. This stub
 * implements just enough of the API for the app to mount: the map reports a
 * plausible viewport and swallows every styling call.
 */

export class Map {
  container: unknown
  style: unknown
  // NOTE: the field cannot be called `Map`: inside the class body the name
  // would resolve to the class itself instead of the global constructor.
  private handlers = new globalThis.Map<string, Set<(payload?: unknown) => void>>()

  constructor(options: { container?: unknown; style?: unknown } = {}) {
    this.container = options.container
    this.style = options.style
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

  getCanvas(): { style: Record<string, string> } {
    return { style: {} }
  }

  getCenter(): { lat: number; lng: number } {
    return { lat: 40.2, lng: -3.7 }
  }

  getZoom(): number {
    return 6.6
  }

  getPitch(): number {
    return 0
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
  setMaxPitch(): void {}
  setStyle(): void {}
  isStyleLoaded(): boolean {
    return true
  }
  queryRenderedFeatures(): unknown[] {
    return []
  }
  easeTo(): void {}
  flyTo(): void {}
  jumpTo(): void {}
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
