import { AdsbV2Provider } from './providers/adsbV2Provider'
import { AdsbLolProvider } from './providers/adsbLolProvider'
import { AutoProvider } from './providers/autoProvider'
import { DemoProvider } from './providers/demoProvider'
import { Fr24ZoneProvider } from './providers/fr24ZoneProvider'
import { OpenSkyProvider } from './providers/openSkyProvider'
import type { AircraftProvider, ProviderMode } from './types'

/** Every feed the app can talk to. */
export type ProviderId =
  | 'demo'
  | 'auto'
  | 'adsblol'
  | 'adsbone'
  | 'adsbfi'
  | 'airplaneslive'
  | 'fr24'
  | 'opensky'

export interface ProviderMeta {
  id: ProviderId
  label: string
  description: string
  mode: ProviderMode
  /** Shown in the settings dropdown under the label. */
  hint?: string
}

/**
 * Catalogue of available feeds. The UI renders this list verbatim, so adding a
 * provider only requires: (1) a class implementing `AircraftProvider` and
 * (2) an entry here.
 */
export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'auto',
    label: 'Automático (multi-red)',
    description:
      'Consulta en paralelo adsb.lol, ADSB.one, adsb.fi, airplanes.live y Flightradar24, y fusiona los resultados.',
    mode: 'live',
    hint: 'Recomendado',
  },
  {
    id: 'fr24',
    label: 'Global ADS-B (Flightradar24)',
    description: 'Feed global con ruta, matrícula y número de vuelo. JSONP, sin CORS.',
    mode: 'live',
    hint: 'Incluye ruta',
  },
  {
    id: 'adsblol',
    label: 'adsb.lol',
    description: 'Feed ADS-B público en directo (radio máx. 250 NM).',
    mode: 'live',
  },
  {
    id: 'adsbone',
    label: 'ADSB.one',
    description: 'Red voluntaria de receptores ADS-B.',
    mode: 'live',
  },
  {
    id: 'adsbfi',
    label: 'adsb.fi',
    description: 'Red voluntaria del norte de Europa.',
    mode: 'live',
  },
  {
    id: 'airplaneslive',
    label: 'airplanes.live',
    description: 'Red voluntaria con cobertura internacional.',
    mode: 'live',
  },
  {
    id: 'opensky',
    label: 'OpenSky Network',
    description: 'Red abierta global; solo informa de una parte del tráfico.',
    mode: 'live',
  },
  {
    id: 'demo',
    label: 'Demo',
    description: 'Flota simulada con rutas reales. Funciona sin conexión.',
    mode: 'simulated',
  },
]

export interface ProviderFactoryOptions {
  fleetSize?: number
  seed?: number
}

/** Builds the URL of one of the v2 networks. */
function v2Url(
  id: string,
  label: string,
  description: string,
  buildUrl: (lat: number, lon: number, radius: number) => string,
): AdsbV2Provider {
  return new AdsbV2Provider({ id, label, description, buildUrl, pollIntervalMs: 8_000 })
}

export function createProvider(id: ProviderId, options: ProviderFactoryOptions = {}): AircraftProvider {
  switch (id) {
    case 'auto':
      return new AutoProvider()
    case 'fr24':
      return new Fr24ZoneProvider()
    case 'adsblol':
      return new AdsbLolProvider()
    case 'adsbone':
      return v2Url(
        'adsbone',
        'ADSB.one',
        'Red voluntaria de receptores ADS-B.',
        (lat, lon, radius) => `https://api.adsb.one/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${radius}`,
      )
    case 'adsbfi':
      return v2Url(
        'adsbfi',
        'adsb.fi',
        'Red voluntaria del norte de Europa.',
        (lat, lon, radius) =>
          `https://opendata.adsb.fi/api/v2/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${radius}`,
      )
    case 'airplaneslive':
      return v2Url(
        'airplaneslive',
        'airplanes.live',
        'Red voluntaria con cobertura internacional.',
        (lat, lon, radius) =>
          `https://api.airplanes.live/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${radius}`,
      )
    case 'opensky':
      return new OpenSkyProvider()
    case 'demo':
    default:
      return new DemoProvider({ fleetSize: options.fleetSize, seed: options.seed })
  }
}

/** Provider selected on first load (`VITE_ADSB_PROVIDER` overrides it). */
export function defaultProviderId(): ProviderId {
  const fromEnv = import.meta.env.VITE_ADSB_PROVIDER?.trim() as ProviderId | undefined
  return fromEnv && PROVIDERS.some((p) => p.id === fromEnv) ? fromEnv : 'auto'
}

/** Label of a provider, used in the status bar. */
export function providerLabel(id: ProviderId): string {
  return PROVIDERS.find((p) => p.id === id)?.label ?? id
}

export { AdsbLolProvider, AdsbV2Provider, AutoProvider, DemoProvider, Fr24ZoneProvider, OpenSkyProvider }
