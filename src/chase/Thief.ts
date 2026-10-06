// The thief's car (spec §6). Visible once chase ≥ THIEF_VISIBLE_AT, it sits one
// junction ahead of the player and is shown having turned down one branch — the
// true side ~70% of the time, a decoy the rest (but only a decoy while chase is
// below 60, so a strong chase always reads true). The hint is locked per
// junction so it doesn't flicker. The car is a scene-level object positioned in
// world space, so it is unaffected by tile recycling/branch disposal.

import * as THREE from 'three'
import { CONFIG } from '../config'
import { type Side, type TileInfo, type Vec2, cellCenter, rightOf, turn } from '../world/Tile'
import { buildThief, buildDanfo } from '../world/models'
import type { Track } from '../world/Track'
import type { Player } from '../player/Player'

const HALF = CONFIG.TILE_LEN / 2

export class Thief {
  private readonly scene: THREE.Scene
  private readonly group: THREE.Object3D
  private traffic: THREE.Object3D[] = []
  private parked = false
  private tutorial = false
  visible = false

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.group = buildThief()
    this.group.visible = false
    scene.add(this.group)
  }

  /** Tutorial: show the thief from the start and always hint the true side. */
  setTutorial(on: boolean): void {
    this.tutorial = on
  }

  reset(): void {
    this.visible = false
    this.parked = false
    this.tutorial = false
    this.group.visible = false
    for (const t of this.traffic) {
      this.scene.remove(t)
      t.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) m.geometry.dispose()
      })
    }
    this.traffic = []
  }

  /** Park the thief ahead, stuck in traffic — the CAUGHT target (spec §6). */
  park(pos: THREE.Vector3, dir: Vec2): void {
    const yaw = Math.atan2(-dir.x, -dir.z)
    this.group.position.copy(pos)
    this.group.rotation.set(0, yaw, 0)
    this.group.visible = true
    const r = rightOf(dir)
    for (const side of [-1, 1]) {
      const car = buildDanfo()
      car.position.set(pos.x + r.x * CONFIG.LANE_W * side, 0, pos.z + r.z * CONFIG.LANE_W * side)
      car.rotation.set(0, yaw, 0)
      this.scene.add(car)
      this.traffic.push(car)
    }
    this.parked = true
    this.visible = true
  }

  /** Reposition the thief at the next junction ahead and show it if chase is
   *  high enough. Returns whether the thief is visible this frame. */
  update(track: Track, player: Player, chaseValue: number): boolean {
    if (this.parked) return true // stays put as the CAUGHT target
    if (!this.tutorial && chaseValue < CONFIG.THIEF_VISIBLE_AT) {
      this.visible = false
      this.group.visible = false
      return false
    }

    const junction = this.nextJunction(track, player.currentIndex)
    if (!junction) {
      this.visible = false
      this.group.visible = false
      return false
    }

    // Lock the hinted side once per junction.
    if (junction.thiefHint === undefined) {
      junction.thiefHint = this.decideHint(junction, chaseValue)
    }
    const dir = turn(junction.entryDir, junction.thiefHint)
    const center = cellCenter(junction.cell)
    // A little way down the hinted branch, so it reads as "he went that way".
    this.group.position.set(
      center.x + dir.x * (HALF + 6),
      0,
      center.z + dir.z * (HALF + 6),
    )
    this.group.rotation.y = Math.atan2(-dir.x, -dir.z)
    this.group.visible = true
    this.visible = true
    return true
  }

  private decideHint(junction: TileInfo, chaseValue: number): Side {
    const correct = junction.correct ?? 'L'
    if (this.tutorial || chaseValue >= 60) return correct // tutorial / strong chase: truthful
    return Math.random() < 0.7 ? correct : other(correct)
  }

  private nextJunction(track: Track, fromIndex: number): TileInfo | null {
    const tiles = track.committed
    for (let i = fromIndex + 1; i < tiles.length; i++) {
      if (tiles[i].type === 'T_JUNCTION') return tiles[i]
    }
    return null
  }
}

function other(s: Side): Side {
  return s === 'L' ? 'R' : 'L'
}
