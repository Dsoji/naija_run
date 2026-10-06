// Chase camera that follows the player from behind and eases its yaw through
// turns (spec §3). Position and aim are lerped so 90° pivots read smoothly.

import * as THREE from 'three'
import { CONFIG } from '../config'
import type { Vec2 } from '../world/Tile'
import type { Player } from './Player'

export class CameraRig {
  private readonly aim = new THREE.Vector3()
  private readonly camera: THREE.PerspectiveCamera

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
  }

  snap(player: Player): void {
    const { pos, look } = this.targets(player)
    this.camera.position.copy(pos)
    this.aim.copy(look)
    this.camera.lookAt(this.aim)
  }

  update(player: Player, dt: number): void {
    const { pos, look } = this.targets(player)
    const k = Math.min(1, dt / CONFIG.CAM_FOLLOW_LERP)
    this.camera.position.lerp(pos, k)
    this.aim.lerp(look, k)
    this.camera.lookAt(this.aim)
  }

  private targets(player: Player): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const h: Vec2 = player.heading
    const p = player.position
    const pos = new THREE.Vector3(
      p.x - h.x * CONFIG.CAM_BACK,
      CONFIG.CAM_HEIGHT,
      p.z - h.z * CONFIG.CAM_BACK,
    )
    const look = new THREE.Vector3(
      p.x + h.x * CONFIG.CAM_LOOK_AHEAD,
      1.2,
      p.z + h.z * CONFIG.CAM_LOOK_AHEAD,
    )
    return { pos, look }
  }
}
