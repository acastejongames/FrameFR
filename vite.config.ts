import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

/**
 * FrameFR build configuration.
 *
 * - `base` is set to the GitHub Pages project path for production builds.
 *   Override it with `VITE_BASE_PATH` when deploying somewhere else.
 * - `allowedHosts: true` lets the dev server answer on preview/proxy domains
 *   (e2b, Codespaces, ngrok...) instead of only on localhost.
 */
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH ?? (mode === 'production' ? '/FrameFR/' : '/'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    cors: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    cors: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // MapLibre GL is a big single dependency; the warning is not actionable.
    chunkSizeWarningLimit: 1600,
  },
}))
