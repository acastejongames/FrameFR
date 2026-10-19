# Cómo contribuir

¡Gracias por querer mejorar AeroScope! Este documento explica cómo preparar,
validar y enviar una contribución.

## Entorno de desarrollo

```bash
git clone https://github.com/acastejongames/FrameFR.git
cd FrameFR
npm install
npm run dev          # http://localhost:5173
```

Requiere **Node 20.19+** (probado con Node 22; la versión exacta está en
[`.nvmrc`](.nvmrc)).

## Scripts

| Script              | Qué hace                                                     |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | Servidor de desarrollo con recarga en caliente               |
| `npm run typecheck` | Comprobación de tipos con `tsc` en modo estricto             |
| `npm run smoke`     | Pruebas headless de la capa de datos (sin navegador)         |
| `npm run check:render` | Monta la interfaz en `jsdom` y comprueba que se pinta     |
| `npm run build`     | Build de producción + `404.html` de fallback                 |
| `npm run preview`   | Sirve `dist/` tal y como quedará en producción               |

`npm run smoke` y `npm run check:render` son los dos controles que la CI
ejecuta en cada push: **ambos deben pasar antes de abrir un PR**.

## Convenciones de código

- **Tipado estricto**: no se introduce `any` sin un motivo documentado.
- **Comentarios en español**, explicando *por qué* y no *qué*.
- Cada módulo de la capa de datos expone funciones puras y testeables.
- Sin dependencias nuevas salvo que aporte valor claro: el bundle ya pesa lo
  suficiente con MapLibre.

## Añadir un proveedor de datos

1. Crea `src/data/providers/nuevoProvider.ts` implementando `AircraftProvider`.
2. Añade su `id` a `ProviderId` y su entrada a `PROVIDERS` en
   `src/data/registry.ts`.
3. Añade el caso correspondiente en la factoría `createProvider`.
4. Cubre el normalizador con un caso en `scripts/smoke.ts`.

## Ramas y commits

- Ramas de trabajo: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- Commits Conventional Commits: `feat: …`, `fix: …`, `docs: …`, `refactor: …`.
- Un PR = un cambio con sentido. Incluye una descripción de *qué* y *por qué*.

## Proceso de revisión

1. Abre el PR contra `main`.
2. La CI debe estar en verde.
3. Se revisan los cambios de interfaz con capturas cuando procede.
4. Al fusionar en `main`, el workflow **Deploy to GitHub Pages** publica la
   versión nueva automáticamente.

## Reportar un fallo

Usa las plantillas de incidencia de la carpeta `.github/ISSUE_TEMPLATE`. Para
problemas de datos (posiciones incorrectas, feeds caídos), indica siempre el
aeropuerto, la hora en UTC y el proveedor que estabas usando.
