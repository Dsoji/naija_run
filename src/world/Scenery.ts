// Lagos roadside scenery for STRAIGHT tiles (the deferred "Naija vibe" pass).
// Everything is added as children of the tile group so it recycles/disposes with
// the tile for free (see Tile.disposeTile). Visuals only — no colliders.
//
// Approach (2.5D hybrid, per NOTES.md): building MASS is a low-poly box; the
// road-facing FACADE is a flat plane with a pre-baked CanvasTexture (window grid
// + a ground-floor awning carrying a Nigerian shop name). Textures are baked once
// at module load and shared, so the GPU cost is a handful of small textures no
// matter how many buildings stream past; only the per-building geometry churns.

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { CONFIG } from '../config'
import type { Vec2 } from './Tile'
import { buildDanfo, buildKeke, buildTaxi, buildOkada } from './models'
import { blobShadow } from './Shadow'

const ROAD_HALF = CONFIG.ROAD_W / 2
const SIDEWALK = CONFIG.SIDEWALK_W
const VERGE = 2.6 // dusty strip between the curb and the building line
const FACADE_DIST = ROAD_HALF + SIDEWALK + VERGE // lateral distance to building front

// --- Palettes --------------------------------------------------------------
// Muted, slightly weathered walls; bright awnings — the Lagos streetscape read.
const WALL_COLORS = [0xd9c3a3, 0xc98a5e, 0xb6b19c, 0x9fb1bd, 0xd1b07a, 0xc56b55, 0xa7b7a2, 0xe0cfa8]
const AWNING_COLORS = [0xef4444, 0x16a34a, 0xf59e0b, 0x2563eb, 0xdb2777, 0x0891b2, 0x7c3aed]
const SHOP_NAMES = [
  'MAMA PUT',
  "GOD'S TIME",
  'NO WAHALA',
  'BLESSED',
  'OGA STORES',
  'CHOP LIFE',
  'GRACE VENTURES',
  'EL-SHADDAI',
  'NAIJA STYLE',
  'BUKA EXPRESS',
  'CELE PHONES',
  'HUSTLE & PRAY',
]

// --- Shared materials (constant count; never disposed) ---------------------
const matRoof = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 })
const matTank = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.9 })
const matPole = new THREE.MeshStandardMaterial({ color: 0x6b6b6b, roughness: 1 })
const matWood = new THREE.MeshStandardMaterial({ color: 0x4a3b2b, roughness: 1 })
const matTransformer = new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 1 })
const matWire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1 })
const matVerge = new THREE.MeshStandardMaterial({ color: 0x9c7a56, roughness: 1 })
const matConcrete = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.9 }) // bridge pylon/deck
const matCable = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.8 })
const matWater = new THREE.MeshStandardMaterial({ color: 0x2f6f99, roughness: 0.4, metalness: 0.1 })
const matRail = new THREE.MeshStandardMaterial({ color: 0x1f5fa0, roughness: 0.8 }) // bridge railing blue
const matRailTop = new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.8 })
// Market stall / goods materials.
const matStallWood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 1 })
const matSack = new THREE.MeshStandardMaterial({ color: 0xbfa06a, roughness: 1 })
const matBasket = new THREE.MeshStandardMaterial({ color: 0x9b6b3a, roughness: 1 })
const marketCloth = [0xef4444, 0x3b82f6, 0x22c55e, 0xf59e0b, 0xa855f7, 0x06b6d4, 0xdb2777].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }),
)
const goodsMats = [0xef4444, 0xf59e0b, 0x16a34a, 0xeab308, 0x2563eb, 0xdb2777, 0xf97316, 0x9333ea].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }),
)
const matZinc = new THREE.MeshStandardMaterial({ color: 0x6f747a, roughness: 1 }) // corrugated roof
const kioskWalls = [0xb08968, 0x8a8f94, 0xc2704f, 0x6d8a74, 0xb5a642, 0x9a7b5a].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }),
)
const matLampHead = new THREE.MeshStandardMaterial({
  color: 0x3a3a2a,
  emissive: 0xffe9a8,
  emissiveIntensity: 0.8,
  roughness: 1,
})
const kioskMats = AWNING_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }))
const matBoardBack = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 1 })

// Pedestrian + street-clutter materials (shared, never disposed).
const skinMats = [0x6b4a2b, 0x7a5230, 0x8a5a34, 0x5a3b22].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }),
)
const pedShirts = [0xef4444, 0x2563eb, 0x16a34a, 0xf59e0b, 0xdb2777, 0x0891b2, 0xffffff, 0x7c3aed].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }),
)
const matHair = new THREE.MeshStandardMaterial({ color: 0x15110d, roughness: 1 })
const matTrousers = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 1 })
const matTyre = new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 1 })
const matGen = new THREE.MeshStandardMaterial({ color: 0xb0472a, roughness: 1 }) // rusty gen-set

// Big-brand billboard ads (bright backing + bold text), a Lagos-highway staple.
const ADS: Array<{ bg: number; fg: string; name: string; tag: string }> = [
  { bg: 0x16a34a, fg: '#ffffff', name: 'GLO', tag: 'RULE YOUR WORLD' },
  { bg: 0xf59e0b, fg: '#1a1a1a', name: 'MTN', tag: 'EVERYWHERE YOU GO' },
  { bg: 0xdc2626, fg: '#ffffff', name: 'AIRTEL', tag: 'THE SMARTPHONE NETWORK' },
  { bg: 0xb91c1c, fg: '#ffd700', name: 'DANGOTE', tag: 'TOUGHER • STRONGER' },
  { bg: 0xdb2777, fg: '#ffffff', name: 'INDOMIE', tag: 'THE GOOD NOODLES' },
  { bg: 0xf97316, fg: '#2a0a00', name: 'JUMIA', tag: 'SHOP NOW • PAY LESS' },
]

// Wall-mass materials paired 1:1 with facade materials (same base wall colour).
const wallMats: THREE.MeshStandardMaterial[] = []
const facadeMats: THREE.MeshStandardMaterial[] = []

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0')
}

/** Bake one building facade: wall + window grid + ground-floor shop + awning. */
function bakeFacade(wall: number, awning: number, name: string): THREE.CanvasTexture {
  const W = 256
  const H = 448
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!

  // Wall base.
  ctx.fillStyle = hex(wall)
  ctx.fillRect(0, 0, W, H)

  // Faint vertical grime streaks for texture.
  ctx.fillStyle = 'rgba(0,0,0,0.05)'
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * W
    ctx.fillRect(x, 0, 2 + Math.random() * 3, H)
  }

  // Window grid over the upper ~70%.
  const cols = 3
  const rows = 4
  const gx = W * 0.1
  const gy = H * 0.06
  const cellW = (W - gx * 2) / cols
  const cellH = (H * 0.66 - gy) / rows
  const winW = cellW * 0.62
  const winH = cellH * 0.6
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = gx + c * cellW + (cellW - winW) / 2
      const y = gy + r * cellH + (cellH - winH) / 2
      ctx.fillStyle = '#2b2f36' // frame
      ctx.fillRect(x - 2, y - 2, winW + 4, winH + 4)
      // Some windows lit warm, some dark glass.
      ctx.fillStyle = Math.random() < 0.3 ? '#ffd27a' : '#1b2430'
      ctx.fillRect(x, y, winW, winH)
    }
  }

  // Ground floor: awning band + shop name + dark shopfront.
  const gfTop = H * 0.72
  ctx.fillStyle = '#20242b'
  ctx.fillRect(0, gfTop + 46, W, H - gfTop) // shopfront shadow
  // Awning (bright band).
  ctx.fillStyle = hex(awning)
  ctx.fillRect(0, gfTop, W, 46)
  // Scalloped lower edge of the awning.
  ctx.beginPath()
  const scallop = 12
  for (let x = 0; x <= W; x += scallop) {
    ctx.moveTo(x, gfTop + 46)
    ctx.arc(x + scallop / 2, gfTop + 46, scallop / 2, Math.PI, 0, true)
  }
  ctx.fill()
  // Shop name.
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 26px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, W / 2, gfTop + 22, W - 16)
  // Doorway.
  ctx.fillStyle = '#0d1116'
  ctx.fillRect(W / 2 - 24, H - 70, 48, 70)

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

// Bake a varied set once.
for (let i = 0; i < 10; i++) {
  const wall = WALL_COLORS[i % WALL_COLORS.length]
  const awning = AWNING_COLORS[(i * 3) % AWNING_COLORS.length]
  const name = SHOP_NAMES[(i * 5) % SHOP_NAMES.length]
  wallMats.push(new THREE.MeshStandardMaterial({ color: wall, roughness: 1 }))
  facadeMats.push(new THREE.MeshStandardMaterial({ map: bakeFacade(wall, awning, name), roughness: 1 }))
}

/** Bake one billboard advert texture (landscape). */
function bakeAd(ad: { bg: number; fg: string; name: string; tag: string }): THREE.CanvasTexture {
  const W = 512
  const H = 256
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = hex(ad.bg)
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 8
  ctx.strokeRect(10, 10, W - 20, H - 20)
  ctx.fillStyle = ad.fg
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 96px Arial, sans-serif'
  ctx.fillText(ad.name, W / 2, H * 0.42, W - 40)
  ctx.font = 'bold 34px Arial, sans-serif'
  ctx.fillText(ad.tag, W / 2, H * 0.74, W - 40)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}
const adMats = ADS.map((a) => new THREE.MeshStandardMaterial({ map: bakeAd(a), roughness: 1 }))

/** Bake the small roadside "BUS STOP" sign once. */
function bakeBusStopSign(): THREE.CanvasTexture {
  const W = 256
  const H = 112
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#0b4f9c'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 6
  ctx.strokeRect(6, 6, W - 12, H - 12)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 40px Arial, sans-serif'
  ctx.fillText('BUS STOP', W / 2, H / 2, W - 24)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}
const matBusStopSign = new THREE.MeshStandardMaterial({
  map: bakeBusStopSign(),
  roughness: 1,
  side: THREE.DoubleSide,
})

const pick = <T>(a: T[]): T => a[(Math.random() * a.length) | 0]

// Parked-vehicle pool (okada weighted a little higher — they're everywhere).
const VEHICLES = [buildDanfo, buildKeke, buildTaxi, buildOkada, buildOkada]

/** Yaw so a vehicle's local +Z (its length) aligns with the road heading. */
function vehicleYaw(dir: Vec2, reverse: boolean): number {
  return Math.atan2(dir.x, dir.z) + (reverse ? Math.PI : 0)
}

/** Build one building on `side` (-1 left / +1 right of travel) of the tile. */
function addBuilding(g: THREE.Group, dir: Vec2, r: Vec2, side: number): void {
  const idx = (Math.random() * facadeMats.length) | 0
  const alongW = CONFIG.TILE_LEN - (1.5 + Math.random() * 3) // ~15.5–18.5 → near-continuous row
  const depth = 5 + Math.random() * 4
  const h = 5 + Math.random() * 12
  const alongC = (Math.random() - 0.5) * 1.5
  const centerDist = FACADE_DIST + depth / 2

  // Mass box with softly chamfered edges (dims depend on heading axis) — the
  // rounded verticals catch the key light so buildings read as concrete masses
  // rather than flat cubes.
  const boxGeo =
    dir.x === 0
      ? new RoundedBoxGeometry(depth, h, alongW, 2, 0.3)
      : new RoundedBoxGeometry(alongW, h, depth, 2, 0.3)
  const box = new THREE.Mesh(boxGeo, wallMats[idx])
  box.position.set(
    r.x * side * centerDist + dir.x * alongC,
    h / 2,
    r.z * side * centerDist + dir.z * alongC,
  )
  g.add(box)

  // Roof cap.
  const capGeo =
    dir.x === 0
      ? new THREE.BoxGeometry(depth + 0.3, 0.2, alongW + 0.3)
      : new THREE.BoxGeometry(alongW + 0.3, 0.2, depth + 0.3)
  const cap = new THREE.Mesh(capGeo, matRoof)
  cap.position.set(box.position.x, h + 0.1, box.position.z)
  g.add(cap)

  // Road-facing facade plane.
  const facade = new THREE.Mesh(new THREE.PlaneGeometry(alongW * 0.96, h), facadeMats[idx])
  const n = { x: -r.x * side, z: -r.z * side } // normal points toward the road
  facade.rotation.y = Math.atan2(n.x, n.z)
  facade.position.set(
    r.x * side * (FACADE_DIST - 0.03) + dir.x * alongC,
    h / 2,
    r.z * side * (FACADE_DIST - 0.03) + dir.z * alongC,
  )
  g.add(facade)

  // Rooftop water tank (iconic Lagos skyline detail).
  if (Math.random() < 0.45) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 10), matTank)
    tank.position.set(
      box.position.x + r.x * side * (depth * 0.18),
      h + 0.55,
      box.position.z + r.z * side * (depth * 0.18),
    )
    g.add(tank)
  }
}

/** Utility pole on one side; returns the crossbar-end world point for wiring. */
function addPole(g: THREE.Group, dir: Vec2, r: Vec2, side: number, along: number): THREE.Vector3 {
  const h = 5.5
  const lat = ROAD_HALF + SIDEWALK + 0.4
  const px = r.x * side * lat + dir.x * along
  const pz = r.z * side * lat + dir.z * along

  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, h, 0.16), matPole)
  pole.position.set(px, h / 2, pz)
  g.add(pole)

  // Crossbar across the road axis (along r).
  const barGeo =
    dir.x === 0 ? new THREE.BoxGeometry(1.5, 0.12, 0.14) : new THREE.BoxGeometry(0.14, 0.12, 1.5)
  const bar = new THREE.Mesh(barGeo, matWood)
  bar.position.set(px, h - 0.6, pz)
  g.add(bar)

  if (Math.random() < 0.4) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.4), matTransformer)
    t.position.set(px, h - 1.4, pz)
    g.add(t)
  }
  // The inner (road-facing) end of the crossbar, where wires hang from.
  return new THREE.Vector3(px - r.x * side * 0.7, h - 0.6, pz - r.z * side * 0.7)
}

/** Sagging wire strung across the road between two crossbar ends. */
function addWire(g: THREE.Group, a: THREE.Vector3, b: THREE.Vector3): void {
  const mid = a.clone().lerp(b, 0.5)
  mid.y -= 0.9 + Math.random() * 0.5 // droop
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b)
  const geo = new THREE.TubeGeometry(curve, 10, 0.03, 4, false)
  g.add(new THREE.Mesh(geo, matWire))
}

/** Small roadside kiosk near the curb. */
function addKiosk(g: THREE.Group, dir: Vec2, r: Vec2, side: number, along: number): void {
  const lat = ROAD_HALF + SIDEWALK + 0.7
  const bx = r.x * side * lat + dir.x * along
  const bz = r.z * side * lat + dir.z * along
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.4, 1.3), matWood)
  body.position.set(bx, 0.7, bz)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 1.5), pick(kioskMats))
  roof.position.set(bx, 1.5, bz)
  g.add(body, roof)
}

/** Billboard on two posts, elevated and facing the road. */
function addBillboard(g: THREE.Group, dir: Vec2, r: Vec2, side: number, along: number): void {
  const lat = ROAD_HALF + SIDEWALK + 1.2
  const boardW = 6
  const boardH = 3
  const postH = 6 // board sits from postH to postH+boardH
  const cx = r.x * side * lat + dir.x * along
  const cz = r.z * side * lat + dir.z * along

  // Two posts, offset along the road under the board.
  for (const s of [-1, 1]) {
    const px = cx + dir.x * s * (boardW * 0.32)
    const pz = cz + dir.z * s * (boardW * 0.32)
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, postH + boardH * 0.4, 0.25), matPole)
    post.position.set(px, (postH + boardH * 0.4) / 2, pz)
    g.add(post)
  }

  const n = { x: -r.x * side, z: -r.z * side } // toward the road
  const ry = Math.atan2(n.x, n.z)
  const boardY = postH + boardH / 2

  // Board backing (thin box) + ad facade on the road-facing side.
  const back = new THREE.Mesh(new THREE.BoxGeometry(boardW, boardH, 0.2), matBoardBack)
  back.rotation.y = ry
  back.position.set(cx, boardY, cz)
  g.add(back)

  const ad = new THREE.Mesh(new THREE.PlaneGeometry(boardW - 0.2, boardH - 0.2), pick(adMats))
  ad.rotation.y = ry
  ad.position.set(cx + n.x * 0.12, boardY, cz + n.z * 0.12)
  g.add(ad)
}

/** Flat dusty verge strip between curb and buildings on one side. */
function addVerge(g: THREE.Group, dir: Vec2, r: Vec2, side: number): void {
  const inner = ROAD_HALF + SIDEWALK
  const width = VERGE + 3 // extend under the building line
  const mid = inner + width / 2
  const geo =
    dir.x === 0
      ? new THREE.PlaneGeometry(width, CONFIG.TILE_LEN)
      : new THREE.PlaneGeometry(CONFIG.TILE_LEN, width)
  const m = new THREE.Mesh(geo, matVerge)
  m.rotation.x = -Math.PI / 2
  m.position.set(r.x * side * mid, -0.01, r.z * side * mid)
  g.add(m)
}

const UP = new THREE.Vector3(0, 1, 0)

/** A cylinder spanning two points (frame-independent orientation). */
function strut(
  from: THREE.Vector3,
  to: THREE.Vector3,
  rBot: number,
  rTop: number,
  mat: THREE.Material,
): THREE.Mesh {
  const len = from.distanceTo(to)
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 6), mat)
  m.position.copy(from).lerp(to, 0.5)
  m.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize())
  return m
}

/** An axis-aligned box sized (alongLen × h × depth) oriented along `dir`,
 *  centred at `lat` to the side and `along` down the tile. */
function bridgeBox(
  dir: Vec2,
  r: Vec2,
  side: number,
  lat: number,
  along: number,
  y: number,
  alongLen: number,
  h: number,
  depth: number,
  mat: THREE.Material,
): THREE.Mesh {
  const geo =
    dir.x === 0
      ? new THREE.BoxGeometry(depth, h, alongLen)
      : new THREE.BoxGeometry(alongLen, h, depth)
  const m = new THREE.Mesh(geo, mat)
  m.position.set(r.x * side * lat + dir.x * along, y, r.z * side * lat + dir.z * along)
  return m
}

/** Bridge deck surroundings: water below + a railing down each edge. Called for
 *  every BRIDGE tile (the pylon is added separately on the middle tile). */
export function addBridgeDecor(g: THREE.Group, dir: Vec2): void {
  const r = { x: -dir.z, z: dir.x }

  // Wide water plane beneath, covering the near field on both sides.
  const waterW = 180
  const waterGeo =
    dir.x === 0
      ? new THREE.PlaneGeometry(waterW, CONFIG.TILE_LEN)
      : new THREE.PlaneGeometry(CONFIG.TILE_LEN, waterW)
  const water = new THREE.Mesh(waterGeo, matWater)
  water.rotation.x = -Math.PI / 2
  water.position.y = -0.12
  g.add(water)

  // Railings: a low wall + white top rail + a few posts, each side.
  const railLat = ROAD_HALF + 0.3
  for (const side of [-1, 1]) {
    g.add(bridgeBox(dir, r, side, railLat, 0, 0.3, CONFIG.TILE_LEN, 0.5, 0.16, matRail))
    g.add(bridgeBox(dir, r, side, railLat, 0, 0.62, CONFIG.TILE_LEN, 0.1, 0.22, matRailTop))
    for (const a of [-7, 0, 7]) {
      g.add(bridgeBox(dir, r, side, railLat, a, 0.35, 0.16, 0.7, 0.16, matRail))
    }
  }
}

/** The Lekki–Ikoyi Link Bridge pylon: a single leaning tower straddling one edge
 *  of the deck with stay-cables fanning across to both edges. Added by the Track
 *  onto the middle tile of a bridge section. */
export function addBridgePylon(g: THREE.Group, dir: Vec2): void {
  const r = { x: -dir.z, z: dir.x }
  const side = 1 // pylon on the right edge, leaning over the deck
  const H = 27
  const lean = 0.2
  const baseLat = ROAD_HALF + 1.0
  const base = new THREE.Vector3(r.x * side * baseLat, 0, r.z * side * baseLat)
  const n = new THREE.Vector3(-r.x * side, 0, -r.z * side) // toward deck centre
  const top = base
    .clone()
    .add(new THREE.Vector3(0, H * Math.cos(lean), 0))
    .add(n.clone().multiplyScalar(H * Math.sin(lean)))
  g.add(strut(base, top, 1.1, 0.4, matConcrete))
  // A pier block at the base.
  g.add(bridgeBox(dir, r, side, baseLat, 0, 1.0, 2.4, 2.0, 1.6, matConcrete))

  // Stay cables fan from near the top to anchor points along BOTH deck edges.
  const anchorTop = top.clone().setY(top.y - 1.5)
  for (const edge of [-1, 1]) {
    const anchorLat = ROAD_HALF - 0.3
    for (const s of [-8, -4, 0, 4, 8]) {
      const anchor = new THREE.Vector3(
        r.x * edge * anchorLat + dir.x * s,
        1.0,
        r.z * edge * anchorLat + dir.z * s,
      )
      g.add(strut(anchorTop, anchor, 0.05, 0.05, matCable))
    }
  }
}

/** Tall expressway lamp standard (Third Mainland Bridge vibe): pole + curved arm
 *  + a lit head reaching over the road. */
function addExpresswayLamp(g: THREE.Group, dir: Vec2, r: Vec2, side: number, along: number): void {
  const h = 9
  const lat = ROAD_HALF + SIDEWALK + 0.3
  const px = r.x * side * lat + dir.x * along
  const pz = r.z * side * lat + dir.z * along
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h, 6), matPole)
  pole.position.set(px, h / 2, pz)
  g.add(pole)

  // Arm reaching toward the road + lamp head at its end.
  const n = { x: -r.x * side, z: -r.z * side }
  const reach = 2.2
  const armGeo =
    dir.x === 0 ? new THREE.BoxGeometry(0.1, 0.1, reach) : new THREE.BoxGeometry(reach, 0.1, 0.1)
  const arm = new THREE.Mesh(armGeo, matPole)
  arm.position.set(px + n.x * reach * 0.5, h - 0.2, pz + n.z * reach * 0.5)
  g.add(arm)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.4), matLampHead)
  head.position.set(px + n.x * reach, h - 0.35, pz + n.z * reach)
  g.add(head)
}

/** A big colourful market umbrella/parasol over a point (the hero element of a
 *  Nigerian street market). Slight random tilt so a row of them isn't uniform. */
function addUmbrella(g: THREE.Group, sx: number, sz: number, height: number, radius: number): void {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, height, 6), matPole)
  pole.position.set(sx, height / 2, sz)
  const top = new THREE.Mesh(new THREE.ConeGeometry(radius, 0.55, 12), pick(marketCloth))
  top.position.set(sx, height + 0.1, sz)
  top.rotation.z = (Math.random() - 0.5) * 0.22
  top.rotation.x = (Math.random() - 0.5) * 0.22
  g.add(pole, top)
}

/** A roadside seller: either a table of goods or goods spread on a ground mat,
 *  shaded by a big umbrella. Sits just off the road. */
function addMarketStall(g: THREE.Group, dir: Vec2, r: Vec2, side: number, along: number): void {
  const off = ROAD_HALF + 1.4
  const sx = dir.x * along + r.x * off * side
  const sz = dir.z * along + r.z * off * side

  if (Math.random() < 0.55) {
    // Table stall.
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 1.2), matStallWood)
    table.position.set(sx, 0.42, sz)
    g.add(table)
    for (let b = -1; b <= 1; b++) {
      const gd = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.44), pick(goodsMats))
      gd.position.set(sx + dir.x * b * 0.45, 1.0, sz + dir.z * b * 0.45)
      g.add(gd)
    }
  } else {
    // Ground seller: a bright mat with goods piled on it.
    const matGeo =
      dir.x === 0 ? new THREE.PlaneGeometry(1.5, 1.7) : new THREE.PlaneGeometry(1.7, 1.5)
    const mat = new THREE.Mesh(matGeo, pick(marketCloth))
    mat.rotation.x = -Math.PI / 2
    mat.position.set(sx, 0.02, sz)
    g.add(mat)
    for (let b = 0; b < 3; b++) {
      const gd = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.38), pick(goodsMats))
      gd.position.set(sx + (Math.random() - 0.5) * 0.9, 0.14, sz + (Math.random() - 0.5) * 0.9)
      g.add(gd)
    }
  }

  // Big umbrella over the stall (kept mostly off the lanes; it's high up anyway).
  addUmbrella(g, sx, sz, 2.3 + Math.random() * 0.5, 1.15 + Math.random() * 0.35)

  // A sack or basket on the ground toward the road.
  if (Math.random() < 0.4) {
    const toRoad = 0.9
    const item =
      Math.random() < 0.5
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.5, 8), matSack)
        : new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.38, 8), matBasket)
    item.position.set(sx - r.x * side * toRoad, 0.25, sz - r.z * side * toRoad)
    g.add(item)
  }
}

/** Low makeshift kiosks/shacks (zinc roofs, painted walls) as the market backdrop
 *  — replaces the tall city buildings so it reads as an informal market. */
function addMarketBackdrop(g: THREE.Group, dir: Vec2, r: Vec2, side: number): void {
  const baseLat = ROAD_HALF + SIDEWALK + VERGE
  for (const a of [-5, 5]) {
    const w = 7 + Math.random() * 2
    const depth = 2.2 + Math.random()
    const h = 2.0 + Math.random() * 0.8
    const centerLat = baseLat + depth / 2
    const bx = r.x * side * centerLat + dir.x * a
    const bz = r.z * side * centerLat + dir.z * a

    const bodyGeo =
      dir.x === 0 ? new THREE.BoxGeometry(depth, h, w) : new THREE.BoxGeometry(w, h, depth)
    const body = new THREE.Mesh(bodyGeo, pick(kioskWalls))
    body.position.set(bx, h / 2, bz)
    g.add(body)

    // Overhanging corrugated zinc roof, tilted slightly toward the road.
    const roofGeo =
      dir.x === 0
        ? new THREE.BoxGeometry(depth + 0.8, 0.12, w + 0.4)
        : new THREE.BoxGeometry(w + 0.4, 0.12, depth + 0.8)
    const roof = new THREE.Mesh(roofGeo, matZinc)
    roof.position.set(bx, h + 0.12, bz)
    if (dir.x === 0) roof.rotation.z = side * 0.08
    else roof.rotation.x = -side * 0.08
    g.add(roof)
  }
}

/** A Nigerian street market: low kiosks/shacks as a backdrop, roadside sellers
 *  with big umbrellas lining the road, goods on tables and mats. Overhead tarps
 *  are sparse with big gaps so the road and obstacles stay clearly visible. */
export function addMarketScenery(g: THREE.Group, dir: Vec2): void {
  const r = { x: -dir.z, z: dir.x }

  for (const side of [-1, 1]) {
    addVerge(g, dir, r, side)
    addMarketBackdrop(g, dir, r, side)
    for (const a of [-7, -3.5, 0, 3.5, 7]) {
      addMarketStall(g, dir, r, side, a + (Math.random() - 0.5) * 0.8)
    }
  }

  // At most one narrow overhead tarp per tile (big gaps → road stays visible).
  if (Math.random() < 0.45) {
    const a = (Math.random() - 0.5) * 10
    const span = CONFIG.ROAD_W + 1
    const geo =
      dir.x === 0 ? new THREE.BoxGeometry(span, 0.1, 1.6) : new THREE.BoxGeometry(1.6, 0.1, span)
    const tarp = new THREE.Mesh(geo, pick(marketCloth))
    tarp.position.set(dir.x * a, 3.6, dir.z * a)
    g.add(tarp)
  }
}

/** A vehicle parked along the kerb (visual only, kept off the lanes). Lagos
 *  streets are lined with danfos, taxis, keke and okada at rest. */
function addParkedVehicle(g: THREE.Group, dir: Vec2, r: Vec2, side: number, along: number): void {
  const lat = ROAD_HALF + 1.25 + Math.random() * 0.4 // inner edge clears the road
  const v = pick(VEHICLES)()
  v.position.set(r.x * side * lat + dir.x * along, 0, r.z * side * lat + dir.z * along)
  v.rotation.y = vehicleYaw(dir, Math.random() < 0.5)
  g.add(v)
}

/** A simple standing figure on the sidewalk; ~1 in 3 is a hawker balancing a
 *  tray on the head. Cheap box build (not the rigged Humanoid) — it's set
 *  dressing seen at speed, so a handful of boxes reads fine. */
function addPedestrian(g: THREE.Group, dir: Vec2, r: Vec2, side: number, along: number): void {
  const lat = ROAD_HALF + 0.5 + Math.random() * 0.8 // on the sidewalk
  const x = r.x * side * lat + dir.x * along
  const z = r.z * side * lat + dir.z * along

  const shadow = blobShadow(0.3, 0.3)
  shadow.position.set(x, 0.02, z)
  g.add(shadow)
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.22), matTrousers)
  legs.position.set(x, 0.25, z)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.24), pick(pedShirts))
  torso.position.set(x, 0.72, z)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.2), pick(skinMats))
  head.position.set(x, 1.05, z)
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.22), matHair)
  hair.position.set(x, 1.17, z)
  g.add(legs, torso, head, hair)

  if (Math.random() < 0.35) {
    // Hawker's tray/basin balanced on the head, with a couple of goods.
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.16, 10), matBasket)
    tray.position.set(x, 1.32, z)
    g.add(tray)
    for (let i = 0; i < 2; i++) {
      const gd = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), pick(goodsMats))
      gd.position.set(x + (Math.random() - 0.5) * 0.3, 1.46, z + (Math.random() - 0.5) * 0.3)
      g.add(gd)
    }
  }
}

/** A roadside bus stop: two posts, a zinc roof, a bench and a sign to the road. */
function addBusStop(g: THREE.Group, dir: Vec2, r: Vec2, side: number, along: number): void {
  const lat = ROAD_HALF + SIDEWALK + 0.6
  const cx = r.x * side * lat + dir.x * along
  const cz = r.z * side * lat + dir.z * along

  for (const s of [-1, 1]) {
    const px = cx + dir.x * s * 1.3
    const pz = cz + dir.z * s * 1.3
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), matPole)
    post.position.set(px, 1.1, pz)
    g.add(post)
  }
  const roofGeo =
    dir.x === 0 ? new THREE.BoxGeometry(1.4, 0.1, 3.0) : new THREE.BoxGeometry(3.0, 0.1, 1.4)
  const roof = new THREE.Mesh(roofGeo, matZinc)
  roof.position.set(cx, 2.2, cz)
  g.add(roof)

  const benchGeo =
    dir.x === 0 ? new THREE.BoxGeometry(0.4, 0.12, 2.4) : new THREE.BoxGeometry(2.4, 0.12, 0.4)
  const bench = new THREE.Mesh(benchGeo, matWood)
  bench.position.set(cx + r.x * side * 0.2, 0.5, cz + r.z * side * 0.2)
  g.add(bench)

  const n = { x: -r.x * side, z: -r.z * side } // toward the road
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), matBusStopSign)
  sign.rotation.y = Math.atan2(n.x, n.z)
  sign.position.set(cx + n.x * 0.1, 1.75, cz + n.z * 0.1)
  g.add(sign)
}

/** Small street clutter near the kerb: a stack of tyres or a rusty gen-set. */
function addClutter(g: THREE.Group, dir: Vec2, r: Vec2, side: number, along: number): void {
  const lat = ROAD_HALF + 0.7
  const x = r.x * side * lat + dir.x * along
  const z = r.z * side * lat + dir.z * along
  if (Math.random() < 0.6) {
    for (let i = 0; i < 3; i++) {
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 12), matTyre)
      tyre.position.set(x, 0.1 + i * 0.17, z)
      g.add(tyre)
    }
  } else {
    const gen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.5), matGen)
    gen.position.set(x, 0.25, z)
    g.add(gen)
  }
}

/** Populate a STRAIGHT tile group with Lagos roadside scenery. */
export function addStreetScenery(g: THREE.Group, dir: Vec2): void {
  const r = { x: -dir.z, z: dir.x } // rightOf(dir)

  // Dusty verge + a building on each side (continuous street wall), plus kerbside
  // life: parked vehicles and bits of clutter.
  for (const side of [-1, 1]) {
    addVerge(g, dir, r, side)
    addBuilding(g, dir, r, side)
    if (Math.random() < 0.3) addKiosk(g, dir, r, side, (Math.random() - 0.5) * 12)
    if (Math.random() < 0.32) addParkedVehicle(g, dir, r, side, (Math.random() - 0.5) * 14)
    if (Math.random() < 0.15) addClutter(g, dir, r, side, (Math.random() - 0.5) * 14)
  }

  // Pedestrians / hawkers on the sidewalks (up to two per tile).
  for (const side of [-1, 1]) {
    if (Math.random() < 0.5) addPedestrian(g, dir, r, side, (Math.random() - 0.5) * 16)
  }

  // Occasional bus stop on one side.
  if (Math.random() < 0.08) {
    const side = Math.random() < 0.5 ? -1 : 1
    addBusStop(g, dir, r, side, (Math.random() - 0.5) * 8)
  }

  // Utility poles (each side independently) + a wire across the road if both.
  const ends: (THREE.Vector3 | null)[] = [null, null]
  ;[-1, 1].forEach((side, i) => {
    if (Math.random() < 0.6) ends[i] = addPole(g, dir, r, side, (Math.random() - 0.5) * 10)
  })
  if (ends[0] && ends[1]) addWire(g, ends[0], ends[1])

  // Occasional billboard on one side.
  if (Math.random() < 0.22) {
    const side = Math.random() < 0.5 ? -1 : 1
    addBillboard(g, dir, r, side, (Math.random() - 0.5) * 8)
  }

  // Expressway lamp standards (Third Mainland vibe).
  if (Math.random() < 0.18) {
    const side = Math.random() < 0.5 ? -1 : 1
    addExpresswayLamp(g, dir, r, side, (Math.random() - 0.5) * 10)
  }
}
