// Tile types, grid/direction math, and low-poly road builders (spec §3).
// A tile occupies one square grid cell of side CONFIG.TILE_LEN. The player's
// path runs edge → centre → edge, so a STRAIGHT goes straight through and a
// turn/junction pivots at the cell centre. Keeping tiles on a grid makes 90°
// turning and overlap checks exact.

import * as THREE from 'three'
import { CONFIG } from '../config'
import type { EncounterDef } from '../encounters/types'
import { addStreetScenery, addBridgeDecor, addMarketScenery } from './Scenery'

export type TileType = 'STRAIGHT' | 'TURN_L' | 'TURN_R' | 'T_JUNCTION' | 'MARKET_ENTRY' | 'BRIDGE'
export type Side = 'L' | 'R'

/** Unit direction on the XZ plane. Components are each -1, 0 or +1. */
export interface Vec2 {
  x: number
  z: number
}

export const DIR = {
  N: { x: 0, z: -1 },
  E: { x: 1, z: 0 },
  S: { x: 0, z: 1 },
  W: { x: -1, z: 0 },
} as const

export function rotateRight(d: Vec2): Vec2 {
  return { x: -d.z, z: d.x }
}
export function rotateLeft(d: Vec2): Vec2 {
  return { x: d.z, z: -d.x }
}
export function turn(d: Vec2, side: Side): Vec2 {
  return side === 'L' ? rotateLeft(d) : rotateRight(d)
}
/** Right-hand perpendicular of a heading (lane +1 points this way). */
export function rightOf(d: Vec2): Vec2 {
  return rotateRight(d)
}
export function sameDir(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.z === b.z
}

/** Collision box for an obstacle, expressed in the tile's local along/lateral
 *  frame (metres). Decoupled from the visual (2D plane, 3D mesh or glb). */
export interface ObstacleBox {
  along: number // centre distance from the tile entry edge
  lateral: number // centre offset to the right of travel
  halfAlong: number
  halfLateral: number
  action: 'JUMP' | 'SLIDE' | 'LANE' // how the player clears it
  clearHeight: number // for JUMP: min airborne height that clears it
  onHit: 'crash' | 'stumble' // what happens if the player fails to clear it
  penalty: number // ₦ lost on a stumble
  sideSwipe?: boolean // dodgeable solid: clipping it mid-lane-change is a stumble, not a crash
  hit?: boolean // set once a stumble has been consumed (so it fires only once)
  announced?: boolean // Nero has already called this obstacle out (market)
  drift?: number // signed lateral speed (m/s) for moving obstacles (goat)
  alongVel?: number // signed along speed (m/s) for oncoming traffic (negative = toward player)
  gone?: boolean // an oncoming vehicle that has passed the player (ignored by collision)
  mesh?: THREE.Object3D // visual, so a moving obstacle's position can be updated
}

/** A collectible ₦ note attached to a tile (tile-local along/lateral frame). */
export interface PickupItem {
  along: number
  lateral: number
  value: number // ₦ (0 for a clue)
  phase: number // bob/rotate animation phase
  clue?: boolean
  text?: string // clue text
  collected?: boolean
  mesh: THREE.Object3D
}

/** A roadside NPC encounter attached to a straight ~2 tiles before a junction. */
export interface EncounterInstance {
  def: EncounterDef
  junction: TileInfo // the junction this encounter can influence
  along: number // NPC position along the tile
  bobPhase: number
  triggered?: boolean
  mesh: THREE.Object3D
}

export interface Cell {
  gx: number
  gz: number
}
export function cellKey(c: Cell): string {
  return `${c.gx},${c.gz}`
}
export function step(c: Cell, d: Vec2): Cell {
  return { gx: c.gx + d.x, gz: c.gz + d.z }
}
export function cellCenter(c: Cell): THREE.Vector3 {
  return new THREE.Vector3(c.gx * CONFIG.TILE_LEN, 0, c.gz * CONFIG.TILE_LEN)
}

/** A placed tile on the committed path (or a junction branch stub). */
export interface TileInfo {
  type: TileType
  cell: Cell
  entryDir: Vec2
  /** Resolved exit heading. For a junction this is set when the player commits. */
  exitDir: Vec2
  exitDirL?: Vec2
  exitDirR?: Vec2
  requiresTurn: boolean
  correct?: Side // junction's true side (assigned at spawn; used from Phase 3)
  thiefHint?: Side // the side the thief is shown taking (true ~70%, else decoy)
  shortcutBranch?: Side // junction branch turned into a market shortcut (Phase 5)
  market?: boolean // this tile is part of a market section
  bridge?: boolean // this tile is part of an Ikoyi Link Bridge section
  group: THREE.Group
  /** The next tile along the committed path (set when the follower is placed). */
  next?: TileInfo
  /** Obstacle colliders attached to this tile (visuals are children of group). */
  obstacles: ObstacleBox[]
  /** Collectible ₦ notes attached to this tile. */
  pickups: PickupItem[]
  /** A roadside encounter NPC, if one spawned on this tile. */
  encounter?: EncounterInstance
}

// --- Shared materials (constant count; never disposed) ----------------------
const matAsphalt = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 1 })
const matLine = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 1 })
const matCurb = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 1 })

const HALF = CONFIG.TILE_LEN / 2
const ROAD_HALF = CONFIG.ROAD_W / 2

/** A flat road quad lying in XZ, length `lenAlong` along `dir`, centred at `fromCenter*dir`. */
function roadArm(dir: Vec2, fromDist: number, toDist: number): THREE.Mesh {
  const lenAlong = toDist - fromDist
  const mid = (fromDist + toDist) / 2
  const geo =
    dir.x === 0
      ? new THREE.PlaneGeometry(CONFIG.ROAD_W, lenAlong)
      : new THREE.PlaneGeometry(lenAlong, CONFIG.ROAD_W)
  const m = new THREE.Mesh(geo, matAsphalt)
  m.rotation.x = -Math.PI / 2
  m.position.set(dir.x * mid, 0, dir.z * mid)
  return m
}

/** Thin bright lane divider running the length of a straight along `dir`. */
function laneLine(dir: Vec2, offset: number): THREE.Mesh {
  const r = rightOf(dir)
  const geo =
    dir.x === 0
      ? new THREE.PlaneGeometry(CONFIG.LANE_LINE_W, CONFIG.TILE_LEN * 0.9)
      : new THREE.PlaneGeometry(CONFIG.TILE_LEN * 0.9, CONFIG.LANE_LINE_W)
  const m = new THREE.Mesh(geo, matLine)
  m.rotation.x = -Math.PI / 2
  m.position.set(r.x * offset, 0.02, r.z * offset)
  return m
}

/** Raised curb box along one side of a straight road. */
function curb(dir: Vec2, sideSign: number): THREE.Mesh {
  const r = rightOf(dir)
  const off = ROAD_HALF + CONFIG.SIDEWALK_W / 2
  const geo =
    dir.x === 0
      ? new THREE.BoxGeometry(CONFIG.SIDEWALK_W, 0.25, CONFIG.TILE_LEN)
      : new THREE.BoxGeometry(CONFIG.TILE_LEN, 0.25, CONFIG.SIDEWALK_W)
  const m = new THREE.Mesh(geo, matCurb)
  m.position.set(r.x * off * sideSign, 0.12, r.z * off * sideSign)
  return m
}

/** Build the road mesh for a tile. `dirsOpen` lists directions with road arms. */
function buildRoad(type: TileType, entryDir: Vec2, dirsOpen: Vec2[]): THREE.Group {
  const g = new THREE.Group()

  if (type === 'STRAIGHT' || type === 'MARKET_ENTRY') {
    // One clean rectangle, no seams.
    g.add(roadArm(entryDir, -HALF, HALF))
    g.add(laneLine(entryDir, CONFIG.LANE_W / 2))
    g.add(laneLine(entryDir, -CONFIG.LANE_W / 2))
    g.add(curb(entryDir, 1))
    g.add(curb(entryDir, -1))
    if (type === 'MARKET_ENTRY') addMarketScenery(g, entryDir)
    else addStreetScenery(g, entryDir) // Lagos roadside buildings/poles/billboards
    return g
  }

  if (type === 'BRIDGE') {
    // Bridge deck: clean road + lane lines, railings and water instead of curbs
    // and buildings. The pylon (middle tile only) is attached by the Track.
    g.add(roadArm(entryDir, -HALF, HALF))
    g.add(laneLine(entryDir, CONFIG.LANE_W / 2))
    g.add(laneLine(entryDir, -CONFIG.LANE_W / 2))
    addBridgeDecor(g, entryDir)
    return g
  }

  // Turn / junction: centre square + an arm toward each open edge.
  const centre = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.ROAD_W, CONFIG.ROAD_W), matAsphalt)
  centre.rotation.x = -Math.PI / 2
  g.add(centre)
  for (const d of dirsOpen) g.add(roadArm(d, ROAD_HALF, HALF))
  return g
}

export function buildTileMesh(type: TileType, entryDir: Vec2, exitDirs: Vec2[]): THREE.Group {
  // Open directions = where the player came from (back along entryDir) plus exits.
  const back = { x: -entryDir.x, z: -entryDir.z }
  return buildRoad(type, entryDir, [back, ...exitDirs])
}

/** Dispose every geometry under a tile group (shared materials are kept). */
export function disposeTile(info: TileInfo): void {
  info.group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) mesh.geometry.dispose()
  })
}
