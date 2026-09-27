import { ITEMS, SAVE_VERSION, SPIRITS } from './content.ts';
import type { GameState, Position, Resources, UndoFrame } from './types.ts';
import { known, positionKey, samePosition, tileAt } from './world.ts';
const integer = (n: unknown, min = 0, max = 100000) => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
const string = (s: unknown, max = 1000): s is string => typeof s === 'string' && s.length <= max;
const strings = (a: unknown, max: number) => Array.isArray(a) && a.length <= max && a.every(x => string(x));
const bool = (v: unknown) => typeof v === 'boolean';
const ids = (a: { id: string }[]) => a.every(x => string(x.id, 80) && x.id.length > 0) && new Set(a.map(x => x.id)).size === a.length;
export function validResources(r: Resources): boolean {
 return !!r && ['health', 'maxHealth', 'light', 'maxLight', 'power', 'level', 'xp', 'tonics', 'oils', 'treasure'].every(k => integer(r[k as keyof Resources])) && r.maxHealth > 0 && r.maxLight > 0 && r.power > 0 && r.level > 0 && r.health <= r.maxHealth && r.light <= r.maxLight && r.xp < r.level + 2 && bool(r.ward) && bool(r.empowered);
}
/** Structural validation accepts dead and resource-exhausted runs, without solving them. */
export function isGameState(value: unknown): value is GameState {
 try {
  if (!value || typeof value !== 'object') return false;
  const s = value as GameState;
  if (s.version !== SAVE_VERSION || s.ruleset !== 'power-flare' || (s.runId !== undefined && (!string(s.runId, 200) || !s.runId)) || !string(s.seed, 100) || !s.seed.trim() || !integer(s.variant, 0, 100) || !integer(s.turns, 0, 20000) || !validResources(s.resources)) return false;
  if (!Array.isArray(s.rooms) || !s.rooms.length || s.rooms.length > 20 || !ids(s.rooms)) return false;
  for (const r of s.rooms) {
   if (!string(r.name, 100) || !integer(r.floor, 0, 10) || !integer(r.width, 3, 25) || !integer(r.height, 3, 25) || !bool(r.visited) || !Array.isArray(r.tiles) || r.tiles.length !== r.width * r.height || !Array.isArray(r.discovered) || r.discovered.length !== r.tiles.length || !r.discovered.every(bool)) return false;
   if (!r.tiles.every(t => t && ['wall', 'floor', 'door', 'stairs', 'exit', 'altar'].includes(t.kind) && (t.connectionId === undefined || string(t.connectionId, 80)))) return false;
  }
  const position = (p: Position) => !!p && string(p.roomId, 80) && integer(p.x, 0, 24) && integer(p.y, 0, 24) && s.rooms.some(r => r.id === p.roomId && !!tileAt(r, p.x, p.y) && tileAt(r, p.x, p.y)!.kind !== 'wall');
  if (!position(s.player) || !position(s.entrance) || !known(s, s.player)) return false;
  if (!Array.isArray(s.hauntings) || s.hauntings.length > 100 || !ids(s.hauntings) || !Array.isArray(s.supplies) || s.supplies.length > 200 || !ids(s.supplies) || !Array.isArray(s.connections) || s.connections.length > 50 || !ids(s.connections)) return false;
  const item = (id: unknown) => typeof id === 'string' && Object.hasOwn(ITEMS, id);
  if (!Array.isArray(s.inventory) || s.inventory.length > 6 || !s.inventory.every(item) || new Set(s.inventory).size !== s.inventory.length) return false;
  const occupied = new Set<string>();
  for (const h of s.hauntings) {
   if (!string(h.name, 100) || !Object.hasOwn(SPIRITS, h.kind) || (h.trait !== undefined && !['brittle', 'smouldering'].includes(h.trait)) || !position(h.position) || !integer(h.hp) || !integer(h.maxHp, 1) || h.hp > h.maxHp || !integer(h.attack) || !integer(h.regen) || !integer(h.xp, 1) || !integer(h.tier, 1) || !bool(h.boss) || (h.reward !== undefined && !item(h.reward))) return false;
   const p = positionKey(h.position); if (occupied.has(p)) return false; occupied.add(p);
  }
  for (const x of s.supplies) {
   if (!string(x.name, 100) || !['food', 'candle', 'tonic', 'oil', 'power', 'vitality', 'cache', 'treasure', 'note'].includes(x.kind) || !position(x.position) || !bool(x.used) || !integer(x.amount, 1) || (x.item !== undefined && !item(x.item)) || (x.text !== undefined && !string(x.text))) return false;
   const p = positionKey(x.position); if (occupied.has(p)) return false; occupied.add(p);
  }
  for (const c of s.connections) {
   if (!position(c.a) || !position(c.b) || c.a.roomId === c.b.roomId || !['door', 'stairs'].includes(c.kind) || !bool(c.opened) || (c.gate !== undefined && !item(c.gate))) return false;
   for (const p of [c.a, c.b]) { const r = s.rooms.find(r => r.id === p.roomId)!; const t = tileAt(r, p.x, p.y)!; if (t.kind !== c.kind || t.connectionId !== c.id || occupied.has(positionKey(p))) return false; occupied.add(positionKey(p)); }
  }
  for (const r of s.rooms) for (let i = 0; i < r.tiles.length; i++) {
   const t = r.tiles[i]; if ((t.kind === 'door' || t.kind === 'stairs') !== !!t.connectionId) return false;
   if (t.connectionId && !s.connections.some(c => c.id === t.connectionId && [c.a, c.b].some(p => p.roomId === r.id && p.x === i % r.width && p.y === Math.floor(i / r.width)))) return false;
  }
  if (!s.objective || !['escape', 'diary', 'keepsake'].includes(s.objective.kind) || !string(s.objective.title, 100) || !string(s.objective.description) || !bool(s.objective.completed) || (s.objective.kind === 'keepsake' && (!s.objective.altar || !position(s.objective.altar)))) return false;
  if (!strings(s.journal, 250) || !strings(s.log, 20) || !['active', 'won', 'dead'].includes(s.status) || (s.resources.health === 0) !== (s.status === 'dead')) return false;
  if (s.hauntings.some(h => h.hp > 0 && samePosition(h.position, s.player)) || s.supplies.some(x => !x.used && samePosition(x.position, s.player))) return false;
  if (!Array.isArray(s.undo) || s.undo.length !== s.turns || s.undo.length > 20000) return false;
  const validFrame = (f: UndoFrame, index: number) => !!f && f.turns === index && validResources(f.resources) && position(f.player) && Array.isArray(f.discovered) && f.discovered.length === s.rooms.length && f.discovered.every((a, i) => Array.isArray(a) && a.length === s.rooms[i].tiles.length && a.every(bool)) && Array.isArray(f.visited) && f.visited.length === s.rooms.length && f.visited.every(bool) && Array.isArray(f.hp) && f.hp.length === s.hauntings.length && f.hp.every((hp, i) => integer(hp, 0, s.hauntings[i].maxHp)) && Array.isArray(f.used) && f.used.length === s.supplies.length && f.used.every(bool) && Array.isArray(f.opened) && f.opened.length === s.connections.length && f.opened.every(bool) && Array.isArray(f.inventory) && f.inventory.length <= 6 && f.inventory.every(item) && bool(f.completed) && f.status === 'active' && f.resources.health > 0 && strings(f.journal, 250) && strings(f.log, 20);
  return s.undo.every(validFrame);
 } catch { return false; }
}
