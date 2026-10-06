// Top-level state machine and fixed update order (spec §0). Owns scene, camera,
// renderer and the subsystems. Implemented in Phase 1.

export type GameState = 'INTRO' | 'RUNNING' | 'ENCOUNTER' | 'CAUGHT' | 'GAMEOVER'

export class Game {}
