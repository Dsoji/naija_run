// Obstacle spawning + collision (spec §5). Obstacles attach to STRAIGHT tiles
// as children of the tile group (recycle/dispose with the tile) plus an
// ObstacleBox collider in the tile's along/lateral frame. Collision is AABB in
// that frame, decoupled from the visual (2D or 3D).
//
// Fair-spawn rules: straights only; never block all 3 lanes (a lane row uses at
// most 2 of 3 lanes, so there's always an escape); obstacles sit near the tile
// centre (along 6–12 m) so they stay >10 m clear of the next tile's turn
// window. Density (spawn chance) ramps with distance DENSITY_START → DENSITY_MAX.

import * as THREE from 'three'
import { CONFIG } from '../config'
import { type ObstacleBox, type TileInfo, type Vec2, rightOf } from './Tile'
import { MODELS, type ModelKind } from './models'
import type { Player } from '../player/Player'

const HALF = CONFIG.TILE_LEN / 2
const PLAYER_HALF_ALONG = 0.5
const LANES = [-1, 0, 1] as const

interface KindDef {
  model: ModelKind
  action: ObstacleBox['action']
  halfAlong: number
  halfLateral: number
  clearHeight: number
  onHit: ObstacleBox['onHit']
  penalty: number
  sideSwipe?: boolean // dodgeable solid: clipping it mid-change stumbles rather than crashes
}

// Per-lane obstacles (the player dodges sideways, and some can also be jumped).
const PER_LANE: Record<string, KindDef> = {
  pothole: { model: 'pothole', action: 'JUMP', halfAlong: 0.9, halfLateral: 0.9, clearHeight: 0.4, onHit: 'stumble', penalty: CONFIG.POTHOLE_PENALTY },
  danfo: { model: 'danfo', action: 'LANE', halfAlong: 1.9, halfLateral: 1.0, clearHeight: 99, onHit: 'crash', penalty: 0, sideSwipe: true },
  keke: { model: 'keke', action: 'JUMP', halfAlong: 1.0, halfLateral: 0.9, clearHeight: 1.0, onHit: 'crash', penalty: 0, sideSwipe: true },
  barricade: { model: 'barricade', action: 'JUMP', halfAlong: 0.7, halfLateral: 1.1, clearHeight: 1.0, onHit: 'crash', penalty: 0, sideSwipe: true },
}
const PER_LANE_IDS = Object.keys(PER_LANE)

const BANNER: KindDef = { model: 'banner', action: 'SLIDE', halfAlong: 0.3, halfLateral: CONFIG.ROAD_W / 2, clearHeight: 0, onHit: 'crash', penalty: 0 }
const GOAT: KindDef = { model: 'goat', action: 'LANE', halfAlong: 0.6, halfLateral: 0.7, clearHeight: 99, onHit: 'crash', penalty: 0, sideSwipe: true }

// Oncoming traffic: a vehicle driving TOWARD the player in one lane — dodge it.
const ONCOMING: KindDef[] = [
  { model: 'danfo', action: 'LANE', halfAlong: 1.9, halfLateral: 1.0, clearHeight: 99, onHit: 'crash', penalty: 0, sideSwipe: true },
  { model: 'keke', action: 'LANE', halfAlong: 1.0, halfLateral: 0.9, clearHeight: 99, onHit: 'crash', penalty: 0, sideSwipe: true },
]

const STALL: KindDef = { model: 'stall', action: 'LANE', halfAlong: 0.9, halfLateral: 1.0, clearHeight: 99, onHit: 'crash', penalty: 0, sideSwipe: true }
const MARKET_KINDS: KindDef[] = [STALL, PER_LANE.keke, PER_LANE.barricade, PER_LANE.pothole, GOAT]

export type Collision = { kind: 'none' } | { kind: 'crash' } | { kind: 'stumble'; penalty: number }

export class Obstacles {
  private straightCount = 0
  private distance = 0

  reset(): void {
    this.straightCount = 0
    this.distance = 0
  }

  /** Current run distance, used to ramp density (tiles spawn ahead of here). */
  setDistance(d: number): void {
    this.distance = d
  }

  /** Dense market-corridor obstacles (spec §5/§7): stalls, kekes, banners,
   *  potholes, goats — always something, often two lanes, never all three. */
  decorateMarket(info: TileInfo): void {
    const along = 8 + Math.random() * 4
    if (Math.random() < 0.22) {
      this.add(info, BANNER, along, 0) // slide gate
      return
    }
    const n = Math.random() < 0.55 ? 2 : 1
    const lanes = shuffle([...LANES]).slice(0, n)
    for (const lane of lanes) {
      const kind = MARKET_KINDS[Math.floor(Math.random() * MARKET_KINDS.length)]
      if (kind === GOAT) this.add(info, kind, along, lane, { drift: (Math.random() < 0.5 ? 1 : -1) * CONFIG.GOAT_SPEED })
      else this.add(info, kind, along, lane)
    }
  }

  /** Called by Track for each STRAIGHT tile as it is created. */
  decorate(info: TileInfo): void {
    this.straightCount++
    if (this.straightCount < 4) return // calm opening

    const density =
      CONFIG.DENSITY_START +
      (CONFIG.DENSITY_MAX - CONFIG.DENSITY_START) *
        Math.min(1, this.distance / CONFIG.DENSITY_RAMP_DIST)
    if (Math.random() > density) return // some tiles stay empty

    const along = 6 + Math.random() * 6 // [6, 12] — clear of the ends/turns
    const roll = Math.random()

    if (roll < 0.12) {
      // A goat drifting across lanes.
      const lane = LANES[Math.floor(Math.random() * 3)]
      this.add(info, GOAT, along, lane, { drift: (Math.random() < 0.5 ? 1 : -1) * CONFIG.GOAT_SPEED })
    } else if (roll < 0.26) {
      // A full-width slide gate (banner), on its own.
      this.add(info, BANNER, along, 0)
    } else if (roll < 0.4) {
      // Oncoming vehicle: starts at the far end of the tile, closes on the player.
      const lane = LANES[Math.floor(Math.random() * 3)]
      const kind = ONCOMING[Math.floor(Math.random() * ONCOMING.length)]
      this.add(info, kind, CONFIG.TILE_LEN - 2, lane, {
        alongVel: -CONFIG.ONCOMING_SPEED,
        faceReverse: true,
      })
    } else {
      // A lane row of 1–2 per-lane obstacles (always ≥1 free lane).
      const p2 =
        (density - CONFIG.DENSITY_START) / (CONFIG.DENSITY_MAX - CONFIG.DENSITY_START)
      const n = Math.random() < p2 ? 2 : 1
      const lanes = shuffle([...LANES]).slice(0, n)
      for (const lane of lanes) {
        const kind = PER_LANE[PER_LANE_IDS[Math.floor(Math.random() * PER_LANE_IDS.length)]]
        this.add(info, kind, along, lane)
      }
    }
  }

  private add(
    info: TileInfo,
    kind: KindDef,
    along: number,
    lane: number,
    opts?: { drift?: number; alongVel?: number; faceReverse?: boolean },
  ): void {
    const lateral = lane * CONFIG.LANE_W
    const visual = MODELS[kind.model]()
    placeLocal(visual, info.entryDir, rightOf(info.entryDir), along, lateral)
    if (opts?.faceReverse) visual.rotateOnWorldAxis(UP, Math.PI) // face the player
    info.group.add(visual)
    info.obstacles.push({
      along,
      lateral,
      halfAlong: kind.halfAlong,
      halfLateral: kind.halfLateral,
      action: kind.action,
      clearHeight: kind.clearHeight,
      onHit: kind.onHit,
      penalty: kind.penalty,
      sideSwipe: kind.sideSwipe,
      drift: opts?.drift,
      alongVel: opts?.alongVel,
      mesh: visual,
    })
  }

  /** Advance moving obstacles on the player's current and next tiles only, so
   *  goats drift and oncoming traffic closes in just as the player arrives. */
  updateMoving(tiles: TileInfo[], currentIndex: number, dt: number): void {
    for (let i = currentIndex; i <= currentIndex + 1; i++) {
      const tile = tiles[i]
      if (!tile) continue
      for (const ob of tile.obstacles) {
        if (!ob.mesh || ob.gone) continue

        if (ob.drift !== undefined) {
          ob.lateral += ob.drift * dt
          const limit = CONFIG.LANE_W
          if (ob.lateral > limit) {
            ob.lateral = limit
            ob.drift = -Math.abs(ob.drift)
          } else if (ob.lateral < -limit) {
            ob.lateral = -limit
            ob.drift = Math.abs(ob.drift)
          }
        }
        if (ob.alongVel !== undefined) {
          ob.along += ob.alongVel * dt
          if (ob.along < -2) {
            ob.gone = true
            ob.mesh.visible = false
            continue
          }
        }

        const r = rightOf(tile.entryDir)
        ob.mesh.position.set(
          tile.entryDir.x * (ob.along - HALF) + r.x * ob.lateral,
          0,
          tile.entryDir.z * (ob.along - HALF) + r.z * ob.lateral,
        )
      }
    }
  }

  /** Resolve the player against this tile's obstacles for one frame. A crash
   *  takes priority; a stumble fires at most once per obstacle. */
  collide(player: Player, tile: TileInfo): Collision {
    let stumble: Collision | null = null
    for (const ob of tile.obstacles) {
      if (ob.gone) continue
      const dAlong = Math.abs(player.distAlong - ob.along)
      const dLat = Math.abs(player.lateral - ob.lateral)
      const overlaps =
        dAlong < ob.halfAlong + PLAYER_HALF_ALONG && dLat < ob.halfLateral + CONFIG.PLAYER_RADIUS
      if (!overlaps) continue

      // Cleared by the correct action?
      if (ob.action === 'JUMP' && player.airborneY >= ob.clearHeight) continue
      if (ob.action === 'SLIDE' && player.isSliding) continue

      // A soft obstacle (pothole) always stumbles.
      if (ob.onHit === 'stumble') {
        if (!ob.hit) {
          ob.hit = true
          stumble = { kind: 'stumble', penalty: ob.penalty }
        }
        continue
      }

      // Side-swipe: clipping a dodgeable solid while changing lanes (i.e. its
      // lane isn't the one you're committing to) is a stumble, not a crash.
      if (ob.sideSwipe) {
        const obLane = Math.round(ob.lateral / CONFIG.LANE_W)
        if (player.laneIndex !== obLane) {
          if (!ob.hit) {
            ob.hit = true
            stumble = { kind: 'stumble', penalty: 0 }
          }
          continue
        }
      }

      return { kind: 'crash' }
    }
    return stumble ?? { kind: 'none' }
  }
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const UP = new THREE.Vector3(0, 1, 0)

/** Position a visual at (along, lateral) inside a non-rotated tile group, and
 *  face it down the lane. Yaw is applied about the WORLD vertical axis so it
 *  composes correctly on top of any built-in tilt (e.g. a pothole lying flat). */
function placeLocal(obj: THREE.Object3D, dir: Vec2, right: Vec2, along: number, lateral: number): void {
  obj.position.set(
    dir.x * (along - HALF) + right.x * lateral,
    0,
    dir.z * (along - HALF) + right.z * lateral,
  )
  obj.rotateOnWorldAxis(UP, Math.atan2(-dir.x, -dir.z))
}
