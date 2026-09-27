import { act, previewAttack } from './game.ts';
import { encounterChoices } from './diagnostics.ts';
import type { EncounterChoices } from './diagnostics.ts';
import type { Action, GameState } from './types.ts';
import { known } from './world.ts';

export interface EncounterPlan {
 actions: Action[]; healthSpent: number; lightSpent: number; turns: number; levelsGained: number;
 finalHealth: number; finalLight: number; tonicsUsed: number; oilsUsed: number;
}
export interface EncounterEvaluation { affordable: boolean; bestPlan?: EncounterPlan; choices: EncounterChoices }

/** Offline bounded probe, not an impossibility proof. Tries 36 complete-fight plans,
 * each capped at 64 committed actions. It spends only current pocket supplies:
 * no floor pickups, movement, fog grants or unrelated kills. A hidden target is
 * unaffordable here; reference probes must explicitly reveal it in a shadow state.
 * Costs are gross incoming damage/light spent, before tonic or level-up refunds.
 * Best means lowest health + 2*light + 6*tonics + 4*oils cost, then fewer turns. */
export function evaluateEncounter(initial: GameState, enemyId: string): EncounterEvaluation {
 const enemy = initial.hauntings.find(h => h.id === enemyId);
 if (!enemy) throw new Error(`Unknown encounter: ${enemyId}`);
 const choices = encounterChoices(initial, enemy);
 if (initial.status !== 'active' || enemy.hp <= 0 || !known(initial, enemy.position)) return { affordable: false, choices };
 const plans: EncounterPlan[] = [];
 const preparations: Action[][] = [[], [{ type: 'ward' }], [{ type: 'oil' }], [{ type: 'oil' }, { type: 'ward' }]];
 for (const prep of preparations) for (const tactic of ['strike', 'flare-first', 'flare-finish'] as const) for (const tonic of ['none', 'before', 'needed'] as const) {
  let state = initial;
  const plan: EncounterPlan = { actions: [], healthSpent: 0, lightSpent: 0, turns: 0, levelsGained: 0,
   finalHealth: initial.resources.health, finalLight: initial.resources.light, tonicsUsed: 0, oilsUsed: 0 };
  const commit = (action: Action): boolean => {
   if (plan.actions.length >= 64) return false;
   const target = state.hauntings.find(h => h.id === enemyId)!;
   const preview = action.type === 'attack' ? previewAttack(state, target, action.mode) : undefined;
   const result = act(state, action, false);
   if (!result.committed || result.state.status === 'dead') return false;
   plan.actions.push(action);
   plan.healthSpent += preview?.incoming ?? 0;
   plan.lightSpent += preview?.lightCost ?? (action.type === 'ward' ? state.resources.light - result.state.resources.light : 0);
   if (action.type === 'tonic') plan.tonicsUsed++;
   if (action.type === 'oil') plan.oilsUsed++;
   state = result.state; return true;
  };
  if (tonic === 'before' && state.resources.tonics && state.resources.health < state.resources.maxHealth && !commit({ type: 'tonic' })) continue;
  let prepared = true;
  for (const action of prep) {
   // Existing preparations already supply this effect; do not spend or reject them again.
   if ((action.type === 'ward' && state.resources.ward) || (action.type === 'oil' && state.resources.empowered)) continue;
   if (!commit(action)) { prepared = false; break; }
  }
  if (!prepared) continue;
  while (plan.actions.length < 64) {
   const h = state.hauntings.find(h => h.id === enemyId)!;
   if (h.hp <= 0) break;
   const strike = previewAttack(state, h, 'strike'), flare = previewAttack(state, h, 'flare');
   // Emergency healing explores a melee-preserving alternative to spending the last light.
   if (tonic === 'needed' && strike.lethal && state.resources.tonics && state.resources.health < state.resources.maxHealth) {
    if (!commit({ type: 'tonic' })) break;
    continue;
   }
   const useFlare = flare.affordable && (tactic === 'flare-first' || (tactic === 'flare-finish' && flare.kills) || strike.lethal);
   if (!useFlare && strike.lethal) break;
   if (!commit({ type: 'attack', hauntingId: enemyId, mode: useFlare ? 'flare' : 'strike' })) break;
  }
  if (state.hauntings.find(h => h.id === enemyId)!.hp > 0) continue;
  plan.turns = plan.actions.length; plan.levelsGained = state.resources.level - initial.resources.level;
  plan.finalHealth = state.resources.health; plan.finalLight = state.resources.light; plans.push(plan);
 }
 const cost = (p: EncounterPlan) => p.healthSpent + 2 * p.lightSpent + 6 * p.tonicsUsed + 4 * p.oilsUsed;
 plans.sort((a, b) => cost(a) - cost(b) || a.turns - b.turns || b.finalHealth - a.finalHealth || b.finalLight - a.finalLight);
 return { affordable: plans.length > 0, ...(plans[0] ? { bestPlan: plans[0] } : {}), choices };
}
