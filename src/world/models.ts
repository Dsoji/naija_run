// Model registry (spec §2.5D hybrid, see NOTES.md). Each entry returns the
// VISUAL for a thing in the world — built from primitives today, swappable to a
// loaded .glb later without touching game logic. Geometry is created per call so
// it disposes cleanly when its tile recycles; materials are shared (never
// disposed). 2D pieces are flat, lit, fog-respecting planes (not raw Sprites).

import * as THREE from 'three'
import { CONFIG } from '../config'
import { buildHumanoid } from './Humanoid'

// --- shared materials -------------------------------------------------------
const M = {
  potholeBrown: new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 1 }),
  danfoYellow: new THREE.MeshStandardMaterial({ color: 0xf5c400, roughness: 0.7 }),
  stripeBlack: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.3, metalness: 0.2 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 1 }),
  kekeGreen: new THREE.MeshStandardMaterial({ color: 0x2e9e4f, roughness: 0.7 }),
  barricadeRed: new THREE.MeshStandardMaterial({ color: 0xd93025, roughness: 0.9 }),
  barricadeWhite: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.9 }),
  bannerCloth: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 1 }),
  pole: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.8 }),
  goatHide: new THREE.MeshStandardMaterial({ color: 0xd9cfc1, roughness: 1 }),
  goatDark: new THREE.MeshStandardMaterial({ color: 0x6b5d4f, roughness: 1 }),
  okadaFrame: new THREE.MeshStandardMaterial({ color: 0x8a1f1f, roughness: 0.5, metalness: 0.2 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xbfc3c8, roughness: 0.35, metalness: 0.6 }),
  helmet: new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4 }),
} as const

// Bright shirt colours for the okada rider (varied per spawn).
const okadaShirts = [0x2563eb, 0x16a34a, 0xef4444, 0xf59e0b, 0x7c3aed].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }),
)

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

/** Keke napep: small green tricycle box with a yellow roof. */
export function buildKeke(): THREE.Object3D {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.8), M.kekeGreen)
  body.position.y = 0.75
  g.add(body)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.25, 1.85), M.danfoYellow)
  roof.position.y = 1.35
  g.add(roof)
  for (const sz of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 0.05), M.glass)
    win.position.set(0, 1.05, sz * 0.9)
    g.add(win)
  }
  // Front single wheel + two rear wheels.
  const front = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.25, 12), M.tyre)
  front.rotation.z = Math.PI / 2
  front.position.set(0, 0.28, 0.8)
  g.add(front)
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 12), M.tyre)
    w.rotation.z = Math.PI / 2
    w.position.set(sx * 0.55, 0.3, -0.7)
    g.add(w)
  }
  return g
}

/** Lagos yellow taxi: a small saloon, danfo-yellow with a black door stripe and
 *  a little roof sign — distinct from the boxier danfo. */
export function buildTaxi(): THREE.Object3D {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 3.4), M.danfoYellow)
  body.position.y = 0.72
  g.add(body)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.62, 1.7), M.danfoYellow)
  cabin.position.y = 1.28
  g.add(cabin)
  for (const sx of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 3.0), M.stripeBlack)
    stripe.position.set(sx * 0.86, 0.8, 0)
    g.add(stripe)
  }
  for (const sz of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.45, 0.05), M.glass)
    win.position.set(0, 1.28, sz * 0.84)
    g.add(win)
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), M.stripeBlack)
  sign.position.set(0, 1.72, 0.2)
  g.add(sign)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.26, 12), M.tyre)
      w.rotation.z = Math.PI / 2
      w.position.set(sx * 0.85, 0.3, sz * 1.1)
      g.add(w)
    }
  }
  return g
}

/** Okada (commercial motorbike) with a helmeted rider — a Lagos street staple.
 *  Length runs along local Z so it parks parallel to the kerb like the cars. */
export function buildOkada(): THREE.Object3D {
  const g = new THREE.Group()
  for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 14), M.tyre)
    w.rotation.z = Math.PI / 2
    w.position.set(0, 0.34, sz * 0.62)
    g.add(w)
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 1.0), M.okadaFrame)
  frame.position.set(0, 0.62, 0)
  g.add(frame)
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.72), M.stripeBlack)
  seat.position.set(0, 0.82, -0.12)
  g.add(seat)
  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), M.chrome)
  fork.position.set(0, 0.7, 0.58)
  fork.rotation.x = -0.35
  g.add(fork)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), M.chrome)
  bar.position.set(0, 1.0, 0.66)
  g.add(bar)
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.08), M.glass)
  lamp.position.set(0, 0.78, 0.78)
  g.add(lamp)
  // Rider: leaning torso + helmet.
  const shirt = okadaShirts[(Math.random() * okadaShirts.length) | 0]
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.6, 0.32), shirt)
  torso.position.set(0, 1.15, -0.1)
  torso.rotation.x = 0.25
  g.add(torso)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.26), M.helmet)
  head.position.set(0, 1.55, 0.02)
  g.add(head)
  return g
}

/** Police barricade: a low red/white striped box to jump. */
export function buildBarricade(): THREE.Object3D {
  const g = new THREE.Group()
  const n = 5
  const w = 2.2
  for (let i = 0; i < n; i++) {
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(w / n, 0.7, 0.3),
      i % 2 === 0 ? M.barricadeRed : M.barricadeWhite,
    )
    seg.position.set(-w / 2 + (i + 0.5) * (w / n), 0.55, 0)
    g.add(seg)
  }
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), M.pole)
    leg.position.set(sx * (w / 2 - 0.1), 0.45, 0)
    g.add(leg)
  }
  return g
}

/** Overhead banner spanning the road at ~1.3 m — slide under it. */
export function buildBanner(roadWidth: number): THREE.Object3D {
  const g = new THREE.Group()
  const bar = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, 0.55, 0.12), M.bannerCloth)
  bar.position.y = 1.55
  g.add(bar)
  for (const sx of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.0, 8), M.pole)
    pole.position.set((sx * roadWidth) / 2, 1.0, 0)
    g.add(pole)
  }
  return g
}

/** A small West African dwarf goat, seen in profile (length along X) so its
 *  silhouette reads clearly: rounded body, neck + head with snout, swept-back
 *  horns, drooping ears, a short tail, slender legs, and a pied dark patch. */
export function buildGoat(): THREE.Object3D {
  const g = new THREE.Group()

  // Rounded body lying along X.
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.5, 4, 8), M.goatHide)
  body.rotation.z = Math.PI / 2
  body.position.set(0, 0.52, 0)
  g.add(body)

  // Pied dark saddle patch over the rear.
  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.42), M.goatDark)
  patch.position.set(-0.18, 0.68, 0)
  g.add(patch)

  // Neck (angled up toward the front) + head + snout.
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.2), M.goatHide)
  neck.position.set(0.4, 0.66, 0)
  neck.rotation.z = -0.6
  g.add(neck)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.22), M.goatHide)
  head.position.set(0.58, 0.8, 0)
  g.add(head)
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), M.goatDark)
  snout.position.set(0.74, 0.74, 0)
  g.add(snout)

  // Drooping ears.
  for (const sz of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.1), M.goatHide)
    ear.position.set(0.55, 0.82, sz * 0.14)
    ear.rotation.x = sz * 0.5
    g.add(ear)
  }

  // Swept-back horns.
  for (const sz of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.24, 6), M.goatDark)
    horn.position.set(0.5, 0.95, sz * 0.07)
    horn.rotation.z = 0.7 // lean back
    g.add(horn)
  }

  // Short upright tail at the rear.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.08), M.goatHide)
  tail.position.set(-0.52, 0.62, 0)
  tail.rotation.z = -0.5
  g.add(tail)

  // Four slender legs.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.08), M.goatDark)
      leg.position.set(sx * 0.26, 0.17, sz * 0.14)
      g.add(leg)
    }
  }
  return g
}

// ₦ notes — flat banknote planes, colour-coded by denomination, double-sided
// and slightly emissive so they pop as they rotate. Shared per-denomination.
const NOTE_MAT: Record<number, THREE.MeshStandardMaterial> = {
  50: noteMat(0x2e6fb0), // blue-ish
  100: noteMat(0xb0434a), // red
  200: noteMat(0xcf7a3a), // amber
  500: noteMat(0x3f9e6b), // green
}
function noteMat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.25,
    roughness: 0.6,
    side: THREE.DoubleSide,
  })
}

export function buildNote(value: number): THREE.Object3D {
  const mat = NOTE_MAT[value] ?? NOTE_MAT[50]
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), mat)
  // A thin bright rim so denominations read at a glance.
  const rim = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.36), M.barricadeWhite)
  rim.position.z = -0.001
  const g = new THREE.Group()
  g.add(rim, note)
  return g
}

// Clue: a glowing yellow folder icon (a body plane + a small tab). Flat 2D.
const CLUE_MAT = new THREE.MeshStandardMaterial({
  color: 0xf5c400,
  emissive: 0xf5c400,
  emissiveIntensity: 0.5,
  roughness: 0.5,
  side: THREE.DoubleSide,
})
export function buildClue(): THREE.Object3D {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.42), CLUE_MAT)
  const tab = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.12), CLUE_MAT)
  tab.position.set(-0.14, 0.26, 0.001)
  g.add(body, tab)
  return g
}

/** The thief's car: a red sedan with wheels and glowing tail lights. */
export function buildThief(): THREE.Object3D {
  const g = new THREE.Group()
  const red = new THREE.MeshStandardMaterial({ color: 0xc0271d, roughness: 0.5, metalness: 0.2 })
  const tail = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 0.8 })

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 3.4), red)
  body.position.y = 0.75
  g.add(body)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 1.8), red)
  cabin.position.y = 1.35
  g.add(cabin)
  for (const sz of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.5, 0.05), M.glass)
    win.position.set(0, 1.35, sz * 0.9)
    g.add(win)
  }
  // Tail lights face +Z (the rear, toward a pursuing player when fleeing −Z).
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.05), tail)
    t.position.set(sx * 0.6, 0.8, 1.72)
    g.add(t)
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.28, 12), M.tyre)
      w.rotation.z = Math.PI / 2
      w.position.set(sx * 0.85, 0.32, sz * 1.1)
      g.add(w)
    }
  }
  return g
}

// --- Encounter NPCs (spec §7): distinct silhouettes from primitives. --------
const NPC_MAT = {
  police: new THREE.MeshStandardMaterial({ color: 0x1b2a4a, roughness: 0.8 }), // navy
  singlet: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.9 }),
  casual: new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9 }),
  skin: new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 }),
  black: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }),
  red: new THREE.MeshStandardMaterial({ color: 0xc0271d, roughness: 0.8 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xf5c400, metalness: 0.6, roughness: 0.4 }),
  towel: new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 1 }),
} as const

export type NpcKind = 'police' | 'nero' | 'agbero'

// Trouser/short colour per NPC kind (shared).
const NPC_TROUSER = {
  police: new THREE.MeshStandardMaterial({ color: 0x24324f, roughness: 0.85 }),
  casual: new THREE.MeshStandardMaterial({ color: 0x2f3a46, roughness: 0.9 }),
} as const

export function buildNPC(kind: NpcKind): THREE.Object3D {
  const torsoMat = kind === 'police' ? NPC_MAT.police : kind === 'agbero' ? NPC_MAT.singlet : NPC_MAT.casual
  const { group: g } = buildHumanoid(
    {
      shirt: torsoMat,
      trouser: kind === 'police' ? NPC_TROUSER.police : NPC_TROUSER.casual,
      skin: NPC_MAT.skin,
      hair: NPC_MAT.black,
      shoe: NPC_MAT.black,
    },
    { plumbob: true }, // the Sims signature
  )

  if (kind === 'police') {
    const beret = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 12), NPC_MAT.black)
    beret.position.y = 1.98
    beret.rotation.z = 0.12
    g.add(beret)
  } else if (kind === 'nero') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), NPC_MAT.red)
    cap.position.y = 1.96
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.24), NPC_MAT.red)
    brim.position.set(0, 1.92, -0.24) // forward is −z
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 8, 16), NPC_MAT.gold)
    chain.position.y = 1.5
    chain.rotation.x = Math.PI / 2
    g.add(cap, brim, chain)
  } else {
    // agbero: towel draped over one shoulder.
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.12), NPC_MAT.towel)
    towel.position.set(0.32, 1.4, 0)
    towel.rotation.z = 0.2
    g.add(towel)
  }
  return g
}

// A glowing green "this way" arrow laid flat on the road, pointing +Z (local).
// Used for revealTurn/fakeTurn — identical visual either way (that's the point).
const ARROW_MAT = new THREE.MeshStandardMaterial({
  color: 0x39ff6a,
  emissive: 0x39ff6a,
  emissiveIntensity: 0.6,
  roughness: 0.4,
})
export function buildArrow(): THREE.Object3D {
  const g = new THREE.Group()
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 1.6), ARROW_MAT)
  shaft.position.set(0, 0.08, 0.1)
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.9, 4), ARROW_MAT)
  head.rotation.x = Math.PI / 2 // apex points +Z, lying flat
  head.position.set(0, 0.08, 1.3)
  g.add(shaft, head)
  return g
}

/** Police escort car: white body, blue stripe, flashing red/blue light bar. */
export function buildPoliceCar(): THREE.Object3D {
  const g = new THREE.Group()
  const white = new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.5 })
  const blue = new THREE.MeshStandardMaterial({ color: 0x1b4fd0, roughness: 0.6 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 3.4), white)
  body.position.y = 0.75
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 1.7), white)
  cabin.position.y = 1.35
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.3, 3.42), blue)
  stripe.position.y = 0.7
  g.add(body, cabin, stripe)
  const bar = new THREE.Group()
  bar.position.set(0, 1.78, 0)
  const lr = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 0.9 }))
  lr.position.x = -0.25
  const lb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0x2b6bff, emissive: 0x2b6bff, emissiveIntensity: 0.9 }))
  lb.position.x = 0.25
  bar.add(lr, lb)
  g.add(bar)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.28, 12), M.tyre)
      w.rotation.z = Math.PI / 2
      w.position.set(sx * 0.85, 0.32, sz * 1.1)
      g.add(w)
    }
  }
  return g
}

/** A market stall blocking a lane: a goods box under a colourful canopy. */
export function buildStall(): THREE.Object3D {
  const g = new THREE.Group()
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.0, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 1 }),
  )
  box.position.y = 0.55
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.2, 1.5),
    new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 1 }),
  )
  canopy.position.y = 1.2
  g.add(box, canopy)
  return g
}

export type ModelKind =
  | 'pothole'
  | 'danfo'
  | 'keke'
  | 'barricade'
  | 'banner'
  | 'goat'
  | 'stall'

export const MODELS: Record<ModelKind, () => THREE.Object3D> = {
  pothole: buildPothole,
  danfo: buildDanfo,
  keke: buildKeke,
  barricade: buildBarricade,
  banner: () => buildBanner(CONFIG.ROAD_W),
  goat: buildGoat,
  stall: buildStall,
}
