import { ITEMS, TUNING, xpNeeded } from './content.ts';
import type { Action, ActionResult, CombatPreview, GameSnapshot, GameState, Haunting, Supply, UndoFrame } from './types.ts';
import { known, refreshExploration, samePosition, traversable } from './world.ts';
export function capture(s: GameSnapshot): UndoFrame {
 return { player: { ...s.player }, resources: { ...s.resources }, turns: s.turns, discovered: s.rooms.map(r => [...r.discovered]), visited: s.rooms.map(r => r.visited), hp: s.hauntings.map(h => h.hp), used: s.supplies.map(x => x.used), opened: s.connections.map(c => c.opened), inventory: [...s.inventory], completed: s.objective.completed, status: s.status, journal: [...s.journal], log: [...s.log] };
}
export function restore(s: GameState, f: UndoFrame): void {
 s.player = { ...f.player }; s.resources = { ...f.resources }; s.turns = f.turns;
 s.rooms.forEach((r, i) => { r.discovered = [...f.discovered[i]]; r.visited = f.visited[i]; });
 s.hauntings.forEach((h, i) => { h.hp = f.hp[i]; }); s.supplies.forEach((x, i) => { x.used = f.used[i]; }); s.connections.forEach((c, i) => { c.opened = f.opened[i]; });
 s.inventory = [...f.inventory]; s.objective.completed = f.completed; s.status = f.status; s.journal = [...f.journal]; s.log = [...f.log];
}
export function cloneGame(s: GameState): GameState {
 // Geometry and coordinates are immutable after generation. Copy only mutable state.
 return { ...s, player: { ...s.player }, resources: { ...s.resources }, rooms: s.rooms.map(r => ({ ...r, discovered: [...r.discovered] })), hauntings: s.hauntings.map(h => ({ ...h })), supplies: s.supplies.map(x => ({ ...x })), connections: s.connections.map(c => ({ ...c })), objective: { ...s.objective }, inventory: [...s.inventory], journal: [...s.journal], log: [...s.log], undo: [...s.undo] };
}
export function previewAttack(s: GameSnapshot, h: Haunting, mode: 'strike' | 'flare'): CombatPreview {
 const r = s.resources; const lightCost = mode === 'flare' ? TUNING.flareCost : 0;
 const damage = Math.max(1, r.power + (r.empowered ? TUNING.oilBonus : 0) + (mode === 'flare' ? 4 : h.kind === 'armour' ? -2 : 0));
 const incoming = mode === 'flare' ? 0 : r.ward ? Math.ceil(h.attack / 2) : h.attack;
 return { damage, incoming, healthAfter: Math.max(0, r.health - incoming), enemyAfter: Math.max(0, h.hp - damage), lightCost, lethal: r.health <= incoming, kills: damage >= h.hp, affordable: r.light >= lightCost };
}
export function supplyPreview(s: GameSnapshot, supply: Supply): { received: number; wasted: number; total: number } {
 const r = s.resources; const amount = supply.kind === 'food' ? Math.ceil(r.maxHealth * .6) : supply.amount;
 const current = supply.kind === 'food' ? r.health : r.light; const cap = supply.kind === 'food' ? r.maxHealth : r.maxLight;
 const received = Math.min(cap - current, amount); return { received, wasted: amount - received, total: current + received };
}
export function objectiveReady(s: GameSnapshot): boolean { return s.objective.kind === 'keepsake' ? s.objective.completed : s.inventory.includes(s.objective.kind === 'diary' ? 'diary' : 'exit-key'); }
/** One authority for interactive play, generation witnesses and save replay. */
export function act(original: GameState, action: Action, record = true): ActionResult {
 const reject = (message: string, lethal = false): ActionResult => ({ state: original, committed: false, message, lethal });
 if (action.type === 'undo') {
  if (!original.undo.length) return reject('No earlier turn to restore.');
  const s = cloneGame(original); restore(s, s.undo.pop()!); return { state: s, committed: true, message: 'Previous turn restored, including discovery and regeneration.' };
 }
 if (original.status !== 'active') return reject('This run has ended. Undo, restart this house, or start a new one.');
 const s = cloneGame(original); const r = s.resources; let message = ''; let attacked = '';
 if (action.type === 'move') {
  if (!traversable(s, action.to) || samePosition(s.player, action.to)) return reject('Choose a different discovered empty tile. Distance and intervening obstacles do not matter.');
  s.player = { ...action.to }; message = 'Moved. One turn.';
 } else if (action.type === 'travel') {
  const c = s.connections.find(c => c.id === action.connectionId);
  if (!c || !c.opened || !known(s, action.from) || (!samePosition(c.a, action.from) && !samePosition(c.b, action.from))) return reject('Discover and open this passage first.');
  const destination = samePosition(c.a, action.from) ? c.b : c.a;
  if (!traversable(s, destination, false)) return reject('That landing is occupied.');
  s.player = { ...destination }; message = `Entered ${s.rooms.find(room => room.id === destination.roomId)!.name}.`;
 } else if (action.type === 'unlock') {
  const c = s.connections.find(c => c.id === action.connectionId);
  if (!c || c.opened || (!known(s, c.a) && !known(s, c.b))) return reject('No discovered locked passage here.');
  if (c.gate && !s.inventory.includes(c.gate)) return reject(`Requires ${ITEMS[c.gate].name}.`);
  c.opened = true; message = 'Passage unlocked. The tool stays in your pockets. Travel through when ready.';
 } else if (action.type === 'attack') {
  const h = s.hauntings.find(h => h.id === action.hauntingId);
  if (!h || h.hp <= 0 || !known(s, h.position)) return reject('Choose a discovered living spirit.');
  const p = previewAttack(s, h, action.mode);
  if (!p.affordable) return reject(`A flare requires ${p.lightCost} light.`);
  if (p.lethal && !action.acceptDeath) return reject(`This will kill you: ${r.health} health, ${p.incoming} incoming damage.`, true);
  h.hp = p.enemyAfter; r.health = p.healthAfter; r.light -= p.lightCost; r.empowered = false;
  if (action.mode === 'strike') r.ward = false;
  attacked = h.id; message = `${h.name}: dealt ${p.damage}, received ${p.incoming}.`;
  if (!r.health) { s.status = 'dead'; message += ' You died before experience or healing could help.'; }
  else if (!h.hp) {
   s.player = { ...h.position }; r.xp += h.xp; message += ` Banished. +${h.xp} experience.`;
   if (h.reward && !s.inventory.includes(h.reward)) { s.inventory.push(h.reward); message += ` Found ${ITEMS[h.reward].name}.`; }
   while (r.xp >= xpNeeded(r.level)) { r.xp -= xpNeeded(r.level); r.level++; r.maxHealth += 3; r.power += 2; r.health = r.maxHealth; r.light = r.maxLight; message += ` Level ${r.level}: +2 power, +3 maximum health; health and light restored.`; }
  }
 } else if (action.type === 'use') {
  const x = s.supplies.find(x => x.id === action.supplyId);
  if (!x || x.used || !known(s, x.position)) return reject('Choose a discovered unused supply.');
  x.used = true; s.player = { ...x.position };
  if (x.kind === 'food' || x.kind === 'candle') {
   const p = supplyPreview(original, x); if (x.kind === 'food') r.health = p.total; else r.light = p.total;
   message = `${x.name}: restored ${p.received} ${x.kind === 'food' ? 'health' : 'light'}; ${p.wasted} wasted. Tile cleared.`;
  } else {
   if (x.kind === 'tonic') r.tonics += x.amount;
   if (x.kind === 'oil') r.oils += x.amount;
   if (x.kind === 'power') r.power += x.amount;
   if (x.kind === 'treasure') r.treasure += x.amount;
   if (x.item && !s.inventory.includes(x.item)) s.inventory.push(x.item);
   if (x.text) s.journal.push(x.text);
   message = `${x.name}: ${x.item ? ITEMS[x.item].name + ' collected.' : x.kind === 'power' ? '+' + x.amount + ' permanent power.' : x.kind === 'note' ? x.text : 'collected.'}`;
  }
 } else if (action.type === 'tonic') {
  if (!r.tonics) return reject('No tonic in your pockets.'); if (r.health === r.maxHealth) return reject('Already at full health.');
  const heal = Math.min(r.maxHealth - r.health, Math.ceil(r.maxHealth / 2)); r.tonics--; r.health += heal; message = `Tonic restored ${heal} health. Wounded spirits recover this turn.`;
 } else if (action.type === 'oil') {
  if (!r.oils || r.empowered) return reject('You need an oil bottle and no oil already prepared.');
  r.oils--; r.empowered = true; message = 'Oil prepared: +4 damage on your next strike or flare. Wounded spirits recover this turn.';
 } else if (action.type === 'ward') {
  if (r.ward || r.light < TUNING.wardCost) return reject('Ward needs 3 light and no existing ward.');
  r.light -= TUNING.wardCost; r.ward = true; message = 'Ward prepared: halve the next strike’s incoming damage, rounded up. Wounded spirits recover this turn.';
 } else if (action.type === 'settle') {
  if (s.objective.kind !== 'keepsake' || s.objective.completed || !s.objective.altar || !known(s, s.objective.altar) || !s.inventory.includes('keepsake')) return reject('Bring the silver locket to the discovered memorial.');
  s.objective.completed = true; message = 'The locket rests at the memorial. Return to the entrance.';
 } else if (action.type === 'leave') {
  if (!samePosition(s.player, s.entrance)) return reject('Return to the entrance first.');
  if (!objectiveReady(s)) return reject(s.objective.description);
  s.status = 'won'; message = 'You step out into the morning. The house falls silent.';
 }
 s.turns++;
 let recovered = 0;
 for (const h of s.hauntings) if (h.id !== attacked && h.hp > 0 && h.hp < h.maxHp) { const amount = Math.min(h.regen, h.maxHp - h.hp); h.hp += amount; if (known(s, h.position)) recovered += amount; }
 if (recovered) message += ` Other wounded spirits recovered ${recovered} health in total.`;
 refreshExploration(s); s.log = [message, ...s.log].slice(0, TUNING.maxLogEntries);
 if (record) s.undo.push(capture(original)); else s.undo = [];
 return { state: s, committed: true, message };
}
