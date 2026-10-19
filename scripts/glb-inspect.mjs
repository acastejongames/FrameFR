/**
 * One-off GLB inspector used while integrating the 3D aircraft models.
 *
 * For every `src/assets/models/aircraft/*.glb` it applies the node transforms
 * (translation / rotation / scale), builds the scene-space point cloud and
 * reports the oriented bounding box plus a nose-direction guess: the vertical
 * stabilizer sits at the tail, so the "upper cluster" of vertices is biased
 * towards the tail along the fuselage axis.
 *
 * Run with: node scripts/glb-inspect.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = new URL('../src/assets/models/aircraft/', import.meta.url).pathname

function quatToMatrix([x, y, z, w]) {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ]
}

function mulMatVec(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ]
}

function parseGlb(file) {
  const buf = readFileSync(file)
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
  const binStart = 12 + 8 + jsonLen + 8
  return { json, bin: buf.subarray(binStart) }
}

function worldTransform(node, parents) {
  const chain = [...parents, node]
  const pts = {
    apply(v) {
      let out = v
      for (let i = chain.length - 1; i >= 0; i--) {
        const n = chain[i]
        if (n.matrix) {
          const m = n.matrix
          const x = m[0] * out[0] + m[1] * out[1] + m[2] * out[2] + m[3]
          const y = m[4] * out[0] + m[5] * out[1] + m[6] * out[2] + m[7]
          const z = m[8] * out[0] + m[9] * out[1] + m[10] * out[2] + m[11]
          out = [x, y, z]
          continue
        }
        const s = n.scale ?? [1, 1, 1]
        let t = [out[0] * s[0], out[1] * s[1], out[2] * s[2]]
        if (n.rotation) t = mulMatVec(quatToMatrix(n.rotation), t)
        const tr = n.translation ?? [0, 0, 0]
        out = [t[0] + tr[0], t[1] + tr[1], t[2] + tr[2]]
      }
      return out
    },
  }
  return pts
}

for (const name of readdirSync(DIR).filter((f) => f.endsWith('.glb')).sort()) {
  const { json, bin } = parseGlb(join(DIR, name))
  const points = []
  const walk = (index, parents) => {
    const node = json.nodes[index]
    const xf = worldTransform(node, parents)
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives ?? []) {
        const acc = json.accessors[prim.attributes.POSITION]
        const view = json.bufferViews[acc.bufferView]
        const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
        const stride = view.byteStride ?? 12
        for (let i = 0; i < acc.count; i++) {
          const o = base + i * stride
          points.push(xf.apply([bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)]))
        }
      }
    }
    for (const child of node.children ?? []) walk(child, [...parents, node])
  }
  for (const root of json.scenes[json.scene ?? 0].nodes) walk(root, [])

  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const p of points) for (let i = 0; i < 3; i++) {
    min[i] = Math.min(min[i], p[i])
    max[i] = Math.max(max[i], p[i])
  }
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  const centerY = (min[1] + max[1]) / 2
  const topY = centerY + size[1] * 0.35
  let topSumX = 0
  let topN = 0
  for (const p of points) if (p[1] > topY) { topSumX += p[0]; topN++ }
  const topMeanX = topN ? topSumX / topN : NaN
  const centerX = (min[0] + max[0]) / 2
  const nose = topMeanX < centerX ? '+X' : '-X'
  console.log(
    `${name}: points=${points.length} size=[${size.map((v) => v.toFixed(1)).join(', ')}] ` +
    `min=[${min.map((v) => v.toFixed(1)).join(', ')}] max=[${max.map((v) => v.toFixed(1)).join(', ')}] ` +
    `finMeanX=${topMeanX.toFixed(1)} centerX=${centerX.toFixed(1)} => nose≈${nose}`,
  )
}
