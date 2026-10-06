// Chase meter 0–100 (spec §6). Starts at CHASE_START. Passive decay of
// CHASE_DECAY per second once the thief hasn't been seen for 20 s. Distance
// adds +1 per 100 m; other gains/losses (clue, turns, stumble, encounters) are
// pushed in by the game via add().

import { CONFIG } from '../config'

const UNSEEN_GRACE = 20 // seconds before decay starts

export class ChaseMeter {
  value: number = CONFIG.CHASE_START
  private unseen = 0
  private lastMilestone = 0

  reset(): void {
    this.value = CONFIG.CHASE_START
    this.unseen = 0
    this.lastMilestone = 0
  }

  add(amount: number): void {
    this.value = Math.max(0, Math.min(100, this.value + amount))
  }

  /** Call when the thief is visible this frame — resets the decay timer. */
  markSeen(): void {
    this.unseen = 0
  }

  get isFull(): boolean {
    return this.value >= 100
  }

  /** Passive decay once the thief has been unseen for the grace period. */
  update(dt: number): void {
    this.unseen += dt
    if (this.unseen > UNSEEN_GRACE) this.add(-CONFIG.CHASE_DECAY * dt)
  }

  /** +1 chase for every 100 m of distance covered. */
  onDistance(distance: number): void {
    while (distance >= this.lastMilestone + 100) {
      this.lastMilestone += 100
      this.add(1)
    }
  }
}
