/**
 * Optional photogrammetry layer: Google Photorealistic 3D Tiles **through
 * Cesium ion's free Community plan**.
 *
 * Why ion: streaming those tiles straight from Google needs a billing account
 * with an upfront payment. Cesium ion includes the same Google photorealistic
 * tileset (asset 2275207) in its free plan — no card, no prepayment — with
 * 1,000 root tileset requests per month, which is plenty here because the root
 * is only loaded when the viewer opens and when the plane drifts 40 km.
 *
 * The whole module is loaded on demand (`loadPhotogrammetry`), so the hundreds
 * of kB of the 3D Tiles renderer never reach users who keep the satellite
 * ground.
 */

import type { Group } from 'three'
import type { QualityTier } from '@/data/quality'
import { CESIUM_ION_ASSET_ID, type PhotogrammetryState } from '@/data/photogrammetrySettings'

/** Detail budget per quality tier (lower error target = sharper tiles). */
const ERROR_TARGET: Record<QualityTier, number> = { alta: 6, media: 12, baja: 24 }
/** Hard ceiling of tile depth, to protect low-end GPUs from city centres. */
const MAX_DEPTH: Record<QualityTier, number> = { alta: 26, media: 20, baja: 16 }
/** Failed child tiles tolerated before giving up (0 tiles loaded meanwhile). */
const MAX_TILE_ERRORS = 12

export interface PhotogrammetryHandle {
  /** Object to add to the scene (the tiles' own group). */
  group: Group
  /** Streams the tiles around the camera (call once per frame). */
  update: (camera: unknown, renderer: unknown) => void
  /** True once at least one tile has been rendered. */
  loaded: () => boolean
  /** Number of tiles currently displayed (diagnostics). */
  visibleTiles: () => number
  /** Attribution lines required by the data provider (plain text). */
  attributions: () => string[]
  dispose: () => void
}

/** Strips tags so provider attributions can be rendered as plain text. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Radians per degree (the ion plugins take radians, not degrees). */
const DEG = Math.PI / 180

/**
 * Human-readable reason for a failed request, so the viewer can say *why* the
 * layer stayed off instead of a generic "error".
 */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const status = Number(message.match(/error code (\d{3})/)?.[1] ?? 0)
  if (status === 400 || status === 401) {
    return 'Cesium ion rechazó el token (401). Cópialo completo desde ion.cesium.com/tokens; si lo restringiste por URL, añade acastejongames.github.io.'
  }
  if (status === 403) {
    return 'El token no incluye el asset 2275207 (403): añádelo a My Assets y crea el token con assets:read.'
  }
  if (status === 404) {
    return 'El asset de Google 3D Tiles no está en tu cuenta de Cesium ion (404).'
  }
  if (status === 429) {
    return 'Cuota gratuita de Cesium ion agotada (429): 1.000 peticiones del tileset raíz al mes.'
  }
  if (status >= 500) return `Cesium ion no responde (${status}).`
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'No se pudo conectar con Cesium ion (red o bloqueo del navegador).'
  }
  return message ? `Fotogrametría no disponible: ${message}` : 'Fotogrametría no disponible.'
}

export interface CreatePhotogrammetryOptions {
  token: string
  lat: number
  lon: number
  quality: QualityTier
  onState: (state: PhotogrammetryState) => void
  /** Reason of a fatal failure (already localised), for the settings hints. */
  onError?: (message: string) => void
}

/**
 * Builds the tiles renderer anchored at a position.
 *
 * The tiles are placed in their own local frame (up = +Y, north = −Z, metres)
 * via `ReorientationPlugin`, which is the same frame as the rest of the
 * viewer, so the aircraft, its altitude and the camera keep working unchanged.
 */
export async function loadPhotogrammetry(
  options: CreatePhotogrammetryOptions,
): Promise<PhotogrammetryHandle> {
  const { TilesRenderer } = await import('3d-tiles-renderer')
  const { CesiumIonAuthPlugin, GLTFExtensionsPlugin, ReorientationPlugin } = await import(
    '3d-tiles-renderer/plugins'
  )
  // Google's tiles are Draco-compressed; without the decoder every tile fails.
  const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js')
  const { token, lat, lon, quality, onState, onError } = options

  const draco = new DRACOLoader()
  const tiles = new TilesRenderer()
  // Ion resolves the asset endpoint (and, for Google tiles, the session key).
  tiles.registerPlugin(
    new CesiumIonAuthPlugin({
      apiToken: token,
      assetId: String(CESIUM_ION_ASSET_ID),
      autoRefreshToken: true,
      // Our own tiers (errorTarget 6/12/24, maxDepth 26/20/16) drive the
      // density; the ion defaults would overwrite them.
      useRecommendedSettings: false,
    }),
  )
  // `autoDispose` would call `dispose()` on the KTX2 loader we do not pass.
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco, autoDispose: false }))
  tiles.registerPlugin(
    new ReorientationPlugin({
      // **Radians**: passing degrees put the whole city tens of thousands of
      // kilometres away, which looked like the layer doing nothing.
      lat: lat * DEG,
      lon: lon * DEG,
      height: 0,
      // The plugin's object frame is X-west / Z-north; the viewer is
      // X-east / Z-south. Half a turn puts the tiles in the same frame.
      azimuth: Math.PI,
      recenter: false,
    }),
  )
  tiles.errorTarget = ERROR_TARGET[quality]
  tiles.maxDepth = MAX_DEPTH[quality]
  tiles.autoDisableRendererCulling = false

  let loadedOnce = false
  let tileErrors = 0
  let finished = false
  const finish = (state: PhotogrammetryState): void => {
    if (finished) return
    finished = state === 'error'
    onState(state)
  }

  onState('loading')
  tiles.addEventListener('load-model', () => {
    loadedOnce = true
    finish('ready')
  })
  tiles.addEventListener('load-error', (event: { tile: unknown; error?: unknown }) => {
    // A `null` tile is the root request: bad token, quota exhausted or the
    // asset missing from "My Assets". That is fatal for the layer.
    if (event.tile === null) {
      onError?.(describeError(event.error))
      finish('error')
      return
    }
    // Individual tile failures are normal (coverage gaps, rate limits): only
    // give up when nothing has been shown and the errors pile up.
    tileErrors += 1
    if (!loadedOnce && tileErrors > MAX_TILE_ERRORS) {
      onError?.('Cesium ion devolvió teselas vacías para esta zona.')
      finish('error')
    }
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
    attributions: () =>
      tiles
        .getAttributions()
        .map((entry) => (typeof entry.value === 'string' ? plainText(entry.value) : ''))
        .filter(Boolean),
    dispose: () => {
      tiles.dispose()
      tiles.group.removeFromParent()
      draco.dispose()
    },
  }
}
