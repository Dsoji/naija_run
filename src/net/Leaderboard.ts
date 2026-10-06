// Leaderboard client (project addition — overrides spec §14). Submits a finished
// run's raw stats with the player's Clerk session token (the server derives the
// user id from the token and computes the authoritative composite score) and
// fetches the top runs. Degrades gracefully: when CONFIG.API_BASE is empty or a
// request fails, the UI simply hides/says unavailable and the game is unaffected.

import { CONFIG } from '../config'

export interface ScoreStats {
  distanceMeters: number
  money: number
  timeSeconds: number
  caught: boolean
}

export interface ScoreRow {
  name: string
  score: number
  distance: number
  money: number
  caught: boolean
}

export class Leaderboard {
  /** True when a backend URL is configured (VITE_API_BASE). */
  get enabled(): boolean {
    return CONFIG.API_BASE !== ''
  }

  async top(limit = 15): Promise<ScoreRow[]> {
    const res = await fetch(`${CONFIG.API_BASE}/scores/top?limit=${limit}`)
    if (!res.ok) throw new Error(`leaderboard ${res.status}`)
    return (await res.json()) as ScoreRow[]
  }

  async submit(stats: ScoreStats, token: string): Promise<void> {
    const res = await fetch(`${CONFIG.API_BASE}/scores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(stats),
    })
    if (!res.ok) throw new Error(`submit ${res.status}`)
  }
}
