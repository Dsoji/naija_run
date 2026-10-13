// Shared canvas-painting helpers for procedural textures (road, buildings…).
// Everything is painted once at module load; nothing here touches the scene.

import * as THREE from 'three'

// --- canvas helpers --------------------------------------------------------
export const rand = (a: number, b: number) => a + Math.random() * (b - a)
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  return [cv, cv.getContext('2d')!]
}

export function toTexture(cv: HTMLCanvasElement, wrapS: boolean, wrapT: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8 // clamped to the GPU max by three
  tex.wrapS = wrapS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  tex.wrapT = wrapT ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  return tex
}

/** Draw `fn` at every wrapped offset so marks crossing an edge tile seamlessly. */
export function wrapped(w: number, h: number, fn: (ox: number, oy: number) => void): void {
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) fn(ox, oy)
}

/** Per-pixel grain (aggregate speckle). Tiles by construction. */
export function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amp: number, stones = 0): void {
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

export function blotch(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgba: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba)
  g.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

/** A wandering hairline crack starting at (x, y). */
export function crack(
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
export function lcg(seed: number): () => number {
  let s = Math.floor(seed * 233280)
  return () => (s = (s * 9301 + 49297) % 233280) / 233280
}

/** Punch random worn holes out of whatever is painted (paint wear). */
export function wear(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, n: number, r: number): void {
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

