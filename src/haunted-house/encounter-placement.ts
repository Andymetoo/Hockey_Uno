import type { GameState, Haunting, Position } from './types.ts';
import { roomIdentity } from './adventure-content.ts';
import { roomDistances } from './dependencies.ts';
import { encounterChoices } from './diagnostics.ts';
import { known, positionKey, random, refreshExploration, seedNumber, shuffled, traversable } from './world.ts';

/** Visibility obtainable using only empty discovered destinations and open travel.
 * Supplies, spirits and closed gates stay in place. This spends no resources and
 * never serves as a winning proof; acceptance still replays actual game actions. */
export function openingVisibility(initial: GameState): Set<string> {
 const state = { ...initial, rooms: initial.rooms.map(r => ({ ...r, discovered: r.discovered.map(() => false) })), player: { ...initial.entrance } };
 refreshExploration(state);
 const stood = new Set<string>();
 let changed = true;
 while (changed) {
  changed = false;
  for (const room of state.rooms) for (let i = 0; i < room.tiles.length; i++) {
   const p = { roomId: room.id, x: i % room.width, y: Math.floor(i / room.width) }, key = positionKey(p);
   if (!stood.has(key) && traversable(state, p)) { stood.add(key); state.player = p; refreshExploration(state); changed = true; }
  }
  for (const c of state.connections) if (c.opened) for (const [from, to] of [[c.a, c.b], [c.b, c.a]]) {
   if (known(state, from) && traversable(state, to, false) && !stood.has(positionKey(to))) { stood.add(positionKey(to)); state.player = to; refreshExploration(state); changed = true; }
  }
 }
 return new Set(state.rooms.flatMap(r => r.discovered.flatMap((seen, i) => seen ? [positionKey({ roomId: r.id, x: i % r.width, y: Math.floor(i / r.width) })] : [])));
}

export function approachableAtStart(state: GameState, enemy: Haunting): boolean {
 const choice = encounterChoices(state, enemy);
 return choice.strikeSurvives || choice.flareAffordable;
}

/** Redistribute intact profiles, never generate extra HP/attack/XP or encounters.
 * The independent stream leaves geometry, supplies and historical modes paired. */
export function mixEncounterPlacement(state: GameState): void {
 const rng = { rng: seedNumber(`${state.seed}:${state.variant}:mixed-encounters-v1`) };
 const regular = state.hauntings.filter(h => !h.boss);
 const original = regular.map(h => ({ ...h.position }));
 const slots = original.map(p => ({ ...p }));
 const distance = roomDistances(state, state.entrance.roomId);
 const visible = openingVisibility(state);
 const earlySlots = shuffled(slots.map((p, i) => i).filter(i => (distance.get(slots[i].roomId) ?? Infinity) <= 1 && visible.has(positionKey(slots[i]))), rng);
 const easy = shuffled(regular.filter(h => h.tier === 1 && approachableAtStart(state, h)), rng);
 // Preserve up to two independently affordable choices in the freely discoverable
 // opening. A house whose geometry reveals only one keeps that one-choice floor;
 // zero-view starts retain their prior distribution for actual validation.
 const openingChoices = Math.min(2, earlySlots.length, easy.length);
 if (!openingChoices) return;
 const available = new Set(regular), assignments = new Map<number, Haunting>();
 const assign = (slot: number, h: Haunting) => { assignments.set(slot, h); available.delete(h); };
 for (let i = 0; i < openingChoices; i++) assign(earlySlots[i], easy[i]);
 const choose = <T>(values: T[], weight: (value: T) => number): T => {
  let roll = random(rng) * values.reduce((n, v) => n + weight(v), 0);
  for (const v of values) { roll -= weight(v); if (roll < 0) return v; }
  return values[values.length - 1];
 };
 // These are nominations, not per-house quotas. Some houses retain a quiet opening.
 if (random(rng) < .6) {
  const strong = [...available].filter(h => h.tier >= 3);
  const targets = slots.map((_, i) => i).filter(i => !assignments.has(i) && slots[i].roomId === state.entrance.roomId);
  if (strong.length && targets.length) {
   const target = choose(targets, () => 1);
   assign(target, choose(strong, h => h.tier === 3 ? 3 : 1));
   // Occasionally place that existing entrance slot in the initial 3×3, provided
   // a free floor exists. Occupant and supply counts remain unchanged.
   if (random(rng) < .65) {
    const room = state.rooms.find(r => r.id === state.entrance.roomId)!;
    const clear: Position[] = [];
    for (let y = state.entrance.y - 1; y <= state.entrance.y + 1; y++) for (let x = state.entrance.x - 1; x <= state.entrance.x + 1; x++) {
     const p = { roomId: room.id, x, y };
     if (room.tiles[y * room.width + x]?.kind === 'floor' && !state.supplies.some(s => positionKey(s.position) === positionKey(p))
      && !state.hauntings.some(h => positionKey(h.position) === positionKey(p)) && positionKey(p) !== positionKey(state.entrance)) clear.push(p);
    }
    if (clear.length) slots[target] = choose(clear, () => 1);
   }
  }
 }
 if (random(rng) < .7) {
  const weak = [...available].filter(h => h.tier === 1);
  const deep = slots.map((_, i) => i).filter(i => !assignments.has(i) && (distance.get(slots[i].roomId) ?? 0) >= 2);
  if (weak.length && deep.length) assign(choose(deep, i => distance.get(slots[i].roomId)!), choose(weak, () => 1));
 }
 for (const slot of shuffled(slots.map((_, i) => i).filter(i => !assignments.has(i)), rng)) {
  const room = state.rooms.find(r => r.id === slots[slot].roomId)!;
  const depth = distance.get(room.id) ?? 0;
  const entranceStrong = [...assignments].some(([i, h]) => slots[i].roomId === state.entrance.roomId && h.tier >= 3);
  const candidates = [...available].filter(h => !(room.id === state.entrance.roomId && entranceStrong && h.tier >= 3));
  const pool = candidates.length ? candidates : [...available];
  assign(slot, choose(pool, h => {
   const proximity = Math.abs(h.tier - Math.max(1, depth)) <= 1 ? 3 : 1;
   const theme = 1 + roomIdentity(room.identity ?? 'hall').spirits.filter(kind => kind === h.kind).length;
   return proximity * theme;
  }));
 }
 for (const [slot, h] of assignments) h.position = { ...slots[slot] };
 const after = openingVisibility(state);
 if (regular.filter(h => after.has(positionKey(h.position)) && h.tier === 1 && approachableAtStart(state, h)).length < openingChoices)
  regular.forEach((h, i) => { h.position = original[i]; });
}
