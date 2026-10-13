// Lagos bridge crossings, modelled from reference photos (Wikimedia Commons):
//
//   IKOYI LINK BRIDGE — a white X-shaped concrete pylon standing in a wide
//   median, legs crossing about halfway up with a ladder of crossbeams (and the
//   famous coloured lights) above, white stay-cables fanning down along the
//   median; black/white median barriers, a raised walkway with a chunky
//   concrete balustrade and tall lamp posts on each edge; high over the lagoon.
//
//   THIRD MAINLAND BRIDGE — long and low over a murky lagoon: black/white
//   jersey barriers on both edges and the median, a parapet with a steel rail,
//   double-arm lamps in the median, concrete piers under every span; canoes and
//   fishermen, fishing stakes and brush-park traps, water hyacinth, and
//   clusters of Makoko stilt houses out on the water.
//
// The player's carriageway is the normal 3-lane road at lateral 0 (laid by
// Tile.ts); everything here is scenery in the tile's along/lateral frame, with
// the opposite carriageway on the left (−lateral). Parts are merged by material
// per tile. The lagoon sits DROP metres below the deck; it shows because the
// world ground plane doesn't write depth (see Game.ts), and sea walls close
// off the water where each bridge meets land.

import * as THREE from 'three'
import { CONFIG } from '../config'
import type { Vec2 } from './Tile'
import { addStraightRoad } from './RoadSurface'
import { buildHumanoid, type HumanoidMats } from './Humanoid'
import { mergeByMaterial } from './merge'
import { blotch, grain, makeCanvas, pick, rand } from './paint'

export type BridgeKind = 'ikoyi' | 'thirdMainland'

export const BRIDGE_NAMES: Record<BridgeKind, string> = {
  ikoyi: 'Ikoyi Link Bridge',
  thirdMainland: 'Third Mainland Bridge',
}

const HALF = CONFIG.TILE_LEN / 2
const DROP: Record<BridgeKind, number> = { ikoyi: 7, thirdMainland: 4.5 } // deck → water
const WATER_HALF_W = 160 // lagoon reaches past the fog either side

// --- textures ------------------------------------------------------------------
function rippleTexture(): THREE.CanvasTexture {
  const S = 256
  const [cv, ctx] = makeCanvas(S, S)
  ctx.fillStyle = '#9a9a9a'
  ctx.fillRect(0, 0, S, S)
  // Short choppy wavelets (not long streaks — those read as brushed metal).
  for (let i = 0; i < 420; i++) {
    const y = Math.random() * S
    const x = Math.random() * S
    const w = rand(3, 12)
    const h = rand(0.8, 1.8)
    ctx.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${rand(0.05, 0.14)})` : `rgba(0,0,0,${rand(0.05, 0.12)})`
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      ctx.beginPath()
      ctx.ellipse(x + ox, y + oy, w, h, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  grain(ctx, S, S, 10)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

function quayTexture(): THREE.CanvasTexture {
  const [cv, ctx] = makeCanvas(128, 256)
  ctx.fillStyle = '#a7a296'
  ctx.fillRect(0, 0, 128, 256)
  const g = ctx.createLinearGradient(0, 160, 0, 256) // algae + waterline stain
  g.addColorStop(0, 'rgba(60,70,40,0)')
  g.addColorStop(0.5, 'rgba(50,62,34,0.55)')
  g.addColorStop(1, 'rgba(30,36,24,0.85)')
  ctx.fillStyle = g
  ctx.fillRect(0, 160, 128, 96)
  for (let y = 0; y < 256; y += 32) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(0, y, 128, 2) // block courses
  }
  for (let i = 0; i < 10; i++) blotch(ctx, rand(0, 128), rand(0, 200), rand(8, 30), 'rgba(60,50,40,0.15)')
  grain(ctx, 128, 256, 16)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  return tex
}

function hyacinthTexture(): THREE.CanvasTexture {
  const [cv, ctx] = makeCanvas(128, 128)
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * 50
    ctx.fillStyle = pick(['#3f7a2e', '#4f8f36', '#2f5f24', '#6aa042'])
    ctx.beginPath()
    ctx.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, rand(4, 9), 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = '#b48fd8' // the odd lilac flower
    ctx.beginPath()
    ctx.arc(64 + rand(-40, 40), 64 + rand(-40, 40), 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const texRipple = rippleTexture()

/** Drift the lagoon ripples. Call once per frame. */
export function tickWater(dt: number): void {
  texRipple.offset.x += dt * 0.012
  texRipple.offset.y += dt * 0.004
}

// --- materials (shared, never disposed) --------------------------------------
const std = (color: number, roughness = 0.85, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra })
const MAT = {
  pylon: std(0xeceae5, 0.75),
  concrete: std(0xd6d2c9),
  deck: std(0xa9a49a),
  barrierW: std(0xf0efea, 0.7),
  barrierB: std(0x1d1d1f, 0.7),
  cable: std(0xf6f6f3, 0.35),
  steel: std(0x8c9196, 0.45, { metalness: 0.4 }),
  pole: std(0xb9bdc2, 0.5, { metalness: 0.3 }),
  lampHead: std(0x3a3a2a, 0.6, { emissive: 0xffe9a8, emissiveIntensity: 0.7 }),
  ledRed: std(0xff3040, 0.4, { emissive: 0xff2030, emissiveIntensity: 1.0 }),
  ledBlue: std(0x3060ff, 0.4, { emissive: 0x2050ff, emissiveIntensity: 1.0 }),
  ledAmber: std(0xffb020, 0.4, { emissive: 0xffa010, emissiveIntensity: 1.0 }),
  waterIkoyi: std(0x6c8a83, 0.5, { map: texRipple, envMapIntensity: 0.6 }),
  waterTmb: std(0x6c6a4a, 0.6, { map: texRipple, envMapIntensity: 0.5 }),
  quay: std(0xffffff, 0.95, { map: quayTexture() }),
  canoe: std(0x5a3b22, 0.9),
  canoeIn: std(0x2e1f12, 1),
  stake: std(0x3b2e22, 1),
  brush: std(0x6e6150, 1),
  shackWood: [0x7a5a3a, 0x8b6d4b, 0x5e4630, 0x6f6a5c].map((c) => std(c, 1)),
  zinc: std(0x7d756a, 0.7, { metalness: 0.2 }),
  rust: std(0x8b4a2b, 0.9),
  hyacinth: new THREE.MeshStandardMaterial({ map: hyacinthTexture(), alphaTest: 0.5, roughness: 0.9 }),
}
const FISHERMEN: HumanoidMats[] = [0xd35400, 0x2e86de, 0xf1c40f].map((shirt) => ({
  shirt: std(shirt, 1),
  trouser: std(0x3b3b3b, 1),
  skin: std(0x5e3f24, 1),
  hair: std(0x15110d, 1),
  shoe: std(0x2a2a2a, 1),
}))

// --- frame helpers ---------------------------------------------------------------
interface Frame {
  dir: Vec2
  r: Vec2
  root: THREE.Group // scaffold, merged at the end
}
const P = (f: Frame, along: number, lat: number, y: number) =>
  new THREE.Vector3(f.dir.x * along + f.r.x * lat, y, f.dir.z * along + f.r.z * lat)

/** Axis-aligned box: `len` along the road, `w` across it. */
function box(f: Frame, along: number, lat: number, y: number, len: number, h: number, w: number, mat: THREE.Material): void {
  const geo = f.dir.x === 0 ? new THREE.BoxGeometry(w, h, len) : new THREE.BoxGeometry(len, h, w)
  const m = new THREE.Mesh(geo, mat)
  m.position.copy(P(f, along, lat, y))
  f.root.add(m)
}

const UP = new THREE.Vector3(0, 1, 0)
/** A tapered member between two points (square section when seg = 4). */
function strut(f: Frame, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, mat: THREE.Material, seg = 6): void {
  const geo = new THREE.CylinderGeometry(r1, r0, a.distanceTo(b), seg)
  if (seg === 4) geo.rotateY(Math.PI / 4)
  const m = new THREE.Mesh(geo, mat)
  m.position.copy(a).lerp(b, 0.5)
  m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize())
  f.root.add(m)
}

/** A row of 2 m jersey barriers, alternating black/white, down the tile. */
function barriers(f: Frame, lat: number): void {
  for (let i = 0; i < CONFIG.TILE_LEN / 2; i++) {
    const along = -HALF + 1 + i * 2
    const mat = i % 2 ? MAT.barrierB : MAT.barrierW
    box(f, along, lat, 0.18, 1.96, 0.36, 0.6, mat)
    box(f, along, lat, 0.6, 1.96, 0.5, 0.3, mat)
  }
}

/** A tall lamp standard at `lat`, with arms reaching toward each `armDir` (±1). */
function lamp(f: Frame, along: number, lat: number, base: number, armDirs: number[]): void {
  const h = 10.5
  strut(f, P(f, along, lat, base), P(f, along, lat, base + h), 0.16, 0.1, MAT.pole)
  for (const s of armDirs) {
    const end = P(f, along, lat + s * 2.6, base + h + 0.3)
    strut(f, P(f, along, lat, base + h - 0.4), end, 0.06, 0.05, MAT.pole)
    box(f, along, lat + s * 2.6, base + h + 0.2, 0.45, 0.18, 0.7, MAT.lampHead)
  }
}

/** Lagoon water under the tile, UVs in metres so ripples flow across tiles. */
function water(f: Frame, kind: BridgeKind): void {
  const alongX = f.dir.x !== 0
  const geo = alongX
    ? new THREE.PlaneGeometry(CONFIG.TILE_LEN, WATER_HALF_W * 2)
    : new THREE.PlaneGeometry(WATER_HALF_W * 2, CONFIG.TILE_LEN)
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, -DROP[kind], 0)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 5, pos.getZ(i) / 5)
  f.root.add(new THREE.Mesh(geo, kind === 'ikoyi' ? MAT.waterIkoyi : MAT.waterTmb))
}

/** Sea wall where the bridge meets land: closes the lagoon off at `along`,
 *  facing the water (`face` = +1 faces along +dir). */
function seaWall(f: Frame, kind: BridgeKind, along: number, face: number): void {
  const h = DROP[kind] + 0.3
  const geo = new THREE.PlaneGeometry(WATER_HALF_W * 2, h)
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (WATER_HALF_W / 4))
  const m = new THREE.Mesh(geo, MAT.quay)
  m.rotation.y = Math.atan2(f.dir.x * face, f.dir.z * face)
  m.position.copy(P(f, along, 0, -h / 2 - 0.03))
  f.root.add(m)
}

// --- lagoon life -------------------------------------------------------------------
function canoe(f: Frame, along: number, lat: number, y: number, withFisherman: boolean): void {
  const Lc = rand(4.2, 6)
  const Wc = rand(0.38, 0.5)
  const shape = new THREE.Shape()
  shape.moveTo(-Lc / 2, 0)
  shape.quadraticCurveTo(0, Wc * 2, Lc / 2, 0)
  shape.quadraticCurveTo(0, -Wc * 2, -Lc / 2, 0)
  const yaw = rand(0, Math.PI * 2)
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.38, bevelEnabled: false }), MAT.canoe)
  hull.geometry.rotateX(-Math.PI / 2)
  hull.rotation.y = yaw
  hull.position.copy(P(f, along, lat, y - 0.12))
  f.root.add(hull)
  const inner = new THREE.Mesh(new THREE.ShapeGeometry(shape), MAT.canoeIn)
  inner.geometry.rotateX(-Math.PI / 2)
  inner.scale.set(0.86, 1, 0.7)
  inner.rotation.y = yaw
  inner.position.copy(P(f, along, lat, y + 0.27))
  f.root.add(inner)
  if (withFisherman) {
    const h = buildHumanoid(pick(FISHERMEN))
    h.armR.rotation.x = -1.2 // working a paddle / casting
    h.armL.rotation.x = -0.7
    h.group.rotation.y = yaw + Math.PI / 2
    h.group.position.copy(P(f, along, lat, y + 0.2))
    f.root.add(h.group)
    // The paddle / pole.
    const top = h.group.position.clone().add(new THREE.Vector3(0, 2.2, 0))
    strut(f, h.group.position.clone().add(new THREE.Vector3(0.3, -0.4, 0.2)), top, 0.03, 0.03, MAT.stake, 4)
  }
}

function stakeRow(f: Frame, along: number, lat: number, y: number): void {
  const n = 8 + Math.floor(Math.random() * 10)
  const a = rand(0, Math.PI)
  for (let i = 0; i < n; i++) {
    const da = Math.cos(a) * i * 1.4
    const dl = Math.sin(a) * i * 1.4
    const h = rand(1.0, 2.2)
    strut(f, P(f, along + da, lat + dl, y - 0.5), P(f, along + da + rand(-0.1, 0.1), lat + dl, y + h), 0.06, 0.04, MAT.stake, 4)
  }
}

function brushPark(f: Frame, along: number, lat: number, y: number): void {
  const w = rand(5, 9)
  const l = rand(6, 10)
  for (let i = 0; i < 46; i++) {
    const a = along + rand(-l / 2, l / 2)
    const b = lat + rand(-w / 2, w / 2)
    strut(f, P(f, a, b, y - 0.3), P(f, a + rand(-0.4, 0.4), b + rand(-0.4, 0.4), y + rand(0.6, 1.4)), 0.035, 0.02, MAT.brush, 4)
  }
}

function hyacinth(f: Frame, along: number, lat: number, y: number, size: number): void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * rand(0.6, 1)), MAT.hyacinth)
  m.geometry.rotateX(-Math.PI / 2)
  m.rotation.y = rand(0, Math.PI * 2)
  m.position.copy(P(f, along, lat, y + 0.04))
  f.root.add(m)
}

/** A Makoko-style cluster: wooden shacks on stilts with zinc roofs, plank walks. */
function stiltVillage(f: Frame, along: number, lat: number, y: number): void {
  const n = 4 + Math.floor(Math.random() * 5)
  for (let i = 0; i < n; i++) {
    const a = along + rand(-14, 14)
    const b = lat + rand(-12, 12)
    const floor = y + rand(1.2, 1.8)
    const w = rand(3, 4.5)
    const d = rand(2.6, 3.6)
    for (const sa of [-1, 1]) for (const sb of [-1, 0, 1]) {
      strut(f, P(f, a + (sa * w) / 2.2, b + (sb * d) / 2.2, y - 0.8), P(f, a + (sa * w) / 2.2, b + (sb * d) / 2.2, floor), 0.08, 0.07, MAT.stake, 4)
    }
    box(f, a, b, floor + 0.06, w + 0.6, 0.12, d + 0.6, MAT.shackWood[0])
    const wh = rand(1.9, 2.4)
    box(f, a, b, floor + 0.12 + wh / 2, w, wh, d, pick(MAT.shackWood))
    // Sloping zinc roof (one-sided pitch), often rusty.
    const roof = new THREE.Mesh(
      f.dir.x === 0 ? new THREE.BoxGeometry(d + 0.5, 0.08, w + 0.6) : new THREE.BoxGeometry(w + 0.6, 0.08, d + 0.5),
      Math.random() < 0.5 ? MAT.rust : MAT.zinc,
    )
    roof.position.copy(P(f, a, b, floor + 0.12 + wh + 0.25))
    if (f.dir.x === 0) roof.rotation.z = rand(-0.18, 0.18)
    else roof.rotation.x = rand(-0.18, 0.18)
    f.root.add(roof)
    // Doorway + plank walk toward the next shack.
    box(f, a, b - d / 2 - 0.01, floor + 1.0, 0.8, 1.6, 0.02, MAT.canoeIn)
    if (i) box(f, a, b - d / 2 - 1.4, floor + 0.02, 0.5, 0.06, 2.6, MAT.shackWood[2])
  }
  canoe(f, along + rand(-6, 6), lat - 16, y, false)
}

function lagoonLife(f: Frame, kind: BridgeKind, idx: number): void {
  const y = -DROP[kind]
  const busy = kind === 'thirdMainland'
  for (const side of [1, -1]) {
    // Keep clear of the deck (and the opposite carriageway on the left).
    const near = side > 0 ? 16 : busy ? 26 : 32
    const lat = () => side * rand(near, 90)
    const along = () => rand(-HALF, HALF)
    if (Math.random() < (busy ? 0.6 : 0.4)) for (let k = 0; k < 3; k++) hyacinth(f, along(), lat(), y, rand(3, 8))
    if (Math.random() < (busy ? 0.4 : 0.2)) canoe(f, along(), lat(), y, Math.random() < 0.7)
    if (!busy) continue
    if (Math.random() < 0.35) stakeRow(f, along(), lat(), y)
    if (Math.random() < 0.18) brushPark(f, along(), side * rand(near + 8, 70), y)
  }
  if (busy && idx % 5 === 2 && Math.random() < 0.75) stiltVillage(f, 0, rand(42, 70), y)
}

// --- the two bridges ------------------------------------------------------------------
/** Ikoyi deck layout (lateral): walkway 3.9→5.9, balustrade to 6.3 on the right;
 *  median barrier, 4 m median (pylon at −6.5), barrier, opposite carriageway
 *  centred −13, walkway + balustrade to −19.3 on the left. */
const IK = { walkR: 4.9, balR: 6.1, bar1: -4.2, pylon: -6.5, bar2: -8.8, opp: -13.0, walkL: -17.9, balL: -19.1, edgeL: -19.3, edgeR: 6.3 }

function walkwayAndBalustrade(f: Frame, walkLat: number, balLat: number): void {
  box(f, 0, walkLat, 0.11, CONFIG.TILE_LEN, 0.22, 2.0, MAT.concrete)
  box(f, 0, balLat, 0.37, CONFIG.TILE_LEN, 0.3, 0.42, MAT.concrete)
  for (let a = -HALF + 0.25; a < HALF; a += 0.5) box(f, a, balLat, 0.8, 0.16, 0.56, 0.16, MAT.concrete)
  box(f, 0, balLat, 1.18, CONFIG.TILE_LEN, 0.24, 0.44, MAT.concrete)
}

function ikoyiTile(f: Frame, idx: number, len: number): void {
  walkwayAndBalustrade(f, IK.walkR, IK.balR)
  walkwayAndBalustrade(f, IK.walkL, IK.balL)
  barriers(f, IK.bar1)
  barriers(f, IK.bar2)
  box(f, 0, (IK.bar1 + IK.bar2) / 2, 0.06, CONFIG.TILE_LEN, 0.12, 4.0, MAT.concrete) // median
  // Deck slab + fascia (what you see of the bridge from the water).
  const deckW = IK.edgeR - IK.edgeL
  box(f, 0, (IK.edgeR + IK.edgeL) / 2, -0.75, CONFIG.TILE_LEN, 1.4, deckW, MAT.deck)
  // Lamp standards on both walkways, staggered.
  lamp(f, 0, IK.walkR + 0.6, 0.22, [-1])
  lamp(f, -HALF, IK.walkL - 0.6, 0.22, [1])
  // Twin-column piers every other span.
  if (idx % 2 === 0) {
    for (const lat of [0, IK.opp]) {
      box(f, -HALF + 1, lat, -1.9, 2.4, 1.0, 9, MAT.deck)
      for (const s of [-1, 1]) strut(f, P(f, -HALF + 1, lat + s * 2.6, -DROP.ikoyi - 1), P(f, -HALF + 1, lat + s * 2.6, -2.2), 1.0, 0.85, MAT.deck, 10)
    }
  }
  if (idx === len >> 1) ikoyiPylon(f)
}

/** The X-shaped pylon in the median with its fan of stay-cables. */
function ikoyiPylon(f: Frame): void {
  const H = 48
  const c = IK.pylon
  const spread = 1.6 // half-spacing of the legs at deck level (fits inside the median)
  const legLat = (side: number, y: number) => c + side * (spread - ((2 * spread + 0.4) * y) / H)
  for (const side of [-1, 1]) {
    strut(f, P(f, 0, legLat(side, 0), 0), P(f, 0, legLat(side, H), H), 0.95, 0.5, MAT.pylon, 4)
    box(f, 0, legLat(side, 0), 0.5, 2.2, 1.0, 1.6, MAT.pylon) // plinth
    // Pointed tip.
    strut(f, P(f, 0, legLat(side, H), H), P(f, 0, legLat(side, H) - side * 0.2, H + 3.2), 0.5, 0.05, MAT.pylon, 4)
  }
  // Ladder of crossbeams where the legs diverge again (the cable anchorage).
  for (let y = H * 0.6; y < H * 0.98; y += 3.2) {
    const a = legLat(-1, y)
    const b = legLat(1, y)
    box(f, 0, (a + b) / 2, y, 1.0, 0.55, Math.abs(b - a), MAT.pylon)
  }
  // Signature lights near the top.
  const leds = [MAT.ledRed, MAT.ledBlue, MAT.ledAmber]
  leds.forEach((mat, i) => {
    const y = H * (0.93 - i * 0.06)
    for (const s of [-1, 1]) box(f, s * 0.52, c, y, 0.05, 1.2, 1.1, mat)
  })
  // Stay-cables: one plane along the median, eight each way.
  for (const dirSign of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const top = P(f, dirSign * 0.45, c, H * (0.62 + (i / 7) * 0.32))
      const anchor = P(f, dirSign * (12 + i * 8), c, 0.3)
      strut(f, top, anchor, 0.07, 0.07, MAT.cable, 5)
    }
  }
}

/** Third Mainland deck layout (lateral): barrier 4.25 + parapet/rail 4.9 on the
 *  right; median barriers −4.25 / −5.75 with lamps at −5.0; opposite
 *  carriageway centred −9.95; barrier −14.15 + parapet −14.8 on the left. */
const TM = { bar: 4.25, par: 4.9, medA: -4.25, medLamp: -5.0, medB: -5.75, opp: -9.95, barL: -14.15, parL: -14.8, edgeR: 5.05, edgeL: -14.95 }

function parapetWithRail(f: Frame, lat: number): void {
  box(f, 0, lat, 0.35, CONFIG.TILE_LEN, 0.7, 0.3, MAT.concrete)
  for (let a = -HALF + 1.25; a < HALF; a += 2.5) box(f, a, lat, 0.95, 0.08, 0.5, 0.08, MAT.steel)
  box(f, 0, lat, 1.18, CONFIG.TILE_LEN, 0.06, 0.08, MAT.steel)
  box(f, 0, lat, 0.98, CONFIG.TILE_LEN, 0.05, 0.06, MAT.steel)
}

function thirdMainlandTile(f: Frame): void {
  barriers(f, TM.bar)
  barriers(f, TM.medA)
  barriers(f, TM.medB)
  barriers(f, TM.barL)
  parapetWithRail(f, TM.par)
  parapetWithRail(f, TM.parL)
  box(f, 0, TM.medLamp, 0.06, CONFIG.TILE_LEN, 0.12, 0.9, MAT.concrete)
  lamp(f, 0, TM.medLamp, 0.12, [1, -1])
  const deckW = TM.edgeR - TM.edgeL
  box(f, 0, (TM.edgeR + TM.edgeL) / 2, -0.6, CONFIG.TILE_LEN, 1.1, deckW, MAT.deck)
  // A pier under every span: crosshead + twin square columns per carriageway.
  for (const lat of [0, TM.opp]) {
    box(f, -HALF + 0.8, lat, -1.6, 1.4, 0.9, 8.6, MAT.deck)
    for (const s of [-1, 1]) {
      strut(f, P(f, -HALF + 0.8, lat + s * 2.8, -DROP.thirdMainland - 0.8), P(f, -HALF + 0.8, lat + s * 2.8, -1.9), 0.62, 0.55, MAT.deck, 4)
    }
  }
}

/** Dress one BRIDGE tile (`idx` of `len` in this crossing). The player's road
 *  itself is already laid by Tile.ts. */
export function addBridgeSection(g: THREE.Group, dir: Vec2, kind: BridgeKind, idx: number, len: number): void {
  const r = { x: -dir.z, z: dir.x }
  const f: Frame = { dir, r, root: new THREE.Group() }

  // Opposite carriageway: the same road surface, shifted left.
  const opp = new THREE.Group()
  const off = kind === 'ikoyi' ? IK.opp : TM.opp
  opp.position.set(r.x * off, 0, r.z * off)
  addStraightRoad(opp, dir, 'bridge')
  g.add(opp)

  if (kind === 'ikoyi') ikoyiTile(f, idx, len)
  else thirdMainlandTile(f)
  water(f, kind)
  lagoonLife(f, kind, idx)
  if (idx === 0) seaWall(f, kind, -HALF, 1)
  if (idx === len - 1) seaWall(f, kind, HALF, -1)

  g.add(mergeByMaterial(f.root))
}

