import { initialResources, OBJECTIVES, SAVE_VERSION, SPIRITS, TUNING } from './content.ts';
import { carveRoom } from './room-patterns.ts';
import { replayWitness, solve } from './solver.ts';
import { encounterChoices } from './diagnostics.ts';
import type { GameState, ItemId, ObjectiveKind, Position, SpiritKind, Supply, SupplyKind } from './types.ts';
import { positionKey, random, refreshExploration, seedNumber, shuffled } from './world.ts';

/** Baseline preserves the previous ingredient/RNG sequence for reproducible balance experiments. */
export interface GenerationOptions { ingredients?: 'baseline' | 'expanded'; ruleset?: 'classic' | 'power-flare' }
class CandidateCapacityError extends Error {}
export function generateCandidate(seed: string, variant = 0, options: GenerationOptions = {}): GameState {
 const rng = { rng: seedNumber(`${seed}:${variant}`) }; const integer = (a: number, b: number) => a + Math.floor(random(rng) * (b - a + 1));
 const count = integer(6, 8); const names = shuffled(['Study', 'Scullery', 'Winter parlour', 'Library', 'Nursery', 'Guest chamber', 'Long gallery', 'Attic', 'Servants’ hall', 'Music room'], rng);
 const kind = (['escape', 'diary', 'keepsake'] as ObjectiveKind[])[integer(0, 2)];
 const split = integer(3, count - 2);
 const rooms = Array.from({ length: count }, (_, i) => carveRoom(`r${i}`, i ? names[i - 1] : 'Entrance hall', i >= split ? 1 : 0, rng));
 const entrance = { roomId: 'r0', x: 1, y: 1 };
 const state: GameState = { version: SAVE_VERSION, ruleset: options.ruleset ?? 'power-flare', seed, variant, rooms, connections: [], hauntings: [], supplies: [], player: { ...entrance }, entrance, resources: initialResources(), turns: 0, inventory: [], objective: { kind, ...OBJECTIVES[kind], completed: false }, journal: ['Discover the empty floor first. Compare the spirits you uncover before spending food or light.'], log: [], status: 'active', undo: [] };
 rooms[0].tiles[1 + rooms[0].width].kind = 'exit';
 const reserved = new Set([positionKey(entrance)]);
 function place(roomIndex: number, far = false): Position {
  const r = rooms[roomIndex];
  const choices = shuffled(r.tiles.flatMap((t, n) => t.kind === 'floor' ? [{ roomId: r.id, x: n % r.width, y: Math.floor(n / r.width) }] : []).filter(p => !reserved.has(positionKey(p))), rng);
  if (far) choices.sort((a, b) => b.x + b.y - a.x - a.y);
  const p = choices[0]; if (!p) throw new CandidateCapacityError('Room capacity exhausted.'); reserved.add(positionKey(p)); return p;
 }
 const parents: number[] = [-1], depths = [0];
 const gateRooms: { room: number; item: ItemId }[] = [];
 const keys = shuffled<ItemId>(['moth-key', 'thorn-key', 'crowbar'], rng);
 for (let i = 1; i < count; i++) {
  const parent = i === split ? integer(0, split - 1) : i > split ? integer(split, i - 1) : integer(0, i - 1);
  parents.push(parent); depths.push(depths[parent] + 1);
  const a = place(parent, true), b = place(i); const kind = rooms[parent].floor === rooms[i].floor ? 'door' : 'stairs';
  const gate = (i === split || (i > 1 && random(rng) < .35)) && keys.length ? keys.pop() : undefined;
  const c = { id: `passage-${i}`, a, b, kind, ...(gate ? { gate } : {}), opened: !gate } as const;
  state.connections.push(c);
  for (const p of [a, b]) { const r = rooms.find(r => r.id === p.roomId)!; r.tiles[p.y * r.width + p.x] = { kind, connectionId: c.id }; }
  if (gate) gateRooms.push({ room: i, item: gate });
 }
 function supply(room: number, kind: SupplyKind, name: string, extra: Partial<Supply> = {}): void { state.supplies.push({ id: `s${state.supplies.length}`, name, kind, position: place(room), amount: kind === 'candle' ? TUNING.candleLight : 1, used: false, ...extra }); }
 // Required tools are distributed before their own gate in the generated room tree.
 for (const g of gateRooms) {
  const candidates = Array.from({ length: g.room }, (_, i) => i); const at = candidates[integer(0, candidates.length - 1)];
  supply(at, 'cache', 'Dusty tool chest', { item: g.item });
  state.journal.push(`${ITEM_LABEL(g.item)} was last kept in the ${rooms[at].name}.`);
 }
 const bossRoom = depths.indexOf(Math.max(...depths));
 const reward: ItemId = kind === 'escape' ? 'exit-key' : kind === 'diary' ? 'diary' : 'keepsake';
 state.journal.push(`The keeper waits in the ${rooms[bossRoom].name}, upstairs or beyond the inner passages. It holds ${ITEM_LABEL(reward).toLowerCase()}.`);
 if (kind === 'keepsake') { const p = place(integer(0, split - 1)); state.objective.altar = p; const r = rooms.find(r => r.id === p.roomId)!; r.tiles[p.y * r.width + p.x].kind = 'altar'; }
 for (let i = 0; i < count; i++) {
  const enemies = i === 0 ? 3 : integer(1, 3);
  for (let n = 0; n < enemies; n++) {
   const tier = i === 0 ? 1 : integer(Math.max(1, depths[i] - 1), Math.min(5, depths[i] + 1));
   const spirit = (['shade', 'wisp', 'armour', 'revenant'] as SpiritKind[])[integer(0, 3)];
   const hp = Math.max(5, 10 + tier * 6 + (spirit === 'wisp' ? -7 : spirit === 'revenant' ? 9 : 0) + integer(-2, 2));
   state.hauntings.push({ id: `h${state.hauntings.length}`, name: `${SPIRITS[spirit].name} ${state.hauntings.length + 1}`, kind: spirit, tier, position: place(i), hp, maxHp: hp, attack: 2 + tier * 2 + (spirit === 'wisp' ? 2 : 0), regen: spirit === 'revenant' ? 3 : 2, xp: tier, boss: false });
  }
  supply(i, 'food', 'Preserved supper'); if (random(rng) < .22) supply(i, 'food', 'Bread and broth');
  if (i % 2 === 0 || random(rng) < .3) supply(i, 'candle', 'Votive candle');
 }
 supply(integer(0, split - 1), 'power', 'Ritual primer', { amount: 1 });
 supply(integer(0, count - 1), 'oil', 'Consecrated oil');
 supply(integer(0, count - 1), 'tonic', 'Sealed tonic');
 supply(integer(1, count - 1), 'treasure', 'Silver trinket', { amount: 3 });
 supply(integer(0, count - 1), 'note', 'Faded annotation', { text: 'A killing strike still draws blood. Prepare a flare if the final exchange would kill you.' });
 const hp = integer(59, 69); const bossKind: SpiritKind = random(rng) < .5 ? 'shade' : 'armour';
 state.hauntings.push({ id: 'keeper', name: 'The keeper', kind: bossKind, position: place(bossRoom, true), tier: 6, hp, maxHp: hp, attack: integer(11, 13), regen: 2, xp: 6, reward, boss: true });
 if (options.ingredients !== 'baseline') {
  // All ingredients are fixed now, before play. Keep the baseline food/light totals;
  // vary where they can be found, rather than issuing a standard package per room.
  const keeper = state.hauntings.find(h => h.boss)!;
  const objectiveRooms = rooms.map((_, i) => i).filter(i => i > 0 && depths[i] >= Math.max(1, Math.max(...depths) - 1));
  const finalRoom = objectiveRooms[integer(0, objectiveRooms.length - 1)];
  reserved.delete(positionKey(keeper.position)); keeper.position = place(finalRoom, true);
  state.journal[state.journal.length - 1] = `The keeper waits in the ${rooms[finalRoom].name}. It holds ${ITEM_LABEL(reward).toLowerCase()}.`;
  if (state.objective.altar) {
   const old = state.objective.altar, oldRoom = rooms.find(r => r.id === old.roomId)!;
   oldRoom.tiles[old.y * oldRoom.width + old.x].kind = 'floor'; reserved.delete(positionKey(old));
   // A memorial can be in another branch or on the upper floor; its location is explicit.
   const alternatives = rooms.map((_, i) => i).filter(i => i !== finalRoom);
   const p = place(alternatives[integer(0, alternatives.length - 1)]);
   state.objective.altar = p; const room = rooms.find(r => r.id === p.roomId)!;
   room.tiles[p.y * room.width + p.x].kind = 'altar';
   state.journal.push(`The memorial stands in the ${room.name}.`);
  }
  const quietCandidates = rooms.map((_, i) => i).filter(i => i > 0 && i !== finalRoom && !parents.includes(i)
   && !state.supplies.some(x => x.item && x.position.roomId === rooms[i].id)
   && state.objective.altar?.roomId !== rooms[i].id);
  const quiet = quietCandidates.length && random(rng) < .4 ? quietCandidates[integer(0, quietCandidates.length - 1)] : -1;
  if (quiet >= 0) {
   for (const h of state.hauntings.filter(h => h.position.roomId === rooms[quiet].id)) reserved.delete(positionKey(h.position));
   state.hauntings = state.hauntings.filter(h => h.position.roomId !== rooms[quiet].id);
  }
  const availableRooms = rooms.map((_, i) => i).filter(i => i !== quiet);
  const floorCounts = rooms.map(() => 0);
  const relocate = (x: Supply, room: number) => { reserved.delete(positionKey(x.position)); x.position = place(room); floorCounts[room]++; };
  let entranceFood = false, entranceCandle = false;
  for (const x of state.supplies) if (x.kind === 'food' || x.kind === 'candle') {
   if (x.kind === 'food' && !entranceFood) { relocate(x, 0); entranceFood = true; continue; }
   if (x.kind === 'candle' && !entranceCandle) { relocate(x, 0); entranceCandle = true; continue; }
   const candidates = availableRooms.filter(i => floorCounts[i] < 4);
   // Half of the remaining supplies prefer the accessible half of the tree, without
   // making each room a food/candle pair. The legal witness remains the final check.
   const earlier = candidates.filter(i => i < split);
   const pool = earlier.length && random(rng) < .5 ? earlier : candidates;
   relocate(x, pool[integer(0, pool.length - 1)]);
  }
  for (const x of state.supplies) if (quiet >= 0 && x.position.roomId === rooms[quiet].id) relocate(x, availableRooms[integer(0, availableRooms.length - 1)]);
  const progression = state.supplies.find(x => x.kind === 'power')!;
  const progressionKind = integer(0, 2);
  if (progressionKind === 1) { progression.kind = 'vitality'; progression.name = 'Heartwood charm'; progression.amount = 4; }
  if (progressionKind === 2) { progression.kind = 'oil'; progression.name = "Alchemist's case"; progression.amount = 3; }
  // Rewards can be on a nearby optional branch or deeper in the house; no fixed opening.
  relocate(progression, availableRooms[integer(0, availableRooms.length - 1)]);
  for (const h of state.hauntings) if (!h.boss && random(rng) < .28) {
   // Measure the trait at a representative tier, using the same preview as play.
   // Assign it only when its small bonus changes the useful attack's hit count.
   const representative = { ...state, resources: { ...state.resources, power: initialResources().power + TUNING.levelPower * Math.max(0, h.tier - 1), empowered: false } };
   const before = encounterChoices(representative, h);
   const trait = random(rng) < .5 ? 'brittle' : 'smouldering';
   const after = encounterChoices(representative, { ...h, trait });
   if ((trait === 'brittle' && after.strikeHits < before.strikeHits) || (trait === 'smouldering' && after.flareHits < before.flareHits)) {
    h.trait = trait; h.name = `${trait === 'brittle' ? 'Brittle' : 'Smouldering'} ${h.name.toLowerCase()}`;
   }
  }
 }
 refreshExploration(state); return state;
}
function ITEM_LABEL(id: ItemId): string { return { 'moth-key': 'Moth key', 'thorn-key': 'Thorn key', crowbar: 'Crowbar', 'exit-key': 'Front-door key', diary: 'Missing diary', keepsake: 'Silver locket' }[id]; }
export function createGame(seed: string, onAttempt?: (attempt: number) => void): GameState {
 if (!seed.trim() || seed.length > 100) throw new Error('Use a seed from 1 to 100 characters.');
 for (let variant = 0; variant < TUNING.generationAttempts; variant++) {
  onAttempt?.(variant + 1);
  let candidate: GameState;
  try { candidate = generateCandidate(seed, variant); }
  catch (error) { if (error instanceof CandidateCapacityError) continue; throw error; }
  const result = solve(candidate);
  if (result.solved && replayWitness(candidate, result.actions)) return candidate;
 }
 // Never mislabel an unverified candidate as solvable or silently change the requested seed.
 throw new Error('No verified house was found for this seed within the generation budget. Try a different seed.');
}
