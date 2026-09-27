# Haunted House adventure-generation report

## Ingredient audit and scope

The preceding v4 and mobile passes were the starting point. This pass changes
Haunted House content/generation and focused presentation, with no Firebase
deployment or changes to the other games.

| Existing ingredient | What it did before this pass | New treatment |
| --- | --- | --- |
| Entrance plus ten room names | One common growing-maze algorithm; room names largely cosmetic | Fifteen identities including pantry, conservatory, chapel and sewing room; four architectural biases, weighted spirits/traits/recovery, appropriate objective settings, saved accents/flavor |
| Moth key, Thorn key, Crowbar | Reusable tools; caches chosen from earlier room-array positions | Discovery-accessible source selection, room-graph distance at most two, local/other-branch placement, short dependent chains, marked locks and matching icons |
| Exit key, diary, locket | Keeper reward; return to entrance, with memorial for locket | Same goal rules, but one/two seals, local/cross-branch prerequisites, entrance/side/inner memorial placement and actual-location descriptions |
| Food, candles, pocket tonic/oil | Shared house budget with uneven placement and early recovery | Same budget recipe; identity-weighted distribution; ordinary recovery stays outside the optional locked leaf |
| Primer, Heartwood, Alchemist's case | One randomly chosen progression find | Same single slot, expanded by four distinct effects; no pile of guaranteed new finds |
| Shades, wisps, hollow armour, revenants | Distinct deterministic stats/armour/regen | Preserved; room identities weight kinds, without live stat changes |
| Brittle, Smouldering | +2 damage from Strike/Flare respectively when a useful threshold changed | Preserved; room identity weights nominations, same preview-based threshold filter |
| Informational note and initial journal | Generic rule reminder and location guidance | Required guidance derived from actual placements; one optional inventory clue with its tool; clearly labelled rule/clue/flavor/objective text |
| Quiet optional leaves | Some rooms can be empty | Preserved; rooms are not added solely as padding |

A color/name change is cosmetic. Architectural opening/aisle patterns, supply and
spirit distributions, relevant damage bonuses, and prerequisite dependencies are
mechanical. Guest chambers and servants' halls share a basic weighting profile;
there are not fifteen wholly independent rule systems. Room identities are stable
IDs separate from names. Their saved presentation metadata does not reinterpret
old rooms. The graph uses a few procedural structural motifs, not arbitrary quest
scripting or hand-authored levels.

## New finds and exact rules

- **Grave-salt seal:** +2 Strike damage against shades/revenants, before armour.
- **Prism lantern:** +2 Flare damage against wisps/hollow armour. Flare still ignores
  armour; Oil and the relevant spirit trait add normally.
- **Mourning ribbon:** subtract 1 incoming Strike damage after Ward's division and
  upward rounding, minimum zero. No retaliation is added to Flare.
- **Ember flask:** restore 4 health and 4 light once, capped separately. Inspecting
  shows both actual gains and both waste amounts. Using it takes one turn, clears
  its tile, occupies that tile, reveals neighbors, and gives other wounded spirits
  their established regeneration turn.

The first three last for this adventure. They use no equipment slots or extra
resource meters. All four use stored effect snapshots and stable definition IDs;
previews and execution use the saved numbers. The single progression pool has
seven equally weighted definitions, so common food/candles/oil/tonics remain the
basic resource vocabulary. There is still only one progression-pool find per house.
The optional branch receives existing treasure and has a 40% progression-placement
chance; otherwise the progression find uses an eligible ground-floor room. Its
location is not guaranteed early or before every required fight.

Base Flare remains power damage, cost 4, no retaliation, armour bypass. Ward,
Oil, maximum light, food, candles, enemy-stat formulas, XP and level recovery are
unchanged. The new item contributions are the only combat changes.

## Dependencies and truthful clues

The constructed graph has an accessible pair of branches, one or two required
seals, a keeper on the inner trunk, and one optional locked reward leaf. Extra
rooms make short branches rather than lengthening every chain. Tool source rooms
must be discoverable with their own key withheld. Actual room-edge distances guide
local/other-room selection; the second tool in a two-seal chain must require the
first. Some sibling connections provide another initial discovery route without
crossing a mandatory seal.

Discovery validation models 3x3 reveal, diagonal viewpoints and one-turn selection
of eligible discovered destinations. It does not demand an orthogonal walking
path. Occupants are optimistically clearable in this structural check. Withheld
keys, closed endpoints and impossible viewing positions are accounted for. A
separate check rejects an alternate connection that bypasses a declared mandatory
seal. Doorway and memorial alcoves stop an impassable endpoint from accidentally
severing discovery of the near room.

Acceptance then solves with the locked optional branch unavailable, and replays
every action against the original complete house through `act()`. This checks
health, light, preparation, regeneration, keys, revelation and objective costs,
and proves an affordable win without requiring the optional prize. It does not
promise that every optional fight, spending order or hidden-information decision
is safe. No supplies are added after play starts, and rejected candidates never
silently become playable.

Required tool/keeper/memorial clues appear in the initial journal. The optional
inventory note sits in its tool's room, names the real reward, and reveals no other
optional contents. Players may find the gate before finding that note; guidance
exists before opening, but seeing it first is not guaranteed. Long explanations
stay in panels; no text-reading sequence is a new objective prerequisite.

## Reproducible batch

```sh
node src/haunted-house/tests/adventure-batch.mjs --seeds 16 --output .haunted-checks/adventure-final.json
```

Seeds are `hh-adventure-00` through `hh-adventure-15`. The prior case explicitly
uses `ingredients: 'expanded'`; the new case uses `'adventure'`. Both use the same
power-only Flare rules and search budget. Explicit historical `baseline` and
`expanded` generation remain byte-for-byte equivalent in twenty comparisons with
the committed preceding generator. The batch uses the same `verifyCandidate()`
acceptance function as production and replays every accepted witness.

| Measurement | Prior expanded ingredients | New adventures |
| --- | ---: | ---: |
| Accepted seeds / whole-seed failures | 16 / 0 | 16 / 0 |
| Candidates / rejected | 20 / 4 | 19 / 3 |
| Rejection reason | 4 search exhausted | 3 search exhausted |
| First-candidate successes | 13 | 13 |
| Same-room / different-room key-lock pairs | 13 / 24 | 16 / 24 |
| Maximum key separation, room edges | 4 | 2 |
| Maximum prerequisite chain, seals | 2 | 2 |
| Optional sibling shortcuts | 0 | 6 |
| Quiet rooms | 6 | 6 |
| Mean witness turns | 152.81 | 138.06 |
| Mean hauntings defeated / left alive | 10.94 / 4.63 | 9.81 / 6.25 |
| Mean health spent on attacks | 142.75 | 129.81 |
| Mean light spent on Flare/Ward | 42.75 | 41.50 |
| Mean supplies preserved, floor plus pockets | 14.75 | 16.50 |
| Mean generated food / candle light budget | 8.38 / 38 | 8.38 / 41 |
| Alternate-policy wins | 6 / 6 | 5 / 6 |
| Alternate wins with different encounter orders | 5 | 5 |
| Mean / maximum candidate validation time | 1.51 / 2.90 s | 3.23 / 6.49 s |

The accepted adventure sample includes all fifteen room identities, all seven
reward definitions, all three objectives, and eleven structural combinations.
New reward counts: Ember flask 3, Alchemist's case 3, Prism lantern 2, Heartwood
charm 2, Mourning ribbon 3, Ritual primer 2, Grave-salt seal 1. Key separations:
16 local, 18 one-edge and 6 two-edge. The new 60% different-room share is not an
increase over this prior sample's 65%; the improvement is constructive short
separation, explicit clues, distinct mandatory/optional roles and verified chains,
rather than forcing every key farther away.

New rejected variant-0 candidates were seeds 07, 09 and 12; variant 1 won for each.
Previous rejected variants were 08 variants 0/1, 11 variant 0, and 12 variant 0.
There were no construction failures, budget failures or unverified fallbacks in
the final batch. Earlier development concentrated all progression and some recovery
inside the optional lock: it accepted 16 seeds only after 28 candidates, rejecting
12. Moving ordinary recovery out and varying progression placement corrected that
avoidable restriction without increasing the budget recipe or changing base stats.

Alternate health/light policies were tested on seeds 00-02. Adventure 02's light
policy exhausted its search; the primary and health-policy witnesses both won.
That is a limit of this bounded policy, not proof of an impossible play order.
Room reentries averaged 13.00 versus 13.75 previously, but entries with no new
reveal increased to 8.13 from 5.88. That rough counter includes necessary returns,
remote kills and supply use; it cannot distinguish a tedious errand from a useful
resource decision. Graph distance is not movement cost under this game's rules.

Timings are wall-clock observations on this Windows development machine, with
browser/test activity during the batch, not a device performance benchmark. Four
additional sequential variant-0 probes (00, 01, 06, 13) measured new search at
0.75-4.06 seconds, construction at 23-36 ms and standalone dependency validation
at 10-18 ms. Search dominates latency; the broader batch's higher mean remains a
limitation to monitor. The worker remains responsive/cancellable, with unchanged
six-candidate, 450-state, width-16 limits. There is no claim that generation became
faster, or that a finite seed sample proves Easy balance or a 10-15 minute human run.

## Actual generated examples

These are verified seed/variant pairs from the final batch, not hypothetical
feature descriptions. Current metadata snapshots are also saved locally in
`.haunted-checks/adventure-samples.json`.

- **`hh-adventure-00`, variant 0, escape:** the Thorn key in the Scullery opens
  the Music room; its Moth key opens the Chapel, whose armour keeper holds the
  front-door key. An Ember flask sits in the Scullery. A Crowbar in the Attic can
  open the optional Pantry for its Silver trinket. The accepted route wins in 152
  turns with 14 supply uses preserved, without opening that optional branch.
- **`hh-adventure-01`, variant 0, locket:** the Pantry's Moth key opens the
  Guest chamber-to-Chapel passage. The Chapel's Crowbar opens the Sewing room;
  recover the keeper's locket there and return it to the Chapel memorial.
  The Guest chamber holds an Alchemist's case and the Thorn key for an optional
  treasure Study. The optional-skipping witness takes 150 turns and preserves 19
  supply uses. This is a cross-branch key followed by a short dependent tool chain.
- **`hh-adventure-13`, variant 0, diary:** the Guest chamber holds the Moth key
  for the Pantry-to-Library passage. The Library's Thorn key reaches the Sewing
  room keeper and missing diary. A sibling connection shortens initial access
  between the Guest chamber and Pantry. The Guest chamber's Crowbar also opens
  the optional Chapel, containing a Grave-salt seal and treasure: useful optional
  preparation against shades/revenants. The verified route skips it, takes 135
  turns, and preserves 14 supply uses.

## Presentation, saves and verification

Remembered walls now keep masonry seams, distinct fill and bevels; remembered
objects keep their type/color. Unknown tiles remain hidden. The compact phone
layout gives the board 425px of 700px (60.7%) at 390px width, with usable bars and
unchanged touch targets. Panning instructions moved to Help. Item and passage
controls occupy a non-scrolling footer while long content scrolls independently.
The enlarged-text contained layout and landscape arrangement remain available.

The additive schema stays at v4. Old v4 names, effects, placements, history and
rules continue unchanged; old fixtures and six full-state golden turns from the
old engine verify continuation. New definitions are copied into saves. Exact-house
restart restores the saved initial undo frame and gives the attempt a new ID.
Older builds are not guaranteed to understand the new optional fields/effects.
V1-v3 archives and duplicate-free completion records retain their prior behavior.

All 77 tests, both TypeScript checks and the Haunted House production build pass.
Focused tests cover new item thresholds/modifiers/recovery, regeneration, solver
use, old/new save roundtrips, full undo, exact restart, malformed effect rejection,
clue correctness, graph separation, discovery dependencies and gate bypasses.
Real Chrome 153 checks passed eleven viewports: 390x700, 375x667, 360x640, 320x568,
390x520, 667x375, 844x390, 768x1024, 1024x600, 1280x720, 1366x768; height changes;
200% text fallback; native touch/keyboard; all four new finds; matching key/lock
icons; persistent action footers; exact-house restart; and a 147-turn winning UI
replay with exact save comparisons. No exceptions or failed asset requests occurred.
Screenshots were visually reviewed, including a corrected narrow lethal preview
which now keeps the player's level visible beside the skull indicator.

Artifacts are local/ignored: `.haunted-checks/adventure-phone.png`,
`adventure-generated-combat.png`, `adventure-phone-memory.png`,
`adventure-note-320x568.png`, `adventure-prepared-lethal-320x568.png`,
`adventure-completion.png`, and `adventure-browser-results.json`.
Physical phones, Safari, animated browser chrome and hardware safe areas remain
untested; emulation does not establish those behaviors.

## Human playtest questions

1. Can you identify remembered walls and objects immediately after moving away?
   Open a long note or item on a short phone; Use/Collect and Close should stay visible.
2. Follow one cross-branch key clue. Is its matching lock clear, and does the return
   feel purposeful given one-turn travel to known destinations?
3. Try a seal, lantern or ribbon before a fitting encounter. Calculate its integer
   contribution from the details panel; check the bars and actual exchange agree.
4. Decide whether to open the optional prize branch. Is the clue useful early
   enough, and is the expected reward worth its fights and resource cost?
5. Play a locket seed with a side or inner memorial. Does its route feel different
   without becoming a fetch errand? Do whole runs still fit roughly 10-15 minutes?
6. Rotate, enlarge text, undo, reload and restart an old v4 adventure. Check stable
   controls, prepared buffs, exact saved content and one completion record per run.
7. Time generation on a physical phone. Is the bounded wait acceptable and Cancel
   responsive? Broader seed testing and human play remain necessary.

Build locally with `npm run build:haunted` before any later optional
`firebase deploy --only hosting`. The generic root build builds Ouija, not Haunted
House. This task did not deploy Firebase.
