// Y-fork path geometry. A Y_FORK tile is 3 grid rows long: the road runs
// straight for Y_SHARED metres, then each branch eases sideways by one cell
// (Y_SHIFT) along a smoothstep S-curve and carries on in the SAME heading — the
// two branches end two columns apart. Distances along the path are ARC LENGTH so
// the runner's speed is the same on the curve as on a straight.
//
// Frames: `fwd` is metres along the entry heading from the tile's entry edge,
// `lat` metres to the right of it. Side sign: −1 = left branch, +1 = right.

import * as THREE from 'three'
import { CONFIG } from '../config'
import type { Vec2 } from './Tile'

export const Y_SHARED = 14 // straight approach before the branches diverge
export const Y_COMMIT = 12 // where the runner's lane decides the branch
export const Y_SHIFT = CONFIG.TILE_LEN // each branch moves one cell sideways
export const Y_FWD = CONFIG.TILE_LEN * 3 // tile spans three rows
const B = Y_FWD - Y_SHARED // forward length of the S-curve

const smooth = (t: number) => t * t * (3 - 2 * t)
const dSmooth = (t: number) => 6 * t * (1 - t)

// Arc-length table for the S-curve (side +1).
const N = 128
const tableS: number[] = [0] // arc length at sample i
const tableT: number[] = [0]
{
  let s = 0
  let pf = 0
  let pl = 0
  for (let i = 1; i <= N; i++) {
    const t = i / N
    const f = t * B
    const l = Y_SHIFT * smooth(t)
    s += Math.hypot(f - pf, l - pl)
    tableS.push(s)
    tableT.push(t)
    pf = f
    pl = l
  }
}
const CURVE_LEN = tableS[N]
/** Total arc length of a Y_FORK tile (either branch). */
export const Y_LEN = Y_SHARED + CURVE_LEN

/** Curve parameter t for an arc length into the S-curve. */
function tAt(s: number): number {
  if (s <= 0) return 0
  if (s >= CURVE_LEN) return 1
  let lo = 0
  let hi = N
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (tableS[mid] < s) lo = mid
    else hi = mid
  }
  const k = (s - tableS[lo]) / (tableS[hi] - tableS[lo])
  return tableT[lo] + (tableT[hi] - tableT[lo]) * k
}

export interface ForkSample {
  fwd: number
  lat: number
  /** Unit tangent in the (fwd, lat) frame. */
  tf: number
  tl: number
}

/** Point + tangent at arc length `d` along a branch (`side` −1/+1; 0 = straight). */
export function forkSample(d: number, side: number, out: ForkSample = { fwd: 0, lat: 0, tf: 1, tl: 0 }): ForkSample {
  if (d <= Y_SHARED || side === 0) {
    out.fwd = d
    out.lat = 0
    out.tf = 1
    out.tl = 0
    return out
  }
  const t = tAt(d - Y_SHARED)
  const df = B
  const dl = Y_SHIFT * dSmooth(t)
  const len = Math.hypot(df, dl)
  out.fwd = Y_SHARED + t * B
  out.lat = side * Y_SHIFT * smooth(t)
  out.tf = df / len
  out.tl = (side * dl) / len
  return out
}

/** Branch-centre lateral offset at a forward distance (for meshes). */
export function forkLatAtFwd(fwd: number, side: number): number {
  if (fwd <= Y_SHARED) return 0
  return side * Y_SHIFT * smooth(Math.min(1, (fwd - Y_SHARED) / B))
}
/** d(lat)/d(fwd) of a branch at a forward distance. */
export function forkSlopeAtFwd(fwd: number, side: number): number {
  if (fwd <= Y_SHARED) return 0
  return (side * Y_SHIFT * dSmooth(Math.min(1, (fwd - Y_SHARED) / B))) / B
}

/** Tile-local position (relative to the Y tile's cell centre) and world-space
 *  tangent heading for arc length `d` on branch `side`. */
export function forkLocal(dir: Vec2, d: number, side: number): { pos: THREE.Vector3; heading: Vec2 } {
  const s = forkSample(d, side)
  const r = { x: -dir.z, z: dir.x }
  const fwd = s.fwd - CONFIG.TILE_LEN / 2 // entry edge is HALF behind the centre
  return {
    pos: new THREE.Vector3(dir.x * fwd + r.x * s.lat, 0, dir.z * fwd + r.z * s.lat),
    heading: { x: dir.x * s.tf + r.x * s.tl, z: dir.z * s.tf + r.z * s.tl },
  }
}
