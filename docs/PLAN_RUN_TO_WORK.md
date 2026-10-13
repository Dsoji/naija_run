# Plan: "Run to Work" (story pivot + ₦ economy)

**New premise:** it's Monday morning. The danfo broke down at Ojuelegba, resumption
is 8:00, and Oga has warned you: one more late day and it's a query letter. You
have to run to work through Lagos go-slow, detours and floods. The ₦ you pick up
on the way pays your way through: settling agberos, hopping an okada, buying gear.

Most of the current game carries over. The thief chase is the only system that
gets removed; everything else is re-themed or extended.

---

## 1. Core loop: the lateness clock replaces the chase meter

| Today (stolen car) | New (run to work) |
|---|---|
| Chase meter 0→100, full = CAUGHT (win) | **Lateness clock** on the HUD: a watch running from 7:30. Each in-game minute is a few real seconds |
| Thief seen at junctions, hint side ~70% true | **Route signs and traffic radio** at junctions: "Ikorodu Rd: GO-SLOW", "Road closed: flood", "Shortcut via market". These can be wrong (radio gist is unreliable) |
| Correct turn +6 / wrong −8 | Good route **saves minutes**; a bad one sends you into a go-slow, flood or detour section that **costs minutes** |
| Clue pickup +8 | **"Traffic gist" pickup**: reveals the true state of the next junction |
| CAUGHT = win + 5000 bonus | **Office checkpoints** every ~1 km ("Sign-in desk"). Reaching one before your deadline banks a "day's pay" and resets the clock with a tighter deadline for the next leg. Miss a deadline and you're **SACKED** (run over) |

The run stays **endless** (best for leaderboards), and the deadlines create the
tension the thief used to. Crashes still end the run as before.

**Score (client and server must match):** distance + ₦ × 0.5 + 1000 per office
reached on time + a minutes-early bonus. `computeScore` in `src/config.ts` and
`server/src/score.ts` change together. Old and new scores aren't comparable, so the
leaderboard starts a **new season** (new table or a `season` column).

## 1b. Route forks: gamble or play safe (the heart of each junction)

At a fork the two branches are different kinds of route, and the signs show what
you know about each:

```
   ↰  THIRD MAINLAND BRIDGE          ↱  YABA / IWAYA ROAD
      fastest if clear: −2 min           flooded, slow but sure: +1 min
      traffic: ???  (radio: "e fit hold")
```

- **The gamble route** (usually a bridge, sometimes an expressway or the BRT lane)
  has a hidden state decided when the fork spawns: **clear** (a fast bridge
  crossing with light traffic, saves time) or **jammed** (go-slow on the bridge
  deck: packed lanes to weave through, costs a lot of time). Jam odds go up in
  rush hour (as the clock nears the deadline), on Go-slow Friday, and later in
  the run.
- **The safe route** has a small, known cost that's always visible: a flooded
  street (lightly slower, drains to jump), a detour through a back street, or a
  market (busy, lots of ₦). Rain boots remove the flood slowdown, which ties the
  shop into route choice.
- **Information you can get (or buy):**
  - The **traffic radio** gives a hint that's right about 70% of the time (like
    the old thief hint).
  - A **traffic gist pickup** on the straight before the fork reveals the truth.
  - Pay **₦100 to "flash your guy"** (call a friend on the bridge), who tells you
    for sure.
  - Nero or an agbero might sell you a tip, which might be a scam.
- **Roughly balanced odds:** clear saves 2 min, jammed costs 3 min, flood costs
  1 min. At a 40% jam chance both routes cost about the same on average, so the
  hint and the clock are what make the choice interesting: when you're nearly
  late, the gamble is tempting.
- **What happens on the bridge:** the existing Ikoyi Link and Third Mainland
  sections, either clear or with go-slow traffic packed onto the deck. Floods,
  detours and markets are their own section types.

### Forks are Y-junctions, not T-junctions

The road **splits in two and both branches keep going forward**, like a Lagos
expressway split (Third Mainland approach, Ojota interchange). There's no 90° turn.

```
          left branch          right branch
              ║                     ║
               ╲                   ╱
                ╲   ▲ gore ▲      ╱      ← overhead sign gantry:
                 ╲  ╱‾‾‾‾‾╲     ╱          "← THIRD MAINLAND BRIDGE | YABA →"
                  ╲╱ barrels ╲╱
                   ║  (split)  ║
                   ║  3 lanes  ║   ← you
```

- **Choose with your lane:** be in the **left lane** at the split and you take the
  left branch; be in the **right lane** and you take the right. Just keep swiping
  as normal, with no turn timing to get right. An overhead gantry and painted
  arrows on the road announce it well ahead.
- **Middle lane at the split:** you clip the yellow crash barrels at the gore nose.
  That's a **stumble** (slowdown), not a crash, and you're steered to the side you
  last swiped toward (right if you never swiped). It forgives you but still costs
  something, like missing a turn did.
- **Shape:** each branch eases sideways about 20 m over 40 m of running, then
  carries on straight as a full 3-lane road. The two branches end up two grid
  cells apart, which the track generator's spacing rule already allows. The fork
  area is an open interchange: grass verges, lamp posts, the gantry and the gore
  island. No buildings are needed there.
- **Inside a branch:** you keep your lane (left stays left), and obstacles resume
  after the usual landing stretch.

**Engine work this needs** (the biggest technical piece of the plan):
1. **Curved paths.** The player currently moves on straight segments with a pivot
   at turns. Each tile gets a path (`pointAt(d)` + tangent) and its own length, so a
   40 m S-curve branch is just another path. Heading becomes a continuous direction
   (the camera already works that way). A side benefit: ordinary 90° corners can
   become smooth sweeping curves too.
2. **Curved road meshes.** Build the road surface, markings and kerbs as a ribbon
   along the path, reusing the road textures.
3. **Track:** a `Y_FORK` tile occupying the split (the entry cell plus one cell
   left and one cell right on the next row), commit by lane at the gore nose, then
   grow the branches from the two exit cells. T-junctions can stay for ordinary
   street corners, or be retired.

**Technical notes:** `Track.tryJunction` already grows a stub down both branches
and `shortcutBranch` already re-themes one into a market. Generalise that into a
per-branch `route` (`{ kind, jammed? }`), lay the chosen section after the stub on
commit, and make bridges appear as fork options instead of on a fixed timer
(`BRIDGE_EVERY`). The thief's hint logic (`thiefHint` true about 70%) becomes the
radio hint.

## 1c. Event: "Dem snatch your phone!" (chase it or go to work)

A rare mid-run event, at most once per run, never inside a fork or a section,
usually at a crowded bus stop or market edge. A snatcher (on foot, or on an okada
later in the run) grabs your phone and takes off. The game pauses for a choice
(the existing DialogueUI):

> **Omo! Dem snatch your phone!**
> **Chase am!** · **Leave am, work dey.**

**If you leave it:** no time lost, but you're **phoneless** for the rest of the run:
- No **"flash your guy"** at forks and no traffic-app hints; only the street radio
  (about 70% right) is left.
- Missions or perks that need the phone are off.
- A replacement phone is a shop item (a cheap "tokunbo phone" or a new one), or
  you get your phone back by catching a snatcher in a later run.

**If you chase:** the old thief chase comes back as a **short chase segment**:
- The snatcher runs ahead. At the next one or two junctions you follow where they
  went (the existing thief-hint logic); a wrong turn loses them.
- A **catch bar** (the existing ChaseMeter, re-used) fills as you close in and
  drains if you stumble or take a wrong turn. There's a time limit of about 30–40 s.
- **The lateness clock keeps ticking the whole time.** The chase costs real minutes
  and might pull you off your best route.
- **Caught:** reuse the CAUGHT "runway" (the road clears, the snatcher gets stuck).
  Kept light and **non-violent**: they trip over a goat or get boxed in by a
  danfo, and area people hold them for the police. You get your phone back, a
  ₦500 "well done" from the crowd, and a "Hero" mission tick. Toast:
  **"Phone don land. Now run go work!"** Then the run carries on toward the next
  office from wherever you are.
- **Escaped:** phone gone (as if you'd left it), and you've lost the time too.

**Why it's a real decision:** chasing risks the deadline but keeps your best
information source for the forks; leaving it is safe now but makes later forks
blind guesses. Later in a run (tighter deadlines, faster okada snatchers) the
smart answer changes.

**Reuse:** `chase/Thief.ts` (positioning ahead, hints, park/runway),
`chase/ChaseMeter.ts` (as the catch bar), the CAUGHT flow in `core/Game.ts`, and
`encounters/EncounterSystem.ts` + `ui/DialogueUI.ts` for the choice. New: a
snatcher model (procedural humanoid, or on the okada GLB), the phone flag on the
run state, phone-gated hints, and the shop phone item.

## 2. New hindrances

Each is built the same way as the road, bridges and buildings: procedural, with
colliders separate from visuals.

**Route sections** (laid by `Track`, like markets and bridges):
1. **Go-slow:** all lanes packed with stopped danfos, kekes and cars. Two of the
   three lanes are blocked at any point and the gap shifts every few metres. Cars
   creep forward, there are horns everywhere, and hawkers walk between the vehicles.
   Base speed drops 30% (you're weaving). You can jump onto keke roofs but not
   danfos.
2. **Flood:** brown water over the road (an animated water plane). Your speed drops
   in deep parts. There are open-drain gaps to jump, floating debris (jerrycans,
   foam), a submerged car to swerve around, and planks people have laid as a
   walkway (staying on them avoids the slowdown). Ties in with rain weather.
3. **Detour:** the road ahead is closed (construction cones and barriers, an
   excavator, a LASTMA officer waving). It forces a turn into a narrow back street
   with gutters both sides, chickens and generators.

**New lane obstacles** (mixed into normal streets as difficulty climbs):
- An **okada swerving** across lanes (moves like the goat, but faster)
- A **wheelbarrow pusher / truck pusher** (slow mover in one lane)
- A **hawker crossing** with a tray on their head (slide under the tray)
- An **open manhole** (a pothole that crashes instead of stumbles)
- A **broken-down trailer** blocking two lanes (dodge only)
- An **Owambe party bus** with music, oncoming

**Checkpoint encounters** (the encounter system re-themed; costs already supported):
- **Agbero levy:** pay ₦200 and pass, or refuse and lose 2 min to wahala
- **Police checkpoint:** "Roger" ₦500 and wave through, or wait (time loss), or show
  ID (random)
- **LASTMA:** fine ₦1,000 if you're caught running in the BRT lane shortcut
- **Nero** (kept): shows you the market shortcut for ₦300 (saves minutes)

## 3. Economy: what ₦ buys

The ₦ total already persists (`naijaRun.totalMoney`). Add spending:

**During a run** (spent at encounters or pick-ups):
- Settle agbero / police / LASTMA (above)
- **Okada ride:** a pick-up or a ₦300 tap at an okada stand. 6 s of fast,
  invulnerable riding that weaves itself
- **Danfo hop:** ₦200 skips a whole go-slow section (you ride it out)

**Shop** (between runs; new `ui/ShopUI.ts`, persisted in localStorage per user):
- **Outfits** (cosmetic, cheap to build since the runner is already colour-painted
  by region):
  - Super Eagles kit (default)
  - office shirt and tie with trousers
  - Ankara shirt
  - Agbada (₦15k)
  - Native and cap
  - Corper khaki (NYSC)
- **Gear** (consumable, take into the next run):
  - **Rain boots:** no flood slowdown
  - **Umbrella:** shrugs off one rain/flood stumble
  - **Sachet water:** extends one deadline by 1 min
- **Upgrades** (permanent, 3 levels each): longer okada ride, stronger ₦ magnet,
  cheaper bribes ("connections")
- **Continue:** "Beg Oga" once per run, costs ₦1,000 × attempts; it revives you
  after a crash or a missed deadline

Rough balance target: a decent run earns ₦1,500–3,000, so a cheap outfit takes 1–2
runs and the Agbada takes about a week of play. Tuning lives in `config.ts`.

## 4. Retention (from the Danfo Run case study)

- **Daily theme by weekday:** Rainy Monday (more floods), Go-slow Friday (more
  traffic), Owambe Saturday (party buses, ₦ ×2), Sunday service (light traffic)
- **3 daily missions** paid in ₦ ("Reach 2 offices on time", "Ride an okada
  twice", "Cross a flood without stumbling")
- **Punctuality streak:** consecutive days with a run that hit at least one
  office on time
- **Guest leaderboard names + share card:** a "Resumption register" for on-time
  runs, a "Query letter" when you're sacked

## 5. Build order

Each phase ships on its own and leaves the game playable.

| Phase | What | Main files | Size |
|---|---|---|---|
| **A0. Curved paths + Y-fork** | Per-tile paths and lengths; continuous heading; curved road ribbon meshes; `Y_FORK` tile (choose by lane, gore barrels = stumble); interchange set dressing; optionally smooth curves for ordinary corners | `player/Player.ts`, `player/CameraRig.ts`, `world/Tile.ts`, `world/Track.ts`, `world/RoadSurface.ts`, new `world/Path.ts`, new `world/Interchange.ts` | L |
| **A. Story swap** | Intro/end copy; lateness clock HUD; remove thief and CAUGHT; **route forks** (per-branch route + hidden jam state, signs, radio hint, gist pickup, "flash your guy"); bridges become a fork option; office checkpoints + deadlines + SACKED; new score + leaderboard season | `ui/Screens.ts`, `ui/HUD.ts`, `chase/*` → `commute/*`, `core/Game.ts`, `world/Pickups.ts`, `config.ts`, `server/src/score.ts`, `server/src/index.ts` | L |
| **B0. Phone-snatch event** | Chase-or-go-to-work choice; snatcher + catch bar + time limit (re-using Thief/ChaseMeter/CAUGHT runway); phoneless state gating hints; shop phone item | `chase/*`, `encounters/*`, `core/Game.ts`, `ui/DialogueUI.ts` | M |
| **B1. Go-slow + detour sections** | Track section types, packed traffic, closure set pieces | `world/Track.ts`, new `world/Traffic.ts`, `world/Obstacles.ts` | M |
| **B2. Floods + rain** | Flood section, drains, debris, planks, rain particles, speed modifier | new `world/Flood.ts`, `player/Player.ts` | M |
| **B3. New lane obstacles + checkpoints** | Okada swerve, hawker, manhole, trailer, party bus; agbero/police/LASTMA data | `world/models.ts`, `world/Vehicles.ts`, `encounters/data/*` | M |
| **C. Economy** | In-run okada/danfo hop; shop UI; outfits (kit shader presets); gear; upgrades; continue | `ui/ShopUI.ts`, `world/RunnerModel.ts`, `player/Player.ts`, new `core/Wallet.ts` | L |
| **D. Retention** | Daily themes, missions, streak, guest names, share card | `core/Daily.ts`, `ui/*`, server | M |
| **E. Polish** | Morning-rush lighting/day cycle, rain audio, horns, tutorial for new mechanics, balance pass | `core/Game.ts`, `core/Sfx.ts` | S–M |

**Testing for every phase:** typecheck and build; simulated track generation to
check spawn fairness (as done for post-turn tiles); in-browser checks with the
debug hook; a short real-phone playtest before pushing.

## 6. Decisions needed before Phase A

1. **Structure:** endless with office checkpoints and a "sacked" fail (recommended),
   or fixed-length daily commutes (levels)?
2. **Real money:** keep ₦ as an in-game currency only (recommended for now), or plan
   for paid items later?
3. **Name/tagline:** keep "Naija Run" with a new tagline (e.g. "Run to work. Lagos
   no dey wait.")?
4. ~~Old content~~ **Decided:** the thief becomes the phone-snatch event (section 1c).
5. **Leaderboard:** reset to a new season, or keep the old board visible as
   "Season 0"?
