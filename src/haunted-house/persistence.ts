import { ITEMS, SAVE_VERSION, TUNING } from './content.ts';
import { validateHouse } from './generation.ts';
import type { GameState, Position } from './types.ts';

export const SAVE_KEY = 'haunted-house.save.v1';
export type LoadResult = { kind: 'empty' } | { kind: 'loaded'; state: GameState } | { kind: 'error'; message: string; raw?: string };
export interface SaveResult { ok: boolean; message: string }
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const text = (value: unknown, max = 500): value is string => typeof value === 'string' && value.length <= max;
const item = (value: unknown): boolean => typeof value === 'string' && Object.hasOwn(ITEMS, value);
const optional = (value: unknown, check: (value: unknown) => boolean): boolean => value === undefined || check(value);
const kinds = ['wall', 'floor', 'furniture', 'container', 'door', 'stairs', 'altar', 'exit'];

/** Validate untrusted JSON before it can become an interactive game. No repair or regeneration. */
export function isGameState(value: unknown): value is GameState {
  if (!record(value) || value.version !== SAVE_VERSION || !text(value.seed, 120) || !value.seed.length || !integer(value.rng, 0, 0xffffffff)) return false;
  if (!integer(value.turn) || !integer(value.spiritMoves) || value.spiritMoves !== Math.floor(value.turn / TUNING.spiritEveryTurns)) return false;
  if (!Array.isArray(value.rooms) || value.rooms.length < 1 || value.rooms.length > 40 || !Array.isArray(value.connections) || value.connections.length > 100) return false;
  if (!Array.isArray(value.inventory) || !value.inventory.every(item) || new Set(value.inventory).size !== value.inventory.length) return false;
  if (!integer(value.matches, 0, 10000) || !integer(value.treasure, 0, 1000000) || typeof value.charm !== 'boolean') return false;
  if (!['active', 'won', 'lost'].includes(String(value.status))) return false;
  if (!Array.isArray(value.log) || value.log.length > TUNING.maxLogEntries || !value.log.every(line => text(line, 1000))) return false;
  if (!Array.isArray(value.evidence) || value.evidence.length > 4) return false;
  if (!record(value.objective) || !['escape', 'diary', 'keepsake'].includes(String(value.objective.kind)) || !text(value.objective.title) || !text(value.objective.description) || typeof value.objective.completed !== 'boolean') return false;
  const roomIds = new Set<string>();
  const containerIds = new Set<string>();
  for (const room of value.rooms) {
    if (!record(room) || !text(room.id, 80) || roomIds.has(room.id) || !text(room.name, 100) || !integer(room.floor, 0, 9)) return false;
    roomIds.add(room.id);
    if (!integer(room.width, 5, 21) || !integer(room.height, 5, 21) || typeof room.visited !== 'boolean') return false;
    if (!Array.isArray(room.tiles) || room.tiles.length !== room.width * room.height || !Array.isArray(room.discovered) || room.discovered.length !== room.tiles.length || !room.discovered.every(flag => typeof flag === 'boolean')) return false;
    if (!room.tiles.every(tile => record(tile) && kinds.includes(String(tile.kind)) && optional(tile.label, v => text(v, 150)) && optional(tile.connectionId, v => text(v, 80)) && optional(tile.containerId, v => text(v, 80)))) return false;
    if (!Array.isArray(room.containers) || room.containers.length > 15) return false;
    for (const container of room.containers) {
      if (!record(container) || !text(container.id, 80) || containerIds.has(container.id) || !text(container.label, 150) || !integer(container.x, 0, room.width - 1) || !integer(container.y, 0, room.height - 1) || typeof container.opened !== 'boolean') return false;
      if (!optional(container.item, item) || !optional(container.matches, v => integer(v, 0, 1000)) || !optional(container.treasure, v => integer(v, 0, 10000)) || !optional(container.note, v => text(v, 500))) return false;
      const tile = room.tiles[container.y * room.width + container.x];
      if (!record(tile) || tile.kind !== 'container' || tile.containerId !== container.id) return false;
      containerIds.add(container.id);
    }
  }
  const state = value as unknown as GameState;
  const position = (p: unknown, walkable = true): p is Position => {
    if (!record(p) || !text(p.roomId, 80) || !integer(p.x) || !integer(p.y)) return false;
    const room = state.rooms.find(r => r.id === p.roomId);
    if (!room || p.x >= room.width || p.y >= room.height) return false;
    return !walkable || !['wall', 'furniture', 'container', 'altar'].includes(room.tiles[p.y * room.width + p.x].kind);
  };
  if (!position(value.player) || !position(value.spirit) || !position(value.entrance) || !optional(value.spiritPrevious, p => position(p))) return false;
  const overlapping = state.player.roomId === state.spirit.roomId && state.player.x === state.spirit.x && state.player.y === state.spirit.y;
  if (state.status === 'lost' ? !overlapping || state.charm : overlapping) return false;
  const playerRoom = state.rooms.find(room => room.id === state.player.roomId)!;
  if (!playerRoom.visited || !playerRoom.discovered[state.player.y * playerRoom.width + state.player.x]) return false;
  const collected = new Set(state.rooms.flatMap(room => room.containers.filter(container => container.opened && container.item).map(container => container.item!)));
  if (state.inventory.some(id => !collected.has(id)) || [...collected].some(id => !state.inventory.includes(id))) return false;
  const goalItem = state.objective.kind === 'escape' ? 'exit-key' : state.objective.kind;
  if (state.objective.kind !== 'keepsake' && state.objective.completed !== state.inventory.includes(goalItem)) return false;
  if (state.objective.completed && !state.inventory.includes(goalItem)) return false;
  if (state.status === 'won' && (!state.objective.completed || state.player.roomId !== state.entrance.roomId || Math.abs(state.player.x - state.entrance.x) + Math.abs(state.player.y - state.entrance.y) > 1)) return false;
  if (state.objective.kind === 'keepsake' && (!position(state.objective.altar, false) || state.rooms.find(r => r.id === state.objective.altar!.roomId)!.tiles[state.objective.altar!.y * state.rooms.find(r => r.id === state.objective.altar!.roomId)!.width + state.objective.altar!.x].kind !== 'altar')) return false;
  const connections = new Set<string>();
  const endpoints = new Set<string>();
  for (const connection of state.connections) {
    if (!record(connection) || !text(connection.id, 80) || connections.has(connection.id) || !['door', 'stairs'].includes(connection.kind) || typeof connection.opened !== 'boolean') return false;
    if (!optional(connection.gate, gate => ['moth-key', 'thorn-key', 'crowbar'].includes(String(gate))) || !position(connection.a) || !position(connection.b) || connection.a.roomId === connection.b.roomId) return false;
    for (const p of [connection.a, connection.b]) {
      const key = `${p.roomId}:${p.x}:${p.y}`;
      if (endpoints.has(key)) return false;
      endpoints.add(key);
      const room = state.rooms.find(r => r.id === p.roomId)!;
      const tile = room.tiles[p.y * room.width + p.x];
      if (tile.connectionId !== connection.id || tile.kind !== connection.kind) return false;
    }
    connections.add(connection.id);
  }
  for (const room of state.rooms) for (let i = 0; i < room.tiles.length; i++) {
    const tile = room.tiles[i];
    if ((tile.kind === 'door' || tile.kind === 'stairs') && !endpoints.has(`${room.id}:${i % room.width}:${Math.floor(i / room.width)}`)) return false;
    if (tile.kind === 'container' && !room.containers.some(c => c.id === tile.containerId && c.x === i % room.width && c.y === Math.floor(i / room.width))) return false;
  }
  for (const clue of state.evidence) {
    if (!record(clue) || !position(clue.position) || typeof clue.haunted !== 'boolean' || clue.epoch !== state.spiritMoves) return false;
    const haunted = clue.position.roomId === state.spirit.roomId && clue.position.x === state.spirit.x && clue.position.y === state.spirit.y;
    if (clue.haunted !== haunted) return false;
  }
  try { return validateHouse(state).length === 0; } catch { return false; }
}

export function parseSave(raw: string): LoadResult {
  try {
    if (raw.length > 1000000) throw new Error('oversized');
    const value: unknown = JSON.parse(raw);
    if (record(value) && value.version !== undefined && value.version !== SAVE_VERSION) {
      return { kind: 'error', message: 'This save belongs to a different version of Haunted House. It has been kept untouched.', raw };
    }
    if (!isGameState(value)) throw new Error('invalid');
    return { kind: 'loaded', state: value };
  } catch {
    return { kind: 'error', message: 'This Haunted House save could not be read. It has been kept untouched. You can download a copy before starting a new house.', raw };
  }
}

export function loadGame(storage?: StoragePort): LoadResult {
  try {
    const target = storage ?? globalThis.localStorage;
    const raw = target.getItem(SAVE_KEY);
    return raw === null ? { kind: 'empty' } : parseSave(raw);
  } catch {
    return { kind: 'error', message: 'Browser storage is unavailable. You can play, but progress cannot be saved after closing this page.' };
  }
}

export function saveGame(state: GameState, storage?: StoragePort): SaveResult {
  try {
    const target = storage ?? globalThis.localStorage;
    const raw = JSON.stringify(state);
    target.setItem(SAVE_KEY, raw);
    if (target.getItem(SAVE_KEY) !== raw) throw new Error('write did not persist');
    return { ok: true, message: `Saved · turn ${state.turn}` };
  } catch {
    return { ok: false, message: 'Not saved · browser storage is unavailable or full. Keep this page open to continue.' };
  }
}

export function newSeed(): string {
  const entropy = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(entropy);
  else { entropy[0] = Math.floor(Math.random() * 0x100000000); entropy[1] = Date.now() >>> 0; }
  return `${entropy[0].toString(36)}-${entropy[1].toString(36)}`;
}
