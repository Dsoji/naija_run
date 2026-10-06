# Naija Run — Build Notes

Decisions and deviations that aren't obvious from the code. Append as we go.

## Spec deviations (agreed with the owner)

- **Leaderboard + backend are IN scope** — this overrides spec §14, which listed
  leaderboards and backend/accounts as out of scope. Decided on 2026-10-06.
  - **Identity:** real accounts via **Clerk**. Frontend is vanilla TS, so we use
    `@clerk/clerk-js` (not the React SDK). Sign-in is optional for _playing_;
    required only to _submit_ a score.
  - **Ranking:** a **composite score** computed from distance, ₦ collected, and
    (if caught) a win bonus + speed bonus. Formula lives in `src/config.ts`
    (`computeScore`) and MUST be mirrored authoritatively on the server so the
    ranked number can't be forged client-side.
  - **Hosting:** decided at Phase 7 (Render or Helicarrier). Backend built and run
    locally until then; API base URL is env-driven (`VITE_API_BASE`).
  - **Anti-cheat:** the game is client-authoritative, so raw stats are spoofable.
    For a prototype this is accepted. The server recomputes the score and should
    apply light sanity caps; no full server-side validation planned.

## Cross-cutting requirements

- **Mobile touch is first-class.** All actions must flow well for touch users in
  mobile browsers (Chrome/Safari), not just desktop keyboard:
  - Swipes drive lane/turn/jump/slide (threshold `SWIPE_MIN_PX` / `SWIPE_MAX_MS`
    in config); encounter choices and pause are large tap targets (≥ 48 px).
  - Page gestures are disabled (`touch-action: none`, no pinch/double-tap zoom,
    no page scroll, no long-press callout) — set in `index.html` + `style.css`.
  - Layout uses `100dvh` + `env(safe-area-inset-*)` so browser chrome/notches
    never clip the canvas or controls.
  - Target 60 fps on mid-range Android Chrome (`setPixelRatio(min(dpr, 1.5))`).

## State of the scaffold at Phase 0

- A prior session already wired **Vite + TypeScript + Three.js + Clerk**, with a
  full custom sign-in / sign-up / email-verify flow (`src/auth.ts`,
  `src/authUI.ts`). Kept as-is; Phase 1 will restructure `main.ts` around the
  real game loop.
- `tsconfig.json` has `erasableSyntaxOnly` on → **no TS enums / namespaces /
  constructor param properties.** Use union types + `const` objects instead.
- `.env.local` holds Clerk **test** keys (publishable + secret). It is gitignored
  via `*.local`. Do not commit it; do not send the secret to any external service.
- `src/config.ts` is the single source of tuning (spec §11) plus leaderboard
  constants.
- Full `src/` skeleton from spec §2 created as stubs, each noting the phase that
  implements it. `src/net/Leaderboard.ts` added for the leaderboard client.

## Reference material

- `calgod/flower-game` (Three.js runner) suggested as a reference. It's a
  continuous left/right **dodge** runner — no lanes, no 90° turning, no
  junctions — so its core doesn't map onto Naija Run's turning/junction model.
  No LICENSE file, so treat as pattern reference only, not copy-paste. Ideas to
  borrow in later phases: on-screen touch buttons (Phase 6 mobile), ACESFilmic
  tone mapping + FogExp2 + shadow setup (Phase 2/6 visuals), procedural Web
  Audio loop (Phase 6 audio). Skip its gyroscope tilt — poor fit for discrete
  lanes/turns.

## Phase 1 — Track & Turning (done)

- Grid model: each tile = one square cell (side `TILE_LEN`). Player tracked as
  distance-along-current-tile + lane, so turns are an exact pivot at the cell
  centre. See `world/Tile.ts` (dir/grid math + builders), `world/Track.ts`
  (generation, occupancy grid, junction branch stubs + commit, recycle),
  `player/Player.ts` (motion, lanes, jump/slide, turn window + buffering + pivot,
  missed-turn crash), `player/CameraRig.ts`, `core/{Clock,Input,Game}.ts`,
  `ui/Screens.ts`.
- Turn window = last `TURN_WINDOW_DIST` m before centre; early presses buffered
  `TURN_BUFFER_MS`. Pivot happens at centre; missing a required turn crashes.
- Auth is now non-blocking: the game boots even if Clerk fails to load (guest).

## Modeling approach (decided 2026-10-06)

- **2.5D hybrid.** Flat, lit, fog-enabled cutout planes (`alphaTest`, not raw
  Sprites) for ground decals, ₦ notes, clue icon, overhead slide-banners,
  signage and crowd filler; composed **3D low-poly** for vehicles (danfo, keke,
  police car), goat, barricades and the main NPCs — they're seen from changing
  angles as the camera turns 90°, so they need real depth.
- Rendering notes: avoid upright *fixed-orientation* 2D (vanishes edge-on in a
  turn); ground-flat 2D is fine; camera-facing billboards read "cardboard".
- **Collision is decoupled from the visual.** Each obstacle declares a collider
  box (in the tile's along/lateral frame) + required action (jump/slide/lane),
  independent of whether it's drawn as a 2D plane, 3D mesh or glb.
- Everything goes through a **model registry** (added in Phase 2.2) so any piece
  can be swapped to a `.glb` later without touching game logic.

## Phase 2 breakdown

- 2.1 HUD (distance, ₦ shell, chase-bar shell) + fog + ACESFilmic tone mapping.
- 2.2 Tile-content attach/recycle + model registry + first obstacles + AABB
  collision (hit = crash, correct action = pass).
- 2.3 Full obstacle set + fair-spawn rules + difficulty density ramp.
- 2.4 ₦ pickups (magnet, counter, HUD, persistence of total ₦).
- 2.5 Clues + toasts + stumble on side-swipe.

## Phase 2 status — DONE

- 2.1 HUD + fog + ACESFilmic ✓ · 2.2 model registry + obstacles + AABB ✓
- 2.3 full obstacle set + fair-spawn + density ramp ✓ (+ oncoming traffic)
- 2.4 ₦ note pickups (magnet, counter, lifetime ₦ persistence) ✓
- 2.5 clues + toasts + side-swipe stumble ✓
- Pothole = stumble (slow + ₦50), not crash, per owner request.

### Phase 3 — Chase system — DONE
- 3.1 ChaseMeter (start 10, +1/100m, decay 0.5/s after 20s unseen); clue +8,
  stumble −5, correct turn +6 / wrong −8 all wired; HUD bar live.
- 3.2 Thief car one junction ahead, visible ≥40, hint true ~70% / decoy <60.
- 3.3 CAUGHT: chase 100 on a straight → Track.makeRunway clears ahead and goes
  straight-only; thief parks in traffic CATCH_DISTANCE ahead; reaching it wins.

### Balance caveat (tune in Phase 7)
- Reaching chase 100 from Phase 3 alone is hard: before the thief is visible
  (<40) junction turns are 50/50, averaging ~−1 net, and decay bites after 20s.
  Encounters (Phase 4: revealTurn, clues, chase gains) are what make CAUGHT
  realistically achievable. For now, correct turns + clues are the only climb.

## Phase 4 — Encounters — DONE (except shortcut→MARKET, Phase 5)
- 4.1 EncounterSystem (spawn 2 tiles before a junction, cooldown/gates/no-repeat),
  slow-mo trigger, DialogueUI (cost-disabled, countdown, auto-ignore), NPC models,
  3 data files; effects chase/money/bark.
- 4.2 revealTurn/fakeTurn (identical glowing arrow on a junction branch — correct
  vs wrong), protection (shield absorbs one crash), policeAssist (escort car,
  +1 chase/s, clears centre-lane obstacles ahead for N s).
- `shortcut: MARKET` still a no-op until Phase 5.
- policeAssist clears centre-lane obstacles by marking them gone + hiding mesh
  (all obstacles now store a mesh ref).

## Open questions / TODO

- Clerk production keys needed before deploying the leaderboard (Phase 6.5+).
- `server/` is a placeholder; the API is built in Phase 6.5.
