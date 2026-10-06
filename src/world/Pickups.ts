// ₦ note pickups (spec §5). Notes spawn in a line along a lane that's free of
// this tile's obstacles, attach to the tile group (recycle/dispose with it),
// rotate + bob, and are collected when the player comes within MAGNET range.
// Clues come in Phase 2.5.

import * as THREE from 'three'
import { CONFIG } from '../config'
import { type TileInfo, type Vec2, rightOf } from './Tile'
import { buildNote, buildClue } from './models'
import type { Player } from '../player/Player'

const HALF = CONFIG.TILE_LEN / 2
const LANES = [-1, 0, 1] as const

const CLUES = [
  "CLUE: Plate ends in 'LND'.",
  'CLUE: Red motor, tinted glass.',
  'CLUE: He branch towards Oshodi.',
  'CLUE: One headlight dey off.',
  'CLUE: Dent for back bumper.',
  'CLUE: He dey follow the bridge.',
  'CLUE: Loud exhaust — you go hear am.',
  'CLUE: Sticker for rear windscreen.',
  'CLUE: He slow down for market.',
  'CLUE: Driver wear red cap.',
]

export interface PickupResult {
  money: number
  clues: string[]
}

export class Pickups {
  /** Called by Track for each STRAIGHT tile (after obstacles are placed). */
  decorate(info: TileInfo): void {
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
    const r = rightOf(info.entryDir)

    // A rare clue takes the tile on its own.
    if (Math.random() < CONFIG.CLUE_CHANCE) {
      const along = HALF
      const mesh = buildClue()
      this.place(mesh, info.entryDir, r, along, lateral)
      info.group.add(mesh)
      info.pickups.push({
        along,
        lateral,
        value: 0,
        phase: Math.random() * Math.PI * 2,
        clue: true,
        text: CLUES[Math.floor(Math.random() * CLUES.length)],
        mesh,
      })
      return
    }

    if (Math.random() > CONFIG.PICKUP_CHANCE) return

    // A short line of notes along the tile.
    const count = 4 + Math.floor(Math.random() * 3) // 4–6
    const start = 4
    const gap = 2.4
    for (let i = 0; i < count; i++) {
      const along = start + i * gap
      if (along > CONFIG.TILE_LEN - 4) break
      const value = pickValue()
      const mesh = buildNote(value)
      this.place(mesh, info.entryDir, r, along, lateral)
      info.group.add(mesh)
      info.pickups.push({ along, lateral, value, phase: Math.random() * Math.PI * 2, mesh })
    }
  }

  private place(mesh: THREE.Object3D, dir: Vec2, r: Vec2, along: number, lateral: number): void {
    mesh.position.set(
      dir.x * (along - HALF) + r.x * lateral,
      CONFIG.NOTE_BASE_Y,
      dir.z * (along - HALF) + r.z * lateral,
    )
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

  /** Collect notes/clues within magnet range on the current tile. */
  collect(player: Player, tile: TileInfo): PickupResult {
    const reach = CONFIG.MAGNET + CONFIG.PLAYER_RADIUS
    const result: PickupResult = { money: 0, clues: [] }
    for (const p of tile.pickups) {
      if (p.collected) continue
      const dAlong = player.distAlong - p.along
      const dLat = player.lateral - p.lateral
      if (dAlong * dAlong + dLat * dLat <= reach * reach) {
        p.collected = true
        p.mesh.visible = false
        if (p.clue && p.text) result.clues.push(p.text)
        else result.money += p.value
      }
    }
    return result
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
