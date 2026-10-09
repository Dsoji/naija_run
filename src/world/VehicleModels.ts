// Preloaded GLB vehicles (poly.pizza, CC0/CC-BY — see CREDITS.md) wired into the
// model registry. Each GLB is loaded ONCE and normalized (scaled to game units,
// length along local +Z, wheels on the ground, centred in XZ). The accessor
// functions return a cheap CLONE that shares the prototype's geometry+material;
// every clone mesh is flagged userData.shared so disposeTile (which disposes a
// tile's geometry on recycle) skips it and the shared geometry survives.
//
// Loading is async; until a model resolves its accessor returns null and the
// caller falls back to the procedural vehicle, exactly like the runner model.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { blobShadow } from './Shadow'

const loader = new GLTFLoader()

/** Scale so the longest horizontal axis is `targetLen`, rotate that axis onto
 *  +Z, drop the lowest point to y=0 and centre X/Z. Returns a prototype to clone. */
function normalize(scene: THREE.Object3D, targetLen: number): THREE.Group {
  const proto = new THREE.Group()
  proto.add(scene)
  proto.updateMatrixWorld(true)

  let box = new THREE.Box3().setFromObject(proto)
  const size = new THREE.Vector3()
  box.getSize(size)
  // Make the longer horizontal axis run along Z (the direction of travel).
  if (size.x > size.z) {
    scene.rotation.y += Math.PI / 2
    proto.updateMatrixWorld(true)
    box = new THREE.Box3().setFromObject(proto)
    box.getSize(size)
  }
  const scale = targetLen / Math.max(size.z, 1e-3)
  scene.scale.multiplyScalar(scale)
  proto.updateMatrixWorld(true)

  box = new THREE.Box3().setFromObject(proto)
  const center = new THREE.Vector3()
  box.getCenter(center)
  scene.position.x -= center.x
  scene.position.z -= center.z
  scene.position.y -= box.min.y
  return proto
}

function load(url: string, targetLen: number): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(url, (g) => resolve(normalize(g.scene, targetLen)), undefined, reject)
  })
}

let protoPolice: THREE.Group | null = null
let protoCar: THREE.Group | null = null
let protoOkada: THREE.Group | null = null

/** Kick off loading all vehicle GLBs. Call once at startup. */
export function preloadVehicles(): void {
  load('/models/police.glb', 3.4).then((p) => (protoPolice = p)).catch(() => {})
  load('/models/car.glb', 3.4).then((p) => (protoCar = p)).catch(() => {})
  load('/models/okada.glb', 1.9).then((p) => (protoOkada = p)).catch(() => {})
}

function instance(
  proto: THREE.Group | null,
  blobHalfW: number,
  blobHalfL: number,
): THREE.Object3D | null {
  if (!proto) return null
  const c = proto.clone(true)
  c.traverse((o) => (o.userData.shared = true)) // keep shared geometry out of disposeTile
  c.add(blobShadow(blobHalfW, blobHalfL)) // blob added AFTER: its geometry disposes normally
  return c
}

/** A regular car (Quaternius, CC0), or null until loaded. Length along +Z. */
export const carGLB = (): THREE.Object3D | null => instance(protoCar, 0.95, 1.8)
/** The police car (Quaternius, CC0), or null until loaded. Length along +Z. */
export const policeGLB = (): THREE.Object3D | null => instance(protoPolice, 0.95, 1.8)
/** An okada / motorbike (jeremy, CC-BY), or null until loaded. Length along +Z. */
export const okadaGLB = (): THREE.Object3D | null => instance(protoOkada, 0.45, 1.0)
