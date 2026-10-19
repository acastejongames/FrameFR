import { Crosshair, FolderPlus, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AIRPORT_DIRECTORY, findAirport, searchAirports } from '@/data/airportDirectory'
import { DEFAULT_HUB_ITEMS, MAX_HUB_SLOTS, newHubId, type HubFolder, type HubItem } from '@/data/hubs'

interface HubsManagerProps {
  items: HubItem[]
  onChange: (items: HubItem[]) => void
  onClose: () => void
  onFlyTo: (lat: number, lon: number, zoom: number, label: string) => void
}

export function HubsManager({
  items,
  onChange,
  onClose,
  onFlyTo,
}: HubsManagerProps) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [zoom, setZoom] = useState('9')
  const [targetFolder, setTargetFolder] = useState('__root__')
  const [folderName, setFolderName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const folders = items.filter((item): item is HubFolder => item.type === 'folder')
  const canAddRoot = items.length < MAX_HUB_SLOTS

  // Autocomplete: fill the coordinates when a known code is typed.
  useEffect(() => {
    const airport = findAirport(code)
    if (!airport) return
    setName(airport.name)
    setLat(String(airport.lat))
    setLon(String(airport.lon))
    setZoom(String(airport.zoom))
  }, [code])

  // Autocomplete: fill the coordinates when a known name is typed.
  useEffect(() => {
    if (name.trim().length < 3) return
    const match = searchAirports(name, 1)[0]
    if (!match) return
    setCode(match.code)
    setLat(String(match.lat))
    setLon(String(match.lon))
    setZoom(String(match.zoom))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  const submit = (): void => {
    const parsedLat = Number.parseFloat(lat)
    const parsedLon = Number.parseFloat(lon)
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) {
      setError('Introduce coordenadas válidas o usa la vista actual del mapa.')
      return
    }
    if (parsedLat < -90 || parsedLat > 90 || parsedLon < -180 || parsedLon > 180) {
      setError('Las coordenadas están fuera de rango.')
      return
    }
    const finalCode = (code.trim() || 'APT').toUpperCase()
    const finalName = name.trim() || finalCode
    const finalZoom = Number.parseFloat(zoom) || 8.8

    if (targetFolder === '__root__') {
      if (items.length >= MAX_HUB_SLOTS) {
        setError('Máximo de 8 ranuras alcanzado. Guárdalo en una carpeta.')
        return
      }
      onChange([
        ...items,
        {
          id: newHubId('hub'),
          type: 'airport',
          code: finalCode,
          name: finalName,
          lat: parsedLat,
          lon: parsedLon,
          zoom: finalZoom,
        },
      ])
    } else {
      const folder = folders.find((item) => item.id === targetFolder)
      if (!folder) {
        setError('Selecciona una carpeta válida.')
        return
      }
      onChange(
        items.map((item) => {
          if (item.type !== 'folder' || item.id !== folder.id) return item
          return {
            ...item,
            airports: [
              ...item.airports,
              {
                id: newHubId('hub'),
                code: finalCode,
                name: finalName,
                lat: parsedLat,
                lon: parsedLon,
                zoom: finalZoom,
              },
            ],
          }
        }),
      )
    }
    setCode('')
    setName('')
    setLat('')
    setLon('')
    setError(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <div className="panel-raised flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg">
        <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#14171c] px-4 py-3">
          <div className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-accent" />
            <h2 className="cond text-sm font-bold uppercase tracking-wider text-white">
              Accesos directos de aeropuertos y carpetas
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="tech rounded border border-white/[0.09] bg-ink-700 px-2 py-0.5 text-[10px] text-accent">
              {items.length} / {MAX_HUB_SLOTS} ranuras
            </span>
            <button
              type="button"
              onClick={onClose}
              className="icon-btn h-7 w-7 rounded border border-white/[0.09] bg-ink-700"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="scroll-thin space-y-4 overflow-y-auto p-4 text-xs">
          {/* Add airport */}
          <section className="space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-accent">
              Añadir aeropuerto personalizado
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[10px] uppercase text-white/40">
                  Código IATA/ICAO
                </label>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  maxLength={6}
                  placeholder="Ej: AGP, LEMD…"
                  className="tech h-8 w-full rounded border border-white/[0.09] bg-[#12151a] px-2 text-xs uppercase text-white outline-none focus:border-accent"
                />
              </div>
              <div className="sm:col-span-4">
                <label className="mb-1 block text-[10px] uppercase text-white/40">
                  Nombre / Ciudad
                </label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ej: Málaga, Sevilla, París CDG…"
                  className="h-8 w-full rounded border border-white/[0.09] bg-[#12151a] px-2 text-xs text-white outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 items-end gap-2 sm:grid-cols-7">
              <div className="col-span-1 sm:col-span-2">
                <label className="mb-1 block text-[10px] uppercase text-white/40">Latitud</label>
                <input
                  value={lat}
                  onChange={(event) => setLat(event.target.value)}
                  placeholder="40.4719"
                  className="tech h-8 w-full rounded border border-white/[0.09] bg-[#12151a] px-2 text-xs text-white outline-none focus:border-accent"
                />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="mb-1 block text-[10px] uppercase text-white/40">Longitud</label>
                <input
                  value={lon}
                  onChange={(event) => setLon(event.target.value)}
                  placeholder="-3.5626"
                  className="tech h-8 w-full rounded border border-white/[0.09] bg-[#12151a] px-2 text-xs text-white outline-none focus:border-accent"
                />
              </div>
              <div className="col-span-1 sm:col-span-1">
                <label className="mb-1 block text-[10px] uppercase text-white/40">Zoom</label>
                <input
                  value={zoom}
                  onChange={(event) => setZoom(event.target.value)}
                  inputMode="decimal"
                  className="tech h-8 w-full rounded border border-white/[0.09] bg-[#12151a] px-2 text-xs text-white outline-none focus:border-accent"
                />
              </div>
              <div className="col-span-3 sm:col-span-2">
                <label className="mb-1 block text-[10px] uppercase text-white/40">Ubicación</label>
                <select
                  value={targetFolder}
                  onChange={(event) => setTargetFolder(event.target.value)}
                  className="h-8 w-full rounded border border-white/[0.09] bg-[#12151a] px-2 text-xs text-white/70 outline-none focus:border-accent"
                >
                  <option value="__root__" disabled={!canAddRoot}>
                    Barra principal ({items.length}/{MAX_HUB_SLOTS})
                  </option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      📁 {folder.name} ({folder.airports.length})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && <div className="text-[11px] text-rose-300">{error}</div>}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={submit}
                className="tech flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-bold text-[#111317] transition hover:bg-accent-soft"
              >
                <Plus className="h-3.5 w-3.5" />
                Guardar aeropuerto
              </button>
            </div>
          </section>

          {/* Create folder */}
          <section className="space-y-2 border-t border-white/[0.06] pt-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-accent">
              Crear carpeta de aeropuertos
            </div>
            <div className="flex gap-2">
              <input
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                maxLength={18}
                placeholder="Nombre de carpeta (ej: España, Islas, Favoritos…)"
                className="h-8 flex-1 rounded border border-white/[0.09] bg-[#12151a] px-2.5 text-xs text-white outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = folderName.trim()
                  if (!trimmed) return
                  if (items.length >= MAX_HUB_SLOTS) {
                    setError('Ya tienes 8 ranuras ocupadas en la barra principal.')
                    return
                  }
                  onChange([...items, { id: newHubId('folder'), type: 'folder', name: trimmed, airports: [] }])
                  setFolderName('')
                  setError(null)
                }}
                className="tech flex h-8 shrink-0 items-center gap-1.5 rounded border border-white/[0.09] bg-ink-700 px-3 text-xs font-semibold text-white/80 transition hover:bg-ink-600"
              >
                <FolderPlus className="h-3.5 w-3.5 text-accent" />
                Crear carpeta
              </button>
            </div>
          </section>

          {/* Current configuration */}
          <section className="space-y-2 border-t border-white/[0.06] pt-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                Ranuras visibles en la barra (máx. {MAX_HUB_SLOTS})
              </span>
              <button
                type="button"
                onClick={() => onChange(structuredClone(DEFAULT_HUB_ITEMS))}
                className="text-[11px] text-white/40 underline transition hover:text-accent"
              >
                Restaurar predeterminados
              </button>
            </div>

            {items.length === 0 ? (
              <div className="rounded border border-white/[0.07] p-3 text-center text-white/40">
                No hay accesos directos configurados.
              </div>
            ) : (
              <div className="scroll-thin max-h-60 space-y-1.5 overflow-y-auto pr-1">
                {items.map((item, index) =>
                  item.type === 'folder' ? (
                    <div
                      key={item.id}
                      className="rounded border border-white/[0.07] bg-ink-700 p-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="tech rounded bg-[#14171c] px-1.5 py-0.5 text-[10px] text-white/40">
                            #{index + 1}
                          </span>
                          <span className="font-bold text-white">📁 {item.name}</span>
                          <span className="tech text-[10px] text-white/40">
                            ({item.airports.length} aeropuertos)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onChange(items.filter((entry) => entry.id !== item.id))}
                          className="flex items-center gap-1 rounded border border-white/[0.09] bg-ink-700 px-2 py-0.5 text-[10px] text-rose-300 transition hover:text-rose-200"
                        >
                          <Trash2 className="h-3 w-3" />
                          Eliminar
                        </button>
                      </div>
                      <div className="mt-1.5 space-y-1">
                        {item.airports.length === 0 && (
                          <div className="pl-4 text-[10px] text-white/30">Sin aeropuertos dentro</div>
                        )}
                        {item.airports.map((airport) => (
                          <div
                            key={airport.id}
                            className="flex items-center justify-between rounded border border-white/[0.05] bg-[#161a20] py-1 pl-5 pr-2 text-[11px]"
                          >
                            <span className="truncate">
                              <span className="tech font-bold text-accent">{airport.code}</span>
                              <span className="ml-1 text-white/70">{airport.name}</span>
                              <span className="tech ml-1 text-[10px] text-white/30">
                                ({airport.lat.toFixed(2)}, {airport.lon.toFixed(2)})
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  onFlyTo(
                                    airport.lat,
                                    airport.lon,
                                    airport.zoom,
                                    `${airport.code} · ${airport.name}`,
                                  )
                                }
                                className="rounded border border-white/[0.09] bg-ink-700 px-1.5 py-0.5 text-[10px] text-white/70 transition hover:bg-ink-600"
                              >
                                Ir
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onChange(
                                    items.map((entry) =>
                                      entry.type === 'folder' && entry.id === item.id
                                        ? {
                                            ...entry,
                                            airports: entry.airports.filter(
                                              (candidate) => candidate.id !== airport.id,
                                            ),
                                          }
                                        : entry,
                                    ),
                                  )
                                }
                                className="rounded border border-white/[0.09] bg-ink-700 px-1.5 py-0.5 text-[10px] text-rose-300 transition hover:text-rose-200"
                                aria-label="Eliminar aeropuerto"
                              >
                                ✕
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded border border-white/[0.07] bg-ink-700 p-2"
                    >
                      <div className="flex min-w-0 items-center gap-2 truncate">
                        <span className="tech rounded bg-[#14171c] px-1.5 py-0.5 text-[10px] text-white/40">
                          #{index + 1}
                        </span>
                        <span className="tech font-bold text-accent">{item.code}</span>
                        <span className="truncate text-white/80">{item.name}</span>
                        <span className="tech shrink-0 text-[10px] text-white/30">
                          ({item.lat.toFixed(2)}, {item.lon.toFixed(2)} · z{item.zoom})
                        </span>
                      </div>
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onFlyTo(item.lat, item.lon, item.zoom, `${item.code} · ${item.name}`)}
                          className="rounded border border-white/[0.09] bg-ink-700 px-2 py-0.5 text-[10px] text-white/70 transition hover:bg-ink-600"
                        >
                          Ir
                        </button>
                        <button
                          type="button"
                          onClick={() => onChange(items.filter((entry) => entry.id !== item.id))}
                          className="rounded border border-white/[0.09] bg-ink-700 px-2 py-0.5 text-[10px] text-rose-300 transition hover:text-rose-200"
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                  ),
                )}
              </div>
            )}
          </section>

          <p className="flex items-center gap-1.5 border-t border-white/[0.06] pt-3 text-[10.5px] text-white/30">
            <Crosshair className="h-3 w-3" />
            Los accesos se guardan en este navegador. Hay {Object.keys(AIRPORT_DIRECTORY).length}{' '}
            aeropuertos en el directorio integrado.
          </p>
        </div>
      </div>
    </div>
  )
}
