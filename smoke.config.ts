import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/** Build config used by `npm run smoke` (bundles the headless check for Node). */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    ssr: true,
    outDir: 'dist-smoke',
    emptyOutDir: true,
    minify: false,
    target: 'node22',
    lib: {
      entry: 'scripts/smoke.ts',
      formats: ['es'],
      fileName: () => 'smoke.mjs',
    },
  },
})
