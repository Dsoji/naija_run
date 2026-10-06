// Encounter spawning + selection (spec §7). When a T-junction is created, an
// NPC may be attached to the straight ~2 tiles before it (so the choice can
// influence that junction). The system owns spawn rules (cooldown, distance
// gates, never the same NPC twice) and resolving a choice to a weighted set of
// effects; the Game applies the effects (it owns chase/money/markers).

import { CONFIG } from '../config'
import { type EncounterInstance, type TileInfo, rightOf } from '../world/Tile'
import { buildNPC, type NpcKind } from '../world/models'
import { police } from './data/police'
import { nero } from './data/nero'
import { agbero } from './data/agbero'
import type { Choice, EncounterDef, Effect } from './types'
import type { Player } from '../player/Player'

const HALF = CONFIG.TILE_LEN / 2
const DEFS: { id: NpcKind; def: EncounterDef }[] = [
  { id: 'police', def: police },
  { id: 'nero', def: nero },
  { id: 'agbero', def: agbero },
]

export class EncounterSystem {
  private distance = 0
  private sinceLast = 99
  private lastNpc: string | null = null

  reset(): void {
    this.distance = 0
    this.sinceLast = 99
    this.lastNpc = null
  }

  setDistance(d: number): void {
    this.distance = d
  }

  /** Called by Track when a junction is created (it's the last committed tile). */
  onJunction(committed: TileInfo[]): void {
    this.sinceLast++
    if (this.sinceLast < CONFIG.ENCOUNTER_COOLDOWN) return
    if (Math.random() > CONFIG.ENCOUNTER_CHANCE) return

    const junctionIndex = committed.length - 1
    const tile = committed[junctionIndex - 2]
    if (!tile || tile.type !== 'STRAIGHT' || tile.encounter) return

    const eligible = DEFS.filter(
      (d) => this.distance >= (d.def.minDistance ?? 0) && d.id !== this.lastNpc,
    )
    if (eligible.length === 0) return
    const chosen = eligible[Math.floor(Math.random() * eligible.length)]

    const along = 10
    const lateral = CONFIG.ROAD_W / 2 + CONFIG.SIDEWALK_W / 2 // right sidewalk
    const mesh = buildNPC(chosen.id)
    const r = rightOf(tile.entryDir)
    mesh.position.set(
      tile.entryDir.x * (along - HALF) + r.x * lateral,
      0,
      tile.entryDir.z * (along - HALF) + r.z * lateral,
    )
    mesh.rotation.y = Math.atan2(r.x, r.z) // face across the road toward the player's path
    tile.group.add(mesh)

    tile.encounter = {
      def: chosen.def,
      junction: committed[junctionIndex],
      along,
      bobPhase: Math.random() * Math.PI * 2,
      mesh,
    }
    this.lastNpc = chosen.id
    this.sinceLast = 0
  }

  /** Idle bob for NPCs on nearby tiles. */
  update(tiles: TileInfo[], currentIndex: number, dt: number): void {
    for (let i = Math.max(0, currentIndex - 1); i <= currentIndex + 3; i++) {
      const e = tiles[i]?.encounter
      if (!e) continue
      e.bobPhase += dt * 4
      e.mesh.position.y = Math.abs(Math.sin(e.bobPhase)) * 0.06
    }
  }

  /** The encounter to trigger on the player's current tile, if any. */
  triggerAt(player: Player, tile: TileInfo): EncounterInstance | null {
    const e = tile.encounter
    if (!e || e.triggered) return null
    if (player.distAlong >= e.along - CONFIG.ENCOUNTER_TRIGGER_DIST) {
      e.triggered = true
      return e
    }
    return null
  }

  /** Resolve a chosen option to a concrete effect list (weighted outcome). */
  resolve(choice: Choice): Effect[] {
    const total = choice.outcomes.reduce((s, o) => s + o.weight, 0)
    let r = Math.random() * total
    for (const o of choice.outcomes) {
      r -= o.weight
      if (r <= 0) return o.effects
    }
    return choice.outcomes[choice.outcomes.length - 1].effects
  }
}
