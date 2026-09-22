# Bomber Command — consequence and content pass

The entry point is `/bomber_command.html`. This remains a complete fourteen-assignment campaign. The current save schema is 21; version 20 tours migrate in place with an exact backup and no redraw of committed flights. There are no external assets, runtime libraries, service accounts, or paid dependencies.

No player observations were supplied for this pass. Source inspection and an 80-tour baseline audit found fourteen identical briefing titles across runs, a single generic defect type, rapidly capped experience, and two injured mechanical-abort outcomes whose prose omitted the injury. The balance/attachment changes below are design judgments informed by that audit, not claims about human playtesting. Existing uncommitted work from the redesign was retained; this pass changes only `src/bomber-command/`.

## Run, build, and verify

Use Node 22.18+ (native TypeScript stripping for tests); verified here with Node 24.16.0. Dependencies are already declared by the repository. On Windows PowerShell use `npm.cmd` if script policy blocks `npm.ps1`; on other shells use `npm`.

```powershell
npm.cmd run dev:bomber
npm.cmd run build:bomber
npm.cmd run preview:bomber
npm.cmd run test:bomber
npm.cmd run typecheck
```

Development and preview open `bomber_command.html`. Production output is `bomber-build/`, with relative asset paths. `build:bomber` typechecks Bomber first. The existing `dev`, `build`, and `preview` scripts and `vite.config.ts` still belong to Ouija. Root TypeScript is explicitly no-emit and accepts `.ts` imports, preventing another accidental generation of adjacent JavaScript.

Optional real-browser check (an isolated Chrome debugging profile must be running):

```powershell
# In one terminal:
node node_modules/vite/bin/vite.js --config vite.bomber.config.ts --host 127.0.0.1 --port 5174

# Start Chrome using an isolated profile; adjust the executable path as needed.
Start-Process -FilePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList '--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9225','--user-data-dir=G:\HockeyCardsPrototype\tmp\bomber-browser\test-profile','about:blank' -WindowStyle Hidden

node src/bomber-command/tests/browser-check.mjs
```

`CHROME_PORT` and `BOMBER_URL` override the defaults. The check intentionally replaces Bomber saves in the isolated profile: never point it at a personal game browser. Screenshots and fixtures go under ignored `tmp/bomber-browser/`. In this restricted Windows environment Chrome's GPU process could not launch with its sandbox; the executed checks used `--no-sandbox` in the isolated, local-test profile. Normal players do not need browser flags.

## The loop and its boundaries

1. Read the last return report and latest station entry.
2. HQ gives the objective, requested aircraft, opposition, weather, and next demand.
3. Resolve optional station dilemmas if useful. Leaving them alone spends no scarce support and authorizes no patch; routine recovery continues.
4. Adjust the staff package, swap crews if needed, select approach and standing orders, and review the signed commitment.
5. Leave safely, or advance to the return report. The next assignment waits for another commitment.

A commitment reserves one of fourteen assignments; its report increments `completed`. A stand-down consumes the same slot, contributes zero, and permits two engineering allocations instead of one. An earned mobile team adds one allocation to either. Real time cannot issue assignments. A direct operation takes four real hours, a dogleg six, and a stand-down twelve. Sleep removes twelve fatigue per six hours, down to twelve per operational strain level; flight time does not count as rest. A crew sitting out an assignment loses one strain level. Promised leave holds a crew off the next commitment and clears all its strain/fatigue at that report. Calendar waiting or acceleration cannot bypass promised leave or clear strain. Policies remain selected until changed and fold into a compact summary after the opening. Unedited staff proposals refresh as work finishes; manual package edits stay intact.

The middle uses nine alternative briefs, varying requests, weather, and six operational circumstances (ordinary, escort rendezvous, short weather opening, dispersed aiming points, headwinds, and an approach gun belt). These change the existing route/order calculations; there is no extra mission-configuration panel. The opening and final 3/3/2-aircraft requests stay legible. The broader strategic sequence still follows fighter, supply and rail objectives.

Oil-pressure faults raise mechanical risk, stiff controls add exposure as well, and bombsight vibration primarily reduces accuracy. Wear or combat can create a fault at return. Field patches are offered only below the grounding threshold: they restore availability but leave an oil-pressure fault. Proper repairs restore up to 38 condition, clear findings, and certify two future flights against mechanical trouble. Paid specialist inspection uses the current engineering allocation, takes three hours, restores up to 12 condition, and gives the same certification. Finishing it before dispatch does not refund that allocation.

Recovery can proceed on schedule, be expedited, or be delayed six hours for paid forward-field work. Uninspected recoveries leave a mechanical penalty that station work clears. The forward workshop restores up to 30 condition and certifies the aircraft. A replacement airframe is offered only while fewer than four survive; an old loss cannot be used to build an unlimited reserve fleet.

Crews earn half an experience point per non-aborted return. Paid training gives two experience and a one-flight accuracy benefit after six hours. Temporary specialists build familiarity over three actual sorties; their names are drawn from an unoccupied pool. Returned originals can resume their place and release support, or transfer to instruction while the temporary specialist stays and the crew sheds strain. Pressing adds strain on flights reaching the objective; combat or high starting fatigue can add more. This makes repeated aggressive daily commitments costly even when overnight sleep clears ordinary fatigue.

Effective fighter/rail raids reduce opposition on the next commitment. Rail photographs offer either a seven-point bombing benefit or further opposition reduction. Supply objectives automatically earn one support and offer either another support or a mobile repair team. Opportunities expire at the next commitment, including stand-down. One offered decision slot is reserved for an earned opportunity so several similar faults cannot hide it. At most two station choices can be resolved per assignment; none is compulsory. The rest are staff defaults or can wait. Quiet days and unremarkable returns are valid content.

Ordinary unavailability never ends a campaign. Early withdrawal requires **every airframe permanently lost**, insufficient support for another aircraft, and no delivery pending. Otherwise all fourteen slots remain playable. At the final report, the station enters `closing`; already committed rest, care, repairs, deliveries and recovery finish before `ended`. The final roll call includes contribution, surviving crews, experience, aircraft preserved, and permanent losses.

## Ownership and invariants

| File | Owns |
| --- | --- |
| `types.ts` | Serializable state, plans, outcomes, queue jobs and event shapes. |
| `game.ts` | Seeded creation, availability, staff proposal, forecasts, commitment, outcomes, chronological work queue and endings. No DOM, storage or wall-clock reads. |
| `content.ts` | Assignment variants/circumstances, named defect descriptions, strengths, and nine state-conditioned event families. |
| `persistence.ts` | Version 21 validation, version 20 migration, storage ownership, exact backups, legacy transition and serialization. |
| `App.ts` | Three views, input handling, accessible confirmation dialogs, transactional saves, real/accelerated clock integration, export and restore. |
| `styles.css` | Responsive paper/ink desk presentation with native controls, clear focus, and restrained motion. |

Randomness is an LCG held in `State.rng`. Each flight draws seven values **once at dispatch**. The resulting report, extra debrief facts, new defect, strain cost and causal credits are persisted before the UI says it is safe to leave. Training and certification charges are consumed at that commitment. Rendering, forecasts, event eligibility, and catch-up never draw randomness. This prevents reload rerolls under normal use; this local, single-player save is not intended to resist intentional file editing.

`advance(state, timestamp)` drains jobs sorted by `(at, id)`. It sets the clock to each job's due time before applying the effect and creating follow-up jobs. A completed job is removed, so it cannot apply twice. Crew rest ticks retain their due times across refreshes; a flight cancels rest, and landing starts a new interval. A coarse offline update and many fine updates finish with the same state at the same timestamp. The UI's saved `offset` allows accelerated play to move this exact clock forward. State changes are cloned and saved before being adopted by the UI; storage failures leave the prior order intact. A stale-tab ownership check prevents ordinary cross-tab overwrites.

## Authoring a station event

Add a condition in `stationEvents()` that returns a `StationEvent` referencing an actual aircraft or crew. Check physical availability, existing timed work, required prior history and affordability. Never offer a training seat to an absent crew or a specialist bay already in use. Specify a stable key and explicit costs, including duration and what an unresolved finding will continue to do. `choose()` must mutate real state or record an explicit deferral. Do not add random draws to this query or to the renderer.

Repetition rules: injury/return keys include crew sortie identity; recovery includes aircraft sortie identity; inspection, patches and strain have three-assignment cooldowns; mentoring/reinforcement have four-assignment cooldowns. Opportunities belong to exactly one assignment. The two-choice budget applies to resolutions as well as display. Expiring opportunities have a reserved place beside the first other eligible matter. If a new family is added, consider which existing family it might displace.

Connected content should use actual state transitions. Examples now implemented:

| Earlier action or outcome | Follow-up |
| --- | --- |
| Field patch / combat / wear | Persistent named finding → specialist or proper work → limited certification → possible credited mechanical rescue. |
| Training | Unavailable for six hours → experience and next-flight notes → bombing credit only when the notes change the result. |
| Repeated pressing | Strain floor survives sleep → assignment off, promised leave, or paid debrief → named relief at the correct report. |
| Specialist wounded | Medical queue → named temporary specialist → familiarity through sorties → actual medical return → restore or retain decision. |
| Diverted aircraft | Timed absence → three recovery choices → either certified return or a station sign-off decision. |
| Effective rail/supply strike | Named source opportunity → accuracy, opposition, support or engineering benefit on the next commitment. |

Timed consequences belong in `applyJob()`, scheduled from the instant work actually starts. Commitment-based relief belongs in `finishOperation()`, never a calendar tick. Add tests for eligibility, cost, duplicate rejection, intermediate deadlines and full coarse/fine catch-up equivalence. Add new fields and `JobKind` values to the validator. Changing persisted meanings needs an explicit version transition.

Writing rules: compose aircraft status, combat damage, injury and bombing results independently so one branch cannot swallow another fact. Never identify the original specialist as aboard when a substitute is flying. Optional debrief detail carries atmosphere; the required report carries the accounting. A `credits` entry is stronger than flavor: compare the same roll against the forecast with that single benefit removed. Training, repair, intelligence and orders are credited only when that comparison supports the statement. Do not credit a one-pass withdrawal to an aircraft that aborted before the target. `tourMemories()` reads persisted credits, reports, choices and crew histories; it must not invent a successful chain from a choice alone. Losses remembered in the ending refer to flying crews, not to an absent original specialist.

## Saves and removed implementation

The original pre-redesign `bomber-command-save-v1` key is never deleted or modified and retains the previously implemented fresh-tour transition. The active desk storage key remains `bomber-command-desk-v20` for compatibility; the **payload schema is now 21**. Loading version 20 validates it, archives the exact raw record under a unique `*-archive-before-content-pass-*` key, then initializes new fields without drawing randomness. The old assignment deck, committed report, RNG position, job identities and due times stay intact. Existing tours receive ordinary circumstances on their existing briefs; starting a fresh tour is needed to sample the new briefing variants. Future commitments use the updated readiness rules.

Invalid/future records stay untouched behind the recovery screen. Starting a new tour or restoring a file archives the active record first. Tour provides download and restore controls. Archives still have no in-game picker or pruning. `tests/fixtures/v20-active.json` is a genuine committed pre-pass state, used by unit and browser migration tests.

Replaced the old Bomber game, type model, UI and styles; removed its four adjacent JavaScript duplicates (`App.js`, `game.js`, `main.js`, `types.js`). The HTML now imports `main.ts`. The old target/recon/doctrine/debug dashboards and generic seat paperwork are gone. No sibling game sources or tracked build artifacts were changed. No deployment or push was performed.

Verified earlier findings: HTML loaded the JS implementation; JS used save version 11 while TS used 12; default production build targeted Ouija; `abortIfFormationBelow` and `damagedAircraftReturnEarly` were visible without outcome reads; route changed risk without a corresponding duration trade-off; fatigue recovery floored each update's elapsed interval; collapse used immediate group effectiveness, which could include repairable unavailability. These paths were replaced rather than patched in place.

## Executed validation and next priorities

The current suite has 49 passing tests: the original timing/recovery/persistence coverage plus content-specific prerequisites, costs, chronology, opportunities, strain, inspection, crew familiarity, proposal ownership, v20 migration and report consistency. It also verifies that loss of a crew flying with a substitute does not erase the original specialist ashore or cancel their medical care. It exercises 600 complete seeded tours: 320 baseline-policy tours and 280 with active content decisions. The latter use widely spaced seeds, hourly-versus-offline comparisons at every commitment, and preservation, aggression, preparation and rapid-play strategies. A further 700 committed seeded operations check reported injuries/losses/abort facts and credit eligibility. All nine dilemma families are encountered.

The 70-tour-per-policy content sample averaged 28.10 effective strikes / 0.11 aircraft losses for preservation, 30.60 / 0.69 for aggression, and 28.14 / 0.10 for preparation. Preparation returned 3.80 veteran crews on average versus 2.57 for aggression. Preservation had 382 quiet visits out of 980; aggression had 85. Rapid play averaged 17.11 effective strikes. These scripts are directional balance checks, not human playtests or an exhaustive optimal-policy search.

Repository-wide typecheck and Bomber production build pass. Chrome checks cover all three views at 1280×900 and 390×844, a full tour, dispatch/reload, keyboard dialog dismissal, archive/restore, legacy transition and the actual v20 active-flight migration. New UI checks resolve promised leave and specialist inspection, verify both follow-ups and the two-choice limit, and inspect screenshots. No Safari, Firefox, physical mobile device, screen-reader session, or real multi-day elapsed soak has been performed. This pass does not change sibling source or build configuration; the preceding pass also verified the Ouija build.

Next content pass, in priority order:

1. Human daily-session testing, especially whether strained crews and the two-choice cap are understandable. Aggressive play produces more station matters by design; avoid turning that into repetitive punishment.
2. Broaden crew-specific voice and shared incidents without a new resource system. There is still one modeled consequential specialist per crew, no ten-person casualty simulation, and four familiar initial pilot identities across runs.
3. More strategic branch shapes. The middle deck and circumstances vary, but the broad fighter/supply/rail sequence and final contribution requests remain fixed.
4. Archive selection/pruning. Downloaded records can be restored; browser archives currently require extracting a stored record first.
5. Screen-reader, Safari/Firefox, physical mobile and long-running browser checks. Native controls and focus handling are present; this is not a full accessibility audit.

There are three starting circumstances, twenty-three briefing titles across the opening/spine/variant pool, six flight circumstances, three persistent defects, and nine station dilemma families. Larger strategic branches, historically precise formations, difficulty settings and cloud saves remain outside this pass.
