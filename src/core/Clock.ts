// Delta-time clock with a time scale for encounter slow-mo (spec §7). The scale
// lerps toward a target so slow-mo eases in/out rather than snapping.

export class Clock {
  private last = performance.now()
  scale = 1
  private targetScale = 1
  private readonly scaleLerp = 6 // higher = snappier scale changes

  /** Real seconds since the previous tick (unscaled), clamped against stalls. */
  tick(): number {
    const now = performance.now()
    const dt = Math.min((now - this.last) / 1000, 0.05)
    this.last = now
    this.scale += (this.targetScale - this.scale) * Math.min(1, dt * this.scaleLerp)
    return dt
  }

  /** Reset so a long pause (tab hidden, game over) doesn't produce a huge dt. */
  resync(): void {
    this.last = performance.now()
  }

  setTimeScale(target: number): void {
    this.targetScale = target
  }
}
