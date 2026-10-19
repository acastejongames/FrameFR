interface StatusLegendProps {
  visible: boolean
  /** Number of aircraft currently rendered. */
  count: number
  /** Label of the feed that answered last. */
  sourceLabel: string
  /** `true` when the feed is answering. */
  live: boolean
  /** Latency of the last poll, in ms. */
  latencyMs?: number
  /** Seconds since the last successful poll. */
  updatedAgo?: number
}

/**
 * Bottom left widget: legend of the aircraft states and the state of the feed.
 */
export function StatusLegend({
  visible,
  count,
  sourceLabel,
  live,
  latencyMs,
  updatedAgo,
}: StatusLegendProps) {
  if (!visible) return null

  return (
    <div
      className="panel pointer-events-auto flex items-center gap-3 rounded-md px-2.5 py-1.5 text-[11px]"
      data-clean-hide
    >
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm border border-black bg-accent" />
        <span className="font-medium text-white/75">En vuelo</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm border border-black bg-selected" />
        <span className="font-medium text-white/75">Seleccionado</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm border border-black bg-ground" />
        <span className="font-medium text-white/75">En tierra (GND)</span>
      </div>
      <span className="text-white/25">|</span>
      <span className="tech text-[10px] text-white/40">
        Siluetas por tipo ICAO (A380, fuselaje ancho, jet, turboprop, helicóptero, GA)
      </span>
      <span className="text-white/25">|</span>
      <span className="tech text-[10px] text-white/40">
        {count} en pantalla · {sourceLabel}
        {live ? ' · en directo' : ' · sin conexión'}
        {latencyMs ? ` · ${latencyMs} ms` : ''}
        {updatedAgo !== undefined ? ` · hace ${updatedAgo} s` : ''}
      </span>
    </div>
  )
}
