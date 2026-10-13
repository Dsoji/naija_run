// Chase camera that follows the player from behind and eases its yaw through
// turns (spec §3). Position and aim are lerped so 90° pivots read smoothly.

import * as THREE from 'three'
import { CONFIG } from '../config'
import type { Vec2 } from '../world/Tile'
import type { Player } from './Player'

/** Shortest-path angular interpolation (handles wrap-around at ±π). */
function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

export class CameraRig {
  private readonly aim = new THREE.Vector3()
  private readonly camera: THREE.PerspectiveCamera
  private shakeAmount = 0
  private speed01 = 0
  private yaw = 0
  private yawInit = false

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
    const h = player.heading
    this.yaw = Math.atan2(h.x, h.z)
    this.yawInit = true
    const { pos, look } = this.targets(player, h)
    this.camera.position.copy(pos)
    this.aim.copy(look)
    this.camera.lookAt(this.aim)
  }

  update(player: Player, dt: number): void {
    // Ease the camera's yaw toward the player's heading along the shortest arc,
    // so a 90° turn swings smoothly instead of the position lerp cutting the
    // corner (which looked like a bounce-back).
    const h = player.heading
    const targetYaw = Math.atan2(h.x, h.z)
    if (!this.yawInit) {
      this.yaw = targetYaw
      this.yawInit = true
    }
    this.yaw = lerpAngle(this.yaw, targetYaw, 1 - Math.exp(-dt / CONFIG.CAM_YAW_LERP))
    const smoothed: Vec2 = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }

    const { pos, look } = this.targets(player, smoothed)
    const k = 1 - Math.exp(-dt / CONFIG.CAM_FOLLOW_LERP) // frame-rate independent
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

  private targets(player: Player, h: Vec2): { pos: THREE.Vector3; look: THREE.Vector3 } {
    // Follow lane changes only partway (the road stays steady and the runner
    // visibly moves across it), and rise a little with jumps.
    const r = { x: -h.z, z: h.x } // right of the SMOOTHED heading, so corners stay continuous
    const back = player.lateral * (1 - CONFIG.CAM_LATERAL_FOLLOW)
    const p = player.position
    const ax = p.x - r.x * back
    const az = p.z - r.z * back
    const pos = new THREE.Vector3(ax - h.x * CONFIG.CAM_BACK, CONFIG.CAM_HEIGHT + p.y * 0.35, az - h.z * CONFIG.CAM_BACK)
    const look = new THREE.Vector3(ax + h.x * CONFIG.CAM_LOOK_AHEAD, 1.2 + p.y * 0.5, az + h.z * CONFIG.CAM_LOOK_AHEAD)
    return { pos, look }
  }
}
