import type { GameSnapshot, ItemId, Position } from './types.ts';
import { positionKey } from './world.ts';

export interface DiscoveryClosure { seen: Set<string>; items: Set<ItemId>; opened: Set<string> }
/** Room-edge distance measures clue errands, not tile movement cost. */
export function roomDistances(state: GameSnapshot, from: string): Map<string, number> {
 const distances = new Map([[from, 0]]), pending = [from];
 for (let i = 0; i < pending.length; i++) {
  const id = pending[i];
  for (const c of state.connections) {
   const next = c.a.roomId === id ? c.b.roomId : c.b.roomId === id ? c.a.roomId : undefined;
   if (next && !distances.has(next)) { distances.set(next, distances.get(id)! + 1); pending.push(next); }
  }
 }
 return distances;
}
/** Optimistic geometry proof, not a combat proof. Clearing a discovered occupant
 * occupies its tile. Movement uses discovered destinations and 3×3 reveal only;
 * walls do not occlude and adjacent locked endpoints do not become occupiable. */
export function discoveryClosure(state: GameSnapshot, withheld?: ItemId, closedGate?: string): DiscoveryClosure {
 const seen = new Set<string>(), items = new Set<ItemId>(), opened = new Set<string>();
 const occupied = new Set<string>();
 const reveal = (p: Position) => {
  const r = state.rooms.find(r => r.id === p.roomId)!;
  for (let y = p.y - 1; y <= p.y + 1; y++) for (let x = p.x - 1; x <= p.x + 1; x++)
   if (x >= 0 && y >= 0 && x < r.width && y < r.height) seen.add(positionKey({ roomId: r.id, x, y }));
 };
 reveal(state.entrance);
 let changed = true;
 while (changed) {
  const before = seen.size + items.size + opened.size + occupied.size;
  for (const c of state.connections) if (c.id !== closedGate && (!c.gate || (c.gate !== withheld && items.has(c.gate)))
   && (seen.has(positionKey(c.a)) || seen.has(positionKey(c.b)))) {
   opened.add(c.id);
   // Passage travel may land on the still-undiscovered far endpoint.
   reveal(c.a); reveal(c.b);
  }
  for (const r of state.rooms) for (let i = 0; i < r.tiles.length; i++) {
   const p = { roomId: r.id, x: i % r.width, y: Math.floor(i / r.width) }, key = positionKey(p), t = r.tiles[i];
   if (!seen.has(key) || occupied.has(key) || t.kind === 'wall' || t.kind === 'altar' || (t.connectionId && !opened.has(t.connectionId))) continue;
   occupied.add(key); reveal(p);
   const supply = state.supplies.find(s => positionKey(s.position) === key);
   if (supply?.item && supply.item !== withheld) items.add(supply.item);
   const enemy = state.hauntings.find(h => positionKey(h.position) === key);
   if (enemy?.reward && enemy.reward !== withheld) items.add(enemy.reward);
  }
  changed = before !== seen.size + items.size + opened.size + occupied.size;
 }
 return { seen, items, opened };
}
export interface DependencyReport { valid: boolean; errors: string[]; requiredGates: string[]; optionalGates: string[]; prerequisites: Record<string, string[]> }
export function validateDependencies(state: GameSnapshot): DependencyReport {
 const errors: string[] = [], requiredGates: string[] = [], optionalGates: string[] = [], prerequisites: Record<string, string[]> = {};
 const full = discoveryClosure(state);
 const targets = state.hauntings.filter(h => h.boss).map(h => h.position);
 if (state.objective.altar) targets.push(state.objective.altar);
 for (const p of targets) if (!full.seen.has(positionKey(p))) errors.push(`Objective target cannot be discovered: ${positionKey(p)}`);
 for (const c of state.connections) if (c.gate) {
  const source = state.supplies.find(s => s.item === c.gate);
  const without = discoveryClosure(state, c.gate);
  if (!source || !without.seen.has(positionKey(source.position))) errors.push(`Tool depends on its own gate: ${c.gate}`);
  if (!full.opened.has(c.id)) errors.push(`Gate is unreachable: ${c.id}`);
  const closed = discoveryClosure(state, undefined, c.id);
  (targets.some(p => !closed.seen.has(positionKey(p))) ? requiredGates : optionalGates).push(c.id);
  prerequisites[c.id] = source ? state.connections.filter(other => other.gate && other.id !== c.id
   && !discoveryClosure(state, undefined, other.id).seen.has(positionKey(source.position))).map(other => other.id) : [];
 }
 if (state.objective.structure) {
  const intended = ['passage-3', ...(state.objective.structure.startsWith('tool-chain') ? ['passage-4'] : [])];
  for (const id of intended) if (!requiredGates.includes(id)) errors.push(`Mandatory seal can be bypassed: ${id}`);
 }
 return { valid: errors.length === 0, errors, requiredGates, optionalGates, prerequisites };
}
