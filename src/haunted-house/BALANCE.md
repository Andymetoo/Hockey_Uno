# Haunted House balance experiment — September 2026

The retained change is **Flare = current power**, instead of power + 4. It still
costs 4 light, bypasses armour, avoids retaliation, and accepts prepared Oil +4.
Ward remains 3 light and halves the next Strike's retaliation, rounded up. Maximum
light, initial resources, food, candles and level-up recovery are unchanged.

The evidence supports trying this measured change with human players: all sixteen
seeds still produced legally verified wins, low-cost Flare-only refill kills became
less common, and ample recovery supplies remained. The solver took more fights and
about seven percent more turns. Whether that feels less like a short pocket puzzle
is the main remaining balance question; solver success is not a difficulty rating.

## Reproduce and inspect

```sh
node src/haunted-house/tests/balance-batch.mjs --phase baseline --output .haunted-checks/baseline.json
node src/haunted-house/tests/balance-batch.mjs --phase expanded --output .haunted-checks/expanded.json
node src/haunted-house/tests/balance-batch.mjs --phase all --compact --output .haunted-checks/balance-results.json
node src/haunted-house/tests/balance-batch.mjs --arithmetic --output .haunted-checks/arithmetic.json
```

The default batch is the sixteen literal seeds `hh-balance-00` through
`hh-balance-15`, variants 0–5, search budget 450, beam width 16. The checked-in
[compact results](tests/balance-results.json) retain every candidate outcome,
accepted route measurements, alternative encounter orders and fixed-state
arithmetic. Omit `--compact` to retain every inspectable-enemy sample as well.
Wall-clock timing varies with hardware and concurrent work.

The original generator was preserved as `ingredients: 'baseline'`. Sixty-four
baseline candidates (these seeds, variants 0–3) were compared with the original
`HEAD` generator: geometry, enemy statistics, supplies, objectives and starting
discovery matched exactly, excluding save version and the new explicit ruleset.
The old-versus-candidate experiment ran before the expanded-content assessment.
Both rulesets use the **same current solver**, including its Flare-finisher plan
and choice-aware tie-breaker; this controls search changes but is not a rerun of
the former solver's historical behavior.

## Candidate acceptance, including failures

| Configuration | Verified seeds | Raw variant-0 wins | Candidates tried | Rejected | Budget / exhausted / generation errors | Slowest attempt |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Original ingredients, old Flare | 16/16 | 14 | 20 | 4 | 0 / 4 / 0 | 5.19 s |
| Original ingredients, power Flare | 16/16 | 12 | 22 | 6 | 0 / 6 / 0 | 6.54 s |
| Expanded ingredients, power Flare | 16/16 | 11 | 21 | 5 | 1 / 4 / 0 | 5.66 s |

No seed exhausted all six attempts. Every accepted witness was replayed through
the real `act()` function. Rejected candidates are **unverified**, not proven
impossible. The expanded `hh-balance-01`, variant 0, hit the search budget; other
rejections exhausted this incomplete search's available plans.

Each cell below is **accepted variant (rejected candidates)**; this preserves the
failures rather than reporting only favorable maps.

| Seed suffix | Old Flare | Power Flare | Expanded |
| --- | --- | --- | --- |
| 00 | 0 (0) | 0 (0) | 0 (0) |
| 01 | 0 (0) | 0 (0) | 1 (1) |
| 02 | 0 (0) | 0 (0) | 0 (0) |
| 03 | 0 (0) | 0 (0) | 0 (0) |
| 04 | 0 (0) | 0 (0) | 0 (0) |
| 05 | 0 (0) | 0 (0) | 0 (0) |
| 06 | 0 (0) | 0 (0) | 0 (0) |
| 07 | 0 (0) | 0 (0) | 0 (0) |
| 08 | 0 (0) | 0 (0) | 0 (0) |
| 09 | 1 (1) | 1 (1) | 1 (1) |
| 10 | 3 (3) | 3 (3) | 1 (1) |
| 11 | 0 (0) | 0 (0) | 0 (0) |
| 12 | 0 (0) | 1 (1) | 1 (1) |
| 13 | 0 (0) | 0 (0) | 0 (0) |
| 14 | 0 (0) | 0 (0) | 0 (0) |
| 15 | 0 (0) | 1 (1) | 1 (1) |

## Actual successful routes

Totals cover sixteen accepted routes per column; parenthetical values are means
per route where shown. Plans use real discovery, preparations, regeneration,
supplies and objective actions. The solver favors preserving resources and useful
levels, not the fewest turns or the quickest possible ending.

| Measurement | Old Flare | Power Flare | Expanded |
| --- | ---: | ---: | ---: |
| Turns | 2,313 (144.56) | 2,472 (154.50) | 2,507 (156.69) |
| Hauntings defeated | 156 (9.75) | 193 (12.06) | 190 (11.88) |
| Strikes / Flares / Wards / Oils | 277 / 137 / 33 / 10 | 363 / 158 / 34 / 16 | 367 / 156 / 48 / 20 |
| Flare share of attacks | 33.1% | 30.3% | 29.8% |
| Pure-Flare kills | 23 | 9 | 19 |
| Kills in at most two Flares, immediately leveling | 8 | 3 | 5 |
| Consecutive such Flare-only refill kills | 0 | 0 | 0 |
| Level-ups / total light restored by leveling | 71 / 594 | 80 / 656 | 79 / 653 |
| Consecutive leveling kills, any tactic | 20 | 15 | 14 |
| Unused floor food | 135 (8.44) | 133 (8.31) | 131 (8.19) |
| Unused floor candles | 67 (4.19) | 67 (4.19) | 57 (3.56) |
| Remaining pocket tonics / oils | 31 / 22 | 31 / 16 | 30 / 30 |
| Mean final health / light | 24.75 / 7.25 | 19.25 / 6.50 | 24.38 / 7.25 |

Absolute Flare count rises in the candidate's longer routes, even though its share
and pure-Flare kills fall. The batch did **not** reproduce the reported consecutive
two-Wisp Flare refill chain under either ruleset; do not claim its disappearance
has been statistically established. Occasional inexpensive refill kills survive.

Acceptance can select different houses. Restricting the comparison to the twelve
seeds accepted at variant 0 under **both** rulesets controls that difference:

| Same twelve raw houses | Old Flare | Power Flare |
| --- | ---: | ---: |
| Turns / kills | 1,728 / 118 | 1,840 / 142 |
| Strikes / Flares / Wards / Oils | 211 / 107 / 25 / 7 | 273 / 117 / 24 / 12 |
| At-most-two-Flare leveling kills | 5 | 2 |
| Unused food / candles | 104 / 51 | 102 / 51 |

That is 6.5% more turns and 20.3% more kills on the same houses. It warrants human
pacing checks. It does not justify also cutting recovery or raising enemy stats.

For each configuration, the first four accepted houses were additionally solved
with health-favoring and light-favoring resource rankings: all **eight of eight**
alternate searches won. Encounter order differed from the balanced witness in
8/8 old-rule, 5/8 candidate-rule and 7/8 expanded searches. This establishes some
alternative legal routes in a small subsample, not universal multiple solutions.

## Encounter math and progression states

Before each newly engaged enemy on a legal witness, diagnostics sample **every
currently discovered living enemy**. These are real progression states and
plausible alternative targets. The following uninterrupted-attack arithmetic uses
the game's central preview. The same enemy may be sampled again at a later level;
these are exposure-weighted observations, not independent encounters.

| Measurement | Old Flare | Power Flare | Expanded |
| --- | ---: | ---: | ---: |
| Inspectable enemy samples | 1,076 | 1,358 | 1,052 |
| Mean Strike hits / health expenditure | 3.11 / 21.20 | 3.17 / 22.81 | 3.29 / 23.03 |
| Mean Flare hits / light expenditure | 2.21 / 8.85 | 2.98 / 11.92 | 3.12 / 12.48 |
| Ward changes full-Strike-plan survival | 25 | 37 | 33 |
| Ward saves at least 3 HP | 460 | 634 | 476 |
| Oil reduces Strike hit count | 412 | 527 | 333 |
| Oil reduces Flare hit count | 293 | 505 | 313 |
| Affordable at-most-two-Flare kill that would level | 49 (4.6%) | 12 (0.9%) | 14 (1.3%) |

An unaffordable all-Flare cost is intentionally reported, rather than pretending
that more than the current light can be spent. Strike health expenditure includes
the killing blow, before any surviving level-up recovery. Preparations first give
a wounded enemy its real regeneration; Ward or Oil can therefore have a negative
net benefit. Positive threshold counts only include available preparations.

A second control holds the **259 original variant-0 enemies** fixed and varies
synthetic player level. Full HP/light, unprepared buffs and the normal starting
pocket bottles are used, without collecting a primer. These arithmetic states
are **not asserted reachable**; they isolate the damage change from route order.

| Player level | Mean Flare hits, old → candidate | Affordable pure-Flare kills out of 259, old → candidate | Ward changes Strike survival | Oil reduces Strike hit count |
| --- | --- | --- | ---: | ---: |
| 1 | 3.06 → 4.75 | 99 → 18 | 38 | 194 |
| 3 | 2.36 → 3.06 | 175 → 99 | 6 | 110 |
| 5 | 1.87 → 2.36 | 216 → 175 | 1 | 86 |
| 7 | 1.64 → 1.87 | 239 → 216 | 5 | 55 |

The largest effect is early all-Flare affordability. Mixed attacks, safe finishing
blows and armour bypass remain useful; the actual candidate witnesses still use
158 Flares. Neither this table nor ability use alone proves balance quality.

## How generation uses the measurements

The ingredient expansion follows the isolated comparison; it does not change the
recovery tuning to compensate for Flare. Each generated house retains its baseline
food count and candle count. Recovery tiles are redistributed, with one food and
one candle in the entrance, at most four recovery tiles per room, and a preference
for earlier rooms on half of the remaining placements. Some rooms have no supply;
eligible optional leaves have a 40% chance to become quiet spaces.

One uniformly chosen reward replaces the guaranteed primer: +1 power; Heartwood
charm +4 maximum/current HP; or Alchemist's case with three pocket oils. It can
appear beyond the early rooms. Most enemies retain their ordinary role. A 28%
nomination rate considers one of two equal-probability traits: Brittle (+2 Strike)
or Smouldering (+2 Flare). A trait is added only when preview arithmetic at a
representative tier power reduces the corresponding hit count. There are no
resistances, mandatory ability quotas or live stat adjustments.

The keeper can occupy a deep or near-deep branch rather than always the first
deepest room; the locket memorial can be elsewhere on either floor. Both locations
are journalled. Key/tool construction order stays safe. Room-tree checks and actual
discovery-aware winning-witness replay both validate the result.

The solver considers Strike-first, Flare-first and Flare-finisher fights with
available preparations. A small score tie-breaker counts affordable next fights,
Ward survival thresholds and Oil hit-count thresholds, through the same preview
functions. This guides candidate acceptance through the bounded search without
requiring every tactic, demanding one solution, or modifying a candidate mid-run.

The omniscient search can know where a key or keeper ultimately lies even though
every individual action respects discovered eligibility. It does not prove that
players can infer all hidden-information choices, survive all reasonable errors,
afford all optional cleanup or finish within a target wall-clock duration. It is
also incomplete, especially for long fights requiring recovery midway. Continue
human Easy-mode playtests with non-primer rewards, quiet/poorly supplied branches,
the first keeper attempt, and deliberate late exploration using spare supplies.
