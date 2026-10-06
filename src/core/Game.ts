// Top-level state machine, scene setup and fixed update order (spec §0).
// Phase 1: INTRO → RUNNING → GAMEOVER with track, player, camera and input.

import * as THREE from 'three'
import { Clock } from './Clock'
import { Input, type Action } from './Input'
import { Track } from '../world/Track'
import { Player } from '../player/Player'
import { CameraRig } from '../player/CameraRig'
import { Screens } from '../ui/Screens'

export type GameState = 'INTRO' | 'RUNNING' | 'ENCOUNTER' | 'CAUGHT' | 'GAMEOVER'

export interface GameHooks {
  mount: HTMLElement // canvas host (the game area)
  hud: HTMLElement // live stats line
  readBest: () => number
  writeBest: (v: number) => void
}

export class Game {
  state: GameState = 'INTRO'
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly renderer: THREE.WebGLRenderer
  private readonly clock = new Clock()
  private readonly track: Track
  private readonly player: Player
  private readonly rig: CameraRig
  private readonly input: Input
  private readonly screens: Screens
  private readonly ground: THREE.Mesh

  private readonly debugEl: HTMLElement
  private frames = 0
  private fpsAccum = 0
  private fps = 0
  private readonly hooks: GameHooks

  constructor(hooks: GameHooks) {
    this.hooks = hooks
    const w = hooks.mount.clientWidth
    const h = hooks.mount.clientHeight

    this.scene.background = new THREE.Color(0x7ec8ff)

    this.camera = new THREE.PerspectiveCamera(70, w / h, 0.1, 400)
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.setSize(w, h)
    hooks.mount.appendChild(this.renderer.domElement)

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a44, 1.0))
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.4)
    sun.position.set(-4, 8, 2)
    this.scene.add(sun)

    // A large flat ground kept under the player so the world never shows a void.
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: 0x3b4a3f, roughness: 1 }),
    )
    this.ground.rotation.x = -Math.PI / 2
    this.ground.position.y = -0.2
    this.scene.add(this.ground)

    this.track = new Track(this.scene)
    this.player = new Player(this.scene, this.track, this.clock, () => this.onCrash())
    this.rig = new CameraRig(this.camera)
    this.screens = new Screens(hooks.mount)

    // Debug overlay element (hidden unless toggled).
    this.debugEl = document.createElement('div')
    this.debugEl.className = 'debug-overlay'
    this.debugEl.hidden = true
    hooks.mount.appendChild(this.debugEl)

    this.input = new Input(hooks.mount, (a) => this.onAction(a))

    window.addEventListener('resize', () => this.onResize())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clock.resync()
    })

    this.track.reset()
    this.player.reset()
    this.rig.snap(this.player)
    this.screens.showStart(() => this.start())

    this.loop()
  }

  private onAction(a: Action): void {
    if (a === 'debug') {
      this.debugEl.hidden = !this.debugEl.hidden
      return
    }
    // While an overlay is up, a tap / confirm / jump just triggers it.
    if (this.state !== 'RUNNING') {
      if (a === 'confirm' || a === 'up') this.screens.confirm()
      return
    }
    switch (a) {
      case 'left':
        this.player.onLeft()
        break
      case 'right':
        this.player.onRight()
        break
      case 'up':
        this.player.onJump()
        break
      case 'down':
        this.player.onSlide()
        break
      default:
        break
    }
  }

  private start(): void {
    this.screens.hide()
    this.track.reset()
    this.player.reset()
    this.rig.snap(this.player)
    this.clock.resync()
    this.state = 'RUNNING'
  }

  private onCrash(): void {
    this.state = 'GAMEOVER'
    const best = Math.max(this.hooks.readBest(), this.player.distance)
    this.hooks.writeBest(best)
    this.screens.showGameOver({ distance: this.player.distance, best }, () => this.start())
  }

  private loop(): void {
    requestAnimationFrame(() => this.loop())
    const dt = this.clock.tick()

    if (this.state === 'RUNNING') {
      this.player.update(dt)
      if (this.state === 'RUNNING') {
        const removed = this.track.update(this.player.currentIndex)
        this.player.currentIndex -= removed
        this.rig.update(this.player, dt)
        this.ground.position.set(this.player.position.x, -0.2, this.player.position.z)
        this.hooks.hud.textContent = `${Math.round(this.player.distance)}m`
      }
    }

    this.updateDebug(dt)
    this.renderer.render(this.scene, this.camera)
  }

  private updateDebug(dt: number): void {
    if (this.debugEl.hidden) return
    this.frames++
    this.fpsAccum += dt
    if (this.fpsAccum >= 0.5) {
      this.fps = this.frames / this.fpsAccum
      this.frames = 0
      this.fpsAccum = 0
    }
    const mem = this.renderer.info.memory
    this.debugEl.textContent =
      `FPS ${this.fps.toFixed(0)}  geo ${mem.geometries}  tex ${mem.textures}  ` +
      `tiles ${this.track.committed.length}  scale ${this.clock.scale.toFixed(2)}\n` +
      (this.state === 'RUNNING' ? this.player.debugInfo() : this.state)
  }

  private onResize(): void {
    const w = this.hooks.mount.clientWidth
    const h = this.hooks.mount.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  /** Tear down listeners and GPU resources (not used yet; here for HMR/teardown). */
  destroy(): void {
    this.input.dispose()
    this.renderer.dispose()
  }
}
