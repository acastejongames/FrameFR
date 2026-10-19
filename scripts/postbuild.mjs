import { access, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

/**
 * GitHub Pages serves `404.html` for unknown paths. FrameFR is a single view,
 * so we ship a copy of `index.html` as a fallback.
 */
try {
  await access(join(dist, 'index.html'))
  await copyFile(join(dist, 'index.html'), join(dist, '404.html'))
  console.log('postbuild: dist/404.html creado')
} catch (error) {
  console.error('postbuild: no se pudo crear el fallback 404')
  console.error(error)
  process.exitCode = 1
}
