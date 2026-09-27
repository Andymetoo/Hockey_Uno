import { ITEMS, TUNING, xpNeeded } from './content.ts';
import { activeRelics, describeRelicEffect, relicRecoveryPreview } from './item-definitions.ts';
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
function awardExperience(r: GameSnapshot['resources'], xp: number): number {
 const before = r.level; r.xp += xp;
 while (r.xp >= xpNeeded(r.level)) {
  r.xp -= xpNeeded(r.level); r.level++; r.maxHealth += TUNING.levelHealth; r.power += TUNING.levelPower;
  r.health = r.maxHealth; r.light = r.maxLight;
 }
 return r.level - before;
}
/** Restore the saved first turn, preserving this exact house and its content snapshots. */
export function restartState(s: GameState): GameState {
 const fresh = cloneGame(s); if (fresh.undo.length) restore(fresh, fresh.undo[0]); fresh.undo = []; return fresh;
}
export function previewAttack(s: GameSnapshot, h: Haunting, mode: 'strike' | 'flare'): CombatPreview {
 const r = s.resources, lightCost = mode === 'flare' ? TUNING.flareCost : 0;
 const powerDamage = r.power, oilDamage = r.empowered ? TUNING.oilBonus : 0;
 // Classic is an explicit benchmark ruleset. Version-3 saves are archived, never implicitly upgraded.
 const flareBonus = mode === 'flare' ? s.ruleset === 'classic' ? TUNING.classicFlareBonus : TUNING.flareBonus : 0;
 const armourReduction = mode === 'strike' && h.kind === 'armour' ? TUNING.armourReduction : 0;
 const traitDamage = mode === 'strike' && h.trait === 'brittle' ? TUNING.brittleBonus : mode === 'flare' && h.trait === 'smouldering' ? TUNING.smoulderingBonus : 0;
 const relics = activeRelics(s);
 const itemDamage = relics.reduce((n, x) => n + (x.effect?.kind === 'damage' && x.effect.mode === mode && x.effect.targets.includes(h.kind) ? x.effect.amount : 0), 0);
 const damage = Math.max(1, powerDamage + oilDamage + flareBonus + traitDamage + itemDamage - armourReduction);
 const unwardedIncoming = mode === 'flare' ? 0 : h.attack;
 const wardedIncoming = mode === 'strike' && r.ward ? Math.ceil(unwardedIncoming / TUNING.wardDivisor) : unwardedIncoming;
 const incomingReduction = mode === 'strike' ? Math.min(wardedIncoming, relics.reduce((n, x) => n + (x.effect?.kind === 'guard' ? x.effect.amount : 0), 0)) : 0;
 const incoming = wardedIncoming - incomingReduction;
 const healthAfter = Math.max(0, r.health - incoming), lightAfter = r.light - lightCost;
 const kills = damage >= h.hp, lethal = r.health <= incoming, affordable = r.light >= lightCost;
 const projected = { ...r, health: healthAfter, light: lightAfter };
 const levelsGained = kills && !lethal && affordable ? awardExperience(projected, h.xp) : 0;
 return { damage, incoming, healthAfter, enemyAfter: Math.max(0, h.hp - damage), lightCost, lightAfter, lethal, kills, affordable,
  powerDamage, oilDamage, flareBonus, armourReduction, traitDamage, unwardedIncoming, itemDamage, incomingReduction, levelsGained,
  finalHealth: projected.health, finalLight: projected.light, finalMaxHealth: projected.maxHealth, finalPower: projected.power };
}
export function supplyPreview(s: GameSnapshot, supply: Supply): { received: number; wasted: number; total: number } {
 const r = s.resources; const amount = supply.kind === 'food' ? Math.ceil(r.maxHealth * TUNING.foodFraction) : supply.amount;
 const current = supply.kind === 'food' ? r.health : r.light; const cap = supply.kind === 'food' ? r.maxHealth : r.maxLight;
 const received = Math.min(cap - current, amount); return { received, wasted: amount - received, total: current + received };
}
export interface ExitReadiness {
 prerequisitesMet: boolean; atExit: boolean; canLeave: boolean;
 actionLabel: string; missingRequirement: string | null;
}
/** The objective and entrance are the only finish requirements. Optional content never blocks leaving. */
export function exitReadiness(s: GameSnapshot): ExitReadiness {
 const prerequisitesMet = s.objective.kind === 'keepsake' ? s.objective.completed : s.inventory.includes(s.objective.kind === 'diary' ? 'diary' : 'exit-key');
 const atExit = samePosition(s.player, s.entrance);
 const active = s.status === 'active';
 const missingRequirement = !active ? 'This run has ended. Undo, restart this house, or start a new one.'
  : !prerequisitesMet ? s.objective.kind === 'escape' ? 'Recover the front-door key from the keeper.'
   : s.objective.kind === 'diary' ? 'Recover the missing diary from the keeper.'
   : s.inventory.includes('keepsake') ? 'Place the silver locket at the memorial.' : 'Recover the silver locket and place it at the memorial.'
  : !atExit ? 'Return to the entrance first.' : null;
 return { prerequisitesMet, atExit, canLeave: active && prerequisitesMet && atExit,
  actionLabel: s.objective.kind === 'diary' ? 'Leave with diary' : s.objective.kind === 'escape' ? 'Leave with key' : 'Leave the quieted house', missingRequirement };
}
export function objectiveReady(s: GameSnapshot): boolean { return exitReadiness(s).prerequisitesMet; }
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
   s.player = { ...h.position }; message += ` Banished. +${h.xp} experience.`;
   if (h.reward && !s.inventory.includes(h.reward)) { s.inventory.push(h.reward); message += ` Found ${ITEMS[h.reward].name}.`; }
   const levels = awardExperience(r, h.xp);
   if (levels) message += ` Level ${r.level}: +${TUNING.levelPower * levels} power, +${TUNING.levelHealth * levels} maximum health; health and light restored.`;
  }
 } else if (action.type === 'use') {
  const x = s.supplies.find(x => x.id === action.supplyId);
  if (!x || x.used || !known(s, x.position)) return reject('Choose a discovered unused supply.');
  x.used = true; s.player = { ...x.position };
  if (x.kind === 'relic' && x.effect) {
   message = `${x.name}: ${describeRelicEffect(x.effect)}`;
   if (x.effect.kind === 'recovery') {
    const p = relicRecoveryPreview(original, x); r.health = p.health.total; r.light = p.light.total;
    message = `${x.name}: restored ${p.health.received} health and ${p.light.received} light; wasted ${p.health.wasted} health and ${p.light.wasted} light. Tile cleared.`;
   }
  } else if (x.kind === 'food' || x.kind === 'candle') {
   const p = supplyPreview(original, x); if (x.kind === 'food') r.health = p.total; else r.light = p.total;
   message = `${x.name}: restored ${p.received} ${x.kind === 'food' ? 'health' : 'light'}; ${p.wasted} wasted. Tile cleared.`;
  } else {
   if (x.kind === 'tonic') r.tonics += x.amount;
   if (x.kind === 'oil') r.oils += x.amount;
   if (x.kind === 'power') r.power += x.amount;
   if (x.kind === 'vitality') { r.maxHealth += x.amount; r.health += x.amount; }
   if (x.kind === 'treasure') r.treasure += x.amount;
   if (x.item && !s.inventory.includes(x.item)) s.inventory.push(x.item);
   if (x.text) s.journal.push(x.text);
   message = `${x.name}: ${x.item ? ITEMS[x.item].name + ' collected.' : x.kind === 'power' ? '+' + x.amount + ' permanent power.' : x.kind === 'vitality' ? '+' + x.amount + ' maximum and current health.' : x.kind === 'note' ? 'Informational note only; no stat or quest reward. ' + (x.text ?? '') + ' Tile cleared.' : x.amount + ' collected.'}`;
  }
 } else if (action.type === 'tonic') {
  if (!r.tonics) return reject('No tonic in your pockets.'); if (r.health === r.maxHealth) return reject('Already at full health.');
  const heal = Math.min(r.maxHealth - r.health, Math.ceil(r.maxHealth * TUNING.tonicFraction)); r.tonics--; r.health += heal; message = `Tonic restored ${heal} health. Wounded spirits recover this turn.`;
 } else if (action.type === 'oil') {
  if (!r.oils || r.empowered) return reject('You need an oil bottle and no oil already prepared.');
  r.oils--; r.empowered = true; message = `Oil prepared: +${TUNING.oilBonus} damage on your next strike or flare. Wounded spirits recover this turn.`;
 } else if (action.type === 'ward') {
  if (r.ward || r.light < TUNING.wardCost) return reject(`Ward needs ${TUNING.wardCost} light and no existing ward.`);
  r.light -= TUNING.wardCost; r.ward = true; message = 'Ward prepared: halve the next strike’s incoming damage, rounded up. Wounded spirits recover this turn.';
 } else if (action.type === 'settle') {
  if (s.objective.kind !== 'keepsake' || s.objective.completed || !s.objective.altar || !known(s, s.objective.altar) || !s.inventory.includes('keepsake')) return reject('Bring the silver locket to the discovered memorial.');
  s.objective.completed = true; message = 'The locket rests at the memorial. Return to the entrance.';
 } else if (action.type === 'leave') {
  const readiness = exitReadiness(s);
  if (!readiness.canLeave) return reject(readiness.missingRequirement!);
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
