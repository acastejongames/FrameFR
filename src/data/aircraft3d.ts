/**
 * Registry of the 3D aircraft models available in the orbit viewer.
 *
 * The GLB files live in `src/assets/models/aircraft/` and are imported with
 * `?url` so Vite fingerprints them and resolves the GitHub Pages base path.
 * Every model is normalized at load time so the drawn length matches the real
 * aircraft length: that is what "escala 1:1" means here.
 */

import a320Url from '@/assets/models/aircraft/A320.glb?url'
import a350Url from '@/assets/models/aircraft/A350.glb?url'
import a380Url from '@/assets/models/aircraft/A380.glb?url'
import b737Url from '@/assets/models/aircraft/B737.glb?url'
import b787Url from '@/assets/models/aircraft/B787.glb?url'

export type Aircraft3DModelId = 'a320' | 'a350' | 'a380' | 'b737' | 'b787'

export interface Aircraft3DModel {
  id: Aircraft3DModelId
  /** Family label shown in the 3D viewer header. */
  label: string
  /** Variant the model represents; its length defines the 1:1 scale. */
  representative: string
  /** Real fuselage length of `representative`, in meters. */
  realLengthM: number
  /** Bundled GLB URL. */
  modelUrl: string
  /**
   * Direction of the nose along the model's local +X axis after GLB node
   * transforms. All bundled models were inspected with `scripts/glb-inspect.mjs`
   * and point their nose towards +X.
   */
  noseAlongPositiveX: boolean
  /** ICAO type designators that use this model. */
  typeCodes: readonly string[]
  /** Fallback match against the free-text model name of live feeds. */
  namePattern: RegExp
}

export const AIRCRAFT_3D_MODELS: readonly Aircraft3DModel[] = [
  {
    id: 'a320',
    label: 'Airbus A320',
    representative: 'A320-200',
    realLengthM: 37.57,
    modelUrl: a320Url,
    noseAlongPositiveX: true,
    typeCodes: ['A318', 'A319', 'A320', 'A321', 'A19N', 'A20N', 'A21N', 'A32S', 'A32Q'],
    namePattern: /A3(18|19|20|21)|A320 FAMILY|A320NEO|A321NEO|A319NEO/i,
  },
  {
    id: 'a350',
    label: 'Airbus A350',
    representative: 'A350-900',
    realLengthM: 66.8,
    modelUrl: a350Url,
    noseAlongPositiveX: true,
    typeCodes: ['A358', 'A359', 'A35J', 'A35K', 'A35X'],
    namePattern: /A350/i,
  },
  {
    id: 'a380',
    label: 'Airbus A380',
    representative: 'A380-800',
    realLengthM: 72.72,
    modelUrl: a380Url,
    noseAlongPositiveX: true,
    typeCodes: ['A388', 'A389'],
    namePattern: /A380/i,
  },
  {
    id: 'b737',
    label: 'Boeing 737',
    representative: 'B737-800',
    realLengthM: 39.47,
    modelUrl: b737Url,
    noseAlongPositiveX: true,
    typeCodes: [
      'B731', 'B732', 'B733', 'B734', 'B735', 'B736', 'B737', 'B738', 'B739',
      'B37M', 'B38M', 'B39M', 'B3XM', 'BBJ', 'BB2', 'BB3',
    ],
    namePattern: /B737|BOEING 737|737 MAX|737-/,
  },
  {
    id: 'b787',
    label: 'Boeing 787',
    representative: 'B787-8',
    realLengthM: 56.69,
    modelUrl: b787Url,
    noseAlongPositiveX: true,
    typeCodes: ['B787', 'B788', 'B789', 'B78J', 'B78X'],
    namePattern: /B787|BOEING 787|DREAMLINER/i,
  },
]

/**
 * Resolves the 3D model of an aircraft from its ICAO type designator, falling
 * back to the free-text model name used by some live feeds.
 */
export function matchAircraft3D(type?: string, fullModel?: string): Aircraft3DModel | null {
  const code = type?.trim().toUpperCase()
  if (code) {
    for (const model of AIRCRAFT_3D_MODELS) {
      // Exact ICAO designator first, then the family pattern (some feeds and
      // the demo fleet use loose codes such as "A350" or "B737").
      if (model.typeCodes.includes(code) || model.namePattern.test(code)) return model
    }
  }
  const name = fullModel?.trim()
  if (name) {
    // Longest families first so "A320" wins over a looser pattern.
    for (const model of AIRCRAFT_3D_MODELS) {
      if (model.namePattern.test(name)) return model
    }
  }
  return null
}

/**
 * Scale that turns a model-space length into `realLengthM` meters.
 * Computed from the loaded bounding box so every model ends up 1:1.
 */
export function modelScaleFor(modelLengthInBounds: number, realLengthM: number): number {
  if (!Number.isFinite(modelLengthInBounds) || modelLengthInBounds <= 0) return 1
  return realLengthM / modelLengthInBounds
}

/**
 * Yaw that points the model's nose along a compass heading (0° = north).
 * The models sit nose-along-+X, and in the viewer scene +Z is south, so the
 * nose must rotate to `(sin θ, -cos θ)` on the ground plane.
 */
export function headingToRotationY(headingDeg: number, noseAlongPositiveX = true): number {
  const base = 90 - headingDeg + (noseAlongPositiveX ? 0 : 180)
  return (base * Math.PI) / 180
}

/**
 * Vertical position of the model group: its centre sits at the real altitude
 * above the map plane; on the ground the wheels rest on the plane instead.
 */
export function modelAltitudeY(altitudeFt: number, onGround: boolean, scaledHeightM: number): number {
  if (onGround || !Number.isFinite(altitudeFt) || altitudeFt <= 0) return scaledHeightM / 2
  return altitudeFt * 0.3048
}
