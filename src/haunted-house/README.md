# Haunted House maintenance notes

Haunted House is a deterministic puzzle adventure at `/haunted_house.html`, linked
from the existing minigames home page. Its source, styles, build, and storage are
isolated from Hockey Cards, Ouija, and Bomber Command. No game clock runs while
the player thinks, explores, or closes the page.

## Run and verify

```sh
npm run dev:haunted
npm run typecheck:haunted
npm run test:haunted
npm run build:haunted
npm run preview:haunted
node src/haunted-house/tests/browser-check.mjs
```

Use `npm.cmd` on PowerShell installations that disable scripts. Tests use Node's
native TypeScript support. The browser check uses Chrome DevTools Protocol and
a separate headless profile; set `CHROME_PATH` if necessary. Generated screenshots
belong in the ignored `.haunted-checks/` directory. No new runtime package is
required.

The static entry page loads `haunted-build/haunted-house.js` and its stylesheet.
Run `build:haunted` before serving the repository as static files. Those generated
files are ignored by Git. The dedicated Vite development configuration instead
loads the TypeScript source. A build does not publish or deploy anything.

## Resource and action contract

`content.ts` centralizes initial light **4/5**, permanent ritual power **1**, fixed
capacity **5**, discovery radius, generation budgets, route speed, and history
limits. Banishment costs `max(1, resistance - ritualPower)`. Power is never spent.
The displayed cost is charged once, simultaneously with removing the haunting
and granting its defined reward. Requirements and adjacent interaction access
are checked before any mutation. Rejected actions spend nothing.

Hauntings remain on their floor tiles and block traversal until banished or
resolved by the keepsake objective. They never move, chase, attack, or react to
walking. Inspecting is free. Candles are solid, separately activated objects:
each has a finite restoration amount and a persisted used flag. Preview the
received amount and capacity waste before committing. Passing a candle does not
activate it. Zero light does not affect visibility or end the run.

The crowbar and shaped keys are reusable. Containers grant their authored rewards
once; their contents are generated in advance. Escape requires the front-door
key; the retrieval objective requires carrying the diary back. The keepsake
objective requires the silver locket, an explicit one-light memorial action, and
returning to the entrance. Its ritual cost appears in the objective from the
start and in the gallery guardian's access preview. The memorial action removes its associated
haunting and grants that haunting's reward. Clearing every spirit or collecting
every treasure is unnecessary.

`game.ts` resolves immutable actions, resource previews, discovery, and undo.
`world.ts` provides terrain, traversability, connections, remembered discovery,
and the seed PRNG. Exploring does not advance the PRNG. `movement.ts` plans
cardinal routes only through known traversable tiles in the current room; doors
and stairs are terminal destinations, never hidden intermediate shortcuts.
Stepping onto an open endpoint crosses to its peer. An occupied starting endpoint
also supports explicit travel. A route stops when it reveals a new meaningful
choice. Movement never searches, unlocks, refills, or banishes automatically.
Dialogs, conflicting input, undo, restart, and a new house cancel pending routes.

## Content and room authoring

`room-patterns.ts` contains authored ASCII footprints. `#` is wall, `F` is solid
furniture, `N/E/S/W` are available floor anchors for connections, `P` is the
opening position, and lowercase letters are content anchors. Unused anchors
remain ordinary floor. Each pattern has its own dimensions and actual walls:
closets, storage rooms, narrow halls, an L-shaped study, a candle alcove, divided
interiors, and larger rooms with routes around furniture. Furniture descriptions
match room identities. A closet does not need two neighbors per floor tile.

Keep row lengths equal. Preserve cardinal reachability and an adjacent floor
position for every solid interaction. Put spirits on ordinary floor, never on
arrival endpoints. Ports must be unique per room. Same-floor connections use
opposing doorway directions and neighboring schematic coordinates; stairs join
adjacent floors. An obstacle intended to guard something needs a real one-tile
throat or equivalent barrier. Do not rely on its label to make it a guard.

`generation.ts` selects an objective and one of three opening resource patterns:
an inexpensive power reward, early crowbar access, or a ward protecting a visible
candle. Their resistances and candle arrangements vary action order. The main
dependency joins a reusable crowbar, a boarded study and ritual manual, a shaped
key, upper-floor replenishment, and a gallery guardian. Optional ingredients add
a ritual folio, further power or treasure, spare candles, and connecting loops.
The linen closet is genuinely quiet. Optional rooms are not all reward rooms.

Current budgets are **8–12 rooms**, **2–3 floors**, **5–8 hauntings**, and **3–5
candles**. These are pacing bounds, not an unrestricted architecture engine.
The authored dependency backbone occupies eight rooms; further rooms create
alternate approaches, optional rewards, and quiet space. Extending below eight
or above twelve rooms requires adding compatible graph ingredients, not merely
changing the numeric budget. The same applies when extending beyond three floors.
The recipe intentionally stays small enough to inspect and balance.

Use typed `Reward` fields (`power`, `item`, `treasure`), `Lead` references, and
`PuzzleCluster` members. Notes interpolate actual room names and object IDs.
Spirit benefits describe their actual reward or access. Add new item text in
`content.ts`, identifiers in `types.ts`, and behavior in `game.ts`. A mechanic
that affects future reachability or affordability also needs solver and
structural-validation support.

## Generation, physical validation, and the solver

`createGame(seed, options?)` retries at most `TUNING.generationAttempts`. Each
finished house is validated before being returned. Tests can pass `attempts`,
`solverBudget`, or `forceFallback`. Failed construction, unsolvable geometry,
and exhausted search all cause bounded retries. A fixed authored eight-room
fallback is independently validated using the normal solver budget. The original
public seed remains in the save. Replaying normal generation for that seed
reproduces its normal initial state; forced fallback options are for tests.

`validateHouse` is a **new-house solvability check**, never a save-load gate. It
checks dimensions, paired endpoints, direction and floor consistency, physical
containers/candles, references, all-open tile reachability, and interaction
positions. For each `haunting.guards` ID, it removes every other spirit and opens
all gates, then proves the target still cannot be reached or interacted with.
Removing the named guard must make it reachable. This rejects casual bypasses.

`solver.ts` floods the current safe component and enumerates meaningful reachable
banishments, refills, pickups, unlocks, memorial actions, and escape. It uses
bounded bit masks for removed spirits, used candles, claimed containers, and
opened gates, plus inventory, permanent power, light, objective state, and the
reachable component. Dominance only discards a state when all those relevant
facts match and an equal or higher light state already exists. Score-only
containers and narration can be omitted because they cannot enable completion.
An unclaimed treasure spirit is still considered because its tile may block a
route. Pure walking is collapsed, not counted as a resource action.

The solver returns `solved`, `unsolvable`, or `exhausted`, an explored-state
count, and a witness of actions with physically reachable interaction positions.
Only actual objective completion and return to the entrance count as solved.
The search budget defaults to 30,000 accepted states. A zero budget or oversized
mask collection returns `exhausted`; it does not claim impossibility. Current
authored budgets stay well below the 30-entity-per-mask limit.

The solver knows hidden content. Its proof establishes resource feasibility,
**not player understanding**. `validateInformationFairness` separately verifies
that each local cluster can be freely surveyed from its stage's safe vantage,
with all its costs, rewards, and candles discoverable before a commitment.
Clusters use the same Manhattan discovery radius as play; later gated clusters
have their own vantages. Authored clues describe required capabilities beyond
those gates. These checks and the explicit ordering fixtures constrain hidden
information traps, but do not establish that a new player will notice, remember,
or correctly interpret the available information. Human playtesting is required.

## Undo and persistence

Each successful consequential action stores its complete pre-decision snapshot.
Walking and inspection do not add history entries. The bounded stack currently
holds **12 decisions**. Undo restores resources, inventory, claimed rewards,
containers, gates, spirits, used candles, objectives, player position, journal,
exploration, and deterministic state. Exploration accumulated after that snapshot
is also rolled back. There is no nested undo history inside a snapshot, and no
loot is rerolled. Undo itself is autosaved.

New saves use **`haunted-house.save.v2`**, schema version **2**. The complete world,
seed, PRNG, exploration, current state, and bounded undo history are serialized.
Continue restores that data exactly. Restart This House regenerates the normal
initial state for the same seed; New House requests a new seed. Committed walking
and decisions autosave. Writes are read back to verify persistence and report
failures truthfully.

`validation.ts` checks structure, types, bounds, references, and history safely.
It deliberately does **not** run the solver. A player can spend light badly and
still have a legitimate save, including a state that requires undo to escape.
No visible affordable action means only a local lack of options; it does not
prove a global dead end.

The adapter reads only the two Haunted House keys. **`haunted-house.save.v1` is
preserved**, never converted, cleared, or overwritten. If only that earlier save
exists, the UI explains the changed rules and offers a new house and a raw data
download. That archive remains downloadable from the journal after saving and
reloading a v2 adventure. No second gameplay engine is included. Unreadable v2 data is retained
until explicitly replaced; its raw data can also be downloaded. Never touch
another game's keys.

## Verification and balance questions

Tests cover exact costs and atomic rewards, insufficient resources, zero light,
manual capped refills, the specified 4/5-light ordering puzzle, a cheapest-first
trap, physical access and guards, distinct footprints/floors, bounded generation,
solver budget exhaustion and fallback, local information fairness, complete
walked adventures, exact persistence, valid resource-dead-end saves, undo,
legacy preservation, and click-route isolation. Browser checks cover keyboard,
touch, panels, reload, controls, and narrow layouts.

Human playtests should establish whether adventures last roughly 10–15 minutes;
whether the opening choices, ritual upgrades, and candle waste are understood;
whether spare candles make optional treasure too cheap or scarce candles too
punishing; whether the three openings and objective families feel different;
whether quiet rooms and return journeys feel proportionate; and whether the
undo/exploration rollback is clear. The current backbone is intentionally
authored and recognizable. Further pattern variety should follow those findings
without weakening physical or resource validation.
