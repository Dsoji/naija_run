// Single source of tuning for Naija Run. Every magic number lives here so the
// game can be balanced from one place (spec §11). Keep gameplay code reading
// from CONFIG rather than hardcoding values.

export const CONFIG = {
  // --- Lanes & player movement ---------------------------------------------
  LANE_W: 2.2,
  BASE_SPEED: 11,
  MAX_SPEED: 22,
  SPEED_RAMP: 0.08, // m/s gained per second
  JUMP_TIME: 0.6,
  JUMP_HEIGHT: 1.6,
  SLIDE_TIME: 0.7,

  // --- Track generation -----------------------------------------------------
  TILE_LEN: 20,
  TILES_AHEAD: 12,
  TILES_BEHIND: 3,
  TURN_WINDOW_DIST: 6, // metres before a corner/junction centre where a turn registers
  TURN_BUFFER_MS: 150, // early turn presses are buffered this long
  CAMERA_TURN_TIME: 0.25, // seconds for the camera yaw to lerp through a turn
  JUNCTION_EVERY_MIN: 4, // straights between junctions (inclusive range)
  JUNCTION_EVERY_MAX: 7,
  FORCED_TURN_CHANCE: 0.25,

  // --- Difficulty -----------------------------------------------------------
  DENSITY_START: 0.35, // obstacle spawn chance per straight tile at the start
  DENSITY_MAX: 0.8,
  DENSITY_RAMP_DIST: 1500, // metres over which density climbs START → MAX
  GOAT_SPEED: 2.0, // m/s a goat drifts across lanes
  ONCOMING_SPEED: 7, // m/s an oncoming vehicle closes toward the player

  // --- Encounters -----------------------------------------------------------
  ENCOUNTER_TIME: 3.5, // real-time seconds to choose before auto-ignore
  SLOWMO_SCALE: 0.25,
  ENCOUNTER_TRIGGER_DIST: 15, // metres before the NPC that opens the dialogue
  ENCOUNTER_CHANCE: 0.7, // chance a junction gets an encounter (subject to cooldown)
  ENCOUNTER_COOLDOWN: 2, // junctions to wait between encounters

  // --- Chase ----------------------------------------------------------------
  CHASE_START: 10,
  THIEF_VISIBLE_AT: 40,
  CHASE_DECAY: 0.5, // per second when the thief has not been seen for 20 s
  CHASE_CORRECT_TURN: 6,
  CHASE_WRONG_TURN: -8,
  CHASE_CLUE: 8,
  CHASE_STUMBLE: -5,
  CHASE_MARKET_EXIT: 15,
  CATCH_DISTANCE: 120, // metres of clean runway to the stuck thief when chase hits 100
  CATCH_REACH: 6, // metres from the thief that counts as CAUGHT

  // --- ₦ pickups ------------------------------------------------------------
  MAGNET: 0.8, // metres: notes within this planar distance are collected
  PICKUP_CHANCE: 0.5, // chance a straight tile carries a note line
  CLUE_CHANCE: 0.08, // chance a straight tile carries a clue instead (chase bonus: CHASE_CLUE, from Phase 3)
  TOAST_TIME: 3.0, // seconds a HUD toast stays up
  NOTE_BASE_Y: 1.0, // float height of a note
  NOTES: [
    { value: 50, weight: 0.5 },
    { value: 100, weight: 0.3 },
    { value: 200, weight: 0.15 },
    { value: 500, weight: 0.05 },
  ],

  // --- Stumble (hitting a soft obstacle like a pothole) --------------------
  STUMBLE_TIME: 1.0, // seconds to recover full speed after a stumble
  STUMBLE_SPEED: 0.5, // speed multiplier at the moment of a stumble
  POTHOLE_PENALTY: 50, // ₦ lost when you hit a pothole

  // --- Player visuals & lane feel (Phase 1) --------------------------------
  LANE_LERP: 0.12, // seconds-ish smoothing for lane changes
  PLAYER_RADIUS: 0.45, // collider half-width (used from Phase 2)
  PLAYER_HEIGHT: 1.2,

  // --- Track visuals (Phase 1) ---------------------------------------------
  ROAD_W: 7.8, // 3 lanes * LANE_W + margin
  SIDEWALK_W: 1.4,
  LANE_LINE_W: 0.12,

  // --- Camera (Phase 1) -----------------------------------------------------
  CAM_BACK: 7, // metres behind the player
  CAM_HEIGHT: 4.2,
  CAM_LOOK_AHEAD: 8, // metres ahead of the player the camera aims at
  CAM_FOLLOW_LERP: 0.18, // position smoothing

  // --- Input ----------------------------------------------------------------
  SWIPE_MIN_PX: 30,
  SWIPE_MAX_MS: 300,

  // --- Leaderboard (project addition — overrides spec §14) ------------------
  // Composite score computed from a finished run. The authoritative copy of
  // this formula also lives on the server so the ranked number can't be forged;
  // these constants must be kept in sync with it.
  SCORE_MONEY_WEIGHT: 0.5, // ₦ collected contributes at this rate
  SCORE_CAUGHT_BONUS: 5000, // flat bonus for catching the thief (a win)
  SCORE_TIME_PAR: 300, // seconds; catching faster than par adds points
  SCORE_TIME_WEIGHT: 10, // points per second under par (only when caught)

  // Backend API base URL. Empty string => leaderboard disabled / offline
  // (the game stays fully playable). Overridden per environment via VITE_API_BASE.
  API_BASE: (import.meta.env.VITE_API_BASE as string | undefined) ?? '',

  // --- Debug ----------------------------------------------------------------
  DEBUG: false, // toggled with the ` key: FPS, tile bounds, turn windows, junction.correct
} as const

/** Compute the composite leaderboard score from a finished run's raw stats. */
export function computeScore(stats: {
  distanceMeters: number
  money: number
  timeSeconds: number
  caught: boolean
}): number {
  const base = stats.distanceMeters + stats.money * CONFIG.SCORE_MONEY_WEIGHT
  const catchBonus = stats.caught
    ? CONFIG.SCORE_CAUGHT_BONUS +
      Math.max(0, CONFIG.SCORE_TIME_PAR - stats.timeSeconds) * CONFIG.SCORE_TIME_WEIGHT
    : 0
  return Math.round(base + catchBonus)
}
