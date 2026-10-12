# FrameFR

Seguimiento de tráfico aéreo en tiempo real sobre un mapa interactivo, inspirado en Flightradar24.

> **Demo desplegada:** https://acastejongames.github.io/FrameFR/

---

## Vista general

FrameFR muestra aeronaves en movimiento sobre una cartografía oscura y minimalista. Cada avión se
dibuja con su rumbo real, se colorea según su altitud y se puede seleccionar para ver su ficha
completa (ruta, altitud, velocidad, régimen de ascenso, squawk, matrícula…).

Arranca con **datos de demostración** —una flota simulada que vuela rutas reales entre aeropuertos
reales— y está preparada para consumir **fuentes ADS-B públicas** como
[adsb.lol](https://adsb.lol) cambiando un único ajuste, sin tocar el resto del código.

## Tecnologías

| Pieza           | Uso                                                        |
| --------------- | ---------------------------------------------------------- |
| **React 19**    | Interfaz (componentes funcionales + hooks)                  |
| **TypeScript**  | Tipado estricto en todo el proyecto                         |
| **Vite**        | Servidor de desarrollo y build                              |
| **MapLibre GL** | Cartografía interactiva (estilo ráster oscuro, sin API key) |
| **Tailwind CSS 4** | Estilos (tema oscuro propio, sin dependencias de UI)     |
| **Lucide**      | Iconografía                                                 |
| **GitHub Actions** | CI y despliegue automático en GitHub Pages               |

Sin base de datos, sin autenticación y sin servicios de pago: la app es 100 % estática.

## Puesta en marcha

```bash
git clone https://github.com/acastejongames/FrameFR.git
cd FrameFR
npm install
npm run dev          # http://localhost:5173
```

| Script            | Descripción                                                        |
| ----------------- | ------------------------------------------------------------------ |
| `npm run dev`     | Servidor de desarrollo con recarga en caliente                      |
| `npm run build`   | Comprueba los tipos, genera `dist/` y el `404.html` de fallback      |
| `npm run preview` | Sirve `dist/` tal y como quedará en producción                      |
| `npm run typecheck` | Sólo comprobación de tipos                                        |
| `npm run smoke`   | Prueba headless del simulador y de la geodesia (sin navegador)       |

Requiere **Node 20.19+** (probado con Node 22).

### Variables de entorno

Copia `.env.example` como `.env`. Todas son opcionales:

| Variable               | Por defecto                    | Para qué sirve                              |
| ---------------------- | ------------------------------ | ------------------------------------------- |
| `VITE_ADSB_PROVIDER`   | `demo`                         | Proveedor inicial (`demo` o `adsblol`)       |
| `VITE_FLEET_SIZE`      | `600`                          | Tamaño de la flota simulada                  |
| `VITE_MAP_STYLE_URL`   | estilo ráster propio           | Estilo MapLibre alternativo                  |
| `VITE_GLYPHS_URL`      | glifos de OpenFreeMap          | Tipografía de las etiquetas del mapa         |
| `VITE_BASE_PATH`       | `/FrameFR/` en producción      | Ruta base del build                          |

## Arquitectura

```
src/
├─ data/                    # Capa de datos (independiente de la UI y del mapa)
│  ├─ types.ts              #    Aircraft, AircraftProvider, Viewport…
│  ├─ geo.ts                #    Ortodromia, rumbos, recuadros
│  ├─ airports.ts           #    Catálogo de aeropuertos reales
│  ├─ airlines.ts           #    Operadores, tipos y regiones
│  ├─ registry.ts           #    Catálogo de proveedores + factoría
│  └─ providers/
│     ├─ demoProvider.ts    #    Flota simulada (rutas reales, perfiles de vuelo)
│     └─ adsbLolProvider.ts #    Feed público adsb.lol
├─ engine/
│  └─ fleetController.ts    # Bucle de animación, interpolación y publicación de datos
├─ map/
│  ├─ style.ts              # Estilo oscuro del mapa base
│  ├─ aircraftIcons.ts      # Iconos de avión generados en canvas
│  ├─ aircraftLayers.ts     # Fuentes y capas de MapLibre
│  └─ palette.ts            # Bandas de altitud y colores
├─ components/              # UI: barra superior, lista, ficha, ajustes, estado
├─ hooks/                   # Puente entre el controlador y React
└─ config.ts                # Constantes y valores por defecto
```

### Capa de datos modular

Todo gira en torno a un contrato mínimo (`src/data/types.ts`):

```ts
interface AircraftProvider {
  readonly id: string
  readonly label: string
  readonly mode: 'simulated' | 'live'
  readonly pollIntervalMs: number
  advance?(deltaMs: number): void          // sólo simuladores
  poll(viewport: Viewport, signal?: AbortSignal): Promise<Aircraft[]>
  dispose?(): void
}
```

El proveedor sólo responde a *«¿qué ves ahora?»*. Del resto se encarga el motor:

1. **`FleetController`** mantiene un `Track` por aeronave con sus dos últimas posiciones.
2. Entre sondeos **interpola** (y extrapola ligeramente) posición, altitud y rumbo, de modo que el
   movimiento es fluido incluso si el feed se actualiza cada 10 s.
3. Empuja un GeoJSON a MapLibre **~14 veces por segundo** y una instantánea a React **2 veces por
   segundo**, así la interfaz nunca se re-renderiza a velocidad de animación.

**Añadir otro proveedor** (OpenSky, ADS-B Exchange, un receptor local…) consiste en crear una clase
que implemente `AircraftProvider` y registrar una entrada en `src/data/registry.ts`. Ni el motor ni
la UI necesitan cambios.

### Fuentes disponibles

- **Demo (`demo`)** — flota simulada sobre rutas ortodrómicas entre aeropuertos reales, con
  perfiles de ascenso, crucero y descenso, operadores coherentes con la región de origen y
  reciclado de vuelos al aterrizar. No necesita conexión.
- **adsb.lol (`adsblol`)** — feed ADS-B comunitario en directo
  (`GET https://api.adsb.lol/v2/point/{lat}/{lon}/{radio}`). El servicio limita el radio a
  **250 NM**, así que al alejar mucho el zoom la app avisa de que conviene acercarse.

### Rendimiento

- El bucle de animación es único (`requestAnimationFrame`) y está aislado de React.
- La lista de vuelos sólo renderiza las 80 aeronaves más cercanas.
- El rastro (estela) se calcula únicamente para la aeronave seleccionada.
- La flota simulada es configurable (250 / 600 / 1200) y la velocidad de simulación admite ×1, ×2 y ×5.
- Probado para una resolución de referencia de 2560 × 1440.

## Interfaz

- **Barra superior:** estado del feed (demo / directo),buscador (`/` para enfocarlo) y contadores.
- **Panel izquierdo:** tráfico ordenado por distancia al centro, con filtros por categoría.
- **Ficha derecha:** ruta con progreso y ETA, métricas en vivo, *Centrar* y *Seguir* (la cámara
  acompaña al avión; se desactiva al arrastrar el mapa).
- **Barra inferior:** leyenda de altitudes, créditos y estado de la última actualización.
- **Ajustes:** proveedor de datos, tamaño de flota, velocidad, etiquetas, estela, «solo en vuelo» y
  atajos de cámara (Global, Europa, España, EE. UU., Asia-Pacífico).
- **Atajos:** `/` busca, `Esc` cierra la ficha o limpia la búsqueda.

La paleta de altitudes es la convencional en seguimiento de vuelo: gris en tierra, cian, verde,
amarillo, naranja y rojo a medida que se gana altura.

## Despliegue

El workflow `.github/workflows/deploy.yml` compila y publica en **GitHub Pages** cada `push` a
`main` (o manualmente con *Run workflow* desde cualquier rama). El `base` del build se ajusta
automáticamente a `/FrameFR/` en producción; usa `VITE_BASE_PATH` para otro destino.

Configuración necesaria en el repositorio: **Settings → Pages → Source: GitHub Actions**.

## Créditos

- Cartografía: © [OpenStreetMap](https://www.openstreetmap.org/copyright) · ©
  [CARTO](https://carto.com/attributions).
- Datos ADS-B en directo: [adsb.lol](https://adsb.lol).
- Glifos del mapa: [OpenFreeMap](https://openfreemap.org).

## Hoja de ruta

- [ ] Agrupación (*clustering*) de aeronaves a bajo zoom.
- [ ] Enriquecimiento de ruta (origen/destino) para feeds en directo mediante adsbdb.
- [ ] Filtro por rango de altitud y por aerolínea.
- [ ] Capa de aeropuertos y rutas dibujadas sobre el mapa.
- [ ] Modo de bajo consumo para dispositivos móviles.
