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
  /**
   * Cesium ion access token for the optional photorealistic 3D tiles.
   * The free Community plan includes the Google tileset (no card); without a
   * token the viewer keeps the satellite imagery and the elevation relief.
   */
  readonly VITE_CESIUM_ION_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
