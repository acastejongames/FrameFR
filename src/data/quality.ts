/**
 * Graphics quality settings shared by the 3D viewer and the 2D map.
 *
 * Low-end devices (modest GPUs, few CPU cores, high devicePixelRatio phones)
 * struggle with three things: the number of vertices, the pixels each frame
 * shades and the memory spent on textures. Every knob below attacks one of
 * them independently so the user can keep the features (real satellite
 * ground, 1:1 models, terrain relief, weather…) while fitting the frame budget
 * of the device:
 *
 *  - `mesh`     → terrain grid resolution and aircraft triangle budget.
 *  - `textures` → terrain raster resolution and aircraft texture size.
 *  - `resolution` → drawing-buffer pixels of the orbit viewer.
 *  - `map`      → drawing-buffer pixels of the MapLibre canvas.
 *
 * All values are persisted as one object, so a quick profile can set the four
 * at once, and every component reads the same source of truth.
 */

export type QualityTier = 'alta' | 'media' | 'baja'
export type RenderResolution = 'auto' | 'nativa' | '1' | '0.75'
export type MapQuality = 'auto' | 'alta' | 'equilibrada' | 'rendimiento'

export interface PerformanceSettings {
  mesh: QualityTier
  textures: QualityTier
  resolution: RenderResolution
  map: MapQuality
}

export const QUALITY_TIERS: readonly QualityTier[] = ['alta', 'media', 'baja']
export const RENDER_RESOLUTIONS: readonly RenderResolution[] = ['auto', 'nativa', '1', '0.75']
export const MAP_QUALITIES: readonly MapQuality[] = ['auto', 'alta', 'equilibrada', 'rendimiento']

export const QUALITY_LABELS: Record<QualityTier, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

export const RESOLUTION_LABELS: Record<RenderResolution, string> = {
  auto: 'Automática',
  nativa: 'Nativa (máxima)',
  '1': '×1 · píxel por píxel',
  '0.75': '×0,75 · máximo rendimiento',
}

export const MAP_QUALITY_LABELS: Record<MapQuality, string> = {
  auto: 'Automática',
  alta: 'Alta · nativa',
  equilibrada: 'Equilibrada',
  rendimiento: 'Rendimiento',
}

/* ------------------------------------------------------------------ viewer */

/** Terrain grid vertices per side (the plane is subdivided `segments²`). */
export const MESH_SEGMENTS: Record<QualityTier, number> = {
  alta: 256,
  media: 144,
  baja: 96,
}

/**
 * DEM sample stride: 1 reads every Terrarium pixel, 2 halves the decoded
 * heightfield per side (4× fewer samples) without visibly changing the relief.
 */
export const TERRAIN_STRIDE: Record<QualityTier, number> = {
  alta: 1,
  media: 2,
  baja: 2,
}

/** Pixels per satellite tile in the composited ground texture. */
export const GROUND_TILE_PX: Record<QualityTier, number> = {
  alta: 256,
  media: 128,
  baja: 64,
}

/**
 * Current aircraft triangle budget. The bundled GLBs are already low-poly
 * (2.7k–5.2k triangles), so this is a light decimation; the terrain grid is
 * where `mesh` saves real work.
 */
export const MODEL_SIMPLIFY: Record<QualityTier, number> = {
  alta: 1,
  media: 0.7,
  baja: 0.45,
}

/** Never simplify an aircraft below this many triangles. */
export const MODEL_MIN_TRIANGLES = 1_200

/** Longest side of an aircraft texture (0 keeps the original image). */
export const MODEL_TEXTURE_MAX: Record<QualityTier, number> = {
  alta: 0,
  media: 512,
  baja: 256,
}

/** Anisotropic filtering requested for downscaled aircraft textures. */
export const TEXTURE_ANISOTROPY: Record<QualityTier, number> = {
  alta: 8,
  media: 4,
  baja: 1,
}

/** Lowest automatic pixel ratio the viewer may negotiate down to. */
export const MIN_AUTO_RATIO = 0.75

/* --------------------------------------------------------------- defaults */

export const DEFAULT_PERFORMANCE: PerformanceSettings = {
  mesh: 'alta',
  textures: 'alta',
  resolution: 'auto',
  map: 'auto',
}

export interface PerformanceProfile {
  id: 'maxima' | 'equilibrado' | 'rendimiento'
  label: string
  description: string
  settings: PerformanceSettings
}

export const PERFORMANCE_PROFILES: readonly PerformanceProfile[] = [
  {
    id: 'maxima',
    label: 'Máxima calidad',
    description: 'Malla y texturas completas y resolución nativa.',
    settings: { mesh: 'alta', textures: 'alta', resolution: 'nativa', map: 'alta' },
  },
  {
    id: 'equilibrado',
    label: 'Equilibrado',
    description: 'Buen detalle con menos píxeles y texturas a media resolución.',
    settings: { mesh: 'media', textures: 'media', resolution: 'auto', map: 'equilibrada' },
  },
  {
    id: 'rendimiento',
    label: 'Máximo rendimiento',
    description: 'Para equipos modestos: malla y texturas reducidas y 1× de resolución.',
    settings: { mesh: 'baja', textures: 'baja', resolution: '1', map: 'rendimiento' },
  },
]

/* --------------------------------------------------------------- hardware */

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number
}

/** Logical CPU cores of the device (8 when the browser does not report it). */
export function cpuCores(): number {
  if (typeof navigator === 'undefined') return 8
  const cores = navigator.hardwareConcurrency
  return typeof cores === 'number' && cores > 0 ? cores : 8
}

/** Approximate RAM in GB (Chromium-only hint), or null when unavailable. */
export function deviceMemoryGb(): number | null {
  if (typeof navigator === 'undefined') return null
  const memory = (navigator as NavigatorWithMemory).deviceMemory
  return typeof memory === 'number' && memory > 0 ? memory : null
}

/** True on phones/tablets and other modest machines that need the lighter path. */
export function isModestDevice(): boolean {
  if (cpuCores() <= 4) return true
  const memory = deviceMemoryGb()
  return memory !== null && memory <= 4
}

/* ---------------------------------------------------------------- scaling */

function devicePixelRatioValue(): number {
  if (typeof window === 'undefined') return 1
  const ratio = window.devicePixelRatio
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1
}

/**
 * Drawing-buffer scale of the orbit viewer.
 *
 * Phones often report a 3× devicePixelRatio; shading 9× the CSS pixels is the
 * single most expensive thing the viewer can do, so automatic mode caps it at
 * 1.5 (1.25 on modest devices) and the frame loop may lower it further.
 */
export function viewerPixelRatio(mode: RenderResolution): number {
  const dpr = devicePixelRatioValue()
  switch (mode) {
    case 'nativa':
      return Math.min(dpr, 2)
    case '1':
      return 1
    case '0.75':
      return 0.75
    default:
      return isModestDevice() ? Math.min(dpr, 1.25) : Math.min(dpr, 1.5)
  }
}

/**
 * Drawing-buffer scale of the MapLibre canvas. `alta` keeps the historical
 * behaviour (native devicePixelRatio); `rendimiento` renders exactly one
 * device-independent pixel per CSS pixel.
 */
export function mapPixelRatio(mode: MapQuality): number {
  const dpr = devicePixelRatioValue()
  switch (mode) {
    case 'alta':
      return dpr
    case 'equilibrada':
      return Math.min(dpr, 1.5)
    case 'rendimiento':
      return 1
    default:
      if (isModestDevice()) return 1
      return Math.min(dpr, 2)
  }
}

/* ------------------------------------------------------------- validation */

export function isQualityTier(value: unknown): value is QualityTier {
  return typeof value === 'string' && (QUALITY_TIERS as readonly string[]).includes(value)
}

export function isRenderResolution(value: unknown): value is RenderResolution {
  return typeof value === 'string' && (RENDER_RESOLUTIONS as readonly string[]).includes(value)
}

export function isMapQuality(value: unknown): value is MapQuality {
  return typeof value === 'string' && (MAP_QUALITIES as readonly string[]).includes(value)
}

export function isPerformanceSettings(value: unknown): value is PerformanceSettings {
  if (!value || typeof value !== 'object') return false
  const stored = value as Partial<Record<keyof PerformanceSettings, unknown>>
  return (
    isQualityTier(stored.mesh) &&
    isQualityTier(stored.textures) &&
    isRenderResolution(stored.resolution) &&
    isMapQuality(stored.map)
  )
}

/** Fills missing/invalid fields with the defaults of the matching key. */
export function normalizePerformance(value: unknown): PerformanceSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PERFORMANCE }
  const stored = value as Partial<Record<keyof PerformanceSettings, unknown>>
  return {
    mesh: isQualityTier(stored.mesh) ? stored.mesh : DEFAULT_PERFORMANCE.mesh,
    textures: isQualityTier(stored.textures) ? stored.textures : DEFAULT_PERFORMANCE.textures,
    resolution: isRenderResolution(stored.resolution)
      ? stored.resolution
      : DEFAULT_PERFORMANCE.resolution,
    map: isMapQuality(stored.map) ? stored.map : DEFAULT_PERFORMANCE.map,
  }
}
