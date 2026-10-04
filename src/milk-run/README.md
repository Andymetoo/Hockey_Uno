# Milk Run — V1 and experimental V2

New sorties offer **V1 — Round-Based** (the current/classic rules) or **V2 — Continuous Time — EXPERIMENTAL**. The `v3` names in old storage keys and historical documentation are implementation versions, not the new player-facing ruleset. V1 keeps its 14/5 mission, N+2 work, ten-slot rounds, fighter clearing, and Round Start refill/fire behavior.

## V2 continuous-time playtest

The UI/dev-tools pass keeps the active ruleset visible and shows five compact V2 metrics: Crew Cycle slots, Time pips/count, outbound/return Progress, altitude and resources, with Opportunity presented separately beside the board and action dock. Active jobs identify their countdown and both workers when assisted. Enemy queue cards show Engagement; a separate **BREAKS OFF** beat holds the zero-Engagement fighter on screen before departure, with no destruction styling or kill reward.

Progress uses the existing resolution queue for work-completion acknowledgement, Fire Spread, aircraft condition, independent altitude checks, movement and bag refill. Completed jobs still resolve on the triggering Time draw before the crew action; the checkpoint acknowledges that work before hazards rather than completing it twice. Manual playback can inspect every checkpoint stage, including an undamaged aircraft's safe checks.

There are no V2 rounds. Choose and activate a crew member, draw a mission token, take an action (or Continue), resolve any Opportunity shots, and resolve the enemy queue. Three clocks operate independently:

- **Crew Cycle:** ten Turns, one normal activation slot per crew member. Completing the cycle attempts to claim one physical Time token by default; Playtest Settings can disable this reward. Injured, dead and working crew still consume their slots with mission draws and enemy pressure under the Full Pressure default. Slots are separate from availability: a released worker can act immediately if their slot is unconsumed, otherwise they wait for the next cycle.
- **Time / Progress:** a Time draw adds one Time and reduces every already-active job by one. Zero-Time jobs complete immediately, including batch station returns. Jobs started afterward wait for future draws. At 4/4 Time, a checkpoint waits until the current action, Opportunity window and enemy phase finish. It spreads unsuppressed fire, recalculates aircraft condition, checks Control/Structure/Engines independently, and advances one Progress if airborne. Then Time resets, its held tokens return, and both bags refill from discard. Crew readiness and surviving fighters are unchanged.
- **Engagement:** each fighter has its own remaining enemy actions. The default counts attacks, rotations and Disrupted actions. Attack Pass Only counts attacks and Disrupted flybys but not pure rotations. A fighter completes its action before departing at zero. Excess Enemy draws still produce immediate Flak at the three-fighter cap.

| V2 setting | Default |
| --- | --- |
| Crew Cycle Turns | 10 (fixed, per playtest clarification) |
| Mission Enemy / Resource / Time tokens | 20 / 12 / 10 |
| Time Required Per Progress | 4 |
| Navigator Unmanned Time Penalty | 0; suggested experiment: 1 |
| Crew Cycle Refresh Grants Time | ON |
| Unavailable Crew Pressure | Full Pressure; alternatives Draw Only and Compressed Pressure |
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

When Time is full or Progress pending, a qualifying kill may bank **one overflow Time**. It removes a physical Time token from the mission bag, stores it in `overflowTimeTokens`, immediately advances active jobs once, and shows **BONUS TIME BANKED — carries into next Progress**. The active HUD never displays above its current threshold. Further kills cannot add overflow while that slot is occupied; missing bag Time creates no reward. Opportunity remains independent. At the checkpoint, ordinary active Time tokens return to the bag; the overflow token stays out and becomes 1 Time toward the next threshold without advancing work again. All fighter types use the same one-Opportunity/one-eligible-Time rewards.

A between-turn Opportunity kill that fills Time opens a saved Opportunity decision window: finish any further shots, then **Continue to Progress**. This resolves the checkpoint before another activation, without an extra mission draw, enemy phase, Turn or Crew Cycle slot. Kills during an ordinary activation wait for that activation's normal enemy phase. If **Crew Cycle Refresh Grants Time** is ON, completing the ten-slot cycle claims exactly one available physical Time using the same active/overflow rules; an empty Time supply creates nothing.

Fresh standalone V2 and Campaign sorties now default this reward ON, and **Reset V2** restores ON. Explicit saved preferences can still disable it. Existing sortie snapshots retain their stored ON/OFF value; historical snapshots missing this field migrate to OFF in resolved, visible and queued state. A successful reward presents **CREW CYCLE COMPLETE · +1 TIME**, or **+1 TIME BANKED** when full/pending. Work advances exactly once when the physical token is acquired, never again when overflow carries. Occupied overflow or no Time in the bag grants nothing; discard is not raided for a reward.

**Navigator Unmanned Time Penalty** dynamically adds its integer value to the base requirement while the navigation function is unavailable. With base 4 and penalty 1 the HUD reads **TIME 3 / 5 — NAVIGATION UNMANNED**. A healthy, seated actual Navigator or Officer substitute qualifies, including Used/tapped crew. Injury, death, displacement, fire or working elsewhere removes the function; an Enlisted substitute does not supply it. The default penalty remains zero. Launch validation requires sufficient physical Time for the largest configured requirement.

Unavailable-slot pressure modes preserve every slot's mission draw and immediate Flak under the existing unavailable-draw setting. **Full Pressure** resolves its normal active-fighter phase after every unavailable slot. **Draw Only** skips that normal fighter phase while retaining Resource waste, Time and fighter spawns. **Compressed Pressure** defers ordinary fighter actions across consecutive unavailable slots, then runs one combined normal phase at the block boundary before player control returns; spawned fighters join that queue. Time and checkpoints still resolve during the block. The sortie export records the selected mode in the configuration and telemetry report.

**Abort Work** is available only in an active V2 sortie at normal crew selection, with no active crew action or pending Progress. It is unavailable during Opportunity, bombing and presentation resolution, and never exists as a V1 rule. Aborting costs and refunds nothing, discards all work progress, removes suppression, and leaves both workers at their current positions with their Cycle slots unchanged.

Both rulesets freeze fire groups and suppression at the beginning of each Fire phase. Injury can cancel a suppression job immediately, but a fire protected at phase start cannot acquire a retroactive roll later in that same phase. It becomes eligible in the next Fire phase.

**Assist Work** is an explicit V2 normal crew action, also discoverable from active jobs. Activate an eligible healthy crew member, choose an existing unassisted Repair, Fire Control or Medical job, and select a legal safe work position. It consumes the assistant's normal action and costs no further resource. Both identities stay assigned and unavailable until completion/cancellation. Joining sets `remainingTime = min(current remainingTime, configured assisted duration)`: at the default 2, 4→2, 3→2, 2→2 and 1→1. This is saved exactly. Injury or death of either worker cancels the shared job, ends Fire Control suppression and retains physical work positions rather than teleporting anyone.

The earlier optional **Assist at job creation** control remains available. Its established semantics are preserved: selecting a healthy second worker immediately creates assisted-duration work without spending a separate activation, preserves an unused assistant slot, and can use a previously Used healthy worker. The new **Assist Work** action is the practical route for joining work that has already begun, and always consumes the joining crew member's own normal action. Both forms add no resource cost and use existing batch home-return rules.

Crew Cycles stay fixed at ten Turns, and Escorts expire at the next Progress checkpoint. All other listed V2 values are editable. A cycle with no available crew offers **Continue unavailable Turns**; each press processes at most one cycle so the interface cannot enter an unbounded automatic loop.

Turning **Normal bag refill at Progress** OFF retains mission/combat discard until an emergency refill. Accumulated Time always returns at Progress, even with this toggle OFF; recycling those physical Time tokens is required for the next checkpoint. Held Resources remain out of the bag. Crew Cycle Turns is displayed as fixed at ten, with the physical reason (ten crew, one slot each), preserving the prior playtest clarification.

## V2 Bomb Run

Targets are authored in `bombing-targets.mjs`, with display name, three inclusive acceptable ranges, score thresholds and reserved `modifiers` for future additions. Target-specific travel lengths and bag changes are not implemented. Select a target for a fresh standalone or campaign V2 sortie; Bremen is the default. These targets are gameplay abstractions, not historical simulation claims.

| Target | Course | Drift | Release | Destroyed | Heavy | Partial | Minimal | Miss |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wilhelmshaven — Easy | 2–5 | 2–5 | 3–5 | 7+ | 5+ | 3+ | 1+ | 0 |
| Bremen — Standard | 3–4 | 2–4 | 4–5 | 8+ | 6+ | 4+ | 1+ | 0 |
| Schweinfurt — Hard | 4 | 2–3 | 5 | 9 | 7+ | 5+ | 2+ | 0–1 |

At TARGET, the Bombardier function must be manned by the healthy actual Bombardier or another healthy Officer. An Enlisted occupant can use the station's gun but cannot drop bombs. Used/tapped is still manned; injury, death, displacement, fire or work elsewhere is not. At one Progress before TARGET, a missing function shows **BOMBARDIER STATION UNMANNED — NO DROP POSSIBLE AT TARGET**. If still unavailable at TARGET, there are no dice: **NO DROP** explains the cause and the aircraft turns for HOME.

A qualified operator rolls four d6 once. Tap/click a die and then Course, Drift or Release to place it. Place any three distinct dice; the fourth stays unused. Rearrange freely until **Commit Bomb Run**. A value in its target range earns 3 points; distance 1 from the nearest boundary earns 2, distance 2 earns 1, and distance 3+ earns 0. The board shows each slot's score, total out of 9 and target outcome. Commit locks the result and begins the return leg.

The healthy actual Bombardier physically occupying that station gets one free reroll. Officer substitutes get no free reroll. Spend 1 Officer resource for each additional single-die reroll; the spent physical resource goes to mission discard. Any of the four dice can be rerolled, including a placed die, and rearrangement remains available afterward. There is no direct +1/−1 adjustment.

`mission.targetId` and `mission.bombRun` persist the target definition snapshot, all four dice, placement indexes, unused index, operator, free reroll availability/use, Officer rerolls spent, committed score, slot scores, status and outcome. Mid-run save/resume restores the exact dice and placement without rerolling. V1 retains its original one-die `bombingMin` check and round-based timing.

### Disposable Bomb Run tester

Open **Playtest settings → Test Bomb Run** for **BOMB RUN TEST — RESULTS ARE NOT SAVED**. It uses the production dice/placement interface, command dispatcher, authored target definitions, scoring, free actual-Bombardier reroll, Officer payments, Commit and final result presentation. A fresh healthy Bombardier occupies their real station; the tester owns three disposable Officer resources. Target options derive from the production target catalog. **Test Again** keeps the target with a new dice seed and restored resources/rerolls; **New Random Target** samples the catalog again (it may select the same target). Close, Escape and backdrop dismissal discard the session; reload never restores it.

`bomb-run-test.mjs` accepts no live game, Campaign, preferences, queue or persistence references. It creates a fresh production state and a temporary crypto UUID seed, with independent target-selection and per-test dice PRNG state. `bomb-run-test-view.mjs` owns its modal rendering and intercepts its production control events before they reach the active game's document handlers. It never calls the host renderer, autosave, Campaign finalization or export. The host bridge only suspends a presentation timer and resumes it on close when appropriate; serialized queue flags and snapshots remain unchanged. Browser regressions assert full live session/Campaign/history/preferences/storage equality, zero storage writes, and identical next production random commands while another real Bomb Run is active.

## Story Mode / narrative director

**Story Mode** is a V2 Playtest setting, ON for new standalone V2 and Campaign sorties. Reset V2 restores ON. Like other gameplay settings it applies to the next flight; an active flight retains its saved setting. OFF follows the baseline tactical rules without Story evaluation, conditions or extra random draws. V1 has no Story state. Old in-progress saves missing either the flag or director load with Story OFF, in resolved, visible and queued snapshots; migration does not invent situations or reroll anything.

The director turns existing damage, crew availability and route decisions into developing situations. It does not introduce formation, morale, fatigue, fuel, oxygen or stress meters. A damaged engine can be pushed, shut down, or assigned an ordinary 2-Time Repair job. Cloud changes both sides' visibility, and may later obscure the same target. A friendly bomber helped earlier may pass your call sign to an Escort patrol. Medical supplies and checked ammunition are useful finds, not another punishment.

`story-content.mjs` contains 13 thread families with 44 authored stages and 31 choices: weather front, rough engine, damaged oxygen line, uncertain landmarks, reported flak corridor, fighter hunters, broken radio aerial, medical locker, wounded friendly bomber, ammunition locker, corrected target markers, homeward sea crossing, and bomb-door hydraulic damage. Eligibility examines actual damage, running engines, wounded crew, specialists, radio, fighters, leg, target distance and prior conditions. Threads bind the specific aircraft square/engine when selected. The same distinctive thread occurs at most once per sortie; the previous Campaign flight's families are deprioritized when another eligible family exists.

`story.mjs` owns serialized stages, choices, delayed branches, history facts and pacing. New situations normally leave at least one quiet Progress boundary after a decision. A sortie has a five-new-prompt budget (existing threads can still need their target follow-up); due follow-ups take priority over starting unrelated stories. A saved delayed branch is sampled when scheduled and waits at least one future checkpoint. No follow-up dialog chains directly from its choice. Automatic acknowledgements use the normal recorder/presentation queue.

Evaluation occurs in the dispatcher **after** the complete Progress checkpoint and any compressed unavailable-crew enemy phase. The checkpoint only sets a boundary marker; automatic unavailable-slot processing stops there. All work completion, Fire Spread, condition/altitude checks, movement, Time return, refill and Escort departure precede evaluation. A decision sets `phase: 'story'`; the UI waits for the presentation queue to drain before opening it. Crew actions, Opportunity, enemy attacks, Flak and Bomb Run interactions cannot open a Story prompt. At TARGET, Story runs before the Bomb Run's initial dice; resolving the decision starts the ordinary Bomb Run exactly once.

The compact **Conditions** control below the main HUD opens active effects, their cause, how they end and any pending consequence. Positive supplies appear alongside hazards. Temporary tokens show live counts in bag and discard. A marked aircraft square has a small `!` and an inspection link. Recent resolutions remain available. A Story dialog can be closed to inspect the aircraft; the decision stays saved, tactical commands stay blocked, and **Resolve situation** reopens it. Buttons and scrollable sheets support narrow touch screens.

`story-effects.mjs` supplies composable adapters for:

- A next-Progress Time requirement adjustment, bounded by the physical Time supply; existing physical-Time claims and work advancement.
- Normal/Disrupted enemy hit thresholds, Flak salvo size and Engagement for newly arriving fighters.
- Owned temporary Hit/Miss/Burst combat tokens and Enemy mission-pressure tokens.
- Next Medical/Repair/Fire Control/Advanced Fire/Escort free, action resource adjustments, work-duration adjustments, and temporary radio/Escort blocking.
- Ordinary Repair jobs with safe work positions, worker availability, assistance, cancellation, Time countdown and normal home returns; marked-cell Repair and altitude resolution triggers.
- Existing-cell damage, engine shutdown and an explicit altitude-for-safety descent.
- Bomb Run accepted-range adjustments and Officer reroll blocking; the real Bombardier's free reroll remains available.

Tokens use unique `Story:<condition uid>:<index>:<face>` identities. A draw resolves their normal face but moves the original identity into discard; both refill paths preserve it. Expiration removes only that condition's tagged tokens from bag and discard. Configured/default tokens are untouched. Temporary Resource and Time injection is rejected because those faces enter fungible held pools. A Story shortcut instead claims an existing Time token using normal active/overflow rules, advancing jobs once and never raiding discard or manufacturing Time. No base-token subtraction, temporary fighter HP, fuel accounting or replacement Bomb Run game is implemented.

Story randomness uses its own seeded, serialized stream inside the sortie. Tactical RNG is unchanged by Story selection; subsequent tactical effects naturally change the flight. Pending choices, chosen future branches, bindings, conditions, jobs and owned tokens survive autosave and Campaign backup/import exactly. Current schemas validate Story state before accepting imports. Turn Back cancels target-only conditions/follow-ups while existing physical damage, jobs and relevant return problems remain. HOME or aircraft loss closes threads and removes temporary tokens before finalization. Dev Discard continues to release the reservation without writing any flight history.

Campaign records copy structured Story facts and encountered thread IDs, alongside existing bombing and personnel outcomes. The service record can therefore recall the cloud entered earlier, engine gamble, actual bombing outcome, recorded KIA and return/loss. History supplies no XP, upgrades or tactical bonuses.

## History-only campaign

The **Campaign Hangar** offers New Campaign, multiple surviving aircraft, commissioning, explicit pre-sortie selection, aircraft service records, editable personnel cards and sortie history. Standalone V1 and V2 remain available. Campaign sorties use V2 and the same current rules/preferences as standalone V2: history never grants XP, upgrades, stats, easier dice, extra resources or combat advantages.

A new campaign creates one aircraft and ten persistent crew identities assigned to the ten roles. Aircraft name/serial and crew names are editable. **Commission New Aircraft** is available even with surviving aircraft, or during an active flight. Enter a name (default `Untitled B-17 N`) and optional serial/call sign, then commission it. This adds a new stable identity without changing another plane or an active reservation.

Before every new flight, open Campaign, choose **Select for next sortie** on any Available aircraft, choose seed/target, then **Fly selected aircraft**. Selection is required even for a one-plane Hangar; no last-used plane is silently selected. The selected aircraft ID and ten role→crew IDs are reserved together and survive save/resume and backup restore exactly. Only one campaign sortie can be active per campaign, and the browser still has one active sortie autosave.

Available aircraft are sorted by most recently flown. Aircraft on sortie appear separately and cannot launch again. Lost aircraft appear in a separate memorial sorted by loss sortie, with no selection or rename controls. **View Service Record** shows returned/aborted flights, kills, bombing target/dice/score/outcome, recorded crew KIA aboard, crew identities with missions/kills aboard, and linked sortie histories. Loss records show the authoritative reason and final altitude, compromised sections, engines and hits when recorded. Personnel records link back to all aircraft served aboard, including the aircraft on which a crew member died. Later KIA remains visible in earlier aircraft relationships.

After aircraft loss, finalization automatically opens its Campaign Hangar. There is **no automatic aircraft replacement**. The player chooses another surviving plane or commissions a new identity; when none remain, the Hangar prominently offers commissioning. A returned plane becomes Available again. KIA personnel remain permanently archived and receive new replacement identities at the next launch; survivors retain accumulated records. The current shared ten-role roster flies whichever aircraft is selected. Full personnel reassignment/role-changing UI is deliberately deferred; aircraft never own copied personnel objects, so future assignment work can use the same independent IDs.

Every fresh flight uses mechanically healthy crew and a repaired aircraft. Wounds, damage, kills and losses remain memories, not modifiers. Commissioning grants no mechanical benefit. Aircraft deletion/retirement and persistent per-aircraft crew assignments are not part of this pass.

**TURN BACK** is a free confirmed strategic decision during outbound normal between-turn selection, or at TARGET before Commit. It marks the objective ABORTED, reverses the route immediately and preserves fighters, damage, fires, jobs, Time/overflow, resources, escorts, RNG and action slots. Emergency return distance is `max(1, min(configured V2 return length, floor(completed outbound Progress / 2)))`. With the default 8/3 route, outbound 1/2/3 → 1 Progress home, 4/5 → 2, and 6/7/8 → 3. Even an abort at position 0 requires one Progress; it never teleports home. `mission.position` counts completed physical Progress and is retained; `abortProgress` freezes the reversal point and `emergencyReturnLength` freezes the new return distance. Confirmation states the exact emergency distance, and the rebuilt flight plan explicitly reads **ABORTED — N PROGRESS TO HOME · EMERGENCY ROUTE**. The aircraft must survive that distance. Turn Back is unavailable during action/Opportunity/pending checkpoint, after a drop, in standalone play or on the return leg. Campaign results distinguish **ABORTED — AIRCRAFT RETURNED** and **ABORTED — AIRCRAFT LOST**. Kills/wounds count; provisional bombing dice earn no bombing credit. Already-aborted older saves without the new distance field retain their existing route; outbound saves use the new rule when Turn Back is confirmed.

**Discard Active Campaign Sortie (DEV)** appears only in Playtest settings and requires a destructive confirmation with Cancel / Discard Sortie. It means the unfinished flight never enters service history: no sortie row, Abort, kills, wounds/KIA, bombing result, damage/loss or replacement identities are credited. It releases only the validated current reservation and removes the matching active autosave, disposes its pending presentation queue and returns to Hangar. A fresh Hangar placeholder does not autosave until a new flight begins, so ordinary UI renders cannot recreate the discarded linkage. With no active reservation the button is disabled; ended/finalized flights cannot be rolled back.

Campaign aircraft availability is derived from loss history plus the active reservation; crew availability uses the persistent role roster. Combat health, damage and stats do not enter the Campaign store until finalization. Discard therefore only clears `activeSortie`, without rewriting aircraft/crew, roster, service history, stats or the last-selected aircraft reference. Crew replacements created at launch for **earlier finalized KIA** remain available identities; prior dead personnel remain archived. Discard creates no aircraft or crew. This preserves renames and commissioned aircraft added while a flight was active. The same living aircraft and roster can launch immediately with a new sortie ID. Store/export validation remains unchanged.

The two-key discard validates storage identity and history before writing and restores both previous keys if either write fails. It preserves preferences and unrelated standalone autosaves. Valid older active reservations, including history-only reservations with no autosave, can be released without a migration. Ambiguous/corrupt autosaves, mismatched identities or changed stored history fail clearly without writes. Broad legacy-save repair is deliberately deferred.

Campaign persistence is separate from active sortie autosave and all preferences:

| Record | Schema/storage |
| --- | --- |
| Campaign store | localStorage `milk-run-campaigns-1` (unchanged key); `kind: milk-run-campaign-store`, **version: 2**, active campaign ID and campaign array |
| Campaign | Stable ID/name/creation date, `currentAircraftId` retained as last flown reference only, independent role→personnel roster, complete aircraft/crew/sortie arrays, active sortie reservation, recomputed totals |
| Aircraft | Stable ID, editable name/serial, commissioning date, flown/returned/aborted counts, fighter kills, bombing history, damage/final condition, permanent loss flag and mission. Status derives from loss plus active reservation: Available / Currently on sortie / Lost |
| Crew | Stable ID, editable name, role/home station, flown/kills/wounds, jobs by kind, KIA sortie and aircraft IDs, compact personnel log including aircraft ID |
| Sortie | Stable campaign/aircraft/sortie IDs and ten role→crew IDs, number/date/seed, target and dice/placement/score/outcome, independent `objectiveResult` (`achieved`, `failed`, `aborted`) and `aircraftSurvived`, assigned crew outcomes, fighter totals/types, Progress/length/altitude/sections/engines, config and telemetry snapshot |
| Active identity | `state.campaign = { campaignId, sortieId, sortieNumber, aircraftId, crewIds, startedAt }`; no mechanical state override |
| Portable backup | `kind: milk-run-campaign-backup`, `version: 1`, `store` plus the matching one `activeSession`, if present |

Campaign Overview distinguishes aircraft commissioned/available/on sortie/lost; personnel identities/living/KIA; sorties; objectives achieved/failed; aborted missions; aircraft returned; kills; and bombing outcomes/score. A committed Destroyed/Heavy/Partial/Minimal result achieves the objective independently of returning HOME. Miss, No Drop or loss before a drop fails the objective. Turn Back is a separate aborted result. A successful objective followed by aircraft loss still counts as achieved. Bombing score/outcome survives loss. The legacy `completed`/`completedMissions` fields remain available for compatibility and retain their old returned-with-drop meaning (including Miss); the UI does not label or use them as objective success. Fighter kills use structured `FIGHTER_DESTROYED.crewId` and fighter type; no owner is inferred from prose. Shared completed jobs credit both workers where their IDs are recorded.

Version-1 stores and portable backups are validated before migration. Migration retains every aircraft, crew and sortie ID, historical result, Bomb Run/Turn Back record, automatic replacement aircraft and active assignment/session. It adds finalized campaign/crew links, personnel aircraft links, death aircraft and objective dimensions from existing structured records; it never allocates an identity or replays a sortie. Loading migrates in memory; the next successful save writes version 2 under the same key. Invalid or unknown-version data remains untouched. The backup envelope remains version 1 and embeds the versioned store. `tests/fixtures/campaign-v1-backup.json` captures the pre-Hangar schema with a returned Miss, abort/loss/KIA and an active automatically created replacement.

`campaign.mjs` validates identities, references, aggregate totals and loss histories. Each reserved `sortieId` finalizes once; reloading/importing an ended sortie cannot credit it again. History keeps compact snapshots, not a giant Flight Recorder log in every sortie. `campaign-session.mjs` exports/imports a portable backup with the single active autosave (including its queue/log), checks every snapshot's campaign identity, validates before writing and rolls back a failed two-key import. The UI confirms replacement on import. History-only store JSON is also accepted; an unfinished reservation without its matching active autosave is identified explicitly and requires its complete backup to resume. Unknown versions and corrupt records are rejected while preserving stored originals. No backend/account is used.

## Shared damage and presentation changes

A successful direct enemy Critical Hit now applies **two aircraft steps and two crew steps** in both V1 and V2. A healthy crew member on the impacted occupied square goes Healthy→Injured→Dead; an injured member dies; dead remains dead. This does not alter Fire Spread's separate once-per-phase crew-blocking rule. A strong **CRITICAL HIT** beat appears before location resolution and the recorder identifies the Critical result.

Crew retain their immediate unavailable-card tilt, with text/icons as well as color: Working mustard/yellow, Injured muted salmon, Being Treated a distinct medical treatment, Dead charcoal and Displaced blue-gray. Combat token centers use clear **HIT**, **×2** and **MISS**; Burst has a darker stronger face. Paused bottom presentation controls include **▶ Play** immediately beside Skip.

The end panel and recorder prominently distinguish **AIRCRAFT LOST**, **RETURNED HOME** and campaign abort results. They report the authoritative structural/altitude/other loss cause, HOME distance, and bombing/no-drop outcome. `results.mjs` owns this summary; it does not decide survival.

## Scoped Dev tools and playtest telemetry

Dev tools group controls under **COMMON**, **V1 — ROUND-BASED**, and **V2 — CONTINUOUS TIME · EXPERIMENTAL**. Common controls include combat bags, Opportunity, the V1 Disrupt setting and individually editable fighter HP (unchanged defaults: BF-109 2, BF-110 2, FW-190 3, Me-262 4). V2 has separate Disrupt enable/effect controls. Every V2-only control is marked experimental. Construction settings apply to the next sortie; changing preferences or resetting one group never changes the live sortie's bags, timers or crew.

Preferences use separate localStorage records: `milk-run-dev-common-1`, `milk-run-dev-v1-1`, `milk-run-dev-v2-1`, and `milk-run-dev-chooser-1`. Legacy `milk-run-v3-dev-preferences-1` overrides are read by scope and preserved as an archive on migration. **Reset V1 Defaults** and **Reset V2 Defaults** affect only their own scope; an explicit empty scoped record prevents old values returning from the archive. **Reset All Defaults** removes the scoped records and legacy preferences without touching sortie saves. The modified-rules indicator reports Common and the active ruleset, so inactive-rule preferences cannot mark the current sortie as modified.

V2's end report adds Turns, completed Crew Cycles, Time draws, checkpoints, Turns per physical Progress, fighter actions, Engagement countdown spent, natural disengagements, jobs begun/completed, assisted jobs, altitude losses and outbound/return Time draws. Fighter action averages include every spawned fighter, including early kills and fighters still present; rotations count as actual actions even in Attack Pass Only mode, while the separate countdown average counts only eligible decrements. A fatal checkpoint counts as a checkpoint but adds no physical Progress. Time by leg means drawn Time tokens, not real-world minutes. These observations never drive rules or score.

New sorties save all instrumentation. Older V2 saves remain exact on load; new counters begin on the next command and are explicitly marked as partial history. Historical job totals or fighter lifetimes are never inferred from remaining timers.

## Ruleset architecture and persistence

`rulesets.mjs` defines explicit identities (`v1`, `v2-continuous`) and mission lengths. `continuous.mjs` owns only V2 Time, Engagement, checkpoint and Crew Cycle sequencing. `rules.mjs` dispatches according to the saved identity and supplies its shared combat/damage/work functions to that lifecycle; V1 continues through its original round handlers. No command changes an active sortie's identity.

Every fresh state stores `ruleset`. Missing identifiers on old saves and all their queued snapshots migrate to `v1`. V1 retains `rulesVersion: 3`; V2 uses `rulesVersion: 4` so a previous V1-only client rejects the new schema rather than interpreting it as round-based. V2 additionally stores `crewCycle.number/turn`, each crew member's `cycleSlotConsumed`, `time`, held `timeTokens`, separate `overflowTimeTokens`, `pendingProgress`, job `remainingTime`/optional `assistantId`, fighter `engagementRemaining` and optional Bomb Run/campaign state. These values are restored exactly, including mid-draw and pending checkpoint snapshots; missing V2 timers, crossed schema versions or mixed rulesets are rejected rather than inferred. Existing save keys remain supported, and next-sortie Dev preferences remain separate from the active session. The ruleset chooser replaces a standalone current session without clearing storage; an unfinished campaign sortie must be continued or backed up rather than silently overwritten.

## Crew positions and station reassignment

Both V1 and V2 offer **Man Station**, **Leave Station** and **Return Home** as normal actions, with no additional resource cost. Man Station covers the eight gun stations and both cockpit seats. A healthy occupant blocks takeover; an injured or dead occupant does not. Taking over relinquishes the incapacitated occupant's assignment without moving their body. Healing never evicts a substitute or automatically reclaims a relinquished station.

Home Station, Current Station and physical work position are separate. Gun arcs follow the occupied station; rank, Engineer repair bonus and personal role abilities follow the crew member. Cockpit Control keeps the existing trained Pilot / Officer / Enlisted rules. Leave Station makes one abstract move to safe interior space, preferring clear space near the departing station; returning or manning another station takes another normal action. Crew cards and details show replacement assignments, displacement and work status.

There is no Officer/Enlisted restriction on physically operating gun stations. The Navigator can operate the Ball Turret arc while seated there, but leaves navigation unmanned. A healthy Officer substitute at the Navigator/Bombardier station restores its specialist function; an Enlisted substitute can shoot its gun but cannot navigate/operate the bombsight. Sitting in another role's station grants no personal abilities. V1's existing bombing resolution is intentionally unchanged despite the shared station model.

Completed workers return to their home only when safe and unoccupied under the existing coherent batch-return rules. Otherwise they remain displaced. Cancellation and V2 Abort Work retain the work position, remove the station assignment and immediately end suppression. Abort Work retains its validated V2-only between-turn eligibility.

Saves store `crewPositionVersion: 1`, separate `homeStation` and nullable `station`, `displaced`, physical positions and active jobs in authoritative, visible and pending snapshots. Older saves use their existing assigned station as home, including historical cockpit substitutions; a full stationary footprint retains its current assignment. Working/displaced crew keep their exact physical position and become unassigned. Migration changes no clocks, config, bags or RNG.

## Save compatibility

The existing `v2ConfigVersion: 2` is independent of the `rulesVersion: 4` clock schema. Unmarked/version-1 active V2 saves migrate missing combat fields to explicit historical behavior: kill-Time OFF, Disrupt enabled exactly when saved `disruptOnHit` was enabled, Auto Miss, and unlimited Escorts (`v2MaxEscorts: null`). Explicit combat fields are preserved. Authoritative, visible and pending snapshots receive the same migration while stored work durations, jobs, bags, crew and RNG remain unchanged. New optional navigation/cycle/pressure experiments default to 0/OFF/Full Pressure for old saves. Older V2 states missing overflow storage receive an empty bank. No Time token is invented by migration.

`tests/fixtures/legacy-v2-session.json` is a frozen historical save including assisted work and queued snapshots. Regression tests cover its migration, every kill-Time firing path, physical-token conservation, between-turn chains, shared cancellation/suppression and event-owned Disrupt presentation. New Bomb Run fields are validated when present; a historical V2 save already at TARGET may explicitly start its Bomb Run without replaying earlier Progress. V1 round timing and its one-die bombing remain separate.

## Run and deploy

Open the repository's root page and choose **Milk Run**, or serve the repository over HTTP and open `/src/milk-run/index.html`.

```sh
npx vite --host 127.0.0.1
```

Use the URL Vite prints, followed by `/src/milk-run/index.html`. Any ordinary static HTTP server also works; opening `index.html` through `file://` may block JavaScript module imports.

Milk Run uses plain HTML, CSS and browser ES modules. It adds no framework, package, build step, or deployment configuration. The existing Firebase configuration serves the repository root (`public: "."`), so this directory can be served directly. This implementation pass changes only `src/milk-run/`; root navigation, package/build/deployment configuration and unrelated prototypes are unchanged.

## Playtest controls

1. Choose V1 or V2, a seed and (for V2) a target. V1 begins with Start Round; V2 begins directly at crew selection. Campaign launches use the same V2 rules.
2. Select a crew member to preview their station, status, actions and gun arc without spending an activation. The Radio Operator can declare Intercept **before** drawing.
3. Activate to draw and reveal a mission token, then select one action. Action groups explain General, Role and Station actions and their costs. Fire at an individual aircraft token or queue card; select crisis targets on the aircraft, then confirm.
4. Spend banked **Opportunity** between completed crew activations or after an action before its enemy phase. Choose a healthy gunner who completed their normal activation, is still at a usable station, and has a fighter in arc. Confirm one Basic pull; canceling costs nothing. After the action window, choose **Continue to Enemy Phase**. Then watch ordered enemy resolution. **Step / Manual** waits for the next major beat; **Normal** gives draws, rolls and consequences readable time; **Fast** shortens the same sequence. Skip preserves the full event record.
5. V1 finishes a round after ten slots. V2 refreshes its Crew Cycle after ten slots independently of Time/Progress; fighters persist until destroyed or out of Engagement. At TARGET play the V2 Bomb Run, or the unchanged V1 bombing check.

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
| `bombing.mjs`, `bombing-targets.mjs`, `bomb-run-view.mjs` | V1 bombing and separate V2 deterministic 4d6 placement/scoring, authorable targets and touch controls. |
| `bomb-run-test.mjs`, `bomb-run-test-view.mjs` | Disposable fresh-state production Bomb Run, isolated PRNGs and modal event/render boundary; no persistence or Campaign access. |
| `continuous.mjs`, `rulesets.mjs` | V2 Time/overflow, Crew Cycle, Engagement, pressure modes and saved identity/route dispatch. |
| `story.mjs`, `story-content.mjs` | Deterministic director, paced boundary decisions, state-sensitive authored threads, saved delayed branches and historical facts. |
| `story-effects.mjs`, `story-view.mjs` | Reusable tactical modifiers, owned bag-token lifecycle, condition resolution and mobile choices/conditions. |
| `crew-position.mjs` | Physical station assignment, specialist qualifications and effective navigation threshold. |
| `campaign.mjs`, `campaign-session.mjs`, `campaign-view.mjs` | Validated local service histories, identity/stat credit, active-session backup and compact service-record UI. |
| `turn-back.mjs`, `results.mjs` | Confirmed campaign reversal and authoritative end-state presentation. |
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

V1 corrected-board saves carry `rulesVersion: 3`, with an explicit per-round `activationCompleted` flag. Version-2 saves preserve their resolved/pending enemy sequence: migration does not replay enemies or insert a new decision into already-calculated work. Earlier used crew are marked complete; the current actor remains incomplete until a new normal action resolves. New saves preserve an open Opportunity window across reload. Migrating pre-combat-economy saves also preserves live bags/discards, resources, RNG, mission length, work durations and job dates; missing Burst count becomes 0, Opportunity remains disabled at 0, and Disruption remains disabled. Older 6/4 mission and one-round work defaults are retained where no explicit values existed. Pilot Direct Fire is unavailable in preserved Opportunity-off runs; no retired ordered-shot engine is maintained. Future Copilot decisions use reciprocal physical-token conversion. Existing sorties never merge with next-run preferences. The old `milk-run-v3-dev-preferences-1` key is a migration archive; current preferences use the four independent scoped records listed above. No other prototype's storage is touched.

Legacy raw-event saves paused at `ENEMY_HIT_LOCATION` receive a missing focus beat before their pending damage. Current expanded queues retain their exact sequence. Face-down draws retain the previously visible bag inventory until reveal, including emergency refills, so Bag intelligence cannot disclose a hidden token early.

## Shared combat and V1 round rules

- Ten crew positions, rank and role tags, player-selected activation order, and ten total crew time slots per round. Injured, dead and busy crew are unavailable. Unavailable slots are consumed after available activations. By default they still draw mission tokens and face the enemy queue; drawn resources are wasted into discard. Turning off unavailable mission draws still allows existing fighters to act in those slots.
- Mission bag economy: held resources remain outside the bag. Spent resources enter the discard; routine refill occurs at Round Start. Empty bags use their eligible discard immediately as an emergency refill. Resource draws use the activating crew member's configured rank mapping.
- Combat tokens remain out until refill: Hit deals 1 damage, Burst deals 2, and Miss deals none. Basic Fire draws once for free. Advanced Fire costs one Enlisted resource and continues on Hit or Burst against one legal target, stopping on a Miss; a first-pull Miss permits exactly one additional pull and then stops regardless of that token's result.
- Eight gun stations with the specified quadrants/altitudes, plus two unarmed cockpit seats. Station fire or displacement prevents station actions without making a single Damage marker destroy the station.
- Three visible ordered fighter slots. An Enemy draw at capacity becomes Flak without drawing the enemy deck. Destroyed fighters leave the queue and later fighters advance. The enemy deck refills only when exhausted.
- Uniform twelve-sector fighter spawn and movement. Fighters begin facing the B-17 by default. Facing fighters attack; off-angle fighters rotate 90° toward it. Flyby facing depends on whether the new quadrant is the same, adjacent or opposite. Newly spawned fighters can be shot before their first enemy phase.
- Enemy to-hit d6: 1 miss, 2–5 hit, 6 critical. Location is generated only after a hit and displayed as a 6×6 coordinate plus quarter, such as `B1-4`. Empty air causes no aircraft damage. A direct critical applies two aircraft damage steps and two crew damage steps in both rulesets.
- Aircraft damage progresses Healthy → Damaged → Fire. Hits on existing fire have no extra baseline damage. Each direct crew damage step changes Healthy → Injured → Dead; therefore a direct Critical Hit kills a healthy occupant. Fire Spread uses its separate blocking rules below.
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

## V1 baseline values and shared assumptions

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

Crew rank, tags, role `abilities` arrays and station gun arcs live in `CREW_DEFS`. Abilities use crew identity; arcs use the occupied station identity. `crew-position.mjs` owns assignment metadata and its migration. Enemy HP, deck count keys and reserved `abilities` arrays live in `ENEMY_DEFS`. Experimental settings belong in `DEFAULT_CONFIG` and `CONFIG_FIELDS`. `bombing-targets.mjs` is the authoring boundary for V2 ranges, thresholds and reserved future modifiers. `bombing.mjs` keeps V1 resolution separate from V2 placement/reroll commands. Campaign modules consume immutable identity and event data; gameplay must never consult career totals to modify a rule.

## Deferred rules and decisions

This pass deliberately does not add XP, persistent stat buffs, aircraft upgrades, crew skill bonuses, stronger-enemy reward scaling, target-specific bag modifiers/travel lengths, an economic campaign layer, paid between-sortie repairs, cloud storage or backend accounts. Surviving crew/aircraft reset mechanically; permadeath changes only historical identity and replacement records. Me-262, FW-190, BF-110 and BF-109 all retain the same eligible V2 Opportunity/Time kill rewards.

Other deferred systems include Event cards, Locked In, Desperation, Fate, aircraft-specific critical abilities, full interior pathfinding, simultaneous healthy-crew station swapping, bailing out, a landing minigame, branching/hidden mission tiles and scouting. V2 Engagement is implemented and fighters persist across Progress; V1 still clears fighters at round end under its default. The optional navigation, cycle-Time and unavailable-pressure settings remain experiments, with 0/ON/Full Pressure defaults. Playtest exports include the seed, configuration and event log for reproducibility; no balance or historical-accuracy claim follows from a successful diagnostic sortie.

## Validation

All implementation and test changes are inside Milk Run. Validation rerun on **October 3, 2026** passes **594/594 Node tests**, with zero failures, skips or cancellations, and **15/15 Chromium suites**, with no runtime or asset errors. This includes all 14 prior browser suites plus Story Mode. There are **44 Story mechanics/lifecycle tests and 12 Story UI/config/migration tests**. Existing tactical witness fixtures explicitly disable Story where they test baseline V2; new Story scenarios test the enabled default. Logs are in `.checks/story-validation/`; screenshots and structured browser results are in each suite's `.checks/` folder, including `.checks/story/browser-results.json`.

Story coverage includes deterministic selection and scheduled outcomes, one-prompt safe boundaries, marked Repair, ordinary Story inspection work and assistance, positive free Medical, tagged mission/combat draws and both refill paths, temporary accuracy/Flak/Time/Bomb Run rules, concurrent target follow-ups, absent Bombardier, conditions ending, Turn Back, HOME/loss finalization, Campaign facts, Dev Discard and exact Campaign file export/import. **76 Story-enabled semantic snapshots** round-trip through persistence, including a token between draw and discard, work completion, target arrival and choices. The existing **1,530 V2 diagnostic snapshot round-trips** also rerun.

The human-playability aid runs actual commands with unmodified defaults, visible-state tactical decisions and varied Story choices: **24 deterministic sorties**, **24 distinct ordered thread sequences**, all **13 families**, **2–5 interactive decisions** per sortie (mean **4.25**) and mean **2.46** automatic follow-up outcomes. All flights ended: **21 HOME, 3 aircraft losses**. **32 of 94 conditions** were explicitly positive; mixed conditions also offered benefits. It verified physical Time, Resources, base combat tokens and owned temporary identities after **4,560 commands**. These are reviewed examples, not a balance/win-rate claim. Narratives include `story-review-5` bombing Bremen through the earlier cloud, `story-review-11` pushing an engine whose vibration settled, `story-review-4` repairing an engine after the gamble worsened, and `story-review-18` receiving Escort help from a bomber aided earlier. Review revisions removed a dominant navigation option, varied detour descriptions, replaced generic expiration text, corrected dead-person narration and added appropriate no-drop, externally stopped-engine and interrupted-work outcomes. Routine expiration bookkeeping stays in Recent/recorder rather than cluttering Campaign facts. Report: `.checks/story-review/sorties.json`.

From the repository root:

```sh
node --test src/milk-run/tests/*.test.mjs
node src/milk-run/tests/browser-check.mjs
node src/milk-run/tests/ux-browser-check.mjs
node src/milk-run/tests/rules-browser-check.mjs
node src/milk-run/tests/corrective-browser-check.mjs
node src/milk-run/tests/continuous-browser-check.mjs
node src/milk-run/tests/dev-tools-browser-check.mjs
node src/milk-run/tests/crew-stations-browser-check.mjs
node src/milk-run/tests/diagnostics-browser-check.mjs
node src/milk-run/tests/status-qol-browser-check.mjs
node src/milk-run/tests/bomb-run-browser-check.mjs
node src/milk-run/tests/bomb-run-test-browser-check.mjs
node src/milk-run/tests/campaign-browser-check.mjs
node src/milk-run/tests/hangar-browser-check.mjs
node src/milk-run/tests/dev-discard-browser-check.mjs
node src/milk-run/tests/story-browser-check.mjs
node src/milk-run/tests/story-playability-review.mjs 24
```

| Browser suite | Passing scope |
| --- | --- |
| Baseline | Six viewports; two full V1 UI sorties, historical migration opening and current V1 combat witness |
| UX | 18 groups |
| Combat/economy | 7 groups |
| Corrective | 5 groups |
| Continuous | 12 groups |
| Dev tools | 6 groups |
| Crew stations | 10 groups |
| Diagnostics | 7 checks |
| Status/QoL | 3 groups |
| Bomb Run | 8 groups |
| Bomb Run tester | 12 groups; complete state/storage/RNG isolation, six widths, fresh chooser, active standalone and Campaign Bomb Runs, pending/automatic presentation, close/reload and reset defaults |
| Campaign | 13 groups |
| Hangar | 10 groups; multiple surviving aircraft, choice after loss, aircraft/personnel cross-links, import/migration and six responsive widths |
| Dev Discard / emergency return | 12 groups; all seven return distances at six widths, destructive confirmation/cancellation, pending queue cleanup, storage rollback, no-history discard, reload, immediate relaunch, export and finalized-flight protection |
| Story Mode | 11 groups; decisions/conditions at all six widths, exact reload, inspect/reopen, saved presentation boundary, marked-square inspection, positive supplies, defaults/reset/OFF, real Campaign file export/import and no-history Dev Discard |

The 24 focused Hangar Node cases cover one-plane selection; commissioning without replacing survivors; A/B/A service attribution; aircraft and crew relationship joins; selected-aircraft autosave/backup linkage; permanent loss and KIA; independent objective/return/abort results; idempotent finalization; invalid identity imports; three legacy migration states; and standalone isolation. Campaign and Hangar browser checks exercise actual forms and touch controls, with scripted outcome fixtures for service attribution and real rules-driven Turn Back return/loss in the Campaign suite. Aircraft and personnel records are checked expanded at 320/360/390/430/768/1440px.

The Node suite covers physical mission/combat/Time conservation; overflow acquisition/carry and once-only work advancement; Assist countdowns, action cost, safe positioning and cancellation; specialist qualifications; direct Critical crew death versus Fire Spread blocking; exact unavailable-pressure phase counts; every Bomb Run range edge/threshold/reroll/placement; campaign creation/renaming/history/replacement/idempotence; backup validation and rollback. Fourteen Turn Back cases cover outbound 0–7, minimum/cap, pre-commit target abort, preserved live combat/overflow, explicit confirmation, disabled states, saved old routes and survived/lost returns. Fifteen Dev Discard cases cover exact reservation release, ignored live outcomes, no new history/stats/identities, immediate launch, Hangar consistency, portable backup validity, finalized/ended protection, legacy prior losses/KIA, orphan/unrelated saves, identity conflicts and failed storage writes. Seventeen focused cycle/tester tests cover defaults, saved ON/OFF/missing-field migration, cycle reward/job conservation, production rule equivalence, resets and independent RNG. Persistence tests round-trip resolved, visible and pending snapshots. Two deterministic V2 full flights execute **168 commands and 1,530 authoritative/visible/queued snapshot round-trips**, reach HOME after **40 Turns each** with identical results and conserve tokens after every command. The browser Dev-tools fixture completes the default 8/3 V2 route in **41 Turns / 11 Progress** with a four-token Time-only bag; its empty-bag cycle cannot claim a reward. These fixtures test progression, not combat balance.

The current V1 deterministic replay is `tests/fixtures/combat-economy-home-witness.json`, seed **combat-economy-21**. Regenerated for the intentional shared direct-Critical crew-death rule, it uses **344 legal commands, 19 rounds, 190 mission draws**, reaches HOME at **altitude 1 with ten living crew**, records **27 fighter kills**, a bombing **hit** and an engine restart. The unchanged assertions require Direct Fire, Advanced Fire, conversion, Repair, Fire Control, Medical and Restart Engine, exact final metrics, and physical Resource/combat conservation after every command. `tests/generate-economy-witness.mjs` uses visible state without future-RNG peeking or rule overrides and now accepts a successful witness only when all required action types occurred.

`tests/fixtures/baseline-home-witness.json` remains an unchanged historical artifact. Its retired `orderShot` commands and old conversions are not a current-rules replay. Migration tests preserve its historical bag/config/RNG values, replay its compatible opening and reject the retired action transactionally.

Browser scripts start temporary static servers and headless Chromium, use native Node HTTP/WebSocket APIs, exercise real click/touch controls and save screenshots/results in ignored `.checks/` subdirectories. A recent Node with built-in `fetch`/`WebSocket` is required. Set `CHROME_PATH` if Chromium is not at the scripts' Windows default. Suites use separate debugging ports, but do not run the same suite twice concurrently against its profile.

Existing responsive widths are **320, 360, 390, 430, 768 and 1440px**. Baseline/UX checks verify the 144 exact quarters, ten centered crew markers, four engine indicators, touch targets, compact two-row crew rack and absence of horizontal overflow. Station/diagnostic suites check legal reassignment and shared safe work positions, exact reload, Cell History and separate empty-air/aircraft hit maps. Presentation checks cover Critical-before-location, raw recorder results, crew status/tilt, readable combat faces and resume/skip behavior. Bomb Run checks exercise touch placement and rerolls at 320/360/390 plus tablet/desktop. Responsive automation uses Chromium emulation; physical phones are not part of the automated claim.
