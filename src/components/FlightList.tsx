import { memo } from 'react'
import { formatAltitude, formatDistance, formatSpeed, formatVerticalRate } from '@/lib/format'
import type { AircraftCategory } from '@/data/types'
import type { RenderAircraft } from '@/engine/fleetController'
import { bandColor } from '@/map/palette'
import { AircraftGlyph } from './AircraftGlyph'

interface FlightListProps {
  aircraft: RenderAircraft[]
  total: number
  filtered: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  category: AircraftCategory | null
  onCategoryChange: (category: AircraftCategory | null) => void
}

const CHIPS: Array<{ id: AircraftCategory | null; label: string }> = [
  { id: null, label: 'Todos' },
  { id: 'commercial', label: 'Comercial' },
  { id: 'cargo', label: 'Carga' },
  { id: 'general', label: 'General' },
  { id: 'military', label: 'Militar' },
]

export function FlightList({
  aircraft,
  total,
  filtered,
  selectedId,
  onSelect,
  category,
  onCategoryChange,
}: FlightListProps) {
  return (
    <aside className="panel absolute bottom-[62px] left-4 top-[76px] z-20 flex w-[330px] animate-fade-in flex-col overflow-hidden rounded-2xl">
      <div className="shrink-0 border-b border-white/[0.06] px-4 pb-2.5 pt-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[12px] font-medium tracking-tight text-white/75">Tráfico cercano</h2>
          <span className="text-[10.5px] tabular-nums text-white/30">
            {aircraft.length} de {filtered}
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1">
          {CHIPS.map((chip) => {
            const active = chip.id === category
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => onCategoryChange(chip.id)}
                className={`rounded-full px-2.5 py-1 text-[10.5px] transition ${
                  active
                    ? 'bg-accent/12 text-accent ring-1 ring-accent/30'
                    : 'text-white/45 hover:bg-white/[0.05] hover:text-white/70'
                }`}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto overscroll-contain">
        {aircraft.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-white/30">
            {total === 0
              ? 'No hay tráfico en esta zona.'
              : 'Ningún vuelo coincide con el filtro.'}
          </p>
        ) : (
          aircraft.map((ac) => (
            <Row
              key={ac.id}
              aircraft={ac}
              selected={ac.id === selectedId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </aside>
  )
}

interface RowProps {
  aircraft: RenderAircraft
  selected: boolean
  onSelect: (id: string) => void
}

const Row = memo(function Row({ aircraft, selected, onSelect }: RowProps) {
  const route =
    aircraft.origin && aircraft.destination
      ? `${aircraft.origin.iata} → ${aircraft.destination.iata}`
      : aircraft.type ?? '—'

  return (
    <button
      type="button"
      onClick={() => onSelect(aircraft.id)}
      className={`flex w-full items-center gap-2.5 border-l-2 px-3 py-2 text-left transition-colors ${
        selected ? 'border-l-accent bg-white/[0.07]' : 'border-l-transparent hover:bg-white/[0.04]'
      }`}
    >
      <AircraftGlyph
        heading={aircraft.heading}
        color={bandColor(aircraft.band)}
        size={15}
        className="opacity-90"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[12.5px] font-medium tracking-wide">{aircraft.callsign}</span>
          <span className="truncate text-[10px] tabular-nums text-white/35">{route}</span>
        </div>
        <div className="truncate text-[10.5px] text-white/40">
          {aircraft.operator ?? 'Operador desconocido'}
          {aircraft.type ? ` · ${aircraft.type}` : ''}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[11.5px] tabular-nums text-white/80">
          {aircraft.onGround ? 'Tierra' : formatAltitude(aircraft.altitude)}
        </div>
        <div className="text-[10px] tabular-nums text-white/35">
          {formatSpeed(aircraft.groundSpeed)} · {formatDistance(aircraft.distanceNm)}
        </div>
        <div className="text-[10px] tabular-nums text-white/25">
          {Math.abs(aircraft.verticalRate) > 100 ? formatVerticalRate(aircraft.verticalRate) : ''}
        </div>
      </div>
    </button>
  )
})
