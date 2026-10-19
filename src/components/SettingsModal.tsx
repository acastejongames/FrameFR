import { LayoutDashboard, Radar, Settings, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  DEFAULT_MAX_AIRCRAFT,
  MAX_AIRCRAFT_OPTIONS,
  POLL_INTERVALS,
  normalizeInterfaceScale,
  type GuiVisibility,
  type InterfaceScale,
  type SortKey,
} from '@/config'
import { PROVIDERS, type ProviderId } from '@/data/registry'
import type { BasemapId } from '@/map/style'
import { BASEMAPS } from '@/map/style'

interface SettingsModalProps {
  uiScale: InterfaceScale
  onUiScaleChange: (scale: InterfaceScale) => void
  open: boolean
  onClose: () => void
  providerId: ProviderId
  onProviderChange: (id: ProviderId) => void
  pollIntervalMs: number
  onPollIntervalChange: (ms: number) => void
  backgroundUpdates: boolean
  onBackgroundUpdatesChange: (enabled: boolean) => void
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
}

type SettingsTab = 'general' | 'interface' | 'telemetry'

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; Icon: typeof Settings }> = [
  { id: 'general', label: 'General', Icon: SlidersHorizontal },
  { id: 'interface', label: 'Interfaz', Icon: LayoutDashboard },
  { id: 'telemetry', label: 'Telemetría', Icon: Radar },
]

const GUI_TOGGLES: Array<{ key: keyof GuiVisibility; label: string }> = [
  { key: 'clock', label: 'Reloj UTC superior' },
  { key: 'counter', label: 'Contador de aviones' },
  { key: 'hubs', label: 'Accesos de aeropuertos' },
  { key: 'compass', label: 'Brújula' },
  { key: 'legend', label: 'Leyenda inferior' },
  { key: 'bottomControls', label: 'Controles inferiores' },
]

const SECTION_TITLE = 'text-[11px] font-bold uppercase tracking-wider text-accent'
const FIELD_LABEL = 'mb-1 block text-[10px] uppercase text-white/40'
const SELECT_CLASS =
  'tech h-8 w-full rounded border border-white/[0.09] bg-[#12151a] px-2.5 text-xs text-white/80 outline-none focus:border-accent'
const TOGGLE_CLASS =
  'flex cursor-pointer items-center justify-between gap-3 rounded border border-white/[0.07] bg-ink-700 p-2.5 transition hover:border-white/20'

export function SettingsModal({
  uiScale,
  onUiScaleChange,
  open,
  onClose,
  providerId,
  onProviderChange,
  pollIntervalMs,
  onPollIntervalChange,
  backgroundUpdates,
  onBackgroundUpdatesChange,
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
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  // Close with Escape. A stable ref keeps the listener alive across parent
  // re-renders so the key cannot be lost mid-dispatch.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % SETTINGS_TABS.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = SETTINGS_TABS.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    const nextTab = SETTINGS_TABS[nextIndex]
    setActiveTab(nextTab.id)
    window.requestAnimationFrame(() => {
      document.getElementById(`settings-tab-${nextTab.id}`)?.focus()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <div
        style={{ maxHeight: 'calc(var(--ui-height, 100dvh) * .9)' }}
        className="panel-raised flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#14171c] px-4 py-3">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-accent" />
            <h2 id="settings-title" className="cond text-sm font-bold uppercase tracking-wider text-white">
              Ajustes
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

        <div
          className="grid grid-cols-3 gap-1.5 border-b border-white/[0.07] bg-[#10141a] p-2.5"
          role="tablist"
          aria-label="Secciones de ajustes"
        >
          {SETTINGS_TABS.map((tab, index) => {
            const selected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                id={`settings-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`settings-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={`flex min-h-9 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition ${
                  selected
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-transparent text-white/55 hover:border-white/10 hover:bg-white/[0.04] hover:text-white/85'
                }`}
              >
                <tab.Icon className="h-3.5 w-3.5 shrink-0" />
                {tab.label}
              </button>
            )
          })}
        </div>

        <div
          id={`settings-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
          style={{ minHeight: 'min(320px, calc(var(--ui-height, 100dvh) * .5))' }}
          className="scroll-thin overflow-y-auto p-4 text-xs"
        >
          {activeTab === 'general' && (
            <div className="space-y-4">
              <section className="space-y-3">
                <div className={SECTION_TITLE}>Funcionamiento</div>
                <label className={TOGGLE_CLASS} htmlFor="background-updates">
                  <span>
                    <span className="block font-medium text-white/85">Actualizaciones en segundo plano</span>
                    <span id="background-updates-help" className="mt-1 block leading-snug text-white/45">
                      Sigue recibiendo posiciones reales y construyendo la ruta del avión seleccionado
                      mientras esta pestaña permanece abierta pero oculta o minimizada. Desactívalo en
                      equipos poco potentes para pausar la telemetría al ocultar la página.
                    </span>
                  </span>
                  <input
                    id="background-updates"
                    type="checkbox"
                    checked={backgroundUpdates}
                    onChange={(event) => onBackgroundUpdatesChange(event.target.checked)}
                    aria-describedby="background-updates-help"
                    className="h-4 w-4 shrink-0 cursor-pointer accent-[#ffbe00]"
                  />
                </label>
                <p className="px-0.5 text-[10px] leading-snug text-white/35">
                  FrameFR necesita que esta pestaña siga abierta: al cerrarla —o cerrar el
                  navegador— deja de recoger nuevos informes.
                </p>
              </section>

              <section className="grid grid-cols-1 gap-3 border-t border-white/[0.06] pt-3.5 sm:grid-cols-2">
                <div>
                  <label className={FIELD_LABEL} htmlFor="max-aircraft">
                    Límite de aviones en pantalla
                  </label>
                  <select
                    id="max-aircraft"
                    value={maxAircraft}
                    onChange={(event) => onMaxAircraftChange(Number(event.target.value))}
                    className={SELECT_CLASS}
                  >
                    {MAX_AIRCRAFT_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value} aeronaves{value === DEFAULT_MAX_AIRCRAFT ? ' · defecto' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={FIELD_LABEL} htmlFor="traffic-sort">
                    Orden de la tabla de tráfico
                  </label>
                  <select
                    id="traffic-sort"
                    value={sortBy}
                    onChange={(event) => onSortChange(event.target.value as SortKey)}
                    className={SELECT_CLASS}
                  >
                    <option value="alt">Altitud</option>
                    <option value="spd">Velocidad</option>
                    <option value="callsign">Vuelo</option>
                  </select>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'interface' && (
            <div className="space-y-4">
              <section>
                <label htmlFor="ui-scale" className="block text-sm text-white/80">
                  Tamaño de la interfaz
                </label>
                <select
                  id="ui-scale"
                  value={String(uiScale)}
                  onChange={(event) => onUiScaleChange(normalizeInterfaceScale(Number(event.target.value)))}
                  className="mt-2 w-full rounded bg-ink-700 p-2 text-sm"
                >
                  <option value="0.9">×0.9 · Compacta</option>
                  <option value="1">×1 · Actual</option>
                  <option value="1.25">×1.25 · Grande</option>
                </select>
                <p className="mt-2 text-xs text-white/50">Solo cambia la UI, no el mapa.</p>
              </section>

              <section className="space-y-2.5 border-t border-white/[0.06] pt-3.5">
                <div className={SECTION_TITLE}>Elementos visibles</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {GUI_TOGGLES.map((toggle) => (
                    <label key={toggle.key} className={TOGGLE_CLASS}>
                      <span className="font-medium text-white/80">{toggle.label}</span>
                      <input
                        type="checkbox"
                        checked={gui[toggle.key]}
                        onChange={(event) =>
                          onGuiChange({ ...gui, [toggle.key]: event.target.checked })
                        }
                        className="h-4 w-4 shrink-0 cursor-pointer accent-[#ffbe00]"
                      />
                    </label>
                  ))}
                  <label className={TOGGLE_CLASS}>
                    <span className="font-medium text-white/80">Etiquetas en el mapa</span>
                    <input
                      type="checkbox"
                      checked={showLabels}
                      onChange={(event) => onShowLabelsChange(event.target.checked)}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-[#ffbe00]"
                    />
                  </label>
                </div>
              </section>

              <section className="border-t border-white/[0.06] pt-3.5">
                <label className={FIELD_LABEL} htmlFor="settings-basemap">
                  Estilo cartográfico
                </label>
                <select
                  id="settings-basemap"
                  value={basemap}
                  onChange={(event) => onBasemapChange(event.target.value as BasemapId)}
                  className={SELECT_CLASS}
                >
                  {BASEMAPS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </section>
            </div>
          )}

          {activeTab === 'telemetry' && (
            <div className="space-y-4">
              <section className="space-y-3">
                <div className={SECTION_TITLE}>Fuente de datos ADS-B</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={FIELD_LABEL} htmlFor="telemetry-provider">
                      Proveedor de red ADS-B
                    </label>
                    <select
                      id="telemetry-provider"
                      value={providerId}
                      onChange={(event) => onProviderChange(event.target.value as ProviderId)}
                      className={SELECT_CLASS}
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
                    <label className={FIELD_LABEL} htmlFor="telemetry-poll-interval">
                      Frecuencia de actualización
                    </label>
                    <select
                      id="telemetry-poll-interval"
                      value={pollIntervalMs}
                      onChange={(event) => onPollIntervalChange(Number(event.target.value))}
                      className={SELECT_CLASS}
                    >
                      {POLL_INTERVALS.map((interval) => (
                        <option key={interval.value} value={interval.value}>
                          {interval.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>
              <p className="border-t border-white/[0.06] px-0.5 pt-3.5 leading-relaxed text-white/40">
                Las posiciones se dibujan únicamente cuando las informa la fuente seleccionada. Si las
                actualizaciones en segundo plano están activadas en General, se mantiene la misma
                frecuencia mientras la pestaña abierta está oculta.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
