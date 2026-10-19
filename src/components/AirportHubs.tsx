import { Folder, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MAX_HUB_SLOTS, type HubFolder, type HubItem } from '@/data/hubs'

interface AirportHubsProps {
  items: HubItem[]
  /** Flies the camera to an airport. */
  onFlyTo: (lat: number, lon: number, zoom: number, label: string) => void
  /** Hides the widget entirely (settings → interfaz). */
  visible: boolean
  /** The manager modal is controlled from the outside (the settings modal opens it). */
  onManagerOpenChange: (open: boolean) => void
}

/**
 * Quick jumps to airports.
 *
 * The bar has eight slots; each slot is either an airport or a folder that
 * groups several of them. The configuration is managed in a modal and stored
 * in the browser.
 */
export function AirportHubs({
  items,
  onFlyTo,
  visible,
  onManagerOpenChange,
}: AirportHubsProps) {
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close the folder dropdown when clicking outside of it.
  useEffect(() => {
    if (!openFolderId) return
    const onPointerDown = (event: MouseEvent): void => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpenFolderId(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [openFolderId])

  if (!visible) return null

  const slots = items.slice(0, MAX_HUB_SLOTS)

  return (
    <div ref={wrapperRef} className="airport-hubs">
        <div className="airport-hub-list">
          {slots.map((item) => {
            if (item.type === 'folder') {
              const open = openFolderId === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setOpenFolderId(open ? null : item.id)}
                  title={`Carpeta: ${item.name}`}
                  aria-expanded={open}
                  className={`tech flex items-center gap-1 rounded px-2 py-1 text-[11px] transition ${
                    open
                      ? 'bg-accent font-bold text-[#111317]'
                      : 'border border-white/[0.09] bg-ink-700 text-white/70 hover:bg-ink-600 hover:text-white'
                  }`}
                >
                  <Folder size={13} aria-hidden="true" /><span>{item.name}</span>
                  <span className="opacity-70">({item.airports.length})</span>
                </button>
              )
            }
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onFlyTo(item.lat, item.lon, item.zoom, `${item.code} · ${item.name}`)}
                title={item.name}
                className="tech rounded border border-white/[0.09] bg-ink-700 px-2 py-1 text-[11px] text-white/70 transition hover:bg-ink-600 hover:text-white"
              >
                {item.code}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => onManagerOpenChange(true)}
          title="Gestionar aeropuertos y carpetas (máx. 8 ranuras)"
          className="icon-btn h-7 w-7 rounded border border-white/[0.09] bg-ink-700 text-accent transition hover:bg-ink-600 hover:text-white"
          aria-label="Gestionar aeropuertos"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

      {openFolderId && (
        <FolderDropdown
          folder={slots.find(
            (item): item is HubFolder => item.type === 'folder' && item.id === openFolderId,
          )}
          onFlyTo={(...args) => { setOpenFolderId(null); onFlyTo(...args) }}
        />
      )}
    </div>
  )
}

function FolderDropdown({
  folder,
  onFlyTo,
}: {
  folder: HubFolder | undefined
  onFlyTo: (lat: number, lon: number, zoom: number, label: string) => void
}) {
  if (!folder) return null
  return (
    <div className="panel-raised absolute left-0 top-9 z-50 min-w-[210px] divide-y divide-white/[0.05] rounded-md py-1">
      <div className="tech flex items-center justify-between bg-[#14171c] px-2.5 py-1 text-[10px] uppercase text-accent">
        <span className="flex items-center gap-2"><Folder size={13} aria-hidden="true" />{folder.name}</span>
        <span>{folder.airports.length} aeropuertos</span>
      </div>
      {folder.airports.length === 0 ? (
        <div className="px-3 py-2 text-[11px] text-white/40">
          Carpeta vacía. Añade aeropuertos con el botón (+).
        </div>
      ) : (
        folder.airports.map((airport) => (
          <button
            key={airport.id}
            type="button"
            onClick={() =>
              onFlyTo(airport.lat, airport.lon, airport.zoom, `${airport.code} · ${airport.name}`)
            }
            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-white/[0.05]"
          >
            <span className="min-w-0 truncate">
              <span className="tech mr-1.5 font-bold text-accent">{airport.code}</span>
              <span className="text-white/70">{airport.name}</span>
            </span>
            <span className="tech shrink-0 text-[10px] text-white/35">
              {airport.lat.toFixed(1)}°, {airport.lon.toFixed(1)}°
            </span>
          </button>
        ))
      )}
    </div>
  )
}
