# Haunted House maintenance notes

Haunted House is an isolated, turn-based exploration game. Its entry page is
`/haunted_house.html`; the root minigames index links to it. Its code, CSS, build
output, and storage belong only to this game. Existing games are not dependencies.

## Run and check

From the repository root:

```sh
npm run dev:haunted
npm run typecheck:haunted
npm run test:haunted
npm run build:haunted
npm run preview:haunted
node src/haunted-house/tests/browser-check.mjs
```

On PowerShell installations that disable scripts, use `npm.cmd` instead of `npm`.
The tests use Node's native TypeScript support and require a recent Node release.
The browser check starts a local static server and a separate headless Chrome
profile through the Chrome DevTools Protocol; no Playwright package is required.
Set `CHROME_PATH` if Chrome is installed elsewhere. Screenshots go in the ignored
`.haunted-checks/` directory. The regular test suite does not need a browser.

The root entry page references `haunted-build/haunted-house.js` and its stylesheet.
**Run `build:haunted` before serving the repository as static files.** Generated
`haunted-build/` files are ignored by Git. The dedicated Vite development config
loads the TypeScript source directly; the build directory can also be previewed.
Building does not publish or deploy anything.

## Modules

- `types.ts` defines serializable state and action contracts.
- `content.ts` holds item names, objective text, directions, and tuning values.
- `world.ts` contains tile access, legal graph neighbors, discovery, and the PRNG.
- `generation.ts` plans dependencies, constructs rooms, and validates adventures.
- `game.ts` resolves deterministic actions and provides current feedback/actions.
- `persistence.ts` validates, reads, and writes saves; it never repairs a save by
  generating a different house.
- `App.ts`, `main.ts`, and `styles.css` handle presentation and input. Reading a
  menu, selecting a target, and opening the journal do not call a game action.

## Rules and information

An accepted step, search, unlock, crossing, match, wait, memorial interaction, or
exit action costs one turn. Invalid actions return the original state unchanged.
Actions resolve against the existing world first. Entering the spirit's tile
resolves contact immediately: the first contact consumes the charm and returns
the player to the previous tile; another contact ends the run before advancing
its clock. A surviving player advances the turn, then the spirit takes a legal
step after every fourth turn. Physical discovery and current readings refresh.

The spirit uses cardinal floor movement and open, bidirectional connections. It
never moves onto the player and never teleports. Outside the player's room it
prefers shortest legal routes toward them; inside it chooses a seeded legal
neighbor. Its uint32 Xorshift state is saved, so restoring a save preserves its
subsequent decisions. There are no timers or automatic gameplay ticks.

The candle gutters exactly when the spirit occupies one of the four adjacent
tiles in the current room. A steady reading makes the next cardinal step safe
because the player's move resolves before the spirit's. Matches check one
walkable adjacent tile **after** their turn and any scheduled spirit step.
Evidence is tagged with `spiritMoves` and expires at the next movement beat.
Physical exploration memory does not expire and never certifies safety.

Crossing a room boundary is a separate action from stepping onto its door/stair.
A threshold ward reports whether the remote arrival tile is clear or disturbed;
an occupied destination prevents travel without spending a turn. This explicit
rule prevents an invisible gamble beyond the reach of the local candle.

Every generated walkable tile has at least two within-room cardinal neighbors,
even while every gate is closed. Blocking one neighbor with the player cannot
trap the spirit. A guttering player can safely wait at most four turns: the
spirit must move, a local step changes checkerboard parity, and a passage step
leaves the room. Either way it leaves the four adjacent tiles. Likewise an
occupied arrival endpoint must clear at its next step. This gives cautious play
a guaranteed route without requiring consumable information tools or a charm.

## Generation and extension

Generation chooses an objective and dependency graph before room geometry.
The three templates require an exit key, a diary and return, or a locket placed
at a memorial before leaving. Moth and thorn keys and a reusable crowbar form
either a short chain or a branch. Optional rooms add supplies, treasure, quiet
containers, connecting loops, and an actually empty dead end. Loops only join
equal prerequisite regions, so they cannot bypass the intended dependencies.

Room and floor budgets currently produce 9–13 rooms over 2–3 floors. Geometry
uses a deliberately constrained **9×9 authored pattern** with sparse object
positions and multiple routes around them. Portal and object coordinates are
defined for that pattern: changing `roomSize` also requires updating those
coordinates and retaining the neighbor invariant. Room/floor count, lighting,
supplies, and movement rhythm are centralized in `TUNING`.

The validator checks actual tiles, bidirectional endpoints, floor transitions,
reachable interaction positions, and a repeated inventory-acquisition search.
It requires every prerequisite, objective, return route, and floor tile to be
reachable; it also validates progressed saves using their retained inventory.
Generation has bounded attempts followed by a separately tested fixed fallback.
Restarting uses the same original seed and reproduces the complete initial state.

Add item text in `content.ts`, identifiers in `types.ts`, and requirements in
`generation.ts`. New obstacle or objective behavior also belongs in `game.ts`.
Extend validation and the independent tile solver whenever adding a mechanic
that can affect solvability; do not rely on a connected room graph alone.

## Saves and verification

Storage key `haunted-house.save.v1` contains version 1's full `GameState`: seed,
PRNG, rooms/tiles/containers, gates, positions, turn phase, discovery, supplies,
inventory, clues, objective, log, and outcome. A committed action triggers an
autosave. The adapter verifies writes and reports storage failures. Unreadable
or incompatible saves remain untouched until the player explicitly confirms a
replacement; raw unreadable data can be downloaded. No other game's key is used.
Change the version/schema together when persistence becomes incompatible.

Tests cover diverse seeds, independent tile-level progression, legal spirit
steps, action order, clue timing, protections/endings, cautious complete runs,
exact serialized continuation, storage failures, and entry-page integration.
Browser checks cover input, overlays, reloads, navigation, and narrow layouts.
Human playtesting is still needed to establish the intended 10–15 minute pace,
reward balance, and whether the spirit's initial room is too quiet in some seeds.
