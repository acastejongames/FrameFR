import { X } from 'lucide-react'
import { useMemo } from 'react'
import type { SortKey } from '@/config'
import type { RenderAircraft } from '@/engine/fleetController'

interface FlightTableProps {
  aircraft: RenderAircraft[]
  total: number
  selectedId: string | null
  sortBy: SortKey
  onSortChange: (sort: SortKey) => void
  onSelect: (id: string) => void
  onClose: () => void
}

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'alt', label: 'ALT' },
  { id: 'spd', label: 'VEL' },
  { id: 'callsign', label: 'VUELO' },
]

/**
 * Right hand drawer with the traffic of the visible sector.
 *
 * The list is sorted by altitude, speed or callsign and every row shows the
 * route (or the registration when the feed does not know it).
 */
export function FlightTable({
  aircraft,
  total,
  selectedId,
  sortBy,
  onSortChange,
  onSelect,
  onClose,
}: FlightTableProps) {
  const rows = useMemo(() => {
    const sorted = [...aircraft]
    sorted.sort((a, b) => {
      if (sortBy === 'alt') return b.altitude - a.altitude
      if (sortBy === 'spd') return b.groundSpeed - a.groundSpeed
      return a.callsign.localeCompare(b.callsign)
    })
    return sorted.slice(0, 120)
  }, [aircraft, sortBy])

  return (
    <aside className="panel-raised flight-side-panel flight-side-right">
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#14171c] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <h3 className="cond text-sm font-bold uppercase tracking-wide text-white">
            Tráfico en el sector visible
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="icon-btn h-6 w-6 rounded border border-white/[0.09] bg-ink-700"
          aria-label="Cerrar tabla"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#191d24] px-3 py-1.5 text-[11px] text-white/40">
        <span>Ordenar tabla:</span>
        <div className="flex gap-1">
          {SORTS.map((sort) => (
            <button
              key={sort.id}
              type="button"
              onClick={() => onSortChange(sort.id)}
              className={`tech rounded px-2 py-0.5 text-[10px] transition ${
                sortBy === sort.id
                  ? 'bg-accent font-bold text-[#111317]'
                  : 'border border-white/[0.09] bg-ink-700 text-white/60 hover:bg-ink-600'
              }`}
            >
              {sort.label}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-thin flex-1 divide-y divide-white/[0.05] overflow-y-auto">
        {rows.length === 0 ? (
          <div className="p-4 text-center text-xs text-white/40">
            No hay tráfico visible con los filtros actuales.
          </div>
        ) : (
          rows.map((aircraft) => {
            const selected = aircraft.id === selectedId
            const route =
              aircraft.route?.origin && aircraft.route?.destination
                ? `${aircraft.route.origin} → ${aircraft.route.destination}`
                : (aircraft.airlineName ?? aircraft.fullModel ?? aircraft.registration ?? '')
            return (
              <button
                key={aircraft.id}
                type="button"
                onClick={() => onSelect(aircraft.id)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-white/[0.04] ${
                  selected ? 'border-l-2 border-l-accent bg-white/[0.06]' : ''
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="tech text-xs font-bold text-accent">{aircraft.callsign}</span>
                    {aircraft.flightNumber && aircraft.flightNumber !== aircraft.callsign && (
                      <span className="tech text-[10px] text-white/60">({aircraft.flightNumber})</span>
                    )}
                    {aircraft.type && (
                      <span className="tech rounded-sm border border-white/[0.09] bg-[#15181d] px-1 text-[10px] text-white/60">
                        {aircraft.type}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-white/40">{route}</div>
                </div>
                <div className="tech shrink-0 text-right">
                  <div className="text-xs font-semibold text-white">
                    {aircraft.onGround ? 'GND' : `${aircraft.altitude.toLocaleString('es-ES')} ft`}
                  </div>
                  <div className="text-[10px] text-white/40">
                    {Math.round(aircraft.groundSpeed)} kts · {String(Math.round(aircraft.heading) % 360).padStart(3, '0')}°
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      <div className="tech shrink-0 border-t border-white/[0.07] bg-[#14171c] px-3.5 py-1.5 text-[10px] text-white/30">
        {rows.length} de {total} aeronaves
      </div>
    </aside>
  )
}
