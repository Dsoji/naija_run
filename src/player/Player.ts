// Player: forward motion along the track, 3 lanes, jump, slide, and 90° turning
// at corners/junctions (spec §3, §4). Movement is expressed as distance-along
// the current tile so turning is an exact pivot at the tile centre.

import * as THREE from 'three'
import { CONFIG } from '../config'
import type { Track } from '../world/Track'
import type { Clock } from '../core/Clock'
import {
  type Side,
  type TileInfo,
  type Vec2,
  cellCenter,
  rightOf,
} from '../world/Tile'

export type PlayerState = 'RUN' | 'JUMP' | 'SLIDE' | 'TURNING' | 'STUMBLE' | 'DEAD'

const HALF = CONFIG.TILE_LEN / 2
const TURN_START = HALF - CONFIG.TURN_WINDOW_DIST // distAlong where the turn window opens

function yawOf(dir: Vec2): number {
  return Math.atan2(-dir.x, -dir.z)
}
function lerpAngle(a: number, b: number, t: number): number {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

export class Player {
  readonly group = new THREE.Group()
  state: PlayerState = 'RUN'

  dir: Vec2 = { x: 0, z: -1 }
  private lane = 0
  private laneOffset = 0

  currentIndex = 0
  distAlong = 0
  distance = 0
  private speed: number = CONFIG.BASE_SPEED

  private turnLocked = false
  private pivoted = false
  private buffered: { side: Side; expires: number } | null = null

  private jumpT = 0
  private slideT = 0
  private runPhase = 0

  private readonly legL: THREE.Mesh
  private readonly legR: THREE.Mesh
  private readonly body: THREE.Group
  private readonly track: Track
  private readonly clock: Clock
  private readonly onCrash: () => void

  constructor(scene: THREE.Scene, track: Track, clock: Clock, onCrash: () => void) {
    this.track = track
    this.clock = clock
    this.onCrash = onCrash
    // Placeholder runner: capsule body + sphere head + two box legs. Green shirt,
    // white trousers (a nod to the flag), per spec §4.
    this.body = new THREE.Group()
    const shirt = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.8 })
    const skin = new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.9 })
    const trouser = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.9 })

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.6, 4, 8), shirt)
    torso.position.y = 1.05
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin)
    head.position.y = 1.65
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.24), trouser)
    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.24), trouser)
    this.legL.position.set(-0.16, 0.4, 0)
    this.legR.position.set(0.16, 0.4, 0)
    this.body.add(torso, head, this.legL, this.legR)
    this.group.add(this.body)
    scene.add(this.group)
  }

  reset(): void {
    this.state = 'RUN'
    this.dir = { x: 0, z: -1 }
    this.lane = 0
    this.laneOffset = 0
    this.currentIndex = 0
    this.distAlong = 0
    this.distance = 0
    this.speed = CONFIG.BASE_SPEED
    this.turnLocked = false
    this.pivoted = false
    this.buffered = null
    this.jumpT = 0
    this.slideT = 0
    this.runPhase = 0
    this.body.scale.set(1, 1, 1)
    this.body.rotation.set(0, 0, 0)
    this.legL.rotation.set(0, 0, 0)
    this.legR.rotation.set(0, 0, 0)
    this.group.rotation.set(0, 0, 0)
  }

  get position(): THREE.Vector3 {
    return this.group.position
  }
  get heading(): Vec2 {
    return this.distAlong > HALF && this.pivoted ? this.currentTile.exitDir : this.dir
  }
  /** Lateral offset (metres, right of travel) — for obstacle collision. */
  get lateral(): number {
    return this.laneOffset
  }
  /** Current height above the road — for clearing JUMP obstacles. */
  get airborneY(): number {
    return this.group.position.y
  }
  get isSliding(): boolean {
    return this.state === 'SLIDE'
  }

  /** Kill the player from an external cause (obstacle hit). */
  kill(): void {
    if (this.state !== 'DEAD') this.crash()
  }
  private get currentTile(): TileInfo {
    return this.track.committed[this.currentIndex]
  }

  // --- input -----------------------------------------------------------------

  onLeft(): void {
    this.handleLateral('L')
  }
  onRight(): void {
    this.handleLateral('R')
  }
  onJump(): void {
    if (this.state === 'DEAD') return
    this.state = 'JUMP'
    this.jumpT = 0
    this.body.scale.set(1, 1, 1)
  }
  onSlide(): void {
    if (this.state === 'DEAD') return
    this.state = 'SLIDE'
    this.slideT = 0
  }

  private handleLateral(side: Side): void {
    if (this.state === 'DEAD') return
    const tile = this.currentTile
    const allowed = this.turnSideAllowed(tile, side)
    if (!allowed) {
      this.changeLane(side)
      return
    }
    if (this.distAlong >= TURN_START && !this.pivoted) {
      this.lockTurn(side)
    } else {
      this.buffered = { side, expires: performance.now() + CONFIG.TURN_BUFFER_MS }
    }
  }

  private turnSideAllowed(tile: TileInfo, side: Side): boolean {
    if (tile.type === 'T_JUNCTION') return true
    if (tile.type === 'TURN_L') return side === 'L'
    if (tile.type === 'TURN_R') return side === 'R'
    return false
  }

  private lockTurn(side: Side): void {
    const tile = this.currentTile
    if (tile.type === 'T_JUNCTION') this.track.commit(side)
    this.turnLocked = true
    this.buffered = null
    if (this.state === 'RUN') this.state = 'TURNING' // don't clobber an in-air jump/slide
  }

  private changeLane(side: Side): void {
    if (this.state === 'DEAD') return
    this.lane = Math.max(-1, Math.min(1, this.lane + (side === 'R' ? 1 : -1)))
  }

  // --- update ----------------------------------------------------------------

  update(dt: number): void {
    if (this.state === 'DEAD') return
    const sdt = dt * this.clock.scale

    // Promote a buffered turn once the window opens.
    if (this.buffered) {
      if (performance.now() > this.buffered.expires) this.buffered = null
      else if (this.distAlong >= TURN_START && !this.pivoted) this.lockTurn(this.buffered.side)
    }

    // Speed + distance.
    this.speed = Math.min(CONFIG.MAX_SPEED, this.speed + CONFIG.SPEED_RAMP * sdt)
    const move = this.speed * sdt
    const prev = this.distAlong
    this.distAlong += move
    this.distance += move

    const tile = this.currentTile

    // Pivot at the tile centre.
    if (tile.requiresTurn && !this.pivoted && prev < HALF && this.distAlong >= HALF) {
      if (this.turnLocked) {
        this.dir = tile.exitDir
        this.pivoted = true
        if (this.state === 'TURNING') this.state = 'RUN'
      } else {
        this.crash()
        return
      }
    }

    // Cross into the next tile.
    if (this.distAlong >= CONFIG.TILE_LEN) {
      const next = this.currentIndex + 1
      if (next < this.track.committed.length) {
        this.currentIndex = next
        this.distAlong -= CONFIG.TILE_LEN
        this.turnLocked = false
        this.pivoted = false
      } else {
        // No road ahead (an un-taken junction) — treat as a crash.
        this.crash()
        return
      }
    }

    this.updateVertical(dt)
    this.updatePose(dt, move)
  }

  private updateVertical(dt: number): void {
    if (this.state === 'JUMP') {
      this.jumpT += dt
      if (this.jumpT >= CONFIG.JUMP_TIME) this.state = 'RUN'
    } else if (this.state === 'SLIDE') {
      this.slideT += dt
      if (this.slideT >= CONFIG.SLIDE_TIME) {
        this.state = 'RUN'
        this.body.scale.set(1, 1, 1)
      } else {
        this.body.scale.set(1, 0.5, 1)
      }
    }
  }

  private updatePose(dt: number, move: number): void {
    const tile = this.currentTile
    const center = cellCenter(tile.cell)
    const heading = this.heading
    const pos = new THREE.Vector3()

    if (this.distAlong <= HALF && tile.requiresTurn) {
      const entryEdge = center.clone().addScaledVector(toV3(tile.entryDir), -HALF)
      pos.copy(entryEdge).addScaledVector(toV3(tile.entryDir), this.distAlong)
    } else if (tile.requiresTurn) {
      pos.copy(center).addScaledVector(toV3(tile.exitDir), this.distAlong - HALF)
    } else {
      const entryEdge = center.clone().addScaledVector(toV3(tile.entryDir), -HALF)
      pos.copy(entryEdge).addScaledVector(toV3(tile.entryDir), this.distAlong)
    }

    // Lane offset (smoothed), perpendicular to the current heading.
    const target = this.lane * CONFIG.LANE_W
    this.laneOffset += (target - this.laneOffset) * Math.min(1, dt / CONFIG.LANE_LERP)
    const r = rightOf(heading)
    pos.x += r.x * this.laneOffset
    pos.z += r.z * this.laneOffset

    // Jump arc.
    let y = 0
    if (this.state === 'JUMP') {
      const t = this.jumpT / CONFIG.JUMP_TIME
      y = CONFIG.JUMP_HEIGHT * 4 * t * (1 - t)
    }
    pos.y = y
    this.group.position.copy(pos)

    // Face the heading (smoothed so pivots don't snap).
    this.group.rotation.y = lerpAngle(this.group.rotation.y, yawOf(heading), Math.min(1, dt * 12))

    // Leg run-cycle.
    if (this.state !== 'DEAD') {
      this.runPhase += move * 1.6
      const s = Math.sin(this.runPhase)
      this.legL.rotation.x = s * 0.6
      this.legR.rotation.x = -s * 0.6
    }
  }

  private crash(): void {
    this.state = 'DEAD'
    this.body.rotation.z = 0.4
    this.onCrash()
  }

  // --- debug ------------------------------------------------------------------

  debugInfo(): string {
    const tile = this.currentTile
    const inWindow = tile.requiresTurn && this.distAlong >= TURN_START && this.distAlong < HALF
    return (
      `dist ${this.distance.toFixed(0)}m  spd ${this.speed.toFixed(1)}  ` +
      `tile ${this.currentIndex}/${this.track.committed.length} ${tile.type}  ` +
      `along ${this.distAlong.toFixed(1)}  ${inWindow ? 'IN-WINDOW ' : ''}` +
      `${tile.correct ? 'correct=' + tile.correct : ''}`
    )
  }
}

function toV3(d: Vec2): THREE.Vector3 {
  return new THREE.Vector3(d.x, 0, d.z)
}
