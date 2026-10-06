// Full-screen overlays over the game canvas (spec §8, §10). Phase 1 ships the
// Start and Game Over screens; Pause/Caught and the leaderboard arrive later.

export interface GameOverStats {
  distance: number
  best: number
  money: number // ₦ collected this run
  totalMoney: number // lifetime ₦ banked
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
      <p class="intro-line" style="animation-delay:0.2s">You park your motor. You comot for five minutes.</p>
      <p class="intro-line" style="animation-delay:1.3s">Omo! Your motor just pass there!</p>
      <p class="intro-line intro-run" style="animation-delay:2.4s">RUN.</p>
      <button type="button" class="screen-btn intro-cta" style="animation-delay:3.2s" data-primary>Tap / Space to start</button>
      <ul class="screen-hints intro-cta" style="animation-delay:3.2s">
        <li>Swipe or ←/→ to switch lane &amp; turn</li>
        <li>Swipe up / ↑ to jump &nbsp;·&nbsp; swipe down / ↓ to slide</li>
        <li>Follow the thief at junctions — miss a turn and you crash</li>
      </ul>`,
      onStart,
    )
  }

  showPause(onResume: () => void): void {
    this.render(
      `
      <h1 class="screen-title">Paused</h1>
      <p class="screen-sub">Catch your breath.</p>
      <button type="button" class="screen-btn" data-primary>Resume</button>
      <ul class="screen-hints"><li>Esc / P or tap Resume to continue</li></ul>`,
      onResume,
    )
  }

  showCaught(stats: GameOverStats & { timeSec: number }, onRestart: () => void): void {
    const mm = Math.floor(stats.timeSec / 60)
    const ss = Math.round(stats.timeSec % 60)
    this.render(
      `
      <h1 class="screen-title screen-title--win">You catch am!</h1>
      <p class="screen-sub">You run down the thief. Lagos no easy.</p>
      <p class="screen-stat">Distance: <b>${Math.round(stats.distance)}m</b> &nbsp;·&nbsp; Time: <b>${mm}:${String(ss).padStart(2, '0')}</b></p>
      <p class="screen-stat">This run: <b>₦${stats.money.toLocaleString()}</b> &nbsp;·&nbsp; Total: <b>₦${stats.totalMoney.toLocaleString()}</b></p>
      <button type="button" class="screen-btn" data-primary>Run Again</button>`,
      onRestart,
    )
  }

  showGameOver(stats: GameOverStats, onRestart: () => void): void {
    this.render(
      `
      <h1 class="screen-title">You crash!</h1>
      <p class="screen-stat">Distance: <b>${Math.round(stats.distance)}m</b> &nbsp;·&nbsp; Best: <b>${Math.round(stats.best)}m</b></p>
      <p class="screen-stat">This run: <b>₦${stats.money.toLocaleString()}</b> &nbsp;·&nbsp; Total: <b>₦${stats.totalMoney.toLocaleString()}</b></p>
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
