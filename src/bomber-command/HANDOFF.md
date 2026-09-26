# Bomber Command handoff — campaign and content pass

## Complete checkpoint

The campaign/content pass is integrated at `bomber_command.html`. Fourteen assignments, six starting aircraft and crews, the useful reserve, and Today / Squadron / Tour remain. No mandatory airborne attendance, missed-day penalties, extra currencies, or combat controls were added. Work stayed on the existing branch; nothing was committed, pushed, or deployed. Only Bomber source/tests/documentation were changed; generated browser/audit artifacts live in the existing ignored `tmp/bomber-browser/` tree.

The first working increment was the engine-works delayed consequence plus the confidence story; the structure then expanded to eight continuing families and twelve new contextual operational situations. Continuity and source attribution were fixed before finishing the set. The final validation section below records checks and remaining limitations.

## Daily loop and chronology

A new tour has fourteen assignments and six named aircraft/crews. HQ generally requests two or three aircraft; the inland works request four. Support-paid ferry deliveries can bring the total roster to eight at assignments 5 and 9. One normal engineering bay, two during a stand-down, routine service, fatigue, and strain make rotation useful. Earned workshop visits can add capacity for a single commitment.

The next dispatch window is 08:00 UTC after dispatch. Advance to return stops at the report; prepare the next operational morning drains the same queue to the saved window. Elapsed time and acceleration use the identical chronological queue, ordered by timestamp then job ID. Leaving for days finishes committed work but never advances uncommitted assignments. Injury, recovery, training, and repair jobs retain their timestamps. Rest starts at landing, every six hours, and removes twelve fatigue down to twelve per strain. Assignment relief or a stated decision clears strain.

Results are drawn once at dispatch, including aircraft/crew/specialist identity snapshots. Reading a panel, reloading, or advancing time never redraws a flight. Support duties reserve actual IDs through a specified assignment report, remove them from the draft package, and exclude aircraft from automatic repairs/service. Support work is not an assignment off for strain relief. Groundwork benefits cannot be used by an unavailable crew before handover completes.

## Content ownership and hooks

| File | Responsibility |
| --- | --- |
| `game.ts` | Flight simulation, explicit station mutations, chronological queue, availability, old family transitions, evaluation |
| `content.ts` | Base assignments/circumstances, existing station decisions, combined two-decision agenda |
| `history.ts` | Old thread identities, terminal status, append-only milestones |
| `campaign.ts` | Seeded facts, branch previews, seven named delayed commitments and their actual outcomes |
| `stories.ts` | Four new authored families, staged choices, participants, support duties, pacing |
| `old-stories.ts` | Carried-fault repair/retirement and returning crew recovery-log follow-ups |
| `operations.ts` | Twelve contextual operational definitions, persistent offer selection, staff defaults, short consequences |
| `types.ts`, `persistence.ts`, `save-content.ts` | Serialized contracts, compatibility, archive and validation |
| `App.ts`, `styles.css` | Today desk summary, Squadron availability, Tour milestone book, responsive/keyboard presentation |

At creation, `createCampaignState(seed)` persists underlying campaign facts with an independent seed-derived draw without disturbing flight RNG. Existing novice selection uses the campaign stream. `recordCampaignChoice` runs after the immediate branch rewrite and branch record. At dispatch, unselected operational offers receive a recorded staff default; validated results are committed once. At return, base roster/jobs/rewards are processed, completed increments, old threads update, then old-story benefits, campaign consequences, new stories and operational selection advance. Rendering only reads this state.

Do not move selection into rendering or into every wall-clock tick. `campaignObjective` controls actual disruption, support, suppression, branch fulfillment, and final objective count. Empty-store bombing concentrations remain in the operational hit tally, but do not earn objective credit or transport. Reports explicitly explain that distinction.

## Campaign branches and intelligence

Direction decisions before assignments 3, 7 and 10 still set the following mission. Each also creates a delayed consequence, conditional on the actual raid result:

| Decision | Immediate trade | Later consequence |
| --- | --- | --- |
| Moving fighters | Three bombers, short opening | Successful raid opens photographed, lighter/clearer assignment 6 |
| Engine works | Three bombers, heavier defenses | Replacement engine shortage lowers opposition on assignments 7 and 8 |
| Coordinated sweep | One support, escorted raid | Success reserves another escort for assignment 6 |
| Crossing relief | Two bombers, escort, immediate support | First diversion on assignments 10–13 returns up to twelve hours sooner without support cost; unused promise explicitly expires |
| Inland works | Four bombers, heavy industrial request | Components shortage lowers opposition on 11 and 13; assignment 13 needs two bombers |
| Inland reconnaissance | One support confirms clear/gun-belt route | Same component benefit; the discovered route determines actual approach conditions |
| Confirmed junction | Known guns | Successful disruption earns escort and lighter opposition on assignment 13 |
| Suspected stores | Estimated occupied, dispersed targets | If occupied and disrupted, assignment 13 needs two bombers/lighter opposition, and assignment 14 gains a clear window/lighter opposition |
| Verify stores | One support buys knowledge | Strike verified occupied stores, or the junction if empty; benefit follows the actual target |

Fresh tours default to the standing engine/inland objectives and the confirmed junction when no order is entered. The default is recorded. Continuing version-22 tours keep their original default behavior.

Stores are occupied in roughly 64% of seeds; the inland route is clear in roughly 55%. These are persisted situations, not new rolls on choice or panel access. Estimates are labeled. Recon confirms a situation; it does not promise a successful flight. Commitment states are pending → ready → active → fulfilled, with missed and expired terminal alternatives. `effectsApplied` prevents repeat effects, and milestones distinguish target success from later delivery. Other commitments remain true if one objective fails.

## Eight continuing families

| Family | Stages and distinct resolutions |
| --- | --- |
| Injury / temporary specialist | Hospital, wait or named substitute, clearance, restore original familiarity/support or retain substitute and transfer original into instruction. An original ashore survives a substitute crew loss. |
| Persistent fault | Actual finding, inspection/normal bay/carry, certified work and recorded operational benefit. A carried finding returns after two assignments: real six-hour repair or retirement for assemblies/support, holding the aircraft off the rest of the tour without counting a death. |
| Novice mentoring | Bell/Turner and a real veteran, plotting-table training or operations, then earned briefing responsibility/strain or promised assignment relief. Declining training does not prevent later responsibility after actual sorties. |
| Diversion and recovery book | Actual aircraft/crew at a forward field, scheduled/expedited/overhauled return. Uncertified returns can close the account for flying or hold the returning crew off one assignment to write notes; two assignments later those notes shorten pending recoveries or earn transport. |
| Confidence | Two successful concentrations motivate an offer; lead now for strain/briefing or check the method ashore. Review actual later sorties, then share the lesson with a junior at a two-crew availability cost or keep responsibility/lesson with the senior and additional strain. |
| Disputed photography | Actual navigator, estimated guns versus tracks, spend support/crew time for comparison or file the estimate. Seeded facts are confirmed after two assignments; measured notes, corrected training, Group suppression or transport depend on what was learned. |
| West Fen neighbors | Named reserve aircraft/crew promised two assignments ahead, or instruments sent now for a later workshop. Keep/release the ferry promise; a completed ferry earns workshop or recovery help. Earned favors survive later crew loss or medical absence. |
| Veteran relief | Experienced crew and named junior, written notice or extension with strain, then release to Group instruction/remaining-tour absence and junior handover, or an assignment off with cleared strain/fatigue and continued service. |

Old threads have active/resolved/closed status, participant snapshots, and durable milestones. A later casualty appends an entry without changing a repaired/restored/resolved endpoint. Specialist IDs distinguish original and temporary personnel after transfers. New arcs retain crew/aircraft IDs and specialist snapshots. Temporary injury, recovery, training and support duties defer critical follow-ups; irrevocable loss closes an unfinished undertaking with specific text. Earned paperwork/material help survives the loss of its carrier where appropriate.

Families start once per tour. New arcs start between assignments 3 and 9, at most one per two completed assignments, with a seeded quiet chance. At most three combined old/new arcs are active. Confidence and relief exclude one another while active. Openings expire after two assignments with a stated staff default; follow-ups generally wait for participants. The ferry's actual transport window can expire explicitly. Final relief closes unresolved accounts rather than leaving invisible active threads. Late recovery-note work is disabled when there are not two assignments left to deliver it.

## Operational dilemmas and agenda

Twelve new situation IDs: `cloud-floor`, `formation-lead`, `fuel-drums`, `rail-alternate`, `stores-ferry`, `radio-watch`, `workshop-exchange`, `escort-debt`, `gun-map`, `instructor-detail`, `fuse-setting`, `recovery-section`. The two existing escort/weather and alternate-objective decisions remain, giving fourteen operational situations total.

They arise from actual weather, requests, hazards, suppression, newcomer/veteran availability, fuel pressure, reserves, capacity and support. Their distinct costs include higher gun exposure, fatigue, foregoing current escort or suppression, engineering allocation, and holding reserve crews/aircraft. Benefits include different objective types, delayed escort, recovery preparation, transport, instruction and attributable briefing preparation. Only one seven-point prepared briefing applies per assignment; choices cannot purchase a duplicate bonus.

Operational selection begins after the slow opening, stores the chosen family and participant snapshots, has a two-assignment cooldown, a 28% quiet roll, priorities and mutual exclusions, and never restarts a used family. Fixed mission dilemmas exclude new operational selection on their dates. The main agenda prioritizes branch/critical follow-up decisions, then continuing stories and contextual opportunities. There are at most two decisions in a visit, including previously entered decisions; the player can dispatch without answering. Unused time-sensitive offers receive explicit staff-default entries. Routine engineering/strain decisions retain cooldowns.

## Saves and migration

Active localStorage key remains `bomber-command-desk-v20`; payload version is **23**. Supported versions **20, 21 and 22** are validated and backed up verbatim before the migrated state is saved. No silent reset occurs. The earlier aircraft, crews, assignment deck, committed operation/report/results, RNG position, scheduled jobs, job IDs/due times, decisions and existing branch records are preserved. Versions 20/21 retain their prior legacy cadence; version 22 retains its daily gate and original campaign content.

Migrated saves have `contentVersion: 0`, null new campaign facts, no fabricated new families/duties/commitments. Recorded thread endpoints become one explicitly imported milestone at the current station date; no earlier stages or dates are invented. Historical reports are not retrofitted with guessed specialist names. Existing prepared bonuses get neutral attribution when their source was not recorded. The UI explains that fresh tours are required for the new content. Fresh tours use `contentVersion: 1`.

The decoder validates new participant references, facts, milestones, duties and operational selections without RNG draws. Save conflicts across browser tabs are still rejected. Import/replacement archives still preserve the original text. Report snapshots remain stable after a later replacement or recovery. JSON serialization omits optional fields instead of retaining undefined values in live state, keeping reload comparisons equal.

## Adding another arc

1. Add a typed family and small metadata entry in `stories.ts`: title, earliest/latest start, priority and exclusions. Use a real eligible crew/aircraft from `startCandidate`, snapshot its stable identity, and write an opening with a concrete station cause.
2. Add a finite set of staged events and explicit mutations in `storyEvents` / `applyStoryChoice`. Preview costs, absence through an assignment report, uncertainty and timing. Do not add a scripting language or mutate from rendering.
3. Advance stages only in `advanceStories`. Persist any hidden fact once when selected. Decide which follow-ups wait, which windows expire, and which earned work survives participant absence/loss. End in resolved or closed with finished text.
4. Use the duty helper for availability and plan filtering, `recordThread` for old-family history, and correct named sources for briefing/workshop benefits. Do not overwrite a terminal record or consume jobs merely to create narrative urgency.
5. Extend the serialized validator if the contract changes. Add focused cost/timing, alternate-resolution, loss/absence, reload, expiry and daily/accelerated checks. Run the audit and read actual transcripts to ensure the new arc gets room to resolve.

For another delayed campaign commitment, add its typed kind/definition, branch mapping and explicit `applyEffect` case in `campaign.ts`; test target failure, correct due slots, one-time effects and synergy with existing commitments. For a contextual operational situation, add a typed definition/prerequisite/preview/default and explicit resolution in `operations.ts`; no rendering-time randomness.

## Run and validate

Node 22.18+ is required for native TypeScript tests. From the repository root in PowerShell:

```powershell
npm.cmd run dev:bomber
npm.cmd run test:bomber
npm.cmd run typecheck:bomber
npm.cmd run build:bomber
node src/bomber-command/tests/campaign-audit.mjs
npm.cmd run preview:bomber
```

`build:bomber` generates ignored `bomber-build/` with the standalone HTML/JS/CSS. It does not deploy. Do not change Hockey, Ouija, shared routing or global build configuration for this pass.

The audit defaults to 120 seeds each for cautious, balanced and pressing policies, plus 40 matched-seed alternatives for each choice at each branch: **720 complete campaigns**. It writes summary, per-run data and quiet/costly/recovery/contrasting-branch transcripts under ignored `tmp/bomber-browser/campaign-audit/`. Environment variables `BOMBER_AUDIT_SEEDS`, `BOMBER_AUDIT_PAIRED_SEEDS` and `BOMBER_AUDIT_OUTPUT` override the sample/output. The authored review beside those files records transcript findings.

Browser check uses an isolated Chrome profile and local Vite preview; never point it at a personal profile:

```powershell
$env:CHROME_PORT = '9237'
$env:BOMBER_URL = 'http://127.0.0.1:5176/bomber_command.html'
node src/bomber-command/tests/browser-check.mjs
```

Start the preview and hidden headless Chrome debugging process first, as documented in the browser script. The checked profile was `tmp/bomber-browser/content-pass-profile`; Chrome flags included `--headless=new --disable-gpu --no-sandbox --no-first-run --remote-debugging-port=9237`. The restricted local test used no-sandbox; normal play does not require that flag.

## Validation and balance findings

All 120 Bomber tests, type checking and production build pass. Focused additions cover completed history surviving casualties, specialist transfer/recovery identity, true benefit sources, delayed effects once, stable uncertain intelligence, prerequisites/exclusions/defaults/deferred follow-ups, support-duty availability and draft package filtering, workshop capacity/source accounting, supported migration/archives, committed flight integrity and full daily/accelerated equality with reloads. The browser passes a full fourteen-assignment tour, all three views at desktop 1280×900 and mobile 390×844 / 320×844, keyboard Tab/Enter/Escape/focus restoration, tutorials, milestone rendering, reload/import/archive cases, with no browser exceptions or network failures.

The 720-tour audit encountered all eight story families and all twelve new operational situations. Across the 360 main policy tours, 303 were loss-free; no one-shot decision repeated, and no active story remained stranded at the ending. Seventy-three routine decisions repeated after their allowed cooldown across 5,040 assignment visits. Mean workload was about 22 decisions in fourteen assignments with about 1.9 fully quiet visits. Prioritizing new openings fixed early audit starvation without raising the visit budget.

| Policy (120 tours each) | Mean objectives / 14 | Mean losses |
| --- | ---: | ---: |
| Cautious | 9.78 | 0.04 |
| Balanced | 10.69 | 0.08 |
| Pressing | 11.83 | 0.50 |

Matched crossing/inland/recon alternatives produced roughly 10.75 / 10.70 / 10.65 objectives, with different package demands and later help; the harder inland option now has a distinctive final-operation benefit. The confirmed junction remained more dependable than the unverified stores gamble; the gamble can earn both the industrial shortage and the clear final coast run. No consistent domination across all strategic dimensions was established. Decision-dependent event draws and roster changes make these samples directional, not proof of perfect balance.

Read transcripts as gameplay, not just assertions. The quiet successful balanced run (1126909542) has thirteen objectives, no casualties/injuries/diversions, survey correction, confidence mentoring, Bell's briefing and a kept West Fen ferry. The costly pressing run (704711416) retains Price's completed photographs story after his later death and explains empty-store failure without erasing successful inland work. The recovery run (2654435761) returns from eight diversions without losses and makes transport, engineering and promises matter. Contrasting branches rejoin the same fourteen-assignment ending with different later obligations.

Remaining limits: no human playtest, physical mobile test, screen-reader audit, Safari or Firefox check. Automated policy balance and transcript inspection cannot certify emotional pacing for every seed. The loading-roads alternate is intentionally rare because an existing strategic commitment excludes it. Start a fresh tour for the new arcs and facts; continuing supported saves intentionally keep their recorded campaign.
