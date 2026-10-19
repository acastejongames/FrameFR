import type { FeatureCollection, Polygon } from 'geojson'
import { WEATHER_GRID_SIZE, type ForecastMode } from './index'

const STOPS: Record<ForecastMode, number[][]> = {
  temp: [[-20,99,102,241],[0,56,189,248],[15,52,211,153],[30,251,191,36],[45,239,68,68]],
  wind: [[0,71,85,105],[20,56,189,248],[40,52,211,153],[70,251,191,36],[100,239,68,68]],
  rain: [[0,71,85,105],[0.5,56,189,248],[2,52,211,153],[5,251,191,36],[20,232,121,249]],
  storm: [[0,244,63,94],[1,244,63,94]],
}

/** Bilinear interpolation of measurements, never of ordinal WMO codes.
 * Missing neighbours stay transparent rather than being interpreted as zero.
 */
export function sampleGrid(values: Array<number | undefined>, x: number, y: number, n = WEATHER_GRID_SIZE): number | null {
  x = Math.max(0, Math.min(n - 1, x)); y = Math.max(0, Math.min(n - 1, y))
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(n-1,x0+1), y1 = Math.min(n-1,y0+1)
  const a = values[y0*n+x0], b = values[y0*n+x1], c = values[y1*n+x0], d = values[y1*n+x1]
  if ([a,b,c,d].some(v => v === undefined || !Number.isFinite(v))) return null
  const tx = x-x0, ty = y-y0
  return a!*(1-tx)*(1-ty) + b!*tx*(1-ty) + c!*(1-tx)*ty + d!*tx*ty
}
const mercator = (lat: number) => Math.log(Math.tan(Math.PI/4 + lat*Math.PI/360))
const latitude = (y: number) => (2*Math.atan(Math.exp(y))-Math.PI/2)*180/Math.PI

/** A georeferenced, continuous raster. Smoothing adds no observational accuracy. */
export function rasterizeForecast(data: FeatureCollection<Polygon>, mode: ForecastMode, size = 384) {
  if (!data.bbox || data.bbox.length !== 4) throw new Error('Extensión meteorológica inválida')
  const [west,south,east,north] = data.bbox
  const values: Array<number | undefined> = new Array(WEATHER_GRID_SIZE ** 2)
  for (const feature of data.features) {
    const value = feature.properties?.value
    const index = feature.properties?.gridIndex
    if (typeof index !== 'number' || typeof value !== 'number' || !Number.isFinite(value)) continue
    values[index] = mode === 'storm' ? (value >= 95 ? 1 : 0) : value
  }
  const pixels = new Uint8ClampedArray(size*size*4)
  const top = mercator(north), bottom = mercator(south)
  const stops = STOPS[mode]
  for (let y=0;y<size;y++) {
    const lat = latitude(top+(bottom-top)*(y+.5)/size)
    const gy = (lat-south)/(north-south)*WEATHER_GRID_SIZE-.5
    for (let x=0;x<size;x++) {
      const value = sampleGrid(values, (x+.5)/size*WEATHER_GRID_SIZE-.5, gy)
      if (value === null) continue
      let low = stops[0], high = stops.at(-1)!
      for (let k=1;k<stops.length;k++) if (value <= stops[k][0]) { low = stops[k-1]; high = stops[k]; break }
      const t = Math.max(0,Math.min(1,(value-low[0])/Math.max(.001,high[0]-low[0])))
      const index = (y*size+x)*4
      for (let c=0;c<3;c++) pixels[index+c] = low[c+1]+(high[c+1]-low[c+1])*t
      pixels[index+3] = mode === 'rain' ? Math.min(255,Math.max(0,value)*510) : mode === 'storm' ? value*255 : 255
    }
  }
  return { pixels, size, coordinates: [[west,north],[east,north],[east,south],[west,south]] as [[number,number],[number,number],[number,number],[number,number]] }
}

export function forecastImage(data: FeatureCollection<Polygon>, mode: ForecastMode) {
  const { pixels, size, coordinates } = rasterizeForecast(data, mode)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No se pudo dibujar la capa meteorológica')
  const image = context.createImageData(size,size)
  image.data.set(pixels)
  context.putImageData(image,0,0)
  return { url: canvas.toDataURL('image/png'), coordinates }
}
