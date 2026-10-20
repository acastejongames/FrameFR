/**
 * Map tile math and tile loading for the 3D viewer ground.
 *
 * The orbit viewer draws the real world under the aircraft: a square window of
 * satellite raster tiles (Esri World Imagery, with an OpenStreetMap fallback)
 * plus optional terrain relief from the public Terrarium DEM tiles. All tile
 * sources are plain HTTPS images with CORS and no API key.
 *
 * The module is DOM-free except for the fetch/decode helpers, so the pure
 * windowing math is smoke-tested in Node.
 */

/** Raster tile sources, in preference order. */
export const SATELLITE_TEMPLATE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
export const MAP_FALLBACK_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
/** Terrarium-encoded elevation tiles: height = R*256 + G + B/256 - 32768. */
export const TERRAIN_TEMPLATE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

/**
 * Sky-horizon tint used to melt the ground patch edge into the sky. Must
 * match `SKY_HORIZON` in Aircraft3DViewer (rgb of #d4e4f0).
 */
const HORIZON_RGB = '212, 228, 240'

export const TILE_PX = 256
/** Satellite tiles per side of the base ground patch. Terrain uses ¼ as many at z−2. */
export const GROUND_TILES = 8

/** How long a single tile may take before the patch gives up on it. */
export const TILE_TIMEOUT_MS = 8_000
/**
 * Decoded tiles kept between patches. Consecutive windows overlap heavily, so
 * this avoids re-downloading most of the imagery every time the plane drifts
 * far enough to re-centre.
 */
export const TILE_CACHE_LIMIT = 192

/** Render-distance multipliers offered by the 3D viewer (1 = default, 5 = max). */
export const VIEW_DISTANCES = [1, 2, 3, 4, 5] as const
export type ViewDistance = (typeof VIEW_DISTANCES)[number]

const EARTH_MERCATOR_RADIUS = 156_543.03

export type GroundKind = 'satellite' | 'map' | 'grid'

/** A square window of the world in tile space, centred near a position. */
export interface GroundWindow {
  /** Satellite zoom level of the window. */
  z: number
  /** First satellite tile of the window. */
  x0: number
  y0: number
  /** Tiles per side at zoom `z` (always GROUND_TILES). */
  n: number
  /** Real-ground size of the window edge, meters. */
  sizeMeters: number
  /** Offset of the window centre from the aircraft position, meters. */
  offsetEastM: number
  offsetNorthM: number
}

/** A composited raster patch plus its georeference. */
export interface GroundPatch {
  kind: GroundKind
  /** `n*TILE_PX` square canvas, or null for the procedural grid. */
  canvas: HTMLCanvasElement | null
  window: GroundWindow
  attribution: string
}

/** Terrain heights (meters, row-major; row 0 is the north edge, like the raster). */
export interface TerrainPatch {
  heights: Float32Array
  /** Samples per side (`n*64/stride`, one terrarium pixel per 4 sat px at z−2). */
  samples: number
  window: GroundWindow
}

/** Mercator meters per screen pixel at a given latitude and zoom. */
export function metersPerPixel(latDeg: number, z: number): number {
  return (EARTH_MERCATOR_RADIUS * Math.cos((latDeg * Math.PI) / 180)) / Math.pow(2, z)
}

/** Satellite zoom that keeps ~160 / 80 / 40 / 20 km of ground under the view. */
export function tileZoomForAltitude(altitudeM: number): number {
  if (!Number.isFinite(altitudeM) || altitudeM < 800) return 14
  if (altitudeM < 3000) return 13
  if (altitudeM < 9000) return 12
  return 11
}

/** Fractional world tile coordinates of a position at zoom `z`. */
export function tilePosition(latDeg: number, lonDeg: number, z: number): { fx: number; fy: number } {
  const scale = Math.pow(2, z)
  const latRad = (Math.min(85.05, Math.max(-85.05, latDeg)) * Math.PI) / 180
  const fx = ((lonDeg + 180) / 360) * scale
  const fy =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale
  return { fx, fy }
}

/**
 * Builds the square tile window centred on a position.
 *
 * The window is aligned to tile boundaries so the satellite raster (`n`×`n`
 * tiles at z) and the terrain raster (a small block of terrarium tiles at
 * z−2) cover the exact same piece of the world.
 */
export function groundWindow(latDeg: number, lonDeg: number, z: number, n = GROUND_TILES): GroundWindow {
  const { fx, fy } = tilePosition(latDeg, lonDeg, z)
  const x0 = Math.round(fx) - Math.floor(n / 2)
  const y0 = Math.round(fy) - Math.floor(n / 2)
  const centerPxX = (x0 + n / 2) * TILE_PX
  const centerPxY = (y0 + n / 2) * TILE_PX
  const scaleMeters = (EARTH_MERCATOR_RADIUS / Math.pow(2, z)) * Math.cos((latDeg * Math.PI) / 180)
  return {
    z,
    x0,
    y0,
    n,
    sizeMeters: n * TILE_PX * scaleMeters,
    offsetEastM: (centerPxX - fx * TILE_PX) * scaleMeters,
    offsetNorthM: (fy * TILE_PX - centerPxY) * scaleMeters,
  }
}

/**
 * Tile layout covering `mult`× the base window: the zoom drops one or two
 * levels while the tile side grows, so the request count stays in the
 * 36–100 range at every distance.
 */
function viewLayout(mult: number): { zoomOffset: number; n: number } {
  if (mult >= 5) return { zoomOffset: 2, n: 10 }
  if (mult >= 4) return { zoomOffset: 2, n: 8 }
  if (mult >= 3) return { zoomOffset: 2, n: 6 }
  if (mult >= 2) return { zoomOffset: 1, n: 8 }
  return { zoomOffset: 0, n: GROUND_TILES }
}

/**
 * Ground window at the current render distance: the base altitude window
 * (see `tileZoomForAltitude`) widened `mult` times towards the horizon.
 */
export function viewWindow(latDeg: number, lonDeg: number, altitudeM: number, mult = 1): GroundWindow {
  const clamped = Math.max(1, Math.min(5, Math.round(mult)))
  const { zoomOffset, n } = viewLayout(clamped)
  return groundWindow(latDeg, lonDeg, tileZoomForAltitude(altitudeM) - zoomOffset, n)
}

/**
 * Terrain tile block that covers the same world window as `win`.
 *
 * One terrarium tile at z−2 equals 4×4 satellite tiles at z, so the window
 * needs exactly `n*64` DEM pixels per side. The window starts on a z-tile
 * boundary (256 sat px = 64 DEM px), which can straddle a few tiles at z−2;
 * the returned block plus the DEM-pixel offset of the window locates the
 * exact region inside it.
 */
export function terrainTilesOf(
  win: GroundWindow,
  stride = 1,
): {
  z: number
  x0: number
  y0: number
  offsetX: number
  offsetY: number
  blockX: number
  blockY: number
  /** Heightfield samples per side after applying `stride`. */
  samples: number
  /** DEM pixels skipped between samples (1 = full resolution). */
  stride: number
} {
  const step = Math.max(1, Math.round(stride))
  const z = win.z - 2
  const x0 = Math.floor(win.x0 / 4)
  const y0 = Math.floor(win.y0 / 4)
  const offsetX = (win.x0 - x0 * 4) * 64
  const offsetY = (win.y0 - y0 * 4) * 64
  const samples = (win.n * (TILE_PX / 4)) / step
  return {
    z,
    x0,
    y0,
    offsetX,
    offsetY,
    blockX: Math.ceil((offsetX + samples * step) / TILE_PX),
    blockY: Math.ceil((offsetY + samples * step) / TILE_PX),
    samples,
    stride: step,
  }
}

/** Decodes one Terrarium pixel into meters of elevation. */
export function decodeTerrariumPixel(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32_768
}

/** URL of a tile from an XYZ template. */
export function tileUrl(template: string, z: number, x: number, y: number): string {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
}

/* ------------------------------------------------------------ tile cache */
/* Decoded <img> elements are cheap to keep and expensive to re-download; an
   LRU keyed by URL lets the next ground window reuse the overlapping tiles
   (a re-centre usually shares ~80% of them with the previous one). */

const tileCache = new Map<string, HTMLImageElement>()

function rememberTile(url: string, image: HTMLImageElement): void {
  tileCache.delete(url)
  tileCache.set(url, image)
  while (tileCache.size > TILE_CACHE_LIMIT) {
    const oldest = tileCache.keys().next().value
    if (oldest === undefined) break
    tileCache.delete(oldest)
  }
}

/** Number of decoded tiles currently cached (tests/dev). */
export function tileCacheSize(): number {
  return tileCache.size
}

/** Drops every cached tile (tests/dev). */
export function clearTileCache(): void {
  tileCache.clear()
}

function loadTileImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  const cached = tileCache.get(url)
  if (cached) {
    rememberTile(url, cached)
    return Promise.resolve(cached)
  }
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null)
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = (value: HTMLImageElement | null): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      img.onload = null
      img.onerror = null
      if (value) rememberTile(url, value)
      resolve(value)
    }
    img.onload = () => settle(signal?.aborted ? null : img)
    img.onerror = () => settle(null)
    // A single stalled request must not hold the whole patch hostage.
    timer = setTimeout(() => {
      img.src = ''
      settle(null)
    }, TILE_TIMEOUT_MS)
    signal?.addEventListener(
      'abort',
      () => {
        img.src = ''
        settle(null)
      },
      { once: true },
    )
    img.src = url
  })
}

async function compositeTiles(
  template: string,
  z: number,
  x0: number,
  y0: number,
  n: number,
  signal?: AbortSignal,
  tilePx = TILE_PX,
): Promise<HTMLCanvasElement | null> {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = n * tilePx
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Smoother downscales on the low texture tiers.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const jobs: Array<Promise<boolean>> = []
  for (let ty = 0; ty < n; ty++) {
    for (let tx = 0; tx < n; tx++) {
      jobs.push(
        loadTileImage(tileUrl(template, z, x0 + tx, y0 + ty), signal).then((img) => {
          if (img) ctx.drawImage(img, tx * tilePx, ty * tilePx, tilePx, tilePx)
          return Boolean(img)
        }),
      )
    }
  }
  const results = await Promise.all(jobs)
  // A patch with more than half its tiles missing is useless.
  return results.filter(Boolean).length >= n * n * 0.5 ? canvas : null
}

/**
 * Blends the outer ring of a ground raster toward the sky-horizon tint, so
 * the square patch boundary is invisible from any camera angle. The clear
 * disc covers 34% of the raster radius (68% of the half-window); the tint
 * is fully opaque exactly at the edge midpoints.
 */
function fadeGroundRim(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const size = canvas.width
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.34,
    size / 2,
    size / 2,
    size * 0.5,
  )
  gradient.addColorStop(0, `rgba(${HORIZON_RGB}, 0)`)
  gradient.addColorStop(1, `rgba(${HORIZON_RGB}, 1)`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
}

/**
 * Fetches the ground raster for a window: satellite imagery first, then an
 * OpenStreetMap map, then the procedural grid (`kind: 'grid'`, no canvas).
 */
export async function fetchGroundPatch(
  win: GroundWindow,
  signal?: AbortSignal,
  tilePx = TILE_PX,
): Promise<GroundPatch> {
  const satellite = await compositeTiles(
    SATELLITE_TEMPLATE,
    win.z,
    win.x0,
    win.y0,
    win.n,
    signal,
    tilePx,
  )
  if (satellite) {
    fadeGroundRim(satellite)
    return {
      kind: 'satellite',
      canvas: satellite,
      window: win,
      attribution: 'Imágenes satelitales: Esri, Maxar, Earthstar Geographics',
    }
  }
  const map = await compositeTiles(
    MAP_FALLBACK_TEMPLATE,
    win.z,
    win.x0,
    win.y0,
    win.n,
    signal,
    tilePx,
  )
  if (map) {
    fadeGroundRim(map)
    return {
      kind: 'map',
      canvas: map,
      window: win,
      attribution: 'Mapa: © OpenStreetMap contributors',
    }
  }
  return { kind: 'grid', canvas: null, window: win, attribution: '' }
}

/**
 * Fetches the terrain relief of the window as a heightfield in meters.
 * Returns null when the DEM cannot be loaded (the ground stays flat).
 */
export async function fetchTerrainPatch(
  win: GroundWindow,
  signal?: AbortSignal,
  stride = 1,
): Promise<TerrainPatch | null> {
  const { z, x0, y0, offsetX, offsetY, blockX, blockY, samples, stride: step } =
    terrainTilesOf(win, stride)
  const heights = new Float32Array(samples * samples)
  const ctxOf = (img: HTMLImageElement): ImageData | null => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = TILE_PX
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    try {
      return ctx.getImageData(0, 0, TILE_PX, TILE_PX)
    } catch {
      return null
    }
  }
  const tiles: Array<Promise<ImageData | null>> = []
  for (let ty = 0; ty < blockY; ty++) {
    for (let tx = 0; tx < blockX; tx++) {
      tiles.push(
        loadTileImage(tileUrl(TERRAIN_TEMPLATE, z, x0 + tx, y0 + ty), signal).then((img) =>
          img ? ctxOf(img) : null,
        ),
      )
    }
  }
  const decoded = await Promise.all(tiles)
  // Tiles that do not touch the window may be missing; overlapping ones may not.
  const span = samples * step
  const overlapsWindow = (index: number): boolean => {
    const sx = (index % blockX) * TILE_PX
    const sy = Math.floor(index / blockX) * TILE_PX
    return sx < offsetX + span && sx + TILE_PX > offsetX && sy < offsetY + span && sy + TILE_PX > offsetY
  }
  if (decoded.some((tile, index) => !tile && overlapsWindow(index))) return null
  // Walk the output grid directly: with `stride` 2 this decodes a quarter of
  // the pixels instead of scanning every tile and discarding half of them.
  for (let dy = 0; dy < samples; dy++) {
    const sy = offsetY + dy * step
    const tileY = Math.floor(sy / TILE_PX)
    const py = sy - tileY * TILE_PX
    for (let dx = 0; dx < samples; dx++) {
      const sx = offsetX + dx * step
      const tileX = Math.floor(sx / TILE_PX)
      const tile = decoded[tileY * blockX + tileX]
      if (!tile) continue
      const px = sx - tileX * TILE_PX
      const i = (py * TILE_PX + px) * 4
      heights[dy * samples + dx] = decodeTerrariumPixel(tile.data[i], tile.data[i + 1], tile.data[i + 2])
    }
  }
  return { heights, samples, window: win }
}
