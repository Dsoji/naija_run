// Textured Lagos road surface (the "road pass" from docs/CASE_STUDY_DANFO_RUN.md).
//
// Detail lives in textures, not polygons: every texture here is painted once at
// module load onto a canvas (no asset files, nothing to license), and each tile
// adds only a handful of merged meshes:
//   asphalt  — one tiling gritty-asphalt map, UVs in world metres so it never seams
//   markings — dashed white lanes + solid yellow edge lines (one alpha-tested map)
//   grime    — oil drips down each lane + sand drifted into the gutters
//   decals   — oil stains, tar patches, cracks, manholes, drains, skid marks,
//              sachet-water litter, zebra bars… all from ONE atlas, merged per tile
//   kerb     — black-and-white painted kerb stones + an interlocking-paver sidewalk
// Visuals only — obstacles/colliders are unaffected. Decorative decals never
// include potholes: a pothole on the road always means the real obstacle.

import * as THREE from 'three'
import { CONFIG } from '../config'
import type { Vec2 } from './Tile'

const HALF = CONFIG.TILE_LEN / 2
const ROAD_HALF = CONFIG.ROAD_W / 2

const ASPHALT_M = 4 // metres covered by one asphalt texture repeat (divides TILE_LEN)
const PAVER_M = 2 // metres per sidewalk paver repeat
const KERB_M = 2 // one black + one white kerb stone
const DASH_M = 5 // lane-dash period: 3 m paint, 2 m gap
const GRIME_M = 10 // oil-drip / gutter-sand repeat
const KERB_W = 0.22
const KERB_H = 0.27
const SLAB_H = 0.25

// --- canvas helpers --------------------------------------------------------
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  return [cv, cv.getContext('2d')!]
}

function toTexture(cv: HTMLCanvasElement, wrapS: boolean, wrapT: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8 // clamped to the GPU max by three
  tex.wrapS = wrapS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  tex.wrapT = wrapT ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  return tex
}

/** Draw `fn` at every wrapped offset so marks crossing an edge tile seamlessly. */
function wrapped(w: number, h: number, fn: (ox: number, oy: number) => void): void {
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) fn(ox, oy)
}

/** Per-pixel grain (aggregate speckle). Tiles by construction. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amp: number, stones = 0): void {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    let n = (Math.random() - 0.5) * amp
    const s = Math.random()
    if (s < stones) n += rand(28, 60) // light aggregate chip
    else if (s < stones * 2) n -= rand(18, 34) // dark pit
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n * 0.92
  }
  ctx.putImageData(img, 0, 0)
}

function blotch(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgba: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba)
  g.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

/** A wandering hairline crack starting at (x, y). */
function crack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  steps: number,
  len: number,
  rng: () => number = Math.random,
): void {
  const r = (a: number, b: number) => a + rng() * (b - a)
  let a = r(0, Math.PI * 2)
  ctx.beginPath()
  ctx.moveTo(x, y)
  for (let i = 0; i < steps; i++) {
    a += r(-0.7, 0.7)
    x += Math.cos(a) * len * r(0.6, 1.2)
    y += Math.sin(a) * len * r(0.6, 1.2)
    ctx.lineTo(x, y)
  }
  ctx.stroke()
}

/** Tiny seeded LCG, so a mark can be redrawn identically at each wrap offset. */
function lcg(seed: number): () => number {
  let s = Math.floor(seed * 233280)
  return () => (s = (s * 9301 + 49297) % 233280) / 233280
}

/** Punch random worn holes out of whatever is painted (paint wear). */
function wear(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, n: number, r: number): void {
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rand(0.25, 0.9)})`
    ctx.beginPath()
    ctx.arc(x0 + Math.random() * w, y0 + Math.random() * h, rand(0.5, r), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// --- asphalt ---------------------------------------------------------------
function paintAsphalt(): HTMLCanvasElement {
  const S = 512
  const [cv, ctx] = makeCanvas(S, S)
  ctx.fillStyle = '#3d3b3d'
  ctx.fillRect(0, 0, S, S)
  // Large mottling: sun-bleached areas, darker oily patches, red-brown dust.
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * S
    const y = Math.random() * S
    const r = rand(16, 70)
    const tone = pick([
      `rgba(0,0,0,${rand(0.04, 0.1)})`,
      `rgba(255,250,240,${rand(0.02, 0.05)})`,
      `rgba(140,96,60,${rand(0.04, 0.08)})`,
    ])
    wrapped(S, S, (ox, oy) => blotch(ctx, x + ox, y + oy, r, tone))
  }
  grain(ctx, S, S, 36, 0.035)
  // Hairline cracks.
  ctx.lineCap = 'round'
  for (let i = 0; i < 7; i++) {
    const x = Math.random() * S
    const y = Math.random() * S
    const steps = 6 + Math.floor(Math.random() * 10)
    ctx.strokeStyle = `rgba(18,16,16,${rand(0.35, 0.6)})`
    ctx.lineWidth = rand(0.8, 1.6)
    const seed = Math.random()
    wrapped(S, S, (ox, oy) => crack(ctx, x + ox, y + oy, steps, 9, lcg(seed)))
  }
  return cv
}

// --- sidewalk pavers -------------------------------------------------------
function paintPavers(): HTMLCanvasElement {
  const S = 512
  const [cv, ctx] = makeCanvas(S, S)
  ctx.fillStyle = '#4e4a43' // joint sand
  ctx.fillRect(0, 0, S, S)
  const rows = 20
  const cols = 10
  const bh = S / rows
  const bw = S / cols
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0
    for (let c = -1; c < cols; c++) {
      const red = Math.random() < 0.1
      const v = rand(-14, 14)
      const [R, G, B] = red ? [132 + v, 78 + v, 60 + v] : [138 + v, 134 + v, 125 + v]
      ctx.fillStyle = `rgb(${R},${G},${B})`
      ctx.fillRect(c * bw + off + 1.5, r * bh + 1.5, bw - 3, bh - 3)
    }
  }
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * S
    const y = Math.random() * S
    const tone = pick([`rgba(120,90,60,${rand(0.08, 0.2)})`, `rgba(0,0,0,${rand(0.06, 0.16)})`])
    const r = rand(18, 70)
    wrapped(S, S, (ox, oy) => blotch(ctx, x + ox, y + oy, r, tone))
  }
  grain(ctx, S, S, 22)
  return cv
}

// --- kerb stones: one black, one white per KERB_M --------------------------
function paintKerb(): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(256, 64)
  ctx.fillStyle = '#1f1f21'
  ctx.fillRect(0, 0, 128, 64)
  ctx.fillStyle = '#e8e5db'
  ctx.fillRect(128, 0, 128, 64)
  // Chipped paint showing grey concrete underneath.
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(150,146,138,${rand(0.5, 0.95)})`
    ctx.beginPath()
    ctx.arc(Math.random() * 256, Math.random() * 64, rand(1, 5), 0, Math.PI * 2)
    ctx.fill()
  }
  // Joints between stones + road grime splashed up the bottom.
  ctx.fillStyle = 'rgba(30,26,22,0.7)'
  ctx.fillRect(0, 0, 2, 64)
  ctx.fillRect(127, 0, 2, 64)
  const g = ctx.createLinearGradient(0, 64, 0, 20)
  g.addColorStop(0, 'rgba(70,56,40,0.55)')
  g.addColorStop(1, 'rgba(70,56,40,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 64)
  grain(ctx, 256, 64, 18)
  return cv
}

// --- road markings: [white dash | yellow solid] columns, v = along ---------
const MARK_W = 128
const MARK_H = 512
const WHITE_U: [number, number] = [8 / MARK_W, 56 / MARK_W]
const YELLOW_U: [number, number] = [72 / MARK_W, 120 / MARK_W]
function paintMarkings(): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(MARK_W, MARK_H)
  const dash = MARK_H * (3 / DASH_M)
  ctx.fillStyle = '#eeede6'
  ctx.fillRect(8, 0, 48, dash)
  ctx.fillStyle = '#efbf2a'
  ctx.fillRect(72, 0, 48, MARK_H)
  // Ragged dash ends + traffic-worn paint.
  wear(ctx, 8, dash - 14, 48, 18, 40, 6)
  wear(ctx, 8, 0, 48, 12, 30, 6)
  wear(ctx, 8, 0, 48, dash, 140, 4)
  wear(ctx, 72, 0, 48, MARK_H, 160, 3)
  return cv
}

// --- grime: [oil drip | gutter sand] columns, v = along --------------------
const GRIME_W = 128
const GRIME_H = 512
const DRIP_U: [number, number] = [0, 0.5]
const SAND_U: [number, number] = [0.5, 1] // u = 1 is the kerb side
function paintGrime(): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(GRIME_W, GRIME_H)
  // Oil drip down the lane centre: a faint band + streaky drops.
  const band = ctx.createLinearGradient(0, 0, 64, 0)
  band.addColorStop(0, 'rgba(12,10,8,0)')
  band.addColorStop(0.5, 'rgba(12,10,8,0.16)')
  band.addColorStop(1, 'rgba(12,10,8,0)')
  ctx.fillStyle = band
  ctx.fillRect(0, 0, 64, GRIME_H)
  for (let i = 0; i < 70; i++) {
    const x = 32 + (Math.random() + Math.random() - 1) * 18
    const y = Math.random() * GRIME_H
    const h = rand(6, 30)
    const a = rand(0.08, 0.3)
    for (const oy of [-GRIME_H, 0, GRIME_H]) {
      ctx.fillStyle = `rgba(10,8,6,${a})`
      ctx.beginPath()
      ctx.ellipse(x, y + oy, rand(1.5, 4), h / 2, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // Gutter sand: dense against the kerb (x=128), fading toward the lane.
  const sand = ctx.createLinearGradient(64, 0, 128, 0)
  sand.addColorStop(0, 'rgba(150,118,82,0)')
  sand.addColorStop(0.5, 'rgba(150,118,82,0.45)')
  sand.addColorStop(1, 'rgba(132,104,74,0.92)')
  ctx.fillStyle = sand
  ctx.fillRect(64, 0, 64, GRIME_H)
  for (let i = 0; i < 260; i++) {
    const x = 128 - Math.abs(Math.random() + Math.random() - 1) * 64
    const y = Math.random() * GRIME_H
    ctx.fillStyle = pick(['rgba(90,70,50,0.6)', 'rgba(185,160,120,0.6)', 'rgba(40,36,32,0.5)'])
    ctx.fillRect(x, y, rand(1, 3), rand(1, 3))
  }
  return cv
}

// --- decal atlas (4×4 cells of 256 px) -------------------------------------
const CELL = 256
const ATLAS = CELL * 4
export const DECAL = {
  OIL_A: [0, 0],
  OIL_B: [1, 0],
  TAR_PATCH: [2, 0],
  CRACKS: [3, 0],
  MANHOLE: [0, 1],
  DRAIN: [1, 1],
  SKID: [2, 1],
  LITTER: [3, 1],
  POTHOLE: [0, 2],
  ZEBRA: [1, 2],
  DUST: [2, 2],
  PUDDLE: [3, 2],
  PATCHED: [0, 3],
  EDGE_BITE: [1, 3],
} as const
type Cell = readonly [number, number]

function paintOil(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < 7; i++) {
    blotch(ctx, 128 + rand(-50, 50), 128 + rand(-50, 50), rand(30, 70), `rgba(14,11,10,${rand(0.25, 0.5)})`)
  }
  // Faint petrol sheen ring.
  blotch(ctx, 128 + rand(-20, 20), 128 + rand(-20, 20), rand(30, 50), 'rgba(70,60,110,0.12)')
  for (let i = 0; i < 18; i++) {
    blotch(ctx, 128 + rand(-95, 95), 128 + rand(-95, 95), rand(3, 10), `rgba(14,11,10,${rand(0.3, 0.55)})`)
  }
}

function paintTarPatch(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath()
  const pts = 9
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2
    const r = rand(90, 115)
    const x = 128 + Math.cos(a) * r * 1.0
    const y = 128 + Math.sin(a) * r * 0.75
    if (i) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = 'rgba(34,33,36,0.92)'
  ctx.fill()
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(14,13,14,0.9)' // sealed seam
  ctx.stroke()
  grain(ctx, CELL, CELL, 24)
}

function paintCracks(ctx: CanvasRenderingContext2D): void {
  ctx.lineCap = 'round'
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * 70
    ctx.strokeStyle = `rgba(16,14,14,${rand(0.45, 0.8)})`
    ctx.lineWidth = rand(1, 2.6)
    crack(ctx, 128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 4 + Math.floor(Math.random() * 5), 12)
  }
}

function paintManhole(ctx: CanvasRenderingContext2D): void {
  blotch(ctx, 128, 128, 124, 'rgba(70,66,60,0.85)') // concrete collar
  ctx.fillStyle = '#3d3833'
  ctx.beginPath()
  ctx.arc(128, 128, 100, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#25211d'
  ctx.lineWidth = 6
  ctx.stroke()
  // Raised grid of studs, rusty in places.
  for (let x = 44; x <= 212; x += 14) {
    for (let y = 44; y <= 212; y += 14) {
      if ((x - 128) ** 2 + (y - 128) ** 2 > 86 ** 2) continue
      ctx.fillStyle = Math.random() < 0.18 ? '#7a4a2c' : '#5d5650'
      ctx.fillRect(x - 4, y - 4, 8, 8)
    }
  }
  ctx.strokeStyle = 'rgba(30,26,22,0.8)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(128, 128, 88, 0, Math.PI * 2)
  ctx.stroke()
  blotch(ctx, 150, 110, 60, 'rgba(255,255,255,0.08)') // worn shine
}

function paintDrain(ctx: CanvasRenderingContext2D): void {
  // Portrait grate: long axis = along the road (cell v).
  ctx.fillStyle = '#7b776e'
  ctx.fillRect(58, 14, 140, 228)
  ctx.fillStyle = '#121010'
  ctx.fillRect(74, 30, 108, 196)
  ctx.fillStyle = '#4b4640'
  for (let y = 34; y < 226; y += 16) ctx.fillRect(74, y, 108, 8)
  ctx.fillStyle = 'rgba(120,96,66,0.55)' // silt
  ctx.fillRect(74, 190, 108, 36)
  grain(ctx, CELL, CELL, 20)
}

function paintSkid(ctx: CanvasRenderingContext2D): void {
  for (const x of [82, 174]) {
    for (let y = 4; y < 252; y += 2) {
      const fade = Math.sin((y / 256) * Math.PI) // in → out
      ctx.fillStyle = `rgba(10,9,9,${0.6 * fade * rand(0.6, 1)})`
      ctx.fillRect(x - 14 + rand(-1, 1), y, 28, 2)
    }
  }
}

function paintLitter(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < 14; i++) {
    ctx.save()
    ctx.translate(rand(30, 226), rand(30, 226))
    ctx.rotate(rand(0, Math.PI))
    const kind = Math.random()
    if (kind < 0.6) {
      // Pure-water sachet: milky plastic, blue print band, crumpled.
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fillRect(-15, -9, 32, 20)
      ctx.fillStyle = 'rgba(232,238,242,0.92)'
      ctx.fillRect(-16, -10, 32, 20)
      ctx.fillStyle = 'rgba(40,110,200,0.85)'
      ctx.fillRect(-16, -3, 32, 6)
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillRect(-12, -8, 8, 3)
    } else if (kind < 0.85) {
      // Biscuit / sweet wrapper.
      ctx.fillStyle = pick(['#d4382c', '#e8b923', '#2f8f3a', '#e86a1c'])
      ctx.fillRect(-10, -5, 20, 10)
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillRect(-6, -2, 8, 3)
    } else {
      // Bottle cap.
      ctx.fillStyle = pick(['#c0392b', '#2c3e8f', '#d4ac0d'])
      ctx.beginPath()
      ctx.arc(0, 0, 5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

function paintPothole(ctx: CanvasRenderingContext2D): void {
  // Broken rim of crumbled, lighter asphalt.
  ctx.beginPath()
  const pts = 16
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2
    const r = rand(98, 122)
    const x = 128 + Math.cos(a) * r
    const y = 128 + Math.sin(a) * r
    if (i) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = '#655f56'
  ctx.fill()
  // The hole: deep, earthy, darkest at the centre.
  ctx.beginPath()
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2
    const r = rand(70, 90)
    const x = 128 + Math.cos(a) * r
    const y = 128 + Math.sin(a) * r
    if (i) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  }
  ctx.closePath()
  const g = ctx.createRadialGradient(128, 136, 8, 128, 128, 92)
  g.addColorStop(0, '#120d09')
  g.addColorStop(0.6, '#2b2016')
  g.addColorStop(1, '#4a3a2a')
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = '#1b1612'
  ctx.stroke()
  // Muddy water at the bottom with a sky glint.
  ctx.fillStyle = 'rgba(88,72,50,0.85)'
  ctx.beginPath()
  ctx.ellipse(122, 146, 42, 22, 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(210,225,235,0.35)'
  ctx.beginPath()
  ctx.ellipse(112, 140, 16, 5, 0.2, 0, Math.PI * 2)
  ctx.fill()
  // Loose chunks of asphalt around the rim.
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2
    const r = rand(88, 124)
    ctx.fillStyle = pick(['#57524b', '#7d776d', '#3a3632'])
    ctx.fillRect(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, rand(3, 9), rand(3, 8))
  }
  grain(ctx, CELL, CELL, 22)
}

/** Closed irregular blob around (cx, cy). */
function blobPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, jitter: number, pts = 14): void {
  ctx.beginPath()
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2
    const k = 1 + rand(-jitter, jitter)
    const x = cx + Math.cos(a) * rx * k
    const y = cy + Math.sin(a) * ry * k
    if (i) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  }
  ctx.closePath()
}

/** Shallow muddy puddle in a dip: wet dark rim, brown water, a sky glint. */
function paintPuddle(ctx: CanvasRenderingContext2D): void {
  blobPath(ctx, 128, 128, 120, 92, 0.12)
  ctx.fillStyle = 'rgba(24,22,20,0.55)' // wet asphalt around the water
  ctx.fill()
  blobPath(ctx, 128, 128, 100, 74, 0.14)
  const g = ctx.createRadialGradient(118, 120, 10, 128, 128, 100)
  g.addColorStop(0, 'rgba(92,80,62,0.95)')
  g.addColorStop(1, 'rgba(70,60,46,0.9)')
  ctx.fillStyle = g
  ctx.fill()
  ctx.fillStyle = 'rgba(190,212,230,0.32)' // sky reflection
  ctx.beginPath()
  ctx.ellipse(110, 112, 56, 12, -0.15, 0, Math.PI * 2)
  ctx.fill()
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = pick(['rgba(60,52,40,0.7)', 'rgba(120,104,80,0.6)'])
    ctx.fillRect(128 + rand(-90, 90), 128 + rand(-60, 60), rand(2, 5), rand(2, 4))
  }
}

/** A pothole filled flush with fresh tar and gravel — worn, but safe to run on. */
function paintPatched(ctx: CanvasRenderingContext2D): void {
  blobPath(ctx, 128, 128, 108, 96, 0.18, 12)
  ctx.fillStyle = 'rgba(36,35,38,0.95)'
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(18,17,18,0.9)'
  ctx.stroke()
  for (let i = 0; i < 220; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * 92
    ctx.fillStyle = pick(['#6a665f', '#55524d', '#7c766c', '#1e1d1f'])
    ctx.fillRect(128 + Math.cos(a) * r, 128 + Math.sin(a) * r * 0.9, rand(1.5, 4), rand(1.5, 4))
  }
  ctx.strokeStyle = 'rgba(16,14,14,0.6)'
  ctx.lineWidth = 1.4
  crack(ctx, 128 + rand(60, 90), 128 + rand(-30, 30), 4, 10)
}

/** Road edge crumbling into the gutter: broken asphalt bite showing laterite
 *  and mud. The kerb side is the cell's right edge (t = 1). */
function paintEdgeBite(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath()
  ctx.moveTo(256, 8)
  const pts = 12
  for (let i = 1; i < pts; i++) {
    const y = 8 + (i / pts) * 240
    const depth = Math.sin((i / pts) * Math.PI) * rand(120, 175)
    ctx.lineTo(256 - depth, y)
  }
  ctx.lineTo(256, 248)
  ctx.closePath()
  ctx.fillStyle = '#5d564d' // broken rim
  ctx.fill()
  ctx.save()
  ctx.translate(14, 0)
  ctx.scale(0.94, 0.86)
  ctx.translate(0, 18)
  ctx.fill() // same path, shrunk toward the kerb: the hole itself
  ctx.restore()
  ctx.save()
  ctx.clip()
  const g = ctx.createLinearGradient(80, 0, 256, 0)
  g.addColorStop(0, '#3a2b1e')
  g.addColorStop(0.5, '#7a5434')
  g.addColorStop(1, '#8c6240')
  ctx.fillStyle = g
  ctx.fillRect(110, 20, 146, 220)
  ctx.restore()
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = pick(['#57524b', '#7d776d', '#3a3632', '#9a7452'])
    ctx.fillRect(rand(90, 250), rand(16, 240), rand(3, 9), rand(3, 7))
  }
  ctx.fillStyle = 'rgba(88,72,50,0.8)' // standing water
  ctx.beginPath()
  ctx.ellipse(214, 140, 26, 44, 0, 0, Math.PI * 2)
  ctx.fill()
}

function paintZebra(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#eceae2'
  ctx.fillRect(6, 6, 244, 244)
  // The bar is drawn ~4.4× longer than wide, so squash wear marks along v to
  // keep them round on the road instead of streaky.
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rand(0.3, 0.9)})`
    ctx.beginPath()
    const r = rand(2, 9)
    ctx.ellipse(6 + Math.random() * 244, 6 + Math.random() * 244, r, r / 4.4, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function paintDust(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < 10; i++) {
    blotch(ctx, 128 + rand(-60, 60), 128 + rand(-60, 60), rand(30, 70), `rgba(150,112,76,${rand(0.12, 0.25)})`)
  }
  for (let i = 0; i < 120; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * 100
    ctx.fillStyle = pick(['rgba(110,84,58,0.6)', 'rgba(180,150,110,0.5)'])
    ctx.fillRect(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, rand(1, 3), rand(1, 3))
  }
}

function paintAtlas(): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(ATLAS, ATLAS)
  const cells: Array<[Cell, (c: CanvasRenderingContext2D) => void]> = [
    [DECAL.OIL_A, paintOil],
    [DECAL.OIL_B, paintOil],
    [DECAL.TAR_PATCH, paintTarPatch],
    [DECAL.CRACKS, paintCracks],
    [DECAL.MANHOLE, paintManhole],
    [DECAL.DRAIN, paintDrain],
    [DECAL.SKID, paintSkid],
    [DECAL.LITTER, paintLitter],
    [DECAL.POTHOLE, paintPothole],
    [DECAL.ZEBRA, paintZebra],
    [DECAL.DUST, paintDust],
    [DECAL.PUDDLE, paintPuddle],
    [DECAL.PATCHED, paintPatched],
    [DECAL.EDGE_BITE, paintEdgeBite],
  ]
  for (const [[col, row], paint] of cells) {
    // Paint each cell on its own canvas so pixel ops (grain) stay local.
    const [cc, cx] = makeCanvas(CELL, CELL)
    paint(cx)
    ctx.drawImage(cc, col * CELL, row * CELL)
  }
  return cv
}

// --- speed bump paint: [yellow | black] blocks, u = across the road --------
function paintBump(): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(256, 128)
  ctx.fillStyle = '#efbf2a'
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = '#1e1e20'
  ctx.fillRect(128, 0, 128, 128)
  // Tyres scrub the paint off the crest, exposing grey concrete.
  for (let i = 0; i < 70; i++) {
    const y = 64 + (Math.random() + Math.random() - 1) * 50
    ctx.fillStyle = `rgba(128,124,116,${rand(0.4, 0.9)})`
    ctx.beginPath()
    ctx.ellipse(Math.random() * 256, y, rand(2, 9), rand(1, 4), 0, 0, Math.PI * 2)
    ctx.fill()
  }
  const g = ctx.createLinearGradient(0, 0, 0, 128) // grime at both feet
  g.addColorStop(0, 'rgba(50,40,30,0.45)')
  g.addColorStop(0.2, 'rgba(50,40,30,0)')
  g.addColorStop(0.8, 'rgba(50,40,30,0)')
  g.addColorStop(1, 'rgba(50,40,30,0.45)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 128)
  grain(ctx, 256, 128, 22)
  return cv
}

// --- shared textures + materials (constant count; never disposed) ----------
const texAsphalt = toTexture(paintAsphalt(), true, true)
const texPavers = toTexture(paintPavers(), true, true)
const texKerb = toTexture(paintKerb(), true, false)
const texMarkings = toTexture(paintMarkings(), false, true)
const texGrime = toTexture(paintGrime(), false, true)
const texAtlas = toTexture(paintAtlas(), false, false)
const texBump = toTexture(paintBump(), true, false)

const matAsphalt = new THREE.MeshStandardMaterial({
  map: texAsphalt,
  bumpMap: texAsphalt,
  bumpScale: 0.6,
  roughness: 0.95,
})
const overlay = { polygonOffset: true, roughness: 0.9 } as const
const matMarkings = new THREE.MeshStandardMaterial({
  ...overlay,
  map: texMarkings,
  alphaTest: 0.35,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
})
const matGrime = new THREE.MeshStandardMaterial({
  ...overlay,
  map: texGrime,
  transparent: true,
  depthWrite: false,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
})
/** Shared by the road decals and the pothole obstacle. */
export const matDecal = new THREE.MeshStandardMaterial({
  ...overlay,
  map: texAtlas,
  transparent: true,
  depthWrite: false,
  polygonOffsetFactor: -3,
  polygonOffsetUnits: -3,
})
const matKerb = new THREE.MeshStandardMaterial({ map: texKerb, roughness: 0.9 })
const matPavers = new THREE.MeshStandardMaterial({ map: texPavers, roughness: 1 })
const matSlabSide = new THREE.MeshStandardMaterial({ color: 0x8d8a83, roughness: 1 })
/** Painted speed bump ("road pump"); u repeats every BUMP_STRIPE_M across the road. */
export const matSpeedBump = new THREE.MeshStandardMaterial({ map: texBump, roughness: 0.85 })
export const BUMP_STRIPE_M = 1.0 // one yellow + one black block

// --- quad batching ---------------------------------------------------------
type UVFn = (s: number, t: number, x: number, z: number) => [number, number]

/** Accumulates flat, up-facing quads (tile-local) into one BufferGeometry. */
class QuadBatch {
  private pos: number[] = []
  private uv: number[] = []
  private idx: number[] = []

  /** Rectangle centred at (cx, cz) with long axis (ax, az) of length `la`
   *  and width `lb`. `uvf` gets s ∈ [0,1] along the axis, t ∈ [0,1] across
   *  (t = 1 on the right of the axis), plus the corner's local x/z. */
  rect(cx: number, cz: number, ax: number, az: number, la: number, lb: number, y: number, uvf: UVFn): void {
    const bx = -az // right of the axis on XZ (same as rightOf)
    const bz = ax
    const base = this.pos.length / 3
    for (const [s, t] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]) {
      const x = cx + ax * (s - 0.5) * la + bx * (t - 0.5) * lb
      const z = cz + az * (s - 0.5) * la + bz * (t - 0.5) * lb
      this.pos.push(x, y, z)
      this.uv.push(...uvf(s, t, x, z))
    }
    // The width axis is always right-of the long axis, so this winding faces +y.
    this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2)
  }

  get empty(): boolean {
    return this.idx.length === 0
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    const n = new Float32Array(this.pos.length)
    for (let i = 1; i < n.length; i += 3) n[i] = 1
    geo.setAttribute('normal', new THREE.BufferAttribute(n, 3))
    geo.setIndex(this.idx)
    return geo
  }

  addTo(g: THREE.Group, mat: THREE.Material, renderOrder = 0): void {
    if (this.empty) return
    const m = new THREE.Mesh(this.build(), mat)
    m.renderOrder = renderOrder
    g.add(m)
  }
}

const worldUV =
  (metres: number): UVFn =>
  (_s, _t, x, z) => [x / metres, z / metres]

/** UVs into a column [u0,u1] of a strip texture, v measured along the tile. */
const stripUV =
  ([u0, u1]: [number, number], along0: number, len: number, period: number, flip = false): UVFn =>
  (s, t) => [u0 + (flip ? 1 - t : t) * (u1 - u0), (along0 + s * len) / period]

function cellUV([col, row]: Cell): UVFn {
  const pad = 2 / ATLAS
  return (s, t) => [(col + t) / 4 + (t ? -pad : pad), 1 - (row + 1) / 4 + s / 4 + (s ? -pad : pad)]
}

/** Map a PlaneGeometry's UVs onto one atlas cell (used by the pothole obstacle). */
export function planeToCell(geo: THREE.PlaneGeometry, cell: Cell): THREE.PlaneGeometry {
  const uv = geo.attributes.uv as THREE.BufferAttribute
  const f = cellUV(cell)
  for (let i = 0; i < uv.count; i++) {
    const [u, v] = f(uv.getY(i), uv.getX(i), 0, 0)
    uv.setXY(i, u, v)
  }
  uv.needsUpdate = true
  return geo
}

// --- decal scattering ------------------------------------------------------
interface Decals {
  batch: QuadBatch
  dir: Vec2
  r: Vec2
}

/** Drop one atlas decal at tile-local (along, lateral) with a yaw (radians). */
function decal(d: Decals, cell: Cell, along: number, lateral: number, la: number, lb: number, yaw = 0, y = 0.016): void {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const ax = d.dir.x * c + d.r.x * s
  const az = d.dir.z * c + d.r.z * s
  const cx = d.dir.x * along + d.r.x * lateral
  const cz = d.dir.z * along + d.r.z * lateral
  d.batch.rect(cx, cz, ax, az, la, lb, y, cellUV(cell))
}

const LANES = [-CONFIG.LANE_W, 0, CONFIG.LANE_W]
const laneSpot = () => pick(LANES) + rand(-0.5, 0.5)

/** Wear and tear across a straight tile. Markets get extra litter; bridges stay clean. */
function scatterStraight(d: Decals, kind: StraightKind): void {
  const along = () => rand(-HALF + 1.5, HALF - 1.5)
  for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) {
    const sz = rand(1.0, 1.9)
    decal(d, pick([DECAL.OIL_A, DECAL.OIL_B]), along(), laneSpot(), sz, sz, rand(0, Math.PI * 2))
  }
  if (Math.random() < 0.3) decal(d, DECAL.TAR_PATCH, along(), laneSpot(), rand(1.8, 3), rand(1.2, 2), rand(-0.3, 0.3))
  for (let i = 0, n = Math.floor(Math.random() * 3); i < n; i++) {
    const sz = rand(1.4, 2.6)
    decal(d, DECAL.CRACKS, along(), laneSpot(), sz, sz, rand(0, Math.PI * 2))
  }
  if (Math.random() < 0.12) decal(d, DECAL.SKID, along(), laneSpot(), rand(4, 7), 1.1, rand(-0.12, 0.12))
  if (kind === 'bridge') return

  // Patched potholes in the lanes: lots of pothole character, but flush and
  // tar-dark so they never read as the real (open) pothole obstacle.
  for (let i = 0, n = Math.floor(Math.random() * 3); i < n; i++) {
    const sz = rand(0.8, 1.5)
    decal(d, DECAL.PATCHED, along(), laneSpot(), sz, sz * rand(0.8, 1), rand(0, Math.PI * 2))
  }

  if (Math.random() < 0.25) decal(d, DECAL.MANHOLE, along(), laneSpot(), 0.95, 0.95, rand(0, Math.PI * 2))
  for (const side of [-1, 1]) {
    // Drains sit in the gutter against the kerb; litter and dust collect there too.
    if (Math.random() < 0.45) decal(d, DECAL.DRAIN, along(), side * (ROAD_HALF - 0.33), 0.95, 0.6)
    const litter = kind === 'market' ? 0.9 : 0.45
    if (Math.random() < litter) {
      const sz = rand(0.8, 1.3)
      decal(d, DECAL.LITTER, along(), side * (ROAD_HALF - rand(0.3, 0.8)), sz, sz, rand(0, Math.PI * 2))
    }
    if (Math.random() < 0.35) {
      const sz = rand(1.2, 2.2)
      decal(d, DECAL.DUST, along(), side * (ROAD_HALF - 0.5), sz, sz, rand(0, Math.PI * 2))
    }
    // Open potholes, puddles and a crumbling edge — only in the edge strip
    // where the runner never goes (outer lane + PLAYER_RADIUS = 2.65 m; the
    // painted parts below start ≥ 2.8 m out), so an open hole inside a lane
    // always means the real obstacle.
    for (let i = 0, n = (Math.random() < 0.55 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0); i < n; i++) {
      const sz = rand(0.7, 0.95)
      decal(d, DECAL.POTHOLE, along(), side * (ROAD_HALF - 0.55), sz, sz, rand(0, Math.PI * 2))
    }
    if (Math.random() < 0.35) {
      decal(d, DECAL.PUDDLE, along(), side * (ROAD_HALF - 0.5), rand(1.2, 2.2), 0.75)
    }
    if (Math.random() < 0.3) {
      // yaw π flips the cell so its kerb edge (t = 1) faces this side's kerb.
      decal(d, DECAL.EDGE_BITE, along(), side * (ROAD_HALF - 0.4), rand(1.4, 2.4), 0.8, side > 0 ? 0 : Math.PI)
    }
    // The odd sachet on the pavement itself.
    if (Math.random() < 0.3) {
      const sz = rand(0.6, 1)
      decal(d, DECAL.LITTER, along(), side * (ROAD_HALF + rand(0.5, 1.1)), sz, sz, rand(0, Math.PI * 2), SLAB_H + 0.012)
    }
  }
}

// --- public builders -------------------------------------------------------
export type StraightKind = 'street' | 'market' | 'bridge'

/** Asphalt, markings, grime, decals (+ kerbs and sidewalks unless a bridge)
 *  for a straight tile running along `dir`. */
export function addStraightRoad(g: THREE.Group, dir: Vec2, kind: StraightKind): void {
  const r = { x: -dir.z, z: dir.x } // rightOf(dir)
  const L = CONFIG.TILE_LEN

  const asphalt = new QuadBatch()
  asphalt.rect(0, 0, dir.x, dir.z, L, CONFIG.ROAD_W, 0, worldUV(ASPHALT_M))
  asphalt.addTo(g, matAsphalt)

  // Markings: dashed white lane dividers + solid yellow edge lines.
  const marks = new QuadBatch()
  for (const off of [-CONFIG.LANE_W / 2, CONFIG.LANE_W / 2]) {
    marks.rect(r.x * off, r.z * off, dir.x, dir.z, L, 0.15, 0.01, stripUV(WHITE_U, -HALF, L, DASH_M))
  }
  for (const side of [-1, 1]) {
    const off = side * (ROAD_HALF - 0.28)
    marks.rect(r.x * off, r.z * off, dir.x, dir.z, L, 0.14, 0.01, stripUV(YELLOW_U, -HALF, L, DASH_M))
  }
  marks.addTo(g, matMarkings)

  // Grime: oil drips down each lane, sand drifted into both gutters.
  const grime = new QuadBatch()
  for (const off of LANES) {
    grime.rect(r.x * off, r.z * off, dir.x, dir.z, L, 1.0, 0.012, stripUV(DRIP_U, -HALF, L, GRIME_M))
  }
  if (kind !== 'bridge') {
    for (const side of [-1, 1]) {
      const off = side * (ROAD_HALF - 0.35)
      grime.rect(r.x * off, r.z * off, dir.x, dir.z, L, 0.7, 0.012, stripUV(SAND_U, -HALF, L, GRIME_M, side < 0))
    }
  }
  grime.addTo(g, matGrime, 1)

  const decals: Decals = { batch: new QuadBatch(), dir, r }
  scatterStraight(decals, kind)
  decals.batch.addTo(g, matDecal, 2)

  if (kind !== 'bridge') for (const side of [-1, 1]) addSidewalk(g, dir, r, side)
}

/** Painted kerb stones at the road edge + an interlocking-paver sidewalk slab.
 *  Same footprint/height as the old flat curb, so roadside props still sit on it. */
function addSidewalk(g: THREE.Group, dir: Vec2, r: Vec2, side: number): void {
  const L = CONFIG.TILE_LEN
  const alongX = dir.x !== 0
  const box = (w: number, h: number, lat: number) => {
    const geo = alongX ? new THREE.BoxGeometry(L, h, w) : new THREE.BoxGeometry(w, h, L)
    geo.translate(r.x * side * lat, h / 2, r.z * side * lat)
    return geo
  }

  // Kerb: u runs along the road so stones alternate black/white every metre.
  const kerb = box(KERB_W, KERB_H, ROAD_HALF + KERB_W / 2)
  const kp = kerb.attributes.position as THREE.BufferAttribute
  const kuv = kerb.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < kp.count; i++) {
    const along = kp.getX(i) * dir.x + kp.getZ(i) * dir.z
    kuv.setXY(i, (along + HALF) / KERB_M, kp.getY(i) / KERB_H)
  }
  g.add(new THREE.Mesh(kerb, matKerb))

  // Slab: pavers on top (world-planar UVs), plain concrete on the sides.
  const slabW = CONFIG.SIDEWALK_W - KERB_W
  const slab = box(slabW, SLAB_H, ROAD_HALF + KERB_W + slabW / 2)
  const sp = slab.attributes.position as THREE.BufferAttribute
  const suv = slab.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < sp.count; i++) suv.setXY(i, sp.getX(i) / PAVER_M, sp.getZ(i) / PAVER_M)
  // BoxGeometry groups: +x, −x, +y (top), −y, +z, −z.
  g.add(new THREE.Mesh(slab, [matSlabSide, matSlabSide, matPavers, matSlabSide, matSlabSide, matSlabSide]))
}

/** Turn/junction: centre square + an arm toward each open edge, merged into one
 *  asphalt mesh, with edge lines and a worn zebra crossing on every arm. */
export function addJunctionRoad(g: THREE.Group, dirsOpen: Vec2[]): void {
  const asphalt = new QuadBatch()
  asphalt.rect(0, 0, 0, -1, CONFIG.ROAD_W, CONFIG.ROAD_W, 0, worldUV(ASPHALT_M))
  const armLen = HALF - ROAD_HALF
  const armMid = (HALF + ROAD_HALF) / 2
  const marks = new QuadBatch()
  const decals: Decals = { batch: new QuadBatch(), dir: { x: 0, z: -1 }, r: { x: 1, z: 0 } }

  for (const d of dirsOpen) {
    const r = { x: -d.z, z: d.x }
    asphalt.rect(d.x * armMid, d.z * armMid, d.x, d.z, armLen, CONFIG.ROAD_W, 0, worldUV(ASPHALT_M))
    for (const side of [-1, 1]) {
      const off = side * (ROAD_HALF - 0.28)
      marks.rect(
        d.x * armMid + r.x * off,
        d.z * armMid + r.z * off,
        d.x,
        d.z,
        armLen,
        0.14,
        0.01,
        stripUV(YELLOW_U, 0, armLen, DASH_M),
      )
    }
    // Zebra: bars run along the arm, spaced across it.
    const armDecals: Decals = { batch: decals.batch, dir: d, r }
    for (let i = -3; i <= 3; i++) decal(armDecals, DECAL.ZEBRA, ROAD_HALF + 1.6, i * 1.05, 2.2, 0.5)
  }
  asphalt.addTo(g, matAsphalt)
  marks.addTo(g, matMarkings)

  // Heavy wear where everything turns.
  for (let i = 0, n = 1 + Math.floor(Math.random() * 2); i < n; i++) {
    const sz = rand(1.2, 2)
    decal(decals, pick([DECAL.OIL_A, DECAL.OIL_B]), rand(-2.5, 2.5), rand(-2.5, 2.5), sz, sz, rand(0, Math.PI * 2))
  }
  if (Math.random() < 0.5) decal(decals, DECAL.CRACKS, rand(-2, 2), rand(-2, 2), 2.4, 2.4, rand(0, Math.PI * 2))
  if (Math.random() < 0.3) decal(decals, DECAL.MANHOLE, rand(-2, 2), rand(-2, 2), 0.95, 0.95)
  // A pothole or puddle in a corner of the box, off every running line.
  if (Math.random() < 0.6) {
    const c = ROAD_HALF - 0.6
    const sz = rand(0.8, 1.1)
    decal(decals, pick([DECAL.POTHOLE, DECAL.PUDDLE]), pick([-c, c]), pick([-c, c]), sz, sz, rand(0, Math.PI * 2))
  }
  decals.batch.addTo(g, matDecal, 2)
}
