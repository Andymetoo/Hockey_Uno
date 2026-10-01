# Milk Run — V1 and experimental V2

New sorties offer **V1 — Round-Based** (the current/classic rules) or **V2 — Continuous Time — EXPERIMENTAL**. The `v3` names in old storage keys and historical documentation are implementation versions, not the new player-facing ruleset. V1 keeps its 14/5 mission, N+2 work, ten-slot rounds, fighter clearing, and Round Start refill/fire behavior.

## V2 continuous-time playtest

The UI/dev-tools pass keeps the active ruleset visible and shows six compact V2 status values: Crew Cycle slots, Time pips/count, outbound/return Progress, altitude, resources and Opportunity. Active jobs identify their countdown and both workers when assisted. Enemy queue cards show Engagement; a separate **BREAKS OFF** beat holds the zero-Engagement fighter on screen before departure, with no destruction styling or kill reward.

Progress uses the existing resolution queue for work-completion acknowledgement, Fire Spread, aircraft condition, independent altitude checks, movement and bag refill. Completed jobs still resolve on the triggering Time draw before the crew action; the checkpoint acknowledges that work before hazards rather than completing it twice. Manual playback can inspect every checkpoint stage, including an undamaged aircraft's safe checks.

There are no V2 rounds. Choose and activate a crew member, draw a mission token, take an action (or Continue), resolve any Opportunity shots, and resolve the enemy queue. Three clocks operate independently:

- **Crew Cycle:** ten Turns, one normal activation slot per crew member. Refreshing slots only changes readiness. Injured, dead and working crew still consume their slots with mission draws and enemy pressure under the existing default. Slots are separate from availability: a released worker can act immediately if their slot is unconsumed, otherwise they wait for the next cycle.
- **Time / Progress:** a Time draw adds one Time and reduces every already-active job by one. Zero-Time jobs complete immediately, including batch station returns. Jobs started afterward wait for future draws. At 4/4 Time, a checkpoint waits until the current action, Opportunity window and enemy phase finish. It spreads unsuppressed fire, recalculates aircraft condition, checks Control/Structure/Engines independently, and advances one Progress if airborne. Then Time resets, its held tokens return, and both bags refill from discard. Crew readiness and surviving fighters are unchanged.
- **Engagement:** each fighter has its own remaining enemy actions. The default counts attacks, rotations and Disrupted actions. Attack Pass Only counts attacks and Disrupted flybys but not pure rotations. A fighter completes its action before departing at zero. Excess Enemy draws still produce immediate Flak at the three-fighter cap.

| V2 setting | Default |
| --- | --- |
| Crew Cycle Turns | 10 (fixed, per playtest clarification) |
| Mission Enemy / Resource / Time tokens | 20 / 12 / 10 |
| Time Required Per Progress | 4 |
| Outbound / return Progress | 8 / 3 |
| Repair / Fire Control / Medical Time | 4 / 4 / 4 |
| Assisted Repair / Fire Control / Medical Time | 2 / 2 / 2 |
| Fighter Kill Grants Time | ON; B-17 gunfire kills pull one Time from the mission bag |
| Disrupt | Enabled; 4+ to Hit (1–3 Off Target, 4–5 Hit, 6 Critical) |
| Maximum simultaneous Escorts | 1 |
| BF-109 / BF-110 / FW-190 / Me-262 Engagement | 5 / 5 / 5 / 5 |
| Engagement Countdown Mode | Any Enemy Action |
| Normal discard refill at Progress | ON |

V2 settings are independent of V1 and apply only to a fresh sortie. Fighter kill Time is separate from the existing Opportunity kill reward; each applies only to B-17 gunfire kills, never Escort kills. The Time reward removes a physical Time token from the current mission bag, advances jobs and can trigger a pending Progress checkpoint. If no Time token is in the bag, it grants nothing. Resource denomination still comes from the activating crew member. Held Resources and accumulated Time remain outside the bag; emergency refills use eligible discard only and cannot prematurely recycle Time.

Kill-Time also grants nothing when Time is already full or Progress is pending; the recorder explains this and the token stays in the bag. Opportunity rewards still apply. A between-turn Opportunity kill that fills Time opens a saved Opportunity decision window: finish any further shots, then **Continue to Progress**. This resolves the checkpoint before another activation, without an extra mission draw, enemy phase, Turn or Crew Cycle slot. Kills during an ordinary activation still wait for that activation's normal enemy phase.

**Abort Work** is available only in an active V2 sortie at normal crew selection, with no active crew action or pending Progress. It is unavailable during Opportunity, bombing and presentation resolution, and never exists as a V1 rule. Aborting costs and refunds nothing, discards all work progress, removes suppression, and leaves both workers at their current positions with their Cycle slots unchanged.

Both rulesets freeze fire groups and suppression at the beginning of each Fire phase. Injury can cancel a suppression job immediately, but a fire protected at phase start cannot acquire a retroactive roll later in that same phase. It becomes eligible in the next Fire phase.

Optional Assist assigns a healthy second worker when starting Repair, Fire Control or Medical. Both workers become busy; an unconsumed assistant slot is preserved and eventually produces the normal unavailable Turn if the job remains active. Used crew may assist without receiving another normal activation. Both share the selected safe work position and use the existing batch return rules. If either worker is injured or killed, the whole job cancels and releases its workers, extending the existing worker-incapacitation rule. Assist adds no second resource cost. These assistant edge cases are provisional interpretations, not V1 changes.

The user clarified two initially unspecified clock mappings: Crew Cycles stay fixed at ten Turns, and Escorts expire at the next Progress checkpoint. V2 launch rejects a Time-token inventory smaller than the Progress threshold, since those physical tokens cannot recycle before a checkpoint. All other listed V2 values are editable. A cycle with no available crew offers **Continue unavailable Turns**; each press processes at most one cycle so the interface cannot enter an unbounded automatic loop.

Turning **Normal bag refill at Progress** OFF retains mission/combat discard until an emergency refill. Accumulated Time always returns at Progress, even with this toggle OFF; recycling those physical Time tokens is required for the next checkpoint. Held Resources remain out of the bag. Crew Cycle Turns is displayed as fixed at ten, with the physical reason (ten crew, one slot each), preserving the prior playtest clarification.

## Scoped Dev tools and playtest telemetry

Dev tools group controls under **COMMON**, **V1 — ROUND-BASED**, and **V2 — CONTINUOUS TIME · EXPERIMENTAL**. Common controls include combat bags, Opportunity, the V1 Disrupt setting and individually editable fighter HP (unchanged defaults: BF-109 2, BF-110 2, FW-190 3, Me-262 4). V2 has separate Disrupt enable/effect controls. Every V2-only control is marked experimental. Construction settings apply to the next sortie; changing preferences or resetting one group never changes the live sortie's bags, timers or crew.

Preferences use separate localStorage records: `milk-run-dev-common-1`, `milk-run-dev-v1-1`, `milk-run-dev-v2-1`, and `milk-run-dev-chooser-1`. Legacy `milk-run-v3-dev-preferences-1` overrides are read by scope and preserved as an archive on migration. **Reset V1 Defaults** and **Reset V2 Defaults** affect only their own scope; an explicit empty scoped record prevents old values returning from the archive. **Reset All Defaults** removes the scoped records and legacy preferences without touching sortie saves. The modified-rules indicator reports Common and the active ruleset, so inactive-rule preferences cannot mark the current sortie as modified.

V2's end report adds Turns, completed Crew Cycles, Time draws, checkpoints, Turns per physical Progress, fighter actions, Engagement countdown spent, natural disengagements, jobs begun/completed, assisted jobs, altitude losses and outbound/return Time draws. Fighter action averages include every spawned fighter, including early kills and fighters still present; rotations count as actual actions even in Attack Pass Only mode, while the separate countdown average counts only eligible decrements. A fatal checkpoint counts as a checkpoint but adds no physical Progress. Time by leg means drawn Time tokens, not real-world minutes. These observations never drive rules or score.

New sorties save all instrumentation. Older V2 saves remain exact on load; new counters begin on the next command and are explicitly marked as partial history. Historical job totals or fighter lifetimes are never inferred from remaining timers.

## Ruleset architecture and persistence

`rulesets.mjs` defines explicit identities (`v1`, `v2-continuous`) and mission lengths. `continuous.mjs` owns only V2 Time, Engagement, checkpoint and Crew Cycle sequencing. `rules.mjs` dispatches according to the saved identity and supplies its shared combat/damage/work functions to that lifecycle; V1 continues through its original round handlers. No command changes an active sortie's identity.

Every fresh state stores `ruleset`. Missing identifiers on old saves and all their queued snapshots migrate to `v1`. V1 retains `rulesVersion: 3`; V2 uses `rulesVersion: 4` so a previous V1-only client rejects the new schema rather than interpreting it as round-based. V2 additionally stores `crewCycle.number/turn`, each crew member's `cycleSlotConsumed`, `time`, held `timeTokens`, `pendingProgress`, job `remainingTime`/optional `assistantId`, and fighter `engagementRemaining`. These values are restored exactly, including mid-draw and pending checkpoint snapshots; missing V2 timers, crossed schema versions or mixed rulesets are rejected rather than inferred. Existing save keys remain supported, and next-sortie Dev preferences remain separate from the active session. Starting a clean sortie from the ruleset chooser replaces the current session without manually clearing storage.

## Crew positions and station reassignment

Both V1 and V2 offer **Man Station**, **Leave Station** and **Return Home** as normal actions, with no additional resource cost. Man Station covers the eight gun stations and both cockpit seats. A healthy occupant blocks takeover; an injured or dead occupant does not. Taking over relinquishes the incapacitated occupant's assignment without moving their body. Healing never evicts a substitute or automatically reclaims a relinquished station.

Home Station, Current Station and physical work position are separate. Gun arcs follow the occupied station; rank, Engineer repair bonus and personal role abilities follow the crew member. Cockpit Control keeps the existing trained Pilot / Officer / Enlisted rules. Leave Station makes one abstract move to safe interior space, preferring clear space near the departing station; returning or manning another station takes another normal action. Crew cards and details show replacement assignments, displacement and work status.

Completed workers return to their home only when safe and unoccupied under the existing coherent batch-return rules. Otherwise they remain displaced. Cancellation and V2 Abort Work retain the work position, remove the station assignment and immediately end suppression. Abort Work retains its validated V2-only between-turn eligibility.

Saves store `crewPositionVersion: 1`, separate `homeStation` and nullable `station`, `displaced`, physical positions and active jobs in authoritative, visible and pending snapshots. Older saves use their existing assigned station as home, including historical cockpit substitutions; a full stationary footprint retains its current assignment. Working/displaced crew keep their exact physical position and become unassigned. Migration changes no clocks, config, bags or RNG.

Crew-position validation: **345/345 Milk Run Node tests pass**, including 27 new station/work-position regressions and the unchanged V1 deterministic witness. All six existing browser suites pass: baseline (six viewport sizes and full sorties), UX (18 groups), combat/economy (7), corrective (5), continuous (8), and Dev tools (6). `node src/milk-run/tests/crew-stations-browser-check.mjs` adds **10 passing groups** for both rulesets, exact reload, recovery without eviction, action-cost reassignment, replacement gun targeting and adjacent/shared work positions. Mobile checks include **320/360/390px**. There are no browser runtime or asset errors. The V2 full-sortie and token-conservation diagnostics remain green; clocks, combat settings and crisis durations are unchanged.

## V2 pass validation

The post-audit repair introduces `v2ConfigVersion: 2` independently of the existing `rulesVersion: 4` clock schema. Unmarked/version-1 active V2 saves migrate missing combat fields to explicit historical behavior: kill-Time OFF, Disrupt enabled exactly when saved `disruptOnHit` was enabled, Auto Miss, and unlimited Escorts (`v2MaxEscorts: null`). Explicitly stored combat fields are preserved. Authoritative, visible and pending snapshots receive the same migration, while stored 6/4 durations, jobs, bags, crew and RNG remain unchanged. New sorties and preference resets retain the current canonical defaults. Version-2 saves missing required combat fields are rejected instead of reconstructed from defaults.

`tests/fixtures/legacy-v2-session.json` is a frozen pre-pass engine save, including active assisted work and its pending presentation snapshots. `post-audit-regressions.test.mjs` covers its migration, the suppression-cancellation witness, all four kill-Time firing paths, full-Time conservation, between-turn shot chains, Abort Work eligibility and event-owned Disrupt presentation. The full V2 diagnostic runs twice through HOME and round-trips every command's authoritative, visible and queued snapshots.

The V1 HOME witness now includes 29 explicit `WORK_COMPLETED` recorder summaries. Before updating that count, all 374 commands were compared against the pre-pass V1 engine: complete gameplay state, RNG, action legality and every pre-existing event's snapshot timing were identical. Only the completion summaries and their event count were added; work does not resolve twice. The separate mid-Fire-phase regression verifies that cancellation no longer changes V1 RNG consumption or ignites `D3-2` from the formerly suppressed `E3-1` fire.

Post-audit repair validation: **318/318 Milk Run Node tests and 212/212 other repository Node tests pass**. All six browser suites pass: baseline, UX (18 scenario groups), combat/economy (7), corrective (5), continuous (8), and Dev tools (6), with no browser runtime or asset errors. Mobile checks cover 320/360/390px, including actual two-row layout, retained 2–3° unavailable-card tilts, saved Opportunity chains and checkpoint controls. The two deterministic V2 HOME diagnostics execute 178 commands and round-trip 1,604 authoritative, visible and queued snapshots, conserving Time and Resources after every command. The browser also completes the 44-Turn V2 Time-only diagnostic and the unchanged V1 combat witness. Time-only diagnostics test progression and persistence, not combat balance.

Run all Milk Run unit regressions with `node --test src/milk-run/tests/*.test.mjs`. Verified after the UI/dev-tools pass: **275/275 tests pass**, retaining all 233 tests from the engine pass (including the 168 original V1 regressions) and adding 42 scoped-preference, telemetry, tuning, UI and presentation checks. The historical 19-round default-rules combat witness retains its exact decisions and metrics; only its default-config assertion excludes the newly added preference/V2 keys. Preference-storage assertions now follow the intentional split into independent records.

Run `node src/milk-run/tests/continuous-browser-check.mjs` for the new ruleset chooser, Time checkpoint ordering, exact reload, Assist, Engagement display and clean V1 restart. It also verifies that invalid next-sortie V2 preferences cannot corrupt or block an active V1 save. Checks cover desktop, tablet, 320px, 360px and 390px touch layouts, with screenshots/results in `.checks/continuous/`. The existing `browser-check.mjs`, `ux-browser-check.mjs`, `rules-browser-check.mjs` and `corrective-browser-check.mjs` continue to cover V1; their Dev launch steps now explicitly choose V1 in the new picker.

Run `node src/milk-run/tests/dev-tools-browser-check.mjs` for all V2 settings through the actual form, scoped resets and reload, compact six-value HUD, Time thresholds up to 40, live assisted-job countdown, distinct break-off before removal, inspectable checkpoint beats, and a complete 8/3 V2 diagnostic sortie to HOME with telemetry. Artifacts are in `.checks/dev-tools/`. All six browser scripts passed; combined widths tested were **320, 360, 390, 430, 768 and 1440px**. The V2-specific checks cover 320/360/390/768/1440px. The V2 HOME diagnostic uses a Time-only bag to isolate progression; it is not a claim about default-rules survival or balance. The V1 browser suite also replays the unchanged default-rules combat witness to HOME.

A separate seeded audit exercised 1,189 commands across 15 sorties with crisis work, Assist, casualties and checkpoints. Physical mission-token totals were conserved after every command and 28,667 presentation snapshots round-tripped exactly through JSON save/load. This checks engine and persistence behavior, not playtest balance.

The historical V1 architecture and validation notes below remain useful background. Any references there to rounds apply to V1.

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
4. Spend banked **Opportunity** between completed crew activations or after an action before its enemy phase. Choose a healthy gunner who completed their normal activation, is still at a usable station, and has a fighter in arc. Confirm one Basic pull; canceling costs nothing. After the action window, choose **Continue to Enemy Phase**. Then watch ordered enemy resolution. **Step / Manual** waits for the next major beat; **Normal** gives draws, rolls and consequences readable time; **Fast** shortens the same sequence. Skip preserves the full event record.
5. After ten crew time slots, finish the round: fighters clear, independent altitude checks resolve, and the mission advances if airborne.

The flight recorder groups human-readable summaries by category with expandable semantic event details. Fire Spread summaries include the die and direction or no-spread result; blocked spread, exact repaired/extinguished cells, Medical patient, cancellation reason, station changes and unavailable-slot draws are visible without opening raw events. Board squares, crew and fighters can be inspected or selected by tapping; no critical interaction requires hover. A square opens its derived Cell History, separating rolled attack location from structural damage, Fire, repairs and crew consequences. The optional PLAYTEST DIAGNOSTICS hit-location overlay starts off and can independently show aircraft and empty-space roll counts; it never changes the board's damage colors. On mobile the status header and bottom controls remain accessible, ten crew form a compact two-row rack, and detailed actions/settings open in sheets. Selecting a gunner previews the legal sectors and fighters without drawing or changing game state.

V2 Dev tools include **Opportunity Provokes Enemy Phase**, default OFF. When enabled, closing a between-turn Opportunity chain resolves one enemy phase before the next crew activation. Chains still resolve only one phase; normal post-action Opportunity continues to use its existing activation enemy phase. A pending Progress checkpoint keeps its established ordering and takes precedence. V1 ignores this V2-only experiment.

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
- Minimal role actions: Pilot **Direct Fire** spends one Officer resource and immediately orders one Basic Fire shot from another healthy crew member operating a usable gun station. The gunner may be tapped; their activation state does not change. This consumes the Pilot's normal action, draws no mission token, and spends or grants no Opportunity by itself. Copilot converts resources using the physical-token rules below, Navigator turns a fighter 90° away, Radio Operator declares Intercept or pays for Escort, and Engineer repairs an extra connected square.
- **Opportunity** is a separate shared currency: start with 1, hold at most 3, and gain 1 when B-17 gunfire destroys a fighter, if enabled. Escort kills do not earn it. It persists between rounds and never enters either bag. After a legal shooter and target are selected and the shot is confirmed, spend one Opportunity for exactly one Basic Fire pull. This creates no activation, mission draw, time slot or extra enemy phase. An Opportunity kill can earn the next Opportunity up to the cap; there is no chain limit.
- Successful B-17 gunfire damage marks a surviving fighter **Disrupted** when enabled. In V2, Auto Miss replaces its next attack with a miss; 4+ to Hit rolls 1–3 Off Target, 4–5 Hit, or 6 Critical. A rotation still happens normally, and Disrupt clears after that next enemy action. Escort damage never applies Disrupt.
- Escort occupies one random quadrant until the round ends in V1 or the next Progress checkpoint in V2, and deals one damage to fighters entering it after attacking. V2 limits the number of simultaneous Escorts to one by default.
- Independent control, structure and engine altitude checks at round end; losses stack. Ground means destruction. A linear outbound/target/return/HOME mission supplies a complete sortie.
- In-memory telemetry and an end-of-sortie summary cover elapsed time, rounds, draws, fighters, Flak, attacks, hits/criticals, aircraft hits, fire, repairs, engines, compromise, altitude loss by cause, casualties, resource gains/spending and Opportunity gains/spending.

The post-activation sequence is **Mission Draw → Crew Action → optional Opportunity window → Enemy Phase**. `used` reserves a crew time slot at activation; separate `activationCompleted` becomes true only after the normal action resolves. The actor can then qualify for Opportunity if still healthy and operating a gun. Banked Opportunity is also available in `select`, between crew activations, when a completed gunner and legal target exist. The pre-enemy window remains open through repeated shots until the player chooses Continue, even if the last shot removed every target. Continue runs the pending enemy phase exactly once. Spending is blocked during target selection, unresolved presentation, enemy resolution, and other decision sequences. Crew without an action still consume their existing automatic time slots and enemy phases. Completion flags reset at Round Start.

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

Crisis work separates the damaged/fire target from the worker's physical position. Repair, Fire Control and Medical prefer a non-burning internal C/D lane on the primary target's numbered board row. When a fuselage target has no safe interior position in its row, the immediately adjacent numbered rows above and below become eligible. Wing work still requires the same-row interior. The player chooses among highlighted positions after selecting the work squares; a command without an explicit work position chooses deterministically. Safe work positions may share a crew footprint, but never Fire. The renderer bounds worker circles, selection strokes and status badges inside that footprint; dense stacks use smaller numbered markers. Wing targets retain their own work outline while the worker stays inside. There is no pathfinding or movement-distance cost. Work completes before the next Fire Phase, followed by the coherent home-return batch described above. Substitution does not move an injured original occupant; recovery does not reclaim an occupied station.

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

Crew rank, tags, role `abilities` arrays and station gun arcs live in `CREW_DEFS`. Abilities use crew identity; arcs use the occupied station identity. `crew-position.mjs` owns assignment metadata and its migration. Enemy HP, deck count keys and reserved `abilities` arrays live in `ENEMY_DEFS`. Experimental settings belong in `DEFAULT_CONFIG` and `CONFIG_FIELDS`. `bombing.mjs` intentionally contains only the minimum target rule, keeping later Bombardier-station requirements separate from the general round engine.

## Deferred rules and decisions

The baseline deliberately excludes Event cards, Locked In, Desperation, fighter exhaustion/action counters, Fate, destroyed gun stations, aircraft-specific critical abilities, instant-kill criticals, full interior pathfinding, generalized station swapping, campaign/career/XP systems, bailing out, a landing minigame, branching/hidden mission tiles, scouting and complex Bombardier station requirements. Persistence of fighters is available only as an experimental setting; baseline fighters clear each round.

Remaining design decisions include the original physical mission length, initial altitude, Flak deck count, crisis costs and exact work timing, whether healthy crew should block first fire spread or move, whether engine restart should vary by skill, unavailable-slot pressure, bombing success consequences, and final resource/bag/enemy balance. Aircraft/station geometry now follows the supplied authoritative mapping. Playtest observations should include the exported seed, configuration and log so a specific sortie can be reproduced.

Burst, Disrupted and Opportunity now have the explicit rules described above. Pilot Direct Fire immediately fires one Basic pull through another operating gun station. Opportunity is not stamina, and no fighter-persistence, exhaustion or additional combat-frequency system has been added.

## Validation

Files changed in the post-audit corrective pass are all inside this project:

- Rules and gun arcs: `board.mjs`, `rules.mjs`, `targeting.mjs`, `main.mjs`.
- Focused regressions: `tests/combat-opportunity-pass.test.mjs` and updated combat, rules, dev-preference, targeting, and sortie witness tests.
- Sortie replay and documentation: `tests/generate-economy-witness.mjs`, `tests/fixtures/combat-economy-home-witness.json`, and this README. The separate baseline witness remains an unchanged historical artifact.

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

Verified after the combat rules pass: **168/168 Milk Run Node tests pass**. Coverage includes every gun arc, both nose guns at Fore/Low, the two Disrupt expiry paths, Escort exclusions, global Opportunity windows, cancel-before-confirm, chained gunfire kills, Pilot Direct Fire, local dev preferences, and the existing economy and sortie rules.

Chromium checks run at **1440×1000, 768×1024, 320×740, 360×800, 390×844 and 430×932**. Every viewport checks the 144 exact quarters, ten unique crew tokens and four non-structural engine indicators without page overflow. Phone layouts use two rows of five crew and viewport-sized action sheets. Real touch checks cover crew preview and activation, individual aircraft in shared sectors, Basic/Advanced/Opportunity fire, board Repair/Fire Control targets, internal worker positions and direct Medical targeting. Presentation checks cover visible token faces, separate critical-hit consequences, reticle focus, attack misses versus persistent empty-air X markers, escort placement/interception/expiry and independent altitude rolls. The focused economy browser suite checks a visible Burst ×2, Disrupted board/card markers and a cancelled attack, three chained Opportunity kills, Direct Fire, both conversions and an unavailable reverse exchange, preference persistence/reset, and an all-zero combat inventory error.

The corrective browser suite adds actual touch regressions at desktop and **320/360/390px**: Radio → Preview board → Intercept → Activate, shared checkbox state in both directions, action completion before Opportunity, window reload, Pilot Direct Fire using another gun without generating Opportunity, reachable Medical patients, bounded worker rendering and all crew statuses. Crew name/status/control labels are now 10px in the mobile rack with 11px status icons; cards remain two rows of five at approximately 80px height. Work deadlines and full role details remain in the tap-opened sheet. Its artifacts are under `.checks/corrective/` and it uses debugging port 9340.

The sortie replay exercises `tests/fixtures/combat-economy-home-witness.json`, seed `combat-economy-0`, regenerated under the current rules. It completes 19 rounds and 190 mission draws, reaches HOME at altitude 5, and checks physical-resource conservation after every command. The bounded generator in `tests/generate-economy-witness.mjs` uses visible game state without reading future RNG results; its seed and decision sequence are retained for reproduction.

The previous `tests/fixtures/baseline-home-witness.json` remains unchanged as a historical artifact. Its three retired `orderShot` commands and six conversions use the previous rules, so it is deliberately not presented as a current-rules HOME witness. Tests preserve its old bag/config/RNG values during migration, replay its compatible opening, and verify that the retired action is rejected transactionally. No legacy rules engine was added to keep that replay working.

Visual checks supplement the rules suite. Resource-only diagnostic sorties isolate interface progression, while the default-rules witness exercises combat and crisis work. These results establish functional completion, not final balance or a survival-probability claim. Responsive testing uses Chromium device emulation; physical phones have not been tested.
