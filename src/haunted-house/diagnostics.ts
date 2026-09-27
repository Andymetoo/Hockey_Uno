import { TUNING, xpNeeded } from './content.ts';
import { act, cloneGame, previewAttack } from './game.ts';
import type { Action, GameSnapshot, GameState, Haunting } from './types.ts';
import { known } from './world.ts';

export interface EncounterChoices {
 strikeHits: number; strikeHealthCost: number; strikeSurvives: boolean;
 flareHits: number; flareLightCost: number; flareAffordable: boolean;
 wardSaved: number; wardChangesSurvival: boolean;
 oilStrikeHitsSaved: number; oilFlareHitsSaved: number;
 killLevels: boolean; twoFlareRefill: boolean;
}
/** Arithmetic for uninterrupted attacks; previews remain the damage authority. Preparations
 * on wounded enemies are evaluated after their regeneration, just as an actual turn does. */
export function encounterChoices(s: GameSnapshot, h: Haunting): EncounterChoices {
 const strike = previewAttack(s, h, 'strike'), flare = previewAttack(s, h, 'flare');
 const unprepared = { ...s, resources: { ...s.resources, empowered: false, ward: false } };
 const restStrike = previewAttack(unprepared, h, 'strike'), restFlare = previewAttack(unprepared, h, 'flare');
 const hits = (hp: number, first: number, rest: number) => 1 + Math.ceil(Math.max(0, hp - first) / rest);
 const strikeHits = hits(h.hp, strike.damage, restStrike.damage), flareHits = hits(h.hp, flare.damage, restFlare.damage);
 const strikeHealthCost = strike.incoming + (strikeHits - 1) * restStrike.incoming;
 const flareLightCost = flareHits * flare.lightCost;
 const afterPreparation = { ...h, hp: Math.min(h.maxHp, h.hp + h.regen) };
 const wardState = { ...s, resources: { ...s.resources, ward: true } };
 const wardHits = hits(afterPreparation.hp, strike.damage, restStrike.damage);
 const wardCost = previewAttack(wardState, afterPreparation, 'strike').incoming + (wardHits - 1) * restStrike.incoming;
 const canWard = !s.resources.ward && s.resources.light >= TUNING.wardCost;
 const oilState = { ...s, resources: { ...s.resources, empowered: true } };
 const canOil = !s.resources.empowered && s.resources.oils > 0;
 const oilStrike = hits(afterPreparation.hp, previewAttack(oilState, afterPreparation, 'strike').damage, restStrike.damage);
 const oilFlare = hits(afterPreparation.hp, previewAttack(oilState, afterPreparation, 'flare').damage, restFlare.damage);
 const killLevels = s.resources.xp + h.xp >= xpNeeded(s.resources.level);
 return { strikeHits, strikeHealthCost, strikeSurvives: strikeHealthCost < s.resources.health,
  flareHits, flareLightCost, flareAffordable: flareLightCost <= s.resources.light,
  wardSaved: canWard ? strikeHealthCost - wardCost : 0,
  wardChangesSurvival: canWard && strikeHealthCost >= s.resources.health && wardCost < s.resources.health,
  oilStrikeHitsSaved: canOil ? strikeHits - oilStrike : 0, oilFlareHitsSaved: canOil ? flareHits - oilFlare : 0,
  killLevels, twoFlareRefill: killLevels && flareHits <= 2 && flareLightCost <= s.resources.light };
}

/** A small tie-breaker for bounded search: reward states with more than one affordable
 * next encounter, and resources which cross an actual hit/survival threshold. No quotas. */
export function choiceValue(s: GameSnapshot): number {
 let value = 0;
 for (const h of s.hauntings) if (h.hp > 0 && known(s, h.position)) {
  const c = encounterChoices(s, h);
  value += (c.strikeSurvives ? 1 : 0) + (c.flareAffordable ? 1 : 0)
   + (c.wardChangesSurvival ? 1 : 0) + (Math.max(c.oilStrikeHitsSaved, c.oilFlareHitsSaved) > 0 ? .5 : 0);
 }
 return Math.min(value, 12);
}

export interface WitnessMetrics {
 turns: number; strikes: number; flares: number; wards: number; oils: number; kills: number;
 levelUps: number; lightRefunded: number; healthRefunded: number; refillKills: number;
 pureFlareKills: number; twoFlareRefillKills: number; consecutiveTwoFlareRefills: number;
 consecutiveRefillKills: number; unusedFood: number; unusedCandles: number; pocketTonics: number; pocketOils: number;
 finalHealth: number; finalLight: number; encounterOrder: string[]; choices: EncounterChoices[];
}
/** Replays the actual legal witness; a diagnostic never grants fog, resources or a free turn. */
export function witnessMetrics(initial: GameState, actions: Action[]): WitnessMetrics {
 let state = cloneGame(initial), previousKillRefilled = false, previousTwoFlareRefill = false;
 const m: WitnessMetrics = { turns: 0, strikes: 0, flares: 0, wards: 0, oils: 0, kills: 0,
  levelUps: 0, lightRefunded: 0, healthRefunded: 0, refillKills: 0, pureFlareKills: 0, twoFlareRefillKills: 0, consecutiveTwoFlareRefills: 0, consecutiveRefillKills: 0,
  unusedFood: 0, unusedCandles: 0, pocketTonics: 0, pocketOils: 0, finalHealth: 0, finalLight: 0,
  encounterOrder: [], choices: [] };
 const sampled = new Set<string>();
 const attacks = new Map<string, { strike: number; flare: number }>();
 for (const action of actions) {
  if (action.type === 'attack' && !sampled.has(action.hauntingId)) {
   sampled.add(action.hauntingId); m.encounterOrder.push(action.hauntingId);
   // All currently inspectable opponents provide plausible alternatives at this progression state.
   for (const h of state.hauntings) if (h.hp > 0 && known(state, h.position)) m.choices.push(encounterChoices(state, h));
  }
  const result = act(state, action, false);
  if (!result.committed || result.state.status === 'dead') throw new Error(`Invalid diagnostic witness: ${JSON.stringify(action)}`);
  if (action.type === 'attack') {
   if (action.mode === 'strike') m.strikes++; else m.flares++;
   const spent = attacks.get(action.hauntingId) ?? { strike: 0, flare: 0 };
   spent[action.mode]++; attacks.set(action.hauntingId, spent);
   const enemy = state.hauntings.find(h => h.id === action.hauntingId)!;
   const after = result.state.hauntings.find(h => h.id === action.hauntingId)!;
   if (!after.hp) {
    m.kills++;
    const levels = result.state.resources.level - state.resources.level;
    if (!spent.strike) m.pureFlareKills++;
    const shortRefill = !spent.strike && spent.flare <= 2 && levels > 0;
    if (shortRefill) { m.twoFlareRefillKills++; if (previousTwoFlareRefill) m.consecutiveTwoFlareRefills++; }
    previousTwoFlareRefill = shortRefill;
    if (levels) {
     const p = previewAttack(state, enemy, action.mode);
     m.levelUps += levels; m.refillKills++;
     m.lightRefunded += result.state.resources.light - (state.resources.light - p.lightCost);
     m.healthRefunded += result.state.resources.health - p.healthAfter;
     if (previousKillRefilled) m.consecutiveRefillKills++;
    }
    previousKillRefilled = levels > 0;
   }
  }
  if (action.type === 'ward') m.wards++;
  if (action.type === 'oil') m.oils++;
  state = result.state;
 }
 m.turns = state.turns; m.unusedFood = state.supplies.filter(s => s.kind === 'food' && !s.used).length;
 m.unusedCandles = state.supplies.filter(s => s.kind === 'candle' && !s.used).length;
 m.pocketTonics = state.resources.tonics; m.pocketOils = state.resources.oils;
 m.finalHealth = state.resources.health; m.finalLight = state.resources.light;
 return m;
}
