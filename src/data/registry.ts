import { AdsbLolProvider } from './providers/adsbLolProvider'
import { DemoProvider } from './providers/demoProvider'
import type { AircraftProvider, ProviderMode } from './types'

export type ProviderId = 'demo' | 'adsblol'

export interface ProviderMeta {
  id: ProviderId
  label: string
  description: string
  mode: ProviderMode
}

/**
 * Catalogue of available feeds. The UI renders this list verbatim, so adding a
 * provider only requires: (1) a class implementing `AircraftProvider` and
 * (2) an entry here.
 */
export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'demo',
    label: 'Demo',
    description: 'Flota simulada con rutas reales. Funciona sin conexión.',
    mode: 'simulated',
  },
  {
    id: 'adsblol',
    label: 'adsb.lol',
    description: 'Feed ADS-B público en directo (radio máx. 250 NM).',
    mode: 'live',
  },
]

export interface ProviderFactoryOptions {
  fleetSize?: number
  seed?: number
}

export function createProvider(id: ProviderId, options: ProviderFactoryOptions = {}): AircraftProvider {
  switch (id) {
    case 'adsblol':
      return new AdsbLolProvider()
    case 'demo':
    default:
      return new DemoProvider({ fleetSize: options.fleetSize, seed: options.seed })
  }
}

/** Provider selected on first load (`VITE_ADSB_PROVIDER` overrides it). */
export function defaultProviderId(): ProviderId {
  const fromEnv = import.meta.env.VITE_ADSB_PROVIDER?.trim() as ProviderId | undefined
  return fromEnv && PROVIDERS.some((p) => p.id === fromEnv) ? fromEnv : 'demo'
}

export { AdsbLolProvider, DemoProvider }
