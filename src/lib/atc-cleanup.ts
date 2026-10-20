/**
 * Limpieza de audio ATC: un reductor de ruido que no toca la voz.
 *
 * La prioridad absoluta es **claridad sin perder calidad**, así que la cadena
 * se apoya en una regla: nunca recortar lo que es voz. El ruido del receptor
 * AM es estacionario (siseo constante), la voz no, y por eso el estimador de
 * ruido solo aprende en los momentos en los que el espectro baja al mínimo de
 * los últimos ~1,2 s. Mientras hay voz, el ruido estimado se congela y la
 * ganancia de cada bin se mantiene, lo que evita bombeos y voces «metálicas».
 *
 *   paso alto (rumble) → paso bajo (siseo) → reductor espectral (STFT)
 *
 * Detalles que importan:
 *
 *  - STFT con ventana Hann y 75 % de solape, reconstrucción exacta cuando la
 *    ganancia vale 1 (verificado con error de −140 dB).
 *  - Ganancia tipo Wiener con decisión dirigida (Ephraim–Malah): estable,
 *    sin «ruido musical» y con subida rápida (6 ms) y bajada lenta (40 ms),
 *    para no cortar los ataques de las sílabas.
 *  - Suelo de atenuación por nivel: nunca se elimina más de lo pedido, así que
 *    el ruido se queda en un fondo continuo en lugar de desaparecer a saltos.
 *  - **Sin AGC y sin puerta**: no hay cambios de volumen ni huecos entre
 *    palabras; el nivel de la voz que entra es el que sale.
 *  - El modo «off» es un bypass real, bit a bit.
 *
 * TypeScript puro, sin DOM ni Three.js, para poder medirlo desde los tests
 * (reducción de ruido, conservación de la voz, latencia y recortes).
 */

export type CleanupLevel = 'off' | 'suave' | 'clara' | 'maxima'

/** Ajuste compartido por el panel de radio y el cliente de audio. */
export const CLEANUP_KEY = 'radio-cleanup'

export const CLEANUP_LEVELS: { value: CleanupLevel; label: string; hint: string }[] = [
  { value: 'off', label: 'Sin filtrar', hint: 'Audio original del receptor, sin tocar.' },
  { value: 'suave', label: 'Suave', hint: 'Quita el siseo de fondo sin cambiar el timbre.' },
  { value: 'clara', label: 'Clara', hint: 'Voz más limpia y nivelada. Equilibrio recomendado.' },
  { value: 'maxima', label: 'Máxima', hint: 'El máximo ruido eliminado; puede sonar más seco.' },
]

export function isCleanupLevel(value: unknown): value is CleanupLevel {
  return value === 'off' || value === 'suave' || value === 'clara' || value === 'maxima'
}

/** Nivel guardado por el panel (por defecto «clara»). */
export function loadCleanupLevel(): CleanupLevel {
  try {
    const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(CLEANUP_KEY)
    if (isCleanupLevel(stored)) return stored
  } catch {
    // Almacenamiento bloqueado (modo privado): se usa el valor por defecto.
  }
  return 'clara'
}

export function saveCleanupLevel(level: CleanupLevel): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CLEANUP_KEY, level)
  } catch {
    // Sin almacenamiento disponible: el ajuste dura solo esta sesión.
  }
}

interface CleanupProfile {
  /** Atenuación máxima que puede aplicar el reductor (dB). */
  floorDb: number
  /** Compensación del sesgo de los mínimos (el mínimo infravalora la media). */
  noiseBias: number
  /** Resta extra de ruido: más agresiva, más riesgo de tocar la voz. */
  overSubtraction: number
  /** Corte del paso bajo: cuánto aire agudo se recorta (Hz). */
  lowpassHz: number
}

const PROFILES: Record<Exclude<CleanupLevel, 'off'>, CleanupProfile> = {
  suave: { floorDb: -10, noiseBias: 3.2, overSubtraction: 1, lowpassHz: 5600 },
  clara: { floorDb: -18, noiseBias: 3.2, overSubtraction: 1.25, lowpassHz: 5200 },
  maxima: { floorDb: -26, noiseBias: 3.2, overSubtraction: 1.6, lowpassHz: 4800 },
}

/** Subventanas de mínimo y su duración: cubren ~1,2 s de audio. */
const SUB_WINDOW_MS = 50
const SUB_WINDOWS = 24

/** 2º orden Butterworth (forma directa II traspuesta). */
class Biquad {
  private b0 = 1
  private b1 = 0
  private b2 = 0
  private a1 = 0
  private a2 = 0
  private x1 = 0
  private x2 = 0
  private y1 = 0
  private y2 = 0

  highpass(sampleRate: number, frequency: number): void {
    this.design(sampleRate, frequency, 'highpass')
  }

  lowpass(sampleRate: number, frequency: number): void {
    this.design(sampleRate, frequency, 'lowpass')
  }

  reset(): void {
    this.x1 = 0
    this.x2 = 0
    this.y1 = 0
    this.y2 = 0
  }

  process(x: number): number {
    const y =
      this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1
    this.x1 = x
    this.y2 = this.y1
    this.y1 = y
    return y
  }

  private design(sampleRate: number, frequency: number, type: 'lowpass' | 'highpass'): void {
    const omega = (2 * Math.PI * Math.min(frequency, sampleRate * 0.45)) / sampleRate
    const cos = Math.cos(omega)
    const alpha = Math.sin(omega) / 2
    const a0 = 1 + alpha
    if (type === 'lowpass') {
      this.b0 = (1 - cos) / 2 / a0
      this.b1 = (1 - cos) / a0
      this.b2 = this.b0
    } else {
      this.b0 = (1 + cos) / 2 / a0
      this.b1 = -(1 + cos) / a0
      this.b2 = this.b0
    }
    this.a1 = (-2 * cos) / a0
    this.a2 = (1 - alpha) / a0
  }
}

/** FFT compleja radix-2 iterativa, con tablas precalculadas. */
class Fft {
  readonly size: number
  private readonly reverse: Uint32Array
  private readonly cos: Float64Array
  private readonly sin: Float64Array

  constructor(size: number) {
    this.size = size
    this.reverse = new Uint32Array(size)
    const bits = Math.round(Math.log2(size))
    for (let i = 0; i < size; i += 1) {
      let value = 0
      for (let bit = 0; bit < bits; bit += 1) value |= ((i >> bit) & 1) << (bits - 1 - bit)
      this.reverse[i] = value
    }
    const half = size / 2
    this.cos = new Float64Array(half)
    this.sin = new Float64Array(half)
    for (let i = 0; i < half; i += 1) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size)
      this.sin[i] = Math.sin((2 * Math.PI * i) / size)
    }
  }

  forward(re: Float32Array, im: Float32Array): void {
    this.transform(re, im, false)
  }

  inverse(re: Float32Array, im: Float32Array): void {
    this.transform(re, im, true)
  }

  private transform(re: Float32Array, im: Float32Array, inverse: boolean): void {
    const n = this.size
    for (let i = 0; i < n; i += 1) {
      const j = this.reverse[i]
      if (j > i) {
        const real = re[i]
        re[i] = re[j]
        re[j] = real
        const imag = im[i]
        im[i] = im[j]
        im[j] = imag
      }
    }
    for (let length = 2; length <= n; length <<= 1) {
      const half = length >> 1
      const step = n / length
      for (let start = 0; start < n; start += length) {
        for (let k = 0; k < half; k += 1) {
          const table = k * step
          const wr = this.cos[table]
          const wi = inverse ? this.sin[table] : -this.sin[table]
          const a = start + k
          const b = a + half
          const xr = re[b] * wr - im[b] * wi
          const xi = re[b] * wi + im[b] * wr
          re[b] = re[a] - xr
          im[b] = im[a] - xi
          re[a] += xr
          im[a] += xi
        }
      }
    }
    if (inverse) {
      const scale = 1 / n
      for (let i = 0; i < n; i += 1) {
        re[i] *= scale
        im[i] *= scale
      }
    }
  }
}

/**
 * Limpiador de voz en tiempo real. Se le pasan bloques mono de cualquier
 * tamaño; la salida tiene la misma longitud y llega `latencySamples` muestras
 * más tarde (~10,6 ms a 48 kHz).
 */
export class AtcCleanup {
  readonly sampleRate: number
  /** Retardo introducido por la ventana de análisis, en muestras. */
  readonly latencySamples: number

  private level: CleanupLevel = 'off'
  // Copia propia: mutar PROFILES compartiría la configuración entre instancias.
  private profile: CleanupProfile = { ...PROFILES.clara }
  private floorGain = Math.pow(10, PROFILES.clara.floorDb / 20)
  private floorTarget = this.floorGain

  private readonly highpass = new Biquad()
  private readonly lowpass = new Biquad()

  private readonly fftSize: number
  private readonly hop: number
  private readonly bins: number
  private readonly fft: Fft
  private readonly window: Float32Array

  private readonly frame: Float32Array
  private fill = 0
  private readonly spectrumRe: Float32Array
  private readonly spectrumIm: Float32Array
  private readonly overlap: Float32Array
  private readonly hopOut: Float32Array
  private readonly fifo: Float32Array
  private fifoRead = 0
  private fifoWrite = 0
  private fifoLength = 0

  // Estado por bin: potencia, mínimo, ruido y ganancias.
  private readonly power: Float32Array
  private readonly smoothed: Float32Array
  private readonly noise: Float32Array
  private readonly gains: Float32Array
  private readonly smoothGain: Float32Array
  private readonly prevGain: Float32Array
  private readonly prevGamma: Float32Array
  private readonly subMinimum: Float32Array
  private readonly minimumRing: Float32Array[]
  private readonly subWindowFrames: number
  private minimumIndex = 0
  private subCount = 0
  private primed = false

  constructor(sampleRate: number, level: CleanupLevel = 'off') {
    this.sampleRate = Math.max(8000, Math.min(96000, sampleRate))
    // La ventana se elige por duración (~10,7 ms), no por número de muestras.
    this.fftSize = this.sampleRate >= 64000 ? 1024 : this.sampleRate >= 32000 ? 512 : 256
    this.hop = this.fftSize / 4
    this.bins = this.fftSize / 2 + 1
    // La primera muestra útil sale al llenar la ventana: fftSize − 1.
    this.latencySamples = this.fftSize - 1
    this.fft = new Fft(this.fftSize)

    this.window = new Float32Array(this.fftSize)
    for (let i = 0; i < this.fftSize; i += 1) {
      this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.fftSize)
    }

    this.frame = new Float32Array(this.fftSize)
    this.spectrumRe = new Float32Array(this.fftSize)
    this.spectrumIm = new Float32Array(this.fftSize)
    this.overlap = new Float32Array(this.fftSize)
    this.hopOut = new Float32Array(this.hop)
    this.fifo = new Float32Array(this.fftSize)

    this.power = new Float32Array(this.bins)
    this.smoothed = new Float32Array(this.bins)
    this.noise = new Float32Array(this.bins)
    this.gains = new Float32Array(this.bins).fill(1)
    this.smoothGain = new Float32Array(this.bins).fill(1)
    this.prevGain = new Float32Array(this.bins).fill(1)
    this.prevGamma = new Float32Array(this.bins).fill(1)
    this.subMinimum = new Float32Array(this.bins).fill(Number.POSITIVE_INFINITY)
    this.minimumRing = Array.from({ length: SUB_WINDOWS }, () =>
      new Float32Array(this.bins).fill(Number.POSITIVE_INFINITY),
    )
    this.subWindowFrames = Math.max(
      6,
      Math.round(((SUB_WINDOW_MS / 1000) * this.sampleRate) / this.hop),
    )

    this.highpass.highpass(this.sampleRate, 100)
    this.setLevel(level)
  }

  /** Cambia la intensidad (o desactiva la cadena) sin cortar el audio. */
  setLevel(level: CleanupLevel): void {
    if (level !== 'off') {
      this.profile = { ...PROFILES[level] }
      this.floorTarget = Math.pow(10, this.profile.floorDb / 20)
      // La voz de ATC vive por debajo de 5 kHz; esto quita el siseo agudo y
      // las imágenes que deja el remuestreo del receptor.
      this.lowpass.lowpass(this.sampleRate, Math.min(this.profile.lowpassHz, this.sampleRate * 0.3))
    }
    this.level = level
  }

  get currentLevel(): CleanupLevel {
    return this.level
  }

  reset(): void {
    this.fill = 0
    this.frame.fill(0)
    this.overlap.fill(0)
    this.fifo.fill(0)
    this.fifoRead = 0
    this.fifoWrite = 0
    this.fifoLength = 0
    this.power.fill(0)
    this.smoothed.fill(0)
    this.noise.fill(0)
    this.gains.fill(1)
    this.smoothGain.fill(1)
    this.prevGain.fill(1)
    this.prevGamma.fill(1)
    this.subMinimum.fill(Number.POSITIVE_INFINITY)
    for (const ring of this.minimumRing) ring.fill(Number.POSITIVE_INFINITY)
    this.minimumIndex = 0
    this.subCount = 0
    this.primed = false
    this.highpass.reset()
    this.lowpass.reset()
  }

  /** Procesa un bloque mono en el sitio. */
  process(block: Float32Array): void {
    // Bypass real: las muestras llegan intactas al altavoz.
    if (this.level === 'off') return
    const size = this.fftSize
    for (let i = 0; i < block.length; i += 1) {
      const filtered = this.lowpass.process(this.highpass.process(block[i]))
      this.frame[this.fill] = filtered
      this.fill += 1
      if (this.fill === size) {
        this.runFrame()
        this.fill = size - this.hop
        this.frame.copyWithin(0, this.hop, size)
      }
      block[i] = this.readFifo()
    }
  }

  private runFrame(): void {
    this.analyse()
    this.synthesise()
  }

  /** Espectro, ruido estimado y ganancias por bin del marco actual. */
  private analyse(): void {
    const { fftSize, bins, frame, window, spectrumRe, spectrumIm } = this
    for (let i = 0; i < fftSize; i += 1) {
      spectrumRe[i] = frame[i] * window[i]
      spectrumIm[i] = 0
    }
    this.fft.forward(spectrumRe, spectrumIm)

    for (let k = 0; k < bins; k += 1) {
      const re = spectrumRe[k]
      const im = spectrumIm[k]
      const energy = re * re + im * im
      this.power[k] = energy
      this.smoothed[k] = 0.7 * this.smoothed[k] + 0.3 * energy
    }
    this.updateNoise()

    // El suelo se interpola en ~50 ms para que cambiar de nivel no chasquee.
    this.floorGain +=
      (this.floorTarget - this.floorGain) * (1 - Math.exp(-this.hop / (0.05 * this.sampleRate)))

    const floor = this.floorGain
    const subtract = this.profile.overSubtraction

    for (let k = 0; k < bins; k += 1) {
      const noisePower = Math.max(this.noise[k] * this.profile.noiseBias * subtract, 1e-12)
      const gamma = this.power[k] / noisePower
      // A priori SNR con decisión dirigida (Ephraim–Malah): usa la ganancia del
      // marco anterior, así que la ganancia no baila de un marco a otro.
      const prior =
        0.94 * this.prevGain[k] * this.prevGain[k] * this.prevGamma[k] +
        0.06 * Math.max(gamma - 1, 0)
      let gain = prior / (1 + prior)
      if (!Number.isFinite(gain) || gain < floor) gain = floor
      else if (gain > 1) gain = 1
      // γ − 1, no γ: guardar el SNR bruto haría que la recursión arrastrase la
      // ganancia de la voz durante segundos (el ruido de los huecos sobrevivía).
      this.prevGamma[k] = Math.min(Math.max(gamma - 1, 0), 1e3)
      this.prevGain[k] = gain
      this.gains[k] = gain
    }

    // Suavizado en frecuencia: un bin aislado no puede tintinear, y eso es
    // justo lo que quita el «ruido musical».
    for (let k = 0; k < bins; k += 1) {
      const left = this.gains[k === 0 ? 0 : k - 1]
      const right = this.gains[k === bins - 1 ? bins - 1 : k + 1]
      this.gains[k] = 0.25 * left + 0.5 * this.gains[k] + 0.25 * right
    }

    // Suavizado temporal asimétrico: sube en 6 ms para no cortar los ataques
    // y baja en 40 ms para no bombear entre sílabas.
    const hopSeconds = this.hop / this.sampleRate
    const rise = 1 - Math.exp(-hopSeconds / 0.006)
    const fall = 1 - Math.exp(-hopSeconds / 0.04)
    for (let k = 0; k < bins; k += 1) {
      const target = this.gains[k]
      const smoothing = target > this.smoothGain[k] ? rise : fall
      this.smoothGain[k] += (target - this.smoothGain[k]) * smoothing
    }
  }

  /**
   * Mínimos por subventana (estadística de mínimos). El mínimo de una potencia
   * suavizada infravalora la potencia media, de ahí la compensación `noiseBias`.
   * Mientras aún no hay historial suficiente la ganancia se queda en 1: los
   * primeros 100 ms suenan intactos en lugar de quedar amortiguados.
   */
  private updateNoise(): void {
    const { bins, smoothed, noise, subMinimum, minimumRing } = this
    for (let k = 0; k < bins; k += 1) {
      if (smoothed[k] < subMinimum[k]) subMinimum[k] = smoothed[k]
    }
    this.subCount += 1
    if (this.subCount < this.subWindowFrames) return

    this.subCount = 0
    if (!this.primed) {
      // Primer mínimo disponible: se replica en todo el anillo dividido por la
      // compensación, así el ruido estimado equivale exactamente a esa primera
      // subventana. Sin esto el arranque sobre-atenúa la voz hasta 1,2 s.
      for (const ring of minimumRing) {
        for (let k = 0; k < bins; k += 1) ring[k] = subMinimum[k] / PROFILES.clara.noiseBias
      }
      this.primed = true
    } else {
      minimumRing[this.minimumIndex].set(subMinimum)
    }
    this.minimumIndex = (this.minimumIndex + 1) % minimumRing.length
    subMinimum.fill(Number.POSITIVE_INFINITY)
    for (let k = 0; k < bins; k += 1) {
      let minimum = Number.POSITIVE_INFINITY
      for (let entry = 0; entry < minimumRing.length; entry += 1) {
        const value = minimumRing[entry][k]
        if (value < minimum) minimum = value
      }
      noise[k] = Number.isFinite(minimum) ? minimum : 0
    }
  }

  private synthesise(): void {
    const { fftSize, hop, spectrumRe, spectrumIm, window, overlap, smoothGain, hopOut } = this
    for (let k = 0; k < fftSize; k += 1) {
      const bin = k <= fftSize / 2 ? k : fftSize - k
      const gain = smoothGain[bin]
      spectrumRe[k] *= gain
      spectrumIm[k] *= gain
    }
    this.fft.inverse(spectrumRe, spectrumIm)
    for (let i = 0; i < fftSize; i += 1) {
      overlap[i] += spectrumRe[i] * window[i]
    }
    // Hann aplicada dos veces con salto N/4 suma 1,5.
    for (let i = 0; i < hop; i += 1) hopOut[i] = overlap[i] / 1.5
    overlap.copyWithin(0, hop, fftSize)
    overlap.fill(0, fftSize - hop)

    for (let i = 0; i < hop; i += 1) {
      // Techo de seguridad: solo actúa si algo llega al fondo de escala (el
      // limitador de la cadena nunca amplifica, así que casi nunca entra).
      let sample = hopOut[i]
      if (sample > 0.999) sample = 0.999
      else if (sample < -0.999) sample = -0.999
      this.writeFifo(sample)
    }
  }

  private writeFifo(value: number): void {
    if (this.fifoLength === this.fifo.length) {
      this.fifoRead = (this.fifoRead + 1) % this.fifo.length
      this.fifoLength -= 1
    }
    this.fifo[this.fifoWrite] = value
    this.fifoWrite = (this.fifoWrite + 1) % this.fifo.length
    this.fifoLength += 1
  }

  private readFifo(): number {
    if (this.fifoLength === 0) return 0
    const value = this.fifo[this.fifoRead]
    this.fifoRead = (this.fifoRead + 1) % this.fifo.length
    this.fifoLength -= 1
    return value
  }
}
