import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import App from './App'

/**
 * MapLibre GL v6 no longer inlines its worker: it resolves the worker at
 * runtime with `new URL('./maplibre-gl-worker.mjs', import.meta.url)`, which
 * bundlers rewrite to the app chunk, so the request 404s and the map stays
 * blank (vector tiles are fetched and parsed inside the worker). Register the
 * worker that Vite bundles (`?worker&url` also packs its sibling
 * `maplibre-gl-shared.mjs` into a single file) before any Map is created.
 */
setWorkerUrl(maplibreWorkerUrl)

const container = document.getElementById('root')
if (!container) throw new Error('No se ha encontrado el contenedor #root')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
