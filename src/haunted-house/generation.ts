import { initialResources, ITEMS, OBJECTIVES, SAVE_VERSION, SPIRITS, TUNING } from './content.ts';
import { carveRoom } from './room-patterns.ts';
import { replayWitness, solve } from './solver.ts';
import type { SolvePreference, SolveResult } from './solver.ts';
import { encounterChoices } from './diagnostics.ts';
import { ROOM_IDENTITIES, ROOM_NAMES, ROOM_FLAVOR, roomIdentity } from './adventure-content.ts';
import { discoveryClosure, roomDistances, validateDependencies } from './dependencies.ts';
import { REWARD_DEFINITIONS } from './item-definitions.ts';
import { mixEncounterPlacement } from './encounter-placement.ts';
import type { GameState, ItemId, ObjectiveKind, Position, SpiritKind, Supply, SupplyKind } from './types.ts';
import { positionKey, random, refreshExploration, seedNumber, shuffled } from './world.ts';

/** Baseline preserves the previous ingredient/RNG sequence for reproducible balance experiments. */
export interface GenerationOptions { ingredients?: 'baseline' | 'expanded' | 'adventure'; ruleset?: 'classic' | 'power-flare'; encounters?: 'prior' | 'mixed' }
class CandidateCapacityError extends Error {}
export function generateCandidate(seed: string, variant = 0, options: GenerationOptions = {}): GameState {
 const adventure = options.ingredients === undefined || options.ingredients === 'adventure';
 const rng = { rng: seedNumber(`${seed}:${variant}`) }; const integer = (a: number, b: number) => a + Math.floor(random(rng) * (b - a + 1));
 const count = integer(6, 8); const names = shuffled(['Study', 'Scullery', 'Winter parlour', 'Library', 'Nursery', 'Guest chamber', 'Long gallery', 'Attic', 'Servants’ hall', 'Music room'], rng);
 const kind = (['escape', 'diary', 'keepsake'] as ObjectiveKind[])[integer(0, 2)];
 const split = integer(3, count - 2);
 const identities = adventure ? shuffled(ROOM_IDENTITIES, rng) : [];
 if (adventure) {
  const preferred = kind === 'diary' ? ['library', 'study'] : kind === 'keepsake' ? ['nursery', 'sewing', 'parlour'] : ['attic', 'gallery', 'chapel'];
  const weighted = identities.flatMap((id, i) => Array(preferred.includes(id) ? 3 : 1).fill(i) as number[]);
  const at = weighted[integer(0, weighted.length - 1)];
  [identities[3], identities[at]] = [identities[at], identities[3]];
 }
 const rooms = Array.from({ length: count }, (_, i) => {
  const identity = adventure ? i ? identities[i - 1] : 'hall' : undefined;
  const room = carveRoom(`r${i}`, identity ? ROOM_NAMES[identity] : i ? names[i - 1] : 'Entrance hall', i >= split ? 1 : 0, rng, identity);
  return identity ? { ...room, identity, accent: roomIdentity(identity).accent, flavor: ROOM_FLAVOR[identity] } : room;
 });
 // A single seal or a two-tool chain; each has local and sibling-branch variants.
 const chain = adventure && random(rng) < .65;
 const branch = adventure ? integer(1, 2) : 1;
 const localTool = adventure && random(rng) < .5;
 const entrance = { roomId: 'r0', x: 1, y: 1 };
 const state: GameState = { version: SAVE_VERSION, ruleset: options.ruleset ?? 'power-flare', seed, variant, rooms, connections: [], hauntings: [], supplies: [], player: { ...entrance }, entrance, resources: initialResources(), turns: 0, inventory: [], objective: { kind, ...OBJECTIVES[kind], completed: false }, journal: ['Discover the empty floor first. Compare the spirits you uncover before spending food or light.'], log: [], status: 'active', undo: [] };
 rooms[0].tiles[1 + rooms[0].width].kind = 'exit';
 const reserved = new Set([positionKey(entrance)]);
 function place(roomIndex: number, far = false, eligible?: Set<string>): Position {
  const r = rooms[roomIndex];
  const choices = shuffled(r.tiles.flatMap((t, n) => t.kind === 'floor' ? [{ roomId: r.id, x: n % r.width, y: Math.floor(n / r.width) }] : []).filter(p => !reserved.has(positionKey(p)) && (!eligible || eligible.has(positionKey(p)))), rng);
  if (far) choices.sort((a, b) => b.x + b.y - a.x - a.y);
  const p = choices[0]; if (!p) throw new CandidateCapacityError('Room capacity exhausted.'); reserved.add(positionKey(p)); return p;
 }
 const parents: number[] = [-1], depths = [0];
 const gateRooms: { room: number; item: ItemId }[] = [];
 const keys = shuffled<ItemId>(['moth-key', 'thorn-key', 'crowbar'], rng);
 for (let i = 1; i < count; i++) {
  const parent = adventure ? i < 3 || i === count - 1 ? 0 : i === 3 ? branch : i === 4 ? 3 : integer(3, i - 1)
   : i === split ? integer(0, split - 1) : i > split ? integer(split, i - 1) : integer(0, i - 1);
  parents.push(parent); depths.push(depths[parent] + 1);
  const a = place(parent, true), b = place(i); const kind = rooms[parent].floor === rooms[i].floor ? 'door' : 'stairs';
  const gated = adventure ? i === 3 || (i === 4 && chain) || i === count - 1 : i === split || (i > 1 && random(rng) < .35);
  const gate = gated && keys.length ? keys.pop() : undefined;
  const c = { id: `passage-${i}`, a, b, kind, ...(gate ? { gate } : {}), opened: !gate } as const;
  state.connections.push(adventure ? {
   ...c,
   name: gate === 'moth-key' ? 'Moth-marked passage' : gate === 'thorn-key' ? 'Thorn-marked passage' : gate === 'crowbar' ? 'Boarded passage' : kind === 'stairs' ? 'Open stairway' : 'Open doorway',
   description: `${rooms[parent].name} / ${rooms[i].name}.${gate ? ` Requires ${ITEMS[gate].name}.` : ''}`,
  } : c);
  for (const p of [a, b]) { const r = rooms.find(r => r.id === p.roomId)!; r.tiles[p.y * r.width + p.x] = { kind, connectionId: c.id }; }
  if (adventure) for (const p of [a, b]) {
   const r = rooms.find(r => r.id === p.roomId)!;
   for (let y = Math.max(1, p.y - 1); y <= Math.min(r.height - 2, p.y + 1); y++)
    for (let x = Math.max(1, p.x - 1); x <= Math.min(r.width - 2, p.x + 1); x++) if (r.tiles[y * r.width + x].kind === 'wall') r.tiles[y * r.width + x].kind = 'floor';
  }
  if (gate) gateRooms.push({ room: i, item: gate });
 }
 if (adventure && random(rng) < .35) {
  // Both endpoints lie before every gate: this loop can never bypass a seal.
  const a = place(1), b = place(2), kind = rooms[1].floor === rooms[2].floor ? 'door' : 'stairs';
  const c = { id: 'shortcut', a, b, kind, opened: true } as const;
  state.connections.push(c);
  for (const p of [a, b]) {
   const r = rooms.find(r => r.id === p.roomId)!; r.tiles[p.y * r.width + p.x] = { kind, connectionId: c.id };
   // A locked doorway must not itself sever discovery of the near room.
   if (adventure) for (let y = Math.max(1, p.y - 1); y <= Math.min(r.height - 2, p.y + 1); y++)
    for (let x = Math.max(1, p.x - 1); x <= Math.min(r.width - 2, p.x + 1); x++) if (r.tiles[y * r.width + x].kind === 'wall') r.tiles[y * r.width + x].kind = 'floor';
  }
 }
 function supply(room: number, kind: SupplyKind, name: string, extra: Partial<Supply> = {}): void { state.supplies.push({ id: `s${state.supplies.length}`, name, kind, position: place(room), amount: kind === 'candle' ? TUNING.candleLight : 1, used: false, ...extra }); }
 // The legacy construction index remains only in the benchmark. Adventure tools
 // are sampled from actual discoverable regions and bounded room-edge distances.
 for (const g of gateRooms) {
  const candidates = Array.from({ length: g.room }, (_, i) => i);
  let at: number;
  if (adventure) {
   const connection = state.connections.find(c => c.gate === g.item)!;
   const accessible = discoveryClosure(state, g.item);
   const outsideFirst = discoveryClosure(state, undefined, 'passage-3');
   const distances = roomDistances(state, connection.a.roomId);
   const eligible = rooms.map((r, i) => ({ r, i })).filter(({ r }) =>
    (distances.get(r.id) ?? Infinity) <= 2 && r.tiles.some((t, n) => t.kind === 'floor'
     && accessible.seen.has(positionKey({ roomId: r.id, x: n % r.width, y: Math.floor(n / r.width) }))))
    .filter(({ r }) => {
     const outside = r.tiles.some((_, n) => outsideFirst.seen.has(positionKey({ roomId: r.id, x: n % r.width, y: Math.floor(n / r.width) })));
     return g.room === 4 ? !outside : outside;
    });
   const preferred = g.room === 3 ? eligible.filter(({ r }) => localTool ? r.id === connection.a.roomId : r.id !== connection.a.roomId && r.id !== state.entrance.roomId) : eligible;
   const pool = preferred.length ? preferred : eligible;
   if (!pool.length) throw new CandidateCapacityError('No discoverable tool placement within two room edges.');
   at = pool[integer(0, pool.length - 1)].i;
   state.supplies.push({ id: `s${state.supplies.length}`, name: g.item === 'crowbar' ? 'Crowbar chest' : `${ITEMS[g.item].name} cache`, kind: 'cache', position: place(at, false, accessible.seen), amount: 1, used: false, item: g.item });
  } else {
   at = candidates[integer(0, candidates.length - 1)];
   supply(at, 'cache', 'Dusty tool chest', { item: g.item });
  }
  state.journal.push(`${ITEM_LABEL(g.item)} was last kept in the ${rooms[at].name}.`);
 }
 const bossRoom = adventure ? 4 : depths.indexOf(Math.max(...depths));
 const reward: ItemId = kind === 'escape' ? 'exit-key' : kind === 'diary' ? 'diary' : 'keepsake';
 state.journal.push(`The keeper waits in the ${rooms[bossRoom].name}, upstairs or beyond the inner passages. It holds ${ITEM_LABEL(reward).toLowerCase()}.`);
 if (kind === 'keepsake') { const p = place(integer(0, split - 1)); state.objective.altar = p; const r = rooms.find(r => r.id === p.roomId)!; r.tiles[p.y * r.width + p.x].kind = 'altar'; }
 for (let i = 0; i < count; i++) {
  const enemies = i === 0 ? 3 : integer(1, 3);
  for (let n = 0; n < enemies; n++) {
   const tier = i === 0 ? 1 : integer(Math.max(1, depths[i] - 1), Math.min(5, depths[i] + 1));
   const spirit = (adventure ? roomIdentity(rooms[i].identity!).spirits : ['shade', 'wisp', 'armour', 'revenant'] as SpiritKind[])[integer(0, 3)];
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
  const finalRoom = adventure ? bossRoom : objectiveRooms[integer(0, objectiveRooms.length - 1)];
  reserved.delete(positionKey(keeper.position)); keeper.position = place(finalRoom, true);
  state.journal[state.journal.length - 1] = `The keeper waits in the ${rooms[finalRoom].name}. It holds ${ITEM_LABEL(reward).toLowerCase()}.`;
  if (state.objective.altar) {
   const old = state.objective.altar, oldRoom = rooms.find(r => r.id === old.roomId)!;
   oldRoom.tiles[old.y * oldRoom.width + old.x].kind = 'floor'; reserved.delete(positionKey(old));
   // A memorial can be in another branch or on the upper floor; its location is explicit.
   const alternatives = adventure ? [0, 3 - branch, 3] : rooms.map((_, i) => i).filter(i => i !== finalRoom);
   const memorialRooms = adventure ? alternatives.flatMap(i => Array(['chapel', 'parlour', 'conservatory', 'nursery'].includes(rooms[i].identity!) ? 3 : 1).fill(i) as number[]) : alternatives;
   const p = place(memorialRooms[integer(0, memorialRooms.length - 1)]);
   state.objective.altar = p; const room = rooms.find(r => r.id === p.roomId)!;
   room.tiles[p.y * room.width + p.x].kind = 'altar';
   if (adventure) for (let y = Math.max(1, p.y - 1); y <= Math.min(room.height - 2, p.y + 1); y++)
    for (let x = Math.max(1, p.x - 1); x <= Math.min(room.width - 2, p.x + 1); x++) if (room.tiles[y * room.width + x].kind === 'wall') room.tiles[y * room.width + x].kind = 'floor';
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
   const candidates = availableRooms.filter(i => floorCounts[i] < 4 && (!adventure || i !== count - 1));
   // Half of the remaining supplies prefer the accessible half of the tree, without
   // making each room a food/candle pair. The legal witness remains the final check.
   const earlier = candidates.filter(i => i < split);
   const pool = earlier.length && random(rng) < .5 ? earlier : candidates;
   const weighted = adventure ? pool.flatMap(i => Array(roomIdentity(rooms[i].identity!)[x.kind as 'food' | 'candle']).fill(i) as number[]) : pool;
   relocate(x, weighted[integer(0, weighted.length - 1)]);
  }
  for (const x of state.supplies) if (quiet >= 0 && x.position.roomId === rooms[quiet].id) relocate(x, availableRooms[integer(0, availableRooms.length - 1)]);
  if (adventure) {
   // The primary recovery budget must remain available when skipping the reward
   // branch. Its prize replaces an existing find, never adds another supply.
   const outsideReward = availableRooms.filter(i => i !== count - 1);
   for (const x of state.supplies) if (x.position.roomId === rooms[count - 1].id && ['food', 'candle', 'oil', 'tonic'].includes(x.kind))
    relocate(x, outsideReward[integer(0, outsideReward.length - 1)]);
   const treasure = state.supplies.find(x => x.kind === 'treasure')!;
   relocate(treasure, count - 1);
  }
  const progression = state.supplies.find(x => x.kind === 'power')!;
  const progressionKind = integer(0, adventure ? 6 : 2);
  if (progressionKind === 1) { progression.kind = 'vitality'; progression.name = 'Heartwood charm'; progression.amount = 4; }
  if (progressionKind === 2) { progression.kind = 'oil'; progression.name = "Alchemist's case"; progression.amount = 3; }
  if (adventure && progressionKind < 3) progression.definitionId = ['ritual-primer', 'heartwood-charm', 'alchemists-case'][progressionKind];
  if (progressionKind >= 3) Object.assign(progression, structuredClone(REWARD_DEFINITIONS[progressionKind - 3]));
  // Rewards can be on a nearby optional branch or deeper in the house; no fixed opening.
  const progressionRooms = adventure ? availableRooms.filter(i => i !== count - 1 && i < split) : availableRooms;
  relocate(progression, adventure && random(rng) < .4 ? count - 1 : progressionRooms[integer(0, progressionRooms.length - 1)]);
  for (const h of state.hauntings) if (!h.boss && random(rng) < .28) {
   // Measure the trait at a representative tier, using the same preview as play.
   // Assign it only when its small bonus changes the useful attack's hit count.
   const representative = { ...state, resources: { ...state.resources, power: initialResources().power + TUNING.levelPower * Math.max(0, h.tier - 1), empowered: false } };
   const before = encounterChoices(representative, h);
   const roll = random(rng);
   const trait = adventure ? roll < roomIdentity(rooms.find(r => r.id === h.position.roomId)!.identity!).smouldering ? 'smouldering' : 'brittle' : roll < .5 ? 'brittle' : 'smouldering';
   const after = encounterChoices(representative, { ...h, trait });
   if ((trait === 'brittle' && after.strikeHits < before.strikeHits) || (trait === 'smouldering' && after.flareHits < before.flareHits)) {
    h.trait = trait; h.name = `${trait === 'brittle' ? 'Brittle' : 'Smouldering'} ${h.name.toLowerCase()}`;
   }
  }
 }
 if (adventure) {
  state.objective.structure = `${chain ? 'tool-chain' : 'single-seal'}-${localTool ? 'local' : 'cross-branch'}${state.objective.altar ? `-memorial-${state.objective.altar.roomId === 'r0' ? 'entrance' : state.objective.altar.roomId === 'r3' ? 'inner' : 'side'}` : ''}`;
  const report = validateDependencies(state);
  const intended = state.connections.filter(c => c.id === 'passage-3' || (chain && c.id === 'passage-4'));
  if (!report.valid || intended.some(c => !report.requiredGates.includes(c.id))) throw new CandidateCapacityError('Unverified adventure dependencies.');
  const roomName = (id: string) => rooms.find(r => r.id === id)!.name;
  const keeper = state.hauntings.find(h => h.boss)!;
  state.objective.description = `Recover ${ITEM_LABEL(reward).toLowerCase()} from the keeper in the ${roomName(keeper.position.roomId)}. ${state.objective.altar ? `Bring it to the memorial in the ${roomName(state.objective.altar.roomId)}, then return to the entrance.` : 'Return to the entrance and leave alive.'}`;
  state.journal = [
   `The keeper in the ${roomName(keeper.position.roomId)} holds ${ITEM_LABEL(reward).toLowerCase()}.`,
   ...intended.map(c => {
    const tool = state.supplies.find(s => s.item === c.gate)!;
    return `${ITEM_LABEL(c.gate!)} is in the ${roomName(tool.position.roomId)}; it opens the passage from the ${roomName(c.a.roomId)} to the ${roomName(c.b.roomId)}.`;
   }),
  ];
  if (state.objective.altar) state.journal.push(`Bring the silver locket to the memorial in the ${roomName(state.objective.altar.roomId)}.`);
  const optional = state.connections.find(c => c.id === `passage-${count - 1}`)!;
  const tool = state.supplies.find(s => s.item === optional.gate)!;
  const note = state.supplies.find(s => s.kind === 'note')!;
  // This clue belongs to the optional tool's room and describes that branch only.
  reserved.delete(positionKey(note.position)); note.position = place(Number(tool.position.roomId.slice(1)));
  note.name = 'Household inventory';
  note.noteType = 'clue';
  const prize = state.supplies.find(s => s.position.roomId === rooms[count - 1].id && ['power', 'vitality', 'relic'].includes(s.kind))
   ?? state.supplies.find(s => s.position.roomId === rooms[count - 1].id && s.name === "Alchemist's case")
   ?? state.supplies.find(s => s.position.roomId === rooms[count - 1].id && s.kind === 'treasure');
  note.text = `${ITEM_LABEL(optional.gate!)} in this room opens the optional ${rooms[count - 1].name}. ${prize?.name ?? 'A reward'} was left there.`;
 }
 if (adventure && options.encounters !== 'prior') mixEncounterPlacement(state);
 refreshExploration(state); return state;
}
function ITEM_LABEL(id: ItemId): string { return ITEMS[id].name; }
/** Acceptance also proves that the designated locked reward branch can be skipped. */
export function verifyCandidate(candidate: GameState, budget?: number, preference?: SolvePreference): SolveResult {
 let searchable = candidate;
 if (candidate.objective.structure) {
  const dependencies = validateDependencies(candidate);
  if (!dependencies.valid) return { solved: false, actions: [], visited: 0, reason: 'exhausted' };
  searchable = structuredClone(candidate);
  const optional = new Set(dependencies.optionalGates);
  searchable.connections = searchable.connections.filter(c => !optional.has(c.id));
  for (const room of searchable.rooms) for (let i = 0; i < room.tiles.length; i++)
   if (room.tiles[i].connectionId && optional.has(room.tiles[i].connectionId!)) room.tiles[i] = { kind: 'wall' };
 }
 const result = solve(searchable, budget, preference);
 return result.solved && !replayWitness(candidate, result.actions) ? { ...result, solved: false, reason: 'exhausted' } : result;
}
export function createGame(seed: string, onAttempt?: (attempt: number) => void): GameState {
 if (!seed.trim() || seed.length > 100) throw new Error('Use a seed from 1 to 100 characters.');
 for (let variant = 0; variant < TUNING.generationAttempts; variant++) {
  onAttempt?.(variant + 1);
  let candidate: GameState;
  try { candidate = generateCandidate(seed, variant); }
  catch (error) { if (error instanceof CandidateCapacityError) continue; throw error; }
  const result = verifyCandidate(candidate);
  if (result.solved) return candidate;
 }
 // Never mislabel an unverified candidate as solvable or silently change the requested seed.
 throw new Error('No verified house was found for this seed within the generation budget. Try a different seed.');
}
