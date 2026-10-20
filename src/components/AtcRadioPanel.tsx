import { useState, type FormEvent } from 'react'
import { ExternalLink, Radio } from 'lucide-react'
import { ToolPopover } from './ToolPopover'

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
  const [streamUrl, setStreamUrl] = useState<string | null>(null)

  const receiverUrl = receiver === 'alaro' ? ALARO_URL : customUrl
  const frequencyHz = toFrequencyHz(frequency)
  const tunedUrl = frequencyHz ? openWebRxUrl(receiverUrl, frequencyHz) : null

  const tune = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (tunedUrl) setStreamUrl(tunedUrl)
  }

  return (
    <ToolPopover
      id="atc-radio"
      title="Radio ATC"
      subtitle="Carga un receptor OpenWebRX+ sin salir del radar"
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
          {streamUrl && <span className="radio-active-dot" aria-hidden="true" />}
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
            <label htmlFor="radio-url">URL HTTPS de OpenWebRX</label>
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
          <small id="radio-frequency-hint">Banda aérea VHF: 118–136.975 MHz.</small>
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
            {streamUrl ? 'Sintonizar' : 'Cargar receptor'}
          </button>
          {streamUrl && (
            <button
              type="button"
              className="radio-stop"
              onClick={() => setStreamUrl(null)}
            >
              Detener
            </button>
          )}
          {tunedUrl && (
            <a
              className="radio-external"
              href={tunedUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir la frecuencia en OpenWebRX en otra pestaña"
            >
              <ExternalLink size={14} />
              Abrir aparte
            </a>
          )}
        </div>
      </form>

      {streamUrl && (
        <>
          <div className="radio-status" role="status" aria-live="polite">
            Receptor cargado. Pulsa “Start OpenWebRX+” dentro del panel para iniciar el audio.
          </div>
          <div className="radio-frame">
            <iframe
              key={streamUrl}
              src={streamUrl}
              title="Receptor OpenWebRX+"
              loading="lazy"
              allow="autoplay"
            />
          </div>
        </>
      )}

      {receiver === 'alaro' ? (
        <p className="radio-note">
          La recepción depende de que el receptor y su perfil estén disponibles. La ficha pública de Alaró enumera antenas de 144–430 MHz; la banda aérea queda fuera de ese rango publicado.
        </p>
      ) : (
        <p className="radio-note">
          La sintonía depende de que el perfil del servidor cubra esta frecuencia. Si el receptor no permite insertar su página, usa “Abrir aparte”.
        </p>
      )}
      <div className="radio-links">
        <a href="https://aip.enaire.es/AIP/contenido_AIP/ENR/LE_ENR_2_3_en.html" target="_blank" rel="noopener noreferrer">
          Frecuencias en AIP ENAIRE
        </a>
        <a href="https://fms.komkon.org/OWRX/" target="_blank" rel="noopener noreferrer">
          Cómo funciona OpenWebRX+
        </a>
      </div>
    </ToolPopover>
  )
}
