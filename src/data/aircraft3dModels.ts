/**
 * Aircraft model loading with user-selectable mesh and texture quality.
 *
 * The bundled GLBs are downloaded and decoded once (`loadAircraftBase`); every
 * quality tier is then built from that pristine copy:
 *
 *  - the node graph is cloned (cheap: geometry and materials are shared),
 *  - each mesh gets its own geometry, simplified with meshoptimizer when the
 *    tier asks for it (normals and UVs are preserved and weigh in the error
 *    metric, so the livery does not swim),
 *  - materials are cloned and their textures are re-rendered at the tier's
 *    maximum size, which is what actually saves GPU memory on low-end devices.
 *
 * Prepared objects own everything they create and can be disposed when the
 * viewer closes or the quality changes; the base copy stays cached so
 * reopening the viewer is instant.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js'
import {
  MODEL_MIN_TRIANGLES,
  MODEL_SIMPLIFY,
  MODEL_TEXTURE_MAX,
  TEXTURE_ANISOTROPY,
  type QualityTier,
} from '@/data/quality'

export interface PreparedAircraft {
  /** Clone of the GLB scene, ready to be scaled and positioned by the viewer. */
  object: THREE.Object3D
  /** Frees every geometry/material/texture created for this tier. */
  dispose: () => void
}

interface BaseModel {
  scene: THREE.Object3D
  dispose: () => void
}

const bases = new Map<string, Promise<BaseModel>>()

/** Disposes geometries, materials and their textures under `root`. */
function disposeObject(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      material.dispose()
    }
  })
}

/**
 * Loads (and caches) the original GLB. The base copy is never mutated, so a
 * second quality tier can be built from it at any time.
 */
export function loadAircraftBase(url: string): Promise<BaseModel> {
  const existing = bases.get(url)
  if (existing) return existing
  const promise = new Promise<BaseModel>((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        resolve({
          scene: gltf.scene,
          dispose: () => disposeObject(gltf.scene),
        })
      },
      undefined,
      () => reject(new Error(`No se pudo cargar el modelo 3D (${url})`)),
    )
  })
  bases.set(url, promise)
  promise.catch(() => bases.delete(url))
  return promise
}

/** Triangle count of a geometry (indexed or not). */
export function triangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex()
  const positions = geometry.getAttribute('position')
  if (!positions) return 0
  return Math.floor((index ? index.count : positions.count) / 3)
}

/**
 * Builds a decimated copy of a geometry.
 *
 * `ratio` is the fraction of triangles to keep. Meshes made of several draw
 * groups are left untouched: the simplifier rebuilds the index and groups
 * would be lost (and with them part of the livery).
 */
export async function simplifyGeometry(
  geometry: THREE.BufferGeometry,
  ratio: number,
): Promise<THREE.BufferGeometry> {
  const triangles = triangleCount(geometry)
  if (ratio >= 0.999 || triangles <= MODEL_MIN_TRIANGLES || geometry.groups.length > 1) {
    return geometry.clone()
  }
  const floor = Math.min(triangles, MODEL_MIN_TRIANGLES)
  const keep = Math.max(floor / triangles, Math.min(1, ratio))
  if (keep >= 1) return geometry.clone()
  // `modify()` counts vertices to remove; vertices ≈ index.count/3 for the
  // welded meshes of the GLBs, which keeps the result close to `keep`.
  const vertices = geometry.getAttribute('position').count
  const remove = Math.max(0, Math.round(vertices * (1 - keep)))
  try {
    const modifier = new SimplifyModifier()
    // Work on a copy: meshoptimizer rewrites the index buffer it receives.
    const simplified = await modifier.modify(geometry.clone(), remove)
    return simplified
  } catch {
    return geometry.clone()
  }
}

function canvasFromImage(
  image: CanvasImageSource & { width: number; height: number },
  maxSize: number,
): HTMLCanvasElement | null {
  const scale = maxSize / Math.max(image.width, image.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

/**
 * Copy of `source` rendered at most `maxSize` pixels wide, keeping colour
 * space, wrapping and UV transform so the livery stays aligned.
 */
function downscaleTexture(
  source: THREE.Texture,
  maxSize: number,
  anisotropy: number,
): THREE.Texture | null {
  const image = source.image as
    | (CanvasImageSource & { width?: number; height?: number })
    | null
    | undefined
  const width = Number(image?.width) || 0
  const height = Number(image?.height) || 0
  if (!image || !width || !height) return null
  const canvas = canvasFromImage(
    image as CanvasImageSource & { width: number; height: number },
    maxSize,
  )
  if (!canvas) return null
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = source.colorSpace
  texture.wrapS = source.wrapS
  texture.wrapT = source.wrapT
  texture.repeat.copy(source.repeat)
  texture.offset.copy(source.offset)
  texture.center.copy(source.center)
  texture.rotation = source.rotation
  texture.flipY = source.flipY
  texture.magFilter = source.magFilter
  texture.minFilter = source.minFilter
  texture.generateMipmaps = source.generateMipmaps
  texture.anisotropy = Math.max(1, anisotropy)
  return texture
}

/**
 * Builds the aircraft scene for a quality tier.
 *
 * `maxAnisotropy` should come from the renderer capabilities; the tier value
 * is clamped so the GPU never gets asked for more than it supports.
 */
export async function buildAircraftObject(
  url: string,
  meshQuality: QualityTier,
  textureQuality: QualityTier,
  maxAnisotropy: number,
): Promise<PreparedAircraft> {
  const base = await loadAircraftBase(url)
  const object = base.scene.clone(true)
  const ownedGeometries: THREE.BufferGeometry[] = []
  const ownedMaterials: THREE.Material[] = []
  const ownedTextures: THREE.Texture[] = []

  // 1. Geometry: simplify each mesh independently, in parallel.
  const meshes: THREE.Mesh[] = []
  object.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh)
  })
  await Promise.all(
    meshes.map(async (mesh) => {
      const geometry = await simplifyGeometry(mesh.geometry, MODEL_SIMPLIFY[meshQuality])
      mesh.geometry = geometry
      ownedGeometries.push(geometry)
    }),
  )

  // 2. Materials: clone once per source material and downscale every texture.
  const maxSize = MODEL_TEXTURE_MAX[textureQuality]
  const anisotropy = Math.min(TEXTURE_ANISOTROPY[textureQuality], Math.max(1, maxAnisotropy))
  const materialCache = new Map<THREE.Material, THREE.Material>()
  const textureCache = new Map<THREE.Texture, THREE.Texture>()

  const textureFor = (texture: THREE.Texture): THREE.Texture => {
    if (maxSize <= 0) return texture
    const cached = textureCache.get(texture)
    if (cached) return cached
    const image = texture.image as { width?: number; height?: number } | null
    const width = Number(image?.width) || 0
    const height = Number(image?.height) || 0
    let next = texture
    if (width > maxSize || height > maxSize) {
      const downscaled = downscaleTexture(texture, maxSize, anisotropy)
      if (downscaled) {
        ownedTextures.push(downscaled)
        next = downscaled
      }
    }
    textureCache.set(texture, next)
    return next
  }

  const materialFor = (material: THREE.Material): THREE.Material => {
    const cached = materialCache.get(material)
    if (cached) return cached
    const clone = material.clone()
    const target = clone as unknown as Record<string, unknown>
    for (const [key, value] of Object.entries(target)) {
      if (value instanceof THREE.Texture) target[key] = textureFor(value)
    }
    clone.needsUpdate = true
    materialCache.set(material, clone)
    ownedMaterials.push(clone)
    return clone
  }

  for (const mesh of meshes) {
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(materialFor)
      : materialFor(mesh.material)
  }

  return {
    object,
    dispose: () => {
      for (const geometry of ownedGeometries) geometry.dispose()
      for (const material of ownedMaterials) material.dispose()
      for (const texture of ownedTextures) texture.dispose()
      ownedGeometries.length = 0
      ownedMaterials.length = 0
      ownedTextures.length = 0
    },
  }
}

/** Drops the cached GLBs (tests / hot reload). */
export function clearAircraftBaseCache(): void {
  for (const pending of bases.values()) {
    void pending.then((base) => base.dispose()).catch(() => undefined)
  }
  bases.clear()
}
