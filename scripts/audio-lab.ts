/**
 * Banco de pruebas del limpiador ATC.
 *
 * Genera voz sintética con formantes (sílabas de 0,2 s, pausas de 0,7 s) y
 * ruido marrón de receptor, y mide lo único que importa:
 *
 *  - `huecos`: cuánto baja el ruido en las pausas (reducción real).
 *  - `voz`: cuánto cambia el nivel de la voz con señal (debe quedar en 0 dB).
 *  - `residuo`: cuánto se separa la salida de la voz limpia en la banda de
 *    inteligibilidad (300–3400 Hz); incluye ruido que queda y distorsión.
 *  - `ataques`: nivel de los primeros 40 ms de cada sílaba (no debe hundirse).
 *  - recortes, longitud, latencia, bypass exacto y comportamiento con un tono.
 *
 * Uso: `npm run audio-lab -- [nivelRuido] [segundos]`.
 */
import { AtcCleanup, CLEANUP_LEVELS, type CleanupLevel } from '../src/lib/atc-cleanup'

const RATE = 48000
const NOISE_LEVEL = Number(process.argv[2] ?? 0.05)
const SECONDS = Number(process.argv[3] ?? 10)
const N = RATE * SECONDS
const CYCLE = Math.round(1.6 * RATE)
const SPEECH_END = Math.round(0.9 * RATE)

/** PRNG determinista: cada ejecución mide exactamente la misma señal. */
function rng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

interface Material {
  speech: Float32Array
  /** 1 en voz audible, 0 en pausa. */
  active: Uint8Array
  /** 1 en voz fuerte (envolvente > 0,5), para medir sin bordes. */
  loud: Uint8Array
}

/** Voz con formantes, jitter y sílabas: 0,9 s de voz y 0,7 s de pausa. */
function synthSpeech(seed: number): Material {
  const random = rng(seed)
  const speech = new Float32Array(N)
  const active = new Uint8Array(N)
  const loud = new Uint8Array(N)
  const formants = [
    [650, 1],
    [1150, 0.65],
    [2450, 0.35],
    [3400, 0.18],
  ]
  let phase = 0
  for (let i = 0; i < N; i += 1) {
    const t = i / RATE
    const cycle = t % 1.6
    const syllable = cycle % 0.32
    const voiced = cycle < 0.9 && syllable < 0.2
    const env = voiced ? Math.min(1, syllable / 0.02, (0.2 - syllable) / 0.03) : 0
    const jitter = 1 + 0.02 * Math.sin(2 * Math.PI * 0.7 * t) + 0.01 * (random() - 0.5)
    const f0 = 118 + 34 * Math.sin(2 * Math.PI * 0.13 * t)
    phase += (2 * Math.PI * f0 * jitter) / RATE
    let sample = 0
    for (let harmonic = 1; harmonic <= 32; harmonic += 1) {
      const frequency = harmonic * f0 * jitter
      if (frequency > 5200) break
      let amplitude = 1 / harmonic
      for (const [center, weight] of formants) {
        amplitude += (weight * Math.exp(-Math.pow((frequency - center) / 260, 2))) / harmonic ** 0.2
      }
      sample += amplitude * Math.sin(harmonic * phase)
    }
    // Consonantes sordas al final de cada sílaba.
    const consonant = cycle < 0.9 && syllable > 0.2 && syllable < 0.26 ? (random() - 0.5) * 0.5 : 0
    speech[i] = (sample * 0.12 + consonant) * env
    active[i] = env > 0.01 ? 1 : 0
    loud[i] = env > 0.5 ? 1 : 0
  }
  return { speech, active, loud }
}

/** Ruido de receptor: marrón, con la energía que deja un AM sin señal. */
function noiseOf(seed: number, level: number): Float32Array {
  const random = rng(seed)
  const noise = new Float32Array(N)
  let low = 0
  for (let i = 0; i < N; i += 1) {
    low = 0.85 * low + 0.15 * (random() * 2 - 1)
    noise[i] = low * level
  }
  return noise
}

/** Bicuadrada de 2º orden, solo para medir bandas. */
function biquadRun(data: Float32Array, frequency: number, type: 'lowpass' | 'highpass'): Float32Array {
  const omega = (2 * Math.PI * frequency) / RATE
  const cos = Math.cos(omega)
  const alpha = Math.sin(omega) / 2
  const a0 = 1 + alpha
  const b0 = type === 'lowpass' ? (1 - cos) / 2 / a0 : (1 + cos) / 2 / a0
  const b1 = type === 'lowpass' ? (1 - cos) / a0 : -(1 + cos) / a0
  const b2 = b0
  const a1 = (-2 * cos) / a0
  const a2 = (1 - alpha) / a0
  const out = new Float32Array(data.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < data.length; i += 1) {
    const x = data[i]
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    out[i] = y
  }
  return out
}

/** Energía por banda (300–3400 Hz en seis tramos) durante la voz fuerte. */
function bandEnergies(data: Float32Array, mask: Uint8Array): number[] {
  const edges = [300, 500, 800, 1200, 1800, 2500, 3400]
  const energies: number[] = []
  for (let band = 0; band < edges.length - 1; band += 1) {
    const high = biquadRun(biquadRun(data, edges[band + 1], 'lowpass'), edges[band], 'highpass')
    let sum = 0
    let count = 0
    for (let i = 0; i < data.length; i += 1) {
      if (!mask[i]) continue
      sum += high[i] * high[i]
      count += 1
    }
    energies.push(10 * Math.log10(Math.max(sum / Math.max(count, 1), 1e-20)))
  }
  return energies
}

/** Nivel en ventanas de 20 ms durante la voz fuerte (para detectar bombeo). */
function envelope(data: Float32Array, mask: Uint8Array): number[] {
  const frame = Math.round(0.02 * RATE)
  const levels: number[] = []
  for (let start = 0; start + frame < data.length; start += frame) {
    let used = 0
    let sum = 0
    for (let i = start; i < start + frame; i += 1) {
      if (!mask[i]) continue
      sum += data[i] * data[i]
      used += 1
    }
    if (used < frame * 0.8) continue
    levels.push(10 * Math.log10(Math.max(sum / used, 1e-20)))
  }
  return levels
}

const rms = (data: Float32Array, from = 0, to = data.length): number => {
  let sum = 0
  for (let i = from; i < to; i += 1) sum += data[i] * data[i]
  return Math.sqrt(sum / Math.max(1, to - from))
}

const db = (value: number): number => 20 * Math.log10(Math.max(value, 1e-12))

/** Retardo real de la cadena, medido con un clic (los filtros suman ~2 muestras). */
function measureLatency(level: CleanupLevel): number {
  if (level === 'off') return 0
  const probe = new AtcCleanup(RATE, level)
  const buffer = new Float32Array(8192)
  buffer[1000] = 0.5
  probe.process(buffer)
  let peak = 0
  let index = 0
  for (let i = 0; i < buffer.length; i += 1) {
    if (Math.abs(buffer[i]) > peak) {
      peak = Math.abs(buffer[i])
      index = i
    }
  }
  return index - 1000
}

function run(level: CleanupLevel, noisy: Float32Array) {
  const cleaner = new AtcCleanup(RATE, level)
  const out = new Float32Array(noisy)
  // Igual que el callback real: bloques de 4096 muestras.
  for (let offset = 0; offset < out.length; offset += 4096) {
    cleaner.process(out.subarray(offset, Math.min(offset + 4096, out.length)))
  }
  const delay = measureLatency(level)
  const aligned = new Float32Array(N)
  for (let i = 0; i + delay < N; i += 1) aligned[i] = out[i + delay]
  return { cleaner, out, aligned }
}

const material = synthSpeech(7)
const { speech, active, loud } = material
const noise = noiseOf(11, NOISE_LEVEL)
const noisy = new Float32Array(N)
for (let i = 0; i < N; i += 1) noisy[i] = speech[i] + noise[i]

const speechLevel = db(rms(speech, 0, N))
const noiseLevel = db(rms(noise, 0, N))
console.log(
  `voz ${speechLevel.toFixed(1)} dBFS · ruido ${noiseLevel.toFixed(1)} dBFS · SNR ${(speechLevel - noiseLevel).toFixed(1)} dB · ${SECONDS} s`,
)

// Máscaras de medida: pausa estabilizada, voz fuerte y ataques de sílaba.
const gapMask = new Uint8Array(N)
const tailFrom = Math.round(1.3 * RATE)
const tailTo = Math.round(1.55 * RATE)
const guard = Math.round(0.03 * RATE)
for (let i = 2 * guard; i < N - 2 * guard; i += 1) {
  if (active[i]) continue
  if (
    (i > guard && active[i - guard]) ||
    (i < N - guard && active[i + guard])
  ) {
    continue
  }
  if (i % CYCLE >= tailFrom && i % CYCLE <= tailTo) gapMask[i] = 1
}

const attackMask = new Uint8Array(N)
for (let start = 0; start < N; start += 1) {
  if (active[start] && (start === 0 || !active[start - 1])) {
    for (let i = start; i < Math.min(start + Math.round(0.04 * RATE), N); i += 1) attackMask[i] = 1
  }
}

// Se compara contra la voz limpia pasada por los mismos filtros de la cadena,
// así el retardo de fase de los filtros no cuenta como distorsión.
const referenceFiltered = biquadRun(biquadRun(speech, 4800, 'lowpass'), 100, 'highpass')
const referenceBands = bandEnergies(referenceFiltered, loud)
const referenceEnvelope = envelope(referenceFiltered, loud)

console.log(
  '\nnivel      huecos      voz   timbre   bombeo   ataques  recorte  latencia  longitud',
)
for (const { value } of CLEANUP_LEVELS) {
  const { cleaner, out, aligned } = run(value, noisy)

  let gapBefore = 0
  let gapAfter = 0
  let gapCount = 0
  for (let i = 0; i < N; i += 1) {
    if (!gapMask[i]) continue
    gapBefore += noisy[i] * noisy[i]
    gapAfter += aligned[i] * aligned[i]
    gapCount += 1
  }
  const gapDb = gapCount > 0 ? db(Math.sqrt(gapAfter / gapCount) / Math.sqrt(gapBefore / gapCount)) : 0

  let voiceRef = 0
  let voiceOut = 0
  for (let i = 0; i < N; i += 1) {
    if (!loud[i]) continue
    voiceRef += referenceFiltered[i] * referenceFiltered[i]
    voiceOut += aligned[i] * aligned[i]
  }
  const voiceDb = 10 * Math.log10(Math.max(voiceOut, 1e-20) / Math.max(voiceRef, 1e-20))

  const bands = bandEnergies(aligned, loud)
  let timbreDb = 0
  for (let band = 0; band < bands.length; band += 1) {
    timbreDb = Math.max(timbreDb, Math.abs(bands[band] - referenceBands[band]))
  }

  const levels = envelope(aligned, loud)
  const deltas = levels.map((level, index) => level - (referenceEnvelope[index] ?? level))
  const mean = deltas.reduce((sum, value) => sum + value, 0) / Math.max(deltas.length, 1)
  const bombeoDb = Math.sqrt(
    deltas.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(deltas.length, 1),
  )

  let attackRef = 0
  let attackOut = 0
  for (let i = 0; i < N; i += 1) {
    if (!attackMask[i]) continue
    attackRef += referenceFiltered[i] * referenceFiltered[i]
    attackOut += aligned[i] * aligned[i]
  }
  const attackDb = 10 * Math.log10(Math.max(attackOut, 1e-20) / Math.max(attackRef, 1e-20))

  let clipped = 0
  for (let i = 0; i < N; i += 1) if (Math.abs(out[i]) > 0.99) clipped += 1

  console.log(
    [
      value.padEnd(9),
      `${gapDb.toFixed(1).padStart(6)} dB`,
      `${voiceDb.toFixed(2).padStart(6)} dB`,
      `${timbreDb.toFixed(2).padStart(6)} dB`,
      `${bombeoDb.toFixed(2).padStart(6)} dB`,
      `${attackDb.toFixed(2).padStart(6)} dB`,
      String(clipped).padStart(7),
      `${measureLatency(value)}`.padStart(9),
      (out.length === N ? 'ok' : 'MAL').padStart(9),
    ].join('  '),
  )
  void cleaner
}

// Arranque en mitad de una transmisión: el primer cuarto de segundo no debe
// hundirse mientras el estimador de ruido se asienta.
{
  const { aligned } = run('clara', noisy)
  const from = 0
  const to = Math.round(0.3 * RATE)
  const reference = Math.max(rms(speech, from, to), 1e-9)
  console.log(`\narranque en voz (0–300 ms): ${db(rms(aligned, from, to) / reference).toFixed(2)} dB`)
}

// El bypass tiene que ser bit a bit.
{
  const cleaner = new AtcCleanup(RATE, 'off')
  const out = new Float32Array(noisy)
  for (let offset = 0; offset < out.length; offset += 4096) {
    cleaner.process(out.subarray(offset, Math.min(offset + 4096, out.length)))
  }
  let maxDiff = 0
  for (let i = 0; i < N; i += 1) maxDiff = Math.max(maxDiff, Math.abs(out[i] - noisy[i]))
  console.log(`\nbypass exacto: diferencia máxima ${maxDiff}`)
}

// Continuidad: un clic debe salir una sola vez.
{
  const cleaner = new AtcCleanup(RATE, 'clara')
  const buffer = new Float32Array(4096)
  buffer[1000] = 0.5
  cleaner.process(buffer)
  let peaks = 0
  for (let i = 1; i < buffer.length - 1; i += 1) {
    if (Math.abs(buffer[i]) > 0.05 && Math.abs(buffer[i]) >= Math.abs(buffer[i - 1]) && Math.abs(buffer[i]) > Math.abs(buffer[i + 1])) {
      peaks += 1
    }
  }
  console.log(`impulso: ${peaks} pico(s) en la salida (debe ser 1)`)
}

// Un tono estacionario (heterodino de un canal vecino) debe desaparecer.
{
  const tone = new Float32Array(RATE * 2)
  for (let i = 0; i < tone.length; i += 1) tone[i] = 0.2 * Math.sin((2 * Math.PI * 1200 * i) / RATE)
  for (const level of ['suave', 'clara', 'maxima'] as CleanupLevel[]) {
    const probe = new AtcCleanup(RATE, level)
    const out = new Float32Array(tone)
    for (let offset = 0; offset < out.length; offset += 4096) {
      probe.process(out.subarray(offset, Math.min(offset + 4096, out.length)))
    }
    const from = RATE
    console.log(`tono 1,2 kHz ${level}: ${db(rms(out, from) / rms(tone, from)).toFixed(1)} dB`)
  }
}
