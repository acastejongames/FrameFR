import type { ForecastGrid, ForecastMode } from './index'

const STOPS: Record<ForecastMode, number[][]> = {
  temp: [[-20, 99, 102, 241], [0, 56, 189, 248], [15, 52, 211, 153], [30, 251, 191, 36], [45, 239, 68, 68]],
  wind: [[0, 71, 85, 105], [20, 56, 189, 248], [40, 52, 211, 153], [70, 251, 191, 36], [100, 239, 68, 68]],
  rain: [[0, 71, 85, 105], [0.5, 56, 189, 248], [2, 52, 211, 153], [5, 251, 191, 36], [20, 232, 121, 249]],
  storm: [[0, 244, 63, 94], [1, 244, 63, 94]],
}

/**
 * Bilinear sample of reported/model grid values. Missing neighbours stay
 * transparent instead of being interpreted as zero.
 */
export function sampleGrid(
  values: Array<number | undefined>,
  x: number,
  y: number,
  columns: number,
  rows = columns,
): number | null {
  const clampedX = Math.max(0, Math.min(columns - 1, x))
  const clampedY = Math.max(0, Math.min(rows - 1, y))
  const x0 = Math.floor(clampedX)
  const y0 = Math.floor(clampedY)
  const x1 = Math.min(columns - 1, x0 + 1)
  const y1 = Math.min(rows - 1, y0 + 1)
  const a = values[y0 * columns + x0]
  const b = values[y0 * columns + x1]
  const c = values[y1 * columns + x0]
  const d = values[y1 * columns + x1]
  if (a === undefined || b === undefined || c === undefined || d === undefined) return null
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d)) return null
  const tx = clampedX - x0
  const ty = clampedY - y0
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty
}

const mercator = (latitude: number): number => Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360))
const latitudeAt = (y: number): number => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI

/** Small, allocation-light raster for one stable sector (256×192 by default). */
export function rasterizeForecast(
  grid: ForecastGrid,
  mode: ForecastMode,
  width = 256,
  height = 192,
) {
  const { west, south, east, north, columns, rows } = grid.sector
  const source = grid.values[mode]
  const values = mode === 'storm'
    ? source.map((value) => value === undefined ? undefined : value >= 95 ? 1 : 0)
    : source
  const pixels = new Uint8ClampedArray(width * height * 4)
  const stops = STOPS[mode]
  const top = mercator(north)
  const bottom = mercator(south)
  const rowGridY = new Float64Array(height)
  for (let y = 0; y < height; y++) {
    const latitude = latitudeAt(top + ((bottom - top) * (y + 0.5)) / height)
    rowGridY[y] = ((latitude - south) / (north - south)) * rows - 0.5
  }

  for (let y = 0; y < height; y++) {
    const gy = rowGridY[y]
    for (let x = 0; x < width; x++) {
      const value = sampleGrid(values, ((x + 0.5) / width) * columns - 0.5, gy, columns, rows)
      if (value === null) continue
      let low = stops[0]
      let high = stops.at(-1)!
      for (let index = 1; index < stops.length; index++) {
        if (value <= stops[index][0]) {
          low = stops[index - 1]
          high = stops[index]
          break
        }
      }
      const t = Math.max(0, Math.min(1, (value - low[0]) / Math.max(0.001, high[0] - low[0])))
      const offset = (y * width + x) * 4
      pixels[offset] = low[1] + (high[1] - low[1]) * t
      pixels[offset + 1] = low[2] + (high[2] - low[2]) * t
      pixels[offset + 2] = low[3] + (high[3] - low[3]) * t
      pixels[offset + 3] = mode === 'rain'
        ? Math.min(255, Math.max(0, value) * 510)
        : mode === 'storm'
          ? value * 255
          : 255
    }
  }

  return {
    pixels,
    width,
    height,
    coordinates: [[west, north], [east, north], [east, south], [west, south]] as [[number, number], [number, number], [number, number], [number, number]],
  }
}
