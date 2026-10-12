/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Data provider used on first load: `demo` | `adsblol`. */
  readonly VITE_ADSB_PROVIDER?: string
  /** Override the basemap style URL (any MapLibre compatible style.json). */
  readonly VITE_MAP_STYLE_URL?: string
  /** Glyph endpoint used to render aircraft callsign labels on the map. */
  readonly VITE_GLYPHS_URL?: string
  /** Default fleet size for the simulated provider. */
  readonly VITE_FLEET_SIZE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
