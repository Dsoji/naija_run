// A low-poly, Sims-style human figure shared by the runner and the encounter
// NPCs. Limbs hang from shoulder/hip PIVOT groups so a caller can swing them
// (rotation.x) for a run cycle. Feet sit at local y≈0 so the group drops onto
// the road at y=0. Materials are passed in (shared) so repeated NPC spawns don't
// leak new materials.

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { blobShadow } from './Shadow'

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

/** A rounded limb segment (capsule) of the given radius and straight length. */
function limb(radius: number, len: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.CapsuleGeometry(radius, len, 4, 10), mat)
}

/** One leg hanging from a hip pivot (built downward in local space). Rounded
 *  thigh + calf taper like a real leg, with a slightly wedge-shaped shoe. */
function buildLeg(m: HumanoidMats): THREE.Group {
  const leg = new THREE.Group()
  const thigh = limb(0.115, 0.26, m.trouser)
  thigh.position.y = -0.22
  const knee = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), m.trouser)
  knee.position.y = -0.44
  const calf = limb(0.095, 0.26, m.skin)
  calf.position.y = -0.64
  const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.13, 0.4, 2, 0.05), m.shoe)
  shoe.position.set(0, -0.86, -0.07) // toe points forward (−z)
  leg.add(thigh, knee, calf, shoe)
  return leg
}

/** One arm hanging from a shoulder pivot: rounded upper (sleeve) + forearm +
 *  a small hand, with a shoulder cap so it joins the torso smoothly. */
function buildArm(m: HumanoidMats): THREE.Group {
  const arm = new THREE.Group()
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), m.shirt)
  const upper = limb(0.085, 0.18, m.shirt)
  upper.position.y = -0.13
  const fore = limb(0.07, 0.2, m.skin)
  fore.position.y = -0.4
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), m.skin)
  hand.scale.set(1, 1.2, 0.8)
  hand.position.y = -0.56
  arm.add(cap, upper, fore, hand)
  return arm
}

export function buildHumanoid(m: HumanoidMats, opts: { plumbob?: boolean } = {}): Humanoid {
  const group = new THREE.Group()

  // Legs on hip pivots.
  const legL = buildLeg(m)
  const legR = buildLeg(m)
  legL.position.set(-0.13, 0.88, 0)
  legR.position.set(0.13, 0.88, 0)

  // Hips + torso: rounded, tapered so the waist is narrower than the chest.
  const pelvis = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.26, 0.26, 3, 0.1), m.trouser)
  pelvis.position.y = 0.96
  const waist = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.26, 0.24, 3, 0.1), m.shirt)
  waist.position.y = 1.18
  const chest = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.34, 0.26, 3, 0.12), m.shirt)
  chest.position.y = 1.44
  // Shoulder yoke across the top of the chest for a human upper-body line.
  const shoulders = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.16, 0.26, 3, 0.08), m.shirt)
  shoulders.position.y = 1.58

  // Arms on shoulder pivots.
  const armL = buildArm(m)
  const armR = buildArm(m)
  armL.position.set(-0.3, 1.56, 0)
  armR.position.set(0.3, 1.56, 0)

  // Neck + head.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 10), m.skin)
  neck.position.y = 1.68
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 14), m.skin)
  head.scale.set(0.92, 1.1, 0.95) // narrower, taller → a face, not a ball
  head.position.y = 1.86
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), m.skin)
  jaw.scale.set(0.9, 0.7, 0.95)
  jaw.position.set(0, 1.78, -0.015)
  // Hair cap (upper hemisphere) wrapping down a touch at the back.
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.212, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
    m.hair,
  )
  hair.scale.set(0.95, 1.05, 1)
  hair.position.set(0, 1.9, 0.01)
  // Nose + eyes (front is −z).
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), m.skin)
  nose.position.set(0, 1.85, -0.19)
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), EYE_MAT)
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), EYE_MAT)
  eyeL.position.set(-0.07, 1.9, -0.17)
  eyeR.position.set(0.07, 1.9, -0.17)

  group.add(
    legL, legR, pelvis, waist, chest, shoulders, armL, armR, neck, head, jaw, hair, nose, eyeL, eyeR,
  )
  group.add(blobShadow(0.42, 0.42))

  // Sims plumbob floating overhead.
  if (opts.plumbob) {
    const bob = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), PLUMBOB_MAT)
    bob.scale.y = 1.8
    bob.position.y = 2.3
    group.add(bob)
  }

  return { group, legL, legR, armL, armR }
}
