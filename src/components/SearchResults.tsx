import type { Aircraft } from '@/data/types'
import { formatAltitude } from '@/lib/format'

interface SearchResultsProps {
  results: Aircraft[]
  searching: boolean
  query: string
  onSelect: (aircraft: Aircraft) => void
}

/**
 * Dropdown with the planet-wide search results.
 *
 * The header states whether the search is still running, so the user knows the
 * list is not complete yet.
 */
export function SearchResults({ results, searching, query, onSelect }: SearchResultsProps) {
  const header = searching ? (
    <div className="tech flex items-center gap-2 bg-[#14181f] px-3 py-1.5 text-[10px] text-accent">
      <span className="h-2.5 w-2.5 animate-spin-slow rounded-full border-2 border-accent border-t-transparent" />
      <span>Rastreando en todo el planeta para «{query}»…</span>
    </div>
  ) : (
    <div className="tech flex items-center justify-between bg-[#14181f] px-3 py-1 text-[10px] text-white/40">
      <span>🌍 RESULTADOS GLOBALES EN VIVO</span>
      <span>{results.length} encontrados</span>
    </div>
  )

  if (results.length === 0) {
    return (
      <div className="panel-raised absolute left-0 right-0 top-9 z-50 max-h-80 overflow-y-auto rounded-md">
        {header}
        <div className="px-3 py-3 text-xs text-white/40">
          {searching
            ? 'Consultando redes ADS-B globales…'
            : `No se encontraron aeronaves activas en el planeta para «${query}»`}
        </div>
      </div>
    )
  }

  return (
    <div className="panel-raised absolute left-0 right-0 top-9 z-50 max-h-80 divide-y divide-white/[0.05] overflow-y-auto rounded-md">
      {header}
      {results.slice(0, 25).map((aircraft) => {
        const iata =
          aircraft.flightNumber && aircraft.flightNumber !== aircraft.callsign
            ? ` / ${aircraft.flightNumber}`
            : ''
        const route =
          aircraft.route?.origin && aircraft.route?.destination
            ? `${aircraft.route.origin} → ${aircraft.route.destination}`
            : aircraft.registration && aircraft.registration !== 'N/A'
              ? aircraft.registration
              : aircraft.id.toUpperCase()
        const coords = `${aircraft.lat.toFixed(1)}°, ${aircraft.lon.toFixed(1)}°`

        return (
          <button
            key={aircraft.id}
            type="button"
            onClick={() => onSelect(aircraft)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-white/[0.05]"
          >
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5">
                <span className="tech text-xs font-bold text-accent">
                  {aircraft.callsign}
                  {iata}
                </span>
                {aircraft.type && (
                  <span className="tech rounded-sm border border-white/[0.09] bg-[#14171c] px-1 py-0.5 text-[10px] text-white/70">
                    {aircraft.type}
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-white/60">
                {aircraft.airlineName ?? aircraft.operator ?? 'Operador desconocido'}
                {aircraft.fullModel ? ` · ${aircraft.fullModel}` : ''}
              </div>
            </div>
            <div className="tech shrink-0 text-right">
              <div className="text-[11px] font-bold text-white">{route}</div>
              <div className="text-[10px] text-white/40">
                {aircraft.onGround ? 'GND' : formatAltitude(aircraft.altitude)} · {coords}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
