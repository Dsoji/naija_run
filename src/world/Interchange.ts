// The Y-fork interchange (a Y_FORK tile): an expressway-style split where the
// road divides and both branches carry on ahead (geometry in Path.ts). Built in
// the tile's local frame (origin = the entry cell's centre):
//   • asphalt: the shared approach + two S-curving branch ribbons
//   • markings: lane dashes + yellow edges, which split at the painted nose
//   • a raised grass gore island between the branches, kerbed, with yellow /
//     black crash barrels at its tip (hit them from the middle lane = stumble)
//   • an overhead green sign gantry naming each branch, painted lane arrows
//   • grass verges, black/white kerbs and lamp posts — an open interchange,
//     no buildings
// Visuals only; the branch choice is made by lane in Player.

import * as THREE from 'three'
import { CONFIG } from '../config'
import type { Vec2 } from './Tile'
import { forkLatAtFwd, forkSlopeAtFwd, Y_FWD, Y_SHARED } from './Path'
import { ASPHALT_M, DASH_M, KERB_M, WHITE_U, YELLOW_U, matAsphalt, matKerb, matMarkings } from './RoadSurface'
import { mergeByMaterial } from './merge'
import { blotch, grain, makeCanvas, pick, rand } from './paint'

const HALF = CONFIG.TILE_LEN / 2
const ROAD_HALF = CONFIG.ROAD_W / 2
const EDGE = ROAD_HALF - 0.28 // yellow edge-line offset
const STEPS = 48 // samples along a branch curve

/** Forward distance where the two branches' inner edges meet (the painted nose). */
const NOSE_FWD = (() => {
  for (let f = Y_SHARED; f < Y_FWD; f += 0.05) if (forkLatAtFwd(f, 1) >= ROAD_HALF) return f
  return Y_FWD
})()
/** Forward distance where the gap between branches is wide enough for the island. */
const ISLAND_FWD = (() => {
  for (let f = NOSE_FWD; f < Y_FWD; f += 0.05) if (2 * forkLatAtFwd(f, 1) - 2 * ROAD_HALF >= 1.6) return f
  return Y_FWD
})()

// --- textures / materials (shared, never disposed) ------------------------------
function grassTexture(): THREE.CanvasTexture {
  const S = 256
  const [cv, ctx] = makeCanvas(S, S)
  ctx.fillStyle = '#6f7d45'
  ctx.fillRect(0, 0, S, S)
  for (let i = 0; i < 40; i++) {
    blotch(ctx, rand(0, S), rand(0, S), rand(12, 50), pick(['rgba(140,120,70,0.35)', 'rgba(60,80,30,0.3)', 'rgba(170,150,90,0.25)']))
  }
  grain(ctx, S, S, 30)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

const SIGN_NAMES = ['IKORODU RD', 'YABA', 'LEKKI', 'OSHODI']
function signTexture(): THREE.CanvasTexture {
  // 2 columns (left-arrow, right-arrow) × 4 rows (destinations), 512×256 each.
  const [cv, ctx] = makeCanvas(1024, 1024)
  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 4; row++) {
      const x = col * 512
      const y = row * 256
      ctx.fillStyle = '#0f6b3a'
      ctx.fillRect(x + 6, y + 6, 500, 244)
      ctx.strokeStyle = '#f2f2ee'
      ctx.lineWidth = 8
      ctx.strokeRect(x + 18, y + 18, 476, 220)
      // Diagonal arrow (↖ / ↗).
      ctx.save()
      ctx.translate(col ? x + 420 : x + 92, y + 128)
      ctx.rotate(col ? Math.PI / 4 : -Math.PI / 4)
      ctx.fillStyle = '#f2f2ee'
      ctx.fillRect(-11, -20, 22, 70)
      ctx.beginPath()
      ctx.moveTo(-36, -18)
      ctx.lineTo(0, -62)
      ctx.lineTo(36, -18)
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = '#f2f2ee'
      ctx.font = 'bold 64px Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(SIGN_NAMES[row], col ? x + 220 : x + 292, y + 130, 300)
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function arrowTexture(): THREE.CanvasTexture {
  // 3 cells side by side (left, split, right), each 128×384, white paint.
  const [cv, ctx] = makeCanvas(384, 384)
  const shaft = (cx: number, top: number) => ctx.fillRect(cx - 9, top, 18, 330 - top)
  const head = (cx: number, cy: number, ang: number) => {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(ang)
    ctx.beginPath()
    ctx.moveTo(-30, 20)
    ctx.lineTo(0, -30)
    ctx.lineTo(30, 20)
    ctx.fill()
    ctx.restore()
  }
  const bend = (x0: number, dx: number) => {
    ctx.beginPath()
    ctx.moveTo(x0, 200)
    ctx.quadraticCurveTo(x0, 120, x0 + dx, 70)
    ctx.lineWidth = 18
    ctx.stroke()
  }
  ctx.fillStyle = ctx.strokeStyle = '#efeee6'
  shaft(64, 200)
  bend(64, -28)
  head(36, 60, -0.6)
  shaft(192, 200)
  bend(192, -28)
  bend(192, 28)
  head(164, 60, -0.6)
  head(220, 60, 0.6)
  shaft(320, 200)
  bend(320, 28)
  head(348, 60, 0.6)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

const std = (color: number, roughness = 0.85, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra })
const MAT = {
  grass: new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }),
  steel: std(0x9aa0a6, 0.5, { metalness: 0.4 }),
  sign: new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.6 }),
  arrows: new THREE.MeshStandardMaterial({ map: arrowTexture(), alphaTest: 0.4, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  barrelY: std(0xf2c230, 0.6),
  barrelB: std(0x1a1a1a, 0.6),
  pole: std(0xb9bdc2, 0.5, { metalness: 0.3 }),
  lampHead: std(0x3a3a2a, 0.6, { emissive: 0xffe9a8, emissiveIntensity: 0.7 }),
}

// --- geometry builder ------------------------------------------------------------------
type V3 = THREE.Vector3

/** Quads with per-quad normals; each quad is wound to face `hint`. */
class Geo {
  private pos: number[] = []
  private nrm: number[] = []
  private uv: number[] = []
  private idx: number[] = []
  quad(a: V3, b: V3, c: V3, d: V3, uvs: Array<[number, number]>, hint: V3): void {
    const n = b.clone().sub(a).cross(d.clone().sub(a))
    let pts = [a, b, c, d]
    let us = uvs
    if (n.dot(hint) < 0) {
      pts = [a, d, c, b]
      us = [uvs[0], uvs[3], uvs[2], uvs[1]]
      n.negate()
    }
    n.normalize()
    const base = this.pos.length / 3
    pts.forEach((p, i) => {
      this.pos.push(p.x, p.y, p.z)
      this.nrm.push(n.x, n.y, n.z)
      this.uv.push(...us[i])
    })
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  addTo(g: THREE.Object3D, mat: THREE.Material, renderOrder = 0): void {
    if (!this.idx.length) return
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    geo.setIndex(this.idx)
    const m = new THREE.Mesh(geo, mat)
    m.renderOrder = renderOrder
    g.add(m)
  }
}

const UP = new THREE.Vector3(0, 1, 0)

interface Frame {
  dir: Vec2
  r: Vec2
}
/** Centre point, unit tangent and unit right-normal of branch `side` at `fwd`. */
function center(f: Frame, fwd: number, side: number): { p: V3; t: V3; n: V3 } {
  const lat = forkLatAtFwd(fwd, side)
  const slope = forkSlopeAtFwd(fwd, side)
  const p = new THREE.Vector3(f.dir.x * (fwd - HALF) + f.r.x * lat, 0, f.dir.z * (fwd - HALF) + f.r.z * lat)
  const t = new THREE.Vector3(f.dir.x + f.r.x * slope, 0, f.dir.z + f.r.z * slope).normalize()
  return { p, t, n: new THREE.Vector3(-t.z, 0, t.x) }
}

type UVMode =
  | { kind: 'world' } // asphalt / grass: planar metres
  | { kind: 'strip'; u: [number, number]; period: number } // markings: u across, v along the arc
  | { kind: 'along'; period: number } // kerb tops: u along the arc (stone stripes)

/** A flat ribbon along branch `side` from fwd f0 to f1 between lateral offsets
 *  o0(fwd) and o1(fwd) (metres right of the branch centre), at height y. */
function ribbon(
  geo: Geo,
  f: Frame,
  side: number,
  f0: number,
  f1: number,
  o0: (fwd: number) => number,
  o1: (fwd: number) => number,
  y: number,
  uv: UVMode,
  worldScale = ASPHALT_M,
): void {
  const n = Math.max(1, Math.ceil(((f1 - f0) / (Y_FWD - Y_SHARED)) * STEPS))
  let arc = 0
  let prev = center(f, f0, side)
  for (let i = 0; i < n; i++) {
    const fa = f0 + ((f1 - f0) * i) / n
    const fb = f0 + ((f1 - f0) * (i + 1)) / n
    const A = i === 0 ? prev : center(f, fa, side)
    const Bc = center(f, fb, side)
    const seg = A.p.distanceTo(Bc.p)
    const a0 = A.p.clone().addScaledVector(A.n, o0(fa)).setY(y)
    const a1 = A.p.clone().addScaledVector(A.n, o1(fa)).setY(y)
    const b1 = Bc.p.clone().addScaledVector(Bc.n, o1(fb)).setY(y)
    const b0 = Bc.p.clone().addScaledVector(Bc.n, o0(fb)).setY(y)
    let uvs: Array<[number, number]>
    if (uv.kind === 'world') {
      const w = (p: V3): [number, number] => [p.x / worldScale, p.z / worldScale]
      uvs = [w(a0), w(a1), w(b1), w(b0)]
    } else if (uv.kind === 'strip') {
      const [u0, u1] = uv.u
      const va = arc / uv.period
      const vb = (arc + seg) / uv.period
      uvs = [
        [u0, va],
        [u1, va],
        [u1, vb],
        [u0, vb],
      ]
    } else {
      const ua = arc / uv.period
      const ub = (arc + seg) / uv.period
      uvs = [
        [ua, 0],
        [ua, 1],
        [ub, 1],
        [ub, 0],
      ]
    }
    geo.quad(a0, a1, b1, b0, uvs, UP)
    arc += seg
    prev = Bc
  }
}

/** A vertical kerb face along a branch at offset o(fwd), from y 0 to h, facing `faceSign` (±1 = right/left of the branch). */
function kerbFace(geo: Geo, f: Frame, side: number, f0: number, f1: number, o: (fwd: number) => number, h: number, faceSign: number): void {
  const n = Math.max(1, Math.ceil(((f1 - f0) / (Y_FWD - Y_SHARED)) * STEPS))
  let arc = 0
  for (let i = 0; i < n; i++) {
    const fa = f0 + ((f1 - f0) * i) / n
    const fb = f0 + ((f1 - f0) * (i + 1)) / n
    const A = center(f, fa, side)
    const Bc = center(f, fb, side)
    const pa = A.p.clone().addScaledVector(A.n, o(fa))
    const pb = Bc.p.clone().addScaledVector(Bc.n, o(fb))
    const seg = pa.distanceTo(pb)
    const hint = A.n.clone().multiplyScalar(faceSign)
    geo.quad(
      pa.clone().setY(0),
      pb.clone().setY(0),
      pb.clone().setY(h),
      pa.clone().setY(h),
      [
        [arc / KERB_M, 0],
        [(arc + seg) / KERB_M, 0],
        [(arc + seg) / KERB_M, 1],
        [arc / KERB_M, 1],
      ],
      hint,
    )
    arc += seg
  }
}

const c = (v: number) => () => v

// --- the interchange ------------------------------------------------------------------
export function addYFork(g: THREE.Group, dir: Vec2): void {
  const f: Frame = { dir, r: { x: -dir.z, z: dir.x } }
  const asphalt = new Geo()
  const marks = new Geo()
  const grass = new Geo()
  const island = new Geo()
  const kerb = new Geo()

  // Ground: grass over the whole 3-column footprint, under everything.
  ribbon(grass, f, 0, 0, Y_FWD, c(-3 * HALF), c(3 * HALF), -0.03, { kind: 'world' }, 6)

  // Asphalt: the approach, then each branch (they overlap until they part).
  ribbon(asphalt, f, 0, 0, Y_SHARED, c(-ROAD_HALF), c(ROAD_HALF), 0, { kind: 'world' })
  for (const side of [-1, 1]) ribbon(asphalt, f, side, Y_SHARED, Y_FWD, c(-ROAD_HALF), c(ROAD_HALF), 0.001, { kind: 'world' })

  // Markings on the approach.
  const dash: UVMode = { kind: 'strip', u: WHITE_U, period: DASH_M }
  const yellow: UVMode = { kind: 'strip', u: YELLOW_U, period: DASH_M }
  for (const o of [-CONFIG.LANE_W / 2, CONFIG.LANE_W / 2]) ribbon(marks, f, 0, 0, Y_SHARED, c(o - 0.075), c(o + 0.075), 0.01, dash)
  for (const o of [-EDGE, EDGE]) ribbon(marks, f, 0, 0, Y_SHARED, c(o - 0.07), c(o + 0.07), 0.01, yellow)

  for (const side of [-1, 1]) {
    // Outer edge line runs the whole branch; inner edge + lane dashes start at the nose.
    const outer = side * EDGE
    const inner = -side * EDGE
    ribbon(marks, f, side, Y_SHARED, Y_FWD, c(outer - 0.07), c(outer + 0.07), 0.012, yellow)
    ribbon(marks, f, side, NOSE_FWD, Y_FWD, c(inner - 0.07), c(inner + 0.07), 0.012, yellow)
    for (const o of [-CONFIG.LANE_W / 2, CONFIG.LANE_W / 2]) ribbon(marks, f, side, NOSE_FWD + 2, Y_FWD, c(o - 0.075), c(o + 0.075), 0.012, dash)

    // Outer kerb (black/white stones) along the approach side and the branch.
    const ko = side * (ROAD_HALF + 0.12)
    if (side < 0) {
      kerbFace(kerb, f, 0, 0, Y_SHARED, c(-ROAD_HALF), 0.22, 1)
      ribbon(kerb, f, 0, 0, Y_SHARED, c(-ROAD_HALF - 0.25), c(-ROAD_HALF), 0.22, { kind: 'along', period: KERB_M })
    } else {
      kerbFace(kerb, f, 0, 0, Y_SHARED, c(ROAD_HALF), 0.22, -1)
      ribbon(kerb, f, 0, 0, Y_SHARED, c(ROAD_HALF), c(ROAD_HALF + 0.25), 0.22, { kind: 'along', period: KERB_M })
    }
    kerbFace(kerb, f, side, Y_SHARED, Y_FWD, c(side * ROAD_HALF), 0.22, -side)
    ribbon(kerb, f, side, Y_SHARED, Y_FWD, c(ko - 0.12), c(ko + 0.13), 0.22, { kind: 'along', period: KERB_M })
  }

  // Gore island between the branches: raised grass, kerbed on both faces. Its
  // edges follow each branch's inner edge (computed in the left branch's frame).
  const islandEdge = (fwd: number, which: number) => {
    // Lateral (in the approach frame) of the inner edge of branch `which`, inset.
    return forkLatAtFwd(fwd, which) - which * (ROAD_HALF + 0.2)
  }
  ribbon(island, f, 0, ISLAND_FWD, Y_FWD, (fw) => islandEdge(fw, -1), (fw) => islandEdge(fw, 1), 0.2, { kind: 'world' }, 6)
  kerbFace(kerb, f, 0, ISLAND_FWD, Y_FWD, (fw) => islandEdge(fw, -1), 0.2, -1)
  kerbFace(kerb, f, 0, ISLAND_FWD, Y_FWD, (fw) => islandEdge(fw, 1), 0.2, 1)

  asphalt.addTo(g, matAsphalt)
  marks.addTo(g, matMarkings)
  grass.addTo(g, MAT.grass)
  island.addTo(g, MAT.grass)
  kerb.addTo(g, matKerb)

  // Props, merged by material.
  const props = new THREE.Group()
  const at = (fwd: number, lat: number, y: number) =>
    new THREE.Vector3(dir.x * (fwd - HALF) + f.r.x * lat, y, dir.z * (fwd - HALF) + f.r.z * lat)

  // Crash barrels at the island tip: yellow drums with black bands.
  const tipFwd = ISLAND_FWD + 0.6
  const barrels: Array<[number, number]> = [
    [0, 0],
    [0.9, -0.45],
    [0.9, 0.45],
    [1.8, -0.9],
    [1.8, 0],
    [1.8, 0.9],
  ]
  for (const [df, dl] of barrels) {
    const base = at(tipFwd + df, dl, 0)
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.4, 0.95, 12), MAT.barrelY)
    drum.position.copy(base).setY(0.475)
    props.add(drum)
    for (const by of [0.3, 0.7]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.395, 0.405, 0.1, 12), MAT.barrelB)
      band.position.copy(base).setY(by)
      props.add(band)
    }
  }

  // Overhead sign gantry over the approach, a destination sign above each side.
  const gFwd = 3
  const postH = 6.6
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, postH, 0.35), MAT.steel)
    post.position.copy(at(gFwd, s * (ROAD_HALF + 1.0), postH / 2))
    props.add(post)
  }
  const beamW = CONFIG.ROAD_W + 2.4
  const beam = new THREE.Mesh(dir.x === 0 ? new THREE.BoxGeometry(beamW, 0.4, 0.5) : new THREE.BoxGeometry(0.5, 0.4, beamW), MAT.steel)
  beam.position.copy(at(gFwd, 0, postH - 0.2))
  props.add(beam)
  const leftName = Math.floor(Math.random() * SIGN_NAMES.length)
  const rightName = (leftName + 1 + Math.floor(Math.random() * (SIGN_NAMES.length - 1))) % SIGN_NAMES.length
  for (const [s, col, row] of [
    [-1, 0, leftName],
    [1, 1, rightName],
  ] as const) {
    const geo = new THREE.PlaneGeometry(3.4, 1.7)
    const uv = geo.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / 2, 1 - (row + 1 - uv.getY(i)) / 4)
    const sign = new THREE.Mesh(geo, MAT.sign)
    sign.rotation.y = Math.atan2(-dir.x, -dir.z) // face the oncoming runner
    sign.position.copy(at(gFwd - 0.3, s * 2.0, postH - 1.2))
    props.add(sign)
  }

  // Painted lane arrows on the approach: left lane ↖, middle ↖↗, right ↗.
  for (const [lane, cell] of [
    [-1, 0],
    [0, 1],
    [1, 2],
  ] as const) {
    const geo = new THREE.PlaneGeometry(1.3, 3.9)
    const uv = geo.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / 3)
    geo.rotateX(-Math.PI / 2)
    const arrow = new THREE.Mesh(geo, MAT.arrows)
    arrow.rotation.y = Math.atan2(-dir.x, -dir.z)
    arrow.position.copy(at(7, lane * CONFIG.LANE_W, 0.015))
    props.add(arrow)
  }

  // Lamp posts along the outer edges.
  for (const side of [-1, 1]) {
    for (let fwd = 6; fwd < Y_FWD; fwd += 18) {
      const C = center(f, fwd, fwd > Y_SHARED ? side : 0)
      const base = C.p.clone().addScaledVector(C.n, side * (ROAD_HALF + 1.2))
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 9, 6), MAT.pole)
      pole.position.copy(base).setY(4.5)
      props.add(pole)
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.6), MAT.lampHead)
      head.position.copy(base.clone().addScaledVector(C.n, -side * 1.8)).setY(8.9)
      props.add(head)
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 5), MAT.pole)
      arm.position.copy(base.clone().addScaledVector(C.n, -side * 0.9)).setY(9.0)
      arm.quaternion.setFromUnitVectors(UP, C.n)
      props.add(arm)
    }
  }

  g.add(mergeByMaterial(props))
}
