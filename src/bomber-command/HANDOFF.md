# Bomber Command handoff — campaign pass

## Current game

Bomber Command is a fourteen-assignment, locally saved B-17 squadron campaign at `/bomber_command.html`. New tours start with six named aircraft and six named crews. HQ usually requests two or three aircraft; the inland works request four. A paid Group delivery can add an aircraft and novice crew at assignments 5 and 9, for a hard limit of eight total posted aircraft. One normal engineering bay, one or two stand-down bays, routine service, and support costs keep reserve rotation useful.

The loop remains Today, Squadron, and Tour. Today holds the current briefing, up to two station decisions (occasionally three visible competing offers), a compact aircraft package, and standing direct/dogleg and preserve/press orders. There are no mandatory airborne choices. Results are drawn and committed once at dispatch and survive reload.

## Branches and continuing stories

Three campaign direction decisions occur before assignments 3, 7, and 10. They alter the **following** uncommitted assignment without changing the fourteen-slot ledger. If left open, Operations keeps the original objective and says so in the next briefing.

| Decision | Subsequent play |
| --- | --- |
| Fighters on the move | Pursue temporary dispersals through a short opening; keep the defended engine works; or spend support for an escorted sweep. |
| Threatened crossing | Take a smaller escorted relief raid and receive support; keep the four-aircraft inland works; or spend support on route reconnaissance. |
| Disputed photographs | Hit a confirmed junction through guns; act on uncertain, dispersed stores; or spend support to verify a lighter approach. |

Mission-specific dilemmas occur before assignments 5 and 12: escort versus a weather opening, and main fighter dispersals versus a smaller service-area supply objective. These change mission mechanics and later suppression or support. Choices sit in the visible station section, outside standing orders.

Four optional, named thread families use the actual roster and work queue:

- A wounded radio operator can be replaced temporarily, wait for clearance, then reclaim the seat or move into instruction. Loss of the flying crew while the original is ashore is recorded accurately.
- A persistent fault can be carried, inspected with support, or reserved for proper work. Finch's completed work clears the finding and certifies two flights; an aircraft loss closes the record.
- Bell and Turner may train with a veteran, fly to earn experience, then take responsibility for a squadron briefing or a promised assignment off. Their availability and survival govern each stage.
- A diverted aircraft and crew can return on schedule, use transport to come earlier, or remain for an overhaul. The arrival and any unresolved field checks are recorded.

A thread candidate is selected only at tour creation or a completed return transition, using the saved RNG. The family and actual participant are persisted; a family is not repeatedly restarted. Follow-ups require the relevant person or aircraft to be available and are prioritized ahead of routine strain and repair prompts. The two-decision budget still applies. Routine strain is relieved by assignments off, promised leave, or support, never by clock movement alone.

## Operational day and simulation

Station time uses UTC with the next dispatch window at **08:00**. After a new-tour dispatch, the next assignment cannot be signed until the following operational morning. “Advance to return report” stops at the immediate result. “Prepare the next operational morning” advances the existing chronological job queue only to the stored next dispatch window. If real time has already passed that window, it advances no further. Repeating it cannot produce more rest or assignments. A player can leave for days without an unattended penalty; only committed work finishes.

Crew rest ticks start at landing (including a forward-field landing), every six hours, and lower fatigue by twelve to the current strain floor. Flight time never counts as rest. Injury, training, repair, and recovery retain their original due timestamps. Strain needs assignment relief or a specified decision. Existing version 20 and 21 tours retain their former dispatch cadence; the daily gate begins on a fresh tour.

## Evaluation

Effective strikes / HQ requested strikes remain an uncapped **operational count**, never a percentage grade. A disrupted objective is a completed report with at least `ceil(0.65 × requested)` effective strikes. Extra hits do not count the same objective twice. Stand-downs consume an assignment and disrupt no objective.

The ending uses three recorded dimensions: disrupted objectives, the larger of aircraft and flying-crew losses, and branch objectives actually fulfilled. On a completed tour:

| Assessment | Requirement |
| --- | --- |
| Excellent | At least 11 disrupted objectives, at most 1 loss, at least 2 fulfilled branch objectives. |
| Strong | At least 7 objectives, at most 2 losses, at least 1 fulfilled branch objective. |
| Mixed | At least 3 objectives and at most 3 losses. |
| Difficult | Anything below those boundaries, or early withdrawal after irrecoverable total loss. |

For a partial tour, the branch requirement is bounded by the number of branch objectives already resolvable. Thread appearances and dialogue clicks grant no grade credit. The Tour view shows objective and commitment counts plus the full effective/requested tally.

## Saves and ownership

The active localStorage key remains `bomber-command-desk-v20` for compatibility; the payload version is **22**. Version 20 and 21 records are validated and backed up verbatim before migration. Their aircraft, crews, assignment deck, committed flights, reports, RNG position, jobs, and due times are retained. They are marked as continuing tours, without invented branch choices or threads. Start a fresh tour to receive the six-aircraft opening, daily dispatch windows, branch decisions, and threads. No tour is silently reset.

`game.ts` owns the seeded simulation, chronological queue, branches, thread state, and evaluation. `content.ts` owns briefs, operational circumstances, and station choice eligibility. `types.ts` and `persistence.ts` own serialized records and migration. `App.ts` and `styles.css` own Today, Squadron, Tour, save controls, and responsive presentation. The root `bomber_command.html` loads the compiled Bomber bundle. Ouija and the other minigames are untouched.

## Run and verify

Node 22.18 or later is required for native TypeScript test loading. In PowerShell:

```powershell
npm.cmd run dev:bomber
npm.cmd run test:bomber
npm.cmd run typecheck:bomber
npm.cmd run build:bomber
npm.cmd run preview:bomber
```

Development and preview open `bomber_command.html`. `build:bomber` emits the standalone page, JS, and CSS under ignored `bomber-build/`; static hosting needs both the root HTML and regenerated build directory. No deployment runs as part of the build.

Optional isolated Chrome check:

```powershell
node node_modules/vite/bin/vite.js --config vite.bomber.config.ts --host 127.0.0.1 --port 5174
Start-Process -FilePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList '--headless=new','--disable-gpu','--no-sandbox','--no-first-run','--remote-debugging-port=9225','--user-data-dir=G:\HockeyCardsPrototype\tmp\bomber-browser\test-profile','about:blank' -WindowStyle Hidden
node src/bomber-command/tests/browser-check.mjs
```

The browser script changes Bomber saves in that isolated profile and writes ignored screenshots under `tmp/bomber-browser/`; do not point it at a personal profile. `CHROME_PORT` and `BOMBER_URL` override defaults. The local restricted Windows browser used `--no-sandbox`; ordinary play does not need that flag.

## Validation and limits

The test suite checks legacy chronology and persistence, new branch gameplay and accounting, thread participant identity and unavailable states, reload stability, fleet cap and unique names, mission dilemmas, evaluation boundaries, and full-tour daily versus accelerated equivalence. A 24-seed fresh-tour sweep reaches all fourteen reports without a dead end or a dominant strain prompt. A separate 60-seed per-policy audit found distinct preserved, pressing, and cautious outcomes. The isolated Chrome check completes a full tour and exercises all three views at 1280×900 and 390×844, with no browser exceptions or failed network requests.

No physical mobile, screen-reader, Safari, Firefox, or human playtest was performed. The balance sample is directional rather than proof that every seed feels equally dramatic. The existing uncommitted Firebase cache change was left alone. No commit, push, or deploy was performed.
