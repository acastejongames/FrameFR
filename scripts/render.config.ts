import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/**
 * Build config used by `npm run check:render`.
 *
 * The app is bundled for Node and `maplibre-gl` is replaced by a stub, so the
 * whole interface can be mounted inside jsdom without a browser.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../src', import.meta.url)),
      'maplibre-gl': fileURLToPath(new URL('./stubs/maplibre-gl.ts', import.meta.url)),
    },
  },
  define: {
    'import.meta.env.VITE_ADSB_PROVIDER': JSON.stringify('demo'),
    'import.meta.env.VITE_FLEET_SIZE': '600',
  },
  build: {
    ssr: true,
    outDir: 'dist-render',
    emptyOutDir: true,
    minify: false,
    target: 'node22',
    lib: {
      entry: 'scripts/render-check.ts',
      formats: ['es'],
      fileName: () => 'render-check.mjs',
    },
  },
})
