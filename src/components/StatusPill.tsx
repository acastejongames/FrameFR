import { formatRelativeTime } from '@/lib/format'
import type { ProviderMode, ProviderStatus } from '@/data/types'

interface StatusPillProps {
  status: ProviderStatus
  mode: ProviderMode
  providerLabel: string
}

const STATE_STYLES: Record<ProviderStatus['state'], { dot: string; text: string; label: string }> = {
  idle: { dot: 'bg-white/30', text: 'text-white/45', label: 'En espera' },
  loading: { dot: 'bg-amber-300', text: 'text-amber-200/90', label: 'Conectando' },
  live: { dot: 'bg-emerald-400', text: 'text-emerald-300/90', label: 'En directo' },
  error: { dot: 'bg-rose-400', text: 'text-rose-300/90', label: 'Sin datos' },
}

/** Live / demo indicator shown next to the brand. */
export function StatusPill({ status, mode, providerLabel }: StatusPillProps) {
  const style = STATE_STYLES[status.state]
  const label = status.state === 'live' && mode === 'simulated' ? 'Simulación' : style.label
  const dotColor = status.state === 'live' && mode === 'simulated' ? 'bg-accent' : style.dot
  const textColor = status.state === 'live' && mode === 'simulated' ? 'text-accent/90' : style.text

  return (
    <div className="flex items-center gap-2 pl-3" title={status.message ?? providerLabel}>
      <span className="relative flex h-1.5 w-1.5">
        {status.state === 'live' && (
          <span className={`absolute inset-0 rounded-full ${dotColor} animate-pulse-dot`} />
        )}
        <span className={`relative h-1.5 w-1.5 rounded-full ${dotColor}`} />
      </span>
      <span className={`text-[10.5px] font-medium uppercase tracking-[0.14em] ${textColor}`}>
        {label}
      </span>
      <span className="text-[10.5px] tabular-nums text-white/30">
        {status.lastUpdate ? formatRelativeTime(Date.now() - status.lastUpdate) : '—'}
      </span>
    </div>
  )
}
