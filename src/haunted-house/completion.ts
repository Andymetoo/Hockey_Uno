import type { GameSnapshot, GameState, Position } from './types.ts';
import { positionKey, refreshExploration, seedNumber, tileAt, traversable } from './world.ts';

export interface SupplyCounts { food: number; candle: number; tonic: number; oil: number; recovery?: number; total: number }
export interface CompletionReport {
 objective: { title: string; completed: boolean };
 hauntings: { defeated: number; total: number };
 exploration: { discovered: number; total: number };
 treasure: { collected: number; total: number };
 supplies: { floor: SupplyCounts; pocket: { tonic: number; oil: number; total: number }; total: number };
 turns: number;
 commendations: { title: string; description: string }[];
 explanation: string;
}
export interface CompletionRecord { runId: string; seed: string; variant: number; report: CompletionReport }

/** A restart is a new attempt; loading/importing/undo keep the existing identity. */
export function beginRun(state: GameState): GameState {
 const runId = globalThis.crypto?.randomUUID?.() ?? `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
 return { ...state, runId };
}

/** Internal generated candidates have no attempt identity. Real UI runs always do. */
export function completionIdentity(state: GameSnapshot): string {
 if (state.runId) return state.runId;
 const house = JSON.stringify([state.version, state.seed, state.variant, state.rooms.map(r => [r.id, r.width, r.tiles]), state.hauntings.map(h => [h.id, h.position, h.maxHp, h.attack]), state.supplies.map(s => [s.id, s.kind, s.position, s.amount])]);
 return `house-${seedNumber(house).toString(36)}-${seedNumber('identity:' + house).toString(36)}`;
}

/**
 * Attainable discovery, starting at the entrance, after occupants can be cleared
 * and legal tool gates opened. Uses the game's revelation and movement rules.
 * Walls never count; a memorial counts if visible, without needing to occupy it.
 * This is a geometry denominator, not a claim that every resource route clears it.
 */
export function explorationTargets(state: GameSnapshot): boolean[][] {
 const shadow: GameSnapshot = { ...state, player: { ...state.entrance }, rooms: state.rooms.map(r => ({ ...r, discovered: r.tiles.map(() => false), visited: false })), hauntings: [], supplies: [], connections: state.connections.map(c => ({ ...c, opened: true })) };
 const queue: Position[] = [], queued = new Set<string>();
 const enqueue = (p: Position) => {
  const id = positionKey(p);
  if (!queued.has(id) && traversable(shadow, p, false)) { queued.add(id); queue.push(p); }
 };
 enqueue(state.entrance);
 for (let i = 0; i < queue.length; i++) {
  const p = queue[i]; shadow.player = p; refreshExploration(shadow);
  const room = shadow.rooms.find(r => r.id === p.roomId)!;
  for (let y = p.y - 1; y <= p.y + 1; y++) for (let x = p.x - 1; x <= p.x + 1; x++) {
   const tile = tileAt(room, x, y); if (!tile) continue;
   const near = { roomId: room.id, x, y }; enqueue(near);
   // A discovered open endpoint can be travelled through without standing on it.
   if (tile.connectionId) {
    const c = shadow.connections.find(c => c.id === tile.connectionId);
    if (c) enqueue(positionKey(c.a) === positionKey(near) ? c.b : c.a);
   }
  }
 }
 return shadow.rooms.map(r => r.tiles.map((t, i) => t.kind !== 'wall' && r.discovered[i]));
}

export function completionReport(state: GameSnapshot): CompletionReport {
 const targets = explorationTargets(state);
 const exploration = { discovered: 0, total: 0 };
 targets.forEach((tiles, room) => tiles.forEach((target, i) => { if (target) { exploration.total++; if (state.rooms[room].discovered[i]) exploration.discovered++; } }));
 const floor: SupplyCounts = { food: 0, candle: 0, tonic: 0, oil: 0, total: 0 };
 for (const s of state.supplies) if (!s.used) {
  if (s.kind === 'food' || s.kind === 'candle') floor[s.kind]++;
  else if (s.kind === 'tonic' || s.kind === 'oil') floor[s.kind] += s.amount;
  else if (s.kind === 'relic' && s.effect?.kind === 'recovery') floor.recovery = (floor.recovery ?? 0) + 1;
 }
 floor.total = floor.food + floor.candle + floor.tonic + floor.oil + (floor.recovery ?? 0);
 const pocket = { tonic: state.resources.tonics, oil: state.resources.oils, total: state.resources.tonics + state.resources.oils };
 const report: CompletionReport = {
  objective: { title: state.objective.title, completed: state.status === 'won' },
  hauntings: { defeated: state.hauntings.filter(h => h.hp === 0).length, total: state.hauntings.length },
  exploration,
  treasure: { collected: state.resources.treasure, total: state.supplies.filter(s => s.kind === 'treasure').reduce((n, s) => n + s.amount, 0) },
  supplies: { floor, pocket, total: floor.total + pocket.total },
  turns: state.turns,
  commendations: [],
  explanation: 'Completing the objective is the main achievement. Optional commendations recognise different finishes, not a perfect grade. Supplies spent to explore are as valid as supplies saved. Turns are recorded, not ranked across houses.'
 };
 if (report.objective.completed) {
  report.commendations.push({ title: 'Into the morning', description: 'Completed the objective and left the house alive.' });
  if (exploration.total && exploration.discovered / exploration.total >= .8) report.commendations.push({ title: 'Curious explorer', description: 'Discovered at least 80% of playable tiles; standing on every tile is unnecessary.' });
  if (report.hauntings.total && report.hauntings.defeated / report.hauntings.total >= .75) report.commendations.push({ title: 'Peacebringer', description: 'Defeated at least 75% of the hauntings.' });
  if (report.treasure.collected > 0) report.commendations.push({ title: 'Treasure finder', description: 'Brought at least one treasure out of the house.' });
  if (report.supplies.total >= 3) report.commendations.push({ title: 'Well provisioned', description: 'Preserved at least three supply uses across the floor and your pockets.' });
 }
 return report;
}
