// Chase camera that follows the player from behind and eases its yaw through
// turns (spec §3). Position and aim are lerped so 90° pivots read smoothly.

import * as THREE from 'three'
import { CONFIG } from '../config'
import type { Vec2 } from '../world/Tile'
import type { Player } from './Player'

export class CameraRig {
  private readonly aim = new THREE.Vector3()
  private readonly camera: THREE.PerspectiveCamera
  private shakeAmount = 0
  private speed01 = 0

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
  }

  /** Add a camera shake (magnitude), e.g. on a stumble or crash. */
  shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount)
  }

  /** 0..1 speed, used to kick the FOV for a sense of speed. */
  setSpeed01(t: number): void {
    this.speed01 = Math.max(0, Math.min(1, t))
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

    // FOV kick with speed.
    const targetFov = CONFIG.CAM_FOV + CONFIG.CAM_FOV_KICK * this.speed01
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 4)
    this.camera.updateProjectionMatrix()

    // Decaying shake, applied as a small positional jitter.
    if (this.shakeAmount > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmount
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmount
      this.camera.position.z += (Math.random() - 0.5) * this.shakeAmount
      this.shakeAmount *= Math.max(0, 1 - dt * 6)
    } else {
      this.shakeAmount = 0
    }
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
