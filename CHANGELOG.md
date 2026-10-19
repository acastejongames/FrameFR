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
