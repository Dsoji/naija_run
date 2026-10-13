// Keyboard + touch-swipe input mapped to semantic actions (spec §4). Emits
// actions through a callback; holds no game logic. Touch-first: swipes drive
// movement and a tap means "confirm" (start / restart / dismiss).

import { CONFIG } from '../config'

export type Action =
  | 'left'
  | 'right'
  | 'up' // jump
  | 'down' // slide
  | 'confirm' // tap / Enter — start, restart
  | 'pause'
  | 'debug'
  | 'choose1'
  | 'choose2'
  | 'choose3'

export class Input {
  private touchX = 0
  private touchY = 0
  private touchT = 0
  private swiped = false // this touch already fired a swipe (it fires mid-drag)
  private readonly onTouchMove = (e: TouchEvent) => this.handleTouchMove(e)
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e)
  private readonly onTouchStart = (e: TouchEvent) => this.handleTouchStart(e)
  private readonly onTouchEnd = (e: TouchEvent) => this.handleTouchEnd(e)
  private readonly el: HTMLElement
  private readonly emit: (a: Action) => void

  constructor(el: HTMLElement, emit: (a: Action) => void) {
    this.el = el
    this.emit = emit
    window.addEventListener('keydown', this.onKey)
    el.addEventListener('touchstart', this.onTouchStart, { passive: true })
    el.addEventListener('touchmove', this.onTouchMove, { passive: true })
    el.addEventListener('touchend', this.onTouchEnd, { passive: false })
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey)
    this.el.removeEventListener('touchstart', this.onTouchStart)
    this.el.removeEventListener('touchmove', this.onTouchMove)
    this.el.removeEventListener('touchend', this.onTouchEnd)
  }

  private typingInField(): boolean {
    const a = document.activeElement
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')
  }

  private handleKey(e: KeyboardEvent): void {
    if (this.typingInField()) return
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.emit('left')
        break
      case 'ArrowRight':
      case 'KeyD':
        this.emit('right')
        break
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        e.preventDefault()
        this.emit('up')
        break
      case 'ArrowDown':
      case 'KeyS':
        this.emit('down')
        break
      case 'Enter':
        this.emit('confirm')
        break
      case 'Escape':
      case 'KeyP':
        this.emit('pause')
        break
      case 'Backquote':
        this.emit('debug')
        break
      case 'Digit1':
        this.emit('choose1')
        break
      case 'Digit2':
        this.emit('choose2')
        break
      case 'Digit3':
        this.emit('choose3')
        break
      default:
        break
    }
  }

  private handleTouchStart(e: TouchEvent): void {
    const t = e.changedTouches[0]
    this.touchX = t.clientX
    this.touchY = t.clientY
    this.touchT = performance.now()
    this.swiped = false
  }

  /** Fire the swipe the moment the finger has travelled far enough — no need to
   *  lift it (Subway Surfers-style). Keep dragging the other way and the same
   *  touch can fire again, so quick double-lane moves feel instant. */
  private handleTouchMove(e: TouchEvent): void {
    const t = e.changedTouches[0]
    const dx = t.clientX - this.touchX
    const dy = t.clientY - this.touchY
    const adx = Math.abs(dx)
    const ady = Math.abs(dy)
    if (Math.max(adx, ady) < CONFIG.SWIPE_MIN_PX) return
    if (adx > ady) this.emit(dx > 0 ? 'right' : 'left')
    else this.emit(dy > 0 ? 'down' : 'up')
    this.swiped = true
    // Re-arm from here so a continued drag counts as a fresh swipe.
    this.touchX = t.clientX
    this.touchY = t.clientY
    this.touchT = performance.now()
  }

  private handleTouchEnd(e: TouchEvent): void {
    const t = e.changedTouches[0]
    const dx = t.clientX - this.touchX
    const dy = t.clientY - this.touchY
    const dt = performance.now() - this.touchT
    const adx = Math.abs(dx)
    const ady = Math.abs(dy)
    if (this.swiped) {
      e.preventDefault() // already handled mid-drag; never also count it as a tap
      return
    }

    // Fallback for a flick too quick for any touchmove: a long-enough drag is a
    // swipe; anything smaller is a tap.
    if (dt <= CONFIG.SWIPE_MAX_MS && Math.max(adx, ady) >= CONFIG.SWIPE_MIN_PX) {
      e.preventDefault()
      if (adx > ady) this.emit(dx > 0 ? 'right' : 'left')
      else this.emit(dy > 0 ? 'down' : 'up')
    } else if (Math.max(adx, ady) < CONFIG.SWIPE_MIN_PX) {
      this.emit('confirm')
    }
  }
}
