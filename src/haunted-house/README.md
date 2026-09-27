# Haunted House maintenance notes

Haunted House is a deterministic resource puzzle at `haunted_house.html`, with its
own source, build, storage, and tests. Keep changes isolated from Hockey Cards,
Ouija, and Bomber Command. The existing home entry and page remain in place.

## Build, verify, and serve

```sh
npm install
npm run dev:haunted
npm run typecheck:haunted
npm run test:haunted
npm run build:haunted
npm run preview:haunted
```

Use `npm.cmd` in PowerShell if script policy blocks `npm`. Tests need native
TypeScript stripping (Node 22.18+ or 24+). No new runtime dependency is required.
The real Chromium check uses a local HTTP server and a separate headless profile:

```sh
node src/haunted-house/tests/browser-check.mjs
```

Set `CHROME_PATH` if Chrome is not at the default Windows installation path.
Artifacts go in ignored `.haunted-checks/`. Device sizes and touch are emulated;
this does not replace testing on a physical phone.

Reproduce the balance comparison in order (raw JSON goes in the ignored check
directory). The fixed-progression arithmetic probe supplements legal witnesses:

```sh
node src/haunted-house/tests/balance-batch.mjs --phase baseline --output .haunted-checks/baseline.json
node src/haunted-house/tests/balance-batch.mjs --phase expanded --output .haunted-checks/expanded.json
node src/haunted-house/tests/balance-batch.mjs --arithmetic --output .haunted-checks/arithmetic.json
```

**Build Haunted House before any optional Hosting deployment.** The root page
loads `haunted-build/haunted-house.js` and `.css`, which are ignored build outputs.
Deploying Hosting without rebuilding can serve an old Haunted House bundle even
when TypeScript source has changed. The generic `npm run build` builds Ouija and
is not a replacement for this command:

```sh
npm run build:haunted
# Optional, only when deployment is separately intended:
firebase deploy --only hosting
```

This iteration does not deploy Firebase. Generation uses an inline worker so the
root static entry and standalone Haunted House build both resolve it correctly.

## Settled gameplay contract

- Any discovered, empty, eligible destination can be selected in one turn,
  regardless of distance, walls, occupants between positions, rooms, or floors.
  There is no physical pathfinding. Invalid and no-op moves spend nothing.
- Occupying a tile reveals the surrounding 3×3 square, diagonals included, with
  no wall occlusion or recursive reveal. Discovery persists. Occupants can block
  a useful viewing position; an already discovered destination beyond them is
  nevertheless legal.
- Inspecting, selecting an attack mode, changing viewed rooms, reading panels,
  and cancelling a confirmation are free. Explicitly reading/clearing a note on
  the board is a committed action. Movement, attack, preparation, supplies,
  unlocking, passage travel, memorial, and exit each consume one turn.
- Discovered enemies and supplies can be acted on remotely. A surviving kill or
  supply use places the player on its cleared tile and reveals its neighborhood.
- An open doorway/stair offers two different actions: stand on the near endpoint
  to reveal locally, or travel through. Each costs one turn. A closed endpoint
  cannot be occupied or travelled through before unlocking. Tools are reusable.
- Strikes exchange damage simultaneously, including killing blows. A lethal
  exchange needs explicit confirmation and kills before XP or recovery resolves.
- A wounded living spirit regenerates its listed amount after every committed
  turn except an attack against that spirit, throughout all rooms. Food causes
  the same other-action regeneration as movement; it does not directly heal
  enemies. Defeated spirits never return. No passive player recovery exists.
- Rooms retain state; there are multiple rooms and floors, reusable keys/crowbar,
  and the escape-key, diary, and locket/memorial objective families.
- Full-run undo, restart, autosave, JSON export/import and seeded generation remain.
  No roaming enemies, random hits, surprise damage, or live stat scaling is used.

## Combat and tuning

`content.ts` holds `TUNING`, initial resources, XP requirements, and displayed rule
text. `game.ts` owns the preview and transition math; the solver and diagnostics
use those functions. Preview exposes contributions, the immediate exchange,
level-ups, and final recovered resources. The same XP helper is used by previews
and execution. Do not add a second combat implementation to the UI or solver.

| Rule | Current value |
| --- | --- |
| Start | 22 HP, 6 power, 8/10 light, level 1, 1 tonic, 1 oil |
| Strike | power + prepared Oil + trait bonus − armour, minimum 1; retaliation simultaneous |
| Flare | 4 light; current power + prepared Oil + trait bonus; ignores armour, zero retaliation |
| Hollow armour | subtract 2 from Strike damage |
| Ward | 3 light and one preparation turn; halve next Strike's incoming damage, rounded up |
| Oil | one bottle and one preparation turn; +4 on next Strike or Flare |
| Food | ceil(60% of maximum HP), capped; consumed on its tile |
| Candle | 8 light, capped |
| Tonic | ceil(50% of maximum HP), capped; pocket use takes one turn |
| Level-up | level + 2 XP; +3 max HP, +2 power, full HP/light; carry excess XP |

Ward persists through Flares. Oil is consumed by the next attack. Both are visible
in the resource strip until consumed. Preparations also give wounded enemies
one regeneration turn. Food/candles can be deliberately wasted to clear a tile.

The isolated balance change is **Flare's base damage from power + 4 to power**.
Cost, armour bypass, retaliation avoidance, Oil, Ward, maximum light, food,
candles, and level recovery were retained. `classic` is an explicit internal
benchmark ruleset; it is not a promise to resume old saves under the new content.
See `BALANCE.md` and the reproducible balance script for paired seed evidence,
rejections, route metrics, and limitations. Solver use counts are not player
preference or a proof of fun. Occasional refill chains are intended.

## Ingredients and generation

The small reward pool replaces the guaranteed Ritual primer:

- Ritual primer: +1 power for this run.
- Heartwood charm: +4 maximum and current HP; missing HP stays the same.
- Alchemist's case: three pocket oils for chosen hit-count thresholds.

Ordinary shades, wisps, armour and revenants remain. Some non-boss spirits gain
one visible trait: **Brittle** takes +2 Strike damage; **Smouldering** takes +2
Flare damage. Neither adds hidden retaliation or resistance. All generated stats
and traits are stored at the start and remain stable during a run.

Supplies use a house-wide budget and varied placement, with early recovery and
optional branches. Quiet spaces are permitted. The three objective families
remain, with varied keeper and memorial placement. Keys/tools are placed before
their own gate in the construction order, and actual discovery/action validation
remains authoritative.

The house has 6–8 rooms over two floors. Recovery totals match the baseline, with
one food and candle in the entrance and at most four recovery tiles per room;
half of later placements prefer earlier room indices. An eligible optional leaf
has a 40% chance to be quiet. A reward is chosen uniformly from the three types
and placed in a nonquiet room. A 28% trait nomination rate is further filtered
by whether its bonus changes a hit count at representative tier power. The keeper
varies among the deepest two depth bands; a memorial may occupy any other room.
Journal hints identify required tools, keeper and memorial locations.

`room-patterns.ts` carves mazes, broadens junctions and adds occasional loops. It
uses no library of authored levels. `generation.ts` produces candidates;
`diagnostics.ts` measures Strike/Flare hit counts and costs, Ward survival/savings,
Oil hit thresholds and refill opportunities at representative states. These
measurements guide trait selection and the bounded solver's ranking without
requiring any ability quota or a unique solution.

`solver.ts` searches complete-fight plans with alternative preparations, attack
orders, recovery and supply-waste branches. It expands exploration by choosing
only discovered eligible destinations and applying the actual 3×3 reveal. Every
accepted candidate has a winning witness replayed through `act()`. The worker
keeps generation off the UI thread and can be cancelled. Search has finite
budgets (450 expanded states, beam width 16, six candidate attempts); exhausted
search produces an explicit failure,
never an unverified fallback, altered live enemies, or secretly added supplies.

This proves existence of one legal winning sequence. It does **not** prove that
hidden information is inferable, that every reasonable choice wins, that all
optional cleanup is affordable, or that the puzzle has multiple solutions.
The search is incomplete; rejection means unverified, not mathematically
impossible. Human understanding, pacing and encounter choice still need playtests.

## Interaction layout

The desktop workspace places the board beside a stable selected-target panel,
with essential stats and prepared buffs above. Damage math and commitment share
one panel. Secondary rules, known enemies, journal/supplies, activity and completed
runs use accessible dialogs. Phone/tablet layouts use normal-flow compact
controls and permit scrolling without covering the board with a fixed sheet.

Selection, attacks, supplies and room travel preserve viewport position; focus
restores to the matching control or a predictable board/inspection fallback.
Selected targets have a visible outline/marker, and eligible floor has a distinct
shape treatment. Keyboard: arrows browse cells, Enter activates, WASD requests
single-tile moves, Z undoes. Touch uses the same explicit inspect/commit controls.
Faded annotation is labelled informational: no stats, XP or quest reward. Clearing
it still costs a turn and reveals its tile's neighborhood.

## Saves and completed runs

The current slot is `haunted-house.save.v4`, with the explicit `power-flare`
ruleset. V1, v2 and v3 slots remain untouched and separately downloadable. Old
imports explain that a new adventure is required; they are never silently
converted. Exact v3 continuation is not claimed.
Future incompatible tuning/content changes must use another explicit save/rules
version or a verified compatibility path, not reinterpret existing v4 runs.

Geometry/content is stored once, while undo frames store mutable resources,
enemy HP, used/opened flags, inventory, discovery, position, objective status,
notes and log. Prepared buffs, new traits/rewards and full history survive JSON
roundtrips. Validation accepts dead or resource-exhausted runs without solving
them. Storage failures stay visible; export preserves an in-memory run. Failed
parsing leaves the original bytes alone.

Every fresh interactive adventure/restart gets a stable run ID; load/import/undo
retain it. `haunted-house.completions.v1` stores one report per attempt. Loading or
re-entering an ending updates the same record instead of adding another award.
Undo does not erase the historical completion. Ending again after exploration
updates that attempt's report. There are no permanent stat gains or unlocks.

## Completion definitions

The report shows objective completion, defeated/total hauntings, discovered/total
playable tiles, treasure collected, preserved floor and pocket supplies, and turns.

The exploration denominator is the non-wall tiles that can be revealed from the
entrance under the game's 3×3 discovery and passage rules, with removable occupants
cleared and gates open. It excludes inaccessible geometry and decorative walls.
A memorial can count when seen without being occupied. This is a geometric target,
not a guarantee that every resource-spending route can still achieve full discovery.
No requirement exists to stand on every tile.

Conservation counts unused food and candles as uses, loose tonic/oil quantities,
and pocket tonic/oil bottles. Pocketing a bottle transfers it rather than counting
it twice. Prepared Oil is already spent. Treasure, notes, keys and permanent finds
are not consumables. Unseen unused floor supplies still count.

Commendations are independent, with no combined perfect grade:

- Into the morning: complete the objective and leave alive (the main achievement).
- Curious explorer: discover at least 80% of playable tiles.
- Peacebringer: defeat at least 75% of hauntings.
- Treasure finder: bring out any treasure.
- Well provisioned: preserve at least three consumable uses across floor/pockets.

Spending supplies to finish exploration is a valid competing achievement. Raw turns
are displayed but never used as a universal ranking across house sizes. Thresholds
intentionally avoid requiring tedious full cleanup.

## Verification performed for this iteration

The original 30-test suite passed before the changes. The expanded suite now has
49 passing tests covering combat/preview agreement, lethal and level-up ordering,
buff consumption, traits/rewards, cross-room regeneration, free-distance movement,
landing/travel, prerequisite placement, scoring, save archives, exact roundtrips,
full undo, duplicate completion records and actual static/development entries.
Six generated adventures replay every witness action with JSON reload after each
turn, then undo all the way to the initial state. Additional batches inspect 40
ingredient/prerequisite seeds and 30 geometry seeds.

Repository typecheck, Haunted House typecheck, production build, and whitespace
checks passed. The final `haunted-build/` assets were rebuilt locally; no Hosting
deployment was run. Only Haunted House source/docs/tests were changed; the existing
entry page and home button remain intact.

Real headless Chromium checks passed at 1366×768, 1280×720, 1024×600, 768×1024,
390×700, 320×568 and 667×375. From scroll position zero, ordinary desktop sizes
show the full board, essential stats, damage preview, attack and Oil/Ward controls
together. Phone layouts allow normal scrolling and use no fixed action overlay.
The checks cover no horizontal page overflow, tiles at least 32px, stable viewport
after selection/mode/attacks/preparation/kill/collection/travel, keyboard focus,
touch attacks, local stair discovery, remembered-room inspection, disclosure
open/close sizing, and duplicate-free completion after load/undo/re-ending. A full
139-turn winning witness was replayed through UI controls with save comparison
after every turn. No browser exceptions or failed asset requests occurred.

Screenshots were visually reviewed for desktop, tablet, phone and the completion
report. Local artifacts: `.haunted-checks/inspection-{width}x{height}-v4.png`,
`action-{width}x{height}-v4.png` for phone/short landscape views, and
`completion-report-v4.png`. These are emulated Chromium viewports, not physical
device testing. Very short screens and expanded explanations still need scrolling.

The controlled balance batch accepted 16/16 seeds for each of old rules,
power-only Flare, and expanded ingredients. Rejected candidates were 4, 6 and 5;
none silently fell back. At-most-two-Flare leveling kills changed 8 → 3 → 5;
average turns changed 144.56 → 154.50 → 156.69. The baseline did not reproduce the
reported consecutive two-Wisp chain, so this is evidence of reduced opportunities,
not proof that every chain has disappeared. Recovery supplies remained plentiful.
See [the full report](BALANCE.md) for per-seed rejection outcomes, actual route
measurements, alternative encounter orders and fixed-progression arithmetic.

The main remaining balance risk is longer routes/more fights. Hidden-information
fairness and Easy-mode feel cannot be established by an omniscient witness. Physical
phone safe areas, browser chrome, zoom, and human pacing still warrant playtesting.

## Human playtest questions

1. At desktop and short phone sizes, inspect, switch attack modes, prepare Oil or
   Ward, attack, and use food. Check the board remains easy to return to without
   automatic jumping; try keyboard and touch as well as mouse.
2. Inspect stairs, stand on the landing to reveal locally, then travel. Confirm
   the difference is obvious and neither action happens during inspection.
3. Before a killing Strike, calculate retaliation and a possible level-up. Check
   the preview, lethal confirmation, prepared-buff consumption and recovery.
4. Play several seeds without the witness. Does power-only Flare still offer
   useful safe finishes and armour bypass? Are Ward and Oil worth considering?
   Do choices remain forgiving enough for Easy, including non-primer starts?
5. Try the health and oil rewards and both traits. Do they change choices without
   becoming another rulebook to memorise? Watch for hidden mandatory bottlenecks.
6. Finish an objective, then undo the exit and spend leftover supplies exploring.
   Leave again, reload, and inspect the report and single updated completion.
7. Check perceived length and pacing: the target remains a short pocket puzzle,
   with occasional recovery chains rather than repeated effortless encounter loops.
