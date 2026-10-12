import { ExternalLink } from 'lucide-react'
import { FLEET_SIZES, REPO_URL, SPEED_FACTORS, VIEW_PRESETS } from '@/config'
import { PROVIDERS, type ProviderId } from '@/data/registry'
import type { ProviderMode } from '@/data/types'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
  providerId: ProviderId
  onProviderChange: (id: ProviderId) => void
  mode: ProviderMode
  fleetSize: number
  onFleetSizeChange: (size: number) => void
  speedFactor: number
  onSpeedFactorChange: (factor: number) => void
  labels: boolean
  onLabelsChange: (value: boolean) => void
  trail: boolean
  onTrailChange: (value: boolean) => void
  airborneOnly: boolean
  onAirborneOnlyChange: (value: boolean) => void
  onPreset: (center: [number, number], zoom: number) => void
}

export function SettingsPanel({
  open,
  onClose,
  providerId,
  onProviderChange,
  mode,
  fleetSize,
  onFleetSizeChange,
  speedFactor,
  onSpeedFactorChange,
  labels,
  onLabelsChange,
  trail,
  onTrailChange,
  airborneOnly,
  onAirborneOnlyChange,
  onPreset,
}: SettingsPanelProps) {
  if (!open) return null
  const provider = PROVIDERS.find((p) => p.id === providerId)

  return (
    <div className="panel-raised absolute right-4 top-[72px] z-40 w-[310px] animate-pop-in rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-medium tracking-tight">Ajustes</h2>
        <button type="button" onClick={onClose} className="text-[11px] text-white/35 hover:text-white/70">
          Cerrar
        </button>
      </div>

      {/* Data source */}
      <Section title="Fuente de datos">
        <Segmented
          options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
          value={providerId}
          onChange={(value) => onProviderChange(value as ProviderId)}
        />
        <p className="mt-2 text-[11px] leading-relaxed text-white/35">{provider?.description}</p>
        {mode === 'live' && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-amber-200/60">
            El feed en directo depende de la cobertura ADS-B de la zona y puede tardar unos segundos
            en responder.
          </p>
        )}
      </Section>

      {/* Simulation */}
      {mode === 'simulated' && (
        <Section title="Simulación">
          <Row label="Tamaño de flota">
            <Segmented
              options={FLEET_SIZES.map((size) => ({ value: size, label: String(size) }))}
              value={fleetSize}
              onChange={(value) => onFleetSizeChange(Number(value))}
            />
          </Row>
          <Row label="Velocidad">
            <Segmented
              options={SPEED_FACTORS.map((factor) => ({ value: factor, label: `${factor}×` }))}
              value={speedFactor}
              onChange={(value) => onSpeedFactorChange(Number(value))}
            />
          </Row>
        </Section>
      )}

      {/* Display */}
      <Section title="Visualización">
        <Toggle label="Etiquetas en el mapa" checked={labels} onChange={onLabelsChange} />
        <Toggle label="Estela del vuelo seleccionado" checked={trail} onChange={onTrailChange} />
        <Toggle label="Solo aeronaves en vuelo" checked={airborneOnly} onChange={onAirborneOnlyChange} />
      </Section>

      {/* Camera presets */}
      <Section title="Ir a" last>
        <div className="grid grid-cols-2 gap-1.5">
          {VIEW_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onPreset(preset.center as unknown as [number, number], preset.zoom)}
              className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11.5px] text-white/65 transition hover:bg-white/[0.06] hover:text-white"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/70"
        >
          FrameFR en GitHub
          <ExternalLink className="h-3 w-3" />
        </a>
      </Section>
    </div>
  )
}

function Section({
  title,
  children,
  last,
}: {
  title: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div className={`mt-4 ${last ? '' : 'border-b border-white/[0.06] pb-4'}`}>
      <div className="label-caps mb-2">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 last:mb-0">
      <span className="text-[11.5px] text-white/55">{label}</span>
      {children}
    </div>
  )
}

interface SegmentedProps<T extends string | number> {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}

function Segmented<T extends string | number>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="flex rounded-lg border border-white/[0.07] bg-black/20 p-0.5">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-[6px] px-2 py-1 text-[11.5px] transition ${
              active
                ? 'bg-white/[0.10] text-white shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset]'
                : 'text-white/45 hover:text-white/75'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="mb-1.5 flex w-full items-center justify-between text-left last:mb-0"
      role="switch"
      aria-checked={checked}
    >
      <span className="text-[11.5px] text-white/55">{label}</span>
      <span
        className={`relative h-4 w-7 rounded-full transition-colors ${
          checked ? 'bg-accent/70' : 'bg-white/12'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}
