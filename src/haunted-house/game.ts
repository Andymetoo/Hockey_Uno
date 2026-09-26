import { DIRECTIONS, ITEMS, TUNING } from './content.ts';
import type { Action, ActionResult, Connection, GameState, Interaction, Position } from './types.ts';
import { adjacent, neighbors, positionKey, random, refreshExploration, samePosition, tileAt, walkable } from './world.ts';
export { illuminated, samePosition, tileAt } from './world.ts';

export function candle(state: GameState): boolean {
  return state.player.roomId === state.spirit.roomId && Math.abs(state.player.x - state.spirit.x) + Math.abs(state.player.y - state.spirit.y) === 1;
}

export function turnsUntilSpirit(state: GameState): number {
  return TUNING.spiritEveryTurns - state.turn % TUNING.spiritEveryTurns;
}

export function objectiveReady(state: GameState): boolean {
  if (state.objective.kind === 'keepsake') return state.objective.completed;
  return state.inventory.includes(state.objective.kind === 'escape' ? 'exit-key' : 'diary');
}

function log(state: GameState, message: string): void {
  state.log.push(message);
  state.log = state.log.slice(-TUNING.maxLogEntries);
}

function localEndpoint(state: GameState, connection: Connection): Position | undefined {
  return connection.a.roomId === state.player.roomId ? connection.a : connection.b.roomId === state.player.roomId ? connection.b : undefined;
}

function oppositeEndpoint(connection: Connection, endpoint: Position): Position {
  return samePosition(connection.a, endpoint) ? connection.b : connection.a;
}

function gateDescription(connection: Connection): string {
  return connection.gate === 'crowbar' ? 'Boarded passage · needs the crowbar' : `Locked passage · needs the ${connection.gate ? ITEMS[connection.gate].name.toLowerCase() : 'key'}`;
}

/** Current contextual actions. Threshold wards provide an honest remote-arrival warning. */
export function interactions(state: GameState): Interaction[] {
  if (state.status !== 'active') return [];
  const result: Interaction[] = [];
  const room = state.rooms.find(candidate => candidate.id === state.player.roomId)!;
  for (const container of room.containers) {
    const position = { roomId: room.id, x: container.x, y: container.y };
    if (!container.opened && adjacent(state.player, position)) result.push({
      id: `search-${container.id}`, label: `Search ${container.label.toLowerCase()}`, detail: 'Search once · 1 turn',
      action: { type: 'search', containerId: container.id }, available: true, position,
    });
  }
  for (const connection of state.connections) {
    const position = localEndpoint(state, connection);
    if (!position || !adjacent(state.player, position)) continue;
    if (!connection.opened && connection.gate) {
      result.push({
        id: `unlock-${connection.id}`, label: connection.gate === 'crowbar' ? 'Pry off the boards' : `Unlock with ${ITEMS[connection.gate].name.toLowerCase()}`,
        detail: `${gateDescription(connection)} · tool is reusable · 1 turn`, action: { type: 'unlock', connectionId: connection.id },
        available: state.inventory.includes(connection.gate), position,
      });
    } else {
      const destination = oppositeEndpoint(connection, position);
      const nextRoom = state.rooms.find(candidate => candidate.id === destination.roomId)!;
      const blocked = samePosition(destination, state.spirit);
      const standing = samePosition(state.player, position);
      result.push({
        id: `travel-${connection.id}`, label: connection.kind === 'stairs' ? `Take stairs ${nextRoom.floor > room.floor ? 'up' : 'down'}` : 'Cross the doorway',
        detail: `${blocked ? 'Threshold disturbed: the arrival tile is occupied. Wait for the spirit to move.' : 'Threshold clear: the arrival tile is safe.'} ${standing ? 'Crossing costs 1 turn.' : 'Stand on the passage tile to cross.'}${nextRoom.visited ? ` Leads to ${nextRoom.name}.` : ''}`,
        action: { type: 'travel', connectionId: connection.id }, available: standing && !blocked, position,
      });
    }
  }
  if (state.objective.kind === 'keepsake' && state.objective.altar && adjacent(state.player, state.objective.altar) && !state.objective.completed) result.push({
    id: 'settle', label: 'Place the silver locket', detail: 'The memorial needs the silver locket · 1 turn', action: { type: 'settle' }, available: state.inventory.includes('keepsake'), position: state.objective.altar,
  });
  if (adjacent(state.player, state.entrance)) result.push({
    id: 'leave', label: 'Leave the house', detail: objectiveReady(state) ? 'Your task is complete. Open the front door · 1 turn' : state.objective.description,
    action: { type: 'leave' }, available: objectiveReady(state), position: state.entrance,
  });
  return result;
}

function moveSpirit(state: GameState): boolean {
  const options = neighbors(state, state.spirit).filter(position => !samePosition(position, state.player));
  state.spiritMoves++;
  state.evidence = [];
  if (options.length === 0) {
    log(state, 'The spirit’s movement beat passes. Supernatural clues have expired.');
    return false;
  }
  let choices = options;
  if (state.spirit.roomId !== state.player.roomId) {
    // A tile-level reverse breadth-first search respects every currently closed gate.
    const distances = new Map<string, number>([[positionKey(state.player), 0]]);
    const queue: Position[] = [state.player];
    for (let index = 0; index < queue.length; index++) {
      const distance = distances.get(positionKey(queue[index]))!;
      for (const next of neighbors(state, queue[index])) {
        if (!distances.has(positionKey(next))) { distances.set(positionKey(next), distance + 1); queue.push(next); }
      }
    }
    const closest = Math.min(...options.map(position => distances.get(positionKey(position)) ?? Infinity));
    if (Number.isFinite(closest)) choices = options.filter(position => distances.get(positionKey(position)) === closest);
  }
  state.spiritPrevious = { ...state.spirit };
  state.spirit = { ...choices[Math.floor(random(state) * choices.length)] };
  log(state, 'The spirit shifts. All previous supernatural clues have expired; your map is unchanged.');
  return true;
}

/** Resolve one intent. Invalid intents return the original state and spend nothing. */
export function act(state: GameState, action: Action): ActionResult {
  const invalid = (message: string): ActionResult => ({ state, committed: false, message, spiritMoved: false });
  if (state.status !== 'active') return invalid('This adventure has ended. Start another house or restart this one.');
  const room = state.rooms.find(candidate => candidate.id === state.player.roomId);
  if (!room) return invalid('The current room is unavailable.');
  let message = '';
  let destination: Position | undefined;
  let matchTarget: Position | undefined;
  let targetConnection: Connection | undefined;
  let targetContainerId: string | undefined;

  switch (action.type) {
    case 'move': {
      const delta = DIRECTIONS[action.direction];
      if (!delta) return invalid('Choose a cardinal direction.');
      destination = { roomId: room.id, x: state.player.x + delta.x, y: state.player.y + delta.y };
      if (!walkable(tileAt(room, destination.x, destination.y))) return invalid('That way is blocked.');
      message = `You step ${delta.label.toLowerCase()}.`;
      break;
    }
    case 'wait': message = 'You wait and watch the candle.'; break;
    case 'match': {
      if (state.matches <= 0) return invalid('You have no matches remaining.');
      const delta = DIRECTIONS[action.direction];
      if (!delta) return invalid('Choose a cardinal direction to check.');
      matchTarget = { roomId: room.id, x: state.player.x + delta.x, y: state.player.y + delta.y };
      if (!walkable(tileAt(room, matchTarget.x, matchTarget.y))) return invalid('A match can check an adjacent walkable tile.');
      message = `You strike a match to the ${delta.label.toLowerCase()}.`;
      break;
    }
    case 'search': {
      const container = room.containers.find(candidate => candidate.id === action.containerId);
      if (!container || container.opened || !adjacent(state.player, { roomId: room.id, x: container.x, y: container.y })) return invalid('Stand beside an unopened container to search it.');
      targetContainerId = container.id;
      message = `You search the ${container.label.toLowerCase()}.`;
      break;
    }
    case 'unlock': {
      targetConnection = state.connections.find(connection => connection.id === action.connectionId);
      const endpoint = targetConnection && localEndpoint(state, targetConnection);
      if (!targetConnection || !endpoint || !adjacent(state.player, endpoint) || targetConnection.opened || !targetConnection.gate) return invalid('There is no closed passage within reach.');
      if (!state.inventory.includes(targetConnection.gate)) return invalid(gateDescription(targetConnection));
      message = targetConnection.gate === 'crowbar' ? 'The crowbar pulls the boards free. You keep the crowbar.' : `The ${ITEMS[targetConnection.gate].name.toLowerCase()} turns in the lock. You keep the key.`;
      break;
    }
    case 'travel': {
      targetConnection = state.connections.find(connection => connection.id === action.connectionId);
      const endpoint = targetConnection && localEndpoint(state, targetConnection);
      if (!targetConnection || !endpoint || !samePosition(state.player, endpoint)) return invalid('Stand on the door or stair tile before crossing.');
      if (!targetConnection.opened && targetConnection.gate) return invalid(gateDescription(targetConnection));
      destination = oppositeEndpoint(targetConnection, endpoint);
      if (samePosition(destination, state.spirit)) return invalid('Threshold disturbed: its ward warns that the arrival tile is occupied. Wait for the spirit to move. No turn spent.');
      const targetRoom = state.rooms.find(candidate => candidate.id === destination!.roomId);
      if (!targetRoom || !walkable(tileAt(targetRoom, destination.x, destination.y))) return invalid('This passage has no usable destination.');
      message = `You enter the ${targetRoom.name.toLowerCase()}.`;
      break;
    }
    case 'settle':
      if (state.objective.kind !== 'keepsake' || state.objective.completed || !state.objective.altar || !adjacent(state.player, state.objective.altar) || !state.inventory.includes('keepsake')) return invalid('Bring the silver locket to the memorial.');
      message = 'You place the silver locket on the memorial. The house exhales. Your task is complete; return to the front door.';
      break;
    case 'leave':
      if (!adjacent(state.player, state.entrance)) return invalid('Return to the front door to leave.');
      if (!objectiveReady(state)) return invalid(state.objective.description);
      message = 'The front door opens. You step into the morning. You escaped.';
      break;
    default: return invalid('That action is unavailable.');
  }

  const next: GameState = structuredClone(state);
  if (destination) {
    next.player = { ...destination };
    if (samePosition(next.player, next.spirit)) {
      if (next.charm) {
        next.charm = false;
        next.player = { ...state.player };
        message = 'Something catches your wrist. The protective charm shatters and pulls you back to your previous tile. The spirit stays where it was until its next movement beat. You have no charm left.';
      } else {
        next.status = 'lost';
        message = 'You step into the unseen spirit. With no charm left, the house keeps you.';
        log(next, message);
        refreshExploration(next);
        // Contact resolves before turn advancement. There is no spirit step after defeat.
        return { state: next, committed: true, message, spiritMoved: false };
      }
    }
  }
  if (action.type === 'search') {
    const container = next.rooms.find(candidate => candidate.id === room.id)!.containers.find(candidate => candidate.id === targetContainerId)!;
    container.opened = true;
    const found: string[] = [];
    if (container.item) {
      if (!next.inventory.includes(container.item)) next.inventory.push(container.item);
      found.push(ITEMS[container.item].name);
      if (container.item === 'exit-key' || container.item === 'diary') next.objective.completed = true;
    }
    if (container.matches) { next.matches += container.matches; found.push(`${container.matches} matches`); }
    if (container.treasure) { next.treasure += container.treasure; found.push(`${container.treasure} old coins`); }
    message += found.length ? ` Found: ${found.join(', ')}.` : ` ${container.note ?? 'It is empty.'}`;
  }
  if (action.type === 'unlock') next.connections.find(connection => connection.id === targetConnection!.id)!.opened = true;
  if (action.type === 'match') next.matches--;
  if (action.type === 'settle') next.objective.completed = true;
  if (action.type === 'leave') { next.objective.completed = true; next.status = 'won'; }
  log(next, message);
  next.turn++;
  const spiritMoved = next.turn % TUNING.spiritEveryTurns === 0 ? moveSpirit(next) : false;
  refreshExploration(next);
  if (matchTarget) {
    const haunted = samePosition(matchTarget, next.spirit);
    const evidence = { position: matchTarget, haunted, epoch: next.spiritMoves };
    next.evidence = next.evidence.filter(previous => !samePosition(previous.position, matchTarget!));
    next.evidence.push(evidence);
    // Multiple checks may be made in different rooms during a beat; bound retained clues.
    next.evidence = next.evidence.slice(-4);
    const direction = action.type === 'match' ? DIRECTIONS[action.direction].label : '';
    message = `${direction} tile: ${haunted ? 'OCCUPIED by the spirit' : 'CLEAR'}. This is the reading after your checking turn${spiritMoved ? ' and the spirit’s movement' : ''}; it expires at the next spirit movement.`;
    log(next, message);
  }
  return { state: next, committed: true, message, spiritMoved };
}
