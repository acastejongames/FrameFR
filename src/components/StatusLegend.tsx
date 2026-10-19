interface StatusLegendProps {
  visible: boolean
  count: number
  sourceLabel: string
  live: boolean
  latencyMs?: number
  updatedAgo?: number
}

/** Quiet, single-line telemetry; never competes with the map tools. */
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
    <div className="map-status" data-clean-hide>
      <div className="status-legend">
        <span>
          <i className="bg-accent" />
          En vuelo
        </span>
        <span>
          <i className="bg-selected" />
          Seleccionado
        </span>
        <span>
          <i className="bg-ground" />
          En tierra
        </span>
      </div>
      <div className="status-telemetry tech" title={`${count} en pantalla · ${sourceLabel}`}>
        <i className={live ? 'bg-emerald-400' : 'bg-rose-400'} />
        <span>
          {sourceLabel} · {live ? 'En directo' : 'Sin conexión'}
        </span>
        {latencyMs ? <span>{latencyMs} ms</span> : null}
        {updatedAgo !== undefined && <span>Hace {updatedAgo} s</span>}
      </div>
    </div>
  )
}
