# Mixed encounters and explicit completion

This pass builds on the local v4 mobile/adventure implementation. It changes new
house placement and exit presentation, not Strike, Flare, Ward, Oil, relic effects,
regeneration, XP, level recovery, supplies, scoring or active saved houses.

## Exit diagnosis and correction

The reported `haunted-house-1215nsf-gadt9i.json` was not present in the workspace.
An equivalent diary-at-entrance fixture was tested against the pre-change compiled
UI, with a living Wisp, unused food/treasure, unrevealed tiles and a closed optional
gate. The existing Leave action succeeded. No all-enemies-dead dependency was
reproduced, so the exact historical interaction cannot be established.

The local interface did have concrete visibility problems: the player covered the
exit glyph, the tile only said "exit. Inspect freely", moving to the entrance
closed the options, and the ready-objective icon opened the journal. The exit panel
repeated the original recovery instruction despite possession of the diary. A
queued spell and enemy preview could remain visible behind it.

Now the objective control becomes a visible **Exit** button when requirements are
met. The occupied entrance retains a door marker and a specific accessible label.
Either opens the same compact panel, clearing queued Flare and actionable combat
selection without spending a turn. The fixed footer offers **Leave with diary**,
**Leave with key**, or **Leave the quieted house**, plus **Keep exploring**. The
second choice, Close and Escape all leave gameplay unchanged. Long descriptions
cannot scroll the completion action away.

Away from the entrance, that panel offers **Move to entrance** (one turn). It stays
open after that movement, offering the separate one-turn Leave action. Collecting
the objective or stepping onto the entrance never automatically ends the run.
Rooms and Journal also link to exit options outside their scrolling content.

`exitReadiness()` in `game.ts` is the authority used by the UI, engine and solver;
`objectiveReady()` remains a compatibility wrapper. A live active run may leave
when standing at its saved entrance and satisfying its family:

- Escape: possess the front-door key.
- Diary: possess the missing diary.
- Keepsake: place the locket at the memorial first.

Missing-requirement messages identify the item, memorial step or return to the
entrance. Living enemies, unexplored tiles, treasure, unused supplies, locked
optional branches and commendations are not requirements. Reports, full undo,
reload and one completion record per attempt remain intact.

## Distribution rules

The preceding generator forced all entrance spirits to tier 1 and sampled most
others from depth +/- 1. That profile generator is retained as the source of the
house budget. `encounter-placement.ts` then redistributes intact non-keeper profiles
among the existing encounter slots, using a separate seeded stream:

- Depth is a soft preference: tiers within one of typical depth receive weight 3,
  others weight 1. Room spirit preferences multiply that weight; no type is banned.
- A 60% nomination can put a tier-3-or-higher spirit in an unreserved entrance
  slot. It sometimes relocates that slot to an empty initial-view floor square
  (65% nomination when suitable space exists). Neither outcome is guaranteed.
- A 70% nomination can put a tier-1 profile at graph depth 2 or more. Other weighted
  assignments can produce early strong and deep easy encounters independently.
- The opening reserves up to two tier-1 profiles whose full uninterrupted Strike
  or Flare fight is affordable according to authoritative previews. If the old
  geometry offers only one visible slot it preserves one; zero-view starts retain
  the prior placement for real validation. A relocated initial threat is rolled
  back if it removes those affordable discovery choices.

The same seed/variant retains the exact enemy-profile multiset: count, HP, attack,
regeneration, XP, traits and rewards. Per-room counts, quiet rooms, keeper, geometry,
keys, clues, supply/reward budget and initial resources are unchanged. Only regular
enemy positions change. Higher starting difficulty is not funded by extra supplies
or enemy XP. Different accepted variants can have different budgets, so accepted
batch averages are not a strict same-house comparison; paired candidate tests are.

`openingVisibility()` starts at the entrance and repeatedly reveals from eligible
discovered empty destinations and legal open passage travel. Occupants, supplies
and closed gates remain. It includes diagonals and destinations beyond intervening
walls/occupants; it does not use a physical walking flood fill. Initial visibility
is reported separately from this empty-exploration closure. Exploring costs turns,
but consumes no health/light/items; it must not be called "zero-turn exploration".

No new placement quota invokes extra solver rejection. The existing bounded
acceptance still checks discovery prerequisites and finds a resource-feasible win
with the locked optional branch unavailable, then replays every action against the
complete original house. It may reject mixed or unchanged candidates. Six attempts,
450 search states, width 16 and cancellable worker UI remain unchanged. A failure
is explicit; there is no unverified fallback. No enemy changes during active play.

## Affordability diagnostics

`evaluateEncounter()` is an offline probe through `act()` and `previewAttack()`:
36 bounded complete-fight plans combine Strike, Flare-first/finish, Ward, Oil and
pocket Tonic choices. It accounts for saved relics, traits, armour, regeneration
on preparation/healing turns, simultaneous lethal retaliation and surviving XP
recovery. It neither grants fog nor consumes hypothetical floor supplies. Whole
winning-route replay includes the actual collected rewards and floor supplies.

A successful plan proves affordability with the resources at that observation.
Failure is only "no enumerated plan found", not impossibility. Its best-plan cost
is health + 2*light + 6*tonics + 4*oils, then turns; that diagnostic weighting does
not change generation acceptance or choose actions for the player. Gross costs
are reported before tonic/level recovery. Pure Strike and pure Flare thresholds
remain separate, so a high-tier spirit can still be a clever early opportunity.

The batch records each real witness sighting, first attack, kill, XP/level outcome,
supply margin and refill chain. Return-later examples require an untouched seen
enemy, leaving its room, a later kill in another room that reaches a higher level,
and then attacking the original enemy with improved stats. Remote attacks are
legal: revisiting an encounter does not require physically walking back. These
are observations of the solver's original route, not manufactured detours or
quotas. A witness is omniscient about goals and does not prove player understanding,
hidden-information fairness, or safety of every choice.

## Measured seed comparison

Final batch: hh-encounters-00 through hh-encounters-15, both distributions using
power-only Flare and the same production search limits. Raw results are local in
.haunted-checks/encounter-final.json. All accepted witnesses replay through act().

| Measurement | Prior placement | Mixed placement |
| --- | ---: | ---: |
| Verified houses / failed seeds | 16 / 0 | 16 / 0 |
| Candidates / rejected | 32 / 16 | 22 / 6 |
| Rejection reasons | 15 exhausted, 1 budget | 6 exhausted |
| Mean / maximum candidate time | 2.79 / 4.81 s | 3.12 / 5.23 s |
| Mean generation time per accepted house, including retries | 5.58 s | 4.28 s |
| Houses with initially visible tier >=3 | 0 | 1 |
| Houses with tier >=3 in empty-exploration closure | 0 | 6 |
| Initially visible simple-threat houses | 0 | 2 |
| Empty-exploration simple-threat houses | 8 | 11 |
| Tier >=3 enemies in that closure: kit-affordable / no probe plan | 0 / 0 | 3 / 4 |
| Tier-1 enemies at depth >=2 / houses containing them | 11 / 9 | 30 / 15 |
| Deep enemies needing <=2 surviving Strikes at reference level 2 | 10 | 30 |
| Mean turns | 145 | 145 |
| Mean defeated / left alive | 10.88 / 5.44 | 11.50 / 4.38 |
| Mean preserved floor/pocket supplies | 16.06 | 15.81 |
| Mean final level | 5.75 | 5.69 |
| Mean light restored by level-ups | 38.69 | 38.00 |
| Two-or-fewer-Flare leveling kills / consecutive pairs | 7 / 0 | 7 / 0 |
| Regular tier >=3 kills begun at level <=2 | 22 | 18 |
| Untouched return-later encounters / houses | 139 / 16 | 140 / 16 |
| Those with no first-seen probe plan but a later plan / houses | 44 / 16 | 38 / 15 |
| Mean food/candle uses before second kill | 0.19 | 0.06 |
| Full-resource food/candle clears before second kill | 0 | 0 |

A simple threat exceeds both the current pure-Strike survival budget and the
pure-Flare light budget. It can still be affordable with a mixed plan, Ward, Oil
or a tonic. The reference level-2 comparison means power 8, 25 HP and 10 light,
without assuming a collected upgrade. These columns measure thresholds, not tiers
alone. Floor resources and upgrades are accounted for along the actual routes.

Rejected prior variants: 01 v0; 02 v0-1; 03 v0-1; 04 v0-1; 06 v0-2; 13 v0-1;
14 v0-3 (v0 hit the state budget). Rejected mixed variants: 01 v0; 04 v0-2;
13 v0-1. All other accepted seeds used v0. There were no construction failures,
unverified fallbacks, or extra attempts beyond the existing cap.

The revised search costs more per candidate, but fewer retries reduced total time
in this sample. These are wall-clock observations on this Windows development
machine, not phone benchmarks or a universal speed claim. The opening reserve
requires no extra solver and is checked constructively before acceptance.

The 100-candidate placement-only probe (mixed-probe-0 through mixed-probe-99) had
79 changed layouts, 69 houses with a tier >=3 in a depth-0/1 room, 15 with one
initially visible, and 86 with a tier-1 enemy deeper. Those are unverified placement
samples, distinct from the accepted batch above. Eleven zero-view openings retained
the prior placement and ten reverted to preserve their opening choices. Quiet
starts, gentle houses and occasional supply-blocked discovery remain possible.

### Distribution by floor and room depth

Regular spirits only; keepers are fixed and excluded. Each tier column lists
counts at tiers 1 / 2 / 3 / 4 / 5. Depth is graph distance from the entrance, not
room-array order or physical movement distance.

| Floor | Prior tier counts | Mixed tier counts | Prior mean HP / attack / XP | Mixed mean HP / attack / XP |
| --- | --- | --- | --- | --- |
| Ground | 85 / 53 / 7 / 3 / 1 | 77 / 48 / 11 / 8 / 2 | 18.33 / 5.68 / 1.54 | 18.96 / 6.05 / 1.70 |
| Upper | 20 / 24 / 32 / 15 / 5 | 30 / 27 / 25 / 9 / 1 | 25.32 / 7.75 / 2.59 | 21.87 / 6.93 / 2.17 |

| Depth | Prior tier counts | Mixed tier counts |
| --- | --- | --- |
| 0 | 48 / 0 / 0 / 0 / 0 | 30 / 11 / 4 / 2 / 1 |
| 1 | 46 / 52 / 0 / 0 / 0 | 47 / 37 / 5 / 6 / 1 |
| 2 | 11 / 13 / 8 / 0 / 0 | 16 / 13 / 4 / 1 / 0 |
| 3 | 0 / 12 / 21 / 17 / 0 | 12 / 13 / 20 / 7 / 0 |
| 4 | 0 / 0 / 10 / 1 / 6 | 2 / 1 / 3 / 1 / 1 |

Accepted candidates differ when retries differ. Mean regular-enemy budget was
322.63 -> 298.75 HP, 99.38 -> 95.13 attack, 29.88 -> 28.00 XP; generated supply
uses averaged 17.75 -> 17.63. This is selection among variants, not a budget nerf.
Every accepted revised candidate was also compared with the prior version of that exact
seed/variant; its complete profiles and all non-enemy-position content matched.

The broad return-later counts were already substantial in the preceding generator:
its solver eagerly explores, collects tools and looks across rooms before fighting.
This pass mainly moves interesting costs into earlier discovery and cheaper options
into deeper rooms; it does not claim that all returning encounters are newly
created, or that the solver's long exploration-first sequence is a human plan.

### Concrete generated choices and XP alternatives

- **hh-encounters-09 v0:** Entrance hall contains a 40-HP, attack-12 tier-5
  Shade 12. The ordinary winning route sees it on turn 11 at level 1, leaves it
  untouched, defeats spirits in the Scullery and Conservatory, then attacks it
  at level 3/power 10 on turn 137. Two Strikes plus two Flares cost 24 HP and
  8 light; the surviving kill reaches level 4. At first sight, no enumerated
  current-kit plan succeeded. A separate initially visible tier-2 Wisp is cheaper:
  Ward changes its pure-Strike survival threshold, while Oil saves a hit.
- **hh-encounters-03 v0:** Study Wisp 10 has 35 HP and attack 14, tier 5.
  It is discoverable through empty exploration and seen on turn 32. After kills
  in other rooms, the ordinary route attacks at level 4/power 12 on turn 128.
  Two Flares and one Strike cost 8 light and 14 HP, leaving 17 HP/2 light without
  a level-up. Its usefulness is not dependent on an immediate refill.
- **hh-encounters-04 v3:** a 28-HP, attack-8 tier-3 Shade 16 is visible in
  the initial square. It is expensive, yet beatable at level 1: Oil, two Strikes
  and two Flares spend one oil, 16 HP and 8 light, then restore to 25 HP/10 light
  at level 2. The ordinary witness delays it; a separately tested early-first
  route takes the fight on turns 1-5 and still wins with 17 supply uses preserved.
- **hh-encounters-01 v1:** the Guest chamber's tier-4 Wisp 13 is a favorable
  early matchup despite its tier. A legal Oil/Strike/Tonic/Strike/Flare/Flare
  plan spends one oil, one tonic, 24 gross HP and 8 light, reaching level 2 with
  1 XP carried. That early-first route wins with 15 supply uses preserved.

The optional Pantry in **hh-encounters-15 v0** contains a tier-4 Revenant 13
(44 HP, attack 10) and a Silver trinket. The verified route leaves that branch
unopened. This is an optional resource decision, not a prerequisite for finishing;
discovered destinations beyond the enemy remain legally selectable.

Three explicit alternative early-victory routes were replayed separately using
encounter-order-probe.mjs: seeds 01, 04 and 13 all won after taking a kit-affordable
strong enemy first. They preserved 15, 17 and 9 supplies respectively. There was
one two-Flare leveling kill across these routes and no consecutive pair. The next
encounter after each early victory still cost 8, 16 and 15 HP respectively; later
encounters continued to require mixed attacks or recovery. This does not prove
XP can never snowball, but it did not expose an effortless refill chain warranting
a change to XP, combat or recovery. These deliberately chosen alternative policies
are not included as spontaneous return-later behavior in the main batch.

## Verification results

All **92 tests** pass, including exact old-v4 golden continuation, new placement
invariants, opening closure versus real movement/travel, full witnesses, all exit
families, diary with a living Wisp, optional cleanup, exact undo/reload and
non-duplicated completion records. Repository and Haunted House TypeScript checks,
production build and whitespace checks pass.

Final Chrome 153 checks passed all 11 existing viewports (390x700, 375x667,
360x640, 320x568, 390x520, 667x375, 844x390, 768x1024, 1024x600, 1280x720,
1366x768), height changes and 200% text fallback, plus the complete **147-turn**
winning UI replay with exact state comparisons after every action. Focused exit
checks use native touch and keyboard at 390x700, 320x568 and 667x375. They verify
persistent footer controls, free Keep exploring, separate movement/completion,
queued Flare and stale DOM rejection, legitimate blocks, all three families,
undo/reload/re-entry and one completion record. No exceptions or failed requests.

Screenshots and machine reports are local/ignored: .haunted-checks/exit-before-diary-ready.png,
exit-before-results.json, exit-ready-390x700.png, exit-ready-320x568.png,
exit-ready-667x375.png, exit-browser-results.json and adventure-browser-results.json.
The final generated-combat and exit screenshots were visually reviewed. Physical
phone/Safari testing remains outstanding; the unavailable reported export was
replaced with the explicitly equivalent fixture described above.

## Reproduction and compatibility

```sh
node src/haunted-house/tests/encounter-batch.mjs --seeds 16 --output .haunted-checks/encounter-final.json
node src/haunted-house/tests/encounter-order-probe.mjs
npm run test:haunted
npm run typecheck:haunted
npm run build:haunted
node src/haunted-house/tests/browser-check.mjs
# Optional focused exit browser regression:
node src/haunted-house/tests/browser-check.mjs --exit-only
```

The comparison explicitly uses `encounters: 'prior'` and `'mixed'` on the same
`hh-encounters-00` onward seeds, interleaving modes. Default new adventure generation
uses mixed placement. Historical baseline/expanded modes remain unchanged; the
older adventure-batch script explicitly requests prior placement to reproduce its
historical results. Timing covers construction and production verification,
excluding diagnostic probes and route measurements.

Save version remains v4. Loading/importing never regenerates enemies or other
content. Restart restores the saved first undo frame, so it retains the exact old
house as well. The exit correction applies to compatible older v4 saves. No schema
migration or new saved UI state was needed. Completion IDs/awards are unchanged.

## Human phone checks

1. Compare early opponents; leave an expensive one untouched, improve in another
   room, and reconsider its exact preview. Does the cheaper alternative feel clear?
2. Try a favorable early hard fight. Does its XP create satisfying options without
   making the remaining encounters automatic? Try a different encounter order.
3. Recover the diary while leaving a spirit alive. Tap Exit, move to the entrance,
   choose Keep exploring, then leave explicitly. Check two separate one-turn costs.
4. Repeat with key and locket objectives; the locket must still visit its memorial.
   Queue Flare before opening the exit; no attack should occur.
5. Undo the ending, reload, leave again, and check one updated completion record.
   Rotate the phone and check both footer choices remain visible.

Physical-device safe areas, Safari/browser chrome, assistive speech, player pacing
and a wider seed sample remain human verification questions. No Firebase deployment
was performed. Before any later separately intended Hosting deployment, run
`npm run build:haunted`, then `firebase deploy --only hosting`. The generic root
build builds Ouija and is not a substitute.
