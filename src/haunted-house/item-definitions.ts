import { SPIRITS } from './content.ts';
import type { GameSnapshot, RelicEffect, Supply } from './types.ts';

/** Generation copies these values into the run; play and descriptions read the saved copy. */
export const REWARD_DEFINITIONS: Pick<Supply, 'definitionId' | 'name' | 'kind' | 'amount' | 'effect'>[] = [
 { definitionId: 'grave-salt-seal', name: 'Grave-salt seal', kind: 'relic', amount: 1, effect: { kind: 'damage', mode: 'strike', targets: ['shade', 'revenant'], amount: 2 } },
 { definitionId: 'prism-lantern', name: 'Prism lantern', kind: 'relic', amount: 1, effect: { kind: 'damage', mode: 'flare', targets: ['wisp', 'armour'], amount: 2 } },
 { definitionId: 'mourning-ribbon', name: 'Mourning ribbon', kind: 'relic', amount: 1, effect: { kind: 'guard', amount: 1 } },
 { definitionId: 'ember-flask', name: 'Ember flask', kind: 'relic', amount: 1, effect: { kind: 'recovery', health: 4, light: 4 } },
];
export function describeRelicEffect(effect: RelicEffect): string {
 if (effect.kind === 'damage') return `+${effect.amount} ${effect.mode === 'strike' ? 'Strike' : 'Flare'} damage against ${effect.targets.map(k => SPIRITS[k].name).join(' and ')} for this run. Added before armour; stacks with Oil and traits.`;
 if (effect.kind === 'guard') return `Reduce each Strike's incoming damage by ${effect.amount}, after Ward halves and rounds up; minimum 0. Lasts for this run. Flares still receive no retaliation.`;
 return `Restore ${effect.health} health and ${effect.light} light once, each capped at its maximum. Excess is wasted. Consumed on its tile in one turn.`;
}
export function activeRelics(s: GameSnapshot): Supply[] { return s.supplies.filter(x => x.kind === 'relic' && x.used && x.effect && x.effect.kind !== 'recovery'); }
export function activeModifierDescriptions(s: GameSnapshot): string[] { return activeRelics(s).map(x => `${x.name}: ${describeRelicEffect(x.effect!)}`); }
export function isRecoverySupply(x: Supply): boolean { return x.kind === 'food' || x.kind === 'candle' || (x.kind === 'relic' && x.effect?.kind === 'recovery'); }
export function relicRecoveryPreview(s: GameSnapshot, x: Supply) {
 const e = x.effect;
 const part = (amount: number, current: number, maximum: number) => { const received = Math.min(maximum - current, amount); return { received, wasted: amount - received, total: current + received }; };
 return { health: part(e?.kind === 'recovery' ? e.health : 0, s.resources.health, s.resources.maxHealth), light: part(e?.kind === 'recovery' ? e.light : 0, s.resources.light, s.resources.maxLight) };
}
