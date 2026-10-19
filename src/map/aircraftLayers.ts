import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { Map } from 'maplibre-gl'
import { buildAircraftIcons } from './aircraftIcons'
import { SELECTED_COLOR, TRAIL_COLOR } from './palette'
import { LABEL_FONT } from './style'

export const AIRCRAFT_SOURCE = 'framefr-aircraft'
export const TRAIL_SOURCE = 'framefr-trail'
export const AIRCRAFT_LAYER = 'framefr-aircraft-symbols'
export const AIRCRAFT_LABEL_LAYER = 'framefr-aircraft-labels'
export const TRAIL_GLOW_LAYER = 'framefr-trail-glow'
export const TRAIL_LAYER = 'framefr-trail-line'

/** Properties carried by every rendered aircraft feature. */
export interface AircraftFeatureProps {
  id: string
  callsign: string
  heading: number
  icon: string
  altitude: number
  selected: 0 | 1
  /** Commercial flight number, shown in the label when available. */
  label: string
}

export type AircraftFeature = Feature<Point, AircraftFeatureProps>
export type TrailFeature = Feature<LineString>

export const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] }

/**
 * Registers the sprite set, the GeoJSON sources and the render layers used to
 * draw traffic. Called once per style load (MapLibre wipes runtime layers when
 * the style changes).
 */
export function addAircraftLayers(map: Map): void {
  if (!map.getSource(AIRCRAFT_SOURCE)) {
    map.addSource(AIRCRAFT_SOURCE, { type: 'geojson', data: EMPTY_FC })
  }
  if (!map.getSource(TRAIL_SOURCE)) {
    map.addSource(TRAIL_SOURCE, { type: 'geojson', data: EMPTY_FC })
  }

  for (const [id, icon] of Object.entries(buildAircraftIcons())) {
    if (map.hasImage(id)) continue
    map.addImage(
      id,
      { width: icon.width, height: icon.height, data: icon.data },
      { pixelRatio: icon.pixelRatio },
    )
  }

  if (!map.getLayer(TRAIL_GLOW_LAYER)) {
    map.addLayer({
      id: TRAIL_GLOW_LAYER,
      type: 'line',
      source: TRAIL_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': TRAIL_COLOR,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 5, 10, 10],
        'line-opacity': 0.14,
        'line-blur': 2,
      },
    })
  }

  if (!map.getLayer(TRAIL_LAYER)) {
    map.addLayer({
      id: TRAIL_LAYER,
      type: 'line',
      source: TRAIL_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': TRAIL_COLOR,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 10, 2.2],
        'line-opacity': 0.85,
      },
    })
  }

  if (!map.getLayer(AIRCRAFT_LAYER)) {
    map.addLayer({
      id: AIRCRAFT_LAYER,
      type: 'symbol',
      source: AIRCRAFT_SOURCE,
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 2, 0.34, 5, 0.5, 8, 0.66, 11, 0.85, 14, 1],
        'icon-rotate': ['get', 'heading'],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-keep-upright': false,
      },
      paint: {
        'icon-opacity': ['case', ['==', ['get', 'selected'], 1], 1, 0.94],
      },
    })
  }

  if (!map.getLayer(AIRCRAFT_LABEL_LAYER)) {
    map.addLayer({
      id: AIRCRAFT_LABEL_LAYER,
      type: 'symbol',
      source: AIRCRAFT_SOURCE,
      minzoom: 6.5,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': LABEL_FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 6.5, 9, 10, 11],
        'text-offset': [0, 1.15],
        'text-anchor': 'top',
        'text-allow-overlap': false,
        'text-optional': true,
        'text-padding': 2,
        'text-max-width': 8,
      },
      paint: {
        'text-color': '#e8edf5',
        'text-halo-color': 'rgba(4, 6, 10, 0.92)',
        'text-halo-width': 1.2,
        'text-opacity': ['case', ['==', ['get', 'selected'], 1], 1, 0.72],
      },
    })
  }
}

export function setLabelsVisible(map: Map, visible: boolean): void {
  if (map.getLayer(AIRCRAFT_LABEL_LAYER)) {
    map.setLayoutProperty(AIRCRAFT_LABEL_LAYER, 'visibility', visible ? 'visible' : 'none')
  }
}

export function setTrailVisible(map: Map, visible: boolean): void {
  for (const layer of [TRAIL_LAYER, TRAIL_GLOW_LAYER]) {
    if (map.getLayer(layer)) {
      map.setLayoutProperty(layer, 'visibility', visible ? 'visible' : 'none')
    }
  }
}

/** Altitude bands rendered as a soft glow behind the selected aircraft icon. */
export const SELECTION_COLOR = SELECTED_COLOR
