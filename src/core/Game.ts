// Top-level state machine, scene setup and fixed update order (spec §0).
// Phase 1: INTRO → RUNNING → GAMEOVER with track, player, camera and input.

import * as THREE from 'three'
import { CONFIG } from '../config'
import { Clock } from './Clock'
import { Input, type Action } from './Input'
import { Sfx } from './Sfx'
import { cellCenter, rightOf, turn, type EncounterInstance, type ObstacleBox, type Side, type TileInfo, type Vec2 } from '../world/Tile'
import { buildArrow, buildPoliceCar, buildNPC } from '../world/models'
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
import { Leaderboard, type ScoreStats } from '../net/Leaderboard'
import { renderLeaderboard } from '../ui/LeaderboardUI'
import { isSignedIn, getToken } from '../auth'
import { openAuthModal } from '../authUI'

export type GameState = 'INTRO' | 'RUNNING' | 'ENCOUNTER' | 'CAUGHT' | 'GAMEOVER'

const UP_AXIS = new THREE.Vector3(0, 1, 0)
function other(s: Side): Side {
  return s === 'L' ? 'R' : 'L'
}
function touchButton(glyph: string, label: string, onTap: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'touch-btn'
  b.setAttribute('aria-label', label)
  b.textContent = glyph
  // Use touchstart so it responds instantly without the 300ms click delay.
  b.addEventListener('touchstart', (e) => {
    e.preventDefault()
    onTap()
  })
  b.addEventListener('click', onTap)
  return b
}

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
  private policeAssistTimer = 0
  private policeCar: THREE.Object3D | null = null
  private neroGuide: THREE.Object3D | null = null
  private neroShown = false
  private neroPhase = 0
  private calloutCooldown = 0
  private tutorialActive = false
  private readonly leaderboard = new Leaderboard()
  private submittedThisRun = false
  private lastStats: ScoreStats | null = null
  private readonly player: Player
  private readonly rig: CameraRig
  private readonly input: Input
  private readonly screens: Screens
  private readonly hud: HUD
  private readonly ground: THREE.Mesh

  private readonly debugEl: HTMLElement
  private readonly pauseBtn: HTMLButtonElement
  private readonly muteBtn: HTMLButtonElement
  private readonly touchControls: HTMLElement
  private readonly sfx = new Sfx()
  private paused = false
  private money = 0
  private catching = false
  private onBridge = false
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
    this.scene.fog = new THREE.Fog(sky.getHex(), 38, 150) // hides tile pop-in (spec §9)

    this.camera = new THREE.PerspectiveCamera(CONFIG.CAM_FOV, w / h, 0.1, 400)
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.setSize(w, h)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.2
    hooks.mount.appendChild(this.renderer.domElement)

    // Warm tropical key light + a slightly warm ground bounce for a sunnier read.
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x4a4038, 0.95))
    const sun = new THREE.DirectionalLight(0xffe7bf, 1.55)
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
      if (t.type === 'MARKET_ENTRY') {
        this.obstacles.decorateMarket(t)
        return
      }
      if (!this.catching) this.obstacles.decorate(t) // keep the finale runway clear
      this.pickups.decorate(t)
    })
    this.track.setJunctionListener((committed) => {
      if (!this.catching) this.encounters.onJunction(committed)
    })
    this.track.setMarketExitListener(() => this.onMarketExit())
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

    // Mute toggle (always visible).
    this.muteBtn = document.createElement('button')
    this.muteBtn.type = 'button'
    this.muteBtn.className = 'mute-btn'
    this.muteBtn.setAttribute('aria-label', 'Mute')
    this.muteBtn.textContent = this.sfx.muted ? '🔇' : '🔊'
    this.muteBtn.addEventListener('click', () => {
      this.sfx.resume()
      this.sfx.setMuted(!this.sfx.muted)
      this.muteBtn.textContent = this.sfx.muted ? '🔇' : '🔊'
    })
    hooks.mount.appendChild(this.muteBtn)

    // On-screen jump/slide for touch (CSS hides these on fine pointers). Swipes
    // still work; these are for discoverability on phones.
    this.touchControls = document.createElement('div')
    this.touchControls.className = 'touch-controls'
    this.touchControls.hidden = true
    const jumpBtn = touchButton('⤒', 'Jump', () => this.onAction('up'))
    const slideBtn = touchButton('⤓', 'Slide', () => this.onAction('down'))
    this.touchControls.append(jumpBtn, slideBtn)
    hooks.mount.appendChild(this.touchControls)

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
        this.sfx.play('jump')
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
    this.sfx.resume()
    this.sfx.startMusic()
    this.obstacles.reset()
    this.chase.reset()
    this.thief.reset()
    this.thief.setTutorial(true) // show the thief + truthful hint at the first junction
    this.tutorialActive = true
    this.encounters.reset()
    this.dialogue.close()
    this.inEncounter = false
    this.activeEncounter = null
    this.policeAssistTimer = 0
    if (this.policeCar) this.policeCar.visible = false
    this.neroShown = false
    this.calloutCooldown = 0
    if (this.neroGuide) this.neroGuide.visible = false
    this.clock.setTimeScale(1)
    this.onBridge = false
    this.track.reset()
    this.player.reset()
    this.rig.snap(this.player)
    this.clock.resync()
    this.paused = false
    this.pauseBtn.hidden = false
    this.touchControls.hidden = false
    this.money = 0
    this.catching = false
    this.catchAtDistance = 0
    this.runStartMs = performance.now()
    this.submittedThisRun = false
    this.lastStats = null
    this.hud.show()
    this.hud.setDistance(0)
    this.hud.setMoney(0)
    this.hud.setChase(this.chase.value)
    this.state = 'RUNNING'
  }

  private onJunctionTurn(correct: boolean): void {
    this.chase.add(correct ? CONFIG.CHASE_CORRECT_TURN : CONFIG.CHASE_WRONG_TURN)
    if (!correct) this.hud.toast('Wrong turn!', 'info')
    if (this.tutorialActive) {
      this.tutorialActive = false
      this.thief.setTutorial(false) // tutorial ends after the first junction
    }
  }

  // --- encounters ------------------------------------------------------------

  private openEncounter(e: EncounterInstance): void {
    this.inEncounter = true
    this.activeEncounter = e
    this.sfx.play('horn')
    // Owner override of spec §7: fully pause the world while the choice timer
    // (real-time, in DialogueUI) counts down, instead of slow-mo.
    this.clock.setTimeScale(0, true)
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

  private applyEffects(effects: Effect[], e: EncounterInstance): void {
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
        case 'revealTurn':
          this.markJunction(e.junction, e.junction.correct ?? 'L')
          this.hud.turnCue(e.junction.correct ?? 'L')
          break
        case 'fakeTurn':
          this.markJunction(e.junction, other(e.junction.correct ?? 'L'))
          // No "scam" hint — it must look identical to a real reveal.
          break
        case 'protection':
          this.player.protect(fx.seconds)
          this.hud.toast('Covered! 🛡', 'info')
          break
        case 'policeAssist':
          this.startPoliceAssist(fx.seconds)
          break
        case 'shortcut':
          this.track.startShortcut(e.junction)
          this.markJunction(e.junction, e.junction.correct ?? 'L') // guide into the market
          this.hud.turnCue(e.junction.correct ?? 'L')
          break
        default:
          break
      }
    }
  }

  /** Place the glowing "this way" arrow on one branch of a junction (child of
   *  the junction group, so it survives branch disposal on commit). */
  private markJunction(junction: TileInfo, side: Side): void {
    const dir = turn(junction.entryDir, side)
    const arrow = buildArrow()
    arrow.position.set(dir.x * (CONFIG.TILE_LEN / 2 + 5), 0, dir.z * (CONFIG.TILE_LEN / 2 + 5))
    arrow.rotateOnWorldAxis(UP_AXIS, Math.atan2(dir.x, dir.z))
    junction.group.add(arrow)
  }

  private onMarketExit(): void {
    this.chase.add(CONFIG.CHASE_MARKET_EXIT)
    this.hud.toast('Comot for market! Chase up! 🔥', 'info')
  }

  /** Nero runs ahead through the market, calling out the next obstacle. */
  private updateNero(tile: TileInfo | undefined, sdt: number): void {
    const onMarket = !!tile?.market
    if (onMarket && !this.neroShown) {
      if (!this.neroGuide) {
        this.neroGuide = buildNPC('nero')
        this.scene.add(this.neroGuide)
      }
      this.neroGuide.visible = true
      this.neroShown = true
    } else if (!onMarket && this.neroShown) {
      if (this.neroGuide) this.neroGuide.visible = false
      this.neroShown = false
    }
    if (!this.neroShown || !this.neroGuide || !tile) return

    const h = this.player.heading
    const r = rightOf(h)
    const p = this.player.position
    this.neroPhase += sdt * 8
    this.neroGuide.position.set(
      p.x - r.x * this.player.lateral + h.x * CONFIG.NERO_AHEAD,
      Math.abs(Math.sin(this.neroPhase)) * 0.12,
      p.z - r.z * this.player.lateral + h.z * CONFIG.NERO_AHEAD,
    )
    this.neroGuide.rotation.set(0, Math.atan2(-h.x, -h.z), 0)

    this.calloutCooldown -= sdt
    if (this.calloutCooldown <= 0) {
      const call = this.nextCallout(tile)
      if (call) {
        this.hud.toast(call, 'info')
        this.calloutCooldown = CONFIG.CALLOUT_COOLDOWN
      }
    }
  }

  private nextCallout(tile: TileInfo): string | null {
    const look = CONFIG.CALLOUT_LOOKAHEAD
    let best: { d: number; ob: ObstacleBox } | null = null
    const consider = (ob: ObstacleBox, d: number) => {
      if (d > 0 && d <= look && !ob.announced && !ob.gone && (!best || d < best.d)) best = { d, ob }
    }
    for (const ob of tile.obstacles) consider(ob, ob.along - this.player.distAlong)
    const next = this.track.committed[this.player.currentIndex + 1]
    if (next) {
      for (const ob of next.obstacles) {
        consider(ob, CONFIG.TILE_LEN - this.player.distAlong + ob.along)
      }
    }
    if (!best) return null
    const chosen = best as { d: number; ob: ObstacleBox }
    chosen.ob.announced = true
    if (chosen.ob.action === 'SLIDE') return 'SLIDE!'
    if (chosen.ob.action === 'JUMP') return 'JUMP!'
    return Math.round(chosen.ob.lateral / CONFIG.LANE_W) > 0 ? 'LEFT!' : 'RIGHT!'
  }

  private startPoliceAssist(seconds: number): void {
    this.policeAssistTimer = seconds
    if (!this.policeCar) {
      this.policeCar = buildPoliceCar()
      this.scene.add(this.policeCar)
    }
    this.policeCar.visible = true
    this.sfx.play('siren')
    this.hud.toast('POLICE ASSIST!', 'info')
  }

  /** Each frame while active: +1 chase/s, clear the centre lane ahead, and keep
   *  the escort car running ahead of the player. */
  private updatePoliceAssist(sdt: number): void {
    if (this.policeAssistTimer <= 0) return
    this.policeAssistTimer -= sdt
    this.chase.add(sdt)

    const tiles = this.track.committed
    for (let i = this.player.currentIndex; i <= this.player.currentIndex + 2; i++) {
      const tile = tiles[i]
      if (!tile) continue
      for (const ob of tile.obstacles) {
        if (ob.gone) continue
        if (Math.round(ob.lateral / CONFIG.LANE_W) === 0) {
          ob.gone = true
          if (ob.mesh) ob.mesh.visible = false
        }
      }
    }

    if (this.policeCar) {
      // Follow the road ahead (around corners), not a straight projection — so
      // the car doesn't shoot off the map at a junction before turning.
      const e = this.escortPoint(CONFIG.ESCORT_AHEAD)
      this.policeCar.position.set(e.x, 0, e.z)
      this.policeCar.rotation.set(0, e.yaw, 0)
    }

    if (this.policeAssistTimer <= 0 && this.policeCar) this.policeCar.visible = false
  }

  /** Walk `ahead` metres forward along the committed path from the player's
   *  current spot, turning at tile centres. Clamps at a not-yet-committed
   *  junction so the car waits at the corner instead of flying straight on. */
  private escortPoint(ahead: number): { x: number; z: number; yaw: number } {
    const HALF = CONFIG.TILE_LEN / 2
    const tiles = this.track.committed
    let i = this.player.currentIndex
    let local = this.player.distAlong
    let remaining = ahead
    while (i < tiles.length) {
      const avail = CONFIG.TILE_LEN - local
      if (remaining <= avail) {
        local += remaining
        break
      }
      if (i + 1 >= tiles.length) {
        local = CONFIG.TILE_LEN
        break
      }
      remaining -= avail
      i += 1
      local = 0
    }
    const tile = tiles[Math.min(i, tiles.length - 1)]
    const pending = this.track.pendingJunction()
    if (tile === pending && local > HALF) local = HALF // hold at the corner
    const useExit = tile.requiresTurn && local > HALF && tile !== pending
    const dir: Vec2 = useExit ? tile.exitDir : tile.entryDir
    const center = cellCenter(tile.cell)
    return {
      x: center.x + dir.x * (local - HALF),
      z: center.z + dir.z * (local - HALF),
      yaw: Math.atan2(-dir.x, -dir.z),
    }
  }

  private togglePause(): void {
    if (this.state !== 'RUNNING') return
    this.paused = !this.paused
    if (this.paused) {
      this.pauseBtn.hidden = true
      this.touchControls.hidden = true
      this.screens.showPause(() => this.togglePause())
    } else {
      this.screens.hide()
      this.pauseBtn.hidden = false
      this.touchControls.hidden = false
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

  private mountLeaderboard(card: HTMLElement): void {
    renderLeaderboard(card, {
      lb: this.leaderboard,
      signedIn: isSignedIn(),
      canSubmit: isSignedIn() && !this.submittedThisRun,
      onSubmit: async () => {
        const token = await getToken()
        if (!token || !this.lastStats) throw new Error('not signed in')
        await this.leaderboard.submit(this.lastStats, token)
        this.submittedThisRun = true
      },
      onSignIn: () => openAuthModal('sign-in'),
    })
  }

  private endRunCleanup(): void {
    this.sfx.stopMusic()
    this.dialogue.close()
    this.inEncounter = false
    this.activeEncounter = null
    this.policeAssistTimer = 0
    if (this.policeCar) this.policeCar.visible = false
    this.neroShown = false
    if (this.neroGuide) this.neroGuide.visible = false
    this.clock.setTimeScale(1)
  }

  private onCaught(): void {
    this.state = 'CAUGHT'
    this.paused = false
    this.pauseBtn.hidden = true
    this.touchControls.hidden = true
    this.endRunCleanup()
    const best = Math.max(this.hooks.readBest(), this.player.distance)
    this.hooks.writeBest(best)
    const totalMoney = this.hooks.readMoney() + this.money
    this.hooks.writeMoney(totalMoney)
    const timeSec = (performance.now() - this.runStartMs) / 1000
    this.lastStats = { distanceMeters: this.player.distance, money: this.money, timeSeconds: timeSec, caught: true }
    this.screens.showCaught(
      { distance: this.player.distance, best, money: this.money, totalMoney, timeSec },
      () => this.start(),
      (card) => this.mountLeaderboard(card),
    )
  }

  private onCrash(): void {
    this.state = 'GAMEOVER'
    this.paused = false
    this.pauseBtn.hidden = true
    this.touchControls.hidden = true
    this.sfx.play('crash')
    this.endRunCleanup()
    const best = Math.max(this.hooks.readBest(), this.player.distance)
    this.hooks.writeBest(best)
    const totalMoney = this.hooks.readMoney() + this.money
    this.hooks.writeMoney(totalMoney)
    const timeSec = (performance.now() - this.runStartMs) / 1000
    this.lastStats = { distanceMeters: this.player.distance, money: this.money, timeSeconds: timeSec, caught: false }
    this.screens.showGameOver(
      { distance: this.player.distance, best, money: this.money, totalMoney },
      () => this.start(),
      (card) => this.mountLeaderboard(card),
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
            if (this.player.consumeProtection()) {
              this.player.stumble()
              this.rig.shake(CONFIG.SHAKE_STUMBLE)
              this.hud.toast('Shielded!', 'info')
            } else {
              this.rig.shake(CONFIG.SHAKE_CRASH)
              this.player.kill()
            }
          } else if (hit.kind === 'stumble') {
            this.player.stumble()
            this.rig.shake(CONFIG.SHAKE_STUMBLE)
            this.chase.add(CONFIG.CHASE_STUMBLE)
            this.money = Math.max(0, this.money - hit.penalty)
            this.hud.setMoney(this.money)
          }
          if (this.state === 'RUNNING') {
            const got = this.pickups.collect(this.player, tile)
            if (got.money > 0) {
              this.money += got.money
              this.hud.setMoney(this.money)
              this.hud.popMoney()
              this.sfx.play('pickup')
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
        this.updatePoliceAssist(sdt)
        this.updateNero(this.track.committed[this.player.currentIndex], sdt)
        const removed = this.track.update(this.player.currentIndex)
        this.player.currentIndex -= removed

        // Announce the Ikoyi Link Bridge once, on entry.
        const curTile = this.track.committed[this.player.currentIndex]
        if (curTile?.bridge && !this.onBridge) {
          this.onBridge = true
          this.hud.toast('🌉 Ikoyi Link Bridge', 'info')
        } else if (curTile && !curTile.bridge && this.onBridge) {
          this.onBridge = false
        }

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
        this.rig.setSpeed01(this.player.speed01)
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
