// Lagos street buildings (the "façade pass" from docs/CASE_STUDY_DANFO_RUN.md).
//
// Detail lives in textures, not polygons. A building is a plain box whose faces
// are tiled with weathered single-storey "bay cards" (3.2 m × 3.2 m) from one
// procedural atlas: roller shutters, open shops, compound gates, barred
// windows, louvres, AC units, balconies with laundry, a church door… plus
// top-down roof cards (water tank, clothesline, satellite dish, rusty zinc),
// because the camera looks down onto the many low roofs.
//
// One atlas serves every wall colour: paint is drawn near-white and tinted per
// building through vertex colours, while a mask in the texture's ALPHA channel
// keeps unpainted parts (cement, steel, glass, wood, roofs) untinted. The atlas
// is a DataTexture so that mask survives exactly (a canvas would premultiply it).
//
// All buildings on a tile side merge into one mesh (+ one for shop signboards),
// so a street wall costs ~2 draw calls. Visuals only — no colliders.

import * as THREE from 'three'
import { CONFIG } from '../config'
import type { Vec2 } from './Tile'
import { blotch, crack, grain, makeCanvas, pick, rand } from './paint'

const HALF = CONFIG.TILE_LEN / 2
const BAY = 3.2 // metres per bay card (width and storey height)
const CELL = 256
const COLS = 4
const ATLAS = CELL * COLS

// --- card painting (colour canvas + tint-mask canvas per cell) -------------
interface Pen {
  c: CanvasRenderingContext2D // colour
  m: CanvasRenderingContext2D // mask: white = painted wall (tinted), black = not
}

const PAINT = '#efebe3' // base wall paint, tinted per building
const PAINT_DARK = '#d9d3c8' // painted trims (lintels, sills) — still tinted

/** Fill a path on the colour canvas and mark it tinted/untinted on the mask. */
function fill(p: Pen, path: (ctx: CanvasRenderingContext2D) => void, style: string | CanvasGradient, tinted: boolean): void {
  p.c.fillStyle = style
  path(p.c)
  p.c.fill()
  p.m.fillStyle = tinted ? '#fff' : '#000'
  path(p.m)
  p.m.fill()
}
const rectPath = (x: number, y: number, w: number, h: number) => (ctx: CanvasRenderingContext2D) => {
  ctx.beginPath()
  ctx.rect(x, y, w, h)
}
const rect = (p: Pen, x: number, y: number, w: number, h: number, style: string | CanvasGradient, tinted = false) =>
  fill(p, rectPath(x, y, w, h), style, tinted)

function blobPath(cx: number, cy: number, rx: number, ry: number, jitter: number, pts = 12) {
  const ks = Array.from({ length: pts }, () => 1 + rand(-jitter, jitter))
  return (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath()
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * Math.PI * 2
      const x = cx + Math.cos(a) * rx * ks[i]
      const y = cy + Math.sin(a) * ry * ks[i]
      if (i) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    }
    ctx.closePath()
  }
}

/** Painted wall: mottled near-white paint, a floor-slab band at the top, and a
 *  few small patches peeled back to bare cement. */
function wallBase(p: Pen, peels = 2): void {
  rect(p, 0, 0, CELL, CELL, PAINT, true)
  for (let i = 0; i < 14; i++) {
    blotch(p.c, rand(0, CELL), rand(0, CELL), rand(20, 70), pick(['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.06)', 'rgba(120,90,60,0.05)']))
  }
  // Slab edge between storeys (also reads as the parapet on the top floor).
  rect(p, 0, 0, CELL, 9, PAINT_DARK, true)
  p.c.fillStyle = 'rgba(40,32,24,0.28)'
  p.c.fillRect(0, 9, CELL, 3)
  for (let i = 0; i < peels; i++) {
    const path = blobPath(rand(14, 242), rand(24, 242), rand(5, 15), rand(4, 10), 0.5)
    fill(p, path, '#8e897f', false)
    p.c.strokeStyle = 'rgba(50,40,32,0.45)'
    p.c.lineWidth = 1.2
    path(p.c)
    p.c.stroke()
  }
}

/** Weathering laid over everything: rain streaks, ground splash, mould, cracks. */
function weather(p: Pen, ground: boolean): void {
  for (let i = 0; i < 9; i++) {
    const x = rand(0, CELL)
    const y = rand(-20, 140)
    const len = rand(40, 170)
    const g = p.c.createLinearGradient(0, y, 0, y + len)
    g.addColorStop(0, `rgba(60,48,36,${rand(0.08, 0.22)})`)
    g.addColorStop(1, 'rgba(60,48,36,0)')
    p.c.fillStyle = g
    p.c.fillRect(x, y, rand(3, 12), len)
  }
  if (ground) {
    const g = p.c.createLinearGradient(0, CELL, 0, CELL - 60)
    g.addColorStop(0, 'rgba(96,70,46,0.5)') // laterite splash from the gutter
    g.addColorStop(1, 'rgba(96,70,46,0)')
    p.c.fillStyle = g
    p.c.fillRect(0, CELL - 60, CELL, 60)
    for (let i = 0; i < 40; i++) {
      p.c.fillStyle = 'rgba(40,46,30,0.25)'
      p.c.fillRect(rand(0, CELL), rand(CELL - 30, CELL), rand(2, 6), rand(2, 5))
    }
  }
  p.c.strokeStyle = 'rgba(50,40,32,0.4)'
  p.c.lineWidth = 1
  for (let i = 0; i < 2; i++) crack(p.c, rand(0, CELL), rand(0, CELL), 5, 9)
  grain(p.c, CELL, CELL, 12)
}

/** Steel burglar-proof bars over a window. */
function bars(p: Pen, x: number, y: number, w: number, h: number): void {
  p.c.fillStyle = '#222324'
  for (let bx = x + 6; bx < x + w - 2; bx += 13) p.c.fillRect(bx, y, 3, h)
  for (const fy of [0.33, 0.66]) p.c.fillRect(x, y + h * fy, w, 3)
  p.c.strokeStyle = '#222324'
  p.c.lineWidth = 2
  for (let bx = x + 12; bx < x + w - 10; bx += 26) {
    p.c.beginPath()
    p.c.arc(bx, y + h * 0.5, 7, 0, Math.PI * 2) // the decorative curls
    p.c.stroke()
  }
}

function glass(p: Pen, x: number, y: number, w: number, h: number): void {
  rect(p, x - 5, y - 5, w + 10, h + 10, '#3b3530') // frame
  const g = p.c.createLinearGradient(x, y, x + w, y + h)
  g.addColorStop(0, '#3a4a58')
  g.addColorStop(0.45, '#1c252e')
  g.addColorStop(1, '#2a343e')
  rect(p, x, y, w, h, g)
  p.c.fillStyle = 'rgba(255,255,255,0.08)' // sky glint
  p.c.beginPath()
  p.c.moveTo(x + w * 0.15, y)
  p.c.lineTo(x + w * 0.45, y)
  p.c.lineTo(x, y + h * 0.5)
  p.c.lineTo(x, y + h * 0.2)
  p.c.fill()
}

function sill(p: Pen, x: number, y: number, w: number): void {
  rect(p, x - 8, y, w + 16, 8, PAINT_DARK, true)
  const g = p.c.createLinearGradient(0, y + 8, 0, y + 70) // drip stain
  g.addColorStop(0, 'rgba(60,48,36,0.25)')
  g.addColorStop(1, 'rgba(60,48,36,0)')
  p.c.fillStyle = g
  p.c.fillRect(x, y + 8, w, 62)
}

const GOODS = ['#d4382c', '#e8b923', '#2f8f3a', '#1f5fa0', '#e86a1c', '#f2f2f2', '#7b2d8e', '#c0392b']

// Ground-floor cards ---------------------------------------------------------
function cardShutter(p: Pen): void {
  wallBase(p)
  rect(p, 20, 64, 216, 14, PAINT_DARK, true) // lintel
  rect(p, 26, 78, 204, 178, '#8e9297')
  for (let y = 92; y < 250; y += 7) {
    p.c.fillStyle = '#6d7176'
    p.c.fillRect(26, y, 204, 2)
    p.c.fillStyle = '#aeb2b6'
    p.c.fillRect(26, y + 2, 204, 1)
  }
  rect(p, 26, 78, 204, 14, '#5f6368') // shutter box
  rect(p, 26, 246, 204, 10, '#55595e') // bottom rail
  for (let i = 0; i < 6; i++) blotch(p.c, rand(30, 226), rand(100, 250), rand(8, 26), 'rgba(130,70,36,0.3)')
  rect(p, 120, 232, 16, 12, '#c9a227') // padlock
  weather(p, true)
}

function cardOpenShop(p: Pen): void {
  wallBase(p)
  rect(p, 20, 64, 216, 14, PAINT_DARK, true)
  rect(p, 26, 78, 204, 178, '#2a241e') // interior
  rect(p, 26, 78, 204, 18, '#6f7378') // rolled-up shutter drum
  for (const sy of [128, 166, 204]) {
    rect(p, 32, sy, 192, 5, '#5a3d22') // shelves…
    for (let x = 36; x < 220; x += rand(9, 16)) {
      const h = rand(10, 26)
      p.c.fillStyle = pick(GOODS) // …stacked with goods
      p.c.fillRect(x, sy - h, rand(6, 12), h)
    }
  }
  for (let x = 34; x < 222; x += 11) {
    p.c.fillStyle = pick(GOODS) // sachets hanging from the lintel
    p.c.fillRect(x, 96, 8, rand(10, 22))
  }
  rect(p, 26, 216, 204, 40, '#7a5a3a') // counter
  for (let x = 26; x < 230; x += 17) {
    p.c.fillStyle = 'rgba(0,0,0,0.25)'
    p.c.fillRect(x, 216, 2, 40)
  }
  weather(p, true)
}

function cardGate(p: Pen): void {
  wallBase(p, 3)
  rect(p, 0, 36, 22, 220, PAINT_DARK, true) // pillars
  rect(p, 234, 36, 22, 220, PAINT_DARK, true)
  rect(p, 22, 44, 212, 212, '#1c1d1f')
  p.c.fillStyle = '#34363a'
  for (let x = 28; x < 230; x += 10) p.c.fillRect(x, 44, 3, 212)
  for (const y of [60, 150, 240]) rect(p, 22, y, 212, 6, '#2a2b2e')
  p.c.fillStyle = '#1c1d1f' // spear tips
  for (let x = 29; x < 232; x += 10) {
    p.c.beginPath()
    p.c.moveTo(x - 3, 44)
    p.c.lineTo(x + 1.5, 32)
    p.c.lineTo(x + 6, 44)
    p.c.fill()
  }
  p.c.strokeStyle = '#3e4146' // pedestrian door
  p.c.lineWidth = 3
  p.c.strokeRect(150, 112, 56, 144)
  for (let i = 0; i < 8; i++) blotch(p.c, rand(24, 232), rand(50, 250), rand(4, 14), 'rgba(140,72,36,0.35)')
  weather(p, true)
}

function cardDoor(p: Pen): void {
  wallBase(p)
  rect(p, 28, 90, 82, 166, '#4a3420') // frame
  rect(p, 34, 96, 70, 160, '#6e4a2c') // door
  p.c.strokeStyle = 'rgba(30,18,10,0.6)'
  p.c.lineWidth = 2
  for (const [x, y] of [
    [42, 106],
    [72, 106],
    [42, 176],
    [72, 176],
  ]) p.c.strokeRect(x, y, 24, 58)
  rect(p, 92, 170, 6, 6, '#c9a227') // handle
  glass(p, 140, 100, 86, 84)
  bars(p, 140, 100, 86, 84)
  sill(p, 140, 186, 86)
  rect(p, 24, 248, 92, 8, '#9a958c') // step
  weather(p, true)
}

function cardChurch(p: Pen): void {
  wallBase(p, 2)
  const arch = (x: number, y: number, w: number, h: number) => (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath()
    ctx.moveTo(x, y + h)
    ctx.lineTo(x, y + w / 2)
    ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0)
    ctx.lineTo(x + w, y + h)
    ctx.closePath()
  }
  fill(p, arch(80, 100, 96, 156), PAINT_DARK, true) // trim
  fill(p, arch(90, 110, 76, 146), '#5a3a22', false) // door
  p.c.fillStyle = 'rgba(0,0,0,0.4)'
  p.c.fillRect(127, 150, 2, 106)
  rect(p, 122, 22, 12, 64, '#7a2a24') // cross
  rect(p, 106, 38, 44, 12, '#7a2a24')
  for (const x of [26, 198]) {
    fill(p, arch(x, 126, 32, 80), '#3b3530', false)
    const panes = ['#8a2a2a', '#2a5a8a', '#c9a227', '#2f7a3a']
    for (let i = 0; i < 4; i++) rect(p, x + 4, 150 + i * 13, 24, 11, pick(panes)) // stained glass
  }
  weather(p, true)
}

function cardKiosk(p: Pen): void {
  wallBase(p)
  rect(p, 30, 84, 196, 12, '#3a3d42') // metal hood
  rect(p, 40, 96, 176, 92, '#26211c')
  for (let x = 46; x < 210; x += rand(10, 16)) {
    const h = rand(14, 40)
    p.c.fillStyle = pick(GOODS)
    p.c.fillRect(x, 188 - h, rand(7, 12), h)
  }
  rect(p, 34, 188, 188, 12, '#7a5a3a') // serving ledge
  weather(p, true)
}

// Upper-floor cards -----------------------------------------------------------
function cardBarred(p: Pen): void {
  wallBase(p)
  glass(p, 70, 70, 116, 120)
  bars(p, 70, 70, 116, 120)
  sill(p, 70, 194, 116)
  weather(p, false)
}

function cardLouvre(p: Pen): void {
  wallBase(p)
  rect(p, 64, 66, 128, 132, '#b8bcc0') // aluminium frame
  rect(p, 70, 72, 116, 120, '#2a3138')
  const missing = new Set([Math.floor(rand(0, 13)), Math.floor(rand(0, 13))])
  for (let i = 0; i < 13; i++) {
    if (missing.has(i)) continue
    rect(p, 72, 74 + i * 9, 112, 6, i % 2 ? '#a9bcc6' : '#9fb3be')
  }
  rect(p, 126, 72, 4, 120, '#b8bcc0')
  sill(p, 70, 198, 116)
  weather(p, false)
}

function cardAC(p: Pen): void {
  wallBase(p)
  glass(p, 136, 72, 86, 112)
  bars(p, 136, 72, 86, 112)
  sill(p, 136, 188, 86)
  rect(p, 24, 118, 90, 66, '#e6e5df') // split-unit condenser
  p.c.strokeStyle = '#8a8c8e'
  p.c.lineWidth = 2
  for (let r = 6; r < 28; r += 6) {
    p.c.beginPath()
    p.c.arc(58, 151, r, 0, Math.PI * 2)
    p.c.stroke()
  }
  for (let y = 126; y < 180; y += 6) {
    p.c.fillStyle = '#b9bab6'
    p.c.fillRect(92, y, 16, 2)
  }
  rect(p, 30, 184, 4, 10, '#555')
  rect(p, 104, 184, 4, 10, '#555')
  p.c.strokeStyle = '#3a3a3a' // pipe to the window
  p.c.lineWidth = 3
  p.c.beginPath()
  p.c.moveTo(114, 130)
  p.c.lineTo(136, 120)
  p.c.stroke()
  const g = p.c.createLinearGradient(0, 186, 0, 256) // condensate drip
  g.addColorStop(0, 'rgba(40,46,40,0.45)')
  g.addColorStop(1, 'rgba(40,46,40,0)')
  p.c.fillStyle = g
  p.c.fillRect(60, 186, 10, 70)
  weather(p, false)
}

function cardTwin(p: Pen): void {
  wallBase(p)
  for (const x of [40, 146]) {
    glass(p, x, 84, 70, 92)
    bars(p, x, 84, 70, 92)
    sill(p, x, 180, 70)
  }
  weather(p, false)
}

function cardBalcony(p: Pen): void {
  wallBase(p, 2)
  glass(p, 56, 46, 144, 176)
  rect(p, 30, 222, 196, 12, PAINT_DARK, true) // balcony slab edge
  p.c.fillStyle = '#1f2022'
  for (let x = 34; x < 224; x += 12) p.c.fillRect(x, 156, 3, 66)
  p.c.fillRect(30, 154, 196, 4) // top rail
  for (let x = 40; x < 216; x += rand(22, 36)) {
    // Washing on the rail: ankara wrappers, shirts.
    const w = rand(14, 24)
    const h = rand(26, 46)
    p.c.fillStyle = pick(GOODS)
    p.c.fillRect(x, 156, w, h)
    p.c.fillStyle = 'rgba(255,255,255,0.35)'
    for (let yy = 160; yy < 156 + h; yy += 8) p.c.fillRect(x + 2, yy, w - 4, 2)
  }
  weather(p, false)
}

function cardPlain(p: Pen): void {
  wallBase(p, 3)
  weather(p, false)
}

// Roof cards (top-down, untinted) ----------------------------------------------
function slab(p: Pen): void {
  rect(p, 0, 0, CELL, CELL, '#8f8b84')
  for (let i = 0; i < 18; i++) blotch(p.c, rand(0, CELL), rand(0, CELL), rand(14, 60), pick(['rgba(0,0,0,0.12)', 'rgba(60,70,50,0.12)', 'rgba(255,255,255,0.06)']))
  p.c.strokeStyle = '#aaa59c' // parapet
  p.c.lineWidth = 10
  p.c.strokeRect(5, 5, CELL - 10, CELL - 10)
  grain(p.c, CELL, CELL, 18)
}

function roofTank(p: Pen): void {
  slab(p)
  p.c.fillStyle = 'rgba(0,0,0,0.3)'
  p.c.beginPath()
  p.c.arc(96, 104, 50, 0, Math.PI * 2)
  p.c.fill()
  p.c.fillStyle = '#1d1d1f'
  p.c.beginPath()
  p.c.arc(90, 98, 46, 0, Math.PI * 2)
  p.c.fill()
  p.c.strokeStyle = '#333436'
  p.c.lineWidth = 3
  for (let r = 14; r < 46; r += 10) {
    p.c.beginPath()
    p.c.arc(90, 98, r, 0, Math.PI * 2)
    p.c.stroke()
  }
  rect(p, 82, 90, 16, 16, '#2c2d30') // lid
  p.c.strokeStyle = '#cfcac0' // pipes
  p.c.lineWidth = 4
  p.c.beginPath()
  p.c.moveTo(130, 110)
  p.c.lineTo(220, 110)
  p.c.lineTo(220, 240)
  p.c.stroke()
  p.c.fillStyle = '#2a5fa0' // a blue drum
  p.c.beginPath()
  p.c.arc(190, 190, 18, 0, Math.PI * 2)
  p.c.fill()
}

function roofLaundry(p: Pen): void {
  slab(p)
  for (const y of [70, 128, 186]) {
    p.c.strokeStyle = '#d8d8d8'
    p.c.lineWidth = 1.5
    p.c.beginPath()
    p.c.moveTo(18, y)
    p.c.lineTo(238, y + 10)
    p.c.stroke()
    for (let x = 30; x < 226; x += rand(18, 30)) {
      p.c.fillStyle = pick(GOODS)
      p.c.fillRect(x, y + (x / 238) * 10 - 2, rand(12, 20), rand(8, 14))
    }
  }
  p.c.fillStyle = '#3b6fb5' // bucket
  p.c.beginPath()
  p.c.arc(210, 226, 12, 0, Math.PI * 2)
  p.c.fill()
}

function roofDish(p: Pen): void {
  slab(p)
  blotch(p.c, 150, 160, 40, 'rgba(30,34,38,0.35)') // old puddle stain
  p.c.fillStyle = 'rgba(0,0,0,0.3)'
  p.c.beginPath()
  p.c.ellipse(96, 92, 40, 30, -0.5, 0, Math.PI * 2)
  p.c.fill()
  p.c.fillStyle = '#e4e4e0'
  p.c.beginPath()
  p.c.ellipse(88, 84, 38, 28, -0.5, 0, Math.PI * 2)
  p.c.fill()
  p.c.strokeStyle = '#9a9a96'
  p.c.lineWidth = 2
  p.c.beginPath()
  p.c.moveTo(88, 84)
  p.c.lineTo(120, 60)
  p.c.stroke()
  for (let i = 0; i < 20; i++) {
    p.c.fillStyle = pick(['#6d655b', '#4a4640', '#9b8c78'])
    p.c.fillRect(rand(20, 236), rand(140, 236), rand(3, 10), rand(3, 8)) // rubble
  }
}

function roofZinc(p: Pen): void {
  rect(p, 0, 0, CELL, CELL, '#8a8f93')
  for (let sx = 0; sx < CELL; sx += 64) {
    for (let sy = 0; sy < CELL; sy += 128) {
      const tone = pick(['#8a8f93', '#7d8286', '#9aa0a4', '#7a5a44', '#8b4a2b'])
      p.c.fillStyle = tone
      p.c.fillRect(sx, sy + ((sx / 64) % 2) * 20, 64, 128)
    }
  }
  for (let x = 0; x < CELL; x += 8) {
    p.c.fillStyle = 'rgba(255,255,255,0.18)'
    p.c.fillRect(x, 0, 2, CELL)
    p.c.fillStyle = 'rgba(0,0,0,0.22)'
    p.c.fillRect(x + 4, 0, 2, CELL)
  }
  for (let i = 0; i < 14; i++) blotch(p.c, rand(0, CELL), rand(0, CELL), rand(10, 40), 'rgba(139,74,43,0.4)')
  grain(p.c, CELL, CELL, 14)
}

export const CARD = {
  SHUTTER: [0, 0],
  OPEN_SHOP: [1, 0],
  GATE: [2, 0],
  DOOR: [3, 0],
  CHURCH: [0, 1],
  KIOSK: [1, 1],
  BARRED: [2, 1],
  LOUVRE: [3, 1],
  AC: [0, 2],
  TWIN: [1, 2],
  BALCONY: [2, 2],
  PLAIN: [3, 2],
  ROOF_TANK: [0, 3],
  ROOF_LAUNDRY: [1, 3],
  ROOF_DISH: [2, 3],
  ROOF_ZINC: [3, 3],
} as const
type Card = readonly [number, number]

const PAINTERS: Array<[Card, (p: Pen) => void]> = [
  [CARD.SHUTTER, cardShutter],
  [CARD.OPEN_SHOP, cardOpenShop],
  [CARD.GATE, cardGate],
  [CARD.DOOR, cardDoor],
  [CARD.CHURCH, cardChurch],
  [CARD.KIOSK, cardKiosk],
  [CARD.BARRED, cardBarred],
  [CARD.LOUVRE, cardLouvre],
  [CARD.AC, cardAC],
  [CARD.TWIN, cardTwin],
  [CARD.BALCONY, cardBalcony],
  [CARD.PLAIN, cardPlain],
  [CARD.ROOF_TANK, roofTank],
  [CARD.ROOF_LAUNDRY, roofLaundry],
  [CARD.ROOF_DISH, roofDish],
  [CARD.ROOF_ZINC, roofZinc],
]

/** Paint every card, then pack colour + mask (as alpha) into one DataTexture. */
function buildAtlas(): THREE.DataTexture {
  const data = new Uint8Array(ATLAS * ATLAS * 4)
  for (const [[col, row], paint] of PAINTERS) {
    const [, c] = makeCanvas(CELL, CELL)
    const [, m] = makeCanvas(CELL, CELL)
    m.fillStyle = '#000'
    m.fillRect(0, 0, CELL, CELL)
    paint({ c, m })
    const rgb = c.getImageData(0, 0, CELL, CELL).data
    const mask = m.getImageData(0, 0, CELL, CELL).data
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const s = (y * CELL + x) * 4
        const d = ((row * CELL + y) * ATLAS + col * CELL + x) * 4
        data[d] = rgb[s]
        data[d + 1] = rgb[s + 1]
        data[d + 2] = rgb[s + 2]
        data[d + 3] = mask[s] > 127 ? 255 : 0
      }
    }
  }
  const tex = new THREE.DataTexture(data, ATLAS, ATLAS)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

/** UVs for a card (DataTexture rows run top-down, no flip). s/t ∈ [0,1] left→right, bottom→top. */
function cardUV([col, row]: Card, s: number, t: number): [number, number] {
  const pad = 1.5 / ATLAS
  const u = (col + s) / COLS + (s === 0 ? pad : s === 1 ? -pad : 0)
  const v = (row + 1 - t) / COLS + (t === 0 ? -pad : t === 1 ? pad : 0)
  return [u, v]
}

// Facade material: map × (vertex tint where the alpha mask says "paint").
const matFacade = new THREE.MeshStandardMaterial({ map: buildAtlas(), vertexColors: true, roughness: 0.95 })
matFacade.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#if defined( USE_COLOR ) && defined( USE_MAP )
       diffuseColor.rgb *= mix( vec3( 1.0 ), vColor.rgb, sampledDiffuseColor.a );
     #endif
     diffuseColor.a = 1.0;`,
  )
}
matFacade.customProgramCacheKey = () => 'naija-facade-tint'

// --- shop signboards ---------------------------------------------------------
const SIGNS: Array<{ bg: string; fg: string; name: string; sub: string }> = [
  { bg: '#c0392b', fg: '#fff', name: 'MAMA PUT', sub: 'Amala • Ewedu • Eba' },
  { bg: '#1f5fa0', fg: '#fff', name: 'POS • TRANSFER', sub: 'Withdrawal • Recharge Card' },
  { bg: '#f2c230', fg: '#1a1a1a', name: "GOD'S GRACE VENTURES", sub: 'Provisions & Cold Drinks' },
  { bg: '#1d1d1f', fg: '#f5f5f5', name: 'BARBING SALON', sub: 'Low Cut • Shave • Dye' },
  { bg: '#7b2d8e', fg: '#fff', name: 'FASHION HOUSE', sub: 'Ankara • Lace • Agbada' },
  { bg: '#1e8a4a', fg: '#fff', name: 'PATENT MEDICINE', sub: 'Drugs • Toiletries' },
  { bg: '#e86a1c', fg: '#fff', name: 'PHONE ACCESSORIES', sub: 'Repairs • Chargers • Screens' },
  { bg: '#f5f1e6', fg: '#b3261e', name: 'BUKA EXPRESS', sub: 'Jollof • Fried Rice • Swallow' },
]
const SIGN_W = 512
const SIGN_H = 128

function buildSignTexture(): THREE.CanvasTexture {
  const [cv, ctx] = makeCanvas(SIGN_W * 2, SIGN_H * 4)
  SIGNS.forEach((s, i) => {
    const x = (i % 2) * SIGN_W
    const y = Math.floor(i / 2) * SIGN_H
    ctx.fillStyle = s.bg
    ctx.fillRect(x + 4, y + 4, SIGN_W - 8, SIGN_H - 8)
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 6
    ctx.strokeRect(x + 7, y + 7, SIGN_W - 14, SIGN_H - 14)
    ctx.fillStyle = s.fg
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 54px Arial, sans-serif'
    ctx.fillText(s.name, x + SIGN_W / 2, y + 50, SIGN_W - 40)
    ctx.font = 'bold 24px Arial, sans-serif'
    ctx.fillText(s.sub, x + SIGN_W / 2, y + 98, SIGN_W - 60)
    for (let k = 0; k < 6; k++) {
      // Rust bleeding from the fixings + sun fade.
      const rx = x + rand(10, SIGN_W - 10)
      const g = ctx.createLinearGradient(0, y + 8, 0, y + rand(30, 90))
      g.addColorStop(0, 'rgba(120,64,30,0.45)')
      g.addColorStop(1, 'rgba(120,64,30,0)')
      ctx.fillStyle = g
      ctx.fillRect(rx, y + 8, rand(3, 7), 80)
    }
    blotch(ctx, x + rand(80, 430), y + 64, rand(50, 110), 'rgba(255,255,255,0.12)')
  })
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}
const matSign = new THREE.MeshStandardMaterial({ map: buildSignTexture(), roughness: 0.8 })

function signUV(i: number, s: number, t: number): [number, number] {
  const col = i % 2
  const row = Math.floor(i / 2)
  return [(col + s) / 2, 1 - (row + 1 - t) / 4] // CanvasTexture: flipY
}

// --- geometry batching ---------------------------------------------------------
type V3 = THREE.Vector3

/** Arbitrary quads with per-vertex colour. Corners: bottom-left, bottom-right,
 *  top-right, top-left as seen from the front (CCW), so the face points out. */
class Batch {
  pos: number[] = []
  nrm: number[] = []
  uv: number[] = []
  col: number[] = []
  idx: number[] = []
  private e1 = new THREE.Vector3()
  private e2 = new THREE.Vector3()

  quad(p: [V3, V3, V3, V3], uvs: Array<[number, number]>, color: THREE.Color): void {
    const n = this.e1.subVectors(p[1], p[0]).cross(this.e2.subVectors(p[3], p[0])).normalize()
    const base = this.pos.length / 3
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i].x, p[i].y, p[i].z)
      this.nrm.push(n.x, n.y, n.z)
      this.uv.push(...uvs[i])
      this.col.push(color.r, color.g, color.b)
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  addTo(g: THREE.Group, mat: THREE.Material): void {
    if (!this.idx.length) return
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    geo.setIndex(this.idx)
    g.add(new THREE.Mesh(geo, mat))
  }
}

const cardQuad = (b: Batch, p: [V3, V3, V3, V3], card: Card, color: THREE.Color) =>
  b.quad(p, [cardUV(card, 0, 0), cardUV(card, 1, 0), cardUV(card, 1, 1), cardUV(card, 0, 1)], color)

// --- building layout -----------------------------------------------------------
const WALL_TINTS = [0xe9dcc0, 0xd9b36a, 0x9cc3d8, 0xe2a6a6, 0xa9cfae, 0xf0ede6, 0xc98a64, 0xc3b2d6, 0xe8d77a].map(
  (h) => new THREE.Color(h),
)
const WHITE = new THREE.Color(0xffffff)
const UPPER: Card[] = [CARD.BARRED, CARD.LOUVRE, CARD.AC, CARD.TWIN]
const SHOP_GROUND: Card[] = [CARD.SHUTTER, CARD.SHUTTER, CARD.OPEN_SHOP, CARD.OPEN_SHOP, CARD.KIOSK]
const HOME_GROUND: Card[] = [CARD.DOOR, CARD.DOOR, CARD.GATE, CARD.PLAIN]
const SLAB_ROOFS: Card[] = [CARD.ROOF_TANK, CARD.ROOF_LAUNDRY, CARD.ROOF_DISH]

const matTank = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.9 })

function weighted<T>(items: Array<[T, number]>): T {
  let r = Math.random() * items.reduce((s, [, w]) => s + w, 0)
  for (const [v, w] of items) if ((r -= w) <= 0) return v
  return items[0][0]
}

interface Frame {
  fl: V3 // front-left corner at ground (as seen from the road)
  right: V3 // unit, along the facade left → right
  inward: V3 // unit, away from the road
  n: V3 // unit, facade normal (toward the road)
}

const at = (f: Frame, x: number, y: number, z = 0): V3 =>
  f.fl.clone().addScaledVector(f.right, x).addScaledVector(f.inward, z).setY(y)

/** One building: `bays` wide, `floors` tall, `depth` deep, in frame `f`. */
function building(b: Batch, signs: Batch, tanks: THREE.Group, f: Frame, bays: number, floors: number, depth: number): void {
  const tint = pick(WALL_TINTS)
  const W = bays * BAY
  const H = floors * BAY
  const kind = weighted<'shop' | 'home' | 'church'>([
    ['shop', 0.55],
    ['home', 0.39],
    ['church', floors <= 2 && bays >= 3 ? 0.06 : 0],
  ])
  const upperMain = pick(UPPER)

  // Front: one card per bay per storey.
  for (let i = 0; i < bays; i++) {
    for (let j = 0; j < floors; j++) {
      let card: Card
      if (j === 0) {
        if (kind === 'shop') card = pick(SHOP_GROUND)
        else if (kind === 'church') card = i === Math.floor(bays / 2) ? CARD.CHURCH : CARD.PLAIN
        else card = pick(HOME_GROUND)
      } else {
        const r = Math.random()
        card = r < 0.15 ? CARD.BALCONY : r < 0.3 ? CARD.AC : r < 0.38 ? CARD.PLAIN : upperMain
      }
      const x0 = i * BAY
      const y0 = j * BAY
      cardQuad(b, [at(f, x0, y0), at(f, x0 + BAY, y0), at(f, x0 + BAY, y0 + BAY), at(f, x0, y0 + BAY)], card, tint)

      // Shop bays: a signboard over the opening, sometimes a zinc awning.
      if (j === 0 && (card === CARD.SHUTTER || card === CARD.OPEN_SHOP || card === CARD.KIOSK)) {
        if (Math.random() < 0.75) {
          const sx0 = x0 + 0.15
          const sx1 = x0 + BAY - 0.15
          const off = 0.05
          const si = Math.floor(Math.random() * SIGNS.length)
          signs.quad(
            [at(f, sx0, 2.42, -off), at(f, sx1, 2.42, -off), at(f, sx1, 3.12, -off), at(f, sx0, 3.12, -off)],
            [signUV(si, 0, 0), signUV(si, 1, 0), signUV(si, 1, 1), signUV(si, 0, 1)],
            WHITE,
          )
        }
        if (Math.random() < 0.4) {
          // Sloping corrugated awning: wall at 2.35 m, 1.1 m out at 2.05 m. Both faces.
          const wall0 = at(f, x0, 2.35)
          const wall1 = at(f, x0 + BAY, 2.35)
          const out0 = at(f, x0, 2.05, -1.1)
          const out1 = at(f, x0 + BAY, 2.05, -1.1)
          cardQuad(b, [out0, out1, wall1, wall0], CARD.ROOF_ZINC, WHITE)
          cardQuad(b, [out1, out0, wall0, wall1], CARD.ROOF_ZINC, WHITE)
        }
      }
    }
  }

  // Sides + back: plain weathered wall, tiled in bay-ish squares.
  const segs = Math.max(1, Math.round(depth / BAY))
  const sd = depth / segs
  for (let k = 0; k < segs; k++) {
    for (let j = 0; j < floors; j++) {
      const z0 = k * sd
      const z1 = z0 + sd
      const y0 = j * BAY
      const y1 = y0 + BAY
      // Right side (outward = right): front → back.
      cardQuad(b, [at(f, W, y0, z0), at(f, W, y0, z1), at(f, W, y1, z1), at(f, W, y1, z0)], CARD.PLAIN, tint)
      // Left side (outward = −right): back → front.
      cardQuad(b, [at(f, 0, y0, z1), at(f, 0, y0, z0), at(f, 0, y1, z0), at(f, 0, y1, z1)], CARD.PLAIN, tint)
    }
  }
  for (let i = 0; i < bays; i++) {
    for (let j = 0; j < floors; j++) {
      const x0 = i * BAY
      const y0 = j * BAY
      cardQuad(b, [at(f, x0 + BAY, y0, depth), at(f, x0, y0, depth), at(f, x0, y0 + BAY, depth), at(f, x0 + BAY, y0 + BAY, depth)], CARD.PLAIN, tint)
    }
  }

  // Roof: rusty zinc on many bungalows, otherwise a cluttered concrete slab.
  const roof = floors === 1 && Math.random() < 0.6 ? CARD.ROOF_ZINC : pick(SLAB_ROOFS)
  cardQuad(b, [at(f, 0, H), at(f, W, H), at(f, W, H, depth), at(f, 0, H, depth)], roof, WHITE)

  // A real 3D tank on some taller roofs, for the skyline silhouette.
  if (floors >= 2 && roof !== CARD.ROOF_TANK && Math.random() < 0.35) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.0, 10), matTank)
    tank.position.copy(at(f, W * rand(0.25, 0.75), H + 0.5, depth * rand(0.4, 0.75)))
    tanks.add(tank)
  }
}

/** A continuous row of buildings along one side (−1 left / +1 right) of a
 *  straight tile, facade line `frontLat` metres from the road centre. */
export function addBuildingRow(g: THREE.Group, dir: Vec2, side: number, frontLat: number): void {
  const r = { x: -dir.z, z: dir.x } // rightOf(dir)
  const n = new THREE.Vector3(-r.x * side, 0, -r.z * side) // toward the road
  const inward = n.clone().negate()
  const right = new THREE.Vector3(-inward.z, 0, inward.x) // viewer's right, facing the facade
  const flip = right.x * dir.x + right.z * dir.z < 0 // does "right" run against travel?

  const b = new Batch()
  const signs = new Batch()
  const tanks = new THREE.Group()

  const END = HALF - 0.4
  let a = -END
  while (a < END - BAY + 0.01) {
    let bays = weighted<number>([
      [1, 0.15],
      [2, 0.35],
      [3, 0.35],
      [4, 0.15],
    ])
    bays = Math.min(bays, Math.floor((END - a) / BAY + 0.01))
    if (bays < 1) break
    const floors = weighted<number>([
      [1, 0.35],
      [2, 0.35],
      [3, 0.17],
      [4, 0.09],
      [5, 0.04],
    ])
    const setback = Math.random() < 0.3 ? rand(0, 0.8) : 0
    const depth = rand(5, 8)
    const a0 = a
    const a1 = a + bays * BAY
    // Front-left corner as seen from the road.
    const aLeft = flip ? a1 : a0
    const fl = new THREE.Vector3(dir.x * aLeft + r.x * side * (frontLat + setback), 0, dir.z * aLeft + r.z * side * (frontLat + setback))
    building(b, signs, tanks, { fl, right, inward, n }, bays, floors, depth)
    a = a1 + (Math.random() < 0.5 ? 0 : rand(0.3, 1.4))
  }

  b.addTo(g, matFacade)
  signs.addTo(g, matSign)
  if (tanks.children.length) g.add(tanks)
}
