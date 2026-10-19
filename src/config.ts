/**
 * Application-wide constants and environment driven defaults.
 *
 * Everything that can reasonably be tweaked without touching the code lives
 * here so the app stays configurable per deployment (GitHub Pages, local...).
 */

/** Repository slug — used for the edit/about links and the Pages base path. */
export const REPO_URL = 'https://github.com/acastejongames/FrameFR'

/** Base URL of the OpenFreeMap style endpoint (one MapLibre style JSON per style). */
export const OPENFREEMAP_STYLES_URL = 'https://tiles.openfreemap.org/styles'

/**
 * Glyph endpoint used by MapLibre to rasterise the aircraft callsign labels.
 * Override with `VITE_GLYPHS_URL` if you host a different font stack.
 */
export const GLYPHS_URL =
  import.meta.env.VITE_GLYPHS_URL ?? 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'

/** Font stack requested from the glyph endpoint. */
export const GLYPH_FONT = 'Noto Sans Regular'

/** How often (ms) the React UI is refreshed with a new snapshot. */
export const UI_INTERVAL_MS = 400

/** Max number of rows rendered in the flight table (keeps React cheap). */
export const MAX_LIST_ROWS = 120

/** Number of points kept in the trail of the selected aircraft. */
export const TRAIL_LENGTH = 250

/** Polling cadences offered in the settings panel. */
export const POLL_INTERVALS = [
  { value: 2_500, label: 'Rápida (2,5 s)' },
  { value: 4_000, label: 'Estándar (4,0 s)' },
  { value: 6_000, label: 'Moderada (6,0 s)' },
  { value: 10_000, label: 'Ahorro (10,0 s)' },
] as const

/** Maximum number of aircraft rendered on the map. */
export const MAX_AIRCRAFT_OPTIONS = [200, 350, 550, 750] as const

/** Default number of aircraft rendered on the map. */
export const DEFAULT_MAX_AIRCRAFT = 550

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

/** Which panels of the interface can be hidden from the settings. */
export interface GuiVisibility {
  clock: boolean
  counter: boolean
  hubs: boolean
  compass: boolean
  legend: boolean
  bottomControls: boolean
}

export const DEFAULT_GUI_VISIBILITY: GuiVisibility = {
  clock: true,
  counter: true,
  hubs: true,
  compass: true,
  legend: true,
  bottomControls: true,
}

/** The only interface scales offered by the settings. */
export const INTERFACE_SCALES = [0.9, 1, 1.25] as const
export type InterfaceScale = (typeof INTERFACE_SCALES)[number]

/**
 * Migrates a stored scale to the nearest supported one. This also turns the
 * former ×0.5 / ×2 preferences into ×0.9 / ×1.25 instead of discarding the
 * user's relative choice (smaller or larger than normal).
 */
export function normalizeInterfaceScale(value: unknown): InterfaceScale {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 1
  return INTERFACE_SCALES.reduce<InterfaceScale>(
    (closest, scale) => (Math.abs(scale - numeric) < Math.abs(closest - numeric) ? scale : closest),
    1,
  )
}

/** Merges visibility objects saved by older versions with current defaults. */
export function normalizeGuiVisibility(value: unknown): GuiVisibility {
  if (!value || typeof value !== 'object') return { ...DEFAULT_GUI_VISIBILITY }
  const stored = value as Partial<Record<keyof GuiVisibility, unknown>>
  const booleanOrDefault = (key: keyof GuiVisibility): boolean =>
    typeof stored[key] === 'boolean' ? stored[key] : DEFAULT_GUI_VISIBILITY[key]
  return {
    clock: booleanOrDefault('clock'),
    counter: booleanOrDefault('counter'),
    hubs: booleanOrDefault('hubs'),
    compass: booleanOrDefault('compass'),
    legend: booleanOrDefault('legend'),
    bottomControls: booleanOrDefault('bottomControls'),
  }
}

/** How the traffic table is sorted. */
export type SortKey = 'alt' | 'spd' | 'callsign'

export const DEFAULT_SORT_KEY: SortKey = 'alt'
