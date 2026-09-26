import type { GameSnapshot, Position, Room, Tile } from './types.ts';
export const samePosition = (a: Position, b: Position): boolean => a.roomId === b.roomId && a.x === b.x && a.y === b.y;
export const positionKey = (p: Position): string => `${p.roomId}:${p.x},${p.y}`;
export function tileAt(room: Room, x: number, y: number): Tile | undefined { return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < room.width && y < room.height ? room.tiles[y * room.width + x] : undefined; }
export function known(state: GameSnapshot, p: Position): boolean { const r = state.rooms.find(r => r.id === p.roomId); return !!r && !!tileAt(r, p.x, p.y) && r.discovered[p.y * r.width + p.x]; }
export function occupied(state: GameSnapshot, p: Position): boolean { return state.hauntings.some(h => h.hp > 0 && samePosition(h.position, p)) || state.supplies.some(s => !s.used && samePosition(s.position, p)); }
export function traversable(state: GameSnapshot, p: Position, knownOnly = true): boolean {
 const r = state.rooms.find(r => r.id === p.roomId); const t = r && tileAt(r, p.x, p.y);
 if (!t || t.kind === 'wall' || t.kind === 'altar' || (knownOnly && !known(state, p)) || occupied(state, p)) return false;
 return !t.connectionId || !!state.connections.find(c => c.id === t.connectionId)?.opened;
}
export function illuminated(state: GameSnapshot, p: Position): boolean { return p.roomId === state.player.roomId && Math.abs(p.x - state.player.x) <= 1 && Math.abs(p.y - state.player.y) <= 1; }
export function refreshExploration(state: GameSnapshot): void {
 const r = state.rooms.find(r => r.id === state.player.roomId)!; r.visited = true;
 for (let y = state.player.y - 1; y <= state.player.y + 1; y++) for (let x = state.player.x - 1; x <= state.player.x + 1; x++) if (tileAt(r, x, y)) r.discovered[y * r.width + x] = true;
}
export function revealGain(state: GameSnapshot, p: Position): number {
 const r = state.rooms.find(r => r.id === p.roomId)!; let n = 0;
 for (let y = p.y - 1; y <= p.y + 1; y++) for (let x = p.x - 1; x <= p.x + 1; x++) if (tileAt(r, x, y) && !r.discovered[y * r.width + x]) n++;
 return n;
}
export function seedNumber(seed: string): number { let h = 2166136261; for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619); return h >>> 0 || 1; }
export function random(s: { rng: number }): number { let n = s.rng | 0; n ^= n << 13; n ^= n >>> 17; n ^= n << 5; s.rng = n >>> 0; return s.rng / 4294967296; }
export function shuffled<T>(values: readonly T[], rng: { rng: number }): T[] { const a = [...values]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random(rng) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
