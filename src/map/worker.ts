import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

// MapLibre 6's default URL is relative to its own module. After bundling that
// module into the app, the sibling worker no longer exists. Let Vite bundle
// the worker (including its shared imports) and apply the deployment base.
setWorkerUrl(workerUrl)
