/**
 * Settings of the optional photogrammetry layer (no three.js imports).
 *
 * Kept separate from `photogrammetry.ts` on purpose: the settings dialog only
 * needs these tiny helpers, while the tile renderer itself is a heavy module
 * that must stay in a lazily loaded chunk.
 */

import { readStored, removeStored, writeStored } from '@/lib/storage'

/** Root tileset of the Google Photorealistic 3D Tiles. */
export const GOOGLE_TILES_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json'

const KEY_STORAGE = 'google-tiles-key'

/** Metres the plane may drift before the tiles are re-anchored. */
export const REANCHOR_DRIFT_M = 40_000

/** `nokey` = the layer is enabled but this browser has no Google key yet. */
export type PhotogrammetryState = 'off' | 'nokey' | 'loading' | 'ready' | 'error'

/** API key stored in this browser, or the deployment-wide one from the build. */
export function googleTilesKey(): string {
  const stored = readStored<string>(KEY_STORAGE, '')
  if (typeof stored === 'string' && stored.trim()) return stored.trim()
  const env = import.meta.env.VITE_GOOGLE_3D_TILES_KEY
  return typeof env === 'string' ? env.trim() : ''
}

/** Saves (or clears, with an empty value) the API key in this browser. */
export function setGoogleTilesKey(key: string): void {
  const trimmed = key.trim()
  if (trimmed) writeStored(KEY_STORAGE, trimmed)
  else removeStored(KEY_STORAGE)
}

/** Summary for the settings panel: masked key, e.g. `AIza…7f3c`. */
export function maskedTilesKey(): string {
  const key = googleTilesKey()
  if (!key) return ''
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 4)}…${key.slice(-4)}`
}

/** True when the deployment ships a key at build time (no user action needed). */
export function hasBuildTimeTilesKey(): boolean {
  const env = import.meta.env.VITE_GOOGLE_3D_TILES_KEY
  return typeof env === 'string' && env.trim().length > 0
}
