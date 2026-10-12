import type { Airport } from './types'

/**
 * Reference airport catalogue used by the simulated provider to build routes.
 * `weight` biases how often an airport is picked as an origin/destination.
 */
export const AIRPORTS: Airport[] = [
  // España y Portugal
  { icao: 'LEMD', iata: 'MAD', name: 'Adolfo Suárez Madrid-Barajas', city: 'Madrid', country: 'España', lat: 40.4719, lon: -3.5626, weight: 9 },
  { icao: 'LEBL', iata: 'BCN', name: 'Josep Tarradellas El Prat', city: 'Barcelona', country: 'España', lat: 41.2974, lon: 2.0833, weight: 8 },
  { icao: 'LEMG', iata: 'AGP', name: 'Málaga-Costa del Sol', city: 'Málaga', country: 'España', lat: 36.721, lon: -4.421, weight: 6 },
  { icao: 'LEPA', iata: 'PMI', name: 'Palma de Mallorca', city: 'Palma', country: 'España', lat: 39.5517, lon: 2.7388, weight: 6 },
  { icao: 'LEAL', iata: 'ALC', name: 'Alicante-Elche', city: 'Alicante', country: 'España', lat: 38.2822, lon: -0.5582, weight: 4 },
  { icao: 'LEZL', iata: 'SVQ', name: 'Sevilla', city: 'Sevilla', country: 'España', lat: 37.4181, lon: -5.8931, weight: 3 },
  { icao: 'LEVX', iata: 'VGO', name: 'Vigo-Peinador', city: 'Vigo', country: 'España', lat: 42.2318, lon: -8.6269, weight: 2 },
  { icao: 'GCLP', iata: 'LPA', name: 'Gran Canaria', city: 'Las Palmas', country: 'España', lat: 27.9319, lon: -15.3866, weight: 4 },
  { icao: 'GCTS', iata: 'TFS', name: 'Tenerife Sur', city: 'Tenerife', country: 'España', lat: 28.0445, lon: -16.5725, weight: 3 },
  { icao: 'LPPT', iata: 'LIS', name: 'Humberto Delgado', city: 'Lisboa', country: 'Portugal', lat: 38.7742, lon: -9.1342, weight: 5 },
  { icao: 'LPFR', iata: 'FAO', name: 'Faro', city: 'Faro', country: 'Portugal', lat: 37.0154, lon: -7.9729, weight: 3 },

  // Europa occidental
  { icao: 'EGLL', iata: 'LHR', name: 'Heathrow', city: 'Londres', country: 'Reino Unido', lat: 51.47, lon: -0.4543, weight: 10 },
  { icao: 'EGKK', iata: 'LGW', name: 'Gatwick', city: 'Londres', country: 'Reino Unido', lat: 51.1537, lon: -0.1821, weight: 5 },
  { icao: 'EIDW', iata: 'DUB', name: 'Dublín', city: 'Dublín', country: 'Irlanda', lat: 53.4213, lon: -6.2701, weight: 5 },
  { icao: 'EGPF', iata: 'GLA', name: 'Glasgow', city: 'Glasgow', country: 'Reino Unido', lat: 55.8719, lon: -4.433, weight: 2 },
  { icao: 'LFPG', iata: 'CDG', name: 'Charles de Gaulle', city: 'París', country: 'Francia', lat: 49.0097, lon: 2.5479, weight: 10 },
  { icao: 'LFPO', iata: 'ORY', name: 'Orly', city: 'París', country: 'Francia', lat: 48.7262, lon: 2.3652, weight: 4 },
  { icao: 'LFMN', iata: 'NCE', name: 'Côte d’Azur', city: 'Niza', country: 'Francia', lat: 43.6584, lon: 7.2159, weight: 3 },
  { icao: 'EHAM', iata: 'AMS', name: 'Schiphol', city: 'Ámsterdam', country: 'Países Bajos', lat: 52.3105, lon: 4.7683, weight: 9 },
  { icao: 'EBBR', iata: 'BRU', name: 'Bruselas-National', city: 'Bruselas', country: 'Bélgica', lat: 50.9014, lon: 4.4844, weight: 4 },
  { icao: 'EDDF', iata: 'FRA', name: 'Fráncfort', city: 'Fráncfort', country: 'Alemania', lat: 50.0379, lon: 8.5622, weight: 10 },
  { icao: 'EDDM', iata: 'MUC', name: 'Múnich', city: 'Múnich', country: 'Alemania', lat: 48.3538, lon: 11.7861, weight: 7 },
  { icao: 'EDDL', iata: 'DUS', name: 'Düsseldorf', city: 'Düsseldorf', country: 'Alemania', lat: 51.2895, lon: 6.7668, weight: 4 },
  { icao: 'EDDB', iata: 'BER', name: 'Berlín-Brandeburgo', city: 'Berlín', country: 'Alemania', lat: 52.3667, lon: 13.5033, weight: 4 },
  { icao: 'LSZH', iata: 'ZRH', name: 'Zúrich', city: 'Zúrich', country: 'Suiza', lat: 47.4647, lon: 8.5492, weight: 5 },
  { icao: 'LSGG', iata: 'GVA', name: 'Ginebra', city: 'Ginebra', country: 'Suiza', lat: 46.2381, lon: 6.109, weight: 3 },
  { icao: 'LOWW', iata: 'VIE', name: 'Viena-Schwechat', city: 'Viena', country: 'Austria', lat: 48.1103, lon: 16.5697, weight: 4 },
  { icao: 'LIRF', iata: 'FCO', name: 'Leonardo da Vinci-Fiumicino', city: 'Roma', country: 'Italia', lat: 41.8003, lon: 12.2389, weight: 7 },
  { icao: 'LIMC', iata: 'MXP', name: 'Malpensa', city: 'Milán', country: 'Italia', lat: 45.6306, lon: 8.7281, weight: 5 },
  { icao: 'LIPE', iata: 'BLQ', name: 'Guglielmo Marconi', city: 'Bolonia', country: 'Italia', lat: 44.5354, lon: 11.2887, weight: 2 },

  // Europa nórdica y oriental
  { icao: 'EKCH', iata: 'CPH', name: 'Copenhague-Kastrup', city: 'Copenhague', country: 'Dinamarca', lat: 55.618, lon: 12.6508, weight: 5 },
  { icao: 'ENGM', iata: 'OSL', name: 'Oslo-Gardermoen', city: 'Oslo', country: 'Noruega', lat: 60.1976, lon: 11.1004, weight: 4 },
  { icao: 'ESSA', iata: 'ARN', name: 'Estocolmo-Arlanda', city: 'Estocolmo', country: 'Suecia', lat: 59.6519, lon: 17.9186, weight: 4 },
  { icao: 'EFHK', iata: 'HEL', name: 'Helsinki-Vantaa', city: 'Helsinki', country: 'Finlandia', lat: 60.3172, lon: 24.9633, weight: 3 },
  { icao: 'BIKF', iata: 'KEF', name: 'Keflavík', city: 'Reikiavik', country: 'Islandia', lat: 63.985, lon: -22.6056, weight: 2 },
  { icao: 'EPWA', iata: 'WAW', name: 'Chopin', city: 'Varsovia', country: 'Polonia', lat: 52.1657, lon: 20.9671, weight: 4 },
  { icao: 'LKPR', iata: 'PRG', name: 'Václav Havel', city: 'Praga', country: 'República Checa', lat: 50.1008, lon: 14.26, weight: 3 },
  { icao: 'LHBP', iata: 'BUD', name: 'Ferenc Liszt', city: 'Budapest', country: 'Hungría', lat: 47.4369, lon: 19.2556, weight: 3 },
  { icao: 'LROP', iata: 'OTP', name: 'Henri Coandă', city: 'Bucarest', country: 'Rumanía', lat: 44.5711, lon: 26.085, weight: 3 },
  { icao: 'LGAV', iata: 'ATH', name: 'Atenas-Eleftherios Venizelos', city: 'Atenas', country: 'Grecia', lat: 37.9364, lon: 23.9445, weight: 4 },
  { icao: 'UUEE', iata: 'SVO', name: 'Sheremétievo', city: 'Moscú', country: 'Rusia', lat: 55.9726, lon: 37.4146, weight: 5 },
  { icao: 'LTFM', iata: 'IST', name: 'Estambul', city: 'Estambul', country: 'Turquía', lat: 41.2753, lon: 28.7519, weight: 8 },
  { icao: 'LTFJ', iata: 'SAW', name: 'Sabiha Gökçen', city: 'Estambul', country: 'Turquía', lat: 40.8986, lon: 29.3092, weight: 4 },
  { icao: 'LTAI', iata: 'AYT', name: 'Antalya', city: 'Antalya', country: 'Turquía', lat: 36.8987, lon: 30.7859, weight: 3 },

  // Oriente Medio y África
  { icao: 'OTHH', iata: 'DOH', name: 'Hamad', city: 'Doha', country: 'Catar', lat: 25.2731, lon: 51.608, weight: 6 },
  { icao: 'OMDB', iata: 'DXB', name: 'Dubái', city: 'Dubái', country: 'EAU', lat: 25.2532, lon: 55.3657, weight: 9 },
  { icao: 'OMAA', iata: 'AUH', name: 'Zayed', city: 'Abu Dabi', country: 'EAU', lat: 24.433, lon: 54.6511, weight: 5 },
  { icao: 'OJAI', iata: 'AMM', name: 'Reina Alia', city: 'Amán', country: 'Jordania', lat: 31.7226, lon: 35.9933, weight: 3 },
  { icao: 'OIIE', iata: 'IKA', name: 'Imán Jomeini', city: 'Teherán', country: 'Irán', lat: 35.6893, lon: 51.3131, weight: 3 },
  { icao: 'HECA', iata: 'CAI', name: 'El Cairo', city: 'El Cairo', country: 'Egipto', lat: 30.1219, lon: 31.4056, weight: 4 },
  { icao: 'GMMN', iata: 'CMN', name: 'Mohammed V', city: 'Casablanca', country: 'Marruecos', lat: 33.3675, lon: -7.59, weight: 4 },
  { icao: 'DAAG', iata: 'ALG', name: 'Houari Boumediene', city: 'Argel', country: 'Argelia', lat: 36.691, lon: 3.2154, weight: 3 },
  { icao: 'FAOR', iata: 'JNB', name: 'O. R. Tambo', city: 'Johannesburgo', country: 'Sudáfrica', lat: -26.1392, lon: 28.246, weight: 4 },
  { icao: 'FACT', iata: 'CPT', name: 'Ciudad del Cabo', city: 'Ciudad del Cabo', country: 'Sudáfrica', lat: -33.9649, lon: 18.6017, weight: 3 },
  { icao: 'DNMM', iata: 'LOS', name: 'Murtala Muhammed', city: 'Lagos', country: 'Nigeria', lat: 6.5774, lon: 3.3212, weight: 3 },
  { icao: 'HKJK', iata: 'NBO', name: 'Jomo Kenyatta', city: 'Nairobi', country: 'Kenia', lat: -1.3192, lon: 36.9278, weight: 3 },

  // Norteamérica
  { icao: 'KJFK', iata: 'JFK', name: 'John F. Kennedy', city: 'Nueva York', country: 'EE. UU.', lat: 40.6413, lon: -73.7781, weight: 9 },
  { icao: 'KEWR', iata: 'EWR', name: 'Newark Liberty', city: 'Nueva York', country: 'EE. UU.', lat: 40.6895, lon: -74.1745, weight: 6 },
  { icao: 'KLAX', iata: 'LAX', name: 'Los Ángeles', city: 'Los Ángeles', country: 'EE. UU.', lat: 33.9416, lon: -118.4085, weight: 9 },
  { icao: 'KSFO', iata: 'SFO', name: 'San Francisco', city: 'San Francisco', country: 'EE. UU.', lat: 37.6213, lon: -122.379, weight: 7 },
  { icao: 'KORD', iata: 'ORD', name: "O'Hare", city: 'Chicago', country: 'EE. UU.', lat: 41.9742, lon: -87.9073, weight: 8 },
  { icao: 'KATL', iata: 'ATL', name: 'Hartsfield-Jackson', city: 'Atlanta', country: 'EE. UU.', lat: 33.6407, lon: -84.4277, weight: 9 },
  { icao: 'KDFW', iata: 'DFW', name: 'Dallas/Fort Worth', city: 'Dallas', country: 'EE. UU.', lat: 32.8998, lon: -97.0403, weight: 8 },
  { icao: 'KDEN', iata: 'DEN', name: 'Denver', city: 'Denver', country: 'EE. UU.', lat: 39.8561, lon: -104.6737, weight: 7 },
  { icao: 'KMIA', iata: 'MIA', name: 'Miami', city: 'Miami', country: 'EE. UU.', lat: 25.7959, lon: -80.287, weight: 7 },
  { icao: 'KSEA', iata: 'SEA', name: 'Seattle-Tacoma', city: 'Seattle', country: 'EE. UU.', lat: 47.4502, lon: -122.3088, weight: 5 },
  { icao: 'KBOS', iata: 'BOS', name: 'Logan', city: 'Boston', country: 'EE. UU.', lat: 42.3656, lon: -71.0096, weight: 5 },
  { icao: 'KIAD', iata: 'IAD', name: 'Dulles', city: 'Washington', country: 'EE. UU.', lat: 38.9531, lon: -77.4565, weight: 5 },
  { icao: 'KPHX', iata: 'PHX', name: 'Sky Harbor', city: 'Phoenix', country: 'EE. UU.', lat: 33.4342, lon: -112.0116, weight: 5 },
  { icao: 'KIAH', iata: 'IAH', name: 'George Bush', city: 'Houston', country: 'EE. UU.', lat: 29.9902, lon: -95.3368, weight: 6 },
  { icao: 'CYYZ', iata: 'YYZ', name: 'Toronto Pearson', city: 'Toronto', country: 'Canadá', lat: 43.6777, lon: -79.6248, weight: 6 },
  { icao: 'CYVR', iata: 'YVR', name: 'Vancouver', city: 'Vancouver', country: 'Canadá', lat: 49.1967, lon: -123.1815, weight: 4 },
  { icao: 'CYUL', iata: 'YUL', name: 'Trudeau', city: 'Montreal', country: 'Canadá', lat: 45.4706, lon: -73.7408, weight: 3 },
  { icao: 'MMMX', iata: 'MEX', name: 'Benito Juárez', city: 'Ciudad de México', country: 'México', lat: 19.4363, lon: -99.0721, weight: 6 },

  // Latinoamérica
  { icao: 'SBGR', iata: 'GRU', name: 'Guarulhos', city: 'São Paulo', country: 'Brasil', lat: -23.4356, lon: -46.4731, weight: 6 },
  { icao: 'SBGL', iata: 'GIG', name: 'Galeão', city: 'Río de Janeiro', country: 'Brasil', lat: -22.81, lon: -43.2506, weight: 4 },
  { icao: 'SAEZ', iata: 'EZE', name: 'Ezeiza', city: 'Buenos Aires', country: 'Argentina', lat: -34.8222, lon: -58.5358, weight: 5 },
  { icao: 'SCEL', iata: 'SCL', name: 'Arturo Merino Benítez', city: 'Santiago', country: 'Chile', lat: -33.393, lon: -70.7858, weight: 4 },
  { icao: 'SPJC', iata: 'LIM', name: 'Jorge Chávez', city: 'Lima', country: 'Perú', lat: -12.0219, lon: -77.1143, weight: 4 },
  { icao: 'SKBO', iata: 'BOG', name: 'El Dorado', city: 'Bogotá', country: 'Colombia', lat: 4.7016, lon: -74.1469, weight: 5 },
  { icao: 'SEQM', iata: 'UIO', name: 'Mariscal Sucre', city: 'Quito', country: 'Ecuador', lat: -0.1292, lon: -78.3575, weight: 2 },

  // Asia-Pacífico
  { icao: 'VIDP', iata: 'DEL', name: 'Indira Gandhi', city: 'Nueva Delhi', country: 'India', lat: 28.5562, lon: 77.1, weight: 7 },
  { icao: 'VABB', iata: 'BOM', name: 'Chhatrapati Shivaji', city: 'Bombay', country: 'India', lat: 19.0887, lon: 72.8679, weight: 6 },
  { icao: 'VOBL', iata: 'BLR', name: 'Kempegowda', city: 'Bengaluru', country: 'India', lat: 13.1986, lon: 77.7066, weight: 5 },
  { icao: 'VHHH', iata: 'HKG', name: 'Hong Kong', city: 'Hong Kong', country: 'China', lat: 22.308, lon: 113.9185, weight: 7 },
  { icao: 'ZBAA', iata: 'PEK', name: 'Capital', city: 'Pekín', country: 'China', lat: 40.0799, lon: 116.6031, weight: 8 },
  { icao: 'ZSPD', iata: 'PVG', name: 'Pudong', city: 'Shanghái', country: 'China', lat: 31.1443, lon: 121.8083, weight: 8 },
  { icao: 'RJTT', iata: 'HND', name: 'Haneda', city: 'Tokio', country: 'Japón', lat: 35.5494, lon: 139.7798, weight: 8 },
  { icao: 'RJAA', iata: 'NRT', name: 'Narita', city: 'Tokio', country: 'Japón', lat: 35.7647, lon: 140.3864, weight: 6 },
  { icao: 'RKSI', iata: 'ICN', name: 'Incheon', city: 'Seúl', country: 'Corea del Sur', lat: 37.4602, lon: 126.4407, weight: 6 },
  { icao: 'RCTP', iata: 'TPE', name: 'Taoyuan', city: 'Taipéi', country: 'Taiwán', lat: 25.0777, lon: 121.2328, weight: 5 },
  { icao: 'WSSS', iata: 'SIN', name: 'Changi', city: 'Singapur', country: 'Singapur', lat: 1.3644, lon: 103.9915, weight: 7 },
  { icao: 'WMKK', iata: 'KUL', name: 'Kuala Lumpur', city: 'Kuala Lumpur', country: 'Malasia', lat: 2.7456, lon: 101.7099, weight: 5 },
  { icao: 'VTBS', iata: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', country: 'Tailandia', lat: 13.69, lon: 100.7501, weight: 6 },
  { icao: 'WIII', iata: 'CGK', name: 'Soekarno-Hatta', city: 'Yakarta', country: 'Indonesia', lat: -6.1256, lon: 106.6558, weight: 5 },
  { icao: 'RPLL', iata: 'MNL', name: 'Ninoy Aquino', city: 'Manila', country: 'Filipinas', lat: 14.5086, lon: 121.0198, weight: 4 },
  { icao: 'YSSY', iata: 'SYD', name: 'Kingsford Smith', city: 'Sídney', country: 'Australia', lat: -33.9399, lon: 151.1753, weight: 6 },
  { icao: 'YMML', iata: 'MEL', name: 'Melbourne', city: 'Melbourne', country: 'Australia', lat: -37.669, lon: 144.841, weight: 5 },
  { icao: 'NZAA', iata: 'AKL', name: 'Auckland', city: 'Auckland', country: 'Nueva Zelanda', lat: -37.0082, lon: 174.7917, weight: 3 },
]

/** Index by ICAO code for quick lookups. */
export const AIRPORTS_BY_ICAO: Record<string, Airport> = Object.fromEntries(
  AIRPORTS.map((a) => [a.icao, a]),
)

const TOTAL_WEIGHT = AIRPORTS.reduce((sum, a) => sum + (a.weight ?? 1), 0)

/** Pick a random airport, favouring the busiest hubs. */
export function weightedAirport(rng: () => number): Airport {
  let r = rng() * TOTAL_WEIGHT
  for (const airport of AIRPORTS) {
    r -= airport.weight ?? 1
    if (r <= 0) return airport
  }
  return AIRPORTS[AIRPORTS.length - 1]
}
