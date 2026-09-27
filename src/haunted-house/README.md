# Haunted House maintenance notes

Haunted House is a deterministic resource puzzle at `haunted_house.html`, with its
own source, build, storage, and tests. Keep changes isolated from Hockey Cards,
Ouija, and Bomber Command. The existing home entry and page remain in place.

## Build, verify, and serve

```sh
npm install
npm run dev:haunted
npm run typecheck:haunted
npm run test:haunted
npm run build:haunted
npm run preview:haunted
```

Use `npm.cmd` in PowerShell if script policy blocks `npm`. Tests need native
TypeScript stripping (Node 22.18+ or 24+). No new runtime dependency is required.
The real Chromium check uses a local HTTP server and a separate headless profile:

```sh
node src/haunted-house/tests/browser-check.mjs
```

Set `CHROME_PATH` if Chrome is not at the default Windows installation path.
Artifacts go in ignored `.haunted-checks/`. Device sizes and touch are emulated;
this does not replace testing on a physical phone.

Reproduce the balance comparison in order (raw JSON goes in the ignored check
directory). The fixed-progression arithmetic probe supplements legal witnesses:

```sh
node src/haunted-house/tests/balance-batch.mjs --phase baseline --output .haunted-checks/baseline.json
node src/haunted-house/tests/balance-batch.mjs --phase expanded --output .haunted-checks/expanded.json
node src/haunted-house/tests/balance-batch.mjs --arithmetic --output .haunted-checks/arithmetic.json
```

**Build Haunted House before any optional Hosting deployment.** The root page
loads `haunted-build/haunted-house.js` and `.css`, which are ignored build outputs.
Deploying Hosting without rebuilding can serve an old Haunted House bundle even
when TypeScript source has changed. The generic `npm run build` builds Ouija and
is not a replacement for this command:

```sh
npm run build:haunted
# Optional, only when deployment is separately intended:
firebase deploy --only hosting
```

This iteration does not deploy Firebase. Generation uses an inline worker so the
root static entry and standalone Haunted House build both resolve it correctly.

## Settled gameplay contract

- Any discovered, empty, eligible destination can be selected in one turn,
  regardless of distance, walls, occupants between positions, rooms, or floors.
  There is no physical pathfinding. Invalid and no-op moves spend nothing.
- Occupying a tile reveals the surrounding 3×3 square, diagonals included, with
  no wall occlusion or recursive reveal. Discovery persists. Occupants can block
  a useful viewing position; an already discovered destination beyond them is
  nevertheless legal.
- Inspecting, selecting an attack mode, changing viewed rooms, reading panels,
  and cancelling a confirmation are free. Explicitly reading/clearing a note on
  the board is a committed action. Movement, attack, preparation, supplies,
  unlocking, passage travel, memorial, and exit each consume one turn.
- Discovered enemies and supplies can be acted on remotely. A surviving kill or
  supply use places the player on its cleared tile and reveals its neighborhood.
- An open doorway/stair offers two different actions: stand on the near endpoint
  to reveal locally, or travel through. Each costs one turn. A closed endpoint
  cannot be occupied or travelled through before unlocking. Tools are reusable.
- Strikes exchange damage simultaneously, including killing blows. A lethal
  exchange needs explicit confirmation and kills before XP or recovery resolves.
- A wounded living spirit regenerates its listed amount after every committed
  turn except an attack against that spirit, throughout all rooms. Food causes
  the same other-action regeneration as movement; it does not directly heal
  enemies. Defeated spirits never return. No passive player recovery exists.
- Rooms retain state; there are multiple rooms and floors, reusable keys/crowbar,
  and the escape-key, diary, and locket/memorial objective families.
- Full-run undo, restart, autosave, JSON export/import and seeded generation remain.
  No roaming enemies, random hits, surprise damage, or live stat scaling is used.

## Combat and tuning

`content.ts` holds `TUNING`, initial resources, XP requirements, and displayed rule
text. `game.ts` owns the preview and transition math; the solver and diagnostics
use those functions. Preview exposes contributions, the immediate exchange,
level-ups, and final recovered resources. The same XP helper is used by previews
and execution. Do not add a second combat implementation to the UI or solver.

| Rule | Current value |
| --- | --- |
| Start | 22 HP, 6 power, 8/10 light, level 1, 1 tonic, 1 oil |
| Strike | power + prepared Oil + trait bonus + collected relic bonus − armour, minimum 1; retaliation simultaneous |
| Flare | 4 light; current power + prepared Oil + trait bonus + collected relic bonus; ignores armour, zero retaliation |
| Hollow armour | subtract 2 from Strike damage |
| Ward | 3 light and one preparation turn; halve next Strike's incoming damage, rounded up |
| Oil | one bottle and one preparation turn; +4 on next Strike or Flare |
| Food | ceil(60% of maximum HP), capped; consumed on its tile |
| Candle | 8 light, capped |
| Tonic | ceil(50% of maximum HP), capped; pocket use takes one turn |
| Level-up | level + 2 XP; +3 max HP, +2 power, full HP/light; carry excess XP |

Ward persists through Flares. Oil is consumed by the next attack. Both remain visibly marked until consumed. Preparations also give wounded enemies
one regeneration turn. Food/candles can be deliberately wasted to clear a tile.

The isolated balance change is **Flare's base damage from power + 4 to power**.
Cost, armour bypass, retaliation avoidance, Oil, Ward, maximum light, food,
candles, and level recovery were retained. `classic` is an explicit internal
benchmark ruleset; it is not a promise to resume old saves under the new content.
See `BALANCE.md` and the reproducible balance script for paired seed evidence,
rejections, route metrics, and limitations. Solver use counts are not player
preference or a proof of fun. Occasional refill chains are intended.

## Mixed encounters and explicit completion

The current pass redistributes regular enemy profiles across existing encounter
slots, with soft depth/theme weights, occasional initially visible strong enemies,
and easier deeper encounters. It preserves each candidate's exact stats, XP,
supplies, room counts and keeper. Existing saves and exact-house restarts are never
redistributed. Combat, regeneration and progression rules are unchanged.

Opening safety uses actual empty-destination discovery and open passage travel,
reserving up to two independently affordable early fights where geometry permits.
The existing real-engine winning-witness and optional-branch checks remain the
acceptance authority. See [ENCOUNTERS.md](ENCOUNTERS.md) for placement rules,
reproducible comparison, measured affordability, limitations and playtest questions.

Completion uses one authoritative exitReadiness() calculation: escape key, diary,
or completed memorial, plus standing at the saved entrance in an active run.
Cleanup never gates leaving. The ready objective control becomes Exit; the entrance
retains a door marker beneath the player. Both open a compact panel with a visible
Leave with diary/key (or quieted house) action and free Keep exploring. Movement to
the entrance and leaving remain separate one-turn actions, with no automatic ending.
Opening exit controls clears only transient combat selection and queued Flare.

Current verification: 92 passing tests, both type checks, production build, eleven
Chromium viewports and a 147-turn UI witness. The paired seed batch accepted 16/16
houses in each mode; revised placement needed 22 candidates versus 32, with similar
remaining supply margins. Physical phones and Safari remain untested; exact metrics
and the exit-fixture limitation are in ENCOUNTERS.md.

## Ingredients and adventure generation

The preceding adventure pass added mechanical room identities, short tool dependencies,
optional locked rewards, and four saved-effect finds. The ingredient audit and
reproducible seed findings are in [ADVENTURES.md](ADVENTURES.md). The earlier
Flare experiment remains in [BALANCE.md](BALANCE.md); no base combat tuning was
changed in this pass.

The existing Ritual primer (+1 power), Heartwood charm (+4 maximum/current HP),
and Alchemist's case (3 pocket oils) share one progression slot with:

| Find | Effect for this adventure |
| --- | --- |
| Grave-salt seal | +2 Strike damage against shades and revenants |
| Prism lantern | +2 Flare damage against wisps and hollow armour |
| Mourning ribbon | Subtract 1 incoming Strike damage after Ward rounds up, minimum 0 |
| Ember flask | Restore 4 HP and 4 light once, each capped; show both wastes |

Damage bonuses apply before armour and stack with Oil/traits. Permanent here means
this run only. Relic definitions have stable IDs, but the actual name/effect is
copied into each supply; active bonuses derive from its collected flag. Undo
therefore removes a collected bonus with the same flag it restores for every
supply. Recovery flasks remain floor supplies, require explicit use, and give other
wounded spirits their normal regeneration turn. They count as one conserved use.
No equipment slots, new resource meters, unlocks, or permanent grinding were added.

Ordinary shade/wisp/armour/revenant and Brittle/Smouldering remain. Enemy values
are fixed at generation. A room's identity weights spirit kinds, food/candles and
trait tendencies, rather than guaranteeing a package. Carving still grows a seeded
maze with junctions and loops; four architectural biases create broad chambers,
aisles, galleries or alcoves. The identity pool now includes pantry, conservatory,
chapel and sewing room alongside the established domestic/service/private/storage
rooms. Accent and short atmosphere are stored in the room, independently of its
stable identity ID. The house stays at 6-8 rooms over two floors.

Adventures construct a short graph with an accessible pair of branches, one or two
required seals, a keeper beyond them, and an optional locked reward leaf. Extra
rooms attach as small branches. Some keys are local; others come from another
accessible room. The source chooser checks actual discovery closure and graph
distance (at most two room edges), and the second tool in a chain must require the
first seal. Tools remain reusable. Optional sibling shortcuts stay outside the
required seals and help initial discovery; after destinations are known, the
existing one-turn remote movement already avoids physical backtracking.

The three objective families still end by returning the keeper's key/diary to the
entrance, or placing its locket at a memorial and leaving. Structures vary one/two
seals, local/cross-branch first tools, and entrance/side/inner memorials. Room
identity weights suitable keeper and memorial settings. These are bounded graph
motifs, not arbitrary quest chains or a library of authored levels.

Food/light totals use the existing per-house budget. Recovery and loose pocket
consumables stay outside the locked reward leaf; that branch receives existing
treasure, and sometimes the one progression find. Otherwise progression is in an
eligible ground-floor room, not necessarily before the required fights. Validation
proves the optional branch can be skipped. Quiet eligible leaves remain possible.
Nothing is added after mistakes.

Required tool/keeper/memorial guidance is generated from actual positions in the
initial journal. An optional household-inventory note is placed with that branch's
tool and names its actual prize. It can be read before choosing to open the lock,
although the player may discover the lock first. Notes distinguish rules, clues,
objectives and atmosphere; reading panels is free, collecting a note is one turn.

`dependencies.ts` computes optimistic discovery using eligible discovered
positions, 3x3 reveal, free-distance movement, removable occupants and actual
passage endpoints. It checks tools with their own key withheld, prerequisites,
objective reachability, and whether mandatory seals can be bypassed. This is not
physical pathfinding and not a health proof. Doorway/memorial alcoves avoid a
locked endpoint inadvertently severing exploration of its near room.

`verifyCandidate()` then runs the bounded solver with the optional locked branch
excluded, and replays its winning witness against the untouched actual house via
`act()`. Acceptance therefore proves a legal affordable win which can skip that
branch. The full playable house retains it. Previews, combat, recovery, keys and
revelation are the same engine in play, search and replay. Search remains bounded
at six candidates, 450 expanded states, width 16, in a cancellable worker. Failure
is explicit; there is no unverified fallback or live adjustment.

This proves existence of one legal winning sequence, not that every reasonable
choice wins, that hidden information is inferable, that all cleanup is affordable,
or that every alternative has equal difficulty. Search is incomplete: rejection
means unverified, not mathematically impossible. Human pacing and understanding
still require playtesting.

## Mobile interaction contract

The mobile combat input contract remains unchanged. Exit controls clear combat intent for free. `interaction.ts` holds ephemeral target and
Flare-queue state; it never enters an autosave or undo frame. `game.ts` remains the
only combat authority. Visual bars use its immediate preview values, and separate
indicators describe a surviving level-up. Recovery never conceals lethal damage.

- First activation of an unselected spirit selects and previews Strike, for free.
  Activate the selected spirit again to Strike exactly once. These are sequential
  taps, with no double-click timer. Changing target never attacks.
- The permanent Flare control toggles a free queue. While queued, first target
  selection stays free; activating the selected target casts once. A successful
  cast, another committed action, movement, or room change cancels the queue.
  Rejected actions and ordinary free inspections preserve it; opening exit controls clears it. Insufficient light explains
  the exact requirement; there is no silent fallback to Strike.
- Ward, Oil, Tonic, and quest inventory open explanations. Only Use commits.
  Prepared buffs remain marked until the engine consumes them. Supplies show
  exact restoration and waste before explicit collection, including full-health
  food. Faded annotation is information, with no stat/XP/quest reward; actually
  reading and clearing it still takes its established turn and discovery action.
- Open doors/stairs expose local standing first, separately from travel. Closed
  passages require Unlock before either action. Viewing a known room is free;
  choosing an eligible destination there retains one-turn remote movement.
- Only a click activation commits, never both touch-end and click. Connected DOM
  nodes, render epochs, entity identity, and trusted pointer sequence guards reject
  stale or duplicated activations. Held Enter/Space/WASD/Z cannot repeat actions.
  A defeated target loses its actionable selection immediately. Lethal confirmation
  is bound to the current state; cancelling changes no gameplay or queued intent.
- Undo, load/import, restart, and room selection clear transient targets/queues.
  Dialogs trap focus, Escape/Close restore the originating control with
  `preventScroll`, and removed controls fall back to a valid player tile/control.
  Combat-card accessible names include the same immediate health/light losses,
  traits and outcomes as their visual content. Details remain keyboard accessible.

Keyboard: Tab to the board; arrows browse cells, Enter/Space activates. W/A/S/D
requests a single-tile move, Z undoes. Arrow browsing pans only the board when
needed. Neither selection nor opening explanations moves the page. The encountered
spirit directory and enemy-jump buttons are removed; the compact room selector
retains room viewing and entrance travel.

## Playing surface and small-screen fallback

Portrait uses a 44px header, the board in remaining height, a stable 56px ability
strip, then a 160px region for side-by-side player/enemy cards and an intent line.
The board occupies about 61% of a 390x700 viewport. This is available-space sizing,
not a rigid ratio; short landscape uses its existing split layout. Player health,
light, power, current Flare damage, XP, level, and prepared buffs stay visible.
The enemy card retains its dimensions with no selection. Hatched segments and
boundaries distinguish projected losses; skull/defeat/level-up marks supplement
color. Tap either card for power, Oil, armour, traits, Ward rounding and recovery
arithmetic. There is no separate attack button or auto-scroll to inspection.

The playing surface uses `visualViewport.height` (with dynamic viewport CSS
fallback), updates on resize without re-rendering game state, and includes safe-area
padding. The root page enables `viewport-fit=cover`. Desktop uses the same compact
model, capped at 760px wide and 900px tall; tiles cap at 56px. Landscape at least
560px wide and at most 500px tall places the board left and abilities/cards right.
The main gameplay document does not scroll at the tested default sizes.

Board tile size is calculated from actual remaining width/height after controls,
padding and borders. Tiles never shrink below 32px; insufficient room uses contained
board panning and keyboard navigation. Panning instructions live in Help, with
no permanent text over the board. Frequent ability/header
controls are at least 44px. Exceptionally small views and enlarged text have an
explicit Menu > larger-text reading layout: the playing surface scrolls internally,
abilities wrap, and player/enemy details stack and grow with text. This fallback
trades the single-screen arrangement for readable controls; the document remains
contained. Rules, journal/objective, activity, inventory details, save controls,
records, and reports use internally scrolling native dialogs. Compact item/passage
dialogs sit over the board on portrait screens, with more available height. Their
Use/Collect/standing/travel/Close controls occupy a separate, non-scrolling footer;
only explanation text scrolls. Footer space is reserved, never laid over content.
Remembered walls retain their fill, masonry seams and bevels, distinct from floor;
remembered objects retain their silhouettes/colors. Unknown tiles stay concealed.
Undo remains in the header.

## Pixel icons and palette

The referenced Dungeon Ascendance screenshot and Urizen sheet were not present in
the workspace. No external sprites or invented license/attribution were shipped.
`icons.ts` contains original 16x16 SVG paths/rectangles and the centralized
`icon()`/`supplyIcons` mapping. Spirit silhouettes differ (shade, wisp, hollow
armour, revenant); supplies use consistent food ochre, candle amber, tonic rose,
oil gold, and quest/reward gold/green/violet. Architecture is muted green/grey.
Existing mansion title art remains. No emoji are used as the final icon system.

SVGs use crisp edges with pixel rendering and do not sample a sprite sheet, so
there is no sprite bleed. Accessible names come from surrounding controls; SVGs
are decorative. Selection outlines/corners, queued plus marks, prepared checks,
locks and unavailable dashed/hatch patterns supplement colors. A later Urizen
substitution should be confined to this mapping after receiving the actual sheet,
measuring its cell dimensions/gutters, and verifying its supplied license.

## Saves and completed runs

The current slot is `haunted-house.save.v4`, with the explicit `power-flare`
ruleset. V1, v2 and v3 slots remain untouched and separately downloadable. Old
imports explain that a new adventure is required; they are never silently
converted. Exact v3 continuation is not claimed.
The additive relic and room metadata fields keep version 4. Current code continues
pre-relic v4 saves without migration or regeneration; a frozen old save and six
full-state golden turns from the old committed engine verify this boundary. New
relic saves require this build; compatibility with an older reader is not promised.
Effect snapshots, stored names/placements and metadata roundtrip unchanged. Restart
restores the saved first undo frame and assigns a new attempt ID, preserving the
exact house even if generation algorithms have since changed.

Future incompatible tuning/content changes must use another explicit save/rules
version or a verified compatibility path, not reinterpret existing v4 runs.

Geometry/content is stored once, while undo frames store mutable resources,
enemy HP, used/opened flags, inventory, discovery, position, objective status,
notes and log. Prepared buffs, new traits/rewards and full history survive JSON
roundtrips. Validation accepts dead or resource-exhausted runs without solving
them. Storage failures stay visible; export preserves an in-memory run. Failed
parsing leaves the original bytes alone.

Every fresh interactive adventure/restart gets a stable run ID; load/import/undo
retain it. `haunted-house.completions.v1` stores one report per attempt. Loading or
re-entering an ending updates the same record instead of adding another award.
Undo does not erase the historical completion. Ending again after exploration
updates that attempt's report. There are no permanent stat gains or unlocks.

## Completion definitions

The report shows objective completion, defeated/total hauntings, discovered/total
playable tiles, treasure collected, preserved floor and pocket supplies, and turns.

The exploration denominator is the non-wall tiles that can be revealed from the
entrance under the game's 3×3 discovery and passage rules, with removable occupants
cleared and gates open. It excludes inaccessible geometry and decorative walls.
A memorial can count when seen without being occupied. This is a geometric target,
not a guarantee that every resource-spending route can still achieve full discovery.
No requirement exists to stand on every tile.

Conservation counts unused food and candles as uses, loose tonic/oil quantities,
and pocket tonic/oil bottles. An unused Ember flask contributes one recovery use,
not separate health/light points. Pocketing a bottle transfers it rather than counting
it twice. Prepared Oil is already spent. Treasure, notes, keys and permanent finds
are not consumables. Unseen unused floor supplies still count.

Commendations are independent, with no combined perfect grade:

- Into the morning: complete the objective and leave alive (the main achievement).
- Curious explorer: discover at least 80% of playable tiles.
- Peacebringer: defeat at least 75% of hauntings.
- Treasure finder: bring out any treasure.
- Well provisioned: preserve at least three consumable uses across floor/pockets.

Spending supplies to finish exploration is a valid competing achievement. Raw turns
are displayed but never used as a universal ranking across house sizes. Thresholds
intentionally avoid requiring tedious full cleanup.

## Gameplay/content baseline verification (preceding pass)

The original 30-test suite passed before the changes. The expanded suite then had
49 passing tests covering combat/preview agreement, lethal and level-up ordering,
buff consumption, traits/rewards, cross-room regeneration, free-distance movement,
landing/travel, prerequisite placement, scoring, save archives, exact roundtrips,
full undo, duplicate completion records and actual static/development entries.
Six generated adventures replay every witness action with JSON reload after each
turn, then undo all the way to the initial state. Additional batches inspect 40
ingredient/prerequisite seeds and 30 geometry seeds.

Repository typecheck, Haunted House typecheck, production build, and whitespace
checks passed. The final `haunted-build/` assets were rebuilt locally; no Hosting
deployment was run. Only Haunted House source/docs/tests were changed; the existing
entry page and home button remain intact.

The preceding layout had desktop inspection panels and scrolling phone controls.
Its browser evidence is superseded by the adventure verification below.
The gameplay/content balance results remain historical evidence. This adventure
pass keeps those base rules and compares its additions separately.

The controlled balance batch accepted 16/16 seeds for each of old rules,
power-only Flare, and expanded ingredients. Rejected candidates were 4, 6 and 5;
none silently fell back. At-most-two-Flare leveling kills changed 8 → 3 → 5;
average turns changed 144.56 → 154.50 → 156.69. The baseline did not reproduce the
reported consecutive two-Wisp chain, so this is evidence of reduced opportunities,
not proof that every chain has disappeared. Recovery supplies remained plentiful.
See [the full report](BALANCE.md) for per-seed rejection outcomes, actual route
measurements, alternative encounter orders and fixed-progression arithmetic.

The main remaining balance risk is longer routes/more fights. Hidden-information
fairness and Easy-mode feel cannot be established by an omniscient witness. Physical
phone safe areas, browser chrome, zoom, and human pacing still warrant playtesting.

## Adventure pass verification (historical)

All 77 tests pass, including input/bar regressions, 144 preview/execution
combinations, four new saved effects, six old-engine golden continuation states,
clues, gate bypasses and a winning witness which skips its locked optional branch.
Existing discovery, persistence, scoring and completion tests remain in the suite.
Repository and Haunted House TypeScript checks, production build and whitespace
checks pass. No Firebase deployment was performed.

The reproducible 16-seed adventure batch accepted every seed with three rejected
candidates and no fallback. It exercised all fifteen room identities, all seven
progression finds and all three objectives. Twenty-four of forty key-lock pairs
were in different rooms, at most two edges apart. Search took longer on average
than the previous generator; successful witnesses preserved ample supplies, but
neither observation proves human pacing or Easy-mode feel. Read
[ADVENTURES.md](ADVENTURES.md) for the full audit, failures, alternate policies,
performance limitations and actual generated adventure examples.

Real Chrome 153 checks in tests/browser-check.mjs passed at 390x700, 375x667,
360x640, 320x568, 390x520, 667x375, 844x390, 768x1024, 1024x600, 1280x720 and
1366x768. They include height changes 700 -> 580 -> 480 -> 700 and a 200% text
contained reading fallback. The board occupies 425px of a 700px phone viewport
(60.7%). Tests verify remembered walls, new icons and names, long-note action
footers on short screens, stable controls, native touch and keyboard activation,
exact item/preview outcomes, reusable matching keys, local standing versus travel,
undo/reload, saved effect snapshots and exact-house restart. A complete 147-turn
winning witness runs through public UI controls with exact save comparisons after
every action and duplicate-free completion records. No browser exceptions or
failed asset requests occurred.

Screenshots were visually reviewed. Local ignored artifacts include
.haunted-checks/adventure-phone.png, adventure-generated-combat.png,
adventure-phone-memory.png, adventure-note-320x568.png,
adventure-prepared-lethal-320x568.png, adventure-completion.png and
adventure-browser-results.json. Physical phones, Safari, animated browser chrome,
hardware safe areas and assistive-technology speech remain untested; Chromium
emulation cannot establish those behaviors.

The latest encounter/exit verification supersedes this historical batch; see
[ENCOUNTERS.md](ENCOUNTERS.md).

## Short phone playtest checklist

1. Move away from revealed walls and objects; confirm their identities remain
   readable. Open a long note or item; Use/Collect and Close should stay visible.
2. Inspect two spirits, Strike, then queue/cancel/cast Flare. Try a new relic and
   compare its detailed integer contribution with the bars and actual exchange.
3. Follow a cross-branch key clue and match its lock. Decide whether the optional
   prize is worth its fights; judge whether return trips feel purposeful.
4. Rotate, show/hide browser controls, enlarge text and try the reading fallback.
   Inspect a landing and compare standing locally with travelling through it.
5. Undo, reload and restart an old v4 save; confirm exact content and prepared
   buffs, stable focus, no stale target and one completion record per attempt.
6. Time a new house on a real phone and play to completion. Does generation feel
   responsive, and does the adventure still fit the intended 10-15 minute pace?

Further human questions and measured limitations are in [ADVENTURES.md](ADVENTURES.md).
