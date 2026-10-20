import { Gauge, LayoutDashboard, Radar, Settings, SlidersHorizontal, X } from 'lucide-react'
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
import {
  MAP_QUALITIES,
  MAP_QUALITY_LABELS,
  PERFORMANCE_PROFILES,
  QUALITY_LABELS,
  QUALITY_TIERS,
  RENDER_RESOLUTIONS,
  RESOLUTION_LABELS,
  type PerformanceSettings,
} from '@/data/quality'
import {
  CESIUM_ION_ASSET_URL,
  CESIUM_ION_CONSOLE_URL,
  cesiumIonToken,
  maskedIonToken,
  setCesiumIonToken,
} from '@/data/photogrammetrySettings'
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
  performance: PerformanceSettings
  onPerformanceChange: (value: PerformanceSettings) => void
  photogrammetry: boolean
  onPhotogrammetryChange: (value: boolean) => void
}

type SettingsTab = 'general' | 'interface' | 'telemetry' | 'performance'

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; Icon: typeof Settings }> = [
  { id: 'general', label: 'General', Icon: SlidersHorizontal },
  { id: 'interface', label: 'Interfaz', Icon: LayoutDashboard },
  { id: 'telemetry', label: 'Telemetría', Icon: Radar },
  { id: 'performance', label: 'Rendimiento', Icon: Gauge },
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
  performance,
  onPerformanceChange,
  photogrammetry,
  onPhotogrammetryChange,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  // The Google key lives only in this browser: read it on mount, save on demand.
  const [tilesKey, setTilesKey] = useState(() => cesiumIonToken())
  const [keySaved, setKeySaved] = useState(false)

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
    else if (event.key === 'ArrowLeft')
      nextIndex = (index - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length
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
            <h2
              id="settings-title"
              className="cond text-sm font-bold uppercase tracking-wider text-white"
            >
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
          className="grid grid-cols-4 gap-1 border-b border-white/[0.07] bg-[#10141a] p-2"
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
                className={`flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-md border px-1 text-[10px] font-semibold transition sm:px-2 sm:text-[11px] ${
                  selected
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-transparent text-white/55 hover:border-white/10 hover:bg-white/[0.04] hover:text-white/85'
                }`}
              >
                <tab.Icon className="hidden h-3.5 w-3.5 shrink-0 sm:block" />
                <span className="truncate">{tab.label}</span>
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
                    <span className="block font-medium text-white/85">
                      Actualizaciones en segundo plano
                    </span>
                    <span
                      id="background-updates-help"
                      className="mt-1 block leading-snug text-white/45"
                    >
                      Sigue recibiendo posiciones reales y construyendo la ruta del avión
                      seleccionado mientras esta pestaña permanece abierta pero oculta o minimizada.
                      Desactívalo en equipos poco potentes para pausar la telemetría al ocultar la
                      página.
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
                  onChange={(event) =>
                    onUiScaleChange(normalizeInterfaceScale(Number(event.target.value)))
                  }
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
                Las posiciones se dibujan únicamente cuando las informa la fuente seleccionada. Si
                las actualizaciones en segundo plano están activadas en General, se mantiene la
                misma frecuencia mientras la pestaña abierta está oculta.
              </p>
            </div>
          )}

          {activeTab === 'performance' && (
            <div className="space-y-4">
              <section className="space-y-3">
                <div className={SECTION_TITLE}>Visor 3D</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={FIELD_LABEL} htmlFor="mesh-quality">
                      Calidad de la malla
                    </label>
                    <select
                      id="mesh-quality"
                      value={performance.mesh}
                      onChange={(event) =>
                        onPerformanceChange({
                          ...performance,
                          mesh: event.target.value as PerformanceSettings['mesh'],
                        })
                      }
                      className={SELECT_CLASS}
                    >
                      {QUALITY_TIERS.map((tier) => (
                        <option key={tier} value={tier}>
                          {QUALITY_LABELS[tier]}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[10px] leading-snug text-white/30">
                      Detalle del avión y del relieve del terreno.
                    </p>
                  </div>
                  <div>
                    <label className={FIELD_LABEL} htmlFor="texture-quality">
                      Calidad de las texturas
                    </label>
                    <select
                      id="texture-quality"
                      value={performance.textures}
                      onChange={(event) =>
                        onPerformanceChange({
                          ...performance,
                          textures: event.target.value as PerformanceSettings['textures'],
                        })
                      }
                      className={SELECT_CLASS}
                    >
                      {QUALITY_TIERS.map((tier) => (
                        <option key={tier} value={tier}>
                          {QUALITY_LABELS[tier]}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[10px] leading-snug text-white/30">
                      Resolución de la librea del avión y de las imágenes del terreno.
                    </p>
                  </div>
                  <div>
                    <label className={FIELD_LABEL} htmlFor="render-resolution">
                      Resolución de renderizado
                    </label>
                    <select
                      id="render-resolution"
                      value={performance.resolution}
                      onChange={(event) =>
                        onPerformanceChange({
                          ...performance,
                          resolution: event.target.value as PerformanceSettings['resolution'],
                        })
                      }
                      className={SELECT_CLASS}
                    >
                      {RENDER_RESOLUTIONS.map((mode) => (
                        <option key={mode} value={mode}>
                          {RESOLUTION_LABELS[mode]}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[10px] leading-snug text-white/30">
                      Píxeles del visor. La automática baja sola si el equipo no mantiene 30 fps.
                    </p>
                  </div>
                  <div>
                    <label className={FIELD_LABEL} htmlFor="map-quality">
                      Calidad del mapa
                    </label>
                    <select
                      id="map-quality"
                      value={performance.map}
                      onChange={(event) =>
                        onPerformanceChange({
                          ...performance,
                          map: event.target.value as PerformanceSettings['map'],
                        })
                      }
                      className={SELECT_CLASS}
                    >
                      {MAP_QUALITIES.map((mode) => (
                        <option key={mode} value={mode}>
                          {MAP_QUALITY_LABELS[mode]}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[10px] leading-snug text-white/30">
                      Nitidez con la que MapLibre dibuja el mapa 2D.
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-3 border-t border-white/[0.06] pt-3.5">
                <div className={SECTION_TITLE}>Fotogrametría 3D · gratis</div>
                <label className={TOGGLE_CLASS} htmlFor="photogrammetry-enabled">
                  <span>
                    <span className="block font-medium text-white/85">
                      Google 3D Tiles vía Cesium ion
                    </span>
                    <span className="mt-1 block leading-snug text-white/45">
                      Terreno, edificios y árboles en 3D reales. La cuenta gratuita de Cesium ion
                      incluye este tileset: no pide tarjeta ni prepago. Sin token válido el visor
                      mantiene el satélite con relieve.
                    </span>
                  </span>
                  <input
                    id="photogrammetry-enabled"
                    type="checkbox"
                    checked={photogrammetry}
                    onChange={(event) => onPhotogrammetryChange(event.target.checked)}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-[#ffbe00]"
                  />
                </label>
                <div>
                  <label className={FIELD_LABEL} htmlFor="cesium-ion-token">
                    Token de acceso de Cesium ion
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="cesium-ion-token"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={tilesKey}
                      placeholder="eyJhbGciOi…"
                      onChange={(event) => {
                        setTilesKey(event.target.value)
                        setKeySaved(false)
                      }}
                      className={SELECT_CLASS}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setCesiumIonToken(tilesKey)
                        setTilesKey(cesiumIonToken())
                        setKeySaved(true)
                      }}
                      className="shrink-0 rounded border border-accent/40 bg-accent/10 px-3 text-[11px] font-semibold text-accent transition hover:bg-accent/20"
                    >
                      Guardar
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-white/30">
                    {keySaved
                      ? 'Token guardado en este navegador. Abre la Vista 3D para aplicarlo.'
                      : maskedIonToken()
                        ? `Guardado en este navegador: ${maskedIonToken()}.`
                        : 'Se guarda solo en este navegador (localStorage); no viaja al repositorio.'}
                  </p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[10px] leading-snug text-white/30">
                    <li>
                      Crea una cuenta gratis en{' '}
                      <a
                        href="https://ion.cesium.com/signup"
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent/80 underline decoration-dotted"
                      >
                        ion.cesium.com
                      </a>{' '}
                      (sin tarjeta).
                    </li>
                    <li>
                      En el{' '}
                      <a
                        href={CESIUM_ION_ASSET_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent/80 underline decoration-dotted"
                      >
                        Asset Depot
                      </a>{' '}
                      añade «Google Photorealistic 3D Tiles» a <em>My Assets</em>.
                    </li>
                    <li>
                      En{' '}
                      <a
                        href={CESIUM_ION_CONSOLE_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent/80 underline decoration-dotted"
                      >
                        Access Tokens
                      </a>{' '}
                      crea un token con permiso <code className="text-white/50">assets:read</code> y
                      pégalo aquí.
                    </li>
                  </ol>
                  <p className="mt-1 text-[10px] leading-snug text-white/30">
                    Plan Community: gratuito y sin prepago, 1.000 peticiones del tileset raíz al
                    mes. Este visor solo pide la raíz al abrir y al alejarse 40 km, así que cabe de
                    sobra. Uso personal/no comercial.
                  </p>
                </div>
              </section>

              <section className="border-t border-white/[0.06] pt-3.5">
                <div className={SECTION_TITLE}>Perfiles rápidos</div>
                <p className="mt-1 text-[10px] leading-snug text-white/35">
                  Configuran los cuatro ajustes de golpe. Después puedes afinar cada uno.
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {PERFORMANCE_PROFILES.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      data-profile={profile.id}
                      onClick={() => onPerformanceChange(profile.settings)}
                      className="rounded border border-white/[0.08] bg-ink-700 p-2.5 text-left transition hover:border-accent/40 hover:bg-white/[0.04]"
                    >
                      <span className="block text-[11px] font-semibold text-white/85">
                        {profile.label}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-white/40">
                        {profile.description}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <p className="border-t border-white/[0.06] px-0.5 pt-3.5 leading-relaxed text-white/40">
                Ningún ajuste desactiva funciones: solo cambian el detalle, los píxeles y la memoria
                que usa cada vista. El visor 3D también permite cambiarlo al vuelo desde su botón
                «Calidad».
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
