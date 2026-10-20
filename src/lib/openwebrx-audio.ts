export type RadioPlaybackPhase =
  | 'idle'
  | 'connecting'
  | 'tuning'
  | 'playing'
  | 'out-of-band'
  | 'unavailable'
  | 'error'

export type RadioPlaybackState = {
  phase: RadioPlaybackPhase
  message: string
}

type StateHandler = (state: RadioPlaybackState) => void

type ReceiverProfile = { id: string; name: string }

function profileRangeHz(name: string): [number, number] | null {
  const match = name.match(/(\d+(?:[.,]\d+)?)\s*(?:-|–|—|to|a)\s*(\d+(?:[.,]\d+)?)/i)
  if (!match) return null
  const first = Number(match[1].replace(',', '.'))
  const second = Number(match[2].replace(',', '.'))
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null
  const scale = Math.max(first, second) < 1000 ? 1_000_000 : 1
  return [Math.min(first, second) * scale, Math.max(first, second) * scale]
}

function findProfileForFrequency(profiles: ReceiverProfile[], frequencyHz: number): ReceiverProfile | null {
  const ranged = profiles
    .map((profile) => ({ profile, range: profileRangeHz(profile.name) }))
    .filter((item): item is { profile: ReceiverProfile; range: [number, number] } =>
      item.range !== null && frequencyHz >= item.range[0] && frequencyHz <= item.range[1],
    )
    .sort((first, second) => (first.range[1] - first.range[0]) - (second.range[1] - second.range[0]))
  if (ranged.length > 0) return ranged[0].profile

  const airbandKeywords = ['airband', 'air band', 'banda aerea', 'aviation', 'aviacion']
  if (frequencyHz >= 118_000_000 && frequencyHz <= 137_000_000) {
    const airband = profiles.find((profile) => {
      const normalized = profile.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      return airbandKeywords.some((keyword) => normalized.includes(keyword))
    })
    if (airband) return airband
  }
  return null
}

const INDEX_TABLE = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8]
const STEP_TABLE = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
  50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
  253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
  1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327,
  3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487,
  12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
]

class ImaAdpcmDecoder {
  private index = 0
  private predictor = 0
  private step = 0
  private phase: 0 | 1 | 2 = 0
  private matched = 0
  private bytesToSync = 0
  private header = new Uint8Array(4)
  private headerIndex = 0

  decode(bytes: Uint8Array): Int16Array {
    const output = new Int16Array(bytes.length * 2)
    let outputIndex = 0
    for (const byte of bytes) {
      if (this.phase === 0) {
        const expected = [83, 89, 78, 67][this.matched]
        this.matched = byte === expected ? this.matched + 1 : byte === 83 ? 1 : 0
        if (this.matched === 4) {
          this.headerIndex = 0
          this.phase = 1
        }
      } else if (this.phase === 1) {
        this.header[this.headerIndex++] = byte
        if (this.headerIndex === 4) {
          this.index = Math.min(88, this.header[0] | (this.header[1] << 8))
          this.predictor = this.header[2] | (this.header[3] << 8)
          if (this.predictor & 0x8000) this.predictor -= 0x10000
          this.step = 0
          this.bytesToSync = 1000
          this.phase = 2
        }
      } else {
        output[outputIndex++] = this.decodeNibble(byte & 15)
        output[outputIndex++] = this.decodeNibble(byte >> 4)
        this.bytesToSync -= 1
        if (this.bytesToSync < 0) {
          this.matched = 0
          this.phase = 0
        }
      }
    }
    return output.slice(0, outputIndex)
  }

  private decodeNibble(nibble: number): number {
    this.index = Math.max(0, Math.min(88, this.index + INDEX_TABLE[nibble]))
    let difference = this.step >> 3
    if (nibble & 1) difference += this.step >> 2
    if (nibble & 2) difference += this.step >> 1
    if (nibble & 4) difference += this.step
    if (nibble & 8) difference = -difference
    this.predictor = Math.max(-32768, Math.min(32767, this.predictor + difference))
    this.step = STEP_TABLE[this.index]
    return this.predictor
  }
}

class PcmOutput {
  private readonly buffer: Float32Array
  private readIndex = 0
  private writeIndex = 0
  private length = 0
  private fraction = 0
  inputRate: number

  constructor(inputRate: number) {
    this.inputRate = inputRate
    this.buffer = new Float32Array(inputRate * 8)
  }

  push(samples: Int16Array): void {
    for (const sample of samples) {
      if (this.length === this.buffer.length) {
        this.readIndex = (this.readIndex + 1) % this.buffer.length
        this.length -= 1
      }
      this.buffer[this.writeIndex] = sample / 32768
      this.writeIndex = (this.writeIndex + 1) % this.buffer.length
      this.length += 1
    }
  }

  render(output: Float32Array, outputRate: number): void {
    const ratio = this.inputRate / outputRate
    for (let i = 0; i < output.length; i += 1) {
      if (this.length < 2) {
        output[i] = 0
        continue
      }
      const first = this.buffer[this.readIndex]
      const next = this.buffer[(this.readIndex + 1) % this.buffer.length]
      output[i] = first + (next - first) * this.fraction
      this.fraction += ratio
      while (this.fraction >= 1 && this.length > 1) {
        this.readIndex = (this.readIndex + 1) % this.buffer.length
        this.length -= 1
        this.fraction -= 1
      }
    }
  }
}

function chooseRate(target: number, minimum: number, maximum: number): number {
  for (let factor = 1; factor <= target; factor += 1) {
    const rate = Math.floor(target / factor)
    if (rate < minimum) break
    if (rate <= maximum) return rate
  }
  return target
}

function makeSocketUrl(receiverUrl: string): string {
  const url = new URL(receiverUrl.trim())
  if (url.protocol !== 'https:') throw new Error('La URL del receptor debe comenzar por HTTPS.')
  url.protocol = 'wss:'
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname.replace(/\/+$/, '') + '/ws/'
  return url.toString()
}

function formatMHz(value: number): string {
  return (value / 1_000_000).toFixed(3)
}

export class OpenWebRxAudioClient {
  private socket: WebSocket | null = null
  private context: AudioContext | null = null
  private processor: ScriptProcessorNode | null = null
  private output: PcmOutput | null = null
  private timeout: number | null = null
  private retuneTimeout: number | null = null
  private profileTimeout: number | null = null
  private retuneRequested = false
  private profilesReceived = false
  private profiles: ReceiverProfile[] = []
  private selectedProfileId: string | null = null
  private stopped = false
  private terminal = false
  private started = false
  private heardAudio = false
  private compression: 'none' | 'adpcm' = 'none'
  private decoder = new ImaAdpcmDecoder()
  private config: Record<string, unknown> = {}
  private audioRate = 12000
  private hdAudioRate = 48000

  constructor(
    private readonly receiverUrl: string,
    private readonly frequencyHz: number,
    private readonly onState: StateHandler,
  ) {}

  async start(): Promise<void> {
    this.emit('connecting', 'Conectando al audio del receptor…')
    try {
      const AudioContextConstructor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextConstructor) throw new Error('Este navegador no admite Web Audio.')

      const context = new AudioContextConstructor({ latencyHint: 'playback' })
      this.context = context
      this.audioRate = chooseRate(context.sampleRate, 8000, 12000)
      this.hdAudioRate = chooseRate(context.sampleRate, 36000, 48000)
      if (this.hdAudioRate < 36000) this.hdAudioRate = context.sampleRate
      this.output = new PcmOutput(this.audioRate)

      await context.resume()
      if (this.stopped) return

      const processor = context.createScriptProcessor(4096, 0, 1)
      this.processor = processor
      processor.onaudioprocess = (event) => {
        const channel = event.outputBuffer.getChannelData(0)
        if (this.output) this.output.render(channel, context.sampleRate)
        else channel.fill(0)
      }
      processor.connect(context.destination)

      const socket = new WebSocket(makeSocketUrl(this.receiverUrl))
      this.socket = socket
      socket.binaryType = 'arraybuffer'
      this.timeout = window.setTimeout(() => {
        this.fail('unavailable', 'El receptor no respondió; puede estar fuera de servicio o no aceptar WebSocket.')
      }, 15000)
      socket.onopen = () => {
        if (this.stopped || this.terminal) return
        socket.send('SERVER DE CLIENT client=FrameFR type=receiver')
        socket.send(JSON.stringify({
          type: 'connectionproperties',
          params: { output_rate: this.audioRate, hd_output_rate: this.hdAudioRate },
        }))
      }
      socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
        if (this.stopped || this.terminal) return
        if (typeof event.data === 'string') this.handleText(event.data)
        else if (event.data instanceof ArrayBuffer) this.handleBinary(event.data)
      }
      socket.onerror = () => this.fail('error', 'No se pudo abrir el canal WebSocket seguro del receptor.')
      socket.onclose = () => {
        if (!this.stopped && !this.terminal) {
          this.fail('unavailable', 'El receptor cerró la conexión antes de iniciar el audio.')
        }
      }
    } catch (error) {
      this.fail('error', error instanceof Error ? error.message : 'No se pudo iniciar el reproductor.')
    }
  }

  stop(silent = false): void {
    if (this.stopped) return
    this.stopped = true
    this.clearTimeout()
    this.clearRetuneTimeout()
    this.clearProfileTimeout()
    this.socket?.close()
    this.socket = null
    this.releaseAudio()
    if (!silent) this.onState({ phase: 'idle', message: 'Audio detenido.' })
  }

  private handleText(message: string): void {
    if (message.startsWith('CLIENT DE SERVER')) return
    let data: { type?: string; value?: unknown }
    try {
      data = JSON.parse(message) as { type?: string; value?: unknown }
    } catch {
      return
    }
    if (data.type === 'config' && data.value && typeof data.value === 'object') {
      this.config = { ...this.config, ...(data.value as Record<string, unknown>) }
      this.configureDemodulator()
    } else if (data.type === 'profiles' && Array.isArray(data.value)) {
      this.profiles = data.value.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const profile = item as { id?: unknown; name?: unknown }
        return typeof profile.id === 'string' && typeof profile.name === 'string'
          ? [{ id: profile.id, name: profile.name }]
          : []
      })
      this.profilesReceived = true
      this.clearProfileTimeout()
      this.configureDemodulator()
    } else if (data.type === 'sdr_error') {
      this.fail('unavailable', String(data.value || 'El receptor SDR no está disponible.'))
    } else if (data.type === 'backoff') {
      this.fail('unavailable', 'OpenWebRX está ocupado: ' + String(data.value || 'inténtalo más tarde.'))
    }
  }

  private configureDemodulator(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    const center = Number(this.config.center_freq)
    const bandwidth = Number(this.config.samp_rate)
    if (!Number.isFinite(center) || !Number.isFinite(bandwidth) || bandwidth <= 0) return

    const minimum = center - bandwidth / 2
    const maximum = center + bandwidth / 2
    if (this.frequencyHz < minimum || this.frequencyHz > maximum) {
      if (this.selectedProfileId) return
      if (!this.profilesReceived) {
        if (this.profileTimeout === null) {
          this.emit('tuning', 'Buscando un perfil SDR que incluya ' + formatMHz(this.frequencyHz) + ' MHz…')
          this.profileTimeout = window.setTimeout(() => {
            this.fail('unavailable', 'OpenWebRX+ no envió la lista de perfiles disponibles.')
          }, 10000)
        }
        return
      }

      const matchingProfile = findProfileForFrequency(this.profiles, this.frequencyHz)
      const activeProfileId = String(this.config.sdr_id || '') + '|' + String(this.config.profile_id || '')
      if (matchingProfile && matchingProfile.id !== activeProfileId) {
        this.selectedProfileId = matchingProfile.id
        this.emit('tuning', 'Seleccionando perfil ' + matchingProfile.name + '…')
        this.socket.send(JSON.stringify({
          type: 'selectprofile',
          params: { profile: matchingProfile.id },
        }))
        this.profileTimeout = window.setTimeout(() => {
          this.fail(
            'unavailable',
            'OpenWebRX+ no activó el perfil ' + matchingProfile.name + '.',
          )
        }, 12000)
        return
      }

      if (this.config.allow_center_freq_changes === true && !this.retuneRequested) {
        this.retuneRequested = true
        this.emit('tuning', 'Solicitando recentrar el SDR en ' + formatMHz(this.frequencyHz) + ' MHz…')
        this.socket.send(JSON.stringify({
          type: 'setfrequency',
          params: { frequency: this.frequencyHz },
        }))
        this.retuneTimeout = window.setTimeout(() => {
          this.fail('out-of-band', 'OpenWebRX+ no aplicó el recentrado solicitado.')
        }, 10000)
      } else {
        this.fail(
          'out-of-band',
          'No se encontró un perfil anunciado que cubra ' + formatMHz(this.frequencyHz) + ' MHz.',
        )
      }
      return
    }

    this.clearRetuneTimeout()
    this.clearProfileTimeout()
    this.retuneRequested = false
    this.selectedProfileId = null
    this.compression = this.config.audio_compression === 'adpcm' ? 'adpcm' : 'none'
    this.socket.send(JSON.stringify({
      type: 'dspcontrol',
      params: {
        low_cut: -6000,
        high_cut: 6000,
        offset_freq: this.frequencyHz - center,
        mod: 'am',
        dmr_filter: 3,
        audio_service_id: 0,
        squelch_level: -150,
        secondary_mod: false,
        secondary_offset_freq: 0,
      },
    }))
    if (!this.started) {
      this.socket.send(JSON.stringify({ type: 'dspcontrol', action: 'start' }))
      this.started = true
      this.emit('tuning', 'Perfil compatible. Iniciando audio AM en ' + formatMHz(this.frequencyHz) + ' MHz…')
    }
  }

  private handleBinary(frame: ArrayBuffer): void {
    if (frame.byteLength < 2 || !this.output) return
    const bytes = new Uint8Array(frame)
    const type = bytes[0]
    if (type !== 2 && type !== 4) return
    const payload = bytes.subarray(1)
    let pcm: Int16Array
    if (this.compression === 'adpcm') {
      pcm = this.decoder.decode(payload)
    } else {
      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
      pcm = new Int16Array(Math.floor(payload.byteLength / 2))
      for (let i = 0; i < pcm.length; i += 1) pcm[i] = view.getInt16(i * 2, true)
    }
    this.output.inputRate = type === 4 ? this.hdAudioRate : this.audioRate
    this.output.push(pcm)
    if (!this.heardAudio && this.started) {
      this.heardAudio = true
      this.clearTimeout()
      this.emit('playing', 'Audio en directo · ' + formatMHz(this.frequencyHz) + ' MHz AM')
    }
  }

  private fail(phase: 'out-of-band' | 'unavailable' | 'error', message: string): void {
    if (this.terminal || this.stopped) return
    this.terminal = true
    this.clearTimeout()
    this.clearRetuneTimeout()
    this.clearProfileTimeout()
    this.releaseAudio()
    this.onState({ phase, message })
    this.socket?.close()
  }

  private releaseAudio(): void {
    this.processor?.disconnect()
    this.processor = null
    if (this.context && this.context.state !== 'closed') void this.context.close()
    this.context = null
    this.output = null
  }

  private clearTimeout(): void {
    if (this.timeout !== null) {
      window.clearTimeout(this.timeout)
      this.timeout = null
    }
  }

  private clearRetuneTimeout(): void {
    if (this.retuneTimeout !== null) {
      window.clearTimeout(this.retuneTimeout)
      this.retuneTimeout = null
    }
  }

  private clearProfileTimeout(): void {
    if (this.profileTimeout !== null) {
      window.clearTimeout(this.profileTimeout)
      this.profileTimeout = null
    }
  }

  private emit(phase: RadioPlaybackPhase, message: string): void {
    if (!this.stopped && !this.terminal) this.onState({ phase, message })
  }
}
