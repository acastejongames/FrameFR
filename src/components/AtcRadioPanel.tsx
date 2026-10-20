import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ExternalLink, Radio } from 'lucide-react'
import { ToolPopover } from './ToolPopover'
import {
  OpenWebRxAudioClient,
  type RadioPlaybackState,
} from '@/lib/openwebrx-audio'

const ALARO_URL = 'https://sdr.alaro.ovh/'

const PALMA_FREQUENCIES = [
  { value: '118.455', label: 'Palma TWR · salidas' },
  { value: '118.305', label: 'Palma TWR · llegadas' },
  { value: '118.955', label: 'Palma Control' },
  { value: '119.255', label: 'ATIS · llegadas' },
  { value: '121.780', label: 'ATIS · salidas' },
]

function toFrequencyHz(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d{3}(?:\.\d{1,3})?$/.test(normalized)) return null
  const mhz = Number(normalized)
  if (!Number.isFinite(mhz) || mhz < 118 || mhz > 136.975) return null
  return Math.round(mhz * 1_000_000)
}

function openWebRxUrl(base: string, frequencyHz: number): string | null {
  try {
    const url = new URL(base.trim())
    if (url.protocol !== 'https:') return null
    url.hash = 'freq=' + frequencyHz + ',mod=am'
    return url.toString()
  } catch {
    return null
  }
}

const IDLE_PLAYBACK: RadioPlaybackState = { phase: 'idle', message: '' }

export function AtcRadioPanel({
  open,
  onToggle,
  onClose,
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const [receiver, setReceiver] = useState<'alaro' | 'custom'>('alaro')
  const [customUrl, setCustomUrl] = useState('')
  const [frequency, setFrequency] = useState('118.455')
  const [playback, setPlayback] = useState<RadioPlaybackState>(IDLE_PLAYBACK)
  const audioClientRef = useRef<OpenWebRxAudioClient | null>(null)

  const receiverUrl = receiver === 'alaro' ? ALARO_URL : customUrl
  const frequencyHz = toFrequencyHz(frequency)
  const tunedUrl = frequencyHz ? openWebRxUrl(receiverUrl, frequencyHz) : null
  const isActive = playback.phase !== 'idle'

  useEffect(() => () => {
    audioClientRef.current?.stop(true)
    audioClientRef.current = null
  }, [])

  const tune = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!tunedUrl || !frequencyHz) return
    audioClientRef.current?.stop(true)
    const client = new OpenWebRxAudioClient(receiverUrl, frequencyHz, setPlayback)
    audioClientRef.current = client
    void client.start()
  }

  const stop = () => {
    audioClientRef.current?.stop()
    audioClientRef.current = null
    setPlayback(IDLE_PLAYBACK)
  }

  return (
    <ToolPopover
      id="atc-radio"
      title="Radio ATC"
      subtitle="Audio directo de OpenWebRX+, sin waterfall ni ventana del receptor"
      open={open}
      onClose={onClose}
      trigger={
        <button
          type="button"
          className="dock-button"
          data-active={open}
          aria-pressed={open}
          aria-expanded={open}
          aria-controls="atc-radio"
          aria-haspopup="dialog"
          aria-label="Abrir radio ATC"
          title="Escuchar frecuencias de Palma"
          onClick={onToggle}
        >
          <Radio size={20} />
          <span>Radio</span>
          {isActive && <span className="radio-active-dot" data-state={playback.phase} aria-hidden="true" />}
        </button>
      }
    >
      <form className="radio-form" onSubmit={tune}>
        <div className="radio-field">
          <label htmlFor="radio-receiver">Receptor</label>
          <select
            id="radio-receiver"
            value={receiver}
            onChange={(event) => setReceiver(event.target.value as 'alaro' | 'custom')}
          >
            <option value="alaro">SDR Alaró · Mallorca</option>
            <option value="custom">URL personalizada</option>
          </select>
        </div>

        {receiver === 'custom' && (
          <div className="radio-field">
            <label htmlFor="radio-url">URL HTTPS de OpenWebRX+</label>
            <input
              id="radio-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://sdr.example.org/"
              value={customUrl}
              onChange={(event) => setCustomUrl(event.target.value)}
              spellCheck={false}
            />
          </div>
        )}

        <div className="radio-field">
          <label htmlFor="radio-frequency">Frecuencia ATC</label>
          <div className="radio-frequency-input">
            <input
              id="radio-frequency"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              list="palma-atc-frequencies"
              value={frequency}
              onChange={(event) => setFrequency(event.target.value)}
              aria-describedby="radio-frequency-hint"
              spellCheck={false}
            />
            <span>MHz</span>
          </div>
          <datalist id="palma-atc-frequencies">
            {PALMA_FREQUENCIES.map((channel) => (
              <option key={channel.value} value={channel.value} label={channel.label} />
            ))}
          </datalist>
          <small id="radio-frequency-hint">Banda aérea VHF: 118–136.975 MHz. Si el perfil no cubre la frecuencia, el reproductor solicita recentrar el SDR cuando el servidor lo permite.</small>
        </div>

        <div className="radio-channels" aria-label="Frecuencias rápidas de Palma">
          {PALMA_FREQUENCIES.map((channel) => (
            <button
              key={channel.value}
              type="button"
              className="radio-channel"
              aria-pressed={frequency === channel.value}
              onClick={() => setFrequency(channel.value)}
            >
              <strong>{channel.value}</strong>
              <small>{channel.label}</small>
            </button>
          ))}
        </div>

        <div className="radio-actions">
          <button type="submit" className="radio-load" disabled={!tunedUrl}>
            {isActive ? 'Sintonizar' : 'Escuchar'}
          </button>
          {isActive && (
            <button type="button" className="radio-stop" onClick={stop}>
              Detener
            </button>
          )}
          {tunedUrl && (
            <a
              className="radio-external"
              href={tunedUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir esta frecuencia en el sitio OpenWebRX+"
            >
              <ExternalLink size={14} />
              Abrir OpenWebRX+
            </a>
          )}
        </div>
      </form>

      {isActive && (
        <div className="radio-status" data-state={playback.phase} role="status" aria-live="polite">
          {playback.message}
        </div>
      )}

      <p className="radio-note">
        En SDR Alaró puedes sintonizar la banda aérea VHF (118–136.975 MHz). Si el perfil activo está en otra banda, se solicita recentrar el SDR cuando OpenWebRX+ lo permite; en un receptor público esto puede afectar la sintonía compartida.
      </p>
      <div className="radio-links">
        <a href="https://aip.enaire.es/AIP/contenido_AIP/ENR/LE_ENR_2_3_en.html" target="_blank" rel="noopener noreferrer">
          Frecuencias en AIP ENAIRE
        </a>
        <a href="https://fms.komkon.org/OWRX/" target="_blank" rel="noopener noreferrer">
          Manual OpenWebRX+
        </a>
      </div>
    </ToolPopover>
  )
}
