// Top-level state machine, scene setup and fixed update order (spec §0).
// Phase 1: INTRO → RUNNING → GAMEOVER with track, player, camera and input.

import * as THREE from 'three'
import { CONFIG } from '../config'
import { Clock } from './Clock'
import { Input, type Action } from './Input'
import { rightOf, type EncounterInstance } from '../world/Tile'
import { Track } from '../world/Track'
import { Obstacles } from '../world/Obstacles'
import { Pickups } from '../world/Pickups'
import { ChaseMeter } from '../chase/ChaseMeter'
import { Thief } from '../chase/Thief'
import { EncounterSystem } from '../encounters/EncounterSystem'
import type { Effect } from '../encounters/types'
import { Player } from '../player/Player'
import { CameraRig } from '../player/CameraRig'
import { Screens } from '../ui/Screens'
import { HUD } from '../ui/HUD'
import { DialogueUI } from '../ui/DialogueUI'

export type GameState = 'INTRO' | 'RUNNING' | 'ENCOUNTER' | 'CAUGHT' | 'GAMEOVER'

export interface GameHooks {
  mount: HTMLElement // canvas host (the game area)
  readBest: () => number
  writeBest: (v: number) => void
  readMoney: () => number // lifetime ₦ banked across runs
  writeMoney: (v: number) => void
}

export class Game {
  state: GameState = 'INTRO'
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly renderer: THREE.WebGLRenderer
  private readonly clock = new Clock()
  private readonly track: Track
  private readonly obstacles: Obstacles
  private readonly pickups: Pickups
  private readonly chase = new ChaseMeter()
  private readonly thief: Thief
  private readonly encounters = new EncounterSystem()
  private readonly dialogue: DialogueUI
  private inEncounter = false
  private activeEncounter: EncounterInstance | null = null
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
  private catching = false
  private catchAtDistance = 0
  private runStartMs = 0
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
    this.pickups = new Pickups()
    this.track.setDecorator((t) => {
      if (!this.catching) this.obstacles.decorate(t) // keep the finale runway clear
      this.pickups.decorate(t)
    })
    this.track.setJunctionListener((committed) => {
      if (!this.catching) this.encounters.onJunction(committed)
    })
    this.thief = new Thief(this.scene)
    this.player = new Player(
      this.scene,
      this.track,
      this.clock,
      () => this.onCrash(),
      (correct) => this.onJunctionTurn(correct),
    )
    this.rig = new CameraRig(this.camera)
    this.screens = new Screens(hooks.mount)
    this.hud = new HUD(hooks.mount)
    this.hud.hide()
    this.dialogue = new DialogueUI(hooks.mount)

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
        if (this.state === 'RUNNING' && !this.paused && !this.inEncounter) this.togglePause()
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
    // During an encounter: number keys pick, pause is suppressed.
    if (this.inEncounter) {
      if (a === 'choose1') this.dialogue.chooseByKey(1)
      else if (a === 'choose2') this.dialogue.chooseByKey(2)
      else if (a === 'choose3') this.dialogue.chooseByKey(3)
      if (a === 'pause') return
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
    this.chase.reset()
    this.thief.reset()
    this.encounters.reset()
    this.dialogue.close()
    this.inEncounter = false
    this.activeEncounter = null
    this.clock.setTimeScale(1)
    this.track.reset()
    this.player.reset()
    this.rig.snap(this.player)
    this.clock.resync()
    this.paused = false
    this.pauseBtn.hidden = false
    this.money = 0
    this.catching = false
    this.catchAtDistance = 0
    this.runStartMs = performance.now()
    this.hud.show()
    this.hud.setDistance(0)
    this.hud.setMoney(0)
    this.hud.setChase(this.chase.value)
    this.state = 'RUNNING'
  }

  private onJunctionTurn(correct: boolean): void {
    this.chase.add(correct ? CONFIG.CHASE_CORRECT_TURN : CONFIG.CHASE_WRONG_TURN)
    if (!correct) this.hud.toast('Wrong turn!', 'info')
  }

  // --- encounters ------------------------------------------------------------

  private openEncounter(e: EncounterInstance): void {
    this.inEncounter = true
    this.activeEncounter = e
    this.clock.setTimeScale(CONFIG.SLOWMO_SCALE) // slow-mo, never a full pause
    this.dialogue.open(
      e.def,
      (cost) => cost === undefined || this.money >= cost,
      (index) => this.onEncounterChoice(index),
    )
  }

  private onEncounterChoice(index: number): void {
    const e = this.activeEncounter
    this.inEncounter = false
    this.activeEncounter = null
    this.clock.setTimeScale(1) // eases back over ~0.3s via the Clock
    if (!e) return
    const choice = e.def.choices[index]
    if (choice) this.applyEffects(this.encounters.resolve(choice), e)
  }

  private applyEffects(effects: Effect[], _e: EncounterInstance): void {
    for (const fx of effects) {
      switch (fx.kind) {
        case 'chase':
          this.chase.add(fx.amount)
          break
        case 'money':
          this.money = Math.max(0, this.money + fx.amount)
          this.hud.setMoney(this.money)
          break
        case 'bark':
          this.hud.toast(`${fx.speaker}: ${fx.line}`, 'info')
          break
        // revealTurn / fakeTurn / policeAssist / protection → Phase 4.2
        // shortcut → Phase 5
        default:
          break
      }
    }
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

  /** Chase hit 100 — lay a clean straight runway and park the thief ahead. */
  private tryStartCatch(): void {
    const tile = this.track.committed[this.player.currentIndex]
    if (!tile || tile.type !== 'STRAIGHT') return // wait until on a straight
    if (this.player.distAlong < 2 || this.player.distAlong > CONFIG.TILE_LEN - 2) return

    tile.obstacles.length = 0 // don't let a leftover obstacle spoil the finale
    this.track.makeRunway(this.player.currentIndex)

    const heading = this.player.heading
    const right = rightOf(heading)
    const lat = this.player.lateral
    const pos = this.player.position.clone()
    pos.x += -right.x * lat + heading.x * CONFIG.CATCH_DISTANCE // centre lane, ahead
    pos.z += -right.z * lat + heading.z * CONFIG.CATCH_DISTANCE
    pos.y = 0
    this.thief.park(pos, heading)

    this.catching = true
    this.catchAtDistance = this.player.distance + CONFIG.CATCH_DISTANCE - CONFIG.CATCH_REACH
    this.hud.toast('You see am! Traffic don hold am!', 'info')
  }

  private endRunCleanup(): void {
    this.dialogue.close()
    this.inEncounter = false
    this.activeEncounter = null
    this.clock.setTimeScale(1)
  }

  private onCaught(): void {
    this.state = 'CAUGHT'
    this.paused = false
    this.pauseBtn.hidden = true
    this.endRunCleanup()
    const best = Math.max(this.hooks.readBest(), this.player.distance)
    this.hooks.writeBest(best)
    const totalMoney = this.hooks.readMoney() + this.money
    this.hooks.writeMoney(totalMoney)
    const timeSec = (performance.now() - this.runStartMs) / 1000
    this.screens.showCaught(
      { distance: this.player.distance, best, money: this.money, totalMoney, timeSec },
      () => this.start(),
    )
  }

  private onCrash(): void {
    this.state = 'GAMEOVER'
    this.paused = false
    this.pauseBtn.hidden = true
    this.endRunCleanup()
    const best = Math.max(this.hooks.readBest(), this.player.distance)
    this.hooks.writeBest(best)
    const totalMoney = this.hooks.readMoney() + this.money
    this.hooks.writeMoney(totalMoney)
    this.screens.showGameOver(
      { distance: this.player.distance, best, money: this.money, totalMoney },
      () => this.start(),
    )
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
            this.chase.add(CONFIG.CHASE_STUMBLE)
            this.money = Math.max(0, this.money - hit.penalty)
            this.hud.setMoney(this.money)
          }
          if (this.state === 'RUNNING') {
            const got = this.pickups.collect(this.player, tile)
            if (got.money > 0) {
              this.money += got.money
              this.hud.setMoney(this.money)
            }
            for (const clue of got.clues) {
              this.chase.add(CONFIG.CHASE_CLUE)
              this.hud.toast(clue, 'clue')
            }
          }
          if (this.state === 'RUNNING' && !this.inEncounter) {
            const e = this.encounters.triggerAt(this.player, tile)
            if (e) this.openEncounter(e)
          }
        }
      }
      if (this.state === 'RUNNING') {
        const sdt = dt * this.clock.scale
        this.obstacles.setDistance(this.player.distance)
        this.obstacles.updateMoving(this.track.committed, this.player.currentIndex, sdt)
        this.pickups.update(this.track.committed, this.player.currentIndex, sdt)
        this.encounters.setDistance(this.player.distance)
        this.encounters.update(this.track.committed, this.player.currentIndex, dt)
        const removed = this.track.update(this.player.currentIndex)
        this.player.currentIndex -= removed
        this.chase.update(sdt)
        this.chase.onDistance(this.player.distance)
        if (this.chase.isFull && !this.catching) this.tryStartCatch()

        let thiefSeen: boolean
        if (this.catching) {
          thiefSeen = true
          if (this.player.distance >= this.catchAtDistance) this.onCaught()
        } else {
          thiefSeen = this.thief.update(this.track, this.player, this.chase.value)
        }
        if (this.state === 'RUNNING' && thiefSeen) this.chase.markSeen()
        this.rig.update(this.player, dt)
        this.ground.position.set(this.player.position.x, -0.2, this.player.position.z)
        this.hud.setDistance(this.player.distance)
        this.hud.setChase(this.chase.value, thiefSeen)
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
