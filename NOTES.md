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

## Open questions / TODO

- Clerk production keys needed before deploying the leaderboard (Phase 6.5+).
- `server/` is a placeholder; the API is built in Phase 6.5.
