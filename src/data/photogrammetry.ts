/**
 * Optional photogrammetry layer: Google Photorealistic 3D Tiles.
 *
 * These are the same "3D Tiles" Google Earth streams: real terrain, buildings
 * and trees reconstructed from aerial imagery at 1:1. They are **not** free
 * data: the Google Maps Platform "Map Tiles API" needs a billing account and
 * an API key, which the user pastes in Settings and which is only kept in this
 * browser's localStorage (never in the bundle or the repository).
 *
 * The whole module is loaded on demand (`loadPhotogrammetry`), so the hundreds
 * of kB of the 3D Tiles renderer never reach users who keep the satellite
 * ground (statically importing it added ~690 kB to the main chunk).
 */

import type { Group } from 'three'
import type { QualityTier } from '@/data/quality'
import { GOOGLE_TILES_URL, type PhotogrammetryState } from '@/data/photogrammetrySettings'

/** Detail budget per quality tier (lower error target = sharper tiles). */
const ERROR_TARGET: Record<QualityTier, number> = { alta: 6, media: 12, baja: 24 }
/** Hard ceiling of tile depth, to protect low-end GPUs from city centres. */
const MAX_DEPTH: Record<QualityTier, number> = { alta: 26, media: 20, baja: 16 }

export interface PhotogrammetryHandle {
  /** Object to add to the scene (the tiles' own group). */
  group: Group
  /** Streams the tiles around the camera (call once per frame). */
  update: (camera: unknown, renderer: unknown) => void
  /** True once at least one tile has been rendered. */
  loaded: () => boolean
  /** Number of tiles currently displayed (diagnostics). */
  visibleTiles: () => number
  dispose: () => void
}

export interface CreatePhotogrammetryOptions {
  key: string
  lat: number
  lon: number
  quality: QualityTier
  onState: (state: PhotogrammetryState) => void
}

/**
 * Builds the tiles renderer anchored at a position.
 *
 * The tiles are placed in their own local frame (up = +Y, north = -Z, metres)
 * via `ReorientationPlugin`, which is the same frame as the rest of the
 * viewer, so the aircraft, its altitude and the camera keep working unchanged.
 */
export async function loadPhotogrammetry(
  options: CreatePhotogrammetryOptions,
): Promise<PhotogrammetryHandle> {
  const { TilesRenderer } = await import('3d-tiles-renderer')
  const { GoogleCloudAuthPlugin, ReorientationPlugin } = await import('3d-tiles-renderer/plugins')
  const { key, lat, lon, quality, onState } = options

  const tiles = new TilesRenderer(GOOGLE_TILES_URL)
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: key, autoRefreshToken: true }))
  tiles.registerPlugin(new ReorientationPlugin({ lat, lon, height: 0, recenter: false }))
  tiles.errorTarget = ERROR_TARGET[quality]
  tiles.maxDepth = MAX_DEPTH[quality]
  tiles.autoDisableRendererCulling = false

  let loadedOnce = false
  onState('loading')
  tiles.addEventListener('load-model', () => {
    if (loadedOnce) return
    loadedOnce = true
    onState('ready')
  })
  tiles.addEventListener('load-error', () => {
    // Bad key, quota exhausted or no coverage: keep the satellite ground.
    onState('error')
  })

  return {
    group: tiles.group as unknown as Group,
    update: (camera, renderer) => {
      const cam = camera as Parameters<typeof tiles.setCamera>[0]
      const gl = renderer as Parameters<typeof tiles.setResolutionFromRenderer>[1]
      if (camera) tiles.setCamera(cam)
      if (camera && renderer) tiles.setResolutionFromRenderer(cam, gl)
      tiles.update()
    },
    loaded: () => loadedOnce,
    visibleTiles: () => tiles.visibleTiles.size,
    dispose: () => {
      tiles.dispose()
      tiles.group.removeFromParent()
    },
  }
}
