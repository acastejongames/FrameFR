/// <reference types="vite/client" />

/** Fingerprinted URL of a bundled 3D model (GLB) asset. */
declare module '*.glb?url' {
  const src: string
  export default src
}

interface ImportMetaEnv {
  /** Data provider used on first load: `demo` | `adsblol`. */
  readonly VITE_ADSB_PROVIDER?: string
  /** Glyph endpoint used to render aircraft callsign labels on the map. */
  readonly VITE_GLYPHS_URL?: string
  /** Default fleet size for the simulated provider. */
  readonly VITE_FLEET_SIZE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
