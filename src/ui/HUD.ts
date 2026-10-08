// HUD overlay: distance (top-left), ₦ total (top-right), and the CHASE bar
// (top-centre) (spec §6, §10). HTML/CSS over the canvas — no canvas text. The
// chase bar is drawn here; its value is driven by the chase system (Phase 3).

import { CONFIG } from '../config'

export class HUD {
  private readonly dist: HTMLElement
  private readonly money: HTMLElement
  private readonly chaseFill: HTMLElement
  private readonly chaseWrap: HTMLElement
  private readonly toasts: HTMLElement

  constructor(mount: HTMLElement) {
    this.dist = el('hud-dist', '0m')
    this.money = el('hud-money', '₦0')

    this.chaseWrap = document.createElement('div')
    this.chaseWrap.className = 'hud-chase'
    this.chaseFill = document.createElement('div')
    this.chaseFill.className = 'hud-chase-fill'
    const label = document.createElement('span')
    label.className = 'hud-chase-label'
    label.textContent = 'CHASE'
    this.chaseWrap.append(this.chaseFill, label)

    this.toasts = document.createElement('div')
    this.toasts.className = 'hud-toasts'

    mount.append(this.dist, this.money, this.chaseWrap, this.toasts)
  }

  /** Flash a transient top-centre message (spec §10): clues, "+₦500", etc.
   *  `turn` is the big, high-visibility "where to run" cue. */
  toast(text: string, kind: 'clue' | 'money' | 'info' | 'turn' = 'info'): void {
    const t = document.createElement('div')
    t.className = `hud-toast hud-toast--${kind}`
    t.textContent = text
    // in/out spans the toast's lifetime; the turn cue also has a fast pulse.
    t.style.animationDuration =
      kind === 'turn' ? `${CONFIG.TOAST_TIME}s, 0.7s` : `${CONFIG.TOAST_TIME}s`
    this.toasts.appendChild(t)
    window.setTimeout(() => t.remove(), CONFIG.TOAST_TIME * 1000)
  }

  /** Big directional cue telling the player which way to follow the thief. */
  turnCue(side: 'L' | 'R'): void {
    this.toast(side === 'L' ? '⬅ FOLLOW AM • LEFT' : 'FOLLOW AM • RIGHT ➡', 'turn')
  }

  setDistance(m: number): void {
    this.dist.textContent = `${Math.round(m)}m`
  }

  setMoney(n: number): void {
    this.money.textContent = `₦${n.toLocaleString()}`
  }

  /** A quick scale pop on the ₦ counter when notes are collected. */
  popMoney(): void {
    this.money.classList.remove('is-pop')
    void this.money.offsetWidth // restart the animation
    this.money.classList.add('is-pop')
  }

  /** chase is 0–100. `pulse` highlights the bar when the thief is visible. */
  setChase(pct: number, pulse = false): void {
    this.chaseFill.style.width = `${Math.max(0, Math.min(100, pct))}%`
    this.chaseWrap.classList.toggle('is-pulsing', pulse)
  }

  show(): void {
    this.dist.hidden = false
    this.money.hidden = false
    this.chaseWrap.hidden = false
  }

  hide(): void {
    this.dist.hidden = true
    this.money.hidden = true
    this.chaseWrap.hidden = true
  }
}

function el(className: string, text: string): HTMLElement {
  const d = document.createElement('div')
  d.className = className
  d.textContent = text
  return d
}
