// ₦ note pickups (spec §5). Notes spawn in a line along a lane that's free of
// this tile's obstacles, attach to the tile group (recycle/dispose with it),
// rotate + bob, and are collected when the player comes within MAGNET range.
// Clues come in Phase 2.5.

import { CONFIG } from '../config'
import { type TileInfo, rightOf } from './Tile'
import { buildNote } from './models'
import type { Player } from '../player/Player'

const HALF = CONFIG.TILE_LEN / 2
const LANES = [-1, 0, 1] as const

export class Pickups {
  /** Called by Track for each STRAIGHT tile (after obstacles are placed). */
  decorate(info: TileInfo): void {
    if (Math.random() > CONFIG.PICKUP_CHANCE) return

    // Pick a lane with no obstacle (a full-width banner blocks every lane).
    const blocked = new Set<number>()
    let fullWidth = false
    for (const ob of info.obstacles) {
      if (ob.halfLateral >= CONFIG.ROAD_W / 2 - 0.1) fullWidth = true
      blocked.add(Math.round(ob.lateral / CONFIG.LANE_W))
    }
    if (fullWidth) return
    const free = LANES.filter((l) => !blocked.has(l))
    if (free.length === 0) return
    const lane = free[Math.floor(Math.random() * free.length)]
    const lateral = lane * CONFIG.LANE_W

    // A short line of notes along the tile.
    const count = 4 + Math.floor(Math.random() * 3) // 4–6
    const start = 4
    const gap = 2.4
    const r = rightOf(info.entryDir)
    for (let i = 0; i < count; i++) {
      const along = start + i * gap
      if (along > CONFIG.TILE_LEN - 4) break
      const value = pickValue()
      const mesh = buildNote(value)
      mesh.position.set(
        info.entryDir.x * (along - HALF) + r.x * lateral,
        CONFIG.NOTE_BASE_Y,
        info.entryDir.z * (along - HALF) + r.z * lateral,
      )
      info.group.add(mesh)
      info.pickups.push({ along, lateral, value, phase: Math.random() * Math.PI * 2, mesh })
    }
  }

  /** Rotate + bob notes on the player's current and nearby tiles. */
  update(tiles: TileInfo[], currentIndex: number, dt: number): void {
    for (let i = currentIndex; i <= currentIndex + 2; i++) {
      const tile = tiles[i]
      if (!tile) continue
      for (const p of tile.pickups) {
        if (p.collected) continue
        p.phase += dt * 3
        p.mesh.rotation.y += dt * 2.2
        p.mesh.position.y = CONFIG.NOTE_BASE_Y + Math.sin(p.phase) * 0.15
      }
    }
  }

  /** Collect any notes within magnet range on the current tile. Returns ₦ gained. */
  collect(player: Player, tile: TileInfo): number {
    const reach = CONFIG.MAGNET + CONFIG.PLAYER_RADIUS
    let gained = 0
    for (const p of tile.pickups) {
      if (p.collected) continue
      const dAlong = player.distAlong - p.along
      const dLat = player.lateral - p.lateral
      if (dAlong * dAlong + dLat * dLat <= reach * reach) {
        p.collected = true
        p.mesh.visible = false
        gained += p.value
      }
    }
    return gained
  }
}

function pickValue(): number {
  const total = CONFIG.NOTES.reduce((s, n) => s + n.weight, 0)
  let r = Math.random() * total
  for (const n of CONFIG.NOTES) {
    r -= n.weight
    if (r <= 0) return n.value
  }
  return CONFIG.NOTES[0].value
}
