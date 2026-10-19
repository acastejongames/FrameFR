import { Compass, EyeOff, LocateFixed, Tag } from 'lucide-react'
import type { BasemapId } from '@/map/style'

interface MapControlsProps {
  basemap: BasemapId
  onBasemapChange: (id: BasemapId) => void
  showLabels: boolean
  onShowLabelsChange: (value: boolean) => void
  is3D: boolean
  on3DChange: (value: boolean) => void
  cleanMode: boolean
  onCleanModeToggle: () => void
  onLocate: () => void
  visible: boolean
}

/** Styles offered in the bottom right cluster (the full list lives in settings). */
const QUICK_STYLES: Array<{ id: BasemapId; label: string }> = [
  { id: 'dark', label: 'Oscuro' },
  { id: 'positron', label: 'Claro' },
  { id: 'liberty', label: 'Terreno' },
]

/** Bottom right cluster: cartographic style, labels, 3D, clean mode, GPS. */
export function MapControls({
  basemap,
  onBasemapChange,
  showLabels,
  onShowLabelsChange,
  is3D,
  on3DChange,
  cleanMode,
  onCleanModeToggle,
  onLocate,
  visible,
}: MapControlsProps) {
  if (!visible) return null

  return (
    <div className="pointer-events-auto flex items-center gap-1.5" data-clean-hide>
      <div className="panel flex items-center gap-1 rounded-md p-1 text-xs">
        {QUICK_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            onClick={() => onBasemapChange(style.id)}
            className={`rounded px-2.5 py-1 text-[11px] transition ${
              basemap === style.id
                ? 'bg-accent font-bold text-[#111317]'
                : 'text-white/65 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            {style.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onShowLabelsChange(!showLabels)}
        className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[11px] transition ${
          showLabels
            ? 'border-accent/40 bg-accent/12 text-accent'
            : 'border-white/[0.09] bg-ink-700 text-white/65 hover:bg-ink-600'
        }`}
        title="Mostrar u ocultar las etiquetas de vuelo"
      >
        <Tag className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Etiquetas</span>
      </button>

      <button
        type="button"
        onClick={() => on3DChange(!is3D)}
        className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[11px] transition ${
          is3D
            ? 'border-accent/40 bg-accent/12 text-accent'
            : 'border-white/[0.09] bg-ink-700 text-white/65 hover:bg-ink-600'
        }`}
        title="Inclinación 3D"
      >
        <Compass className="h-3.5 w-3.5" />
        <span>3D</span>
      </button>

      <button
        type="button"
        onClick={onCleanModeToggle}
        className={`tech flex items-center gap-1 rounded border px-2 py-1.5 text-[11px] transition ${
          cleanMode
            ? 'border-accent/40 bg-accent/12 text-accent'
            : 'border-white/[0.09] bg-ink-700 text-white/65 hover:bg-ink-600'
        }`}
        title="Ocultar o mostrar la interfaz (tecla U)"
        aria-pressed={cleanMode}
      >
        <EyeOff className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">[U]</span>
      </button>

      <button
        type="button"
        onClick={onLocate}
        className="rounded border border-white/[0.09] bg-ink-700 p-1.5 text-white/65 transition hover:bg-ink-600 hover:text-white"
        title="Mi ubicación GPS"
        aria-label="Mi ubicación GPS"
      >
        <LocateFixed className="h-4 w-4" />
      </button>
    </div>
  )
}
