/**
 * Settings of the optional photogrammetry layer (no three.js imports).
 *
 * The data comes from **Cesium ion**, whose free Community plan includes
 * Google Photorealistic 3D Tiles (1,000 root tiles per month) and needs no
 * billing account and no prepayment: just a free access token. Nothing is
 * charged to the user's Google account.
 *
 * Kept separate from `photogrammetry.ts` on purpose: the settings dialog only
 * needs these tiny helpers, while the tile renderer itself is a heavy module
 * that must stay in a lazily loaded chunk.
 */

import { readStored, removeStored, writeStored } from '@/lib/storage'

/** Ion asset: Google Photorealistic 3D Tiles (global photogrammetry). */
export const CESIUM_ION_ASSET_ID = 2275207

/** Ion asset: Cesium OSM Buildings (no ground, useful as a light fallback). */
export const CESIUM_OSM_BUILDINGS_ASSET_ID = 96188

/** Public page where a free token is created (no card, no prepayment). */
export const CESIUM_ION_CONSOLE_URL = 'https://ion.cesium.com/tokens'

/** Asset depot entry, where the tileset is added to "My Assets". */
export const CESIUM_ION_ASSET_URL = `https://ion.cesium.com/assets/${CESIUM_ION_ASSET_ID}`

const TOKEN_STORAGE = 'cesium-ion-token'

/** Same-tab notification so an open viewer picks the new token immediately. */
export const TOKEN_EVENT = 'aeroscope:cesium-ion-token'

/** Metres the plane may drift before the tiles are re-anchored. */
export const REANCHOR_DRIFT_M = 40_000

/** `nokey` = the layer is enabled but this browser has no ion token yet. */
export type PhotogrammetryState = 'off' | 'nokey' | 'loading' | 'ready' | 'error'

/** Cesium ion token stored in this browser, or the build-wide one. */
export function cesiumIonToken(): string {
  const stored = readStored<string>(TOKEN_STORAGE, '')
  if (typeof stored === 'string' && stored.trim()) return stored.trim()
  const env = import.meta.env.VITE_CESIUM_ION_TOKEN
  return typeof env === 'string' ? env.trim() : ''
}

/** Saves (or clears, with an empty value) the ion token in this browser. */
export function setCesiumIonToken(token: string): void {
  const trimmed = token.trim()
  if (trimmed) writeStored(TOKEN_STORAGE, trimmed)
  else removeStored(TOKEN_STORAGE)
  // `storage` events do not fire in the tab that wrote the value.
  window.dispatchEvent(new Event(TOKEN_EVENT))
}

/** Summary for the settings panel, e.g. `eyJhb…Qw3k`. */
export function maskedIonToken(): string {
  const token = cesiumIonToken()
  if (!token) return ''
  if (token.length <= 10) return '••••'
  return `${token.slice(0, 5)}…${token.slice(-4)}`
}

/** True when the deployment ships a token at build time (no user action). */
export function hasBuildTimeIonToken(): boolean {
  const env = import.meta.env.VITE_CESIUM_ION_TOKEN
  return typeof env === 'string' && env.trim().length > 0
}
