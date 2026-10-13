// Tile types, grid/direction math, and low-poly road builders (spec §3).
// A tile occupies one square grid cell of side CONFIG.TILE_LEN. The player's
// path runs edge → centre → edge, so a STRAIGHT goes straight through and a
// turn/junction pivots at the cell centre. Keeping tiles on a grid makes 90°
// turning and overlap checks exact.

import * as THREE from 'three'
import { CONFIG } from '../config'
import type { EncounterDef } from '../encounters/types'
import { addStreetScenery, addMarketScenery } from './Scenery'
import type { BridgeKind } from './Bridges'
import { addStraightRoad, addJunctionRoad } from './RoadSurface'

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
  landing?: boolean // first straight after a turn/junction — kept clear of obstacles
  bridge?: BridgeKind // this tile is part of a bridge crossing (which one)
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

/** Build the road for a tile. `dirsOpen` lists directions with road arms.
 *  Surfaces (asphalt, markings, decals, kerbs) come from RoadSurface. */
function buildRoad(type: TileType, entryDir: Vec2, dirsOpen: Vec2[]): THREE.Group {
  const g = new THREE.Group()

  if (type === 'STRAIGHT' || type === 'MARKET_ENTRY') {
    addStraightRoad(g, entryDir, type === 'MARKET_ENTRY' ? 'market' : 'street')
    if (type === 'MARKET_ENTRY') addMarketScenery(g, entryDir)
    else addStreetScenery(g, entryDir) // Lagos roadside buildings/poles/billboards
    return g
  }

  if (type === 'BRIDGE') {
    // Bridge deck: road + markings only. The Track dresses it (Bridges.ts)
    // once it knows which bridge and where in the crossing this tile is.
    addStraightRoad(g, entryDir, 'bridge')
    return g
  }

  // Turn / junction: centre square + an arm toward each open edge.
  addJunctionRoad(g, dirsOpen)
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
    // Skip meshes that share a preloaded prototype's geometry (cloned GLB
    // vehicles) — disposing it would blank every other instance.
    if (mesh.isMesh && !mesh.userData.shared) mesh.geometry.dispose()
  })
}
