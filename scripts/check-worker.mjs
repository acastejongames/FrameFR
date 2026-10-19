import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Script } from 'node:vm'

// The headless UI test stubs MapLibre, so it cannot detect missing workers.
// Validate the actual production artifact as part of every build instead.
const assets = new URL('../dist/assets/', import.meta.url)
const files = await readdir(assets)
const workers = files.filter(name => /^maplibre-gl-worker-.*\.js$/.test(name))
assert.equal(workers.length, 1, 'The production build must contain the MapLibre worker')
const worker = workers[0]
const source = await readFile(new URL(worker, assets), 'utf8')
assert(source.length > 1000, 'Worker must contain JavaScript, not a placeholder')
// Vite defaults to an IIFE worker: shared imports must be bundled, not left
// pointing to a missing sibling maplibre-gl-shared.mjs file.
new Script(source, { filename: worker })
const base = process.env.VITE_BASE_PATH ?? '/FrameFR/'
const workerPath = `${base.replace(/\/$/, '')}/assets/${worker}`
const scripts = await Promise.all(files.filter(name => /^index-.*\.js$/.test(name))
  .map(name => readFile(new URL(name, assets), 'utf8')))
assert(scripts.some(script => script.includes(workerPath)),
  `Application bundle must reference the emitted worker at ${workerPath}`)
assert(!source.includes('from"./maplibre-gl-shared'), 'Worker dependencies must be bundled')

const backgroundWorkers = files.filter(name => /^backgroundTicker\.worker-.*\.js$/.test(name))
assert.equal(backgroundWorkers.length, 1, 'The production build must contain the background ticker worker')
const backgroundWorker = backgroundWorkers[0]
const backgroundSource = await readFile(new URL(backgroundWorker, assets), 'utf8')
new Script(backgroundSource, { filename: backgroundWorker })
const backgroundWorkerPath = `${base.replace(/\/$/, '')}/assets/${backgroundWorker}`
assert(scripts.some(script => script.includes(backgroundWorkerPath)),
  `Application bundle must reference the background ticker at ${backgroundWorkerPath}`)

console.log(`worker check: ${join('dist/assets', worker)} and ${backgroundWorker} present, parseable and referenced with base ${base}`)
