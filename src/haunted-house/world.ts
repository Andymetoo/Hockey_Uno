import { DIRECTIONS, TUNING } from './content.ts';
import type { GameState, Position, Room, Tile } from './types.ts';

/** These helpers have no rendering, storage, or clock dependencies. */
export function tileAt(room: Room, x: number, y: number): Tile | undefined {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < room.width && y < room.height
    ? room.tiles[y * room.width + x] : undefined;
}

export function walkable(tile: Tile | undefined): boolean {
  return !!tile && ['floor', 'door', 'stairs', 'exit'].includes(tile.kind);
}

export function samePosition(a: Position, b: Position): boolean {
  return a.roomId === b.roomId && a.x === b.x && a.y === b.y;
}

export function adjacent(a: Position, b: Position): boolean {
  return a.roomId === b.roomId && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;
}

export function positionKey(position: Position): string {
  return `${position.roomId}:${position.x},${position.y}`;
}

export function cardinalNeighbors(state: GameState, position: Position): Position[] {
  const room = state.rooms.find(candidate => candidate.id === position.roomId);
  if (!room) return [];
  return Object.values(DIRECTIONS).map(delta => ({ roomId: room.id, x: position.x + delta.x, y: position.y + delta.y }))
    .filter(candidate => walkable(tileAt(room, candidate.x, candidate.y)));
}

export function neighbors(state: GameState, position: Position, allowedGate?: (gate: NonNullable<GameState['connections'][number]['gate']>) => boolean): Position[] {
  const result = cardinalNeighbors(state, position);
  for (const connection of state.connections) {
    if (!connection.opened && connection.gate && !allowedGate?.(connection.gate)) continue;
    if (samePosition(position, connection.a)) result.push({ ...connection.b });
    else if (samePosition(position, connection.b)) result.push({ ...connection.a });
  }
  return result;
}

export function illuminated(state: GameState, x: number, y: number): boolean {
  return Math.abs(state.player.x - x) + Math.abs(state.player.y - y) <= TUNING.lightRadius;
}

export function refreshExploration(state: GameState): void {
  const room = state.rooms.find(candidate => candidate.id === state.player.roomId);
  if (!room) return;
  room.visited = true;
  room.tiles.forEach((_, index) => {
    if (illuminated(state, index % room.width, Math.floor(index / room.width))) room.discovered[index] = true;
  });
}

export function seedNumber(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return hash >>> 0 || 1;
}

/** Xorshift32: the complete random stream is the uint32 saved in state.rng. */
export function random(state: { rng: number }): number {
  let next = state.rng | 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  state.rng = next >>> 0;
  return state.rng / 4294967296;
}
