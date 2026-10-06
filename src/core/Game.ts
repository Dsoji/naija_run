// Top-level state machine, scene setup and fixed update order (spec §0).
// Phase 1: INTRO → RUNNING → GAMEOVER with track, player, camera and input.

import * as THREE from 'three'
import { CONFIG } from '../config'
import { Clock } from './Clock'
import { Input, type Action } from './Input'
import { Track } from '../world/Track'
import { Obstacles } from '../world/Obstacles'
import { Player } from '../player/Player'
import { CameraRig } from '../player/CameraRig'
import { Screens } from '../ui/Screens'
import { HUD } from '../ui/HUD'

export type GameState = 'INTRO' | 'RUNNING' | 'ENCOUNTER' | 'CAUGHT' | 'GAMEOVER'

export interface GameHooks {
  mount: HTMLElement // canvas host (the game area)
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
  private readonly obstacles: Obstacles
  private readonly player: Player
  private readonly rig: CameraRig
  private readonly input: Input
  private readonly screens: Screens
  private readonly hud: HUD
  private readonly ground: THREE.Mesh

  private readonly debugEl: HTMLElement
  private readonly pauseBtn: HTMLButtonElement
  private paused = false
  private money = 0
  private frames = 0
  private fpsAccum = 0
  private fps = 0
  private readonly hooks: GameHooks

  constructor(hooks: GameHooks) {
    this.hooks = hooks
    const w = hooks.mount.clientWidth
    const h = hooks.mount.clientHeight

    const sky = new THREE.Color(0x8fd0ff)
    this.scene.background = sky
    this.scene.fog = new THREE.Fog(sky.getHex(), 35, 135) // hides tile pop-in (spec §9)

    this.camera = new THREE.PerspectiveCamera(70, w / h, 0.1, 400)
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.setSize(w, h)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
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
    this.obstacles = new Obstacles()
    this.track.setDecorator((t) => this.obstacles.decorate(t))
    this.player = new Player(this.scene, this.track, this.clock, () => this.onCrash())
    this.rig = new CameraRig(this.camera)
    this.screens = new Screens(hooks.mount)
    this.hud = new HUD(hooks.mount)
    this.hud.hide()

    // Debug overlay element (hidden unless toggled).
    this.debugEl = document.createElement('div')
    this.debugEl.className = 'debug-overlay'
    this.debugEl.hidden = true
    hooks.mount.appendChild(this.debugEl)

    // Touch-friendly pause button (also works with a mouse); hidden until play.
    this.pauseBtn = document.createElement('button')
    this.pauseBtn.type = 'button'
    this.pauseBtn.className = 'pause-btn'
    this.pauseBtn.setAttribute('aria-label', 'Pause')
    this.pauseBtn.textContent = '❚❚'
    this.pauseBtn.hidden = true
    this.pauseBtn.addEventListener('click', () => this.togglePause())
    hooks.mount.appendChild(this.pauseBtn)

    this.input = new Input(hooks.mount, (a) => this.onAction(a))

    window.addEventListener('resize', () => this.onResize())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.clock.resync()
        if (this.state === 'RUNNING' && !this.paused) this.togglePause() // auto-pause
      }
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
    if (this.paused) {
      if (a === 'pause' || a === 'confirm' || a === 'up') this.togglePause()
      return
    }
    if (a === 'pause') {
      this.togglePause()
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
    this.obstacles.reset()
    this.track.reset()
    this.player.reset()
    this.rig.snap(this.player)
    this.clock.resync()
    this.paused = false
    this.pauseBtn.hidden = false
    this.money = 0
    this.hud.show()
    this.hud.setDistance(0)
    this.hud.setMoney(0)
    this.hud.setChase(CONFIG.CHASE_START)
    this.state = 'RUNNING'
  }

  private togglePause(): void {
    if (this.state !== 'RUNNING') return
    this.paused = !this.paused
    if (this.paused) {
      this.pauseBtn.hidden = true
      this.screens.showPause(() => this.togglePause())
    } else {
      this.screens.hide()
      this.pauseBtn.hidden = false
      this.clock.resync() // avoid a dt spike after the pause
    }
  }

  private onCrash(): void {
    this.state = 'GAMEOVER'
    this.paused = false
    this.pauseBtn.hidden = true
    const best = Math.max(this.hooks.readBest(), this.player.distance)
    this.hooks.writeBest(best)
    this.screens.showGameOver({ distance: this.player.distance, best }, () => this.start())
  }

  private loop(): void {
    requestAnimationFrame(() => this.loop())
    const dt = this.clock.tick()

    if (this.state === 'RUNNING' && !this.paused) {
      this.player.update(dt)
      if (this.state === 'RUNNING') {
        const tile = this.track.committed[this.player.currentIndex]
        if (tile) {
          const hit = this.obstacles.collide(this.player, tile)
          if (hit.kind === 'crash') {
            this.player.kill()
          } else if (hit.kind === 'stumble') {
            this.player.stumble()
            this.money = Math.max(0, this.money - hit.penalty)
            this.hud.setMoney(this.money)
          }
        }
      }
      if (this.state === 'RUNNING') {
        this.obstacles.setDistance(this.player.distance)
        this.obstacles.updateMoving(this.track.committed, dt * this.clock.scale)
        const removed = this.track.update(this.player.currentIndex)
        this.player.currentIndex -= removed
        this.rig.update(this.player, dt)
        this.ground.position.set(this.player.position.x, -0.2, this.player.position.z)
        this.hud.setDistance(this.player.distance)
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
