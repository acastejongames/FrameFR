import { Radar, Search, Settings2, X } from 'lucide-react'
import { forwardRef } from 'react'
import { formatNumber } from '@/lib/format'
import type { ProviderMode, ProviderStatus } from '@/data/types'
import type { FleetStats } from '@/engine/fleetController'
import { StatusPill } from './StatusPill'

interface TopBarProps {
  status: ProviderStatus
  mode: ProviderMode
  providerLabel: string
  stats: FleetStats
  query: string
  onQueryChange: (value: string) => void
  settingsOpen: boolean
  onToggleSettings: () => void
}

export const TopBar = forwardRef<HTMLInputElement, TopBarProps>(function TopBar(
  { status, mode, providerLabel, stats, query, onQueryChange, settingsOpen, onToggleSettings },
  searchRef,
) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-4 p-4">
      {/* Brand + state */}
      <div className="panel pointer-events-auto flex items-center rounded-2xl px-3.5 py-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-xl bg-accent/10 ring-1 ring-accent/25">
          <Radar className="h-4 w-4 text-accent" strokeWidth={2} />
        </div>
        <div className="ml-2.5 mr-1">
          <div className="text-[13px] font-semibold leading-tight tracking-tight">FrameFR</div>
          <div className="text-[10px] uppercase leading-tight tracking-[0.18em] text-white/30">
            Tráfico aéreo
          </div>
        </div>
        <div className="ml-1 h-8 w-px bg-white/[0.07]" />
        <StatusPill status={status} mode={mode} providerLabel={providerLabel} />
      </div>

      {/* Search */}
      <div className="panel pointer-events-auto flex items-center gap-2 rounded-2xl px-3 py-2">
        <Search className="h-3.5 w-3.5 text-white/35" />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar vuelo, matrícula, aerolínea…"
          spellCheck={false}
          className="w-[380px] bg-transparent text-[13px] text-fg outline-none placeholder:text-white/25"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            className="icon-btn h-6 w-6 rounded-md"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/35">
            /
          </kbd>
        )}
      </div>

      {/* Stats + settings */}
      <div className="panel pointer-events-auto flex items-center gap-1 rounded-2xl px-3.5 py-2.5">
        <div className="mr-2 hidden items-center gap-5 xl:flex">
          <Stat value={formatNumber(stats.total)} label="Vuelos" />
          <Stat value={formatNumber(stats.airborne)} label="En vuelo" />
          <Stat
            value={stats.airborne > 0 ? formatNumber(stats.avgAltitude) : '—'}
            label="Alt. media ft"
          />
        </div>
        <button
          type="button"
          onClick={onToggleSettings}
          data-active={settingsOpen}
          className="icon-btn rounded-lg"
          aria-label="Ajustes"
          aria-expanded={settingsOpen}
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
})

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="leading-none">
      <div className="text-[15px] font-medium tabular-nums tracking-tight">{value}</div>
      <div className="mt-1 text-[9.5px] uppercase tracking-[0.16em] text-white/30">{label}</div>
    </div>
  )
}
