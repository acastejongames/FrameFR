/**
 * Aircraft photography resolver.
 *
 * Three sources are raced in parallel, and the first one that answers wins:
 *
 *  1. **Planespotters** — the richest source, queried by hex address and by
 *     registration.
 *  2. **Wikimedia Commons** — searched by registration and by
 *     "airline + model" when Planespotters has nothing.
 *
 * The JetPhotos image that sometimes travels inside the Flightradar24 detail
 * payload is handled separately in `flightTrail.ts` and injected in the cache
 * before the network race starts.
 */

export interface AircraftPhoto {
  /** Direct URL of the image. */
  src: string
  /** Page the user is sent to when clicking the photo. */
  link: string
  /** Attribution line. */
  credit: string
  /** Short source name shown in the badge. */
  source: string
}

/** In-memory cache; a session never downloads the same photo twice. */
const cache = new Map<string, AircraftPhoto | null>()
/** In-flight promises, so two clicks do not start the same download twice. */
const inFlight = new Map<string, Promise<AircraftPhoto | null>>()

const PLANESPOTTERS_API = 'https://api.planespotters.net/pub/photos'
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'

/** Injects a photo into the cache (used by the FR24 detail payload). */
export function cachePhoto(hex: string, photo: AircraftPhoto): void {
  cache.set(hex.toLowerCase(), photo)
}

export function cachedPhoto(hex: string): AircraftPhoto | null | undefined {
  return cache.get(hex.toLowerCase())
}

interface PlanespottersPhoto {
  thumbnail_large?: { src?: string }
  thumbnail?: { src?: string }
  link?: string
  photographer?: string
}

async function fromPlanespotters(
  url: string,
  registration: string | undefined,
  hex: string,
): Promise<AircraftPhoto> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Planespotters HTTP ${response.status}`)
  const data = (await response.json()) as { photos?: PlanespottersPhoto[] }
  const first = data.photos?.[0]
  const src = first?.thumbnail_large?.src ?? first?.thumbnail?.src
  if (!src) throw new Error('Planespotters: sin foto')
  return {
    src,
    link: first?.link ?? 'https://www.planespotters.net',
    credit: `${first?.photographer ?? 'Spotter'}${registration ? ` (${registration})` : ` (${hex})`}`,
    source: 'Planespotters',
  }
}

async function fromCommons(query: string, model: string | undefined): Promise<AircraftPhoto> {
  const search = `filetype:bitmap ${query}`
  const url = `${COMMONS_API}?action=query&generator=search&gsrsearch=${encodeURIComponent(
    search,
  )}&gsrlimit=1&prop=imageinfo&iiprop=url|user&iiurlwidth=640&format=json&origin=*`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Commons HTTP ${response.status}`)
  const data = (await response.json()) as {
    query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string; thumburl?: string; descriptionurl?: string; user?: string }> }> }
  }
  const pages = data.query?.pages
  const first = pages ? Object.values(pages)[0] : undefined
  const info = first?.imageinfo?.[0]
  const src = info?.thumburl ?? info?.url
  if (!src) throw new Error('Commons: sin foto')
  return {
    src,
    link: info?.descriptionurl ?? src,
    credit: `${info?.user ?? 'Aviation Commons'}${model ? ` · ${model}` : ''}`,
    source: 'Commons',
  }
}

/**
 * Resolves the best available photo for an aircraft.
 *
 * @param aircraft Aircraft observation (only `id`, `registration`, `airlineName`
 *                 and `fullModel` are used).
 */
export function resolveAircraftPhoto(aircraft: {
  id: string
  registration?: string
  airlineName?: string
  fullModel?: string
}): Promise<AircraftPhoto | null> {
  const hex = aircraft.id.toLowerCase()
  const cached = cache.get(hex)
  if (cached !== undefined) return Promise.resolve(cached)

  const existing = inFlight.get(hex)
  if (existing) return existing

  const promise = (async (): Promise<AircraftPhoto | null> => {
    const urls: string[] = [`${PLANESPOTTERS_API}/hex/${encodeURIComponent(hex)}`]
    if (aircraft.registration && aircraft.registration !== 'N/A') {
      urls.push(`${PLANESPOTTERS_API}/reg/${encodeURIComponent(aircraft.registration)}`)
    }

    // 1. Planespotters (hex and registration raced together).
    try {
      const photo = await Promise.any(
        urls.map(async (url) => {
          try {
            return await fromPlanespotters(url, aircraft.registration, hex)
          } catch (error) {
            throw error
          }
        }),
      )
      cache.set(hex, photo)
      return photo
    } catch {
      // 2. Wikimedia Commons.
    }

    const queries: string[] = []
    if (aircraft.registration && aircraft.registration !== 'N/A') {
      queries.push(`"${aircraft.registration}" aircraft`)
    }
    if (aircraft.airlineName && aircraft.fullModel) {
      queries.push(`${aircraft.airlineName} ${aircraft.fullModel}`)
    } else if (aircraft.fullModel) {
      queries.push(`${aircraft.fullModel} aircraft`)
    }

    if (queries.length > 0) {
      try {
        const photo = await Promise.any(
          queries.map((query) => fromCommons(query, aircraft.fullModel)),
        )
        cache.set(hex, photo)
        return photo
      } catch {
        // No photo at all.
      }
    }

    cache.set(hex, null)
    return null
  })()

  inFlight.set(hex, promise)
  return promise.finally(() => inFlight.delete(hex))
}
