# Milk Run — v3 vertical slice

Milk Run is an isolated, responsive B-17 solitaire rules prototype. Fly fourteen rounds to the target, attempt the provisional bombing step, and survive five return rounds to HOME. Mission success means reaching HOME after attempting the bombing run; the bombing result is reported separately. Aircraft geometry follows the supplied authoritative PlaneGrid mapping; unresolved numerical rules remain provisional playtest data.

## Run and deploy

Open the repository's root page and choose **Milk Run**, or serve the repository over HTTP and open `/src/milk-run/index.html`.

```sh
npx vite --host 127.0.0.1
```

Use the URL Vite prints, followed by `/src/milk-run/index.html`. Any ordinary static HTTP server also works; opening `index.html` through `file://` may block JavaScript module imports.

Milk Run uses plain HTML, CSS and browser ES modules. It adds no framework, package, build step, or deployment configuration. The existing Firebase configuration serves the repository root (`public: "."`), so this directory can be served directly. The only intended edit outside `src/milk-run/` is the link in the repository's root `index.html`. Existing prototype entry points and build commands retain their behavior.

## Playtest controls

1. Start a round. Refill bags, complete due work, ready crew, then watch fire spread.
2. Select a crew member to preview their station, status, actions and gun arc without spending an activation. The Radio Operator can declare Intercept **before** drawing.
3. Activate to draw and reveal a mission token, then select one action. Action groups explain General, Role and Station actions and their costs. Fire at an individual aircraft token or queue card; select crisis targets on the aircraft, then confirm.
4. If a legal Opportunity Shot exists after the action, use the **Opportunity window** to fire with a gunner whose normal action is complete. Repeat while eligible, or choose **Continue to Enemy Phase**. Then watch ordered enemy resolution. **Step / Manual** waits for the next major beat; **Normal** gives draws, rolls and consequences readable time; **Fast** shortens the same sequence. Skip preserves the full event record.
5. After ten crew time slots, finish the round: fighters clear, independent altitude checks resolve, and the mission advances if airborne.

The flight recorder groups human-readable summaries by category with expandable semantic event details. Board squares, crew and fighters can be inspected or selected by tapping; no critical interaction requires hover. On mobile the status header and bottom controls remain accessible, ten crew form a compact two-row rack, and detailed actions/settings open in sheets. Selecting a gunner previews the legal sectors and fighters without drawing or changing game state.

Open **Playtest settings** to edit experimental rules, enter an RNG seed, and restart with those settings. Rule preferences persist separately from the current sortie; structural rule changes apply to the next sortie so token inventories and crew state remain coherent. **Reset defaults** clears stored overrides and restores the canonical values. A **PLAYTEST RULES MODIFIED** indicator identifies overrides. Ordinary resource exchange is unavailable; only the Copilot can convert resource pools.

The same configuration, seed, and sequence of decisions produce the same random gameplay results. Presentation timing does not consume random numbers. Real-world start/end timestamps naturally differ. Export the sortie and flight recorder as JSON to preserve a useful bug report or balance example.

## Architecture

| Module | Responsibility |
| --- | --- |
| `state.mjs` | Create a plain, serializable game state and telemetry counters. |
| `config.mjs` | Baseline values, editable field definitions, normalization, enemy definitions and rank-to-resource mapping. |
| `board.mjs` | Validated CSV-derived aircraft sub-squares, sections, engines, stations, crew definitions/tags, arcs and adjacency. |
| `plane-grid.mjs` | Parse and validate canonical rows; normalize crew footprint parts and engine Front/Back labels. |
| `data/` | Canonical PlaneGrid CSV and the original flat board artwork retained as a visual reference. |
| `random.mjs` | Serializable seeded PRNG, dice, mission/combat bag draw/refill and enemy deck exhaustion. |
| `rules.mjs` | Validate decisions, resolve rules and emit semantic events with intermediate state snapshots. |
| `spatial.mjs` | Absolute fighter headings and relative attack-facing helpers, independent of artwork. |
| `ui-model.mjs` | Pure crew status, station information, arc previews and legal board-target choices. |
| `targeting.mjs` | Tentative fighter, crew, work-square and worker-position selection with confirmation legality. |
| `board-view.mjs` | Data-driven SVG geometry, individual crew/fighter tokens, arcs, work outlines, reticle and escort rendering. |
| `views.mjs` | Crew/queue cards, draw tokens, event stage, grouped recorder and altitude track markup. |
| `bombing.mjs` | Isolated, explicitly provisional target resolution. |
| `presentation.mjs`, `queue.mjs` | Add visual draw/focus beats, classify events and present snapshots one at a time; manual, normal, fast and skip retain the semantic event log. |
| `persistence.mjs` | Versioned local autosave/resume, rules-version migration and separate next-run preferences. |
| `main.mjs`, `styles.css`, `ux.css`, `index.html` | Responsive board, HUD, crew selection, action sheets, settings, log and summary. |
| `tests/` | Node rules/data/presentation tests and a real Chromium responsive check. |

A command resolves against a copied state. Each meaningful effect emits an event and its state snapshot. The queue owns both the final resolved state and the currently presented state. The UI renders the latter, preventing aircraft damage, injuries, altitude loss or enemy movement from appearing ahead of the event that explains it. Further player commands wait until the sequence has completed. Skipping removes delays while retaining every event in the log.

Presentation-only draw and focus beats reuse an already-visible snapshot and never roll dice or mutate gameplay. A mission token first appears facedown, then reveals its result before resource gain or fighter spawn. Combat pulls identify shooter and target, reveal Hit/Burst/Miss, and then show damage before any next pull. Enemy attacks distinguish the attack roll from the location and its consequences. An empty-air location leaves a blue X until the next enemy attack; a failed attack roll has no location. The reticle contracts onto the exact quarter before damage becomes visible. Altitude checks and losses use the same serialized sequence.

Board interactions keep tentative targets outside game state until confirmation. Canceling a target selection does not spend resources, advance enemies, draw tokens or consume an activation. Fighters sharing a sector remain separate numbered tokens and queue cards. Escort aircraft use blue styling; enemies use red. The recorder preserves every rule event independently of the selected presentation speed; visual-only beats do not inflate the raw log or telemetry.

Starting a resolution brings the event stage into view once, including when the order came from a crew rack or enemy queue below the board. It does not keep pulling the viewport back on every beat. Opening an inspection sheet pauses automatic presentation; close the sheet and press Play to continue. Expanded recorder groups and raw event details remain open as new events arrive.

Fighters store an absolute clockwise heading (`0` north, `90` east, `180` south, `270` west) separately from relative `facing`. A flyby keeps that heading when its quadrant changes; a subsequent turn updates it toward the B-17. Relative facing still decides attack versus rotate and retains the existing same/adjacent/opposite quadrant rule. Heading is recovered deterministically for old saves that lack it, without consuming RNG. An exactly opposite turn uses clockwise rotation because the old rules do not specify a preferred side.

Autosave uses the localStorage key `milk-run-v3-session-2`, with board version `plane-grid-v1`. The saved session includes final state, visible state, pending snapshots, current event, log and presentation speed. Reloading in the middle of a sequence restores the pending sequence paused for deliberate continuation. Saves made with the old approximate board cannot be resumed on the corrected geometry; its damage, crew and work positions cannot be unambiguously migrated. The old `milk-run-v3-session-1` storage entry is left untouched, and the interface explains that a new sortie is needed. If browser storage is unavailable, play remains possible without reliable persistence. There is one current saved sortie per browser origin.

Corrected-board saves now carry `rulesVersion: 3`, with an explicit per-round `activationCompleted` flag. Version-2 saves preserve their resolved/pending enemy sequence: migration does not replay enemies or insert a new decision into already-calculated work. Earlier used crew are marked complete; the current actor remains incomplete until a new normal action resolves. New saves preserve an open Opportunity window across reload. Migrating pre-combat-economy saves also preserves live bags/discards, resources, RNG, mission length, work durations and job dates; missing Burst count becomes 0, Opportunity remains disabled at 0, and Disruption remains disabled. Older 6/4 mission and one-round work defaults are retained where no explicit values existed. Pilot Direct Fire is unavailable in preserved Opportunity-off runs; no retired ordered-shot engine is maintained. Future Copilot decisions use reciprocal physical-token conversion. Existing sorties never merge with next-run preferences. The separate `milk-run-v3-dev-preferences-1` key stores only differences from canonical defaults; valid form changes and the speed selector save those preferences, and Reset removes that key. No other prototype's storage is touched.

Legacy raw-event saves paused at `ENEMY_HIT_LOCATION` receive a missing focus beat before their pending damage. Current expanded queues retain their exact sequence. Face-down draws retain the previously visible bag inventory until reveal, including emergency refills, so Bag intelligence cannot disclose a hidden token early.

## Implemented v3 rules

- Ten crew positions, rank and role tags, player-selected activation order, and ten total crew time slots per round. Injured, dead and busy crew are unavailable. Unavailable slots are consumed after available activations. By default they still draw mission tokens and face the enemy queue; drawn resources are wasted into discard. Turning off unavailable mission draws still allows existing fighters to act in those slots.
- Mission bag economy: held resources remain outside the bag. Spent resources enter the discard; routine refill occurs at Round Start. Empty bags use their eligible discard immediately as an emergency refill. Resource draws use the activating crew member's configured rank mapping.
- Combat tokens remain out until refill: Hit deals 1 damage, Burst deals 2, and Miss deals none. Basic Fire draws once for free. Advanced Fire costs one Enlisted resource and continues on Hit or Burst against one legal target, stopping on a Miss; a first-pull Miss permits exactly one additional pull and then stops regardless of that token's result.
- Eight gun stations with the specified quadrants/altitudes, plus two unarmed cockpit seats. Station fire or displacement prevents station actions without making a single Damage marker destroy the station.
- Three visible ordered fighter slots. An Enemy draw at capacity becomes Flak without drawing the enemy deck. Destroyed fighters leave the queue and later fighters advance. The enemy deck refills only when exhausted.
- Uniform twelve-sector fighter spawn and movement. Fighters begin facing the B-17 by default. Facing fighters attack; off-angle fighters rotate 90° toward it. Flyby facing depends on whether the new quadrant is the same, adjacent or opposite. Newly spawned fighters can be shot before their first enemy phase.
- Enemy to-hit d6: 1 miss, 2–5 hit, 6 critical. Location is generated only after a hit and displayed as a 6×6 coordinate plus quarter, such as `B1-4`. Empty air causes no aircraft damage. A critical applies two damage steps and one crew injury check.
- Aircraft damage progresses Healthy → Damaged → Fire. Hits on existing fire have no extra baseline damage. Crew are injured on their first hit and killed on a subsequent hit while injured. Criticals do not instantly kill healthy crew.
- Orthogonal fire-group spread at Round Start using d6: 1–2 none, 3 fore/north, 4 starboard/east, 5 aft/south, 6 port/west. Selected squares under active suppression do not spread; remaining unsuppressed squares form their own connected groups. Healthy occupied space initially stops spread and injures its occupant; spread in a later phase into that injured position kills the crew member and takes the square. A crew member straddling two squares is injured at most once per Fire Phase, so the first spread cannot injure and kill them through their two occupied squares.
- Connected-square Repair and Fire Control, Medical treatment, abstract crisis relocation, completion/return at a configurable future Round Start, displacement if the assigned station remains burning, free-resource General Relocate, and activation-cost Man Cockpit. Fire Control normally leaves Damage; Repair restores Healthy.
- Eight structural sections compromise dynamically when more than half their aircraft cells are Damaged/Fire. Repairs can remove compromise. Each of four engines stops when both its cells are Damaged/Fire and stays stopped after repair until a seated cockpit worker restarts it.
- Minimal role actions: Pilot **Direct Fire** costs one Officer resource and creates one Opportunity, Copilot converts resources using the physical-token rules below, Navigator turns a fighter 90° away, Radio Operator declares Intercept or pays for Escort, and Engineer repairs an extra connected square. Direct Fire consumes the Pilot's normal action and does not itself fire a gun. Its new Opportunity is immediately usable in the pre-enemy window if a completed gunner has a legal target.
- **Opportunity** is a separate shared currency: start with 1, hold at most 3, and gain 1 for each fighter killed when the kill-reward setting is enabled. It persists between rounds and never enters either bag. After a crew action, spend one Opportunity to let one healthy gunner with a completed normal action this round, operating a usable gun, draw exactly one Basic Fire token at a legal target. This creates no activation, mission draw, time slot or enemy phase. An Opportunity kill can earn the next Opportunity; there is no additional chain limit.
- Successful damage marks a surviving fighter **Disrupted** when enabled. It does not stack and remains while the fighter rotates. At its next facing-in attack, consume that disruption, show the cancellation, skip the attack and its roll, and perform the normal flyby. A fresh Escort hit during that flyby can apply a new Disruption.
- Escort occupies one random quadrant for the remainder of the round and deals one damage to fighters entering it after attacking.
- Independent control, structure and engine altitude checks at round end; losses stack. Ground means destruction. A linear outbound/target/return/HOME mission supplies a complete sortie.
- In-memory telemetry and an end-of-sortie summary cover elapsed time, rounds, draws, fighters, Flak, attacks, hits/criticals, aircraft hits, fire, repairs, engines, compromise, altitude loss by cause, casualties, resource gains/spending and Opportunity gains/spending.

The decision sequence is **Mission Draw → Crew Action → Opportunity Window → Enemy Phase**. `used` reserves a crew time slot at activation; separate `activationCompleted` becomes true only after the normal action resolves. The actor can then qualify for that action's window if still healthy and operating a gun. The window opens only when a legal shot is available, uses phase `opportunity`, and remains open through repeated shots until the player chooses Continue, even if the last shot removed every target. Continue runs the pending enemy phase exactly once. No Opportunity spending is allowed during `select`, `action`, `roundEnd`, or an active presentation queue. Crew without an action still consume their existing automatic time slots and enemy phases. Completion flags reset at Round Start.

Round Start resolves all due job effects before planning worker returns together. Workers returning simultaneously release temporary occupancy for this plan; anyone remaining at a work position still blocks a station. A blocked return can therefore prevent a dependent return, while crossed Pilot/Copilot or Radio/Engineer workers return normally when both home stations are usable. Returns remain individually presented. Medical is disabled with an explanation when no injured target has a safe interior work position.

## Baseline values and assumptions

| Setting | Baseline |
| --- | --- |
| Starting resources | 3 Officer, 5 Enlisted, in addition to the initial bag contents |
| Mission bag | 15 Enemy, 20 generic Resource; no Event/Tactical tokens |
| Combat bag | 16 Hit, 4 Burst, 13 Miss; independent editable counts, all-zero inventory rejected |
| Enemy deck | 10 BF-109 (2 HP), 6 BF-110 (2 HP), 5 FW-190 (3 HP), 3 Me-262 (4 HP), **4 provisional Flak cards** |
| Fighter cap | 3; settings permit testing a lower cap |
| Spawn / round end | Facing B-17; surviving fighters clear at round end |
| Flak | 2 consecutive standard attacks; no persistent token |
| Starting altitude | 5 steps above ground |
| Repair / Fire Control | Up to 3 / 4 connected affected squares; Engineer adds 1 repair square |
| Work adjacency | Orthogonal; optional eight-way work never changes fire-spread direction |
| Work duration | 2 future Round Starts for Medical, Repair and Fire Control; 0 allows immediate completion |
| Crisis costs | 1 resource of the worker's rank for each Medical, Repair or Fire Control action |
| Escort / Direct Fire | 1 Enlisted / 1 Officer resource respectively |
| Opportunity | Enabled; start 1, cap 3, gain 1 per fighter kill; persists between rounds |
| Disruption | Enabled after fighter damage; next facing-in attack is replaced by a normal flyby |
| Copilot conversion | 2 Enlisted → 1 Officer, or 1 Officer → 2 Enlisted if one extra Resource remains in the mission bag |
| Restart | Both engine squares must be Healthy; seated cockpit worker succeeds on d6 1–4 |
| Target / return | Target after 14 completed rounds, HOME after 5 additional rounds |
| Bombing | One provisional d6 check, successful on 3–6; reaching HOME is possible after either result |
| Presentation | Configurable base delay; important Normal beats get longer holds, Fast shortens them, Step / Manual waits for input; skip remains available |

The aircraft uses the supplied authoritative PlaneGrid mapping, with **52 damageable sub-squares** within the 144-address hit grid. Each A–F / 1–6 target cell contains four quarters: 1 upper-left, 2 upper-right, 3 lower-left, 4 lower-right. The supplied correction is incorporated in the canonical data: `C4-2` is `Fuselage`, and `C4-3` is `Empty`. Fourteen outbound plus five return rounds and altitude 5 remain editable playtest values.

Altitude defaults are independently editable:

| Cause | Safe | Middle tier | Severe tier |
| --- | --- | --- | --- |
| Control | Healthy trained Pilot/Copilot correctly seated | Other Officer in cockpit maintains on 3–6 | Enlisted substitute maintains on 5–6; no controller loses 1 automatically |
| Structure | 0–1 compromised sections | 2–3 maintain on 3–6 | 4–5 maintain on 5–6; 6+ destroys aircraft |
| Engines | 0–1 stopped engines | 2 maintain on 3–6 | 3 maintain on 5–6; 4 loses 1 automatically |

Restart odds do not yet differ by crew rank/skill. No Pilot Raise Altitude action exists. Work cost, duration, safe work positioning, injury availability, suppression semantics and cockpit substitution are first-pass interpretations to verify during rules testing; the experimental numerical values remain in configuration.

The default duration of 2 means work started in Round N occupies the worker immediately and throughout Round N+1, then finishes at **Round N+2 Start**. The worker is available again in that round when healthy and usable; a Medical patient likewise remains unavailable until treatment completes. For example, work begun in Round 2 completes at Round 4 Start. A repair in progress does not restore its squares for either earlier altitude check. Set duration to 0 to test immediate work effects. Fire Control suppresses only the selected fire squares immediately. Injury or death of the worker cancels unfinished work. Repair restores only the explicitly selected squares that are still Damaged; a selected square that becomes Fire is skipped without canceling the rest of the job.

Crisis work separates the damaged/fire target from the worker's physical position. Repair and Fire Control use a non-burning internal C/D lane on the primary target's board row. The player chooses this position after selecting the work squares; a command without an explicit work position chooses a legal position deterministically for existing saves and scripted playtests. Internal work positions may share a crew footprint. The renderer bounds worker circles, selection strokes and status badges inside that exact footprint; dense stacks use smaller numbered markers, while normal station markers retain their centered positions. Wing targets remain on the wing and receive their own work outline; the worker remains inside the fuselage. There is no pathfinding or movement-distance cost. Work completes before the next Fire Phase, followed by the coherent return batch described above. Taking over a cockpit seat changes the crew member's assigned station. Injured occupants still occupy their position until healed or killed.

Copilot conversion preserves the total of held resources plus mission-bag Resource tokens plus Resource discard. Converting **2 Enlisted → 1 Officer** relabels one held token and puts the surplus token in mission discard. Converting **1 Officer → 2 Enlisted** relabels the held token and removes one additional Resource token from the mission bag to supply the second output. A token in discard cannot supply this conversion; if the bag contains no Resource token, the action explains why that direction is unavailable. Neither direction creates a physical token. Ordinary action payments still put every spent resource token into mission discard.

The configurable conversion ratio applies reciprocally: at ratio N, N Enlisted become one Officer with N−1 tokens entering discard; one Officer becomes N Enlisted only when N−1 Resource tokens can be taken from the bag.

Configuration normalization clamps inputs to their visible ranges and orders the altitude thresholds. Hit, Burst and Miss counts are independent, including individual zeroes; a total of zero combat tokens is an explicit validation error. Existing nonempty safeguards for the mission bag and enemy deck remain. No safeguard invents a resource when a running mission bag has no eligible refill tokens because all resources are held outside it.

## Authoritative board data and rendering

The canonical `data/plane-grid.csv` retains all 144 `Cell,Plane,Engine,Crew` rows from `MilkRunCheatSheet.xlsx - PlaneGrid (1).csv`, with the two `C4` Plane corrections applied. `board.mjs` loads this file at module initialization through browser `fetch` or Node's `fs.readFile`; `plane-grid.mjs` validates it and derives `BOARD`, `STATIONS` and `ENGINE_CELLS`. There is no generation or build step. Rules and rendering query those same derived records. No separately maintained coordinate layout or artwork color lookup defines gameplay.

Every address is present once, including empty air. `Plane` identifies damageable structure and its section independently of `Engine` and `Crew`. `Empty (Engine Running Token - Visual only)` denotes an empty-air position for a status indicator: it contributes no section area, damage collision or engine footprint. The four actual engines each retain two damageable footprint squares:

| Engine | Damageable footprint |
| --- | --- |
| 1 | `B2-4`, `B3-2` |
| 2 | `C2-1`, `C2-3` |
| 3 | `D2-2`, `D2-4` |
| 4 | `E2-3`, `E3-1` |

| Section | Damageable sub-squares |
| --- | ---: |
| `NosePort` | 6 |
| `NoseStarboard` | 6 |
| `PortWing_Front` | 6 |
| `PortWing_Rear` | 6 |
| `StarboardWing_Front` | 6 |
| `StarboardWing_Rear` | 6 |
| `Fuselage` | 8 |
| `Tail` | 8 |

These counts are used by the existing more-than-half compromise rule. A hit such as `B2-4` damages only that quarter and can affect both its structural section and Engine 1. Crew vulnerability likewise retains every mapped footprint square.

CSV suffixes such as `Top-Turret 1` / `Top-Turret 2` identify parts of one crew footprint. Each crew member has one visible marker, centered over the footprint's sub-square centers, while either occupied square can receive a hit:

| Marker | Crew | Footprint |
| --- | --- | --- |
| 1 | Bombardier | `C1-4` |
| 2 | Navigator | `D1-3` |
| 3 | Pilot | `C2-2` |
| 4 | Copilot | `D2-1` |
| 5 | Top Turret / Engineer | `C2-4`, `D2-3` |
| 6 | Radio Operator / Dorsal Gunner | `C3-2`, `D3-1` |
| 7 | Ball Turret Gunner | `C3-4`, `D3-3` |
| 8 | Left Waist Gunner | `C4-2`, `C4-4` |
| 9 | Right Waist Gunner | `D4-1`, `D4-3` |
| 10 | Tail Gunner | `C6-2`, `D6-1` |

The board renders section fills and damage at sub-square resolution, with stronger boundaries and A–F / 1–6 labels for the larger target cells. Quarter coordinates remain available through tap/inspection and the attack highlight without permanently filling the board with text. Crisis movement continues to use actual crew positions; a moved crew member's single marker follows their current position.

`data/original-board-reference.png` is the unmodified `MilkRun/Tokens/FlyingFortressBoard2.png` from the supplied archive. It provides a visual check for silhouette, section placement, green engine-status indicators and straddling crew markers. Its decorative altitude track and small aircraft overlay do not add structural squares. The image is a reference asset; gameplay never samples its pixels.

The previous substitute board had 56 structural squares and different section groupings (`nose`, `cockpit`, whole port/starboard wings, bomb bay, waist, tailplane and tail). It also placed all engines in a single wing row, used approximate station footprints, numbered Pilot/Copilot as 1/2, and repeated a crew marker per occupied square. The corrected CSV replaces those approximations with the eight physical sections, staggered engine footprints, authoritative crew numbering and one marker per person. Changing the geometry naturally changes hit exposure and adjacency without changing the combat, fire, altitude or mission rules.

When editing future board data, modify the canonical CSV and rerun the board/rules tests. Bump `BOARD_VERSION` and review save compatibility for geometry changes so stored damage and pending events cannot silently use a different map. Avoid encoding consequences in DOM click handlers or maintaining a second coordinate map.

## Extending rules

Crew rank, tags, role `abilities` arrays and gun arcs live in `CREW_DEFS`. Enemy HP, deck count keys and reserved `abilities` arrays live in `ENEMY_DEFS`. Experimental settings belong in `DEFAULT_CONFIG` and `CONFIG_FIELDS`. `bombing.mjs` intentionally contains only the minimum target rule, keeping later Bombardier-station requirements separate from the general round engine.

## Deferred rules and decisions

The baseline deliberately excludes Event cards, Locked In, Desperation, fighter exhaustion/action counters, Fate, destroyed gun stations, aircraft-specific critical abilities, instant-kill criticals, full interior pathfinding, generalized station swapping, campaign/career/XP systems, bailing out, a landing minigame, branching/hidden mission tiles, scouting and complex Bombardier station requirements. Persistence of fighters is available only as an experimental setting; baseline fighters clear each round.

Remaining design decisions include the original physical mission length, initial altitude, Flak deck count, crisis costs and exact work timing, whether healthy crew should block first fire spread or move, whether engine restart should vary by skill, unavailable-slot pressure, bombing success consequences, and final resource/bag/enemy balance. Aircraft/station geometry now follows the supplied authoritative mapping. Playtest observations should include the exported seed, configuration and log so a specific sortie can be reproduced.

Burst, Disrupted and Opportunity now have the explicit rules described above. The former Pilot ordered-shot action is retired. Opportunity is not stamina, and no fighter-persistence, exhaustion or additional combat-frequency system has been added.

## Validation

Files changed in the post-audit corrective pass are all inside this project:

- Rules/state/save migration: `rules.mjs`, `state.mjs`, `persistence.mjs`.
- Presentation and interaction: `queue.mjs`, `presentation.mjs`, `main.mjs`, `targeting.mjs`, `ui-model.mjs`, `board-view.mjs`, `ux.css`.
- New focused regressions: `tests/corrective-rules.test.mjs`, `tests/presentation-corrections.test.mjs`, `tests/crew-renderer.test.mjs`, `tests/corrective-browser-check.mjs`.
- Updated existing tests: `tests/combat-economy.test.mjs`, `tests/dev-preferences.test.mjs`, `tests/rounds-work.test.mjs`, `tests/ux-rules.test.mjs`, `tests/ux-model.test.mjs`, `tests/ux-targeting.test.mjs`, `tests/browser-check.mjs`, `tests/ux-browser-check.mjs`, `tests/rules-browser-check.mjs`.
- Sortie replay and documentation: `tests/generate-economy-witness.mjs`, `tests/fixtures/combat-economy-home-witness.json`, and this README. The historical witness JSON is unchanged.

No root navigation, deployment configuration, board CSV, original artwork or unrelated prototype needed changing for this pass.

From the repository root:

```sh
node --test src/milk-run/tests/*.test.mjs
node src/milk-run/tests/browser-check.mjs
node src/milk-run/tests/ux-browser-check.mjs
node src/milk-run/tests/rules-browser-check.mjs
node src/milk-run/tests/corrective-browser-check.mjs
```

The automated rules suite exercises bag depletion/refill and resource circulation, deterministic RNG, board invariants, combat arcs and Advanced Fire, fighter capacity/facing/queue behavior, spatial damage and crew casualties, fire/work/repair, structure/engines, stacking altitude checks, round clearing, unavailable slots, mission completion, and presentation/persistence contracts.

The browser checks start temporary static servers and headless Chromium, exercise real controls and touch events, and capture screenshots/results under the locally ignored `.checks/` directory. They use native Node test/HTTP/WebSocket APIs and no added test dependency. A recent Node release with built-in `fetch` and `WebSocket` is required. On systems without Chrome at the scripts' Windows default, set `CHROME_PATH` to a compatible Chromium executable. The baseline script uses debugging port 9337, UX uses 9338, and combat/economy uses 9339. Their artifacts live in `.checks/`, `.checks/ux/` and `.checks/combat-economy/` respectively.

Verified after the corrective pass: **156/156 Node tests pass**. Existing coverage still verifies board invariants, both vulnerable squares of straddling crew, gun arcs, absolute headings, Hit/Burst/Miss and Advanced Fire, Disruption lifetime, physical-token conservation, N+2 work timing, selected-square completion and persisted defaults. New regressions cover mutual returns in both processing orders, genuine remaining blockers, workers bounded to their semantic footprints, Medical reachability, concealed normal/emergency draws, legacy focus restoration, completion-based Opportunity eligibility, repeated pre-enemy shots, Pilot-created immediate Opportunity, explicit Continue, window reload and version-2 completion metadata migration.

Chromium checks run at **1440×1000, 768×1024, 320×740, 360×800, 390×844 and 430×932**. Every viewport checks the 144 exact quarters, ten unique crew tokens and four non-structural engine indicators without page overflow. Phone layouts use two rows of five crew and viewport-sized action sheets. Real touch checks cover crew preview and activation, individual aircraft in shared sectors, Basic/Advanced/Opportunity fire, board Repair/Fire Control targets, internal worker positions and direct Medical targeting. Presentation checks cover visible token faces, separate critical-hit consequences, reticle focus, attack misses versus persistent empty-air X markers, escort placement/interception/expiry and independent altitude rolls. The focused economy browser suite checks a visible Burst ×2, Disrupted board/card markers and a cancelled attack, three chained Opportunity kills, Direct Fire, both conversions and an unavailable reverse exchange, preference persistence/reset, and an all-zero combat inventory error.

The corrective browser suite adds actual touch regressions at desktop and **320/360/390px**: Radio → Preview board → Intercept → Activate, shared checkbox state in both directions, action completion before Opportunity, window reload, Pilot-created shots before enemies, reachable Medical patients, bounded worker rendering and all crew statuses. Crew name/status/control labels are now 10px in the mobile rack with 11px status icons; cards remain two rows of five at approximately 80px height. Work deadlines and full role details remain in the tap-opened sheet. Its artifacts are under `.checks/corrective/` and it uses debugging port 9340.

The browser suite completes two **19-round** resource-only diagnostic sorties through desktop and phone controls. It also replays `tests/fixtures/combat-economy-home-witness.json`, seed `combat-economy-0`: **469 commands under exact current defaults**, 19 rounds, 190 mission draws, 51 explicit Opportunity windows, 57 Opportunity shots, 16 Burst pulls, eleven conversions, crisis work and an engine restart. It reaches HOME at altitude 5 with all ten crew alive. Node validation also checks physical-resource conservation after every command. The bounded generator in `tests/generate-economy-witness.mjs` uses visible game state without reading future RNG results; its seed and decision sequence are retained for reproduction.

The previous `tests/fixtures/baseline-home-witness.json` remains unchanged as a historical artifact. Its three retired `orderShot` commands and six conversions use the previous rules, so it is deliberately not presented as a current-rules HOME witness. Tests preserve its old bag/config/RNG values during migration, replay its compatible opening, and verify that the retired action is rejected transactionally. No legacy rules engine was added to keep that replay working.

Visual checks supplement the rules suite. Resource-only diagnostic sorties isolate interface progression, while the default-rules witness exercises combat and crisis work. These results establish functional completion, not final balance or a survival-probability claim. Responsive testing uses Chromium device emulation; physical phones have not been tested.
