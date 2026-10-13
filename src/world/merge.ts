// Merge a hierarchy of small meshes into one mesh per material — the cheap way
// to draw detailed procedural props (vehicles, bridge furniture) without a
// draw call per part. Blob shadows (userData.blob) are left out.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** Bake every mesh under `root` (in root space) and merge by material.
 *  `shared` flags the results so tile recycling never disposes them (use for
 *  prototypes that get cloned); leave it off for per-tile geometry. */
export function mergeByMaterial(root: THREE.Object3D, shared = false): THREE.Group {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const m4 = new THREE.Matrix4()
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || mesh.userData.blob) return
    let geo = mesh.geometry.clone().applyMatrix4(m4.multiplyMatrices(inv, mesh.matrixWorld))
    if (geo.index) geo = geo.toNonIndexed()
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name)
    }
    const mat = mesh.material as THREE.Material
    if (!buckets.has(mat)) buckets.set(mat, [])
    buckets.get(mat)!.push(geo)
  })
  const out = new THREE.Group()
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos)
    geos.forEach((g) => g.dispose())
    if (!merged) continue
    const m = new THREE.Mesh(merged, mat)
    if (shared) m.userData.shared = true
    out.add(m)
  }
  // The source parts were only scaffolding.
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && !mesh.userData.blob) mesh.geometry.dispose()
  })
  return out
}
