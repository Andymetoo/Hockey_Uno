import { isRecoverySupply } from './item-definitions.ts';
import { act, previewAttack, exitReadiness } from './game.ts';
import { TUNING } from './content.ts';
import { choiceValue } from './diagnostics.ts';
import type { Action, GameState, Haunting, Position } from './types.ts';
import { known, revealGain, samePosition, traversable } from './world.ts';
export interface SolveResult { solved: boolean; actions: Action[]; visited: number; reason: 'won' | 'budget' | 'exhausted' }
export type SolvePreference = 'balanced' | 'health' | 'light';
interface Node { state: GameState; actions: Action[] }
function apply(node: Node, action: Action): Node | undefined { const result = act(node.state, action, false); return result.committed && result.state.status !== 'dead' ? { state: result.state, actions: [...node.actions, action] } : undefined; }
/** Uses revealed contents only. Unknown tiles are never inspected to select a destination. */
export function explorationAction(s: GameState): Action | undefined {
 let best: Position | undefined; let gain = 0;
 for (const r of s.rooms) for (let i = 0; i < r.tiles.length; i++) {
  const p = { roomId: r.id, x: i % r.width, y: Math.floor(i / r.width) };
  if (!traversable(s, p) || samePosition(s.player, p)) continue;
  const n = revealGain(s, p); if (n > gain) { gain = n; best = p; }
 }
 if (best) return { type: 'move', to: best };
 for (const c of s.connections) if (c.opened) for (const [from, to] of [[c.a, c.b], [c.b, c.a]]) if (known(s, from) && (!known(s, to) || revealGain(s, to))) return { type: 'travel', connectionId: c.id, from };
 return undefined;
}
function expand(node: Node): Node {
 // Finite: every move reveals at least one tile; pickups and unlocks remove an obstacle.
 for (let n = 0; n < 2500; n++) {
  const s = node.state;
  let action = explorationAction(s);
  if (!action) {
   const x = s.supplies.find(x => !x.used && known(s, x.position) && !isRecoverySupply(x));
   if (x) action = { type: 'use', supplyId: x.id };
  }
  if (!action) { const c = s.connections.find(c => !c.opened && (!c.gate || s.inventory.includes(c.gate)) && (known(s, c.a) || known(s, c.b))); if (c) action = { type: 'unlock', connectionId: c.id }; }
  if (!action && s.objective.kind === 'keepsake' && !s.objective.completed && s.inventory.includes('keepsake') && s.objective.altar && known(s, s.objective.altar)) action = { type: 'settle' };
  const exit = exitReadiness(s);
  if (!action && exit.prerequisitesMet) action = exit.canLeave ? { type: 'leave' } : { type: 'move', to: s.entrance };
  if (!action || s.status !== 'active') return node;
  const next = apply(node, action); if (!next) return node; node = next;
 }
 return node;
}
/** Different complete-fight plans. Every action (including preparations) runs through act(). */
function fights(node: Node, enemy: Haunting): Node[] {
 const result: Node[] = [];
 const preparations: Action[][] = [[], [{ type: 'ward' }], [{ type: 'oil' }], [{ type: 'oil' }, { type: 'ward' }]];
 for (const prep of preparations) for (const tactic of ['strike', 'flare-first', 'flare-finish'] as const) {
  let trial: Node | undefined = node;
  for (const a of prep) { if (!trial) break; trial = apply(trial, a); }
  if (!trial) continue;
  for (let hit = 0; hit < 40 && trial; hit++) {
   const h = trial.state.hauntings.find(x => x.id === enemy.id)!;
   if (!h.hp) { result.push(trial); break; }
   const melee = previewAttack(trial.state, h, 'strike'), flare = previewAttack(trial.state, h, 'flare');
   const useFlare = flare.affordable && (tactic === 'flare-first' || (tactic === 'flare-finish' && flare.kills) || melee.lethal);
   if (melee.lethal && !useFlare) break;
   trial = apply(trial, { type: 'attack', hauntingId: h.id, mode: useFlare ? 'flare' : 'strike' });
  }
 }
 // Keep distinct outcomes; do not require the only possible solution to fit these plans.
 return [...new Map(result.map(n => [key(n.state), n])).values()];
}
function key(s: GameState): string {
 return JSON.stringify([s.resources, s.hauntings.map(h => h.hp), s.supplies.map(x => +x.used), s.connections.map(c => +c.opened), s.rooms.map(r => r.discovered.map(v => v ? '1' : '0').join('')), s.inventory, s.objective.completed, s.status]);
}
function score(s: GameState, preference: SolvePreference): number {
 const r = s.resources;
 return s.hauntings.filter(h => h.hp === 0).length * 100 + r.level * 35 + r.xp * 8 + r.health * (preference === 'health' ? 2.6 : 1.3) + r.light * (preference === 'light' ? 6 : 3) + r.tonics * 12 + r.oils * 8 + (r.ward ? 7 : 0) + (r.empowered ? 8 : 0) + s.inventory.length * 55 + s.rooms.filter(r => r.visited).length * 15 + s.supplies.filter(x => !x.used && x.kind === 'food').length * 18 + s.supplies.filter(x => !x.used && x.kind === 'candle').length * 12 + choiceValue(s) * 2;
}
/** Bounded witness search. Failure means unverified, never a proof of impossibility. */
export function solve(initial: GameState, budget: number = TUNING.solverBudget, preference: SolvePreference = 'balanced'): SolveResult {
 let frontier = [expand({ state: { ...initial, undo: [] }, actions: [] })]; const seen = new Set<string>(); let visited = 0;
 while (frontier.length && visited < budget) {
  const next: Node[] = [];
  for (const node of frontier) {
   if (node.state.status === 'won') return { solved: true, actions: node.actions, visited, reason: 'won' };
   const k = key(node.state); if (seen.has(k)) continue; seen.add(k); visited++;
   if (visited > budget) break;
   for (const h of node.state.hauntings) if (h.hp > 0 && known(node.state, h.position)) next.push(...fights(node, h).map(expand));
   for (const x of node.state.supplies) if (!x.used && known(node.state, x.position) && isRecoverySupply(x)) { const n = apply(node, { type: 'use', supplyId: x.id }); if (n) next.push(expand(n)); }
   if (node.state.resources.tonics && node.state.resources.health < node.state.resources.maxHealth) { const n = apply(node, { type: 'tonic' }); if (n) next.push(n); }
  }
  const won = next.find(n => n.state.status === 'won'); if (won) return { solved: true, actions: won.actions, visited, reason: 'won' };
  frontier = [...new Map(next.filter(n => !seen.has(key(n.state))).map(n => [key(n.state), n])).values()].map(n => ({ node: n, score: score(n.state, preference) })).sort((a, b) => b.score - a.score).slice(0, TUNING.solverWidth).map(n => n.node);
 }
 return { solved: false, actions: [], visited, reason: frontier.length ? 'budget' : 'exhausted' };
}
export function replayWitness(initial: GameState, actions: Action[], record = false): GameState | undefined {
 let state = initial;
 for (const action of actions) { const r = act(state, action, record); if (!r.committed || r.state.status === 'dead') return undefined; state = r.state; }
 return state.status === 'won' ? state : undefined;
}
