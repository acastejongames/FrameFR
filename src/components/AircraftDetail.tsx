import { Crosshair, Radar, X } from 'lucide-react'
import { distanceNm } from '@/data/geo'
import {
  formatAltitude,
  formatCoord,
  formatDistance,
  formatDuration,
  formatHeading,
  formatRelativeTime,
  formatSpeed,
  formatSquawk,
  formatVerticalRate,
} from '@/lib/format'
import type { RenderAircraft } from '@/engine/fleetController'
import { bandColor, CATEGORY_LABELS } from '@/map/palette'
import { AircraftGlyph } from './AircraftGlyph'

interface AircraftDetailProps {
  aircraft: RenderAircraft
  onClose: () => void
  onCenter: (id: string) => void
  follow: boolean
  onFollowChange: (follow: boolean) => void
  updatedAt: number
}

export function AircraftDetail({
  aircraft,
  onClose,
  onCenter,
  follow,
  onFollowChange,
  updatedAt,
}: AircraftDetailProps) {
  const progress = aircraft.progress ?? 0
  const hasRoute = Boolean(aircraft.origin && aircraft.destination)
  const routeNm = hasRoute ? distanceNm(aircraft.origin!, aircraft.destination!) : 0
  const remainingNm = hasRoute ? Math.max(0, routeNm * (1 - progress)) : 0
  const etaMinutes = remainingNm > 0 && aircraft.groundSpeed > 60 ? (remainingNm / aircraft.groundSpeed) * 60 : null

  return (
    <aside className="panel absolute right-4 top-[76px] z-20 w-[340px] animate-fade-in overflow-hidden rounded-2xl">
      {/* Header */}
      <div className="flex items-start gap-2.5 border-b border-white/[0.06] px-4 py-3">
        <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06]">
          <AircraftGlyph
            heading={aircraft.heading}
            color={bandColor(aircraft.band)}
            size={17}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold leading-tight tracking-tight">
            {aircraft.callsign}
          </div>
          <div className="truncate text-[11px] text-white/45">
            {aircraft.operator ?? 'Operador desconocido'}
            {aircraft.type ? ` · ${aircraft.type}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="icon-btn h-7 w-7 rounded-lg"
          aria-label="Cerrar detalle"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Route */}
      <div className="border-b border-white/[0.06] px-4 py-3.5">
        {hasRoute ? (
          <>
            <div className="flex items-end justify-between">
              <div className="min-w-0">
                <div className="text-[20px] font-semibold leading-none tracking-tight">
                  {aircraft.origin!.iata}
                </div>
                <div className="mt-1 truncate text-[10.5px] text-white/40">{aircraft.origin!.city}</div>
              </div>
              <div className="mx-3 mb-1 flex-1">
                <div className="relative h-px w-full bg-white/10">
                  <span
                    className="absolute -top-[6px] transition-[left] duration-500"
                    style={{ left: `calc(${(progress * 100).toFixed(1)}% - 6px)` }}
                  >
                    <AircraftGlyph heading={90} color="#5eead4" size={13} />
                  </span>
                </div>
              </div>
              <div className="min-w-0 text-right">
                <div className="text-[20px] font-semibold leading-none tracking-tight">
                  {aircraft.destination!.iata}
                </div>
                <div className="mt-1 truncate text-[10.5px] text-white/40">
                  {aircraft.destination!.city}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] tabular-nums text-white/45">
              <span>{Math.round(progress * 100)}% del trayecto</span>
              <span>
                {formatDistance(remainingNm)} restantes
                {etaMinutes !== null ? ` · ETA ${formatDuration(etaMinutes)}` : ''}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <span className="label-caps">Ruta</span>
            <span className="text-[11.5px] text-white/40">
              No disponible en este proveedor
            </span>
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 px-4 py-3.5">
        <Metric label="Altitud" value={aircraft.onGround ? 'En tierra' : formatAltitude(aircraft.altitude)} />
        <Metric label="Velocidad" value={formatSpeed(aircraft.groundSpeed)} />
        <Metric label="Rumbo" value={formatHeading(aircraft.heading)} />
        <Metric
          label="Régimen"
          value={Math.abs(aircraft.verticalRate) < 100 ? 'Nivelado' : formatVerticalRate(aircraft.verticalRate)}
        />
        <Metric label="Squawk" value={formatSquawk(aircraft.squawk)} />
        <Metric label="ICAO24" value={aircraft.id.toUpperCase()} />
        <Metric label="Categoría" value={CATEGORY_LABELS[aircraft.category] ?? aircraft.category} />
        <Metric label="Distancia" value={formatDistance(aircraft.distanceNm)} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-white/[0.06] px-4 py-3">
        <button
          type="button"
          onClick={() => onCenter(aircraft.id)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] py-2 text-[12px] text-white/75 transition hover:bg-white/[0.07] hover:text-white"
        >
          <Crosshair className="h-3.5 w-3.5" />
          Centrar
        </button>
        <button
          type="button"
          onClick={() => onFollowChange(!follow)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-[12px] transition ${
            follow
              ? 'border-accent/35 bg-accent/12 text-accent'
              : 'border-white/[0.08] bg-white/[0.03] text-white/75 hover:bg-white/[0.07] hover:text-white'
          }`}
        >
          <Radar className="h-3.5 w-3.5" />
          {follow ? 'Siguiendo' : 'Seguir'}
        </button>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5 text-[10.5px] tabular-nums text-white/30">
        <span>{formatCoord(aircraft.lat, aircraft.lon)}</span>
        <span>{formatRelativeTime(Date.now() - updatedAt)}</span>
      </div>
      {aircraft.registration && (
        <div className="border-t border-white/[0.06] px-4 py-2 text-[10.5px] text-white/30">
          Matrícula <span className="text-white/55">{aircraft.registration}</span>
        </div>
      )}
    </aside>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="label-caps">{label}</div>
      <div className="mt-1 truncate text-[13px] tabular-nums text-white/85">{value}</div>
    </div>
  )
}
