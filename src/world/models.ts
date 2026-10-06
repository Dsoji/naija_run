// Model registry (spec §2.5D hybrid, see NOTES.md). Each entry returns the
// VISUAL for a thing in the world — built from primitives today, swappable to a
// loaded .glb later without touching game logic. Geometry is created per call so
// it disposes cleanly when its tile recycles; materials are shared (never
// disposed). 2D pieces are flat, lit, fog-respecting planes (not raw Sprites).

import * as THREE from 'three'
import { CONFIG } from '../config'

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

/** Goat: small hide-coloured body, head and little horns, on four legs. */
export function buildGoat(): THREE.Object3D {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.0), M.goatHide)
  body.position.y = 0.6
  g.add(body)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), M.goatHide)
  head.position.set(0, 0.8, 0.6)
  g.add(head)
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 6), M.goatDark)
    horn.position.set(sx * 0.1, 1.02, 0.6)
    g.add(horn)
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), M.goatDark)
      leg.position.set(sx * 0.18, 0.2, sz * 0.35)
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

export function buildNPC(kind: NpcKind): THREE.Object3D {
  const g = new THREE.Group()
  const torsoMat = kind === 'police' ? NPC_MAT.police : kind === 'agbero' ? NPC_MAT.singlet : NPC_MAT.casual

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.32), torsoMat)
  torso.position.y = 1.05
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), NPC_MAT.skin)
  head.position.y = 1.62
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), NPC_MAT.black)
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), NPC_MAT.black)
  legL.position.set(-0.15, 0.35, 0)
  legR.position.set(0.15, 0.35, 0)
  g.add(torso, head, legL, legR)

  if (kind === 'police') {
    const beret = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 12), NPC_MAT.black)
    beret.position.y = 1.82
    beret.rotation.z = 0.12
    g.add(beret)
  } else if (kind === 'nero') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), NPC_MAT.red)
    cap.position.y = 1.78
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.22), NPC_MAT.red)
    brim.position.set(0, 1.74, 0.22)
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 16), NPC_MAT.gold)
    chain.position.y = 1.18
    chain.rotation.x = Math.PI / 2
    g.add(cap, brim, chain)
  } else {
    // agbero: towel draped over one shoulder, bare arms (singlet).
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.12), NPC_MAT.towel)
    towel.position.set(0.3, 1.1, 0)
    towel.rotation.z = 0.2
    g.add(towel)
  }
  return g
}

export type ModelKind = 'pothole' | 'danfo' | 'keke' | 'barricade' | 'banner' | 'goat'

export const MODELS: Record<ModelKind, () => THREE.Object3D> = {
  pothole: buildPothole,
  danfo: buildDanfo,
  keke: buildKeke,
  barricade: buildBarricade,
  banner: () => buildBanner(CONFIG.ROAD_W),
  goat: buildGoat,
}
