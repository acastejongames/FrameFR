/**
 * Application-wide constants and environment driven defaults.
 *
 * Everything that can reasonably be tweaked without touching the code lives
 * here so the app stays configurable per deployment (GitHub Pages, local...).
 */

/** Repository slug — used for the edit/about links and the Pages base path. */
export const REPO_URL = 'https://github.com/acastejongames/FrameFR'

/** Attribution shown for the raster basemap (CARTO + OpenStreetMap). */
export const BASEMAP_ATTRIBUTION = '© OpenStreetMap · © CARTO'

/**
 * Glyph endpoint used by MapLibre to rasterise the aircraft callsign labels.
 * Override with `VITE_GLYPHS_URL` if you host a different font stack.
 */
export const GLYPHS_URL =
  import.meta.env.VITE_GLYPHS_URL ?? 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'

/** Font stack requested from the glyph endpoint. */
export const GLYPH_FONT = 'Noto Sans Regular'

/** How often (ms) the rendered aircraft layer is refreshed. */
export const RENDER_INTERVAL_MS = 70

/** How often (ms) the React UI is refreshed with a new snapshot. */
export const UI_INTERVAL_MS = 500

/** Max number of rows rendered in the flight list (keeps React cheap). */
export const MAX_LIST_ROWS = 80

/** Number of points kept in the trail of the selected aircraft. */
export const TRAIL_LENGTH = 90

/** Camera presets offered in the settings menu. */
export interface ViewPreset {
  id: string
  label: string
  center: [number, number]
  zoom: number
}

export const VIEW_PRESETS: ViewPreset[] = [
  { id: 'world', label: 'Global', center: [10, 25], zoom: 2.6 },
  { id: 'europe', label: 'Europa', center: [8, 48], zoom: 5.7 },
  { id: 'spain', label: 'España', center: [-3.7, 40.2], zoom: 6.6 },
  { id: 'usa', label: 'EE. UU.', center: [-98, 39], zoom: 5.9 },
  { id: 'asiapacific', label: 'Asia-Pacífico', center: [120, 20], zoom: 5.2 },
]

/** Default camera on first load. */
export const DEFAULT_VIEW = {
  center: [-3.7, 40.2] as [number, number],
  zoom: 6.6,
}

/** Fleet sizes offered for the simulated provider. */
export const FLEET_SIZES = [250, 600, 1200] as const

/** Simulation speed multipliers. */
export const SPEED_FACTORS = [1, 2, 5] as const
