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

## Phase 5 — Nero market shortcut — DONE
- 5.1 MARKET theme (canopies + stalls), shortcut re-themes the correct branch,
  Track lays MARKET_LEN market tiles, +15 chase on exit.
- 5.2 Nero runs NERO_AHEAD m ahead in the market and calls JUMP!/SLIDE!/LEFT!/
  RIGHT! ~1s before each obstacle (throttled, each obstacle announced once).
- All encounter effects now fully implemented; `shortcut` no longer a no-op.

## Encounters now fully pause the game (owner override of spec §7 slow-mo).

## Phase 6 — Intro, juice, audio, mobile — DONE
- 6.1 intro text sequence + first-junction thief tutorial.
- 6.2 camera shake (stumble/crash), FOV kick with speed, ₦ pickup pop.
- 6.3 synthesized Web Audio SFX (pickup/jump/crash/horn/siren) + bass music loop
  + persisted mute (no asset files).
- 6.4 on-screen jump/slide buttons for touch (pointer:coarse only); swipes still
  primary. Pause + visibility auto-pause already done in earlier phases.

## Phase 7 — in progress
- 7.1 tuning: turn window 7m / buffer 180ms, chase decay 0.4. Speed left default.
- 7.2 leaderboard:
  - Frontend: net/Leaderboard.ts (top/submit), ui/LeaderboardUI.ts, end-screen
    panel with submit (signed in) / sign-in (signed out); hidden when API_BASE
    empty so the game is unaffected until configured. auth.getToken/isSignedIn.
  - Backend: server/ (Express + pg + @clerk/backend). GET /scores/top (public),
    POST /scores (Clerk JWT verified; user id from token; score recomputed in
    server/src/score.ts — MIRROR of config computeScore). docker-compose for PG.
  - To enable locally: docker compose up -d; cd server && cp .env.example .env
    (set CLERK_SECRET_KEY) && npm i && npm run dev; add VITE_API_BASE to
    .env.local; restart the game.
  - NOT type-checked in this env (server deps not installed); written by
    inspection. `cd server && npm i && npm run typecheck` to verify.
- 7.3 (pending owner): deploy backend (Render/Helicarrier) + prod Clerk keys +
  CORS + README; needs owner's hosting choice.

## Naija visual pass (owner asked 2026-10-06)
Goal: stronger Lagos/Nigeria vibe across assets.

### Roadside scenery — DONE (2026-10-07)
- `src/world/Scenery.ts`: `addStreetScenery(group, dir)` called from `Tile.ts`
  `buildRoad` for every STRAIGHT (not MARKET_ENTRY). Children of the tile group,
  so they recycle/dispose for free. Visuals only, no colliders.
- Buildings both sides (continuous street wall): low-poly mass box + roof cap +
  a road-facing FACADE plane whose CanvasTexture is baked once at module load
  (window grid with some lit, + ground-floor awning carrying a Nigerian shop name
  — MAMA PUT, OGA STORES, NAIJA STYLE, CELE PHONES, GRACE VENTURES, …). 10 shared
  facade/wall material pairs → tiny GPU cost; only geometry churns. ~45% also get
  a rooftop water tank.
- Utility poles (per side, 60%) with crossbar/transformer + a sagging wire
  (QuadraticBezierCurve3 → TubeGeometry) strung across the road when both sides
  have a pole. Dusty laterite verge strip each side. Kiosks (30%/side).
- Billboards (22%): posts + board + baked ad texture (GLO/MTN/AIRTEL/DANGOTE/
  INDOMIE/JUMIA). Expressway lamp standards (18%, Third Mainland vibe): tall pole
  + arm + emissive head.
- Monument (6%, rare hero): Lekki–Ikoyi cable-stayed pylon — a leaning concrete
  pylon with fanned stay-cables to a deck-edge beam. `strut()` helper orients a
  cylinder between two points. Verified rendering by temporarily bumping to 90%.
- Perf: shared materials, per-tile geometry disposed via existing disposeTile.
  tsc clean, `npm run build` OK. Smoke-tested in-browser (Playwright screenshots).

### Characters — DONE (2026-10-07)
- `src/world/Humanoid.ts`: `buildHumanoid(mats, {plumbob?})` — shared Sims-style
  low-poly figure. Legs/arms hang from hip/shoulder PIVOT groups so callers swing
  them (rotation.x). Head (rounded), hair cap, eyes, neck, pelvis, torso. Feet at
  local y≈0 so it drops onto the road (y=0). Materials passed in (shared) so
  repeated NPC spawns don't leak materials.
- Runner (`Player.ts`): uses buildHumanoid (Super Eagles green jersey + white
  shorts). Run cycle swings legs + counter-swings arms. Slide is now a reclined
  baseball-slide pose (body.rotation.x eased to ~1.15, legs thrust, arms back) —
  NOT the old vertical squash (owner: "the bending is supposed to be sliding").
- NPCs (`models.ts buildNPC`): use buildHumanoid with a green plumbob overhead
  (the Sims signature); kept each kind's hat/accessory (beret/cap+chain/towel),
  repositioned for the taller figure.
- Asset option discussed (not wired): Mixamo (rigged + run/jump/slide clips) for
  the runner, CC0 Quaternius/Kenney for NPCs, loaded via the MODELS registry.
  Owner said "proceed" → kept procedural for now.

### Market scenery — upgraded (2026-10-08)
- The market corridor used a thin 3-canopy/stall decor while the street got the
  big upgrade. Replaced `Tile.addMarketDecor` with `Scenery.addMarketScenery`:
  a rainbow overhead canopy tunnel + packed stalls both sides (table + stacked
  colourful goods + a parasol or cloth roof + sometimes a sack/basket). Visuals
  only; lanes stay clear (obstacle colliders still come from decorateMarket).
- Removed the now-unused `matStallWood`/`matCanopy` from Tile.ts.
- Reworked (owner: "looks like blocks… flow to the city… hard to see the road")
  then AGAIN from a real market photo (owner: "kiosks and roadside sellers… not
  city… overhead gaps too small"): market is now an informal street market —
  `addMarketBackdrop` (low kiosks/shacks with corrugated zinc roofs, NOT tall
  buildings) + roadside sellers (`addMarketStall`: table OR ground mat of goods)
  + big colourful `addUmbrella` parasols as the hero element + sacks/baskets.
  Overhead = at most one narrow tarp per tile (big gaps) so the road/obstacles
  stay clearly visible. `addBuilding`/bunting no longer used by the market.

### Goat — jumpable + better model (2026-10-08)
- Goat was `action:'LANE', clearHeight:99` (un-jumpable). Now `action:'JUMP',
  clearHeight:0.8` so you can jump over it (or still dodge lanes). onHit stays
  crash; sideSwipe kept; it still drifts across lanes.
- `models.buildGoat` rebuilt from a box into a recognisable West African dwarf
  goat in profile (length along X → placeLocal stands it broadside): rounded
  capsule body, neck + head + dark snout, drooping ears, swept-back horns, short
  tail, slender legs, pied dark saddle patch.

### "Running through buildings" after a turn — fixed (2026-10-08)
- Owner: "turned and saw a wall, passed through buildings before I crashed."
  Root cause: the Track occupancy grid only blocked EXACT cell reuse, so the path
  could run parallel right next to an earlier street (1 cell / 20m apart). With
  the new tall buildings, the two streets' building rows (front ~7.9m, depth up
  to ~9m from each road centre) interpenetrate in the gap → walls across/over the
  road, and the spiral eventually dead-ends into a crash. Reproduced by forcing
  frequent junctions + turning one way repeatedly.
- Fix: `Track.canPlace(cell, from)` — a cell is placeable only if free AND not
  orthogonally adjacent to any road except the tile it connects from. Used for
  straight placement, bridge start, `tryJunction`, `branchCells`, and
  `pickTurnSide`. Keeps streets ≥1 empty cell apart, so building rows never
  overlap the road. Junctions that would create an adjacent parallel branch are
  simply not offered. Verified: the same spiral test now stays on clean streets
  (survived to 121m vs crashing at 67m), normal play unaffected.

### Camera turn smoothing (2026-10-08)
- Owner: the camera "bounces back then turns" at a junction. Cause: `CameraRig`
  lerped camera position/aim in WORLD space, so at the pivot the "behind the
  player" target jumped 90° and the straight-line lerp cut across the corner.
  Fix: ease a stored `yaw` toward the heading via shortest-arc `lerpAngle`
  (CAM_YAW_LERP = 0.28s) and derive the camera position from the eased heading —
  so it swings smoothly around the corner. Verified bounce-free + shortest-path
  (incl. ±π wrap) by simulation; straights unchanged.

### Bug fixes (2026-10-08)
- Shield (Agbero "Cover me" / protection) did nothing against solids: `collide`
  returned `crash` WITHOUT marking the obstacle `hit`, so the shield absorbed it
  for one frame, then the same still-overlapping solid crashed the player again
  the next frame (shield already spent). Fix in `Obstacles.collide`: set `ob.hit`
  on a crash and `continue` past already-`hit` obstacles, so a shielded solid is
  passed through.
- Police escort car shot off the map at junctions: it was placed ESCORT_AHEAD
  straight along the player's current heading, projecting into the no-road cell
  ahead of a turn, then snapping after the pivot. Fix: `Game.escortPoint(ahead)`
  walks the committed path forward (turning at tile centres) and holds at a
  not-yet-committed junction centre, so the car follows the road around corners.

### Toasts — redesigned (2026-10-07)
- `HUD.toast` kinds now include `'turn'`; `HUD.turnCue(side)` shows a big, pulsing,
  Super-Eagles-green directional cue ("⬅ FOLLOW AM • LEFT" / "FOLLOW AM • RIGHT ➡").
  Wired into revealTurn and shortcut effects. All toasts restyled (glass bg, blur,
  border, shadow, scale-in) and moved to 18vh (clear of the chase bar). CSS in
  `style.css`; the turn toast uses a 2nd pulse animation (duration `${T}s, 0.7s`).

### Ikoyi Link Bridge — DONE as an approached section (2026-10-07)
- Owner: the bridge is a milestone you run ONTO after a while, not a roadside prop.
  Removed the rare roadside pylon from `addStreetScenery`.
- New `BRIDGE` TileType + `TileInfo.bridge`. `Track` lays a bridge section every
  `CONFIG.BRIDGE_EVERY` (38) tiles for `BRIDGE_LEN` (7) tiles, straight-only like
  the market section; the pylon is attached to the middle tile.
- `Tile.buildRoad` BRIDGE branch: deck road + lane lines + `addBridgeDecor` (wide
  water plane, blue deck railings + posts each side). `addBridgePylon` (Scenery):
  a leaning cable-stayed tower with stay-cables fanning to both deck edges.
- Obstacles/pickups still spawn on bridge tiles (decorator gate includes BRIDGE).
- `Game` toasts "🌉 Ikoyi Link Bridge" once on entry (watches `curTile.bridge`).
- Verified by temporarily setting BRIDGE_EVERY=2 and screenshotting, then reverting.

### Rigged GLB runner — DONE (2026-10-07)
- Owner wanted FIFA/footballer-style characters. Full realism clashes with the
  low-poly world + is too heavy for web, so we went stylized-but-rigged.
- Asset: Quaternius "Animated Base Character" (poly.pizza/m/cwYvO5UauX), **CC BY**
  → `public/models/naija-runner.glb` (2.3 MB, served from /models/). Rigged, with
  a full clip set (Sprint/Jog/Jump/Roll/Death/Idle/…).
- `src/world/RunnerModel.ts`: GLTFLoader load + AnimationMixer; maps our clips
  run→Sprint_Loop, jump→Jump_Loop, slide→Roll, dead→Death01 (LoopOnce clamp).
  Tints material `M_Main` green (Super Eagles kit).
- `Player`: loads async; shows the procedural humanoid until it resolves, then
  hides it and swaps in the GLB (rotation.y=0 to face −z, scale 1.15). `animClip()`
  maps state→clip each frame; mixer updates even when DEAD so Death plays.
  Procedural pose code is skipped when the model is active (kept as fallback).
- Attribution (CC BY): CREDITS.md + a line on the start screen ("Runner model by
  Quaternius (CC BY)"). Verified run/jump/slide in-game via screenshots.
- NPCs still use the procedural Humanoid (CC0 Quaternius/Mixamo could replace
  them later via the same loader pattern).

### Still TODO
- Polish vehicles/NPCs (destination board on danfo, etc.) if time.
- Optional: rigged GLB NPCs via the RunnerModel loader pattern.

## Open questions / TODO

- Clerk production keys needed before deploying the leaderboard (Phase 6.5+).
- `server/` is a placeholder; the API is built in Phase 6.5.
