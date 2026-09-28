# Milk Run — v3 vertical slice

Milk Run is an isolated, responsive B-17 solitaire rules prototype. Fly six rounds to the target, attempt the provisional bombing step, and survive four return rounds to HOME. Mission success means reaching HOME after attempting the bombing run; the bombing result is reported separately. Aircraft geometry follows the supplied authoritative PlaneGrid mapping; unresolved numerical rules remain provisional playtest data.

## Run and deploy

Open the repository's root page and choose **Milk Run**, or serve the repository over HTTP and open `/src/milk-run/index.html`.

```sh
npx vite --host 127.0.0.1
```

Use the URL Vite prints, followed by `/src/milk-run/index.html`. Any ordinary static HTTP server also works; opening `index.html` through `file://` may block JavaScript module imports.

Milk Run uses plain HTML, CSS and browser ES modules. It adds no framework, package, build step, or deployment configuration. The existing Firebase configuration serves the repository root (`public: "."`), so this directory can be served directly. The only intended edit outside `src/milk-run/` is the link in the repository's root `index.html`. Existing prototype entry points and build commands retain their behavior.

## Playtest controls

1. Start a round. Refill bags, complete due work, ready crew, then watch fire spread.
2. Select a ready crew member. The Radio Operator can declare Intercept **before** drawing.
3. Activate to draw a mission token, then select one action. The action menu opens as a sheet on mobile.
4. Watch ordered enemy resolution. Use pause, single-step, fast presentation or skip when needed.
5. After ten crew time slots, finish the round: fighters clear, independent altitude checks resolve, and the mission advances if airborne.

The flight recorder retains semantic events, including rolls and their consequences. Board squares and crew can be inspected by tapping; no critical interaction requires hover. On mobile the status header and bottom activation controls remain accessible, crew cards scroll horizontally, and detailed actions/settings open separately.

Open **Playtest settings** to edit experimental rules, enter an RNG seed, and restart with those settings. Settings apply to a new sortie so token inventories and crew state remain coherent. **Reset defaults** restores the form's baseline values. Ordinary resource exchange is unavailable; the Copilot has the explicit conversion action.

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
| `bombing.mjs` | Isolated, explicitly provisional target resolution. |
| `queue.mjs` | Present snapshots one at a time; pause, step, accelerate or skip delays while retaining the event log. |
| `persistence.mjs` | Versioned local autosave/resume. |
| `main.mjs`, `styles.css`, `index.html` | Responsive board, HUD, crew selection, action sheets, settings, log and summary. |
| `tests/` | Node rules/data/presentation tests and a real Chromium responsive check. |

A command resolves against a copied state. Each meaningful effect emits an event and its state snapshot. The queue owns both the final resolved state and the currently presented state. The UI renders the latter, preventing aircraft damage, injuries, altitude loss or enemy movement from appearing ahead of the event that explains it. Further player commands wait until the sequence has completed. Skipping removes delays while retaining every event in the log.

Autosave uses the localStorage key `milk-run-v3-session-2`, with board version `plane-grid-v1`. The saved session includes final state, visible state, pending snapshots, current event, log and presentation speed. Reloading in the middle of a sequence restores the pending sequence paused for deliberate continuation. Saves made with the old approximate board cannot be resumed on the corrected geometry; its damage, crew and work positions cannot be unambiguously migrated. The old `milk-run-v3-session-1` storage entry is left untouched, and the interface explains that a new sortie is needed. If browser storage is unavailable, play remains possible without reliable persistence. There is one current saved sortie per browser origin.

## Implemented v3 rules

- Ten crew positions, rank and role tags, player-selected activation order, and ten total crew time slots per round. Injured, dead and busy crew are unavailable. Unavailable slots are consumed after available activations. By default they still draw mission tokens and face the enemy queue; drawn resources are wasted into discard. Turning off unavailable mission draws still allows existing fighters to act in those slots.
- Mission bag economy: held resources remain outside the bag. Spent resources enter the discard; routine refill occurs at Round Start. Empty bags use their eligible discard immediately as an emergency refill. Resource draws use the activating crew member's configured rank mapping.
- Combat tokens remain out until refill. Basic Fire draws once for free. Advanced Fire costs one Enlisted resource and continues on hits against one legal target, stopping on a miss; a first-pull miss permits exactly one additional pull and then stops.
- Eight gun stations with the specified quadrants/altitudes, plus two unarmed cockpit seats. Station fire or displacement prevents station actions without making a single Damage marker destroy the station.
- Three visible ordered fighter slots. An Enemy draw at capacity becomes Flak without drawing the enemy deck. Destroyed fighters leave the queue and later fighters advance. The enemy deck refills only when exhausted.
- Uniform twelve-sector fighter spawn and movement. Fighters begin facing the B-17 by default. Facing fighters attack; off-angle fighters rotate 90° toward it. Flyby facing depends on whether the new quadrant is the same, adjacent or opposite. Newly spawned fighters can be shot before their first enemy phase.
- Enemy to-hit d6: 1 miss, 2–5 hit, 6 critical. Location is generated only after a hit and displayed as a 6×6 coordinate plus quarter, such as `B1-4`. Empty air causes no aircraft damage. A critical applies two damage steps and one crew injury check.
- Aircraft damage progresses Healthy → Damaged → Fire. Hits on existing fire have no extra baseline damage. Crew are injured on their first hit and killed on a subsequent hit while injured. Criticals do not instantly kill healthy crew.
- Orthogonal fire-group spread at Round Start using d6: 1–2 none, 3 fore/north, 4 starboard/east, 5 aft/south, 6 port/west. Selected squares under active suppression do not spread; remaining unsuppressed squares form their own connected groups. Healthy occupied space initially stops spread and injures its occupant; spread in a later phase into that injured position kills the crew member and takes the square. A crew member straddling two squares is injured at most once per Fire Phase, so the first spread cannot injure and kill them through their two occupied squares.
- Connected-square Repair and Fire Control, Medical treatment, abstract crisis relocation, completion/return at a configurable future Round Start, displacement if the assigned station remains burning, free-resource General Relocate, and activation-cost Man Cockpit. Fire Control normally leaves Damage; Repair restores Healthy.
- Eight structural sections compromise dynamically when more than half their aircraft cells are Damaged/Fire. Repairs can remove compromise. Each of four engines stops when both its cells are Damaged/Fire and stays stopped after repair until a seated cockpit worker restarts it.
- Minimal role actions: Pilot orders one already-used Gunner's Basic Shot, Copilot exchanges resources at 2:1, Navigator turns a fighter 90° away, Radio Operator declares Intercept or pays for Escort, and Engineer repairs an extra connected square. Ordered fire adds no mission draw or enemy phase.
- Escort occupies one random quadrant for the remainder of the round and deals one damage to fighters entering it after attacking.
- Independent control, structure and engine altitude checks at round end; losses stack. Ground means destruction. A linear outbound/target/return/HOME mission supplies a complete sortie.
- In-memory telemetry and an end-of-sortie summary cover elapsed time, rounds, draws, fighters, Flak, attacks, hits/criticals, aircraft hits, fire, repairs, engines, compromise, altitude loss by cause, casualties and resource gains/spending.

## Baseline values and assumptions

| Setting | Baseline |
| --- | --- |
| Starting resources | 3 Officer, 5 Enlisted, in addition to the initial bag contents |
| Mission bag | 15 Enemy, 20 generic Resource; no Event/Tactical tokens |
| Combat bag | 20 Hit, 13 Miss |
| Enemy deck | 10 BF-109 (2 HP), 6 BF-110 (2 HP), 5 FW-190 (3 HP), 3 Me-262 (4 HP), **4 provisional Flak cards** |
| Fighter cap | 3; settings permit testing a lower cap |
| Spawn / round end | Facing B-17; surviving fighters clear at round end |
| Flak | 2 consecutive standard attacks; no persistent token |
| Starting altitude | 5 steps above ground |
| Repair / Fire Control | Up to 3 / 4 connected affected squares; Engineer adds 1 repair square |
| Work adjacency | Orthogonal; optional eight-way work never changes fire-spread direction |
| Work duration | 1 future Round Start for Medical, Repair and Fire Control; 0 allows immediate completion |
| Crisis costs | 1 resource of the worker's rank for each Medical, Repair or Fire Control action |
| Escort / ordered shot | 1 Enlisted / 1 Officer resource respectively |
| Copilot conversion | Spend 2 of one pool to gain 1 of the other pool |
| Restart | Both engine squares must be Healthy; seated cockpit worker succeeds on d6 1–4 |
| Target / return | Target after 6 completed rounds, HOME after 4 additional rounds |
| Bombing | One provisional d6 check, successful on 3–6; reaching HOME is possible after either result |
| Presentation | Normal event delay 750 ms; fast and instant/skip options available |

The aircraft uses the supplied authoritative PlaneGrid mapping, with **52 damageable sub-squares** within the 144-address hit grid. Each A–F / 1–6 target cell contains four quarters: 1 upper-left, 2 upper-right, 3 lower-left, 4 lower-right. The supplied correction is incorporated in the canonical data: `C4-2` is `Fuselage`, and `C4-3` is `Empty`. Six outbound plus four return rounds and altitude 5 remain explicit temporary assumptions.

Altitude defaults are independently editable:

| Cause | Safe | Middle tier | Severe tier |
| --- | --- | --- | --- |
| Control | Healthy trained Pilot/Copilot correctly seated | Other Officer in cockpit maintains on 3–6 | Enlisted substitute maintains on 5–6; no controller loses 1 automatically |
| Structure | 0–1 compromised sections | 2–3 maintain on 3–6 | 4–5 maintain on 5–6; 6+ destroys aircraft |
| Engines | 0–1 stopped engines | 2 maintain on 3–6 | 3 maintain on 5–6; 4 loses 1 automatically |

Restart odds do not yet differ by crew rank/skill. No Pilot Raise Altitude action exists. Work cost, duration, safe work positioning, injury availability, suppression semantics and cockpit substitution are first-pass interpretations to verify during rules testing; the experimental numerical values remain in configuration.

The default duration of 1 means a job started during Round 2 finishes at **Round 3 Start**, after Round 2's altitude checks. A repair in progress has not yet restored its squares for the current altitude check. Set a duration to 0 to test immediate work effects. Fire Control suppresses its selected fire squares immediately while the job is active. Injury or death of the worker cancels unfinished work. If a selected target's condition changes before completion, the job affects only targets still eligible for that type of work.

Crisis movement automatically chooses the nearest unoccupied, non-burning aircraft square to the first selected target, preferring fuselage space when distances tie. There is no pathfinding or movement-distance cost. Work completes before the next Fire Phase, and workers return only when their assigned station is safe and unoccupied; otherwise they remain displaced. Taking over a cockpit seat changes the crew member's assigned station. Injured occupants still occupy their position until healed or killed.

Copilot conversion preserves the number of generic physical resource tokens: of two tokens paid, one becomes the received resource in the other pool and the one surplus token goes to mission discard. The telemetry records two resources spent and one gained. This differs from a normal action payment, where every spent token enters discard.

Configuration normalization clamps inputs to their visible ranges, orders the altitude thresholds, and prevents an initially empty mission bag, combat bag or enemy deck. These safeguards do not invent tokens when a running mission bag has no eligible refill tokens because all resources are held outside it.

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

## Validation

From the repository root:

```sh
node --test src/milk-run/tests/*.test.mjs
node src/milk-run/tests/browser-check.mjs
```

The automated rules suite exercises bag depletion/refill and resource circulation, deterministic RNG, board invariants, combat arcs and Advanced Fire, fighter capacity/facing/queue behavior, spatial damage and crew casualties, fire/work/repair, structure/engines, stacking altitude checks, round clearing, unavailable slots, mission completion, and presentation/persistence contracts.

The browser check starts its own temporary static server and headless Chromium, checks desktop/tablet/mobile viewports, exercises real controls, and captures screenshots/results under the locally ignored `.checks/` directory. It uses native Node test/HTTP/WebSocket APIs and no added test dependency. A recent Node release with built-in `fetch` and `WebSocket` is required. On systems without Chrome at the script's Windows default, set `CHROME_PATH` to a compatible Chromium executable. The browser script uses debugging port 9337 while running.

Verified results after the board correction: **64/64 Node tests pass**. Nine additional tests cover CSV loading/validation, exact quarter geometry and counts, authoritative engine/crew footprints, all empty-square hits, overlapping damage consequences and board-version save isolation. Existing footprint tests now hit both vulnerable squares of each of the six multi-square crew, and compromise checks cover all eight authoritative sections.

Chromium checks pass at **1440×1000, 768×1024, 390×844 and 320×740**, with no runtime exceptions or failed asset requests. At each viewport the browser asserts all 144 quarter rectangles, exactly ten unique crew markers at their complete footprint centers, and four non-structural engine indicators. It also verifies touch inspection of corrected `C4-2` and empty `C4-3`, exact-quarter hit highlighting, action sheets, no horizontal overflow, and the existing presentation/autosave controls. The desktop and mobile screenshots were visually compared with `data/original-board-reference.png`. A separate browser smoke check also loaded the canonical CSV and corrected board through the existing Vite server.

Two ten-round sorties complete through the actual desktop/phone controls; a third replays the regenerated default-rules combat witness through all 207 commands to HOME. The witness is `tests/fixtures/baseline-home-witness.json`, seed `corrected-plane-grid-0`: ten rounds, 100 mission draws, 69 enemy attacks, 15 repaired squares, nine crew alive and altitude 2 at HOME. Its decisions were regenerated because the original approximation exposed different squares to hits; the gameplay rules and default values were not changed. The fixture includes the decisions: a seed alone is insufficient to reproduce a run with different player choices. Browser results and screenshots are written to `.checks/`.

Visual checks supplement the rules suite. Resource-only diagnostic sorties isolate interface progression, while the default-rules witness exercises combat and crisis work. These results establish functional completion, not final balance or a survival-probability claim. Responsive testing uses Chromium device emulation; physical phones have not been tested.
