// Model registry (spec §2.5D hybrid, see NOTES.md). Each entry returns the
// VISUAL for a thing in the world — built from primitives today, swappable to a
// loaded .glb later without touching game logic. Geometry is created per call so
// it disposes cleanly when its tile recycles; materials are shared (never
// disposed). 2D pieces are flat, lit, fog-respecting planes (not raw Sprites).

import * as THREE from 'three'

// --- shared materials -------------------------------------------------------
const M = {
  potholeBrown: new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 1 }),
  danfoYellow: new THREE.MeshStandardMaterial({ color: 0xf5c400, roughness: 0.7 }),
  stripeBlack: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.3, metalness: 0.2 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 1 }),
} as const

/** Flat brown disc lying on the road — a pothole. 2D, faces up. */
export function buildPothole(): THREE.Object3D {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), M.potholeBrown)
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.03
  return m
}

/** Low-poly danfo: yellow body with black stripes, windows and wheels.
 *  Built facing −Z (length along Z); the caller orients it to the lane. */
export function buildDanfo(): THREE.Object3D {
  const g = new THREE.Group()
  const bodyW = 1.8
  const bodyH = 1.6
  const bodyL = 3.6

  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyL), M.danfoYellow)
  body.position.y = 1.0
  g.add(body)

  // Two black stripes along the sides (the classic Lagos danfo look).
  for (const sx of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, bodyL * 0.96), M.stripeBlack)
    stripe.position.set(sx * (bodyW / 2 + 0.01), 1.05, 0)
    g.add(stripe)
  }

  // Windscreen + rear window.
  for (const sz of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.9, 0.5, 0.06), M.glass)
    win.position.set(0, 1.35, sz * (bodyL / 2 - 0.05))
    g.add(win)
  }

  // Four wheels.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 12), M.tyre)
      w.rotation.z = Math.PI / 2
      w.position.set(sx * (bodyW / 2), 0.34, sz * (bodyL / 2 - 0.7))
      g.add(w)
    }
  }
  return g
}

export type ModelKind = 'pothole' | 'danfo'

export const MODELS: Record<ModelKind, () => THREE.Object3D> = {
  pothole: buildPothole,
  danfo: buildDanfo,
}
