// Full-screen overlays over the game canvas (spec §8, §10). Phase 1 ships the
// Start and Game Over screens; Pause/Caught and the leaderboard arrive later.

export interface GameOverStats {
  distance: number
  best: number
}

export class Screens {
  /** The primary action for the visible overlay (fired by tap / Space / Enter). */
  private primary: (() => void) | null = null
  private el: HTMLElement | null = null
  private readonly root: HTMLElement

  constructor(root: HTMLElement) {
    this.root = root
  }

  /** Invoke the visible overlay's primary action, if any. */
  confirm(): boolean {
    if (this.primary) {
      this.primary()
      return true
    }
    return false
  }

  get isOpen(): boolean {
    return this.el !== null
  }

  showStart(onStart: () => void): void {
    this.render(
      `
      <h1 class="screen-title">NAIJA&nbsp;RUN</h1>
      <p class="screen-sub">Chase the thief. Turn at the junctions. No dulling.</p>
      <button type="button" class="screen-btn" data-primary>Tap / Space to start</button>
      <ul class="screen-hints">
        <li>Swipe or ←/→ to switch lane &amp; turn</li>
        <li>Swipe up / ↑ to jump &nbsp;·&nbsp; swipe down / ↓ to slide</li>
        <li>Turn at corners &amp; junctions — miss one and you crash</li>
      </ul>`,
      onStart,
    )
  }

  showGameOver(stats: GameOverStats, onRestart: () => void): void {
    this.render(
      `
      <h1 class="screen-title">You crash!</h1>
      <p class="screen-stat">Distance: <b>${Math.round(stats.distance)}m</b></p>
      <p class="screen-stat">Best: <b>${Math.round(stats.best)}m</b></p>
      <button type="button" class="screen-btn" data-primary>Run Again</button>`,
      onRestart,
    )
  }

  hide(): void {
    this.el?.remove()
    this.el = null
    this.primary = null
  }

  private render(html: string, primary: () => void): void {
    this.hide()
    const overlay = document.createElement('div')
    overlay.className = 'screen-overlay'
    overlay.innerHTML = `<div class="screen-card">${html}</div>`
    this.root.appendChild(overlay)
    this.el = overlay
    this.primary = primary
    overlay.querySelector('[data-primary]')?.addEventListener('click', () => primary())
  }
}
