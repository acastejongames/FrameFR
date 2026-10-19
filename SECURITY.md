# Seguridad

## Versiones soportadas

| Versión | Soportada |
| -------- | --------- |
| `main`   | ✅        |

AeroScope es una aplicación estática: todo el código se ejecuta en el
navegador y no hay backend, ni base de datos, ni credenciales de servidor.

## Qué reportar

Si descubres una vulnerabilidad, **no abras una incidencia pública**. Usa la
vulnerabilidad privada de GitHub:

1. **Security → Report a vulnerability** en
   <https://github.com/acastejongames/FrameFR/security/advisories/new>
2. Describe el impacto, los pasos para reproducirlo y la versión afectada.
3. Te responderemos en un plazo razonable y publicaremos el aviso junto con
   la corrección.

## Superficie de ataque conocida

- **Servicios de terceros**: la app contacta con feeds ADS-B públicos
  (adsb.lol, ADSB.one, adsb.fi, airplanes.live, Flightradar24, OpenSky), con
  Wikidata Commons, Planespotters y proxies CORS públicos. Ninguno de ellos
  recibe datos personales, pero conviene saber que se comparten las IP de
  quien navega.
- **Almacenamiento local**: las preferencias (proveedor, intervalo, accesos de
  aeropuertos) se guardan en `localStorage` bajo el prefijo `aeroscope:`. No
  contiene datos personales.
- **Content Security Policy**: la app necesita `connect-src` amplio (los feeds)
  y `script-src` para los JSONP. No hay `eval` ni scripts de terceros embebidos
  más allá del CDN de fuentes y del propio bundle.

## Buenas prácticas

- No introduces claves de API en el repositorio: usa siempre variables de
  entorno `VITE_*` y `.env.example`.
- No añadas `dangerouslySetInnerHTML` con datos de los feeds: todo el HTML
  generado se escapa por defecto en React.
