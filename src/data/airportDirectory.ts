/**
 * Directory of airports offered as one-click shortcuts.
 *
 * It is deliberately small and hand-picked: only the airports that make sense
 * as a "hub" for a quick jump. The coordinates are the ARP of each airport and
 * the zoom is the level at which the traffic around it is readable.
 */

export interface AirportShortcut {
  /** IATA (or ICAO) code. */
  code: string
  /** Display name. */
  name: string
  lat: number
  lon: number
  /** Default zoom when the shortcut is used. */
  zoom: number
}

export const AIRPORT_DIRECTORY: Record<string, AirportShortcut> = {
  MAD: { code: 'MAD', name: 'Madrid-Barajas', lat: 40.4719, lon: -3.5626, zoom: 8.5 },
  BCN: { code: 'BCN', name: 'Barcelona-El Prat', lat: 41.2974, lon: 2.0833, zoom: 8.8 },
  PMI: { code: 'PMI', name: 'Palma de Mallorca', lat: 39.5517, lon: 2.7388, zoom: 9.0 },
  AGP: { code: 'AGP', name: 'Málaga-Costa del Sol', lat: 36.6749, lon: -4.4991, zoom: 9.0 },
  ALC: { code: 'ALC', name: 'Alicante-Elche', lat: 38.2822, lon: -0.5582, zoom: 9.0 },
  VLC: { code: 'VLC', name: 'Valencia-Manises', lat: 39.4893, lon: -0.4816, zoom: 9.0 },
  SVQ: { code: 'SVQ', name: 'Sevilla-San Pablo', lat: 37.418, lon: -5.8931, zoom: 9.0 },
  BIO: { code: 'BIO', name: 'Bilbao', lat: 43.3011, lon: -2.9106, zoom: 9.2 },
  LPA: { code: 'LPA', name: 'Gran Canaria', lat: 27.9319, lon: -15.3866, zoom: 8.8 },
  TFN: { code: 'TFN', name: 'Tenerife Norte', lat: 28.4827, lon: -16.3415, zoom: 9.2 },
  TFS: { code: 'TFS', name: 'Tenerife Sur', lat: 28.0445, lon: -16.5725, zoom: 9.2 },
  IBZ: { code: 'IBZ', name: 'Ibiza', lat: 38.8729, lon: 1.3731, zoom: 9.2 },
  SCQ: { code: 'SCQ', name: 'Santiago-Rosalía de Castro', lat: 42.8963, lon: -8.4151, zoom: 9.0 },
  OVD: { code: 'OVD', name: 'Asturias', lat: 43.5636, lon: -6.0346, zoom: 9.0 },
  ZAZ: { code: 'ZAZ', name: 'Zaragoza', lat: 41.6662, lon: -1.0416, zoom: 9.0 },
  LIS: { code: 'LIS', name: 'Lisboa-Humberto Delgado', lat: 38.7756, lon: -9.1354, zoom: 8.8 },
  OPO: { code: 'OPO', name: 'Oporto-Francisco Sá Carneiro', lat: 41.2481, lon: -8.6814, zoom: 9.0 },
  LHR: { code: 'LHR', name: 'Londres-Heathrow', lat: 51.47, lon: -0.4543, zoom: 8.8 },
  LGW: { code: 'LGW', name: 'Londres-Gatwick', lat: 51.1537, lon: -0.1821, zoom: 9.0 },
  CDG: { code: 'CDG', name: 'París-Charles de Gaulle', lat: 49.0097, lon: 2.5479, zoom: 8.8 },
  ORY: { code: 'ORY', name: 'París-Orly', lat: 48.7262, lon: 2.3652, zoom: 9.0 },
  FRA: { code: 'FRA', name: 'Fráncfort del Meno', lat: 50.0379, lon: 8.5622, zoom: 8.5 },
  MUC: { code: 'MUC', name: 'Múnich-Franz Josef Strauss', lat: 48.3537, lon: 11.775, zoom: 8.8 },
  AMS: { code: 'AMS', name: 'Ámsterdam-Shiphol', lat: 52.3105, lon: 4.7683, zoom: 8.8 },
  ZRH: { code: 'ZRH', name: 'Zúrich', lat: 47.4582, lon: 8.5555, zoom: 9.0 },
  FCO: { code: 'FCO', name: 'Roma-Fiumicino', lat: 41.8003, lon: 12.2389, zoom: 8.8 },
  MXP: { code: 'MXP', name: 'Milán-Malpensa', lat: 45.6301, lon: 8.7255, zoom: 8.8 },
  IST: { code: 'IST', name: 'Estambul', lat: 41.2753, lon: 28.7519, zoom: 8.5 },
  DXB: { code: 'DXB', name: 'Dubái Internacional', lat: 25.2532, lon: 55.3657, zoom: 8.8 },
  DOH: { code: 'DOH', name: 'Doha-Hamad', lat: 25.2731, lon: 51.6081, zoom: 8.8 },
  JFK: { code: 'JFK', name: 'Nueva York-JFK', lat: 40.6413, lon: -73.7781, zoom: 8.8 },
  LAX: { code: 'LAX', name: 'Los Ángeles', lat: 33.9416, lon: -118.4085, zoom: 8.8 },
  MIA: { code: 'MIA', name: 'Miami Internacional', lat: 25.7959, lon: -80.287, zoom: 8.8 },
  ORD: { code: 'ORD', name: "Chicago-O'Hare", lat: 41.9742, lon: -87.9073, zoom: 8.8 },
  ATL: { code: 'ATL', name: 'Atlanta-Hartsfield-Jackson', lat: 33.6407, lon: -84.4277, zoom: 8.8 },
  MEX: { code: 'MEX', name: 'Ciudad de México-AICM', lat: 19.4361, lon: -99.0719, zoom: 9.0 },
  BOG: { code: 'BOG', name: 'Bogotá-El Dorado', lat: 4.7016, lon: -74.1469, zoom: 9.0 },
  GRU: { code: 'GRU', name: 'São Paulo-Guarulhos', lat: -23.4356, lon: -46.4731, zoom: 8.8 },
  EZE: { code: 'EZE', name: 'Buenos Aires-Ezeiza', lat: -34.8222, lon: -58.5358, zoom: 8.8 },
  SCL: { code: 'SCL', name: 'Santiago de Chile', lat: -33.393, lon: -70.7858, zoom: 8.8 },
  HND: { code: 'HND', name: 'Tokio-Haneda', lat: 35.5494, lon: 139.7798, zoom: 8.8 },
  SIN: { code: 'SIN', name: 'Singapur-Changi', lat: 1.3644, lon: 103.9915, zoom: 9.0 },
  SYD: { code: 'SYD', name: 'Sídney-Kingsford Smith', lat: -33.9399, lon: 151.1753, zoom: 8.8 },
}

/** Looks a shortcut up by code, case-insensitively. */
export function findAirport(code: string): AirportShortcut | undefined {
  return AIRPORT_DIRECTORY[code.trim().toUpperCase()]
}

/** Searches the directory by code or by name (used for the autocomplete). */
export function searchAirports(query: string, limit = 6): AirportShortcut[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const results: AirportShortcut[] = []
  for (const airport of Object.values(AIRPORT_DIRECTORY)) {
    if (
      airport.code.toLowerCase().includes(q) ||
      airport.name.toLowerCase().includes(q)
    ) {
      results.push(airport)
    }
    if (results.length >= limit) break
  }
  return results
}
