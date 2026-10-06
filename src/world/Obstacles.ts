// Obstacle spawning + collision (spec §5). Obstacles are attached to STRAIGHT
// tiles as children of the tile group (so they recycle/dispose with the tile),
// plus an ObstacleBox collider in the tile's along/lateral frame. Collision is
// AABB in that frame and is independent of the visual (2D or 3D). Phase 2.2
// ships two kinds (pothole → jump, danfo → change lane) and crash-on-hit; the
// full set, fair-spawn rules and difficulty ramp come in Phase 2.3.

import * as THREE from 'three'
import { CONFIG } from '../config'
import { type ObstacleBox, type TileInfo, type Vec2, rightOf } from './Tile'
import { MODELS, type ModelKind } from './models'
import type { Player } from '../player/Player'

const HALF = CONFIG.TILE_LEN / 2
const PLAYER_HALF_ALONG = 0.5

interface KindDef {
  model: ModelKind
  action: ObstacleBox['action']
  halfAlong: number
  halfLateral: number
  clearHeight: number
  perLane: boolean // true = occupies a single lane (player can dodge sideways)
}

const KINDS: KindDef[] = [
  { model: 'pothole', action: 'JUMP', halfAlong: 0.9, halfLateral: 0.9, clearHeight: 0.4, perLane: true },
  { model: 'danfo', action: 'LANE', halfAlong: 1.9, halfLateral: 1.0, clearHeight: 99, perLane: true },
]

export class Obstacles {
  private straightCount = 0

  reset(): void {
    this.straightCount = 0
  }

  /** Called by Track for each STRAIGHT tile as it is created. */
  decorate(info: TileInfo): void {
    this.straightCount++
    if (this.straightCount < 4) return // calm opening
    if (Math.random() > 0.6) return // ~60% of straights get an obstacle

    const kind = KINDS[Math.floor(Math.random() * KINDS.length)]
    const lane = kind.perLane ? [-1, 0, 1][Math.floor(Math.random() * 3)] : 0
    const along = HALF + (Math.random() * 6 - 3) // near the tile centre, clear of the ends
    const lateral = lane * CONFIG.LANE_W

    const visual = MODELS[kind.model]()
    const r = rightOf(info.entryDir)
    placeLocal(visual, info.entryDir, r, along, lateral)
    info.group.add(visual)

    info.obstacles.push({
      along,
      lateral,
      halfAlong: kind.halfAlong,
      halfLateral: kind.halfLateral,
      action: kind.action,
      clearHeight: kind.clearHeight,
    })
  }

  /** Returns true if the player is hit (a crash) on this tile this frame. */
  collide(player: Player, tile: TileInfo): boolean {
    for (const ob of tile.obstacles) {
      const dAlong = Math.abs(player.distAlong - ob.along)
      const dLat = Math.abs(player.lateral - ob.lateral)
      const overlaps =
        dAlong < ob.halfAlong + PLAYER_HALF_ALONG && dLat < ob.halfLateral + CONFIG.PLAYER_RADIUS
      if (!overlaps) continue

      if (ob.action === 'JUMP') {
        if (player.airborneY < ob.clearHeight) return true
      } else if (ob.action === 'SLIDE') {
        if (!player.isSliding) return true
      } else {
        // LANE: being in its lane is a crash (too tall to jump).
        return true
      }
    }
    return false
  }
}

/** Position a visual at (along, lateral) inside a non-rotated tile group, and
 *  face it down the lane (−Z model forward → travel direction). */
function placeLocal(obj: THREE.Object3D, dir: Vec2, right: Vec2, along: number, lateral: number): void {
  obj.position.set(
    dir.x * (along - HALF) + right.x * lateral,
    0,
    dir.z * (along - HALF) + right.z * lateral,
  )
  obj.rotation.y = Math.atan2(-dir.x, -dir.z)
}
