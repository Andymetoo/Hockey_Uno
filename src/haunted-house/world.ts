import { DIRECTIONS, TUNING } from './content.ts';
import type { GameSnapshot, Lead, Position, Room, Tile } from './types.ts';

export function tileAt(room: Room, x: number, y: number): Tile | undefined {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < room.width && y < room.height ? room.tiles[y * room.width + x] : undefined;
}
export const walkable = (tile: Tile | undefined): boolean => !!tile && ['floor', 'door', 'stairs', 'exit'].includes(tile.kind);
export const samePosition = (a: Position, b: Position): boolean => a.roomId === b.roomId && a.x === b.x && a.y === b.y;
export const adjacent = (a: Position, b: Position): boolean => a.roomId === b.roomId && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;
export const positionKey = (p: Position): string => `${p.roomId}:${p.x},${p.y}`;
export function known(state: GameSnapshot, p: Position): boolean {
  const room = state.rooms.find(r => r.id === p.roomId);
  return !!room && !!tileAt(room, p.x, p.y) && room.discovered[p.y * room.width + p.x];
}
export function traversable(state: GameSnapshot, p: Position, knownOnly = false): boolean {
  const room = state.rooms.find(r => r.id === p.roomId);
  const tile = room && tileAt(room, p.x, p.y);
  if (!walkable(tile) || (knownOnly && !known(state, p))) return false;
  if (state.hauntings.some(h => !h.banished && samePosition(h.position, p))) return false;
  const passage = tile?.connectionId && state.connections.find(c => c.id === tile.connectionId);
  return !passage || passage.opened;
}
export function cardinalNeighbors(state: GameSnapshot, p: Position, knownOnly = false): Position[] {
  return Object.values(DIRECTIONS).map(d => ({ roomId: p.roomId, x: p.x + d.x, y: p.y + d.y })).filter(next => traversable(state, next, knownOnly));
}
export function neighbors(state: GameSnapshot, p: Position, knownOnly = false): Position[] {
  const result = cardinalNeighbors(state, p, knownOnly);
  for (const c of state.connections) {
    if (!c.opened) continue;
    const next = samePosition(c.a, p) ? c.b : samePosition(c.b, p) ? c.a : undefined;
    if (next && traversable(state, next, knownOnly)) result.push({ ...next });
  }
  return result;
}
export function illuminated(state: GameSnapshot, x: number, y: number): boolean {
  return Math.abs(state.player.x - x) + Math.abs(state.player.y - y) <= TUNING.lightRadius;
}
export function refreshExploration(state: GameSnapshot): void {
  const room = state.rooms.find(r => r.id === state.player.roomId);
  if (!room) return;
  room.visited = true;
  room.tiles.forEach((_, i) => { if (illuminated(state, i % room.width, Math.floor(i / room.width))) room.discovered[i] = true; });
}
export function discoveredChoices(state: GameSnapshot): Set<string> {
  const found = new Set<string>();
  for (const h of state.hauntings) if (known(state, h.position)) found.add(h.id);
  for (const c of state.candles) if (known(state, c.position)) found.add(c.id);
  for (const room of state.rooms) for (const c of room.containers) if (known(state, { roomId: room.id, x: c.x, y: c.y })) found.add(c.id);
  for (const c of state.connections) if (known(state, c.a) || known(state, c.b)) found.add(c.id);
  if (state.objective.altar && known(state, state.objective.altar)) found.add('memorial');
  return found;
}
export function leadText(state: GameSnapshot, lead: Lead): string {
  if (lead.kind === 'room') return state.rooms.find(r => r.id === lead.id)?.name ?? 'An unrecorded room';
  const entity = lead.kind === 'haunting' ? state.hauntings.find(h => h.id === lead.id) : lead.kind === 'candle' ? state.candles.find(c => c.id === lead.id) : undefined;
  if (entity) return `${entity.name} in the ${state.rooms.find(r => r.id === entity.position.roomId)?.name}`;
  if (lead.kind === 'container') {
    const room = state.rooms.find(r => r.containers.some(c => c.id === lead.id));
    return `${room?.containers.find(c => c.id === lead.id)?.label ?? 'An object'} in the ${room?.name ?? 'house'}`;
  }
  const passage = state.connections.find(c => c.id === lead.id);
  return passage ? `Passage between ${state.rooms.find(r => r.id === passage.a.roomId)?.name} and ${state.rooms.find(r => r.id === passage.b.roomId)?.name}` : 'An unrecorded passage';
}
export function seedNumber(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return hash >>> 0 || 1;
}
export function random(state: { rng: number }): number {
  let next = state.rng | 0;
  next ^= next << 13; next ^= next >>> 17; next ^= next << 5;
  state.rng = next >>> 0;
  return state.rng / 4294967296;
}
