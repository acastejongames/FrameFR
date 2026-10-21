import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/** Build config used by `npm run check:photo` (headless photogrammetry check). */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    ssr: true,
    outDir: 'dist-photo',
    emptyOutDir: true,
    minify: false,
    target: 'node22',
    lib: {
      entry: 'scripts/photogrammetry-check.ts',
      formats: ['es'],
      fileName: () => 'photogrammetry-check.js',
    },
  },
})
