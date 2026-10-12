import { ALTITUDE_BANDS, SELECTED_COLOR } from './palette'

/**
 * Aircraft sprites are generated at runtime on a canvas instead of shipping a
 * sprite sheet: it keeps the bundle small, the colours in sync with the palette
 * and the icons crisp on high-DPI screens.
 */

const SIZE = 34 // logical pixels
const PIXEL_RATIO = 3

export interface GeneratedIcon {
  width: number
  height: number
  data: Uint8ClampedArray
  pixelRatio: number
}

/** Half silhouette (x >= 0), nose pointing up at negative y. */
const HALF_SHAPE: ReadonlyArray<readonly [number, number]> = [
  [0, -15],
  [1.9, -10.5],
  [2.5, -3],
  [3.1, 3],
  [14.5, 12.5],
  [14.5, 15.5],
  [3.3, 10.5],
  [2.9, 17],
  [8.2, 22.5],
  [8.2, 24.3],
  [2.3, 21.5],
  [1.9, 26],
  [0, 26.5],
]

function mixHex(hex: string, mix: string, amount: number): string {
  const a = parseInt(hex.slice(1), 16)
  const b = parseInt(mix.slice(1), 16)
  const ch = (shift: number) => {
    const av = (a >> shift) & 0xff
    const bv = (b >> shift) & 0xff
    return Math.round(av + (bv - av) * amount)
  }
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`
}

function buildPath(): Path2D {
  const path = new Path2D()
  const [first] = HALF_SHAPE
  path.moveTo(first[0], first[1])
  for (let i = 1; i < HALF_SHAPE.length; i++) {
    const p = HALF_SHAPE[i]
    path.lineTo(p[0], p[1])
  }
  for (let i = HALF_SHAPE.length - 2; i >= 0; i--) {
    const p = HALF_SHAPE[i]
    path.lineTo(-p[0], p[1])
  }
  path.closePath()
  return path
}

function renderIcon(color: string, options: { ring?: boolean } = {}): GeneratedIcon {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE * PIXEL_RATIO
  canvas.height = SIZE * PIXEL_RATIO
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D no disponible')
  ctx.scale(PIXEL_RATIO, PIXEL_RATIO)
  ctx.translate(SIZE / 2, SIZE / 2)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (options.ring) {
    ctx.beginPath()
    ctx.arc(0, 0, 16, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(94, 234, 212, 0.14)'
    ctx.fill()
    ctx.lineWidth = 1.3
    ctx.strokeStyle = 'rgba(94, 234, 212, 0.9)'
    ctx.stroke()
  }

  const path = buildPath()
  // Dark halo keeps the aircraft readable over bright basemap areas.
  ctx.lineWidth = 3.4
  ctx.strokeStyle = 'rgba(3, 5, 9, 0.92)'
  ctx.stroke(path)

  const gradient = ctx.createLinearGradient(0, -15, 0, 26)
  gradient.addColorStop(0, mixHex(color, '#ffffff', 0.22))
  gradient.addColorStop(1, color)
  ctx.fillStyle = gradient
  ctx.fill(path)

  return {
    width: canvas.width,
    height: canvas.height,
    data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    pixelRatio: PIXEL_RATIO,
  }
}

/** Icons keyed by `ac-<band key>` plus the special `ac-selected`. */
export function buildAircraftIcons(): Record<string, GeneratedIcon> {
  const icons: Record<string, GeneratedIcon> = {}
  for (const band of ALTITUDE_BANDS) {
    icons[`ac-${band.key}`] = renderIcon(band.color)
  }
  icons['ac-selected'] = renderIcon(mixHex(SELECTED_COLOR, '#ffffff', 0.45), { ring: true })
  return icons
}
