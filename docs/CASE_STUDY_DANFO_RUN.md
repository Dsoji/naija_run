# Case study: Danfo Run → lessons for Naija Run

Source: https://danforun.com (played 2026-10-11, desktop, guest, analytics declined).
Use this as a **pattern reference only**, the same way we used `calgod/flower-game`.
Don't copy its assets, copy, name or look.

## What Danfo Run is

A Lagos endless driver. You drive a yellow danfo down **real, named roads**
(Funsho Williams Ave → Ojuelegba → Itire Rd → Murtala Muhammed → Herbert
Macaulay). You change lanes and use gas/brake, stop in a yellow box to load
passengers, drop them at their stop to get paid, and hop barriers. Coins,
close calls and passengers all feed a score. Crashing ("Wahala!") ends the run.

The core driving loop is simple. Most of the work is in the **meta-game and
distribution around it**, and that's the part worth studying.

## Feature inventory (what they ship)

| Area | Danfo Run |
|---|---|
| **Home** | Live 3D attract scene behind the menu. The danfo idles, the street scrolls. "Tap to drive" is the main action. Route picker (Area 1: Ojuelegba–Yaba) shows your best on that route. |
| **Daily hook** | A themed modifier every day: Free Road Sunday (light traffic), Go-slow Monday (heavy traffic), Market Tuesday (people crossing), Rainy Wednesday (puddles/potholes/haze), Double Fare Thursday, Jollof Friday, Owambe Saturday (coins ×2). Countdown to the next one. |
| **Streak** | A day-streak flame (M–S dots) shown after a run and in the HUD. "Tomorrow: Go-slow Monday · keep your 1-day streak." |
| **Missions** | 3 per day with ₦ rewards ("Drop 14 passengers", "5 close calls in one run", "Collect a plate of jollof"). Progress shows on the end screen. |
| **Economy** | Coins buy **Paint** (Eko Yellow, Green White Green, Owambe Pink … Molue Red at 15k), **Sticker**, **Horn**, and **Upgrades** that extend power-up duration (Magnet, Shield, Danfo Pass, Super Hop, ×2 Score; 300 each). |
| **In-run power-ups** | Mystery "?" crates on the road give one of the five power-ups. Score multiplier (×1) shown under the score. |
| **Continue** | "Use a spare tyre and keep driving": a one-time revive. |
| **HUD** | Big score at top left, a **route progress bar** with named stops, "Next stop: ALAKA · 125 m", "Now entering FUNSHO WILLIAMS AVE", "Chasing PRISCILLA · 1,289,150 ahead" (the next leaderboard rival), speed, coin count, and a radio station switcher. |
| **Coaching** | Short contextual lines: "Conductor: STOP AHEAD: KEEP RIGHT, BRAKE IN THE BOX", "BUS STOP 130 M · GET READY TO BRAKE", "PASSED THE STOP · BRAKE AND HOLD TO REVERSE". A 3-step tutorial shows on the home screen. |
| **End screen** | "WAHALA!", the score, "New best!", **post to leaderboard with just a name** ("e.g. Ade from Yaba"), then a softer "Don't lose your new best → Sign in" nudge. A tear-off **"Danfo ticket"** stat card (coins / distance / passengers / close calls) with a **Share** button. Home / Leaders / Garage / Updates (WhatsApp channel), and a big **GO AGAIN**. |
| **Leaderboards** | Everyone vs **Motor Parks** (group/team boards). Today / This week / All time / Earners. "Last week's champion: okey" shown on the home screen. |
| **Social** | Friends ("Add people"), "Race a driver live" (Gbas Gbos), a free car unlocked by signing in (Tokunbo Fresh). |
| **World** | Box buildings skinned with **painted .webp facade sprites** (church, shop shutter, blue door, gate wall, AC window…) plus ground **decals** (manhole, drain grate, oil slick). Sunset sky. Real-feeling signage: "PMS ₦1,050", "FOOD IS READY!", "CRUSADE: 3 DAYS OF GLORY". |
| **Audio** | Radio stations (MIX / Ojuelegba FM), "play your own music", and a pitch line in settings: "Radio station owner? DM us". |
| **Monetisation** | **Real ads on in-world billboards**, served from `/api/ads` and listed in Gist ("On the road today: … Ad"), plus "Your business on these boards, from ₦20,000 a week". |
| **Platform** | PWA (manifest + service worker), an iOS "Add to Home Screen" prompt, Google One Tap sign-in, GA behind a consent banner ("see where runs end"), ~400 KB main JS, keyboard map in settings, left-handed mode. |

## Graphics & props teardown (road, buildings, bus)

Inspected live from the attract scene with the UI hidden, plus the asset
requests and the shipped bundle. **The headline:** it's Three.js like us, but it
loads **no .glb models at all**. Every 3D object (bus, buildings, traffic,
people) is simple procedural geometry. The realism comes almost entirely from
**painted, weathered textures** laid over that geometry, plus a lot of small,
specific Lagos props. Detail lives in the pixels, not the polygons.

### Rendering setup
- Three.js with mostly `MeshLambertMaterial` (cheap). Some Standard/Toon
  materials, heavy use of **`InstancedMesh`** (16 uses) and
  **`vertexColors`** (45), so many parts share one draw call and are coloured
  per vertex rather than per material.
- AgX/ACES tone mapping, `FogExp2`, PCFSoft shadows, Hemisphere + Directional
  lights.
- `onBeforeCompile` shader patches: a custom fog curve on the lagoon water, and
  a shared **haze/night uniform set** (`uHaze`, `uHazeAmt`, `uNight`,
  `uLit`) on facade materials. Facades fade into the horizon haze and darken
  at night while a separate **"lit" window map** (random warm-yellow
  rectangles on black) glows. That gives day→dusk→night for nearly free.
- Sky: a purple-to-pink **dusk gradient with stars** and a warm glow at the
  horizon. The fog colour matches the horizon, so distant geometry dissolves
  into the sunset instead of popping in.
- Canvas: rendered at full DPR (2048×1536 for a 1024×768 view).

### Buildings: "box + painted façade card + textured roof"
- **12 façade sprites** (`/assets/sprites/facades/*.webp`, ~450 px, ~60–90 KB
  each), all **single-bay, single-storey, heavily weathered** paintings:
  - peeling ochre wall with a split-AC unit and louvred vent (`ac-vent`, `ac-window`)
  - peeling sky-blue wall with a wooden door or window (`blue-door`, `blue-window`)
  - a church with a cross and arched door, and a red-brick Gothic church (`church`, `church-gothic`)
  - a black steel compound gate between pillars (`gate-black`, `gate-wall`)
  - a shop with a painted signboard, either open with goods or with a roller shutter down (`shop-open`, `shop-shutter`)
  - a 2-storey with burglar-proof window bars, and a four-window house (`windows-2storey`, `windows-four`)
- The cards are **tiled and stacked** onto plain boxes: one card for a
  bungalow, several in a column for a tall narrow 5-storey block. Because each
  card is one bay, any building width works by repeating it.
- **Roofs are top-down textures**, not geometry (`/assets/sprites/textures/`):
  `roof-red-metal` (hipped), `roof-blue-tarp`, `roof-clothesline` (laundry line
  seen from above), `roof-satellite` (dish), `roof-watertank` (black tank),
  `zinc-patchwork` (rusty corrugated patches). Rooftop clutter costs zero
  polygons.
- Procedural canvas textures for district styles. Bundle texture names include
  `brazil` and `colonial` (Lagos Island Afro-Brazilian houses with red hipped
  roofs), `shoprow`, `flats`, `plaza`, `cbd`, `scrhouse`. There are also
  fabric patterns `ankara`, `asooke`, `adireB` and `beads`, used on people's
  clothes.
- Roadside set pieces: a **petrol station** with a canopy and price board ("PMS
  ₦1,050"), kiosks with painted signs (**RECHARGE CARD, POS HERE / recharge
  card · transfer, SUYA, PROVISIONS, BUKA / amala · ewedu**), parasols over
  traders' tables, a church banner ("CRUSADE: 3 DAYS OF GLORY", "HOLY GHOST…"),
  and blue zinc sheds.

### Road: textured asphalt + decals + real Lagos furniture
- `asphalt-seamless.webp` (1254 px, tiled): a gritty grey-brown, not flat colour.
- **Ground decals** (`/assets/sprites/decals/`, alpha-cut webp with crumbled
  edges): drain grate, manhole cover, oil slick, dry pothole, shallow puddle,
  mud puddle, **two tyre-skid strips**, **sachet-water litter**, trash scatter
  (PET bottles and nylon), and a worn zebra-crossing block. These are scattered
  along the road and pavement. They do more than anything else to make it feel
  lived-in.
- Markings: double yellow edge lines, dashed white lanes, a dashed yellow line,
  and a **yellow zig-zag bus-stop box** painted on the road (the gameplay "stop
  here" zone *is* a road marking, not a UI overlay).
- **BRT corridor:** a red-surfaced BRT lane on the left, separated by a
  **yellow/black chevron kerb median** with a **blue steel guardrail**, plus
  **red-and-white striped bollards** at the ends and blue BRT stop signs.
- **Black-and-white painted kerb stones** along the pavement edge.
- Overhead **gantry sign** spanning the road, utility poles with **sagging
  wire bundles** strung across, palm trees and chunky low-poly bushy trees,
  and roadside **billboards** (which hold the paid ads from `/api/ads`).

### The danfo (player bus): a parametric, data-driven model
- A **VW T3/Kombi-like silhouette**: a flat nose, a big split windscreen with
  wiper strokes, **round headlights**, a **pipe bumper**, steel wheels, a
  sliding side door, a long side window band, and mudflaps.
- Painted **Eko yellow with black bands**. The route name ("OJUELEGBA") is
  painted above the windscreen. A Lagos plate ("KJA 614 FD" style) sits
  front and back. The **rear window carries a painted slogan** ("NO FOOD FOR
  LAZY MAN", or "FRESH FROM COTONOU" on the Tokunbo variant).
- **Loaded roof rack:** checked **"Ghana-must-go" bags**, a **blue drum**, and a
  white carton or cooler, all strapped onto a rail rack.
- **A conductor hangs out of the open sliding door**, leaning out and waving.
  This is the single most "Lagos" detail in the game.
- **It's all driven by a spec object**, not a hand-made model:
  ```
  {id:'classic', slogan:'NO FOOD FOR LAZY MAN',
   paint:{body, stripe, roof, gloss:.2, wear:.85, oddPanel:true},
   parts:{bumper:'pipe'|'chromePipe'|'goldPipe', lights:'round',
          wheels:'steel'|'hubcap'|'gold', rack:'loaded'|'rail',
          door:'slid', sign:'painted', mudflaps:true}, trim:'black'|'chrome'}
  ```
  The same builder makes every garage variant: Eko Classic (dents and rust),
  Tokunbo Fresh (two-tone, white walls, chrome), Founding Emerald (green,
  pearl and gold).
- **Wear and sticker atlas:** one 1024² canvas texture (4×4 cells of 256 px)
  generated in code: `rust1–4`, `dent1–2`, `scrape`, `patch`, and
  **stickers** `godDey`, `flag` (🇳🇬), `olorun` ("Ọlọ́run ló ṣe é"),
  `peteru`, `jesus` ("JESUS IS LORD"), `noSmoking`, `fearGod`, `eko`. These are
  slapped onto the body as decals, and `wear` controls how many. An
  `oddPanel` option gives one mismatched replacement panel.
- Other vehicles use the same low-poly approach: a white saloon (Peugeot-ish),
  a blue/red BRT bus, keke, okada, molue, and even a train (`wf()` carriages in
  4–6-car sets).

### People
- Pedestrians and traders are **very simple blocky low-poly figures** (less
  detailed than our `Humanoid.ts`). Their clothes use the fabric-pattern
  textures. People are background dressing in their game, not a focus.

### Pickups and UI art
- In-run pickups are **illustrated 2D sprites** cut from one sheet
  (`pickups-r{row}c{col}.webp`): a gold ₦ coin, a bundle of ₦1000 notes, a
  star, a plate of **jollof on a leaf**, a danfo icon, a shield, a sneaker, a
  horseshoe magnet, and **glowing mystery crates** ("?", "U", "»", shield).
  They're polished, glossy and mobile-game style.
- Vehicle thumbnails for menus are separate illustrations (`buses/*.webp`:
  Ibadan, Abuja and Port Harcourt cabs, Tokunbo Fresh). A **sponsor asset**
  `brands/chowdeck-bag-back.webp` (a delivery-rider box) shows brands are
  placed *on props* too, not just on billboards.

### What we do today vs. them

| | Naija Run now | Danfo Run |
|---|---|---|
| Road | flat `#2b2b2e` Standard material, white lines, grey kerb (`world/Tile.ts:128`) | tiled gritty asphalt texture + ~12 decal types, BRT median, painted kerbs, zig-zag box |
| Buildings | tall boxes + one CanvasTexture façade (clean window grid + awning name), 10 shared variants | short/mixed boxes + 12 **painted, weathered** façade cards tiled per bay + textured roofs |
| Roofs | flat cap, ~45% get a 3D water tank | 6 top-down roof textures (tarp, laundry, dish, tank, zinc) |
| Danfo | one rounded yellow box, 2 black stripes, 2 glass panes, 4 cylinders (`world/models.ts:47`) | T3 silhouette, round lights, pipe bumper, slogan, plate, route name, loaded rack, conductor, rust/sticker decals |
| Sky / mood | flat light-blue daytime | dusk gradient + stars + horizon haze; night-ready lit windows |
| Weathering | none, everything is clean | everywhere: peeling paint, rust, stains, litter |

### What to take from this for Naija Run
1. **Swap colour for texture on the road first.** Add a tiling asphalt map
   plus a decal pool (pothole, puddle, manhole, drain, oil, sachet litter, skid
   marks) scattered by `addClutter`. Our real pothole obstacle can reuse the
   pothole decal so it reads as part of the road. This gives the biggest
   visual jump for the least work.
2. **Paint façades as single-bay cards** (weathered: peeling paint, burglar
   bars, AC units, shutters, gates, churches) and tile them per bay in
   `Scenery.addBuilding`, replacing the procedural window grid. Mix in more
   1–2 storey buildings. Our current tall, clean blocks read as "generic city".
3. **Rooftop textures** instead of (or alongside) the 3D tank: tarp, laundry,
   satellite dish, zinc patchwork.
4. **Rebuild `buildDanfo` as a parametric spec** (body, stripes, round
   lights, pipe bumper, rack + Ghana-must-go bags, slogan on the rear window,
   plate, route name) with a wear/sticker atlas. This also sets up the kit or
   colour shop idea. A conductor hanging out of the door would make our
   traffic danfos instantly recognisable.
5. **Dusk sky + matching fog colour**, with the `uHaze` / `uNight`
   `onBeforeCompile` patch on façade materials and a lit-windows map. A day
   cycle across a long run would come almost free.
6. **Lagos road furniture:** BRT lane + chevron median + blue rail + striped
   bollards, black-and-white kerbs, a petrol station set piece with a price
   board, and RECHARGE CARD / POS / BUKA kiosks.
7. **Commission or generate our own art.** Their sprites look like a
   consistent painted, near-photo style. We must not reuse their files. Make
   our own set in one consistent style, keep each under ~100 KB `.webp`, and
   lazy-load them. A full set of ~40 small webps is cheaper than our single
   2.2 MB runner GLB.

## Where Naija Run stands today

Naija Run already has **more game** than Danfo Run: a chase meter, junction
turns with a thief to follow, NPC encounters with choices, the Nero market
shortcut, the Ikoyi Link bridge, stumble vs crash, and a story intro. What it
lacks is the **wrapper**. Right now:

- **₦ is collected and totalled (`naijaRun.totalMoney`), but there's nothing to
  spend it on.** This is the biggest gap.
- The leaderboard needs a Clerk sign-in to post. The live board says
  "No scores yet — be the first!"
- There's no reason to come back tomorrow: no daily state, streaks or missions.
- The end screen is plain text plus "Run Again". Nothing to share.
- The streets are generic. "NAIJA RUN" and "HUSTLE" shop signs on a procedural grid
  don't name a place.
- The UI uses a generic web-app style (a sans-serif top bar with Sign in/Sign up, a
  green pill button) rather than a game style.
- The bundle is 2.27 MB of JS (Three.js + clerk-js eagerly bundled), against
  Danfo Run's ~400 KB.
- There's no PWA, no analytics, and no way to see where runs end.

## Recommendations, prioritised

Each item says where it would land in our code. Effort: S ≈ under a day,
M ≈ 1–3 days, L ≈ a week or more.

### Tier 1: retention and virality (do these first)

1. **Guest score posting (S/M).** Let anyone post with a name; keep sign-in as
   "Don't lose your best / sync across devices".
   `server/src/index.ts` POST /scores accepts an anonymous `{name, stats}` with a
   per-IP rate limit, a name length and profanity filter, and the existing
   server-side `score.ts` recompute and caps. Signed-in rows stay tied to the
   Clerk ID. `ui/LeaderboardUI.ts` gets a name field like theirs. *This fixes
   the empty leaderboard.*
2. **Today / This week / All time tabs (S).** `GET /scores/top?range=day|week|all`
   (filter on `created_at`). Show "Last week's champion" on the start screen.
3. **Shareable run card (S).** Render an on-brand card to a canvas, e.g. a
   **police report / "Wanted" poster**: distance, ₦, clues, junctions right, and
   CAUGHT or ESCAPED. Use `navigator.share({files})` with a download fallback,
   and add a WhatsApp deep link. This fits our thief story better than a bus ticket.
4. **Daily themed modifier (S).** This is cheap for us because every knob is
   already in `config.ts`. Add a `DAILY_MODS` table keyed by weekday that patches
   CONFIG at run start. Ideas: *Go-slow Monday* (`DENSITY_START`↑, more oncoming
   traffic), *Rainy Wednesday* (more potholes, fog), *Market Tuesday*
   (`ENCOUNTER_CHANCE` toward Nero / more market shortcuts), *Owambe Saturday*
   (note values ×2), *Free Road Sunday* (lower density). Show it on the start
   screen with a countdown.
5. **Day streak + 3 daily missions (M).** All of these can be built from events
   we already emit (`core/Events.ts`): "Follow the thief through 5 junctions",
   "Pick up 3 clues", "Jump 2 goats", "Finish the market with no stumble",
   "Catch the thief". Rewards are paid in ₦, which item 6 then lets you spend.
   Stored in localStorage under `userScopeKey` like best and total.

### Tier 2: give ₦ a purpose

6. **Kit shop (M).** Jersey colourways for the runner, tinted on the GLB's
   `M_Main` material (already done for the Super Eagles green in
   `world/RunnerModel.ts`): Super Eagles home/away, Green-White-Green, Agbada
   Purple, Owambe Gold, plus a trail or sneaker colour. Price tiers from 600 to
   15k ₦, like theirs. Cosmetic only.
7. **Run power-ups + upgrade levels (M).** We have shield (Agbero) and an escort
   (police) as encounter effects. Add **pickups** for Magnet (bigger `MAGNET`
   radius), ×2 ₦, and Okada Boost (short invulnerable speed burst). Spend ₦ to
   extend their duration. Spawn them like clues in `world/Pickups.ts`.
8. **Revive (S).** "Bribe your way out" or "Mama Put gave you water": spend ₦
   once per run to continue from the last tile. This gives ₦ a sink and keeps
   long runs alive.

### Tier 3: sense of place and feel

9. **Named streets + progress (S/M).** Assign each straight section a real Lagos
   street name (Allen Ave, Awolowo Rd, Adeniran Ogunsanya, Ojuelegba Rd,
   Herbert Macaulay…) and toast "Now entering ___" when you cross into it. Add a
   HUD chip for distance to the next junction, e.g. "Junction 40 m". The track is
   procedural, so pull names from a pool, not a fixed route.
10. **"Chasing ___ · N ahead" rival chip (S).** Fetch the leaderboard entry just
    above your best and show the gap live. This adds a strong secondary goal
    for little work.
11. **Facade textures + decals (M).** Replace the CanvasTexture window grids in
    `world/Scenery.ts` with ~12 painted facade `.webp` sprites (shop shutter,
    church, compound gate, AC windows, faded paint), plus road decals (manhole,
    drain, oil). This is the cheapest way to look less "blocky" while keeping
    the same box geometry. Add a warm sunset gradient sky.
12. **Close-call bonus (S).** Award points and a toast ("Whew! +30") when an
    obstacle passes within ~0.4 m laterally without a hit. We already have the
    collider boxes in `Obstacles.ts`. This rewards risky lane play.
13. **Game-styled UI (M).** Drop the top web-app header bar (move Sign in into a
    menu), use a chunky display font, and adopt one bold accent palette. Add
    a live attract scene behind the start card (we already blur the scene;
    let the runner idle and the street drift). Add a big **RUN AGAIN** and a
    secondary row of Home / Leaders / Shop / Share.

### Tier 4: platform and business

14. **Lazy-load Clerk (S).** Import `@clerk/clerk-js` dynamically on first
    sign-in tap. That should take a large chunk out of the 2.27 MB first load,
    which matters on Nigerian mobile data.
15. **PWA (S).** Add `vite-plugin-pwa` with a manifest, cached assets
    (including the GLBs), and an iOS "Add to Home Screen" hint.
16. **Run-end analytics (S).** Track where runs end (distance, cause:
    goat/danfo/missed turn/wrong junction, chase %) with a consent prompt or a
    cookieless counter on our own API. Without it we can't tune `DENSITY_*`
    or chase decay with real data.
17. **In-world billboard ads (M/L).** We already have billboards (22% of tiles).
    Today they bake GLO, MTN, AIRTEL, DANGOTE, INDOMIE and JUMIA logos without
    permission; **swap those for fictional brands now** (trademark risk). Later,
    serve billboard textures from `/ads` like they do and sell slots weekly.

### Don't copy

- The drive/brake/stop-in-the-box mechanic. Our identity is the chase and
  turns: lean into it.
- Google-only sign-in. Clerk already gives us choice.
- Their name, art, fonts, copy, or the "Danfo ticket" format.

## Suggested order

1 → 2 → 3 → 4 → 14 (one release: "people can post, share and come back"), then
6 + 5 (₦ gets meaning), then 9 + 10 + 12 (feel), then 11 + 13 (visual pass),
then 15–17.
