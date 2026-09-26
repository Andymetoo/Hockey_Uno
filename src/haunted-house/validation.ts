import { ITEMS, SAVE_VERSION, TUNING } from './content.ts';
import type { GameSnapshot, GameState, Position } from './types.ts';
import { samePosition, tileAt, traversable, walkable } from './world.ts';

type Data = Record<string, unknown>;
const object = (v: unknown): v is Data => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const text = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max;
const optional = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v);
const item = (v: unknown) => typeof v === 'string' && Object.hasOwn(ITEMS, v);
const reward = (v: unknown) => object(v) && optional(v.power, p => integer(p, 1, 20)) && optional(v.treasure, p => integer(p, 1, 1000)) && optional(v.item, item);
const list = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;
const kinds = ['wall', 'floor', 'furniture', 'container', 'candle', 'door', 'stairs', 'altar', 'exit'];
const lead = (v: unknown) => object(v) && ['room', 'haunting', 'candle', 'container', 'connection'].includes(String(v.kind)) && text(v.id, 80);

/** Structural validity deliberately says nothing about remaining resource solvability. */
export function validateSnapshot(value: unknown): value is GameSnapshot {
  try {
    if (!object(value) || 'undo' in value || value.version !== SAVE_VERSION || !text(value.seed, 120) || !value.seed.length || !integer(value.rng, 1, 0xffffffff)) return false;
    if (!integer(value.steps) || !integer(value.decisions) || !integer(value.light, 0, TUNING.maxLight) || value.maxLight !== TUNING.maxLight || !integer(value.ritualPower, 1, 100) || !integer(value.treasure, 0, 1000000)) return false;
    if (!['active', 'won'].includes(String(value.status)) || !list(value.inventory, Object.keys(ITEMS).length) || !value.inventory.every(item) || new Set(value.inventory).size !== value.inventory.length) return false;
    if (!list(value.rooms, 32) || !value.rooms.length || !list(value.connections, 80) || !list(value.hauntings, 24) || !list(value.candles, 20) || !list(value.clusters, 16)) return false;
    if (!list(value.journal, 100) || !value.journal.every(t => text(t, 1500)) || !list(value.log, TUNING.maxLogEntries) || !value.log.every(t => text(t, 1500))) return false;
    if (!object(value.objective) || !['escape', 'diary', 'keepsake'].includes(String(value.objective.kind)) || !text(value.objective.title, 150) || !text(value.objective.description, 1000) || typeof value.objective.completed !== 'boolean' || !integer(value.objective.ritualCost, 0, TUNING.maxLight)) return false;
    const ids = new Set<string>();
    const identifier = (id: unknown) => { if (!text(id, 80) || !id.length || ids.has(id)) return false; ids.add(id); return true; };
    for (const room of value.rooms) {
      if (!object(room) || !identifier(room.id) || !text(room.name, 120) || !text(room.pattern, 100) || !integer(room.floor, 0, 6) || !integer(room.mapX, -40, 40) || !integer(room.mapY, -40, 40)) return false;
      if (!integer(room.width, 3, 25) || !integer(room.height, 3, 25) || typeof room.visited !== 'boolean') return false;
      if (!list(room.tiles, 625) || room.tiles.length !== room.width * room.height || !list(room.discovered, 625) || room.discovered.length !== room.tiles.length || !room.discovered.every(v => typeof v === 'boolean')) return false;
      if (!room.tiles.every(t => object(t) && kinds.includes(String(t.kind)) && optional(t.label, v => text(v, 200)) && optional(t.containerId, v => text(v, 80)) && optional(t.candleId, v => text(v, 80)) && optional(t.connectionId, v => text(v, 80)))) return false;
      if (!list(room.containers, 20)) return false;
      for (const c of room.containers) {
        if (!object(c) || !identifier(c.id) || !text(c.label, 150) || !integer(c.x, 0, room.width - 1) || !integer(c.y, 0, room.height - 1) || typeof c.opened !== 'boolean' || !reward(c.reward) || !optional(c.note, v => text(v, 1500))) return false;
        if (!optional(c.leads, v => list(v, 12) && v.every(lead))) return false;
        const tile = room.tiles[c.y * room.width + c.x];
        if (!object(tile) || tile.kind !== 'container' || tile.containerId !== c.id) return false;
      }
    }
    const state = value as unknown as GameSnapshot;
    const position = (p: unknown): p is Position => {
      if (!object(p) || !text(p.roomId, 80) || !integer(p.x) || !integer(p.y)) return false;
      const room = state.rooms.find(r => r.id === p.roomId);
      return !!room && !!tileAt(room, p.x, p.y);
    };
    const tile = (p: Position) => tileAt(state.rooms.find(r => r.id === p.roomId)!, p.x, p.y)!;
    const endpoints = new Set<string>();
    for (const c of state.connections) {
      if (!object(c) || !identifier(c.id) || !['door', 'stairs'].includes(c.kind) || typeof c.opened !== 'boolean' || !position(c.a) || !position(c.b) || c.a.roomId === c.b.roomId) return false;
      if (!optional(c.gate, v => ['moth-key', 'thorn-key', 'crowbar'].includes(String(v))) || (!c.gate && !c.opened)) return false;
      const aRoom = state.rooms.find(r => r.id === c.a.roomId)!, bRoom = state.rooms.find(r => r.id === c.b.roomId)!;
      if (c.kind === 'stairs' ? Math.abs(aRoom.floor - bRoom.floor) !== 1 : aRoom.floor !== bRoom.floor) return false;
      for (const p of [c.a, c.b]) {
        const key = `${p.roomId}:${p.x},${p.y}`;
        if (endpoints.has(key) || tile(p).kind !== c.kind || tile(p).connectionId !== c.id) return false;
        endpoints.add(key);
      }
    }
    const haunted = new Set<string>();
    for (const h of state.hauntings) {
      if (!object(h) || !identifier(h.id) || !text(h.name, 150) || !position(h.position) || !walkable(tile(h.position)) || !integer(h.resistance, 1, 100) || typeof h.banished !== 'boolean' || !reward(h.reward) || !text(h.benefit, 1000)) return false;
      if (!optional(h.requires, item) || !optional(h.resolution, v => v === 'keepsake') || !optional(h.guards, v => list(v, 12) && v.every(id => text(id, 80)))) return false;
      const key = `${h.position.roomId}:${h.position.x},${h.position.y}`;
      if (haunted.has(key)) return false;
      haunted.add(key);
    }
    for (const c of state.candles) {
      if (!object(c) || !identifier(c.id) || !text(c.name, 150) || !position(c.position) || !integer(c.restores, 1, 100) || typeof c.used !== 'boolean' || tile(c.position).kind !== 'candle' || tile(c.position).candleId !== c.id) return false;
    }
    for (const room of state.rooms) for (let i = 0; i < room.tiles.length; i++) {
      const t = room.tiles[i], x = i % room.width, y = Math.floor(i / room.width);
      if ((t.kind === 'door' || t.kind === 'stairs') && !endpoints.has(`${room.id}:${x},${y}`)) return false;
      if (t.kind === 'container' && !room.containers.some(c => c.id === t.containerId && c.x === x && c.y === y)) return false;
      if (t.kind === 'candle' && !state.candles.some(c => c.id === t.candleId && samePosition(c.position, { roomId: room.id, x, y }))) return false;
    }
    const validLead = (l: unknown) => {
      if (!lead(l)) return false;
      const p = l as { kind: string; id: string };
      return p.kind === 'room' ? state.rooms.some(r => r.id === p.id) : p.kind === 'haunting' ? state.hauntings.some(h => h.id === p.id) : p.kind === 'candle' ? state.candles.some(c => c.id === p.id) : p.kind === 'connection' ? state.connections.some(c => c.id === p.id) : state.rooms.some(r => r.containers.some(c => c.id === p.id));
    };
    for (const room of state.rooms) for (const c of room.containers) if (c.leads && !c.leads.every(validLead)) return false;
    for (const h of state.hauntings) if (h.guards && !h.guards.every(id => ids.has(id))) return false;
    for (const c of state.clusters) if (!object(c) || !identifier(c.id) || !position(c.vantage) || !walkable(tile(c.vantage)) || !list(c.members, 20) || !c.members.every(validLead)) return false;
    if (!position(state.player) || !position(state.entrance) || tile(state.entrance).kind !== 'exit' || !traversable(state, state.player)) return false;
    const room = state.rooms.find(r => r.id === state.player.roomId)!;
    if (!room.visited || !room.discovered[state.player.y * room.width + state.player.x]) return false;
    const o = state.objective;
    if (o.kind === 'keepsake') {
      if (!position(o.altar) || tile(o.altar).kind !== 'altar' || !text(o.hauntingId, 80)) return false;
      const h = state.hauntings.find(h => h.id === o.hauntingId);
      if (!h || h.resolution !== 'keepsake' || h.banished !== o.completed || (o.completed && !state.inventory.includes('keepsake'))) return false;
    } else if (o.completed !== state.inventory.includes(o.kind === 'escape' ? 'exit-key' : 'diary')) return false;
    if (state.hauntings.some(h => h.resolution && h.id !== o.hauntingId)) return false;
    if (state.status === 'won' && (!o.completed || state.player.roomId !== state.entrance.roomId || Math.abs(state.player.x - state.entrance.x) + Math.abs(state.player.y - state.entrance.y) > 1)) return false;
    return true;
  } catch { return false; }
}

function worldIdentity(s: GameSnapshot): string {
  return JSON.stringify({
    seed: s.seed, rng: s.rng, entrance: s.entrance, maxLight: s.maxLight,
    rooms: s.rooms.map(r => [r.id, r.name, r.floor, r.mapX, r.mapY, r.pattern, r.width, r.height, r.tiles, r.containers.map(c => [c.id, c.label, c.x, c.y, c.reward, c.note, c.leads])]),
    connections: s.connections.map(c => [c.id, c.a, c.b, c.kind, c.gate]),
    hauntings: s.hauntings.map(h => [h.id, h.name, h.position, h.resistance, h.reward, h.benefit, h.requires, h.resolution, h.guards]),
    candles: s.candles.map(c => [c.id, c.name, c.position, c.restores]), clusters: s.clusters,
    objective: [s.objective.kind, s.objective.title, s.objective.description, s.objective.altar, s.objective.hauntingId, s.objective.ritualCost],
  });
}
export function isGameState(value: unknown): value is GameState {
  if (!object(value) || !list(value.undo, TUNING.undoLimit)) return false;
  const { undo, ...core } = value;
  if (!validateSnapshot(core)) return false;
  const identity = worldIdentity(core);
  let previousDecision = -1;
  for (const entry of undo) {
    if (!validateSnapshot(entry) || entry.status !== 'active' || entry.decisions <= previousDecision || entry.decisions >= core.decisions || entry.steps > core.steps || worldIdentity(entry) !== identity) return false;
    previousDecision = entry.decisions;
  }
  return true;
}
