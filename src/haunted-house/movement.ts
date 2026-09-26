import { DIRECTIONS } from './content.ts';
import type { Action, Direction, GameSnapshot, Position } from './types.ts';
import { adjacent, known, positionKey, samePosition, tileAt, traversable } from './world.ts';

/** Plan only through discovered space in this room. Execution may stop early on discovery. */
export function planRoute(state: GameSnapshot, target: Position, adjacentToTarget = false): Action[] | null {
  if (state.status !== 'active' || target.roomId !== state.player.roomId || !known(state, target)) return null;
  const room = state.rooms.find(r => r.id === target.roomId)!;
  if (!adjacentToTarget && samePosition(state.player, target)) {
    const tile = tileAt(room, target.x, target.y);
    const c = state.connections.find(c => c.id === tile?.connectionId);
    return c?.opened ? [{ type: 'travel', connectionId: c.id }] : [];
  }
  const goal = (p: Position) => adjacentToTarget ? adjacent(p, target) && !samePosition(p, target) : samePosition(p, target);
  const queue = [state.player];
  const parents = new Map<string, { from: Position; direction: Direction }>();
  const reached = new Set([positionKey(state.player)]);
  let end: Position | undefined;
  for (let i = 0; i < queue.length; i++) {
    const here = queue[i];
    if (goal(here)) { end = here; break; }
    for (const [direction, d] of Object.entries(DIRECTIONS) as [Direction, { x: number; y: number }][]) {
      const next = { roomId: here.roomId, x: here.x + d.x, y: here.y + d.y };
      if (reached.has(positionKey(next)) || !traversable(state, next, true)) continue;
      const portal = tileAt(room, next.x, next.y)?.connectionId;
      // Stepping onto a portal changes rooms; it cannot be an intermediate local shortcut.
      if (portal && (adjacentToTarget || !samePosition(next, target))) continue;
      reached.add(positionKey(next)); parents.set(positionKey(next), { from: here, direction }); queue.push(next);
    }
  }
  if (!end) return null;
  const actions: Action[] = [];
  let cursor: Position = end;
  while (!samePosition(cursor, state.player)) {
    const parent: { from: Position; direction: Direction } = parents.get(positionKey(cursor))!;
    actions.push({ type: 'move', direction: parent.direction }); cursor = parent.from;
  }
  return actions.reverse();
}
