import { useCallback, useState } from 'react'
import {
  Compass,
  EyeOff,
  LocateFixed,
  Tag,
  Layers,
  ChevronUp,
  Moon,
  Sun,
  Mountain,
  Check,
} from 'lucide-react'
import type { Map } from 'maplibre-gl'
import type { BasemapId } from '@/map/style'
import { ToolPopover } from './ToolPopover'
import { WeatherPanel } from './WeatherPanel'

interface MapControlsProps {
  map: Map | null
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
const STYLES = [
  { id: 'dark', label: 'Oscuro', icon: Moon },
  { id: 'positron', label: 'Claro', icon: Sun },
  { id: 'liberty', label: 'Terreno', icon: Mountain },
] as const

export function MapControls({
  map,
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
  const [panel, setPanel] = useState<'map' | 'weather' | null>(null)
  const close = useCallback(() => setPanel(null), [])
  // Keep weather mounted when the toolbar is hidden: hiding UI must not disable a layer.
  return (
    <nav
      className="map-dock panel"
      aria-label="Herramientas del mapa"
      data-clean-hide
      hidden={!visible}
    >
      <ToolPopover
        id="map-tools"
        title="Estilo del mapa"
        subtitle="Elige la cartografía de tu radar"
        open={panel === 'map'}
        onClose={close}
        trigger={
          <button
            type="button"
            className="dock-button"
            data-active={panel === 'map'}
            onClick={() => setPanel(panel === 'map' ? null : 'map')}
            aria-expanded={panel === 'map'}
            aria-controls="map-tools"
            aria-haspopup="dialog"
          >
            <Layers size={20} />
            <span>Mapa</span>
            <ChevronUp size={13} className="dock-chevron" />
          </button>
        }
      >
        <div className="basemap-options">
          {STYLES.map((style) => (
            <button
              type="button"
              key={style.id}
              className="basemap-option"
              aria-pressed={basemap === style.id}
              onClick={() => onBasemapChange(style.id)}
            >
              <div className={`map-swatch map-swatch-${style.id}`}>
                <style.icon size={24} />
                {basemap === style.id && <Check size={16} className="swatch-check" />}
              </div>
              <span>{style.label}</span>
            </button>
          ))}
        </div>
        <p className="tool-hint">La cartografía cambia; tus vuelos y capas se mantienen.</p>
      </ToolPopover>
      <WeatherPanel
        map={map}
        open={panel === 'weather'}
        onToggle={() => setPanel(panel === 'weather' ? null : 'weather')}
        onClose={close}
      />
      <span className="dock-divider" />
      <button
        type="button"
        className="dock-button"
        aria-pressed={showLabels}
        onClick={() => onShowLabelsChange(!showLabels)}
        title="Mostrar u ocultar etiquetas de vuelo"
      >
        <Tag size={20} />
        <span>Etiquetas</span>
      </button>
      <button
        type="button"
        className="dock-button"
        aria-pressed={is3D}
        onClick={() => on3DChange(!is3D)}
        title="Inclinación del mapa"
      >
        <Compass size={20} />
        <span>3D</span>
      </button>
      <span className="dock-divider" />
      <button
        type="button"
        className="dock-button"
        onClick={onLocate}
        title="Centrar en mi ubicación"
      >
        <LocateFixed size={20} />
        <span>Ubicación</span>
      </button>
      <button
        type="button"
        className="dock-button"
        aria-pressed={cleanMode}
        onClick={onCleanModeToggle}
        title="Ocultar interfaz (U)"
      >
        <EyeOff size={20} />
        <span>Ocultar</span>
      </button>
    </nav>
  )
}
