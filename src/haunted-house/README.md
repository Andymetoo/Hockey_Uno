# Haunted House

A procedural, turn-based resource puzzle at `haunted_house.html`. This game has
its own source, build, storage and tests. Hockey Cards, Ouija, Bomber Command and
the existing root navigation are unchanged by the combat/discovery pass.

## Run and verify

```sh
npm install
npm run dev:haunted
npm run typecheck:haunted
npm run test:haunted
npm run build:haunted
npm run preview:haunted
```

Use `npm.cmd` in PowerShell if its script policy blocks `npm`. Tests require a
Node version with native TypeScript stripping (Node 22.18+ or 24+). There are no
new runtime packages. For optional real Chromium checks:

```sh
node src/haunted-house/tests/browser-check.mjs
```

Set `CHROME_PATH` to the Chrome/Chromium executable if it is not at the default
Windows location. That script uses a separate headless profile in the ignored
`.haunted-checks/` directory and covers a complete winning sequence through UI
controls, generation, desktop/tablet/mobile, lethal confirmations, keyboard,
touch, saves and undo. It is an authored check, not evidence it ran: browser
verification was blocked in the implementation environment. Run it locally.

Build before ordinary static hosting. `haunted_house.html` loads
`haunted-build/haunted-house.js` and `.css`; generated output is ignored by Git.
Generation runs in an **inline worker** so the root page and standalone build
both work without worker-relative URL errors. The dedicated Vite dev command
loads source instead. Neither build nor this branch deploys the website.

## Settled gameplay contract

- A move selects **any discovered empty destination**, across remembered rooms
  and floors, and costs exactly **one turn**. No pathfinding, travel distance,
  intervening collision, or implicit per-tile turns. Invalid/no-op moves cost
  nothing. Arrow keys browse cells; Enter activates; WASD moves one tile; Z undoes.
- Arriving reveals the **3×3 square** centered on the player, diagonals included.
  Walls do not occlude this square. No recursive flood reveal; discovery persists.
- Spirits and supplies occupy tiles. Their indirect barrier is denying a viewing
  position that would reveal tiles beyond. An alternate diagonal view can reveal
  a tile past an obstacle, and that destination becomes legal immediately.
- Any discovered spirit/supply can be acted on without an approach move. Clearing
  it places the player there and reveals its neighborhood. Food is consumed on
  its tile, never silently put into a backpack. Passage travel costs one turn;
  unlocking costs one turn; viewing a room tab costs none. Open passage inspection
  offers either travel or standing on its near endpoint.
- No time passes while inspecting, thinking, cancelling a prompt or closing the
  page. Every committed gameplay action advances one turn throughout the house.
- Strikes exchange damage simultaneously, including killing blows. At zero health,
  the player dies before XP or level-up recovery. The engine rejects lethal
  strikes unless explicitly confirmed; the UI shows the exact exchange first.
- Starting values: 22 health, 6 power, 8/10 light, level 1, one tonic and one oil.
  Flare: 4 light, power + 4 damage, ignores armour, no retaliation. Ward: 3 light
  and one preparation turn, halves next strike's incoming damage rounded up.
  Oil: one bottle and one preparation turn, +4 damage on the next attack.
- A living wounded spirit regenerates its listed amount at the end of every turn
  **except a turn attacking that spirit**. All floors follow the same rule.
  Defeated spirits never respawn. Walking does not heal the player.
- Food restores ceil(maxHealth × 0.6); candles restore 8 light. Both cap, preview
  waste, and can be deliberately wasted to clear their tile. Tonics heal
  ceil(maxHealth / 2) on a separate turn. Tonics/oil can be pocketed.
- Each spirit grants its displayed XP. Level + 2 XP earns the next level, +3 max
  health, +2 power, and full health/light; excess XP carries. Survive the hit first.
- Keys/crowbar are reusable. Objective families: recover exit key and leave;
  retrieve diary and leave; retrieve locket, place at memorial, and leave.
  The memorial costs one turn, no resources. Clearing every spirit is unnecessary.
- Death is explicit. A living run may still be resource-exhausted after mistakes;
  there is no speculative 'unwinnable' popup based on an incomplete solver.
  Every committed turn, including exploration, is undoable back to the beginning.

`content.ts` describes player rules and core values. `game.ts` is the shared
transition and preview authority. `world.ts` handles destination eligibility and
revelation. `movement.ts` deliberately returns at most one relocation command.
Do not restore the earlier moving-mine, light-cost banishment, or pathfinding rules.

## Procedural generation and the guarantee

`room-patterns.ts` carves a growing maze, broadens some junctions into small
chambers and adds occasional loops. It uses no authored level/room layouts.
`generation.ts` constructs 6–8 rooms over two floors, a randomized room tree,
reusable tool gates, 1–3 enemies per room (three in the entrance), and a keeper.
The count is an adjustable budget, not a required hand-authored progression.
Tool chests appear earlier in the tree's construction order than their own
locked edge; the final resource/discovery check is still authoritative.

Four spirit roles supply different arithmetic: ordinary shades, fragile hard-
hitting wisps, armour with 2 strike reduction, and durable regenerating revenants.
Enemies, supplies, shapes, connections, gates and objective family vary by seed.
The seed plus accepted variant reproduce the generated starting state.

`solver.ts` searches for a **winning witness**, then `createGame` replays it through
`act()` before accepting a house. Exploration expansion chooses only discovered
empty destinations and uses actual 3×3 revelation. It does not grant hidden tiles,
ignore regeneration, or use ordinary physical flood-fill to declare a gate valid.
Preparations, strikes, spells, supplies, keys, passage travel, memorial and exit
are represented as actual actions. The user is not forced to follow the witness.

Search is bounded (450 expanded states, beam width 16); it explores complete-fight
plans with different spell/preparation choices, plus recovery and food-waste
branches. It is deliberately incomplete: 'budget' or 'exhausted' means **not
verified by this search**, not mathematically impossible. Some legitimate
mid-fight recovery plans may therefore be rejected. The generator retries up to
six procedural variants; if none has a verified witness, it reports that instead
of silently serving an unverified house or changing the requested seed. Generation
is cancellable and runs off the UI thread. No per-frame/real-time solver runs.

This establishes existence of a legal winning sequence under the engine rules.
It does **not** prove that fog-hidden choices are always inferable, that every
reasonable decision wins, that there are multiple solutions, or that balance is
fun. Human testing should check the intended explore → calculate → finish fight
→ recover rhythm, occasional rather than constant wasted-food choices, room
variety, and the 10–15 minute target. Avoid designing around repeated partial
fights or making every meal conceal a mandatory reward.

## Persistence and undo

Current slot: `haunted-house.save.v3`. V1 and v2 slots are never overwritten and
are separately downloadable from the start menu. Old rules cannot be faithfully
converted to combat resources, so they remain archives. The current run supports
JSON export/import with a replace confirmation, exact resume, same-seed restart,
and autosave after every committed turn and undo. Storage failure remains visible;
export can preserve an in-memory run even when browser storage fills.

The save stores geometry once; undo frames contain only mutable resources,
enemy HP, used/opened flags, inventory, discovery, position, notes and log. No
12-decision truncation. Structural validation checks current and historical data,
references, bounds and resource ranges; it accepts legitimate dead/stranded runs
without running a solver. A failed parse leaves stored bytes untouched until the
player explicitly starts or imports a replacement.

## Validation from this implementation

- 30 automated tests, including actual static builds and the dedicated dev entry.
- Six generated houses replayed through every real action, with JSON save/reload
  after every turn, followed by complete undo back to the starting state.
- Thirty raw seeds checked for geometry, connection and objective variety.
- Repository typecheck, Haunted House typecheck and production build.
- Browser execution unavailable: local preview was blocked and a local Chromium
  download failed. The browser-check script has been updated but not run here.

Visual/touch confirmation and human balance/pacing checks remain necessary.
