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

  /** Flash a transient top-centre message (spec §10): clues, "+₦500", etc. */
  toast(text: string, kind: 'clue' | 'money' | 'info' = 'info'): void {
    const t = document.createElement('div')
    t.className = `hud-toast hud-toast--${kind}`
    t.textContent = text
    t.style.animationDuration = `${CONFIG.TOAST_TIME}s`
    this.toasts.appendChild(t)
    window.setTimeout(() => t.remove(), CONFIG.TOAST_TIME * 1000)
  }

  setDistance(m: number): void {
    this.dist.textContent = `${Math.round(m)}m`
  }

  setMoney(n: number): void {
    this.money.textContent = `₦${n.toLocaleString()}`
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
