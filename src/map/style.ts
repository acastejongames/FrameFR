import { BASEMAP_ATTRIBUTION, GLYPH_FONT, GLYPHS_URL } from '@/config'
import type { MapOptions } from 'maplibre-gl'

export type StyleSpecification = Exclude<NonNullable<MapOptions['style']>, string>

/**
 * Dark, label-friendly basemap built on CARTO's "dark matter" raster tiles
 * (no API key required). Swap `VITE_MAP_STYLE_URL` for any MapLibre style to
 * use a vector basemap instead — nothing else in the app depends on it.
 */
export function createBaseStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'FrameFR Dark',
    glyphs: GLYPHS_URL,
    sources: {
      basemap: {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        ],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 20,
        attribution: BASEMAP_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#07080a' },
      },
      {
        id: 'basemap',
        type: 'raster',
        source: 'basemap',
        paint: {
          'raster-opacity': 1,
          'raster-fade-duration': 150,
          'raster-saturation': -0.1,
          'raster-contrast': -0.05,
        },
      },
    ],
  }
}

/** Font stack used by the callsign labels (must exist in the glyph endpoint). */
export const LABEL_FONT = [GLYPH_FONT]
