import { Globe, Minus, Navigation, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Map } from 'maplibre-gl'

interface MapControlsProps {
  map: Map | null
  onWorldView: () => void
}

/** Minimal zoom / orientation cluster, bottom-right. */
export function MapControls({ map, onWorldView }: MapControlsProps) {
  const [zoom, setZoom] = useState(0)
  const [bearing, setBearing] = useState(0)

  useEffect(() => {
    if (!map) return
    const sync = () => {
      setZoom(map.getZoom())
      setBearing(map.getBearing())
    }
    sync()
    map.on('moveend', sync)
    map.on('zoomend', sync)
    map.on('rotateend', sync)
    return () => {
      map.off('moveend', sync)
      map.off('zoomend', sync)
      map.off('rotateend', sync)
    }
  }, [map])

  const stepZoom = (delta: number) => map?.easeTo({ zoom: map.getZoom() + delta, duration: 220 })
  const resetNorth = () => map?.easeTo({ bearing: 0, duration: 300 })

  return (
    <div className="pointer-events-auto absolute bottom-[62px] right-4 z-20 flex flex-col items-end gap-1.5">
      <div className="panel flex flex-col overflow-hidden rounded-xl">
        <button
          type="button"
          className="icon-btn"
          onClick={() => stepZoom(1)}
          aria-label="Acercar"
          title="Acercar"
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="mx-2 h-px bg-white/[0.07]" />
        <button
          type="button"
          className="icon-btn"
          onClick={() => stepZoom(-1)}
          aria-label="Alejar"
          title="Alejar"
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>

      <div className="panel flex flex-col overflow-hidden rounded-xl">
        <button
          type="button"
          className="icon-btn"
          onClick={resetNorth}
          data-active={bearing !== 0}
          aria-label="Orientar al norte"
          title="Orientar al norte"
        >
          <Navigation
            className="h-3.5 w-3.5 transition-transform duration-200"
            style={{ transform: `rotate(${-bearing}deg)` }}
          />
        </button>
        <div className="mx-2 h-px bg-white/[0.07]" />
        <button
          type="button"
          className="icon-btn"
          onClick={onWorldView}
          aria-label="Vista global"
          title="Vista global"
        >
          <Globe className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="panel rounded-lg px-2 py-1 text-[10px] tabular-nums text-white/35">
        z{zoom.toFixed(1)}
      </div>
    </div>
  )
}
