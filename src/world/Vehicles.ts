// Procedural Lagos vehicles: the danfo and the keke (the "vehicle pass" from
// docs/CASE_STUDY_DANFO_RUN.md). Built from simple parts, but with the details
// that make them read as Lagos: a Kombi-shaped Eko-yellow danfo with black
// bands, round headlights, pipe bumpers, a route painted over the windscreen,
// a slogan on the back, a Lagos plate, a roof rack piled with Ghana-must-go bags,
// rust and stickers, and a conductor hanging out of the open sliding door; a
// yellow-and-green keke with its canopy, driver and painted rear flap.
//
// Cost: a handful of PROTOTYPE variants are built once (lazily), with every
// part merged by material (~10 meshes each). Spawns are clones that share that
// geometry — flagged userData.shared so tile recycling (Tile.disposeTile) and
// Thief traffic clean-up never dispose it. Each clone gets its own blob shadow.
// Built facing −Z (front), length along Z, right side = +X (door side).

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { buildHumanoid, type HumanoidMats } from './Humanoid'
import { blobShadow } from './Shadow'
import { mergeByMaterial } from './merge'
import { blotch, makeCanvas, pick, rand } from './paint'

// --- texture atlas: slogans, routes, plates, stickers, wear, bag prints ----
const AT = 1024
const SLOGANS = ['NO CONDITION IS PERMANENT', "GOD'S TIME IS THE BEST", 'EKO O NI BAJE', 'HUSTLE NO DEY KILL']
const ROUTES = ['OSHODI', 'CMS • OBALENDE', 'IKEJA', 'MILE 12']
const PLATES = ['KJA 482 XA', 'LND 217 FG', 'APP 903 KT', 'EKY 351 BD']

interface Rect {
  x: number
  y: number
  w: number
  h: number
}
const slogan = (i: number): Rect => ({ x: 0, y: i * 64, w: 512, h: 64 })
const route = (i: number): Rect => ({ x: 512, y: i * 64, w: 512, h: 64 })
const plate = (i: number): Rect => ({ x: i * 256, y: 256, w: 256, h: 96 })
const tile128 = (i: number, row: number): Rect => ({ x: i * 128, y: 384 + row * 128, w: 128, h: 128 })
const RUST = [tile128(0, 0), tile128(1, 0)]
const DENT = tile128(2, 0)
const SCRAPE = tile128(3, 0)
const STICKERS = [tile128(4, 0), tile128(5, 0), tile128(6, 0), tile128(7, 0)] // GOD DEY, flag, no smoking, MYB
const PLAID = [tile128(0, 1), tile128(1, 1)]
const CARTON = tile128(2, 1)
const KEKE_FLAP = (i: number): Rect => ({ x: 512 + (i % 2) * 256, y: 512 + Math.floor(i / 2) * 128, w: 256, h: 128 })

function paintAtlas(): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(AT, AT)
  const text = (r: Rect, s: string, color: string, size: number, font = 'bold') => {
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `${font} ${size}px Arial, sans-serif`
    ctx.fillText(s, r.x + r.w / 2, r.y + r.h / 2 + 2, r.w - 24)
  }
  // Slogans: hand-painted white letters with a dark outline (transparent bg).
  SLOGANS.forEach((s, i) => {
    const r = slogan(i)
    ctx.lineWidth = 6
    ctx.strokeStyle = '#151515'
    ctx.font = 'bold 40px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.strokeText(s, r.x + r.w / 2, r.y + r.h / 2 + 2, r.w - 24)
    text(r, s, '#f7f3e8', 40)
  })
  // Route names: black paint straight onto the yellow body (transparent bg).
  ROUTES.forEach((s, i) => text(route(i), s, '#161616', 46))
  // Lagos plates.
  PLATES.forEach((s, i) => {
    const r = plate(i)
    ctx.fillStyle = '#f4f4f0'
    ctx.fillRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12)
    ctx.fillStyle = '#1f4fa0'
    ctx.font = 'bold 18px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('LAGOS', r.x + r.w / 2, r.y + 20)
    ctx.fillStyle = '#2f8f3a'
    ctx.font = '11px Arial, sans-serif'
    ctx.fillText('CENTRE OF EXCELLENCE', r.x + r.w / 2, r.y + r.h - 16)
    ctx.fillStyle = '#111'
    ctx.font = 'bold 38px Arial, sans-serif'
    ctx.fillText(s, r.x + r.w / 2, r.y + r.h / 2 + 2, r.w - 24)
    ctx.strokeStyle = '#222'
    ctx.lineWidth = 3
    ctx.strokeRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12)
  })
  // Rust patches + dent + scrape (alpha-edged decals).
  for (const r of RUST) {
    for (let i = 0; i < 9; i++) {
      blotch(ctx, r.x + 64 + rand(-30, 30), r.y + 64 + rand(-30, 30), rand(12, 34), `rgba(${pick(['122,58,26', '96,44,20', '150,82,40'])},0.85)`)
    }
  }
  blotch(ctx, DENT.x + 64, DENT.y + 64, 50, 'rgba(0,0,0,0.35)')
  blotch(ctx, DENT.x + 54, DENT.y + 54, 26, 'rgba(255,255,255,0.25)')
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `rgba(170,170,165,${rand(0.6, 0.95)})`
    ctx.fillRect(SCRAPE.x + rand(10, 100), SCRAPE.y + 50 + rand(-20, 20), rand(14, 40), rand(1.5, 3))
  }
  // Stickers.
  {
    const r = STICKERS[0] // GOD DEY
    ctx.fillStyle = '#f4f1e6'
    ctx.beginPath()
    ctx.arc(r.x + 64, r.y + 64, 56, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 6
    ctx.strokeStyle = '#1f6f3a'
    ctx.stroke()
    text(r, 'GOD DEY', '#b3261e', 26)
  }
  {
    const r = STICKERS[1] // flag
    ctx.fillStyle = '#118a3e'
    ctx.fillRect(r.x + 10, r.y + 30, 36, 68)
    ctx.fillRect(r.x + 82, r.y + 30, 36, 68)
    ctx.fillStyle = '#f7f7f2'
    ctx.fillRect(r.x + 46, r.y + 30, 36, 68)
  }
  {
    const r = STICKERS[2] // no smoking
    ctx.fillStyle = '#f7f7f2'
    ctx.beginPath()
    ctx.arc(r.x + 64, r.y + 64, 52, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#222'
    ctx.fillRect(r.x + 30, r.y + 58, 60, 12)
    ctx.strokeStyle = '#d0281d'
    ctx.lineWidth = 9
    ctx.beginPath()
    ctx.arc(r.x + 64, r.y + 64, 48, 0, Math.PI * 2)
    ctx.moveTo(r.x + 30, r.y + 30)
    ctx.lineTo(r.x + 98, r.y + 98)
    ctx.stroke()
  }
  {
    const r = STICKERS[3] // MIND YOUR BUSINESS
    ctx.fillStyle = '#121212'
    ctx.fillRect(r.x + 6, r.y + 34, 116, 60)
    ctx.fillStyle = '#f2c230'
    ctx.font = 'bold 17px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('MIND YOUR', r.x + 64, r.y + 54)
    ctx.fillText('BUSINESS', r.x + 64, r.y + 76)
  }
  // Ghana-must-go plaid (two colourways) and cardboard.
  PLAID.forEach((r, i) => {
    ctx.fillStyle = '#efefe8'
    ctx.fillRect(r.x, r.y, r.w, r.h)
    const [a, b] = i ? ['#2a4fa8', '#1d6b3a'] : ['#c0392b', '#2a4fa8']
    for (let k = 0; k < 128; k += 32) {
      ctx.fillStyle = a
      ctx.globalAlpha = 0.75
      ctx.fillRect(r.x + k, r.y, 12, r.h)
      ctx.fillStyle = b
      ctx.fillRect(r.x, r.y + k + 16, r.w, 12)
      ctx.globalAlpha = 1
    }
  })
  ctx.fillStyle = '#b08a5a'
  ctx.fillRect(CARTON.x, CARTON.y, CARTON.w, CARTON.h)
  ctx.fillStyle = 'rgba(80,56,30,0.6)'
  ctx.fillRect(CARTON.x + 58, CARTON.y, 12, CARTON.h) // tape
  // Keke rear flaps: dark canvas with a painted saying.
  ;['NO TELL ANYBODY', 'JESUS IS MY PILOT', 'SLOW AND STEADY', 'MAMA PRAYERS'].forEach((s, i) => {
    const r = KEKE_FLAP(i)
    ctx.fillStyle = i % 2 ? '#1d4d2c' : '#161616'
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.fillStyle = '#f2c230'
    ctx.font = 'bold 26px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(s, r.x + r.w / 2, r.y + r.h / 2, r.w - 20)
  })
  return cv
}

let atlasMat: THREE.MeshStandardMaterial | null = null
function matAtlas(): THREE.MeshStandardMaterial {
  if (!atlasMat) {
    const cv = paintAtlas()
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    atlasMat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, roughness: 0.7 })
  }
  return atlasMat
}

/** Remap a geometry's 0..1 UVs onto an atlas rect (CanvasTexture: flipY). */
function onRect<G extends THREE.BufferGeometry>(geo: G, r: Rect): G {
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (r.x + uv.getX(i) * r.w) / AT, 1 - (r.y + (1 - uv.getY(i)) * r.h) / AT)
  }
  return geo
}

// --- shared materials ----------------------------------------------------------
const std = (color: number, roughness = 0.8, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra })
const MAT = {
  yellow: std(0xe39e12, 0.5), // deep Eko yellow — ACES tone mapping lifts and desaturates it
  black: std(0x141414, 0.7),
  glass: std(0x1b2a3a, 0.2, { metalness: 0.3 }),
  steel: std(0x8a8d90, 0.45, { metalness: 0.5 }),
  chrome: std(0xc9ccd0, 0.3, { metalness: 0.7 }),
  tyre: std(0x111111, 1),
  lamp: std(0xfff3d0, 0.3, { emissive: 0xfff0c0, emissiveIntensity: 0.5 }),
  tail: std(0xc01818, 0.4, { emissive: 0xff2010, emissiveIntensity: 0.45 }),
  amber: std(0xf08a10, 0.4, { emissive: 0xf08a10, emissiveIntensity: 0.3 }),
  interior: std(0x1a1612, 1),
  drum: std(0x2a5fa0, 0.6),
  green: std(0x1e7a3a, 0.6),
  canopy: std(0x1b1b1b, 0.9),
  seat: std(0x3a2a20, 0.9),
}
const PEOPLE: HumanoidMats[] = [0xe74c3c, 0x2e86de, 0xf1c40f, 0x16a085].map((shirt) => ({
  shirt: std(shirt, 1),
  trouser: std(0x2d3436, 1),
  skin: std(0x6b4a2b, 1),
  hair: std(0x15110d, 1),
  shoe: std(0x1a1a1a, 1),
}))

// --- part helpers (all positions in the vehicle's local frame) ---------------
type Part = THREE.Mesh

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): Part {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  return m
}
function rbox(w: number, h: number, d: number, r: number, mat: THREE.Material, x: number, y: number, z: number): Part {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), mat)
  m.position.set(x, y, z)
  return m
}
/** Cylinder whose axis runs along X (wheels, bumper pipes, lying drums). */
function cylX(r: number, len: number, mat: THREE.Material, x: number, y: number, z: number, seg = 14): Part {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat)
  m.rotation.z = Math.PI / 2
  m.position.set(x, y, z)
  return m
}
/** Cylinder whose axis runs along Z (round headlights). */
function cylZ(r: number, len: number, mat: THREE.Material, x: number, y: number, z: number): Part {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat)
  m.rotation.x = Math.PI / 2
  m.position.set(x, y, z)
  return m
}
/** A flat decal facing `face` (+x/−x/+z/−z), from the atlas or a plain material. */
function decal(w: number, h: number, face: 'px' | 'nx' | 'pz' | 'nz', x: number, y: number, z: number, rectOrMat: Rect | THREE.Material): Part {
  const geo = new THREE.PlaneGeometry(w, h)
  const mat = rectOrMat instanceof THREE.Material ? rectOrMat : matAtlas()
  if (!(rectOrMat instanceof THREE.Material)) onRect(geo, rectOrMat)
  const m = new THREE.Mesh(geo, mat)
  m.rotation.y = { pz: 0, nz: Math.PI, px: Math.PI / 2, nx: -Math.PI / 2 }[face]
  m.position.set(x, y, z)
  return m
}
function wheel(parts: Part[], r: number, w: number, x: number, z: number): void {
  parts.push(cylX(r, w, MAT.tyre, x, r, z, 16))
  parts.push(cylX(r * 0.6, w + 0.02, MAT.steel, x, r, z, 12))
}

function instance(proto: THREE.Group, halfW: number, halfL: number): THREE.Object3D {
  const c = proto.clone(true) // shares geometry; userData.shared is copied
  c.add(blobShadow(halfW, halfL)) // added after: its own geometry, disposes normally
  return c
}

// --- danfo ---------------------------------------------------------------------
interface DanfoOpts {
  slogan: number
  route: number
  plate: number
  doorOpen: boolean
  load: 'heavy' | 'light' | 'none'
  wear: number // 0..1
}

function buildDanfoParts(o: DanfoOpts): THREE.Group {
  const root = new THREE.Group()
  const P: Part[] = []
  const W = 1.8
  const L = 3.7
  const zF = -L / 2 // front face
  const zR = L / 2

  // Wheels + body (lower shell and the window-band cabin).
  for (const sx of [-1, 1]) for (const z of [-1.15, 1.2]) wheel(P, 0.33, 0.22, sx * 0.8, z)
  P.push(rbox(W, 0.78, L, 0.08, MAT.yellow, 0, 0.69, 0))
  P.push(rbox(W - 0.02, 0.86, L - 0.08, 0.12, MAT.yellow, 0, 1.51, 0))
  const xs = W / 2 - 0.01 + 0.004 // side surface (+ a hair, against z-fighting)

  // Black bands along both sides (around the open door on the right).
  for (const side of [-1, 1]) {
    const face = side > 0 ? 'px' : 'nx'
    const segs: Array<[number, number]> = side > 0 && o.doorOpen ? [[-1.8, -0.78], [0.28, 1.8]] : [[-1.8, 1.8]]
    for (const [z0, z1] of segs) {
      P.push(decal(z1 - z0, 0.1, face, side * (xs + 0.002), 1.07, (z0 + z1) / 2, MAT.black))
      P.push(decal(z1 - z0, 0.07, face, side * (xs + 0.002), 0.9, (z0 + z1) / 2, MAT.black))
    }
    // Window band: cab window, then three passenger windows (pillars between).
    const wins: Array<[number, number]> = [
      [-1.6, -0.98],
      [-0.75, -0.08],
      [0.12, 0.82],
      [1.02, 1.62],
    ]
    for (const [z0, z1] of wins) {
      if (side > 0 && o.doorOpen && z1 > -0.8 && z0 < 0.3) continue // door opening
      P.push(decal(z1 - z0, 0.5, face, side * (xs + 0.006), 1.52, (z0 + z1) / 2, MAT.glass))
    }
    // Mirror on a little arm.
    P.push(box(0.2, 0.03, 0.03, MAT.black, side * 0.98, 1.4, -1.62))
    P.push(box(0.05, 0.16, 0.11, MAT.black, side * 1.06, 1.46, -1.62))
    // Mudflap behind each rear wheel.
    P.push(decal(0.32, 0.34, 'pz', side * 0.8, 0.32, 1.56, MAT.black))
  }

  // Sliding door: opening shows the dark interior; the door panel slides back.
  if (o.doorOpen) {
    P.push(decal(1.04, 1.5, 'px', xs + 0.004, 1.1, -0.25, MAT.interior))
    P.push(box(0.04, 1.5, 1.0, MAT.yellow, W / 2 + 0.03, 1.1, 0.72))
    P.push(decal(0.8, 0.46, 'px', W / 2 + 0.052, 1.52, 0.72, MAT.glass))
    P.push(decal(1.0, 0.1, 'px', W / 2 + 0.052, 1.07, 0.72, MAT.black))
  }

  // Front: split windscreen, route name, round lamps, grille, pipe bumper, plate.
  P.push(decal(1.58, 0.62, 'nz', 0, 1.55, zF + 0.02, MAT.glass))
  P.push(decal(0.04, 0.62, 'nz', 0, 1.55, zF + 0.012, MAT.black))
  P.push(decal(1.3, 0.16, 'nz', 0, 1.88, zF + 0.025, route(o.route)))
  for (const sx of [-1, 1]) {
    P.push(cylZ(0.12, 0.06, MAT.chrome, sx * 0.6, 0.82, zF - 0.01))
    P.push(cylZ(0.095, 0.07, MAT.lamp, sx * 0.6, 0.82, zF - 0.02))
    P.push(box(0.12, 0.07, 0.03, MAT.amber, sx * 0.78, 0.66, zF - 0.01))
  }
  P.push(decal(0.7, 0.16, 'nz', 0, 0.84, zF - 0.005, MAT.black))
  P.push(cylX(0.045, 1.92, MAT.chrome, 0, 0.45, zF - 0.12))
  for (const sx of [-1, 1]) P.push(box(0.05, 0.05, 0.14, MAT.steel, sx * 0.55, 0.45, zF - 0.05))
  P.push(decal(0.5, 0.18, 'nz', 0, 0.6, zF - 0.008, plate(o.plate)))

  // Rear: window, slogan, tail lamps, bumper, plate, stickers.
  P.push(decal(1.3, 0.5, 'pz', 0, 1.6, zR - 0.02, MAT.glass))
  P.push(decal(1.5, 0.19, 'pz', 0, 1.22, zR + 0.006, slogan(o.slogan)))
  for (const sx of [-1, 1]) P.push(box(0.18, 0.24, 0.04, MAT.tail, sx * 0.72, 0.9, zR + 0.01))
  P.push(cylX(0.045, 1.92, MAT.chrome, 0, 0.45, zR + 0.12))
  for (const sx of [-1, 1]) P.push(box(0.05, 0.05, 0.14, MAT.steel, sx * 0.55, 0.45, zR + 0.05))
  P.push(decal(0.5, 0.18, 'pz', 0, 0.62, zR + 0.008, plate(o.plate)))
  P.push(decal(0.26, 0.26, 'pz', -0.55, 0.98, zR + 0.008, pick(STICKERS)))
  if (Math.random() < 0.7) P.push(decal(0.24, 0.24, 'pz', 0.5, 0.98, zR + 0.008, pick(STICKERS)))

  // Wear: rust round the arches, a dent, scrapes, a side sticker.
  const nWear = Math.round(2 + o.wear * 5)
  for (let i = 0; i < nWear; i++) {
    const side = Math.random() < 0.5 ? -1 : 1
    const s = rand(0.22, 0.45)
    const r = Math.random()
    const rect = r < 0.55 ? pick(RUST) : r < 0.75 ? DENT : SCRAPE
    let z = pick([-1.15, 1.2]) + rand(-0.45, 0.45)
    if (side > 0 && o.doorOpen && z > -0.85 && z < 0.35) z = 1.25
    P.push(decal(s, s, side > 0 ? 'px' : 'nx', side * (xs + 0.008), rand(0.45, 0.85), z, rect))
  }
  P.push(decal(0.22, 0.22, 'nx', -(xs + 0.008), 1.25, rand(-1.2, 1.2), pick(STICKERS)))

  // Roof rack + load.
  const yRoof = 1.94
  if (o.load !== 'none') {
    for (const sx of [-1, 1]) {
      P.push(box(0.04, 0.04, 2.7, MAT.black, sx * 0.8, yRoof + 0.12, 0))
      for (const z of [-1.3, 1.3]) P.push(box(0.04, 0.12, 0.04, MAT.black, sx * 0.8, yRoof + 0.06, z))
    }
    for (const z of [-1.3, -0.45, 0.45, 1.3]) P.push(box(1.64, 0.03, 0.04, MAT.black, 0, yRoof + 0.12, z))
    const items = o.load === 'heavy' ? 5 : 2
    let z = -1.0
    for (let i = 0; i < items && z < 1.15; i++) {
      const kind = Math.random()
      if (kind < 0.5) {
        const d = rand(0.45, 0.6)
        const bag = new THREE.Mesh(onRect(new RoundedBoxGeometry(rand(0.6, 0.9), rand(0.32, 0.45), d, 2, 0.08), pick(PLAID)), matAtlas())
        bag.position.set(rand(-0.3, 0.3), yRoof + 0.32, z + d / 2)
        bag.rotation.y = rand(-0.2, 0.2)
        P.push(bag)
        z += d + 0.05
      } else if (kind < 0.75) {
        P.push(cylX(0.24, rand(0.7, 0.95), MAT.drum, rand(-0.15, 0.15), yRoof + 0.38, z + 0.26))
        z += 0.55
      } else {
        const d = rand(0.4, 0.55)
        const ct = new THREE.Mesh(onRect(new THREE.BoxGeometry(rand(0.5, 0.8), rand(0.3, 0.45), d), CARTON), matAtlas())
        ct.position.set(rand(-0.3, 0.3), yRoof + 0.3, z + d / 2)
        P.push(ct)
        z += d + 0.05
      }
    }
  }

  for (const p of P) root.add(p)

  // The conductor, hanging out of the open door with a hand on the roof.
  if (o.doorOpen) {
    const h = buildHumanoid(pick(PEOPLE))
    h.armR.rotation.x = -2.7 // reaching up to the door frame
    h.armL.rotation.x = -0.6
    h.armL.rotation.z = 0.9 // waving at passengers
    h.legL.rotation.x = 0.3
    h.group.scale.setScalar(0.88)
    h.group.rotation.x = -0.18 // lean forward…
    const pivot = new THREE.Group()
    pivot.add(h.group)
    pivot.rotation.y = -Math.PI / 2 // …facing out of the door (+x)
    pivot.position.set(0.72, 0.32, -0.3) // head stays within the 1.0 m collider half-width
    root.add(pivot)
  }
  return mergeByMaterial(root, true)
}

let danfoProtos: THREE.Group[] | null = null
/** A Lagos danfo (clone of one of several prebuilt variants). Facing −Z. */
export function danfoInstance(): THREE.Object3D {
  if (!danfoProtos) {
    danfoProtos = [0, 1, 2, 3, 4, 5].map((i) =>
      buildDanfoParts({
        slogan: i % SLOGANS.length,
        route: (i + 1) % ROUTES.length,
        plate: (i + 2) % PLATES.length,
        doorOpen: i % 3 !== 2,
        load: (['heavy', 'light', 'heavy', 'none', 'light', 'heavy'] as const)[i],
        wear: [0.9, 0.4, 0.7, 0.2, 1, 0.5][i],
      }),
    )
  }
  return instance(pick(danfoProtos), 1.25, 2.1)
}

// --- keke ----------------------------------------------------------------------
function buildKekeParts(flap: number, canopy: THREE.Material): THREE.Group {
  const root = new THREE.Group()
  const P: Part[] = []
  // Wheels: one at the front, two at the back.
  wheel(P, 0.22, 0.14, 0, -0.85)
  for (const sx of [-1, 1]) wheel(P, 0.25, 0.16, sx * 0.6, 0.7)
  // Rear passenger tub, narrow front nose, black front fender.
  P.push(rbox(1.3, 0.55, 1.5, 0.1, MAT.yellow, 0, 0.6, 0.3))
  P.push(rbox(0.78, 0.8, 0.62, 0.12, MAT.yellow, 0, 0.66, -0.72))
  P.push(box(0.3, 0.06, 0.4, MAT.black, 0, 0.5, -0.88))
  // Green stripe along the tub + nose.
  for (const side of [-1, 1]) {
    P.push(decal(1.5, 0.1, side > 0 ? 'px' : 'nx', side * 0.655, 0.62, 0.3, MAT.green))
  }
  P.push(decal(0.6, 0.08, 'nz', 0, 0.62, -1.035, MAT.green))
  // Headlight, windscreen, handlebar.
  P.push(cylZ(0.1, 0.06, MAT.chrome, 0, 0.88, -1.04))
  P.push(cylZ(0.08, 0.07, MAT.lamp, 0, 0.88, -1.05))
  const ws = decal(0.88, 0.55, 'nz', 0, 1.3, -0.98, MAT.glass)
  ws.rotation.x = 0.22 // top leans back
  P.push(ws)
  P.push(box(0.6, 0.03, 0.03, MAT.chrome, 0, 1.05, -0.62))
  // Canopy on four poles; rear canvas flap with its painted saying + plate.
  P.push(rbox(1.38, 0.1, 1.95, 0.04, canopy, 0, 1.8, 0.05))
  for (const sx of [-1, 1]) {
    for (const z of [-0.9, 0.98]) P.push(box(0.04, 0.95, 0.04, MAT.black, sx * 0.62, 1.3, z))
  }
  P.push(box(1.26, 0.6, 0.03, canopy, 0, 1.45, 1.0))
  P.push(decal(1.1, 0.5, 'pz', 0, 1.45, 1.02, KEKE_FLAP(flap)))
  P.push(decal(0.4, 0.15, 'pz', 0, 0.52, 1.06, plate(flap % PLATES.length)))
  for (const sx of [-1, 1]) P.push(box(0.12, 0.1, 0.03, MAT.tail, sx * 0.5, 0.7, 1.06))
  // Seats.
  P.push(box(1.1, 0.4, 0.4, MAT.seat, 0, 1.0, 0.62))
  P.push(box(0.4, 0.15, 0.35, MAT.seat, 0, 0.98, -0.3))
  for (const p of P) root.add(p)

  // The driver, seated, hands on the bars.
  const h = buildHumanoid(pick(PEOPLE))
  h.legL.rotation.x = h.legR.rotation.x = -1.45
  h.armL.rotation.x = h.armR.rotation.x = -1.1
  h.group.scale.setScalar(0.82)
  h.group.position.set(0, 0.28, -0.25)
  root.add(h.group)
  return mergeByMaterial(root, true)
}

let kekeProtos: THREE.Group[] | null = null
/** A Lagos keke napep (clone of a prebuilt variant). Facing −Z. */
export function kekeInstance(): THREE.Object3D {
  if (!kekeProtos) {
    kekeProtos = [
      buildKekeParts(0, MAT.canopy),
      buildKekeParts(1, MAT.green),
      buildKekeParts(2, MAT.canopy),
      buildKekeParts(3, MAT.green),
    ]
  }
  return instance(pick(kekeProtos), 0.85, 1.25)
}
