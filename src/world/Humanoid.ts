// A low-poly, Sims-style human figure shared by the runner and the encounter
// NPCs. Limbs hang from shoulder/hip PIVOT groups so a caller can swing them
// (rotation.x) for a run cycle. Feet sit at local y≈0 so the group drops onto
// the road at y=0. Materials are passed in (shared) so repeated NPC spawns don't
// leak new materials.

import * as THREE from 'three'

export interface HumanoidMats {
  shirt: THREE.Material
  trouser: THREE.Material
  skin: THREE.Material
  hair: THREE.Material
  shoe: THREE.Material
}

export interface Humanoid {
  group: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
}

const EYE_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 })
const PLUMBOB_MAT = new THREE.MeshStandardMaterial({
  color: 0x39ff6a,
  emissive: 0x2ecf6b,
  emissiveIntensity: 0.9,
  roughness: 0.3,
})

function box(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
}

/** One leg hanging from a hip pivot (built downward in local space). */
function buildLeg(m: HumanoidMats): THREE.Group {
  const leg = new THREE.Group()
  const thigh = box(0.22, 0.4, 0.26, m.trouser)
  thigh.position.y = -0.2
  const shin = box(0.18, 0.4, 0.22, m.trouser)
  shin.position.y = -0.6
  const shoe = box(0.22, 0.13, 0.42, m.shoe)
  shoe.position.set(0, -0.86, -0.06) // toe points forward (−z)
  leg.add(thigh, shin, shoe)
  return leg
}

/** One arm hanging from a shoulder pivot (sleeve → forearm → hand). */
function buildArm(m: HumanoidMats): THREE.Group {
  const arm = new THREE.Group()
  const sleeve = box(0.15, 0.2, 0.17, m.shirt)
  sleeve.position.y = -0.1
  const fore = box(0.13, 0.3, 0.15, m.skin)
  fore.position.y = -0.35
  const hand = box(0.14, 0.14, 0.13, m.skin)
  hand.position.y = -0.56
  arm.add(sleeve, fore, hand)
  return arm
}

export function buildHumanoid(m: HumanoidMats, opts: { plumbob?: boolean } = {}): Humanoid {
  const group = new THREE.Group()

  // Legs on hip pivots.
  const legL = buildLeg(m)
  const legR = buildLeg(m)
  legL.position.set(-0.13, 0.88, 0)
  legR.position.set(0.13, 0.88, 0)

  // Pelvis + torso.
  const pelvis = box(0.4, 0.26, 0.28, m.trouser)
  pelvis.position.y = 0.95
  const torso = box(0.5, 0.56, 0.3, m.shirt)
  torso.position.y = 1.3

  // Arms on shoulder pivots.
  const armL = buildArm(m)
  const armR = buildArm(m)
  armL.position.set(-0.3, 1.5, 0)
  armR.position.set(0.3, 1.5, 0)

  // Neck + head.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 8), m.skin)
  neck.position.y = 1.6
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), m.skin)
  head.scale.y = 1.12
  head.position.y = 1.78
  // Hair cap (upper hemisphere), pushed back slightly.
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.235, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    m.hair,
  )
  hair.position.set(0, 1.82, 0.015)
  // Eyes (front is −z).
  const eyeL = box(0.05, 0.07, 0.03, EYE_MAT)
  const eyeR = box(0.05, 0.07, 0.03, EYE_MAT)
  eyeL.position.set(-0.08, 1.8, -0.2)
  eyeR.position.set(0.08, 1.8, -0.2)

  group.add(legL, legR, pelvis, torso, armL, armR, neck, head, hair, eyeL, eyeR)

  // Sims plumbob floating overhead.
  if (opts.plumbob) {
    const bob = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), PLUMBOB_MAT)
    bob.scale.y = 1.8
    bob.position.y = 2.3
    group.add(bob)
  }

  return { group, legL, legR, armL, armR }
}
