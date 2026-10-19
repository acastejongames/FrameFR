/**
 * Airport shortcuts ("hubs") shown in the top bar.
 *
 * The bar has eight slots. A slot is either a direct airport shortcut or a
 * folder that groups several airports. The configuration is stored in the
 * browser so it survives reloads.
 */

import { readStored, writeStored } from '@/lib/storage'
import type { AirportShortcut } from './airportDirectory'

/** Maximum number of slots visible in the bar. */
export const MAX_HUB_SLOTS = 8

export interface HubAirport {
  id: string
  code: string
  name: string
  lat: number
  lon: number
  zoom: number
}

export interface HubFolder {
  id: string
  type: 'folder'
  name: string
  airports: HubAirport[]
}

export interface HubDirect {
  id: string
  type: 'airport'
  code: string
  name: string
  lat: number
  lon: number
  zoom: number
}

export type HubItem = HubFolder | HubDirect

const STORAGE_KEY = 'hubs'

/** Default shortcuts shipped with the app. */
export const DEFAULT_HUB_ITEMS: HubItem[] = [
  { id: 'hub-mad', type: 'airport', code: 'MAD', name: 'Madrid-Barajas', lat: 40.4719, lon: -3.5626, zoom: 8.0 },
  { id: 'hub-bcn', type: 'airport', code: 'BCN', name: 'Barcelona-El Prat', lat: 41.2974, lon: 2.0833, zoom: 8.5 },
  {
    id: 'folder-esp',
    type: 'folder',
    name: 'España',
    airports: [
      { id: 'hub-pmi', code: 'PMI', name: 'Palma de Mallorca', lat: 39.5517, lon: 2.7388, zoom: 9.0 },
      { id: 'hub-agp', code: 'AGP', name: 'Málaga-Costa del Sol', lat: 36.6749, lon: -4.4991, zoom: 9.0 },
      { id: 'hub-lpa', code: 'LPA', name: 'Gran Canaria', lat: 27.9319, lon: -15.3866, zoom: 8.8 },
      { id: 'hub-svq', code: 'SVQ', name: 'Sevilla', lat: 37.418, lon: -5.8931, zoom: 9.0 },
    ],
  },
  { id: 'hub-fra', type: 'airport', code: 'FRA', name: 'Fráncfort', lat: 50.0379, lon: 8.5622, zoom: 8.0 },
  { id: 'hub-lhr', type: 'airport', code: 'LHR', name: 'Londres-Heathrow', lat: 51.47, lon: -0.4543, zoom: 8.5 },
  { id: 'hub-jfk', type: 'airport', code: 'JFK', name: 'Nueva York-JFK', lat: 40.6413, lon: -73.7781, zoom: 8.5 },
]

/** Unique identifier for a new shortcut. */
export function newHubId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** Builds a direct shortcut from a directory entry. */
export function hubFromDirectory(airport: AirportShortcut): HubDirect {
  return {
    id: newHubId('hub'),
    type: 'airport',
    code: airport.code,
    name: airport.name,
    lat: airport.lat,
    lon: airport.lon,
    zoom: airport.zoom,
  }
}

/** Reads the stored shortcuts, falling back to the defaults. */
export function loadHubItems(): HubItem[] {
  const stored = readStored<HubItem[] | null>(STORAGE_KEY, null)
  if (!Array.isArray(stored) || stored.length === 0) {
    return structuredClone(DEFAULT_HUB_ITEMS)
  }
  // Defensive: ignore anything that does not look like a shortcut.
  return stored.filter(
    (item): item is HubItem =>
      Boolean(item) &&
      (item.type === 'folder' || item.type === 'airport') &&
      typeof item.id === 'string',
  )
}

/** Persists the shortcuts. */
export function saveHubItems(items: HubItem[]): void {
  writeStored(STORAGE_KEY, items)
}
