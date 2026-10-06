// Authoritative composite score — the server's copy of the formula in the
// game's src/config.ts (computeScore). Keep the two in sync. Computing the
// ranked number here means a tampered client can't forge it.

const MONEY_WEIGHT = 0.5
const CAUGHT_BONUS = 5000
const TIME_PAR = 300
const TIME_WEIGHT = 10

export function computeScore(s: {
  distanceMeters: number
  money: number
  timeSeconds: number
  caught: boolean
}): number {
  const base = s.distanceMeters + s.money * MONEY_WEIGHT
  const catchBonus = s.caught
    ? CAUGHT_BONUS + Math.max(0, TIME_PAR - s.timeSeconds) * TIME_WEIGHT
    : 0
  return Math.round(base + catchBonus)
}
