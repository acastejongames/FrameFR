/**
 * adsb.lol provider.
 *
 * Kept as a named class (instead of only a registry entry) because it is the
 * reference implementation of the "v2" family of public feeds and it is
 * referenced from the documentation and from the tests.
 */

import { AdsbV2Provider } from './adsbV2Provider'

export class AdsbLolProvider extends AdsbV2Provider {
  constructor(options: { baseUrl?: string } = {}) {
    super({
      id: 'adsblol',
      label: 'adsb.lol',
      description: 'Feed ADS-B comunitario en directo (hasta 250 NM de radio).',
      attribution: 'Datos ADS-B vía adsb.lol',
      pollIntervalMs: 8_000,
      buildUrl: (lat, lon, radius) => {
        const base = (options.baseUrl ?? 'https://api.adsb.lol/v2').replace(/\/$/, '')
        return `${base}/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${radius}`
      },
    })
  }
}
