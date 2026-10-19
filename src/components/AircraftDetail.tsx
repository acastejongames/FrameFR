import { Compass, Crosshair, Eraser, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { AircraftPhoto } from '@/data/photos'
import type { RenderAircraft } from '@/engine/fleetController'
import { drawSilhouette, COLOR_STATES } from '@/map/silhouettes'
import { formatAltitude, formatDistance, formatHeading, formatSpeed } from '@/lib/format'

interface AircraftDetailProps {
  aircraft: RenderAircraft
  /** Photo of the aircraft, when one could be resolved. */
  photo: AircraftPhoto | null | undefined
  photoLoading: boolean
  /** Altitudes of the trail currently drawn (for the sparkline). */
  trailAltitudes: number[]
  follow: boolean
  is3D: boolean
  trackingZoom: number
  onClose: () => void
  onFollowChange: (follow: boolean) => void
  on3DChange: (is3D: boolean) => void
  onTrackingZoomChange: (zoom: number) => void
  onClearTrail: () => void
  onCenter: () => void
}

/** Phase of the flight, derived from the vertical rate. */
function phaseOf(aircraft: RenderAircraft): { label: string; className: string } {
  if (aircraft.onGround) {
    return {
      label: 'EN TIERRA (GND)',
      className: 'border-white/[0.12] bg-ink-700 text-white/60',
    }
  }
  if (aircraft.verticalRate > 350) {
    return {
      label: 'EN ASCENSO',
      className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    }
  }
  if (aircraft.verticalRate < -350) {
    return {
      label: 'EN DESCENSO',
      className: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
    }
  }
  return {
    label: 'EN CRUCERO',
    className: 'border-accent/25 bg-ink-700 text-accent',
  }
}

export function AircraftDetail({
  aircraft,
  photo,
  photoLoading,
  trailAltitudes,
  follow,
  is3D,
  trackingZoom,
  onClose,
  onFollowChange,
  on3DChange,
  onTrackingZoomChange,
  onClearTrail,
  onCenter,
}: AircraftDetailProps) {
  const silhouetteRef = useRef<HTMLCanvasElement>(null)
  const phase = phaseOf(aircraft)

  // Draw the silhouette of the aircraft family in the header.
  useEffect(() => {
    const canvas = silhouetteRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.scale(0.56, 0.56)
    ctx.rotate(Math.PI / 4)
    drawSilhouette(ctx, aircraft.silhouette ?? 'narrow2', aircraft.onGround ? COLOR_STATES.gnd : COLOR_STATES.air)
    ctx.restore()
  }, [aircraft.silhouette, aircraft.onGround])

  const origin = aircraft.route?.origin ?? aircraft.origin?.iata ?? '---'
  const destination = aircraft.route?.destination ?? aircraft.destination?.iata ?? '---'
  const originCity = aircraft.route?.originCity ?? aircraft.origin?.city ?? 'N/A'
  const destinationCity = aircraft.route?.destinationCity ?? aircraft.destination?.city ?? 'N/A'

  const altitude = aircraft.onGround ? 0 : aircraft.altitude
  const meters = Math.round(altitude * 0.3048)
  const flightLevel = aircraft.onGround
    ? 'Tierra'
    : `FL${String(Math.round(altitude / 100)).padStart(3, '0')}`
  const kmh = Math.round(aircraft.groundSpeed * 1.852)
  const percent = aircraft.onGround
    ? 3
    : Math.min(100, Math.max(6, Math.round((altitude / 43000) * 100)))

  return (
    <aside className="panel-raised fixed bottom-12 left-2.5 top-14 z-20 flex w-[335px] flex-col overflow-hidden rounded-lg sm:w-[360px]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#14171c] px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="cond text-2xl font-bold leading-none tracking-wide text-accent">
              {aircraft.callsign}
            </span>
            {aircraft.flightNumber && aircraft.flightNumber !== aircraft.callsign && (
              <span className="tech rounded-sm border border-white/[0.12] bg-ink-700 px-1.5 py-0.5 text-[11px] font-bold text-white">
                {aircraft.flightNumber}
              </span>
            )}
            <span className="tech rounded-sm border border-white/[0.12] bg-ink-700 px-1.5 py-0.5 text-[10px] text-white/70">
              {aircraft.type ?? 'ADS-B'}
            </span>
          </div>
          <div className="mt-1 truncate text-[11px] font-medium text-white/70">
            {aircraft.airlineName ?? aircraft.operator ?? 'ADS-B Mode-S Transponder'}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="icon-btn h-7 w-7 shrink-0 rounded border border-white/[0.09] bg-ink-700"
          aria-label="Cerrar ficha"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="scroll-thin flex-1 divide-y divide-white/[0.06] overflow-y-auto text-xs">
        {/* Photo */}
        <div className="relative flex h-44 w-full items-center justify-center overflow-hidden bg-[#0f1216]">
          {photoLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-[#12161c] text-white/40">
              <span className="h-5 w-5 animate-pulse rounded-full border-2 border-accent border-t-transparent" />
              <span className="tech text-[10px]">Buscando foto de aeronave…</span>
            </div>
          )}
          {photo ? (
            <a
              href={photo.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group block h-full w-full"
            >
              <img
                src={photo.src}
                alt="Fotografía de la aeronave"
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2.5 py-1.5 text-[10px]">
                <span className="truncate font-medium text-white/80">{photo.credit}</span>
                <span className="tech ml-2 shrink-0 uppercase text-accent">
                  {photo.source} ↗
                </span>
              </div>
            </a>
          ) : (
            !photoLoading && (
              <div className="flex flex-col items-center justify-center gap-1 text-white/30">
                <span className="text-[11px]">Sin fotografía disponible</span>
              </div>
            )
          )}
        </div>

        {/* Model + silhouette */}
        <div className="flex items-center justify-between bg-[#181c22] px-3.5 py-2.5">
          <div className="min-w-0 pr-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
              Modelo de aeronave
            </div>
            <div className="mt-0.5 truncate text-xs font-bold text-white">
              {aircraft.fullModel ?? `${aircraft.type ?? 'ADS-B'} (${(aircraft.silhouette ?? 'narrow2').toUpperCase()})`}
            </div>
            <span
              className={`tech mt-1 inline-block rounded-sm border px-1.5 py-0.5 text-[10px] uppercase ${phase.className}`}
            >
              {phase.label}
            </span>
          </div>
          <canvas
            ref={silhouetteRef}
            width={56}
            height={56}
            className="h-12 w-12 shrink-0"
            aria-hidden="true"
          />
        </div>

        {/* Route */}
        <div className="grid grid-cols-7 bg-[#20252d] text-center">
          <div className="col-span-3 border-r border-white/[0.07] p-2.5">
            <div className="text-[10px] font-semibold uppercase text-white/40">Origen</div>
            <div className="cond mt-0.5 text-2xl font-bold leading-tight text-white">{origin}</div>
            <div className="truncate text-[11px] text-white/40">{originCity}</div>
          </div>
          <div className="col-span-1 flex flex-col items-center justify-center bg-[#191d24]">
            <svg className="h-4 w-4 text-accent" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16z" />
            </svg>
          </div>
          <div className="col-span-3 border-l border-white/[0.07] p-2.5">
            <div className="text-[10px] font-semibold uppercase text-white/40">Destino</div>
            <div className="cond mt-0.5 text-2xl font-bold leading-tight text-white">{destination}</div>
            <div className="truncate text-[11px] text-white/40">{destinationCity}</div>
          </div>
        </div>

        {/* Altitude progress */}
        <div className="h-1.5 w-full bg-[#12151a]">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Registration / hex / squawk */}
        <div className="grid grid-cols-3 divide-x divide-white/[0.06] bg-ink-800">
          <div className="p-2.5">
            <div className="text-[10px] uppercase text-white/40">Matrícula</div>
            <div className="tech mt-0.5 font-bold text-white">{aircraft.registration ?? 'N/A'}</div>
          </div>
          <div className="p-2.5">
            <div className="text-[10px] uppercase text-white/40">ICAO 24-bit</div>
            <div className="tech mt-0.5 font-bold text-accent">{aircraft.id.toUpperCase()}</div>
          </div>
          <div className="p-2.5">
            <div className="text-[10px] uppercase text-white/40">Squawk</div>
            <div className="tech mt-0.5 font-bold text-white">{aircraft.squawk ?? '----'}</div>
          </div>
        </div>

        {/* Altitude / speed */}
        <div className="grid grid-cols-2 divide-x divide-white/[0.06] bg-ink-700">
          <div className="p-2.5">
            <div className="text-[10px] uppercase text-white/40">Altitud calibrada</div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="tech text-base font-bold text-white">
                {aircraft.onGround ? 'GND' : formatAltitude(altitude).replace(' ft', '')}
              </span>
              <span className="tech text-[10px] text-white/40">ft</span>
            </div>
            <div className="tech text-[10px] text-white/40">
              {meters.toLocaleString('es-ES')} m · {flightLevel}
            </div>
          </div>
          <div className="p-2.5">
            <div className="text-[10px] uppercase text-white/40">Velocidad suelo (GS)</div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="tech text-base font-bold text-white">{aircraft.groundSpeed}</span>
              <span className="tech text-[10px] text-white/40">kts</span>
            </div>
            <div className="tech text-[10px] text-white/40">{kmh} km/h</div>
          </div>
        </div>

        {/* Track / vertical rate */}
        <div className="grid grid-cols-2 divide-x divide-white/[0.06] bg-ink-800">
          <div className="p-2.5">
            <div className="text-[10px] uppercase text-white/40">Rumbo (track)</div>
            <div className="tech mt-0.5 font-bold text-white">{formatHeading(aircraft.heading)}</div>
          </div>
          <div className="p-2.5">
            <div className="text-[10px] uppercase text-white/40">Velocidad vertical</div>
            <div className="tech mt-0.5 font-bold text-white">
              {aircraft.verticalRate > 0 ? '+' : ''}
              {aircraft.verticalRate} fpm
            </div>
          </div>
        </div>

        {/* Altitude sparkline */}
        <div className="bg-[#181c22] p-2.5">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase text-white/40">
            <span>Historial de altitud</span>
            <span className="tech">{trailAltitudes.length} pts GPS</span>
          </div>
          <div className="h-11 w-full border border-white/[0.07] bg-[#111418] p-1">
            <AltitudeSparkline altitudes={trailAltitudes} />
          </div>
        </div>

        {/* Position */}
        <div className="space-y-1 bg-ink-800 p-2.5 font-mono text-[11px]">
          <div className="flex justify-between">
            <span className="text-white/40">POSICIÓN:</span>
            <span className="text-white/80">
              {aircraft.lat.toFixed(4)}, {aircraft.lon.toFixed(4)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">DISTANCIA:</span>
            <span className="text-white/80">{formatDistance(aircraft.distanceNm)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">VELOCIDAD:</span>
            <span className="text-white/80">{formatSpeed(aircraft.groundSpeed)}</span>
          </div>
          <button
            type="button"
            onClick={onCenter}
            className="tech mt-1 flex w-full items-center justify-center gap-1.5 rounded border border-white/[0.09] bg-ink-700 py-1.5 text-[10px] text-white/70 transition hover:bg-ink-600 hover:text-white"
          >
            <Crosshair className="h-3 w-3 text-accent" />
            Centrar en el mapa
          </button>
        </div>
      </div>

      {/* Tracking zoom */}
      <div className="shrink-0 border-t border-white/[0.07] bg-[#181c22] px-2.5 py-2">
        <div className="mb-1.5 flex items-center justify-between text-[10px]">
          <span className="flex items-center gap-1 font-semibold uppercase text-white/40">
            <Crosshair className="h-3 w-3 text-accent" />
            Zoom de seguimiento
          </span>
          <div className="flex items-center gap-1">
            {[6.8, 9.5, 13.2].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onTrackingZoomChange(preset)}
                className="tech rounded border border-white/[0.09] bg-ink-700 px-1.5 py-0.5 text-[9px] text-white/60 transition hover:bg-ink-600"
              >
                {preset === 6.8 ? 'Ruta' : preset === 9.5 ? 'Aprox' : 'Pista'}
              </button>
            ))}
            <span className="tech ml-1 min-w-[34px] text-right font-bold text-accent">
              {trackingZoom.toFixed(1)}x
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onTrackingZoomChange(trackingZoom - 0.8)}
            className="tech h-6 w-6 shrink-0 rounded border border-white/[0.09] bg-ink-700 font-bold text-white/70 transition hover:bg-ink-600"
            aria-label="Alejar zoom"
          >
            −
          </button>
          <input
            type="range"
            min={4}
            max={15.5}
            step={0.1}
            value={trackingZoom}
            onChange={(event) => onTrackingZoomChange(Number.parseFloat(event.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded bg-[#0f1216]"
            aria-label="Zoom de seguimiento"
          />
          <button
            type="button"
            onClick={() => onTrackingZoomChange(trackingZoom + 0.8)}
            className="tech h-6 w-6 shrink-0 rounded border border-white/[0.09] bg-ink-700 font-bold text-white/70 transition hover:bg-ink-600"
            aria-label="Acercar zoom"
          >
            +
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 gap-1.5 border-t border-white/[0.07] bg-[#14171c] p-2.5">
        <button
          type="button"
          onClick={() => onFollowChange(!follow)}
          className={`tech flex flex-1 items-center justify-center gap-1.5 rounded py-2 px-2.5 text-xs font-bold transition ${
            follow
              ? 'bg-accent text-[#111317]'
              : 'border border-white/[0.09] bg-ink-700 text-white/75 hover:bg-ink-600 hover:text-white'
          }`}
          title="Mantener la cámara centrada en esta aeronave"
        >
          <Crosshair className="h-3.5 w-3.5" />
          {follow ? 'Siguiendo' : 'Seguir'}
        </button>
        <button
          type="button"
          onClick={() => on3DChange(!is3D)}
          className={`tech flex flex-1 items-center justify-center gap-1.5 rounded py-2 px-2.5 text-xs font-bold transition ${
            is3D
              ? 'bg-accent text-[#111317]'
              : 'border border-white/[0.09] bg-ink-700 text-white/75 hover:bg-ink-600 hover:text-white'
          }`}
          title="Alternar la perspectiva inclinada 3D"
        >
          <Compass className="h-3.5 w-3.5" />
          Vista 3D
        </button>
        <button
          type="button"
          onClick={onClearTrail}
          className="rounded border border-white/[0.09] bg-ink-700 px-2.5 py-2 text-white/70 transition hover:bg-ink-600 hover:text-white"
          title="Limpiar la estela"
          aria-label="Limpiar estela"
        >
          <Eraser className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  )
}

/** Sparkline of the altitude profile of the selected flight. */
function AltitudeSparkline({ altitudes }: { altitudes: number[] }) {
  const width = 240
  const height = 40
  const list = altitudes.length > 1 ? altitudes : [0, 0]
  const maxAlt = Math.max(41_000, ...list)
  const step = width / Math.max(1, list.length - 1)
  const points = list.map((alt, index) => {
    const x = (index * step).toFixed(1)
    const y = (height - 2 - (Math.min(maxAlt, Math.max(0, alt)) / maxAlt) * (height - 6)).toFixed(1)
    return `${x},${y}`
  })
  const path = `M ${points.join(' L ')}`

  return (
    <svg
      className="h-full w-full overflow-visible"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={`${path} L ${width},${height} L 0,${height} Z`} fill="rgba(255, 190, 0, 0.15)" />
      <path d={path} fill="none" stroke="#ffbe00" strokeWidth="1.8" />
    </svg>
  )
}
