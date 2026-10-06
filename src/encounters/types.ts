// Encounter data model (spec §7). Encounters are pure data: a speaker, a few
// lines, and 2–3 choices, each with weighted-random outcomes made of effects.
// The LAST choice is always the "ignore/refuse" option (auto-fired on timeout).

export type Effect =
  | { kind: 'chase'; amount: number }
  | { kind: 'money'; amount: number } // negative = spend
  | { kind: 'revealTurn' } // marks the next junction's correct side
  | { kind: 'fakeTurn' } // marks the WRONG side (scam) — looks identical
  | { kind: 'shortcut'; branch: 'MARKET' } // next junction's correct side becomes a market section
  | { kind: 'policeAssist'; seconds: number } // police car clears a lane + chase gain over time
  | { kind: 'protection'; seconds: number } // next stumble/crash is forgiven once
  | { kind: 'bark'; speaker: string; line: string }

export interface Outcome {
  weight: number
  effects: Effect[]
}

export interface Choice {
  label: string // what the player says
  cost?: number // ₦ spent to pick this choice
  outcomes: Outcome[] // weighted random
}

export interface EncounterDef {
  id: string
  speaker: string
  lines: string[] // 1–2 lines, Pidgin/Nigerian English
  choices: Choice[] // 2–3, LAST is the "ignore/refuse" option
  minDistance?: number
  cooldownTiles?: number
}
