import { TUNING } from './content.ts';
import { previewAttack } from './game.ts';
import type { Action, CombatPreview, GameSnapshot, Haunting } from './types.ts';
import { known } from './world.ts';

/** Ephemeral input state: never serialized or included in undo frames. */
export interface InteractionState { selectedEnemyId?: string; flareQueued: boolean }
export interface InteractionResult { ui: InteractionState; action?: Action; reason?: string }
export const emptyInteraction = (): InteractionState => ({ flareQueued: false });
export const attackMode = (ui: InteractionState): 'strike' | 'flare' => ui.flareQueued ? 'flare' : 'strike';

export function selectedEnemy(game: GameSnapshot, ui: InteractionState, viewedRoomId?: string): Haunting | undefined {
 if (game.status !== 'active') return undefined;
 return game.hauntings.find(h => h.id === ui.selectedEnemyId && h.hp > 0 && known(game, h.position)
  && (!viewedRoomId || h.position.roomId === viewedRoomId));
}

export function toggleFlare(game: GameSnapshot, ui: InteractionState): InteractionResult {
 if (ui.flareQueued) return { ui: { ...ui, flareQueued: false } };
 if (game.status !== 'active') return { ui, reason: 'This adventure has ended.' };
 if (game.resources.light < TUNING.flareCost) return { ui, reason: `Flare needs ${TUNING.flareCost} light; you have ${game.resources.light}.` };
 return { ui: { ...ui, flareQueued: true } };
}

/** Sequential activations: selecting is free; activating the selected spirit commits once. */
export function tapEnemy(game: GameSnapshot, ui: InteractionState, id: string, viewedRoomId?: string): InteractionResult {
 const target = selectedEnemy(game, { selectedEnemyId: id, flareQueued: ui.flareQueued }, viewedRoomId);
 if (!target) return { ui: selectedEnemy(game, ui, viewedRoomId) ? ui : { flareQueued: ui.flareQueued && game.status === 'active' }, reason: 'Choose a discovered living spirit in this room.' };
 if (ui.selectedEnemyId !== id) return { ui: { ...ui, selectedEnemyId: id } };
 const mode = attackMode(ui), preview = previewAttack(game, target, mode);
 if (!preview.affordable) return { ui, reason: `Flare needs ${preview.lightCost} light; you have ${game.resources.light}.` };
 // The rules engine remains responsible for explicit lethal confirmation.
 return { ui, action: { type: 'attack', hauntingId: id, mode } };
}

/** Call only with the returned game state. Rejections and cancelled confirmation change nothing. */
export function afterAction(game: GameSnapshot, ui: InteractionState, action: Action, committed: boolean, viewedRoomId?: string): InteractionState {
 if (!committed) return ui;
 if (game.status !== 'active' || action.type === 'move' || action.type === 'travel' || action.type === 'undo') return emptyInteraction();
 const target = selectedEnemy(game, ui, viewedRoomId);
 return target ? { selectedEnemyId: target.id, flareQueued: false } : emptyInteraction();
}

/** Bar geometry only. All projected resource values come from the rules engine. */
export interface ResourceBar {
 current: number; maximum: number; projected: number; loss: number;
 currentPercent: number; remainingPercent: number; lossPercent: number;
}
export function resourceBar(current: number, maximum: number, projected = current): ResourceBar {
 const cap = Math.max(0, maximum), value = Math.max(0, Math.min(current, cap));
 const remaining = Math.max(0, Math.min(projected, value)), loss = value - remaining;
 return { current: value, maximum: cap, projected: remaining, loss,
  currentPercent: cap ? value / cap * 100 : 0, remainingPercent: cap ? remaining / cap * 100 : 0, lossPercent: cap ? loss / cap * 100 : 0 };
}
export interface CombatBars {
 playerHealth: ResourceBar; playerLight: ResourceBar; enemyHealth?: ResourceBar; preview?: CombatPreview; flareDamage: number;
}
function neutralTarget(game: GameSnapshot): Haunting {
 return { id: 'ui-preview', name: '', kind: 'shade', position: game.player,
  tier: 0, hp: 1, maxHp: 1, attack: 0, regen: 0, xp: 0, boss: false };
}
export function currentFlareDamage(game: GameSnapshot, enemy?: Haunting): number {
 // An ordinary neutral target asks the same engine for untargeted ability damage.
 return previewAttack(game, enemy ?? neutralTarget(game), 'flare').damage;
}
export function combatBars(game: GameSnapshot, ui: InteractionState, viewedRoomId?: string): CombatBars {
 const enemy = selectedEnemy(game, ui, viewedRoomId), preview = enemy ? previewAttack(game, enemy, attackMode(ui)) : undefined;
 const lightAfter = preview?.lightAfter ?? (ui.flareQueued ? previewAttack(game, neutralTarget(game), 'flare').lightAfter : undefined);
 return {
  // Immediate exchange must remain visible even when a surviving kill refills resources.
  playerHealth: resourceBar(game.resources.health, game.resources.maxHealth, preview?.healthAfter),
  playerLight: resourceBar(game.resources.light, game.resources.maxLight, lightAfter),
  enemyHealth: enemy ? resourceBar(enemy.hp, enemy.maxHp, preview!.enemyAfter) : undefined,
  preview, flareDamage: currentFlareDamage(game, enemy),
 };
}
