## Reductor de ruido para la radio ATC — 2026-10-20

- El panel **Radio ATC** estrena un selector de limpieza con cuatro niveles:
  **Sin filtrar**, **Suave** (quita el siseo sin tocar el timbre), **Clara**
  (equilibrio recomendado, activo por defecto) y **Máxima** (lo deja más
  seco). El ajuste se guarda en el navegador y se aplica al vuelo, sin cortar
  el audio, incluso con una frecuencia ya sonando.
- La prioridad es **no perder calidad**, así que la cadena no lleva AGC ni
  puerta: no cambia el volumen de la voz ni abre huecos entre sílabas. Hace
  paso alto (retumbe), paso bajo (siseo agudo e imagen del remuestreo) y un
  reductor espectral por bin con decisión dirigida, suelo de atenuación
  (−10/−18/−26 dB) y suavizado en frecuencia y tiempo (subida de 6 ms,
  bajada de 40 ms) para que no haya «ruido musical» ni bombeo.
- El ruido se estima con **estadística de mínimos** sobre ~1,2 s: solo se
  aprende en las pausas, así que mientras hay voz la estimación queda
  congelada. Si no hay pausas, el peor caso es limpiar menos, nunca comerse
  la voz. El arranque se ceba con el primer mínimo para no atenuar la primera
  transmisión.
- Medido con voz sintética y ruido de receptor (SNR 22,8 dB): el ruido de las
  pausas baja **15,5 dB** en *Clara*, la voz conserva su nivel (**−0,11 dB**),
  el timbre varía **0,24 dB** por banda entre 300 y 3400 Hz, el bombeo queda
  en 0,09 dB y no hay recortes. Con SNR 13 dB la voz sigue en −0,2 dB
  (*Suave*), −0,24 dB (*Clara*).
- «Sin filtrar» es un **bypass bit a bit** y la latencia añadida es de 513
  muestras (~10,7 ms a 48 kHz), imperceptible al escuchar.
- `npm run audio-lab` mide reducción en pausas, nivel y timbre de la voz,
  bombeo, ataques, latencia y comportamiento con un heterodino; `npm run
  smoke` comprueba el bypass, la longitud, los recortes y el nivel.

## Fotogrametría 3D gratis con Cesium ion — 2026-10-20

- El visor puede mostrar **terreno y edificios reales en 3D**, como Google
  Earth, sin pagar nada: los Google Photorealistic 3D Tiles se piden a través
  del **plan Community gratuito de Cesium ion**, que **no pide tarjeta ni
  prepago**. Se descartó la vía directa con una clave de Google Maps Platform
  porque exige cuenta de facturación y un prepago de 30 €.
- Se activa desde **Calidad** en el visor o en **Ajustes › Rendimiento ›
  Fotogrametría 3D**, con el campo del token, instrucciones en tres pasos
  (crear cuenta gratis, añadir el asset desde el Asset Depot, crear un token
  `assets:read`) y el estado en vivo. El token se guarda **solo en este
  navegador**, enmascarado, y al guardarlo se aplica al visor ya abierto sin
  cerrarlo. También puede fijarse en el build con `VITE_CESIUM_ION_TOKEN`.
- Plan gratuito: **1.000 peticiones del tileset raíz al mes**; este visor solo
  pide la raíz al abrir y al re-anclar cada 40 km, así que cabe de sobra. Es
  para uso personal/no comercial.
- La capa es **opcional de verdad**: sin token, o si Cesium/Google lo
  rechazan, el visor mantiene el satélite + relieve y lo explica en el propio
  control; los estados son `off`, `nokey`, `loading`, `ready` y `error`.
- `3d-tiles-renderer` va en un **chunk perezoso**: solo se descarga al activar
  la capa y el arranque de la aplicación no paga su coste.
- Densidad (error objetivo 6/12/24 y profundidad máxima 26/20/16) según la
  calidad de malla, re-anclaje a los 40 km de deriva y retirada del suelo
  satelital plano en cuanto llega la primera tesela. Atribución visible
  «Google · Cesium ion» mientras la capa está activa.

## Suelo continuo hasta el horizonte y parche de detalle — 2026-10-20

- El terreno **ya no acaba antes que la vista**: se añade una capa lejana de
  bajo zoom que alcanza el horizonte real (√(2·R·h), ~39 km a 120 m, ~375 km
  en crucero) y se funde con el cielo por niebla. Antes, a baja altitud, el
  suelo terminaba dentro del encuadre y se veía el color de fondo bajo el
  avión.
- **Parche de detalle**: sobre el terreno amplio se dibuja un segundo parche
  dos niveles de zoom más cerca, con su borde difuminado, de modo que la zona
  alrededor del avión gana nitidez sin costuras visibles.
- **Adiós a los huecos negros del terreno**: las teselas se piden con un
  límite de 8 en paralelo, se reintentan dos veces y, si aun así fallan, se
  pinta debajo la capa de bajo zoom (antes un 40 % de teselas caídas dejaba
  agujeros negros y rayas). Se añade además un tono de suelo neutro como
  último recurso, para que nunca se vea el negro del fondo.
- La imagen satelital se dibuja **sin volver a iluminarla**: el sombreado PBR
  apagaba y ensuciaba los colores reales de Esri (ese es el aspecto "mal" que
  se veía en calidad Alta).
- El horizonte ya no muestra una **banda pálida**: el tinte pintado del borde
  lejano se sustituye por niebla progresiva.

## Calidad gráfica seleccionable y rendimiento en equipos modestos — 2026-10-20

- Nueva pestaña **Ajustes › Rendimiento** y control **Calidad** dentro del
  visor 3D (se aplica al instante, sin mover la cámara):
  - **Calidad de la malla** (Alta/Media/Baja): relieve del terreno de 66.049 a
    21.025 y 9.409 vértices, y modelo del avión decimado de forma segura
    (A320 5.229→2.352 triángulos en baja) con las UV y normales preservadas.
  - **Calidad de las texturas** (Alta/Media/Baja): librea de 1024² a 512² y
    256², imágenes del terreno de 256 a 128 y 64 px por tesela y anisotropía
    ajustada (Lambert en baja).
  - **Resolución de renderizado** (Automática/Nativa/×1/×0,75): píxeles del
    visor. La automática mide los FPS y baja el búfer hasta ×0,75 si el
    equipo no mantiene ~30 fps, y lo recupera cuando hay margen.
  - **Calidad del mapa** (Automática/Alta/Equilibrada/Rendimiento): usa
    `setPixelRatio` de MapLibre; en rendimiento el mapa 2D dibuja un píxel
    por píxel CSS en lugar de 3× en pantallas retina.
- **Perfiles rápidos** (Máxima calidad, Equilibrado, Máximo rendimiento) que
  configuran los cuatro ajustes de golpe; todo se recuerda entre sesiones.
- Optimizaciones generales sin quitar funciones:
  - caché LRU de **192 teselas decodificadas** con reutilización entre
    ventanas (al re-centrar se comparten ~80%), tiempo máximo por tesela y
    reutilización inmediata al cambiar de calidad;
  - el DEM se decodifica con muestreo reducido en media/baja (4× menos
    píxeles) manteniendo la misma ventana georreferenciada;
  - el visor **no renderiza ni descarga** con la pestaña oculta;
  - la flota simulada avanza a 20 Hz en vez de una vez por fotograma y el
    giro de rumbo es independiente de los FPS (~3× menos CPU);
  - los ajustes persistentes se sincronizan al instante entre el visor y
    Ajustes (y entre pestañas del navegador).

## Cámara firme, movimiento interpolado y distancia de renderizado ×5 — 2026-10-20

- La cámara del visor 3D **se queda donde la pones**: los refrescos de
  telemetría ya no la recolocan ni la sacuden, el objetivo orbita sobre la
  altitud suavizada y el asentamiento tras arrastrar es independiente de los
  FPS. Un informe de posición que llegue sin `type`/modelo ya no desmonta el
  visor ni devuelve la cámara a la vista por defecto.
- **Movimiento realista del avión** en la vista 3D: entre informes el modelo
  sigue la trayectoria de las posiciones, velocidad, altitud y rumbo
  informados (rumbo por arco más corto, 350°→10° pasa por el norte), y si la
  fuente se retrasa la deriva muerta se frena en segundos en lugar de
  inventar rumbo. El suelo se desliza bajo el avión sin saltos. El mapa
  continúa dibujando únicamente posiciones informadas.
- Nueva **Distancia de renderizado ×1–×5** en el propio visor (×1 por
  defecto, preferencia recordada): ×5 muestra cinco veces más terreno hasta
  el horizonte descargando como mucho 100 teselas.

## Horizonte continuo y el doble de distancia en la Vista 3D — 2026-10-20

- Eliminada la **línea vertical amarilla** que bajaba del avión al suelo: la
  vista queda limpia, como las vistas 3D de referencia.
- La distancia de visión del suelo **se duplica**: ~160 km en crucero, 80 km
  en ascenso, 40 km en aproximación y 20 km cerca del suelo (a latitud media,
  ~120/60/30/15 km).
- El borde del parche de suelo ya **no se corta contra el cielo**: la textura
  se funde con el horizonte en su periferia y la niebla completa la
  transición, desde cualquier ángulo de cámara.
- El relieve DEM queda **georreferenciado con exactitud** (el bloque de
  teselas Terrarium cubre la misma ventana que el satélite; antes el relieve
  aparecía estirado).
- El suelo se re-centra con menos frecuencia —el umbral crece con el tamaño de
  la ventana—, así que el crucero descarga menos teselas.

## Vista 3D sobre el mapa real a pantalla completa — 2026-10-19

- La _Vista 3D_ ahora ocupa **toda la pantalla**, como las vistas 3D de
  referencia: el avión en primer plano, el terreno real debajo y el horizonte
  al fondo.
- El suelo ya no es una retícula oscura: se componen **imágenes satelitales**
  (Esri World Imagery, con respaldo de OpenStreetMap) alrededor de la posición
  real del avión, con **relieve de terreno** del DEM público de Terrarium
  (AWS/Mapzen), cielo degradado y niebla en el horizonte. La atribución de las
  fuentes aparece en la propia vista.
- La ventana de suelo cubre ~80 km en crucero, 40 km en aproximación y 20 km
  cerca del suelo, y se re-centra automáticamente según el avión avanza: el
  mapa se desliza bajo el avión durante el vuelo.
- La cámara inicial se coloca en **persecución detrás del avión**; arrastrar
  orbita, la rueda acerca y `Esc` sigue cerrando la vista.
- La retícula procedural solo aparece como último respaldo si no se puede
  descargar ninguna tesela.

## Vista 3D de aviones con modelos a escala 1:1 — 2026-10-19

- Nueva **Vista 3D** en la ficha de la aeronave para las familias compatibles
  **A320, A350, A380, B737 y B787** (incluye designadores ICAO asociados:
  A318/A319/A321/A19N/A20N/A21N, A359/A35K, A388, B733-B739/B38M…, B788/B789).
- Modelos GLB organizados en `src/assets/models/aircraft/` y normalizados en
  tiempo de ejecución a la **longitud real** del avión: escala 1:1 garantizada
  (37,6 m / 66,8 m / 72,7 m / 39,5 m / 56,7 m según familia).
- El modelo se coloca a su **altitud real sobre el plano del mapa** (en tierra,
  con las ruedas apoyadas) con retícula kilométrica deslizante, marca de norte
  y HUD con altitud en m/ft, rumbo, velocidad y escala.
- **Cámara orbital:** arrastra para orbitar alrededor del avión, rueda para
  acercar, `Esc` para cerrar. El rumbo del modelo sigue el rumbo informado en
  tiempo real.
- Three.js y los GLB se cargan solo al abrir el visor (chunk diferido de
  ~640 kB); la vista3D del mapa con inclinación sigue disponible y se llama
  _Inclinación_ en la ficha.
- Nuevo `scripts/glb-inspect.mjs` (análisis de ejes/escala de modelos) y página
  de desarrollo `model-check.html` que renderiza los cinco modelos.
- La tabla de tráfico ya no muestra rumbos con decimales crudos.

## Ajustes por secciones, segundo plano y brújula — 2026-10-19

- Tamaños de interfaz ×0.9 / ×1 / ×1.25; las preferencias antiguas ×0.5 y ×2
  migran automáticamente al extremo equivalente.
- Ajustes dividido en **General**, **Interfaz** y **Telemetría**. Se retiran
  de Ajustes el modo limpio y la configuración de aeropuertos/carpetas porque
  ya están en las barras inferior y superior.
- Nueva opción persistente **Actualizaciones en segundo plano** en General:
  un worker sigue sondeando e incorporando informes reales mientras la
  pestaña permanece abierta pero oculta; puede desactivarse en equipos poco
  potentes. Las estelas separan huecos largos en lugar de unirlos con una
  recta no observada.
- Créditos fotográficos sin emoji y sin avisos «Volando a…» al mover la cámara.
- La navegación 3D manual usa el botón central/rueda mantenido y el
  movimiento del ratón; se desactiva la rotación con botón derecho.
- Brújula pequeña y ocultable desde Interfaz; al pulsarla restablece el norte
  por el giro más corto sin cambiar centro, zoom ni inclinación.

## Seguimiento sin zoom forzado, meteorología estable y capas del mapa — 2026-10-19

- Eliminado por completo el zoom de seguimiento; seguir o centrar conserva
  el zoom elegido con la rueda, el gesto táctil o el doble clic.
- Los aviones se dibujan solo en coordenadas informadas: sin interpolación,
  extrapolación ni sobreimpulso. Se descartan informes antiguos, no se
  reenvía geometría idéntica y una actualización lenta de MapLibre ya no
  puede reponer posiciones obsoletas.
- Meteorología por sectores estables con histéresis y caché: una petición
  Open-Meteo alimenta las cuatro capas, mientras una capa válida permanece
  visible durante actualizaciones y reintentos.
- Mapa base con interruptores persistentes para iconos de lugares, nombres
  y fronteras, reaplicados al cambiar de estilo.

## Correcciones de mapa, meteorología y escala — 2026-10-19

- Los aviones sobreviven a un cambio de estilo: la fuente de repuesto recibe
  datos de inmediato y cada recarga de estilo repone la capa de tráfico.
- Accesos rápidos de aeropuertos de vuelta en la cabecera.
- Ocultar UI oculta realmente toda la interfaz; se recupera con U.
- Capas meteorológicas continuas: rejilla 7×7 de Open-Meteo interpolada en
  un raster georreferenciado en lugar de bloques de color; la interpolación
  no añade precisión observacional.
- El selector Mapa de la barra inferior incluye los seis estilos.
- Nuevo ajuste de tamaño de interfaz ×0.5 / ×1 / ×2, persistente y con
  diseño adaptable al ancho escalado.

## Reorganización de interfaz — 2026-10-19

- Cabecera con buscador amplio, acciones de tráfico y ajustes; aeropuertos en
  una fila independiente y desplazable en móvil.
- Barra inferior centrada: mapa, meteorología, etiquetas, 3D, ubicación y
  modo limpio, con tamaños y estados consistentes.
- Paneles de mapa y meteorología con selección visual, exclusión mutua,
  cierre exterior/Escape, gestión de foco y atributos accesibles.
- Telemetría compacta separada de las herramientas y paneles de vuelos
  reposicionados para respetar las nuevas barras.
- Diseño adaptable desde 320 px y botón táctil para recuperar la interfaz.
- Pruebas de regresión de interacción incorporadas al render check.

## Corrección del worker de MapLibre

- Empaquetado explícito del worker de MapLibre 6 y sus dependencias con Vite.
- URL con hash y ruta base de Pages, configurada antes de crear el mapa.
- Comprobación del artefacto del worker en cada build para evitar regresiones
  que el test de interfaz con MapLibre simulado no puede detectar.

## 0.2.0 — 2026-10-19

- Integración modular de meteorología del HTML AeroScope: radar RainViewer y
  cuadrícula Open-Meteo, con procedencia y limitaciones visibles.
- Cancelación, debounce, caché acotada, timeout y limpieza de capas meteorológicas.
- Corrección de inclinación 3D después de cambiar la cartografía.
- Recuperación de errores de interfaz y aviso sin JavaScript.
- Pruebas meteorológicas y publicación directa desde la rama de entrega,
  con pruebas obligatorias antes del despliegue de GitHub Pages.

# Changelog

Todas las novedades de AeroScope se documentan aquí. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[versionado semántico](https://semver.org/lang/es/).

## [No publicado]

### Añadido

- Capa de datos multi-red: el proveedor `auto` consulta en paralelo
  adsb.lol, ADSB.one, adsb.fi, airplanes.live, el feed global de
  Flightradar24 (JSONP) y OpenSky, y fusiona los resultados de-duplicando
  por dirección ICAO 24 bits.
- Búsqueda planetaria: el buscador entiende indicativos IATA (`LH419`),
  ICAO (`DLH419`), modelos (`A340`, `Airbus A340-600`), aerolíneas
  (`Lufthansa`), matrículas (`G-XWBA`) y direcciones hexadecimales, y vuela
  hasta la aeronave encontrada.
- Siluetas de aeronave por familia real (cuatrimotor pesado, fuselaje ancho,
  fuselaje estrecho, jet business, turbopropulsor, avión ligero, helicóptero
  y caza) dibujadas en canvas, con tres estados: en vuelo, seleccionado y en
  tierra.
- Ficha de aeronave con fotografía real (Planespotters, JetPhotos y Wikimedia
  Commons), perfil de altitud, estela histórica y zoom de seguimiento
  configurable.
- Accesos directos a aeropuertos con carpetas, hasta ocho ranuras, persistidos
  en el navegador.
- Búsqueda global, reloj UTC, contador de aeronaves, tabla de tráfico
  ordenable, modo limpio con la tecla `U` y panel de ajustes con visibilidad
  de la interfaz.

### Cambiado

- El nombre del producto pasa de _FrameFR_ a **AeroScope**.
- La interfaz adopta el lenguaje visual de AeroScope: ámbar sobre carbón,
  paneles mate y tipografía monoespaciada para las cifras.
- `FleetController` acepta ahora un límite de aeronaves, una cadencia de
  sondeo propia y una estela externa (histórica).
- Los proveedores viven en un contrato único (`AircraftProvider`) y el motor
  se ocupa de la interpolación, la estela y el filtrado.

### Corregido

- El resolutor de siluetas ya no confunde `C172` (Cessna 172) con el
  `C17` (Boeing C-17 Globemaster) ni trata `B77W` como si fuera `B77` + dígito.
- El vector de estado de OpenSky se interpreta con los índices oficiales
  (longitud en 3, latitud en 4, altura en metros).
- Los errores del feed dejan de vaciar la lista de tráfico: las aeronaves que
  ya no aparecen se retiran con margen de gracia en lugar de desaparecer de
  golpe.
