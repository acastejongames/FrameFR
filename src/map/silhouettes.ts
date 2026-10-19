/**
 * Aircraft silhouettes drawn at runtime on a canvas.
 *
 * Instead of shipping a sprite sheet, the eight aircraft families are drawn
 * with the Canvas 2D API and registered as MapLibre images. The icons are
 * therefore crisp on any DPI, tiny in the bundle and can be recoloured.
 *
 * Three colour states are generated for every family:
 *
 *  - `air` — airborne, amber,
 *  - `sel` — selected, orange with a white outline,
 *  - `gnd` — on the ground, grey.
 */

import { SILHOUETTE_IDS, type SilhouetteId } from '@/data/aircraftTypes'

export { SILHOUETTE_IDS }
export type { SilhouetteId }

/** Colour palette of a silhouette state. */
export interface SilhouettePalette {
  main: string
  hi: string
  shade: string
  stroke: string
}

export const COLOR_STATES: Record<'air' | 'sel' | 'gnd', SilhouettePalette> = {
  air: { main: '#ffbe00', hi: '#ffe169', shade: '#d99b00', stroke: '#111111' },
  sel: { main: '#ff5500', hi: '#ff944d', shade: '#c23800', stroke: '#ffffff' },
  gnd: { main: '#9ca3af', hi: '#d1d5db', shade: '#6b7280', stroke: '#111111' },
}

export type SilhouetteState = keyof typeof COLOR_STATES

/** Logical size of a sprite, before the device pixel ratio is applied. */
const SPRITE_SIZE = 48
const PIXEL_RATIO = 3

/**
 * Draws an aircraft of the given family, centred on the current origin and
 * pointing north (negative y).
 */
export function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  family: SilhouetteId,
  palette: SilhouettePalette,
): void {
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Crisp drop shadow, as in the reference trackers.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)'
  ctx.shadowBlur = 3
  ctx.shadowOffsetX = 1
  ctx.shadowOffsetY = 1.5

  const gradient = ctx.createLinearGradient(-28, -36, 28, 36)
  gradient.addColorStop(0, palette.hi)
  gradient.addColorStop(0.5, palette.main)
  gradient.addColorStop(1, palette.shade)

  ctx.fillStyle = gradient
  ctx.strokeStyle = palette.stroke
  ctx.lineWidth = 2.4

  if (family === 'heavy4') {
    // Four engines under the wings (A380, B747, A340).
    for (const [x, yOff] of [
      [-28, -2],
      [-16, -8],
      [16, -8],
      [28, -2],
    ] as const) {
      ctx.beginPath()
      ctx.roundRect(x - 3.2, yOff, 6.4, 11, 2)
      ctx.fill()
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.moveTo(0, -40)
    ctx.bezierCurveTo(5.5, -36, 7, -25, 7, -14)
    ctx.lineTo(42, 8)
    ctx.lineTo(42, 14)
    ctx.lineTo(6.5, 4)
    ctx.lineTo(5, 25)
    ctx.lineTo(18, 34)
    ctx.lineTo(18, 39)
    ctx.lineTo(3, 35)
    ctx.lineTo(0, 41)
    ctx.lineTo(-3, 35)
    ctx.lineTo(-18, 39)
    ctx.lineTo(-18, 34)
    ctx.lineTo(-5, 25)
    ctx.lineTo(-6.5, 4)
    ctx.lineTo(-42, 14)
    ctx.lineTo(-42, 8)
    ctx.lineTo(-7, -14)
    ctx.bezierCurveTo(-7, -25, -5.5, -36, 0, -40)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else if (family === 'wide2') {
    // Two-engine widebody (B777, B787, A350, A330).
    for (const x of [-17, 17]) {
      ctx.beginPath()
      ctx.roundRect(x - 3.8, -10, 7.6, 13, 2.5)
      ctx.fill()
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.moveTo(0, -41)
    ctx.bezierCurveTo(5, -36, 6.2, -24, 6.2, -13)
    ctx.lineTo(41, 7)
    ctx.lineTo(41, 12.5)
    ctx.lineTo(5.8, 3.5)
    ctx.lineTo(4.5, 26)
    ctx.lineTo(16.5, 34.5)
    ctx.lineTo(16.5, 39)
    ctx.lineTo(2.5, 35)
    ctx.lineTo(0, 41)
    ctx.lineTo(-2.5, 35)
    ctx.lineTo(-16.5, 39)
    ctx.lineTo(-16.5, 34.5)
    ctx.lineTo(-4.5, 26)
    ctx.lineTo(-5.8, 3.5)
    ctx.lineTo(-41, 12.5)
    ctx.lineTo(-41, 7)
    ctx.lineTo(-6.2, -13)
    ctx.bezierCurveTo(-6.2, -24, -5, -36, 0, -41)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else if (family === 'bizjet') {
    // Rear-engine business / regional jet (CRJ, Citation, Gulfstream).
    for (const x of [-8.5, 8.5]) {
      ctx.beginPath()
      ctx.roundRect(x - 2.6, 14, 5.2, 11, 2)
      ctx.fill()
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.moveTo(0, -37)
    ctx.bezierCurveTo(4, -31, 4.8, -18, 4.8, -7)
    ctx.lineTo(33, 7)
    ctx.lineTo(33, 12)
    ctx.lineTo(4.6, 5)
    ctx.lineTo(3.8, 27)
    ctx.lineTo(14, 34)
    ctx.lineTo(14, 38)
    ctx.lineTo(0, 36)
    ctx.lineTo(-14, 38)
    ctx.lineTo(-14, 34)
    ctx.lineTo(-3.8, 27)
    ctx.lineTo(-4.6, 5)
    ctx.lineTo(-33, 12)
    ctx.lineTo(-33, 7)
    ctx.lineTo(-4.8, -7)
    ctx.bezierCurveTo(-4.8, -18, -4, -31, 0, -37)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else if (family === 'turboprop') {
    // Straight-wing twin turboprop (ATR 72, Dash 8).
    for (const x of [-15, 15]) {
      ctx.beginPath()
      ctx.roundRect(x - 2.8, -13, 5.6, 14, 2)
      ctx.fill()
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.moveTo(0, -36)
    ctx.bezierCurveTo(4.2, -31, 5, -20, 5, -9)
    ctx.lineTo(38, -7)
    ctx.lineTo(38, 0)
    ctx.lineTo(4.8, 1)
    ctx.lineTo(3.8, 27)
    ctx.lineTo(14, 29)
    ctx.lineTo(14, 34)
    ctx.lineTo(0, 34)
    ctx.lineTo(-14, 34)
    ctx.lineTo(-14, 29)
    ctx.lineTo(-3.8, 27)
    ctx.lineTo(-4.8, 1)
    ctx.lineTo(-38, 0)
    ctx.lineTo(-38, -7)
    ctx.lineTo(-5, -9)
    ctx.bezierCurveTo(-5, -20, -4.2, -31, 0, -36)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else if (family === 'lightprop') {
    // Single-engine general aviation (Cessna, Piper).
    ctx.beginPath()
    ctx.moveTo(0, -30)
    ctx.lineTo(4, -24)
    ctx.lineTo(4.2, -11)
    ctx.lineTo(34, -10)
    ctx.lineTo(34, -1)
    ctx.lineTo(4, 0)
    ctx.lineTo(2.8, 22)
    ctx.lineTo(13, 24)
    ctx.lineTo(13, 29)
    ctx.lineTo(2, 29)
    ctx.lineTo(0, 33)
    ctx.lineTo(-2, 29)
    ctx.lineTo(-13, 29)
    ctx.lineTo(-13, 24)
    ctx.lineTo(-2.8, 22)
    ctx.lineTo(-4, 0)
    ctx.lineTo(-34, -1)
    ctx.lineTo(-34, -10)
    ctx.lineTo(-4.2, -11)
    ctx.lineTo(-4, -24)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else if (family === 'heli') {
    // Helicopter with a translucent rotor disc and four blades.
    ctx.save()
    ctx.shadowColor = 'transparent'
    ctx.beginPath()
    ctx.arc(0, -4, 32, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()

    ctx.beginPath()
    ctx.ellipse(0, -6, 7.5, 14, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(-2.5, 6)
    ctx.lineTo(-1.8, 32)
    ctx.lineTo(-8, 32)
    ctx.lineTo(-8, 35)
    ctx.lineTo(5, 35)
    ctx.lineTo(5, 32)
    ctx.lineTo(1.8, 32)
    ctx.lineTo(2.5, 6)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.save()
    ctx.translate(0, -4)
    ctx.rotate(Math.PI / 4)
    ctx.fillStyle = '#e5e7eb'
    ctx.strokeStyle = '#111111'
    ctx.lineWidth = 1.6
    for (let i = 0; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(-1.5, 0)
      ctx.lineTo(-3.5, -31)
      ctx.lineTo(3.5, -31)
      ctx.lineTo(1.5, 0)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.rotate(Math.PI / 2)
    }
    ctx.restore()
  } else if (family === 'fastjet') {
    // Delta wing / fighter / supersonic (Eurofighter, Concorde).
    ctx.beginPath()
    ctx.moveTo(0, -41)
    ctx.lineTo(4, -22)
    ctx.lineTo(11, -18)
    ctx.lineTo(5, -14)
    ctx.lineTo(30, 19)
    ctx.lineTo(30, 25)
    ctx.lineTo(5, 25)
    ctx.lineTo(0, 36)
    ctx.lineTo(-5, 25)
    ctx.lineTo(-30, 25)
    ctx.lineTo(-30, 19)
    ctx.lineTo(-5, -14)
    ctx.lineTo(-11, -18)
    ctx.lineTo(-4, -22)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else {
    // Default `narrow2`: 2-engine narrowbody airliner (A320, B737).
    for (const x of [-14.5, 14.5]) {
      ctx.beginPath()
      ctx.roundRect(x - 3.2, -9, 6.4, 11, 2)
      ctx.fill()
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.moveTo(0, -37)
    ctx.bezierCurveTo(4.6, -32, 5.6, -21, 5.6, -11)
    ctx.lineTo(36, 7)
    ctx.lineTo(36, 12.5)
    ctx.lineTo(5.2, 4)
    ctx.lineTo(4, 24)
    ctx.lineTo(15, 32)
    ctx.lineTo(15, 36.5)
    ctx.lineTo(2.4, 33)
    ctx.lineTo(0, 38)
    ctx.lineTo(-2.4, 33)
    ctx.lineTo(-15, 36.5)
    ctx.lineTo(-15, 32)
    ctx.lineTo(-4, 24)
    ctx.lineTo(-5.2, 4)
    ctx.lineTo(-36, 12.5)
    ctx.lineTo(-36, 7)
    ctx.lineTo(-5.6, -11)
    ctx.bezierCurveTo(-5.6, -21, -4.6, -32, 0, -37)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  // Central fin line for a bit of realism (not on helicopters).
  if (family !== 'heli') {
    ctx.shadowColor = 'transparent'
    ctx.beginPath()
    ctx.moveTo(0, 21)
    ctx.lineTo(0, 34)
    ctx.strokeStyle = palette.stroke
    ctx.lineWidth = 1.8
    ctx.stroke()
  }

  ctx.restore()
}

/** A generated sprite, ready to be handed to MapLibre. */
export interface GeneratedIcon {
  width: number
  height: number
  data: Uint8ClampedArray
  pixelRatio: number
}

/** Renders one silhouette/state pair into a sprite. */
export function renderSilhouette(
  family: SilhouetteId,
  state: SilhouetteState,
  size = SPRITE_SIZE,
): GeneratedIcon {
  const canvas = document.createElement('canvas')
  canvas.width = size * PIXEL_RATIO
  canvas.height = size * PIXEL_RATIO
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D no disponible')

  ctx.scale(PIXEL_RATIO, PIXEL_RATIO)
  ctx.translate(size / 2, size / 2)
  // The drawing helpers use a 96x96 design grid.
  ctx.scale(size / 96, size / 96)
  drawSilhouette(ctx, family, COLOR_STATES[state])

  return {
    width: canvas.width,
    height: canvas.height,
    data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    pixelRatio: PIXEL_RATIO,
  }
}

/** MapLibre image id of a silhouette/state pair. */
export function silhouetteImageId(family: SilhouetteId, state: SilhouetteState): string {
  return `aero-${family}-${state}`
}

/** All the sprites needed to draw the traffic. */
export function buildSilhouetteIcons(): Record<string, GeneratedIcon> {
  const icons: Record<string, GeneratedIcon> = {}
  for (const family of SILHOUETTE_IDS) {
    for (const state of ['air', 'sel', 'gnd'] as const) {
      icons[silhouetteImageId(family, state)] = renderSilhouette(family, state)
    }
  }
  return icons
}
