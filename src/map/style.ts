import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import { GLYPH_FONT, OPENFREEMAP_STYLES_URL } from '@/config'
import { SATELLITE_TEMPLATE } from '@/data/mapTiles'

export type BasemapId = 'satellite' | 'positron' | 'bright' | 'liberty' | 'dark' | 'fiord' | '3d'

export interface BasemapOption {
  id: BasemapId
  label: string
  /** MapLibre style URL (vector styles); empty when the style is inline. */
  url: string
  /** Inline style for basemaps that are not served as a style document. */
  style?: StyleSpecification
  /** Camera tilt. Only the 3D view tilts; the rest stay flat as before. */
  pitch: number
  bearing: number
}

/** Credit required by the satellite provider (same source as the 3D ground). */
export const SATELLITE_ATTRIBUTION = 'Imágenes satelitales: Esri, Maxar, Earthstar Geographics'

/**
 * Real satellite imagery for the flat map, without an API key or registration.
 *
 * The very same Esri World Imagery raster the 3D viewer streams is declared as
 * a MapLibre raster source, so the 2D map gains a photographic basemap (it was
 * only available inside the 3D view) with no extra provider or token. The tile
 * template keeps Esri's `{z}/{y}/{x}` order: MapLibre resolves the placeholders
 * by name, so the URL stays valid.
 */
function satelliteStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'AeroScope · Satélite',
    sources: {
      satellite: {
        type: 'raster',
        tiles: [SATELLITE_TEMPLATE],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 19,
        attribution: SATELLITE_ATTRIBUTION,
      },
    },
    layers: [
      // Dark base so the map never flashes white while the first tiles decode.
      { id: 'fondo', type: 'background', paint: { 'background-color': '#0b0e12' } },
      {
        id: 'satelite',
        type: 'raster',
        source: 'satellite',
        paint: { 'raster-opacity': 1, 'raster-fade-duration': 120 },
      },
    ],
  }
}

/** Style to hand to MapLibre: an inline document or a style URL. */
export function basemapSource(option: BasemapOption): string | StyleSpecification {
  return option.style ?? option.url
}

/**
 * Basemaps offered in the settings panel. OpenFreeMap has no dedicated 3D
 * style: "3D" is Liberty, whose buildings are extruded, viewed with a tilt.
 */
export const BASEMAPS: BasemapOption[] = [
  {
    id: 'satellite',
    label: 'Satélite',
    url: '',
    style: satelliteStyle(),
    pitch: 0,
    bearing: 0,
  },
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

/* ------------------------------------------- basemap layer visibility */

export interface BasemapLayerVisibility {
  /** Point markers for places and points of interest. */
  placeIcons: boolean
  /** Text labels: settlements, regions, roads, waters and POI names. */
  names: boolean
  /** Administrative boundary lines. */
  borders: boolean
}

export const DEFAULT_BASEMAP_LAYERS: BasemapLayerVisibility = {
  placeIcons: true,
  names: true,
  borders: true,
}

export interface BasemapLayerClassification {
  placeIcon: boolean
  name: boolean
  border: boolean
}

interface StyleLayerSnapshot {
  id: string
  type: string
  'source-layer'?: string
  layout?: Record<string, unknown>
  paint?: Record<string, unknown>
}

interface CapturedBasemapLayer extends BasemapLayerClassification {
  id: string
  type: string
  visibility: 'visible' | 'none'
  iconOpacity: never
  textOpacity: never
  circleOpacity: never
}

const capturedByMap = new WeakMap<MapLibreMap, CapturedBasemapLayer[]>()

const nonEmpty = (value: unknown): boolean => value !== undefined && value !== null && value !== ''

export function classifyBasemapLayer(layer: StyleLayerSnapshot): BasemapLayerClassification {
  const id = layer.id.toLowerCase()
  const sourceLayer = (layer['source-layer'] ?? '').toLowerCase()
  const markerSource = ['place', 'poi', 'aeroway'].includes(sourceLayer)
  const markerId = /(^|[-_])(poi|place|aerodrome|airport)([-_]|$)/.test(id)
  return {
    border:
      sourceLayer === 'boundary' || /(^|[-_])(boundary|border|admin)([-_]|$)/.test(id),
    name: layer.type === 'symbol' && nonEmpty(layer.layout?.['text-field']),
    placeIcon:
      (layer.type === 'symbol' && nonEmpty(layer.layout?.['icon-image']) && (markerSource || markerId)) ||
      (layer.type === 'circle' && (markerSource || markerId)),
  }
}

/**
 * Called on every `style.load`: remembers the style's own visibility and
 * opacity expressions, then applies the user's three independent choices.
 * FrameFR's aircraft/weather layers are deliberately left untouched.
 */
export function captureBasemapLayers(
  map: MapLibreMap,
  visibility: BasemapLayerVisibility,
): void {
  const captured: CapturedBasemapLayer[] = []
  for (const rawLayer of map.getStyle().layers) {
    if (rawLayer.id.startsWith('framefr-') || rawLayer.id.startsWith('aeroscope-')) continue
    const layer = rawLayer as unknown as StyleLayerSnapshot
    captured.push({
      id: layer.id,
      type: layer.type,
      visibility: layer.layout?.visibility === 'none' ? 'none' : 'visible',
      iconOpacity: (layer.paint?.['icon-opacity'] ?? 1) as never,
      textOpacity: (layer.paint?.['text-opacity'] ?? 1) as never,
      circleOpacity: (layer.paint?.['circle-opacity'] ?? 1) as never,
      ...classifyBasemapLayer(layer),
    })
  }
  capturedByMap.set(map, captured)
  applyBasemapLayers(map, visibility)
}

export function setBasemapLayerVisibility(
  map: MapLibreMap,
  visibility: BasemapLayerVisibility,
): void {
  // Style still loading: the settings are applied again on `style.load`.
  if (!map.isStyleLoaded() || !capturedByMap.has(map)) return
  applyBasemapLayers(map, visibility)
}

function applyBasemapLayers(map: MapLibreMap, settings: BasemapLayerVisibility): void {
  for (const layer of capturedByMap.get(map) ?? []) {
    if (!map.getLayer(layer.id)) continue
    let visibility = layer.visibility
    if (layer.border && !settings.borders) visibility = 'none'
    // A layer that contains only markers or only text can be removed from
    // layout entirely. Mixed symbol layers keep layout and use opacity so
    // city dots and city names really can be toggled independently.
    if (layer.placeIcon && !layer.name && !settings.placeIcons) visibility = 'none'
    if (layer.name && !layer.placeIcon && !settings.names) visibility = 'none'
    map.setLayoutProperty(layer.id, 'visibility', visibility)

    if (layer.type === 'symbol') {
      if (layer.placeIcon) {
        map.setPaintProperty(layer.id, 'icon-opacity', settings.placeIcons ? layer.iconOpacity : 0)
      }
      if (layer.name) {
        map.setPaintProperty(layer.id, 'text-opacity', settings.names ? layer.textOpacity : 0)
      }
    } else if (layer.type === 'circle' && layer.placeIcon) {
      map.setPaintProperty(layer.id, 'circle-opacity', settings.placeIcons ? layer.circleOpacity : 0)
    }
  }
}

/**
 * Font stacks used by the callsign labels, tried in order. The first one that
 * the glyph endpoint can serve wins; if none is available MapLibre simply skips
 * the labels and the map keeps working.
 */
export const LABEL_FONT = [GLYPH_FONT, 'Open Sans Regular']
