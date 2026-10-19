/**
 * Dev utility: loads every bundled 3D aircraft model with the real registry
 * helpers and renders them in one Three.js scene, nose towards +X.
 *
 * Open `http://localhost:5173/model-check.html` with the dev server running.
 * It is not part of the production build (only `index.html` is bundled).
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  AIRCRAFT_3D_MODELS,
  headingToRotationY,
  modelScaleFor,
  type Aircraft3DModel,
} from '../src/data/aircraft3d'

const canvas = document.getElementById('view') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight, false)
renderer.setClearColor(0x0d1218, 1)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 200_000)
camera.position.set(0, 120, 560)

const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 0, 0)

scene.add(new THREE.HemisphereLight(0x9db8ff, 0x131a22, 1.25))
const sun = new THREE.DirectionalLight(0xffffff, 2.1)
sun.position.set(400, 900, 500)
scene.add(sun)
scene.add(new THREE.GridHelper(600, 30, 0x2f3d4d, 0x1b232d))

function labelSprite(text: string): THREE.Sprite {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffbe00'
  ctx.font = 'bold 36px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(text, 128, 44)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
  sprite.scale.set(28, 7, 1)
  return sprite
}

const loader = new GLTFLoader()
const spacing = 110
AIRCRAFT_3D_MODELS.forEach((model: Aircraft3DModel, index: number) => {
  const x = (index - (AIRCRAFT_3D_MODELS.length - 1) / 2) * spacing
  loader.load(model.modelUrl, (gltf) => {
    const object = gltf.scene
    const box = new THREE.Box3().setFromObject(object)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const scale = modelScaleFor(size.x, model.realLengthM)
    object.position.sub(center)
    const inner = new THREE.Group()
    inner.add(object)
    inner.scale.setScalar(scale)
    const pivot = new THREE.Group()
    pivot.add(inner)
    // Heading 90° keeps the nose along +X for an unambiguous check.
    pivot.rotation.y = headingToRotationY(90, model.noseAlongPositiveX)
    pivot.position.set(x, 0, 0)
    scene.add(pivot)
    const label = labelSprite(`${model.label} (${model.realLengthM} m)`)
    label.position.set(x, -14, 0)
    scene.add(label)
    renderer.render(scene, camera)
    console.log('model-check: loaded', model.id, 'scale', scale.toFixed(3))
  })
})

function frame(): void {
  requestAnimationFrame(frame)
  controls.update()
  renderer.render(scene, camera)
}
frame()

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight, false)
})
