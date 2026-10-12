import { REPO_URL } from '@/config'
import { formatNumber, formatRelativeTime } from '@/lib/format'
import type { ProviderMode, ProviderStatus } from '@/data/types'
import type { FleetStats } from '@/engine/fleetController'
import { ALTITUDE_BANDS } from '@/map/palette'

interface StatusBarProps {
  status: ProviderStatus
  providerLabel: string
  mode: ProviderMode
  stats: FleetStats
  updatedAt: number
}

export function StatusBar({ status, providerLabel, mode, stats, updatedAt }: StatusBarProps) {
  return (
    <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-4 p-4">
      {/* Legend + basemap credit */}
      <div className="panel pointer-events-auto flex items-center gap-3.5 rounded-xl px-3 py-2">
        <span className="label-caps">Altitud</span>
        <div className="flex items-center gap-2.5">
          {ALTITUDE_BANDS.map((band) => (
            <span key={band.key} title={band.label}>
              <span
                className="block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: band.color }}
              />
            </span>
          ))}
        </div>
        <span className="h-3 w-px bg-white/[0.07]" />
        <span className="text-[10px] text-white/30">
          Mapa{' '}
          <a
            className="underline decoration-white/15 underline-offset-2 hover:text-white/60"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap
          </a>{' '}
          ·{' '}
          <a
            className="underline decoration-white/15 underline-offset-2 hover:text-white/60"
            href="https://carto.com/attributions"
            target="_blank"
            rel="noreferrer"
          >
            CARTO
          </a>
        </span>
      </div>

      {/* Feed state */}
      <div className="panel pointer-events-auto flex items-center gap-3 rounded-xl px-3 py-2 text-[10.5px] text-white/40">
        <span className="tabular-nums">{formatNumber(stats.total)} aeronaves</span>
        <span className="h-3 w-px bg-white/[0.07]" />
        <span>
          Datos: <span className="text-white/60">{providerLabel}</span>
          {mode === 'simulated' ? ' (simulados)' : ''}
        </span>
        <span className="h-3 w-px bg-white/[0.07]" />
        <span className="tabular-nums">
          {status.state === 'error' ? (
            <span className="text-rose-300/90">{status.message ?? 'Sin conexión'}</span>
          ) : (
            <>
              Actualizado {formatRelativeTime(Date.now() - updatedAt)}
              {status.latencyMs ? ` · ${status.latencyMs} ms` : ''}
            </>
          )}
        </span>
        {status.state === 'live' && status.message && (
          <span className="hidden text-amber-200/70 lg:inline">· {status.message}</span>
        )}
        <span className="h-3 w-px bg-white/[0.07]" />
        <a
          className="underline decoration-white/15 underline-offset-2 hover:text-white/70"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>
    </footer>
  )
}
