import { EyeOff, FolderKanban, Settings, X } from 'lucide-react'
import { useEffect } from 'react'
import {
  DEFAULT_MAX_AIRCRAFT,
  MAX_AIRCRAFT_OPTIONS,
  POLL_INTERVALS,
  type GuiVisibility,
  type SortKey,
} from '@/config'
import { PROVIDERS, type ProviderId } from '@/data/registry'
import type { BasemapId } from '@/map/style'
import { BASEMAPS } from '@/map/style'

interface SettingsModalProps {
  uiScale: number
  onUiScaleChange: (scale: number) => void
  open: boolean
  onClose: () => void
  providerId: ProviderId
  onProviderChange: (id: ProviderId) => void
  pollIntervalMs: number
  onPollIntervalChange: (ms: number) => void
  maxAircraft: number
  onMaxAircraftChange: (value: number) => void
  basemap: BasemapId
  onBasemapChange: (id: BasemapId) => void
  gui: GuiVisibility
  onGuiChange: (gui: GuiVisibility) => void
  showLabels: boolean
  onShowLabelsChange: (value: boolean) => void
  sortBy: SortKey
  onSortChange: (sort: SortKey) => void
  cleanMode: boolean
  onCleanModeToggle: () => void
  onOpenHubs: () => void
}

const GUI_TOGGLES: Array<{ key: keyof GuiVisibility; label: string }> = [
  { key: 'clock', label: 'Reloj UTC superior' },
  { key: 'counter', label: 'Contador de aviones' },
  { key: 'hubs', label: 'Accesos de aeropuertos' },
  { key: 'legend', label: 'Leyenda inferior' },
  { key: 'bottomControls', label: 'Controles inferiores' },
]

export function SettingsModal({
  uiScale,
  onUiScaleChange,
  open,
  onClose,
  providerId,
  onProviderChange,
  pollIntervalMs,
  onPollIntervalChange,
  maxAircraft,
  onMaxAircraftChange,
  basemap,
  onBasemapChange,
  gui,
  onGuiChange,
  showLabels,
  onShowLabelsChange,
  sortBy,
  onSortChange,
  cleanMode,
  onCleanModeToggle,
  onOpenHubs,
}: SettingsModalProps) {
  // Close with Escape.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <div style={{ maxHeight: 'calc(var(--ui-height, 100dvh) * .9)' }} className="panel-raised flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg">
        <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#14171c] px-4 py-3">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-accent" />
            <h2 className="cond text-sm font-bold uppercase tracking-wider text-white">
              Ajustes centralizados y visibilidad de la GUI
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn h-7 w-7 rounded border border-white/[0.09] bg-ink-700"
            aria-label="Cerrar ajustes"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-thin space-y-4 overflow-y-auto p-4 text-xs">
          {/* Interface visibility */}
          <section className="mb-4">
            <label htmlFor="ui-scale" className="block text-sm text-white/80">Tamaño de la interfaz</label>
            <select id="ui-scale" value={uiScale} onChange={e => onUiScaleChange(Number(e.target.value))} className="mt-2 w-full rounded bg-ink-700 p-2 text-sm">
              <option value={0.5}>×0.5 · Compacta</option>
              <option value={1}>×1 · Actual</option>
              <option value={2}>×2 · Grande</option>
            </select>
            <p className="mt-2 text-xs text-white/50">Solo cambia la UI, no el mapa. Ocultar UI elimina todos los controles; pulsa U para volver.</p>
          </section>
          <section className="space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-accent">
              Elementos de la interfaz (mostrar / ocultar)
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {GUI_TOGGLES.map((toggle) => (
                <label
                  key={toggle.key}
                  className="flex cursor-pointer items-center justify-between rounded border border-white/[0.07] bg-ink-700 p-2.5 transition hover:border-white/20"
                >
                  <span className="font-medium text-white/80">{toggle.label}</span>
                  <input
                    type="checkbox"
                    checked={gui[toggle.key]}
                    onChange={(event) =>
                      onGuiChange({ ...gui, [toggle.key]: event.target.checked })
                    }
                    className="h-4 w-4 cursor-pointer accent-[#ffbe00]"
                  />
                </label>
              ))}
              <label className="flex cursor-pointer items-center justify-between rounded border border-white/[0.07] bg-ink-700 p-2.5 transition hover:border-white/20">
                <span className="font-medium text-white/80">Etiquetas en el mapa</span>
                <input
                  type="checkbox"
                  checked={showLabels}
                  onChange={(event) => onShowLabelsChange(event.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-[#ffbe00]"
                />
              </label>
            </div>
          </section>

          {/* Telemetry */}
          <section className="space-y-3 border-t border-white/[0.06] pt-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-accent">
              Telemetría y fuente de datos ADS-B
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] uppercase text-white/40">
                  Proveedor de red ADS-B
                </label>
                <select
                  value={providerId}
                  onChange={(event) => onProviderChange(event.target.value as ProviderId)}
                  className="tech h-8 w-full rounded border border-white/[0.09] bg-[#12151a] px-2.5 text-xs text-white/80 outline-none focus:border-accent"
                >
                  {PROVIDERS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                      {provider.hint ? ` — ${provider.hint}` : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] leading-snug text-white/30">
                  {PROVIDERS.find((provider) => provider.id === providerId)?.description}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase text-white/40">
                  Frecuencia de actualización
                </label>
                <select
                  value={pollIntervalMs}
                  onChange={(event) => onPollIntervalChange(Number(event.target.value))}
                  className="tech h-8 w-full rounded border border-white/[0.09] bg-[#12151a] px-2.5 text-xs text-white/80 outline-none focus:border-accent"
                >
                  {POLL_INTERVALS.map((interval) => (
                    <option key={interval.value} value={interval.value}>
                      {interval.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] uppercase text-white/40">
                  Límite de aviones en pantalla
                </label>
                <select
                  value={maxAircraft}
                  onChange={(event) => onMaxAircraftChange(Number(event.target.value))}
                  className="tech h-8 w-full rounded border border-white/[0.09] bg-[#12151a] px-2.5 text-xs text-white/80 outline-none focus:border-accent"
                >
                  {MAX_AIRCRAFT_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value} aeronaves{value === DEFAULT_MAX_AIRCRAFT ? ' (por defecto)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase text-white/40">
                  Estilo cartográfico
                </label>
                <select
                  value={basemap}
                  onChange={(event) => onBasemapChange(event.target.value as BasemapId)}
                  className="tech h-8 w-full rounded border border-white/[0.09] bg-[#12151a] px-2.5 text-xs text-white/80 outline-none focus:border-accent"
                >
                  {BASEMAPS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] uppercase text-white/40">
                Orden de la tabla de tráfico
              </label>
              <select
                value={sortBy}
                onChange={(event) => onSortChange(event.target.value as SortKey)}
                className="tech h-8 w-full rounded border border-white/[0.09] bg-[#12151a] px-2.5 text-xs text-white/80 outline-none focus:border-accent sm:w-1/2"
              >
                <option value="alt">Altitud</option>
                <option value="spd">Velocidad</option>
                <option value="callsign">Vuelo</option>
              </select>
            </div>
          </section>

          {/* Quick actions */}
          <section className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3.5">
            <button
              type="button"
              onClick={onOpenHubs}
              className="flex items-center gap-1.5 rounded border border-white/[0.09] bg-ink-700 px-3 py-2 text-xs font-medium text-white/80 transition hover:bg-ink-600"
            >
              <FolderKanban className="h-3.5 w-3.5 text-accent" />
              Configurar aeropuertos y carpetas
            </button>
            <button
              type="button"
              onClick={onCleanModeToggle}
              className="flex items-center gap-1.5 rounded border border-white/[0.09] bg-ink-700 px-3 py-2 font-mono text-xs text-white/80 transition hover:bg-ink-600"
            >
              <EyeOff className="h-3.5 w-3.5 text-accent" />
              Modo limpio [U] {cleanMode ? '(activo)' : ''}
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
