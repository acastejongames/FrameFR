import type { Map as MapLibreMap } from 'maplibre-gl'
import { GLYPH_FONT, OPENFREEMAP_STYLES_URL } from '@/config'

export type BasemapId = 'positron' | 'bright' | 'liberty' | 'dark' | 'fiord' | '3d'

export interface BasemapOption {
  id: BasemapId
  label: string
  /** MapLibre style served by OpenFreeMap (no API key, no registration). */
  url: string
  /** Camera tilt. Only the 3D view tilts; the rest stay flat as before. */
  pitch: number
  bearing: number
}

/**
 * Basemaps offered in the settings panel. OpenFreeMap has no dedicated 3D
 * style: "3D" is Liberty, whose buildings are extruded, viewed with a tilt.
 */
export const BASEMAPS: BasemapOption[] = [
  { id: 'positron', label: 'Positron', url: `${OPENFREEMAP_STYLES_URL}/positron`, pitch: 0, bearing: 0 },
  { id: 'bright', label: 'Bright', url: `${OPENFREEMAP_STYLES_URL}/bright`, pitch: 0, bearing: 0 },
  { id: 'liberty', label: 'Liberty', url: `${OPENFREEMAP_STYLES_URL}/liberty`, pitch: 0, bearing: 0 },
  { id: 'dark', label: 'Dark', url: `${OPENFREEMAP_STYLES_URL}/dark`, pitch: 0, bearing: 0 },
  { id: 'fiord', label: 'Fiord', url: `${OPENFREEMAP_STYLES_URL}/fiord`, pitch: 0, bearing: 0 },
  { id: '3d', label: '3D', url: `${OPENFREEMAP_STYLES_URL}/liberty`, pitch: 60, bearing: -20 },
]

/** Dark matches the app's dark interface and the aircraft colour palette. */
export const DEFAULT_BASEMAP: BasemapId = 'dark'

const BASEMAP_BY_ID = new Map(BASEMAPS.map((option) => [option.id, option]))

export function getBasemap(id: BasemapId): BasemapOption {
  return BASEMAP_BY_ID.get(id) ?? BASEMAPS[0]
}

/* ------------------------------------------------- basemap names (labels) */

/** Original `layout.visibility` of every basemap symbol layer, per map. */
const savedVisibility = new WeakMap<MapLibreMap, Map<string, 'visible' | 'none'>>()

/**
 * Called on every `style.load`: remembers the visibility of the basemap's
 * symbol layers (names, POIs, road shields…) and applies the current setting.
 * Layers added by FrameFR are skipped.
 */
export function captureBasemapNames(map: MapLibreMap, visible: boolean): void {
  const saved = new Map<string, 'visible' | 'none'>()
  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol' || layer.id.startsWith('framefr-')) continue
    const layout = (layer as { layout?: { visibility?: 'visible' | 'none' } }).layout
    saved.set(layer.id, layout?.visibility === 'none' ? 'none' : 'visible')
  }
  savedVisibility.set(map, saved)
  applyBasemapNames(map, visible)
}

/** Shows or hides the basemap names, restoring each layer's original state. */
export function setBasemapNamesVisible(map: MapLibreMap, visible: boolean): void {
  // Style still loading: the setting is applied again on `style.load`.
  if (!map.isStyleLoaded()) return
  applyBasemapNames(map, visible)
}

function applyBasemapNames(map: MapLibreMap, visible: boolean): void {
  for (const [id, original] of savedVisibility.get(map) ?? []) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visible ? original : 'none')
    }
  }
}

/**
 * Font stacks used by the callsign labels, tried in order. The first one that
 * the glyph endpoint can serve wins; if none is available MapLibre simply skips
 * the labels and the map keeps working.
 */
export const LABEL_FONT = [GLYPH_FONT, 'Open Sans Regular']
