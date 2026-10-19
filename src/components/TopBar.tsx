import { Globe, RefreshCw, Settings, Table2, X } from 'lucide-react'
import { forwardRef, useEffect, useRef, useState } from 'react'
import type { Aircraft } from '@/data/types'
import { formatNumber } from '@/lib/format'
import { SearchResults } from './SearchResults'

export interface TopBarProps {
  /** Current text of the search box. */
  query: string
  onQueryChange: (value: string) => void
  /** Results returned by the planet-wide search. */
  results: Aircraft[]
  /** `true` while the search is in flight. */
  searching: boolean
  onSelectResult: (aircraft: Aircraft) => void
  /** Number of aircraft currently on the map. */
  aircraftCount: number
  /** Label of the feed that answered last. */
  sourceLabel: string
  /** `false` when the feed is not answering. */
  live: boolean
  onRefresh: () => void
  refreshing: boolean
  /** Opens the traffic table. */
  tableOpen: boolean
  onToggleTable: () => void
  onOpenSettings: () => void
  /** Children rendered between the search box and the right hand widgets. */
  children?: React.ReactNode
}

export const TopBar = forwardRef<HTMLInputElement, TopBarProps>(function TopBar(
  {
    query,
    onQueryChange,
    results,
    searching,
    onSelectResult,
    aircraftCount,
    sourceLabel,
    live,
    onRefresh,
    refreshing,
    tableOpen,
    onToggleTable,
    onOpenSettings,
    children,
  },
  searchRef,
) {
  const [clock, setClock] = useState(() => new Date().toISOString().slice(11, 19))
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(new Date().toISOString().slice(11, 19))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Close the dropdown when clicking outside of the search box.
  useEffect(() => {
    if (!dropdownOpen) return
    const onPointerDown = (event: MouseEvent): void => {
      if (!wrapperRef.current?.contains(event.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [dropdownOpen])

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-12 items-center justify-between gap-3 border-b border-white/[0.06] bg-[#15181d]/95 px-3 backdrop-blur">
      {/* Brand + search + shortcuts */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex shrink-0 items-center gap-2 border-r border-white/[0.07] pr-3">
          <svg className="h-7 w-7 shrink-0" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <rect x="2" y="2" width="32" height="32" rx="6" fill="#1b222c" stroke="#ffbe00" strokeWidth="1.5" />
            <circle cx="18" cy="18" r="10" stroke="#4b5563" strokeWidth="1.2" strokeDasharray="2 2" />
            <path
              d="M18 8L21 16L29 18L21 20L18 28L15 20L7 18L15 16L18 8Z"
              fill="#ffbe00"
              fillOpacity="0.2"
              stroke="#ffbe00"
              strokeWidth="1.3"
            />
            <circle cx="18" cy="18" r="2.2" fill="#ffbe00" />
          </svg>
          <div className="leading-none">
            <div className="cond text-[17px] font-bold tracking-tight text-white">
              AERO<span className="text-accent">SCOPE</span>
            </div>
            <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">
              ADS-B Telemetry
            </div>
          </div>
        </div>

        {/* Global search */}
        <div ref={wrapperRef} className="relative min-w-0 max-w-sm flex-1">
          <div
            className={`flex h-8 w-full items-center rounded-md border bg-[#0f1216] px-2.5 transition-colors ${
              dropdownOpen ? 'border-accent' : 'border-white/[0.09] focus-within:border-accent'
            }`}
          >
            <Globe className="mr-2 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                onQueryChange(event.target.value)
                setDropdownOpen(true)
              }}
              onFocus={() => setDropdownOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setDropdownOpen(false)
                  ;(event.target as HTMLInputElement).blur()
                }
              }}
              placeholder="Búsqueda global: LH419, Airbus A340-600, Lufthansa…"
              spellCheck={false}
              autoComplete="off"
              className="tech w-full bg-transparent text-xs text-white outline-none placeholder:text-white/25"
            />
            {searching && (
              <span className="mr-1 h-3.5 w-3.5 shrink-0 animate-spin-slow rounded-full border-2 border-accent border-t-transparent" />
            )}
            {query && !searching && (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                className="ml-1 shrink-0 text-white/35 transition hover:text-white"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {dropdownOpen && query.trim().length >= 2 && (
            <SearchResults
              results={results}
              searching={searching}
              query={query}
              onSelect={(aircraft) => {
                setDropdownOpen(false)
                onSelectResult(aircraft)
              }}
            />
          )}
        </div>

        {children}
      </div>

      {/* Right hand widgets */}
      <div className="flex shrink-0 items-center gap-2">
        {/* UTC clock */}
        <div className="tech hidden h-8 items-center gap-1.5 rounded-md border border-white/[0.09] bg-[#0f1216] px-2.5 text-xs sm:flex">
          <span className="text-[10px] text-white/35">UTC</span>
          <span className="font-semibold text-accent">{clock}</span>
        </div>

        {/* Aircraft counter */}
        <div className="flex h-8 items-center gap-2 rounded-md border border-white/[0.09] bg-[#0f1216] px-2.5">
          <span
            className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-400' : 'bg-rose-400'}`}
            aria-hidden="true"
          />
          <div className="leading-none">
            <div className="flex items-center gap-1">
              <span className="tech text-xs font-bold text-white">{formatNumber(aircraftCount)}</span>
              <span className="text-[10px] uppercase text-white/35">Aviones</span>
            </div>
            <div className="tech mt-0.5 max-w-[115px] truncate text-[9px] text-white/35">
              {sourceLabel}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="icon-btn h-8 w-8 rounded-md border border-white/[0.09] bg-ink-700 text-white/70 transition hover:bg-ink-600 hover:text-white"
          aria-label="Refrescar radar"
          title="Refrescar radar"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin-slow' : ''}`} />
        </button>

        <button
          type="button"
          onClick={onToggleTable}
          data-active={tableOpen}
          className="icon-btn h-8 w-8 rounded-md border border-white/[0.09] bg-ink-700 text-white/70 transition hover:bg-ink-600 hover:text-white"
          aria-label="Tabla de tráfico"
          title="Tabla de tráfico en el sector"
        >
          <Table2 className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="icon-btn h-8 w-8 rounded-md border border-white/[0.09] bg-ink-700 text-white/70 transition hover:bg-ink-600 hover:text-white"
          aria-label="Ajustes"
          title="Ajustes generales y visibilidad de la interfaz"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
})
