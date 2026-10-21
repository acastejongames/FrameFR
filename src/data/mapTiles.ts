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
export const TERRAIN_TEMPLATE =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

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

/** Tiles fetched at the same time (public tile servers throttle bursts). */
export const TILE_CONCURRENCY = 8
/** Extra attempts per tile before falling back to the lower zoom cover. */
export const TILE_RETRIES = 2
/** Zoom levels between the wide patch and the low zoom cover painted first. */
export const PARENT_ZOOM_DROP = 4
/** Tiles per side of the sharp patch drawn over the wide one. */
export const DETAIL_TILES = 8
/** Zoom levels the detail patch gains over the wide patch. */
export const DETAIL_ZOOM_JUMP = 2
/** Neutral ground tone visible only if every tile of a region fails. */
const GROUND_FALLBACK_RGB = '#5b6a63'
/** Tiles per side of the far ground that reaches the horizon. */
export const FAR_TILES = 6
/** Earth radius used for the horizon distance, meters. */
const EARTH_RADIUS_M = 6_371_000

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
export function tilePosition(
  latDeg: number,
  lonDeg: number,
  z: number,
): { fx: number; fy: number } {
  const scale = Math.pow(2, z)
  const latRad = (Math.min(85.05, Math.max(-85.05, latDeg)) * Math.PI) / 180
  const fx = ((lonDeg + 180) / 360) * scale
  const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale
  return { fx, fy }
}

/**
 * Builds the square tile window centred on a position.
 *
 * The window is aligned to tile boundaries so the satellite raster (`n`×`n`
 * tiles at z) and the terrain raster (a small block of terrarium tiles at
 * z−2) cover the exact same piece of the world.
 */
export function groundWindow(
  latDeg: number,
  lonDeg: number,
  z: number,
  n = GROUND_TILES,
): GroundWindow {
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
export function viewWindow(
  latDeg: number,
  lonDeg: number,
  altitudeM: number,
  mult = 1,
): GroundWindow {
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

/* ------------------------------------------------------- request limiter */
/* Browsers cap the number of connections per host anyway, but queuing the
   tiles ourselves avoids the burst of 64 requests that public tile servers
   answer with rate-limit errors. Failed tiles are retried a couple of times
   and, if they still fail, the lower zoom underlay keeps the ground whole. */

let activeTiles = 0
const tileQueue: Array<() => void> = []

function acquireSlot(): Promise<void> {
  if (activeTiles < TILE_CONCURRENCY) {
    activeTiles += 1
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    tileQueue.push(() => {
      activeTiles += 1
      resolve()
    })
  })
}

function releaseSlot(): void {
  activeTiles = Math.max(0, activeTiles - 1)
  const next = tileQueue.shift()
  if (next) next()
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function loadTileOnce(url: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
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

async function loadTileImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  const cached = tileCache.get(url)
  if (cached) {
    rememberTile(url, cached)
    return cached
  }
  for (let attempt = 0; attempt <= TILE_RETRIES; attempt += 1) {
    if (signal?.aborted) return null
    await acquireSlot()
    const image = await loadTileOnce(url, signal)
    releaseSlot()
    if (image) {
      rememberTile(url, image)
      return image
    }
    if (signal?.aborted) return null
    if (attempt < TILE_RETRIES) await delay(220 * (attempt + 1))
  }
  return null
}

/** A raster already on screen that can fill the holes of a sharper one. */
export interface Underlay {
  canvas: HTMLCanvasElement
  sx: number
  sy: number
  sw: number
  sh: number
}

async function compositeTiles(
  template: string,
  z: number,
  x0: number,
  y0: number,
  n: number,
  signal?: AbortSignal,
  tilePx = TILE_PX,
  underlay?: Underlay | null,
): Promise<HTMLCanvasElement | null> {
  const size = n * tilePx
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Smoother downscales on the low texture tiers.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // A neutral ground tone under everything: a tile that never arrives must
  // never leave a black hole in the middle of the terrain.
  ctx.fillStyle = GROUND_FALLBACK_RGB
  ctx.fillRect(0, 0, size, size)
  if (underlay) {
    ctx.drawImage(
      underlay.canvas,
      underlay.sx,
      underlay.sy,
      underlay.sw,
      underlay.sh,
      0,
      0,
      size,
      size,
    )
  }
  let loaded = 0
  const jobs: Array<Promise<void>> = []
  for (let ty = 0; ty < n; ty++) {
    for (let tx = 0; tx < n; tx++) {
      jobs.push(
        loadTileImage(tileUrl(template, z, x0 + tx, y0 + ty), signal).then((img) => {
          if (!img) return
          ctx.drawImage(img, tx * tilePx, ty * tilePx, tilePx, tilePx)
          loaded += 1
        }),
      )
    }
  }
  await Promise.all(jobs)
  if (loaded === 0 && !underlay) return null
  // Even with a couple of missing tiles the patch is useful: the underlay
  // shows through and the ground stays continuous.
  return canvas
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
    size * 0.4,
    size / 2,
    size / 2,
    size * 0.5,
  )
  gradient.addColorStop(0, `rgba(${HORIZON_RGB}, 0)`)
  // Soft aerial-perspective feather: the far ground underneath stays visible,
  // so the rim reads as distance haze rather than a painted border.
  gradient.addColorStop(1, `rgba(${HORIZON_RGB}, 0.6)`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
}

/**
 * Erases the outer ring of the detail patch so it dissolves into the wide
 * ground underneath instead of ending on a visible square seam.
 */
function fadeDetailRim(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const size = canvas.width
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.3,
    size / 2,
    size / 2,
    size * 0.5,
  )
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
  gradient.addColorStop(0.55, 'rgba(0, 0, 0, 0.25)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 1)')
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  ctx.restore()
}

/**
 * Window (and crop) of the lower zoom tiles that cover a ground window.
 *
 * One tile `PARENT_ZOOM_DROP` levels below the window covers `2^drop` tiles of
 * it, so two or three requests are enough to paint the whole patch first.
 */
export function parentCover(
  win: GroundWindow,
  drop = PARENT_ZOOM_DROP,
): { z: number; x0: number; y0: number; nx: number; ny: number; scale: number } {
  const z = Math.max(0, win.z - drop)
  const scale = 1 << (win.z - z)
  const x0 = Math.floor(win.x0 / scale)
  const y0 = Math.floor(win.y0 / scale)
  const nx = Math.max(1, Math.ceil((win.x0 + win.n) / scale) - x0)
  const ny = Math.max(1, Math.ceil((win.y0 + win.n) / scale) - y0)
  return { z, x0, y0, nx, ny, scale }
}

/** Crop of `baseCanvas` that covers `target` (must be inside the base window). */
export function underlayFor(
  base: GroundWindow,
  baseCanvas: HTMLCanvasElement,
  target: GroundWindow,
): Underlay | null {
  const jump = target.z - base.z
  if (jump < 0) return null
  const span = 1 << jump
  const pxPerBaseTile = baseCanvas.width / base.n
  const sx = (target.x0 / span - base.x0) * pxPerBaseTile
  const sy = (target.y0 / span - base.y0) * pxPerBaseTile
  const sw = (target.n / span) * pxPerBaseTile
  const sh = sw
  if (sx < 0 || sy < 0 || sx + sw > baseCanvas.width + 0.5 || sy + sh > baseCanvas.height + 0.5) {
    return null
  }
  return { canvas: baseCanvas, sx, sy, sw, sh }
}

/**
 * Far ground: the low zoom raster that reaches the horizon, drawn under the
 * sharp patch. Its rim is faded to the sky tone, so the terrain melts into the
 * horizon instead of ending on a hard edge.
 */
export async function fetchFarPatch(win: GroundWindow, signal?: AbortSignal): Promise<GroundPatch> {
  const canvas = await compositeTiles(
    SATELLITE_TEMPLATE,
    win.z,
    win.x0,
    win.y0,
    win.n,
    signal,
    TILE_PX,
  )
  if (!canvas) return { kind: 'grid', canvas: null, window: win, attribution: '' }
  // No rim tint here on purpose: the far ground is big enough that the fog
  // reaches full opacity before its edge, and a painted rim would show up as
  // a pale band where it meets the sharp patch.
  return {
    kind: 'satellite',
    canvas,
    window: win,
    attribution: 'Imágenes satelitales: Esri, Maxar, Earthstar Geographics',
  }
}

/**
 * Low zoom raster covering the whole window, painted before the sharp tiles
 * so the ground is never empty (or black) while they stream in.
 */
async function fetchCover(
  win: GroundWindow,
  signal: AbortSignal | undefined,
): Promise<Underlay | null> {
  const cover = parentCover(win)
  const canvas = await compositeTiles(
    SATELLITE_TEMPLATE,
    cover.z,
    cover.x0,
    cover.y0,
    Math.max(cover.nx, cover.ny),
    signal,
    TILE_PX,
  )
  if (!canvas) return null
  const pxPerBaseTile = TILE_PX / cover.scale
  return {
    canvas,
    sx: (win.x0 - cover.x0 * cover.scale) * pxPerBaseTile,
    sy: (win.y0 - cover.y0 * cover.scale) * pxPerBaseTile,
    sw: win.n * pxPerBaseTile,
    sh: win.n * pxPerBaseTile,
  }
}

/**
 * Fetches the ground raster for a window: satellite imagery first, then an
 * OpenStreetMap map, then the procedural grid (`kind: 'grid'`, no canvas).
 *
 * The low zoom cover is always painted first, and the sharp tiles are drawn
 * over it as they arrive, so a slow or throttled tile server degrades the
 * patch to a soft image instead of punching holes in the terrain.
 */
export async function fetchGroundPatch(
  win: GroundWindow,
  signal?: AbortSignal,
  tilePx = TILE_PX,
): Promise<GroundPatch> {
  const cover = await fetchCover(win, signal)
  const satellite = await compositeTiles(
    SATELLITE_TEMPLATE,
    win.z,
    win.x0,
    win.y0,
    win.n,
    signal,
    tilePx,
    cover,
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
    cover,
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
 * Distance to the visible horizon from an altitude, meters.
 *
 * This is what the ground has to cover: with a shorter patch the terrain ends
 * in mid-air and the sky shows underneath it, which is exactly the "the ground
 * just stops" look the viewer had at low altitude.
 */
export function horizonMeters(altitudeM: number): number {
  const height = Math.max(0, Number.isFinite(altitudeM) ? altitudeM : 0)
  return Math.sqrt(2 * EARTH_RADIUS_M * height)
}

/**
 * Low zoom window that reaches the horizon, so there is always terrain
 * under the whole view. Only `FAR_TILES²` requests, always blurry: it is the
 * distant backdrop, never the area next to the plane.
 */
export function farWindow(
  latDeg: number,
  lonDeg: number,
  altitudeM: number,
  minSizeMeters = 0,
): GroundWindow {
  // 1.6× the horizon leaves margin for the haze that completes the edge; the
  // 2.5× window keeps the sharp patch surrounded at any zoom.
  const needed = Math.max(1.6 * horizonMeters(altitudeM), 2.5 * minSizeMeters)
  // size(z) = FAR_TILES * TILE_PX * mpp(z); pick the coarsest zoom that covers.
  let z = 18
  while (z > 2 && groundWindow(latDeg, lonDeg, z, FAR_TILES).sizeMeters < needed) z -= 1
  return groundWindow(latDeg, lonDeg, z, FAR_TILES)
}

/**
 * Centre of `win` relative to the centre of `base`, in scene metres
 * (+east, +north).
 *
 * Derived from the tile indices instead of the `offset*` fields, so it stays
 * correct when the two windows were created at different moments: that is what
 * lets the sharp patch and the horizon backdrop keep their world position when
 * the wide patch re-centres, without being re-downloaded.
 */
export function windowOffset(
  win: Pick<GroundWindow, 'z' | 'x0' | 'y0' | 'n'>,
  base: Pick<GroundWindow, 'z' | 'x0' | 'y0' | 'n' | 'sizeMeters'>,
): { east: number; north: number } {
  const factor = Math.pow(2, win.z - base.z)
  const relX = (win.x0 / factor - base.x0) / base.n
  const relY = (win.y0 / factor - base.y0) / base.n
  const half = win.n / factor / base.n / 2
  return {
    east: (relX + half - 0.5) * base.sizeMeters,
    north: (0.5 - (relY + half)) * base.sizeMeters,
  }
}

/** Window of the sharp patch drawn over the wide one, centred on the plane. */
export function detailWindow(
  latDeg: number,
  lonDeg: number,
  baseZoom: number,
  n = DETAIL_TILES,
): GroundWindow {
  return groundWindow(latDeg, lonDeg, baseZoom + DETAIL_ZOOM_JUMP, n)
}

/**
 * High resolution raster for the central area of the wide patch. It reuses
 * the wide patch as its underlay (so it appears instantly and softly) and is
 * feathered towards the rim, which is what makes it read as a detail area
 * rather than a pasted square.
 */
export async function fetchGroundDetail(
  win: GroundWindow,
  base: GroundWindow,
  baseCanvas: HTMLCanvasElement,
  signal?: AbortSignal,
  tilePx = TILE_PX,
): Promise<HTMLCanvasElement | null> {
  const underlay = underlayFor(base, baseCanvas, win)
  const satellite = await compositeTiles(
    SATELLITE_TEMPLATE,
    win.z,
    win.x0,
    win.y0,
    win.n,
    signal,
    tilePx,
    underlay,
  )
  if (!satellite) return null
  fadeDetailRim(satellite)
  return satellite
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
  const {
    z,
    x0,
    y0,
    offsetX,
    offsetY,
    blockX,
    blockY,
    samples,
    stride: step,
  } = terrainTilesOf(win, stride)
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
    return (
      sx < offsetX + span && sx + TILE_PX > offsetX && sy < offsetY + span && sy + TILE_PX > offsetY
    )
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
      heights[dy * samples + dx] = decodeTerrariumPixel(
        tile.data[i],
        tile.data[i + 1],
        tile.data[i + 2],
      )
    }
  }
  return { heights, samples, window: win }
}

/** Bilinear terrain sample at window coordinates (row 0 = north edge). */
export function sampleHeight(terrain: TerrainPatch, u: number, v: number): number {
  const { heights, samples } = terrain
  const fx = u * (samples - 1)
  const fy = v * (samples - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(x0 + 1, samples - 1)
  const y1 = Math.min(y0 + 1, samples - 1)
  const tx = fx - x0
  const ty = fy - y0
  const h00 = heights[y0 * samples + x0]
  const h10 = heights[y0 * samples + x1]
  const h01 = heights[y1 * samples + x0]
  const h11 = heights[y1 * samples + x1]
  return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) + h01 * (1 - tx) * ty + h11 * tx * ty
}

/**
 * Height of a ground patch **as three.js draws it**, at coordinates of its own
 * grid.
 *
 * `PlaneGeometry` splits every cell into two triangles (from (u, v+1) to
 * (u+1, v)). A sharper patch samples the DEM more finely, so its surface
 * crosses the coarse one wherever the terrain is not flat: the coarse mesh then
 * pokes through the sharp one, and the two images flicker against each other
 * while the camera moves. Reproducing the coarse triangle gives the sharp patch
 * a floor it can never sink below.
 */
export function baseSurfaceHeight(
  terrain: TerrainPatch | null,
  span: number,
  u: number,
  v: number,
): number {
  if (!terrain || span <= 0) return 0
  const fx = Math.min(Math.max(u, 0), 1) * span
  const fy = Math.min(Math.max(v, 0), 1) * span
  const ix = Math.min(Math.floor(fx), Math.max(span - 1, 0))
  const iy = Math.min(Math.floor(fy), Math.max(span - 1, 0))
  const tx = fx - ix
  const ty = fy - iy
  const h00 = sampleHeight(terrain, ix / span, iy / span)
  const h10 = sampleHeight(terrain, (ix + 1) / span, iy / span)
  const h01 = sampleHeight(terrain, ix / span, (iy + 1) / span)
  const h11 = sampleHeight(terrain, (ix + 1) / span, (iy + 1) / span)
  if (tx + ty <= 1) return h00 + tx * (h10 - h00) + ty * (h01 - h00)
  return h01 + h10 - h11 + tx * (h11 - h01) + ty * (h11 - h10)
}
