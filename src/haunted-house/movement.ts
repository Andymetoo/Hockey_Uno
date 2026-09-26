import type { Action, GameSnapshot, Position } from './types.ts';
import { samePosition, traversable } from './world.ts';
/** Destination eligibility only. Deliberately never searches or simulates a route. */
export function planRoute(state: GameSnapshot, target: Position): Action[] | null {
 if (state.status !== 'active' || !traversable(state, target)) return null;
 return samePosition(state.player, target) ? [] : [{ type: 'move', to: { ...target } }];
}
