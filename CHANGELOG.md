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

- El nombre del producto pasa de *FrameFR* a **AeroScope**.
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
