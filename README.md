<div align="center">

# ✈️ AeroScope

**Radar ADS-B en tiempo real sobre un mapa interactivo**

[![CI](https://github.com/acastejongames/FrameFR/actions/workflows/ci.yml/badge.svg)](https://github.com/acastejongames/FrameFR/actions/workflows/ci.yml)
[![Deploy](https://github.com/acastejongames/FrameFR/actions/workflows/deploy.yml/badge.svg)](https://github.com/acastejongames/FrameFR/actions/workflows/deploy.yml)
[![CodeQL](https://github.com/acastejongames/FrameFR/actions/workflows/codeql.yml/badge.svg)](https://github.com/acastejongames/FrameFR/actions/workflows/codeql.yml)
[![Licencia](https://img.shields.io/badge/licencia-MIT-ffbe00.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-22%2B-5eead4.svg)](https://nodejs.org)

[▶️ Demo en vivo](https://acastejongames.github.io/FrameFR/)

</div>

---

## Qué es

AeroScope dibuja el tráfico aéreo **real** sobre la cartografía de
[OpenFreeMap](https://openfreemap.org): cada aeronave aparece con su rumbo
verdadero, con la silueta que le corresponde según su tipo ICAO y con su
etiqueta de vuelo. Puedes seleccionarla para ver su ficha completa, seguirla
con la cámara, buscar **cualquier vuelo del planeta** y saltar a cualquier
aeropuerto.

No es una simulación: cuando eliges una red ADS-B real, las posiciones que se
mueven en el mapa son las que los receptores están leyendo del cielo.

<table>
<tr>
<td width="50%"><b>Búsqueda planetaria</b><br/><sub>Indicativos IATA e ICAO, modelos, aerolíneas, matrículas y direcciones hexadecimales.</sub></td>
<td width="50%"><b>Siluetas reales</b><br/><sub>Ocho familias de aeronave dibujadas en canvas, con estado en vuelo, seleccionado y en tierra.</sub></td>
</tr>
<tr>
<td><b>Ficha con fotografía</b><br/><sub>Foto de la aeronave y perfil de altitud de la trajectory.</sub></td>
<td><b>Multired</b><br/><sub>Seis fuentes interrogadas en paralelo y fusionadas por dirección ICAO.</sub></td>
</tr>
</table>

## 🚀 Puesta en marcha

```bash
git clone https://github.com/acastejongames/FrameFR.git
cd FrameFR
npm ci
npm run dev          # http://localhost:5173
```

| Script                | Descripción                                                |
| --------------------- | ---------------------------------------------------------- |
| `npm run dev`         | Servidor de desarrollo con recarga en caliente              |
| `npm run build`       | Comprueba los tipos, genera `dist/` y el `404.html`          |
| `npm run preview`     | Sirve `dist/` tal y como quedará en producción              |
| `npm run typecheck`   | Sólo comprobación de tipos                                  |
| `npm run smoke`       | Pruebas headless de la capa de datos (sin navegador)         |
| `npm run check:render`| Monta la interfaz en `jsdom` y comprueba que se pinta        |

Requiere **Node 20.19+** (probado con Node 22, ver [`.nvmrc`](.nvmrc)).

### Variables de entorno

Copia `.env.example` como `.env`. Todas son opcionales:

| Variable             | Por defecto               | Para qué sirve                                          |
| -------------------- | ------------------------- | ------------------------------------------------------- |
| `VITE_ADSB_PROVIDER` | `auto`                    | Proveedor inicial (`auto`, `fr24`, `adsblol`, `demo`…)   |
| `VITE_FLEET_SIZE`    | `600`                     | Tamaño de la flota simulada (sólo `demo`)                |
| `VITE_GLYPHS_URL`    | glifos de OpenFreeMap     | Tipografía de las etiquetas del mapa                     |
| `VITE_BASE_PATH`     | `/<repo>/` en producción  | Ruta base del build                                      |
| `VITE_CESIUM_ION_TOKEN` | vacío                  | Token gratuito de Cesium ion para la fotogrametría 3D     |

## 📡 Fuentes de datos

El proveedor `auto` interroga **en paralelo** todas las redes disponibles y
fusiona las respuestas de-duplicando por dirección ICAO 24 bits, de modo que
una nube en Europa no deja el resto del planeta a ciegas.

| Proveedor      | Cobertura            | Aporta                              | Transporte |
| -------------- | -------------------- | ----------------------------------- | ---------- |
| `auto`         | Global               | Fusión de todas las de abajo        | mixto      |
| `fr24`         | Global               | Ruta, matrícula y nº de vuelo       | JSONP      |
| `adsblol`      | Europa / Norteamérica | Posición y telemetría               | CORS       |
| `adsbone`      | Europa / Norteamérica | Posición y telemetría               | CORS       |
| `adsbfi`       | Norte de Europa       | Posición y telemetría               | CORS       |
| `airplaneslive`| Internacional          | Posición y telemetría               | CORS       |
| `opensky`      | Global (parcial)     | Referencia de la red abierta        | CORS       |
| `demo`         | —                    | Flota simulada, funciona sin red    | —          |

El feed de Flightradar24 no envía cabeceras CORS, por eso se lee con **JSONP**
(`src/data/providers/jsonp.ts`). El resto se consulta con `fetch`.

### Enriquecimiento

Los feeds públicos dan la posición pero no siempre el resto. AeroScope lo
completa con:

- **Aerolínea y número de vuelo** a partir del indicativo ICAO
  (`DLH419` → *Lufthansa*, `LH419`).
- **Modelo de aeronave** a partir del designador de tipo (`A346` →
  *Airbus A340-600*).
- **Silueta** según la familia del tipo (cuatrimotor pesado, fuselaje ancho,
  fuselaje estrecho, jet business, turbopropulsor, avión ligero, helicóptero
  o caza).
- **Fotografía** del avión en [Planespotters](https://www.planespotters.net),
  JetPhotos o [Wikimedia Commons](https://commons.wikimedia.org).
- **Trayectoria histórica** de la izquierda, vía el handler de detalle de
  Flightradar24 o el histórico de OpenSky.

## 🗺️ Interfaz

- **Barra superior:** marca, buscador global (`/` para enfocarlo), accesos a
  aeropuertos, reloj UTC, contador de aeronaves y ajustes.
- **Panel izquierdo:** ficha de la aeronave seleccionada — fotografía, modelo,
  ruta, altitud, velocidad, régimen, perfil de altitud, estela y acciones
  *Seguir* / *Inclinación* / *Vista 3D* / *Limpiar estela*.
- **Vista 3D del avión:** para aeronaves compatibles (familias **A320, A350,
  A380, B737 y B787**) el botón *Vista 3D* abre un visor orbital a pantalla
  completa con el modelo a **escala 1:1** (longitud real: 37,6 m / 66,8 m /
  72,7 m / 39,5 m / 56,7 m). Debajo se dibuja **el mapa real** sobre la posición
  del avión —imágenes satelitales de Esri con relieve de terreno (Terrarium) y
  respaldo de OpenStreetMap— con cielo y horizonte; el avión vuela a su
  **altitud real** y rumbo informado. La cámara arranca en persecución detrás
  del avión y **se queda donde la dejes** (arrastra para **orbitar**, rueda
  para acercar, `Esc` cierra). El modelo se mueve **interpolando las
  posiciones, velocidad, altitud y rumbo informados** entre partes, sin
  saltos; el suelo se desliza bajo el avión con la misma suavidad. La ventana
  de suelo alcanza ~160 km de visión en crucero (menos según baja la altitud),
  ampliable hasta **×5 con la distancia de renderizado** del propio visor; su
  borde se funde con el cielo en el horizonte y se re-centra según el avión
  avanza y su altitud. Sobre ese terreno amplio se dibuja un **parche de
  detalle** dos niveles de zoom más cerca (con el borde difuminado) y debajo
  una **capa lejana que llega al horizonte real**, así que el suelo nunca
  termina dentro del encuadre ni deja huecos aunque el servidor de teselas
  limite peticiones. El botón **Calidad** del propio visor permite cambiar
  al vuelo la malla, las texturas y la resolución de renderizado sin mover la
  cámara.
- **Fotogrametría 3D gratis (Google 3D Tiles vía Cesium ion):** en
  *Calidad* del visor o en **Ajustes › Rendimiento › Fotogrametría 3D** se
  puede activar una capa con el terreno y los edificios reales en 3D, como en
  Google Earth. Los mismos datos que usa Google Earth se sirven a través del
  **plan Community gratuito de Cesium ion**, que **no pide tarjeta ni
  prepago**: solo una cuenta gratuita y un *access token* (`assets:read`) que
  se pega en los ajustes (o se define en el build con
  `VITE_CESIUM_ION_TOKEN`) y **solo se guarda en este navegador**. El plan
  gratuito incluye 1.000 peticiones del tileset raíz al mes y este visor solo
  pide la raíz al abrir la vista y al alejarse 40 km del anclaje, así que cabe
  de sobra; su licencia es para uso personal/no comercial. Sin token, o si
  Cesium o Google lo rechazan, el visor mantiene el satélite + relieve y lo
  explica en el propio control: la capa es siempre opcional y nunca rompe la
  vista. El renderizador de teselas se carga en un chunk aparte al activarla,
  la densidad (error objetivo y profundidad máxima) acompaña a la calidad de
  malla elegida y, en cuanto llega la primera tesela, el suelo satelital plano
  se oculta para no competir con la geometría real.
- **Panel derecho:** tabla del tráfico del sector visible, ordenable por
  altitud, velocidad o indicativo.
- **Barra inferior:** leyenda de estados, estilo cartográfico, etiquetas,
  inclinación 3D, modo limpio y geolocalización. La pequeña brújula independiente
  restablece el norte al pulsarla sin cambiar centro, zoom ni inclinación.
- **Navegación 3D manual:** mantén pulsado el botón central/rueda del ratón y
  mueve el puntero para girar e inclinar; el botón derecho ya no rota el mapa.
- **Radio ATC solo audio:** el dock conecta directamente con el WebSocket de OpenWebRX+ y decodifica el audio AM en el navegador, sin insertar su interfaz ni el waterfall. Comprueba que la frecuencia esté dentro del perfil SDR antes de iniciar DSP. SDR Alaró publica antenas de 144–430 MHz, por lo que su cobertura ATC en 118–136.975 MHz no está garantizada; véase la [ficha del receptor](https://sdr.alaro.ovh/) y el [manual de OpenWebRX+](https://fms.komkon.org/OWRX/).
- **Ajustes:** cuatro pestañas —**General** (actualizaciones en segundo plano,
  límite de aeronaves y orden), **Interfaz** (tamaño ×0.9/×1/×1.25, elementos
  visibles incluida la brújula, etiquetas y estilo), **Telemetría** (proveedor
  y frecuencia ADS-B) y **Rendimiento** (calidad de malla y texturas del visor
  3D, resolución de renderizado automática o fija, calidad del mapa 2D,
  perfiles rápidos para equipos modestos y el token de la fotogrametría 3D).
- **Atajos:** `/` busca · `U` modo limpio · `Esc` cierra.

Todo se guarda en el navegador: al recargar recuperas el proveedor, la
frecuencia, los accesos de aeropuertos, el tamaño de la interfaz, si la
telemetría continúa mientras la pestaña abierta está oculta y el token de la
fotogrametría (que nunca sale de tu equipo).

## 🏗️ Arquitectura

```
src/
├─ data/                     # Capa de datos (independiente de la UI y del mapa)
│  ├─ types.ts               #    Aircraft, AircraftProvider, Viewport…
│  ├─ geo.ts                 #    Ortodromia, rumbos, recuadros
│  ├─ airports.ts            #    Catálogo de aeropuertos reales
│  ├─ airportDirectory.ts    #    Directorio de accesos rápidos
│  ├─ airlines.ts            #    Operadores, tipos y regiones
│  ├─ airlineCodes.ts        #    ICAO → IATA + nombre de aerolínea
│  ├─ aircraftTypes.ts       #    Tipos de aeronave y familias de silueta
│  ├─ aircraft3d.ts          #    Registro de modelos 3D y escala 1:1
│  ├─ mapTiles.ts            #    Teselas satelitales y relieve del visor 3D
│  ├─ photogrammetry.ts      #    Fotogrametría vía Cesium ion (chunk diferido)
│  ├─ photogrammetrySettings.ts # Token y estado de la capa (sin three.js)
│  ├─ category.ts            #    Clasificación comercial / carga / GA / militar
│  ├─ hubs.ts                #    Accesos a aeropuertos (persistencia)
│  ├─ globalSearch.ts        #    Búsqueda planetaria
│  ├─ photos.ts              #    Resolvedor de fotografías
│  ├─ flightTrail.ts         #    Trayectoria histórica
│  ├─ registry.ts            #    Catálogo de proveedores + factoría
│  └─ providers/
│     ├─ demoProvider.ts     #    Flota simulada (rutas reales, perfiles de vuelo)
│     ├─ adsbV2Provider.ts   #    Formato "v2" (adsb.lol, ADSB.one, adsb.fi…)
│     ├─ adsbLolProvider.ts  #    adsb.lol
│     ├─ fr24ZoneProvider.ts #    Feed global de Flightradar24 (JSONP)
│     ├─ openSkyProvider.ts  #    OpenSky Network
│     ├─ autoProvider.ts     #    Carrera multi-red y fusión
│     └─ jsonp.ts            #    Transporte JSONP
├─ engine/
│  ├─ fleetController.ts     # Informes exactos, renderizado y publicación
│  ├─ backgroundTicker.ts    # Latido para pestañas ocultas (con fallback)
│  └─ backgroundTicker.worker.ts # Worker del latido en segundo plano
├─ map/
│  ├─ style.ts               #    Estilos y elementos del mapa base
│  ├─ silhouettes.ts         #    Siluetas dibujadas en canvas
│  ├─ aircraftIcons.ts       #    Selección de sprite por aeronave
│  ├─ aircraftLayers.ts      #    Fuentes y capas de MapLibre
│  └─ palette.ts             #    Colores y bandas de altitud
├─ components/               # UI: barra, ficha, tabla, ajustes, leyenda…
│  ├─ TopBar.tsx            #    Marca, búsqueda, selector de proveedor
│  ├─ AirportHubs.tsx       #    Accesos rápidos a aeropuertos
│  ├─ HubsManager.tsx       #    Editor de accesos y carpetas
│  └─ Aircraft3DViewer.tsx  #    Visor orbital 3D (chunk diferido con Three.js)
├─ assets/models/aircraft/  # Modelos GLB: A320, A350, A380, B737, B787
├─ hooks/                    # Puente entre el controlador y React
├─ lib/                      # Formateadores y almacenamiento local
└─ config.ts                 # Constantes y valores por defecto
```

### Capa de datos modular

Todo gira en torno a un contrato mínimo (`src/data/types.ts`):

```ts
interface AircraftProvider {
  readonly id: string
  readonly label: string
  readonly mode: 'simulated' | 'live'
  readonly pollIntervalMs: number
  readonly notice?: string                 // aviso mostrado en la barra de estado
  readonly activeSource?: string           // red que respondió (modo «auto»)
  advance?(deltaMs: number): void          // sólo simuladores
  poll(viewport: Viewport, signal?: AbortSignal): Promise<Aircraft[]>
  dispose?(): void
}
```

El proveedor sólo responde a *«¿qué ves ahora?»*. Del resto se encarga el
motor:

1. **`FleetController`** conserva por aeronave la observación aceptada más
   reciente según su marca temporal.
2. No interpola ni extrapola coordenadas: el icono permanece en la última
   posición informada hasta que llega otro informe.
3. Solo empuja GeoJSON a MapLibre cuando cambia un informe (descartando
   instantáneas intermedias obsoletas) y publica en React unas dos veces por
   segundo.
4. Si **Actualizaciones en segundo plano** está activado, un worker mantiene
   el sondeo cuando la pestaña sigue abierta pero oculta/minimizada. Ingiere
   los informes y la estela del avión seleccionado sin dibujar ni publicar en
   React hasta volver; al desactivarlo se pausa para ahorrar recursos.

**Añadir otro proveedor** consiste en crear una clase que implemente
`AircraftProvider` y registrarla en `src/data/registry.ts`. Ni el motor ni la
interfaz necesitan cambios.

### Rendimiento

- Un único bucle visible (`requestAnimationFrame`), aislado de React; el
  worker de segundo plano solo recoge datos y no renderiza la interfaz oculta.
- La tabla de tráfico renderiza como máximo 120 filas.
- La estela se calcula únicamente para la aeronave seleccionada. Un hueco de
  informes superior a dos minutos se dibuja como segmentos separados, no como
  una recta inventada.
- Los sprites se generan en canvas: 24 iconos (8 familias × 3 estados) por
  menos de 4 KB de bundle.
- Three.js, los modelos GLB y las teselas del terreno solo se descargan al
  abrir la *Vista 3D* (chunk `Aircraft3DViewer` diferido). El suelo compone
  una ventana de teselas satelitales (~20–160 km de lado según altitud, ×5 con
  la distancia de renderizado) más el relieve del DEM público de Terrarium, y
  se re-centra solo cuando el avión se aleja lo bastante del centro del
  parche. El modelo se normaliza en tiempo de ejecución
  a la longitud real de su variante: escala 1:1 garantizada aunque cada GLB
  venga en unidades distintas. La página de desarrollo `model-check.html`
  renderiza los cinco modelos con el registro real.
- **Calidad gráfica seleccionable** (Ajustes › Rendimiento y botón *Calidad*
  del visor). En el visor 3D la malla del terreno pasa de 256² a 144²/96²
  vértices y el modelo se decima con meshoptimizer conservando UV y normales;
  las texturas bajan de 1024² a 512²/256² y el terreno compone a 256/128/64 px
  por tesela. La resolución de renderizado automática mide los FPS y ajusta el
  búfer entre ×0,75 y el máximo del equipo, y la calidad del mapa usa
  `setPixelRatio` de MapLibre (en *Rendimiento* dibuja 1 píxel por píxel CSS
  en lugar de hasta 3× en móviles). Ningún ajuste desactiva funciones.
- Las teselas del terreno se guardan en una **caché LRU de 192 imágenes**:
  al re-centrar la ventana se reutiliza la mayoría y solo se descargan las
  nuevas; una tesela que no responde en 8 s no bloquea el parche. Las
  peticiones se limitan a 8 en paralelo, se reintentan dos veces y siempre
  se pinta antes una capa de bajo zoom, de modo que un servidor que limita
  peticiones produce una imagen suave, nunca agujeros negros.
- El relieve DEM se decodifica con muestreo reducido en las calidades media y
  baja (4× menos píxeles) y el visor suspende render y descargas con la
  pestaña oculta.
- La **fotogrametría 3D** es opcional y perezosa: `3d-tiles-renderer` y sus
  plugins viven en un chunk propio que solo se descarga al activar la capa,
  nunca al abrir la aplicación (el chunk principal no crece). Con la capa
  apagada —el valor por defecto— el visor usa exactamente el suelo satelital de
  siempre.
- La flota simulada avanza a 20 Hz en lugar de una vez por fotograma, con
  giro de rumbo independiente de los FPS: ~3× menos CPU en el modo demo.
- Probado para una resolución de referencia de 2560 × 1440.

## Meteorología y alcance de la migración

La base React existente sustituye los scripts globales, Tailwind por CDN y los
manejadores inline del HTML aportado. Se conservan radar ADS-B, búsqueda,
fichas, estelas, tabla, aeropuertos, preferencias, vista 3D y modo limpio.

El panel **Meteorología** añade:

- Radar de lluvia observado de RainViewer, con hora UTC del fotograma.
- Viento, temperatura, precipitación y códigos WMO de Open-Meteo.
- Sectores geográficos estables con una rejilla de modelo 11×9: **no es un
  mapa de alta resolución** y el degradado no añade precisión.
- Una petición obtiene las cuatro variables del sector. Cambiar de capa,
  hacer zoom dentro del sector o cambiar de estilo no vuelve a pedir datos.
- Caché LRU de sectores, última capa válida durante reintentos con backoff,
  debounce tras mover el mapa y pausa con la pestaña oculta.
- Capas por debajo de las aeronaves, reconstruidas al cambiar de cartografía.

Diferencias deliberadas respecto al HTML: no se reproducen las partículas de
viento ni el suavizado que aparentaba mayor precisión. No se inventa una
densidad de rayos a partir de precipitación/CAPE: tormentas muestra códigos
WMO ≥ 95. No se incluye la integración opcional de OpenWeather con clave.
Los valores ausentes no se convierten en cero ni en temperaturas de relleno.

RainViewer y Open-Meteo son servicios externos sujetos a cobertura, CORS,
cuotas y condiciones de uso; no se garantiza disponibilidad. Las teselas de
radar pueden faltar aunque se hayan recibido los metadatos. Open-Meteo ofrece
datos de modelo, no observaciones locales. Revisa sus planes para uso comercial.
**No usar esta aplicación para navegación ni decisiones de seguridad aérea.**

## ✅ Calidad

| Control                    | Qué garantiza                                        |
| -------------------------- | ----------------------------------------------------- |
| `npm run check`           | Tipos, pruebas y build en un único comando             |
| `tsc` en modo estricto     | Tipado total, sin `any` implícitos                     |
| `npm run smoke`            | Normalizadores de los feeds, geodesia, búsqueda, siluetas |
| `npm run check:render`     | La interfaz se monta sin errores en un DOM headless    |
| CodeQL                     | Análisis estático de seguridad                         |
| Dependabot                 | Dependencias y acciones al día                         |

## 🚀 Despliegue

El workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
compila y publica en **GitHub Pages** cada `push` a `main` (o manualmente con
*Run workflow*). La ruta base del build se ajusta automáticamente al nombre
del repositorio.

**Publicación directa sin PR:** esta entrega se publica desde
`arena/2444ad91-framefr`, también incluida en el disparador del workflow.
`main` no se modifica. En Settings → Pages la fuente debe ser **GitHub Actions**;
el entorno `github-pages` debe permitir la rama que se despliega.
El workflow ejecuta pruebas de datos, montaje de interfaz y compilación antes
de subir el artefacto; solo el job de despliegue publica en Pages.

Para volver a publicar esta entrega: haz push a esa rama, o ejecuta
`gh workflow run deploy.yml --ref arena/2444ad91-framefr`.

Cuando esté activo, la app queda en:

```
https://acastejongames.github.io/FrameFR/
```

> Si prefieres otro hosting (Netlify, Cloudflare Pages, Vercel…), basta con
> `npm run build` y publicar `dist/` como sitio estático. Para servirlo desde
> la raíz de un dominio, define `VITE_BASE_PATH=/`.

## 📄 Créditos

- Cartografía: [OpenFreeMap](https://openfreemap.org) · [OpenMapTiles](https://www.openmaptiles.org/) ·
  © [OpenStreetMap](https://www.openstreetmap.org/copyright).
- Datos ADS-B: [adsb.lol](https://adsb.lol) · [ADSB.one](https://www.adsb.one) ·
  [adsb.fi](https://adsb.fi) · [airplanes.live](https://airplanes.live) ·
  [Flightradar24](https://www.flightradar24.com) · [OpenSky Network](https://opensky-network.org).
- Fotogrametría 3D: [Google Photorealistic 3D Tiles](https://cesium.com/platform/cesium-ion/) servidos vía [Cesium ion, asset 2275207](https://ion.cesium.com/assets/2275207/).
- Fotografías: [Planespotters](https://www.planespotters.net) · JetPhotos ·
  [Wikimedia Commons](https://commons.wikimedia.org).
- Iconos: [Lucide](https://lucide.dev) · [MapLibre GL](https://maplibre.org) ·
  [Tailwind CSS](https://tailwindcss.com).

> Los datos ADS-B son públicos y gratuitos, pero **no** son un producto
> contractual: su disponibilidad cambia según la red de receptores. Usa
> AeroScope con criterio y no para fines que puedan poner en riesgo la
> seguridad del vuelo.

## 📄 Licencia

[MIT](LICENSE) © FrameFR contributors.
