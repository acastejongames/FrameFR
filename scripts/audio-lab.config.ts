import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/** Scratch build used while tuning the ATC cleaner (not part of `npm run check`). */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    ssr: true,
    outDir: 'dist-audio-lab',
    emptyOutDir: true,
    minify: false,
    target: 'node22',
    lib: {
      entry: 'scripts/audio-lab.ts',
      formats: ['es'],
      fileName: () => 'audio-lab.mjs',
    },
  },
})
