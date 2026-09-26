import { DIRECTIONS, ITEMS, TUNING } from './content.ts';
import type { Action, ActionResult, Candle, Connection, GameSnapshot, GameState, Haunting, Interaction, Position, Reward } from './types.ts';
import { adjacent, discoveredChoices, known, leadText, refreshExploration, samePosition, tileAt, traversable } from './world.ts';
export { illuminated, samePosition, tileAt } from './world.ts';

export const banishCost = (state: GameSnapshot, haunting: Haunting): number => Math.max(1, haunting.resistance - state.ritualPower);
export function refillPreview(state: GameSnapshot, candle: Candle): { received: number; wasted: number; total: number } {
  const received = Math.min(candle.restores, state.maxLight - state.light);
  return { received, wasted: candle.restores - received, total: state.light + received };
}
export function rewardText(reward: Reward): string {
  const parts: string[] = [];
  if (reward.power) parts.push(`+${reward.power} ritual power (permanent)`);
  if (reward.item) parts.push(ITEMS[reward.item].name);
  if (reward.treasure) parts.push(`${reward.treasure} treasure`);
  return parts.join('; ') || 'No item reward';
}
export function objectiveReady(state: GameSnapshot): boolean {
  return state.objective.kind === 'keepsake' ? state.objective.completed : state.inventory.includes(state.objective.kind === 'escape' ? 'exit-key' : 'diary');
}
export function snapshot(state: GameState): GameSnapshot {
  const { undo: _history, ...core } = state;
  return structuredClone(core);
}
function log(state: GameSnapshot, message: string): void { state.log = [...state.log, message].slice(-TUNING.maxLogEntries); }
function addLead(state: GameSnapshot, text: string): void { if (!state.journal.includes(text)) state.journal.push(text); }
function grant(state: GameSnapshot, reward: Reward): void {
  state.ritualPower += reward.power ?? 0;
  state.treasure += reward.treasure ?? 0;
  if (reward.item && !state.inventory.includes(reward.item)) {
    state.inventory.push(reward.item);
    for (const c of state.connections.filter(c => !c.opened && c.gate === reward.item && (known(state, c.a) || known(state, c.b)))) {
      const p = known(state, c.a) ? c.a : c.b;
      addLead(state, `${ITEMS[reward.item].name} can open the ${c.kind === 'stairs' ? 'stairway' : 'passage'} recorded in the ${state.rooms.find(r => r.id === p.roomId)!.name}.`);
    }
  }
  if (state.objective.kind !== 'keepsake') state.objective.completed = objectiveReady(state);
}
function endpoint(state: GameSnapshot, c: Connection): Position | undefined {
  return [c.a, c.b].find(p => p.roomId === state.player.roomId && known(state, p)) ?? [c.a, c.b].find(p => known(state, p));
}
const otherEnd = (c: Connection, p: Position): Position => samePosition(c.a, p) ? c.b : c.a;
const requirement = (c: Connection): string => c.gate === 'crowbar' ? 'Boarded passage: requires the reusable crowbar.' : `Locked passage: requires ${c.gate ? ITEMS[c.gate].name : 'a key'}.`;

/** Inspection lists only remembered entities. Distance and affordability are separate facts. */
export function interactions(state: GameSnapshot): Interaction[] {
  const result: Interaction[] = [];
  const add = (id: string, name: string, label: string, detail: string, action: Action, position: Position, canUse: boolean, resolved = false): void => {
    if (!known(state, position)) return;
    const near = adjacent(state.player, position);
    result.push({ id, name, label, detail: `${detail}${!near && !resolved ? ' Approach an adjacent tile to act.' : ''}`, action, position, adjacent: near, available: state.status === 'active' && near && canUse && !resolved, resolved });
  };
  for (const h of state.hauntings) {
    const cost = banishCost(state, h);
    const specific = h.resolution === 'keepsake' ? 'Release at the memorial with the silver locket; it cannot be banished by force.' : h.requires ? `Requires ${ITEMS[h.requires].name}.` : 'No additional item required.';
    add(`banish-${h.id}`, h.name, `Banish · ${cost} light`, h.banished ? `${h.name} has been released. This tile is clear.` : `Resistance ${h.resistance}. Cost ${cost} light at power ${state.ritualPower}. Reward: ${rewardText(h.reward)}. ${h.benefit} ${specific}${state.light < cost && !h.resolution ? ` Need ${cost - state.light} more light.` : ''}`, { type: 'banish', hauntingId: h.id }, h.position, !h.resolution && state.light >= cost && (!h.requires || state.inventory.includes(h.requires)), h.banished);
  }
  for (const c of state.candles) {
    const preview = refillPreview(state, c);
    add(`refill-${c.id}`, c.name, `Use candle · receive ${preview.received} light`, c.used ? 'This candle is spent. It will not replenish.' : `Restore ${c.restores} light once. Receive ${preview.received}; ${preview.wasted} would be wasted. Result: ${preview.total}/${state.maxLight} light.`, { type: 'refill', candleId: c.id }, c.position, !c.used, c.used);
  }
  for (const room of state.rooms) for (const c of room.containers) {
    const clues = c.leads?.map(l => leadText(state, l)).join('; ');
    add(`search-${c.id}`, c.label, 'Search and collect', c.opened ? `Already searched. ${c.note ?? ''}` : `Contains: ${rewardText(c.reward)}.${c.note ? ` ${c.note}` : ''}${clues ? ` Leads: ${clues}.` : ''}`, { type: 'search', containerId: c.id }, { roomId: room.id, x: c.x, y: c.y }, !c.opened, c.opened);
  }
  for (const c of state.connections) {
    const p = endpoint(state, c);
    if (!p || !known(state, p)) continue;
    const target = otherEnd(c, p);
    const targetRoom = state.rooms.find(r => r.id === target.roomId)!;
    if (!c.opened) add(`unlock-${c.id}`, `${c.gate === 'crowbar' ? 'Boarded' : c.gate ? ITEMS[c.gate].name : 'Locked'} ${c.kind === 'stairs' ? 'stairway' : 'door'}`, c.gate === 'crowbar' ? 'Remove boards' : 'Unlock passage', `${requirement(c)} ${c.gate && state.inventory.includes(c.gate) ? 'You have the tool; it is not consumed.' : 'Return when you have its tool.'}`, { type: 'unlock', connectionId: c.id }, p, !!c.gate && state.inventory.includes(c.gate));
    else add(`travel-${c.id}`, c.kind === 'stairs' ? `Stairs ${targetRoom.floor > state.rooms.find(r => r.id === p.roomId)!.floor ? 'up' : 'down'}` : 'Open doorway', 'Cross passage', `${targetRoom.visited ? `Leads to ${targetRoom.name}.` : 'Leads to an unexplored room.'} Walking onto this tile crosses automatically. Travel costs no light.`, { type: 'travel', connectionId: c.id }, p, samePosition(state.player, p) && traversable(state, target));
  }
  if (state.objective.altar) add('settle', 'Memorial', `Release the bound soul${state.objective.ritualCost ? ` · ${state.objective.ritualCost} light` : ''}`, state.objective.completed ? 'The locket rests here. Its owner is released and their tile is clear.' : `Bring the silver locket here to release its owner. Cost: ${state.objective.ritualCost} light.`, { type: 'settle' }, state.objective.altar, state.inventory.includes('keepsake') && state.light >= state.objective.ritualCost, state.objective.completed);
  add('leave', 'Front door', 'Leave the house', objectiveReady(state) ? 'Your objective is complete. Escape through the front door.' : state.objective.description, { type: 'leave' }, state.entrance, objectiveReady(state));
  return result;
}

/** Atomic deterministic decisions; walking has no resource or haunting side effects. */
export function act(state: GameState, action: Action): ActionResult {
  const invalid = (message: string): ActionResult => ({ state, committed: false, consequential: false, message, discoveredChoice: false });
  if (action.type === 'undo') {
    if (!state.undo.length) return invalid('No decision to undo yet. Walking does not add undo entries.');
    const restored: GameState = { ...structuredClone(state.undo[state.undo.length - 1]), undo: state.undo.slice(0, -1) };
    return { state: restored, committed: true, consequential: false, message: 'Decision undone. Position, resources, discoveries and world restored to that snapshot.', discoveredChoice: false };
  }
  if (state.status !== 'active') return invalid('This adventure is complete. Undo a decision or start another house.');
  let destination: Position | undefined;
  let message = '';
  const consequential = action.type !== 'move' && action.type !== 'travel';
  const room = state.rooms.find(r => r.id === state.player.roomId)!;
  switch (action.type) {
    case 'move': {
      const d = DIRECTIONS[action.direction];
      if (!d) return invalid('Choose a cardinal direction.');
      destination = { roomId: room.id, x: state.player.x + d.x, y: state.player.y + d.y };
      if (!traversable(state, destination)) {
        const h = state.hauntings.find(h => !h.banished && samePosition(h.position, destination!));
        return invalid(h ? `${h.name} blocks this tile. Inspect it and choose whether to banish it.` : 'That way is blocked. No light spent.');
      }
      const tile = tileAt(room, destination.x, destination.y)!;
      const c = state.connections.find(c => c.id === tile.connectionId);
      if (c?.opened) {
        const target = otherEnd(c, destination);
        if (!traversable(state, target)) return invalid('The far side is blocked. No light spent.');
        destination = { ...target };
      }
      message = destination.roomId !== state.player.roomId ? `Entered the ${state.rooms.find(r => r.id === destination!.roomId)!.name}.` : 'Walking costs no light.';
      break;
    }
    case 'travel': {
      const c = state.connections.find(c => c.id === action.connectionId);
      if (!c || !c.opened || (!samePosition(c.a, state.player) && !samePosition(c.b, state.player))) return invalid('Stand on an open passage to cross.');
      destination = { ...otherEnd(c, state.player) };
      if (!traversable(state, destination)) return invalid('The far side is blocked.');
      message = `Entered the ${state.rooms.find(r => r.id === destination!.roomId)!.name}.`;
      break;
    }
    case 'banish': {
      const h = state.hauntings.find(h => h.id === action.hauntingId);
      if (!h || h.banished || !known(state, h.position) || !adjacent(state.player, h.position)) return invalid('Stand beside a discovered, unresolved haunting.');
      if (h.resolution) return invalid('This soul must be released at the memorial with the silver locket.');
      if (h.requires && !state.inventory.includes(h.requires)) return invalid(`This banishment requires ${ITEMS[h.requires].name}.`);
      const cost = banishCost(state, h);
      if (state.light < cost) return invalid(`Banishment costs ${cost} light. You have ${state.light}; need ${cost - state.light} more. Nothing was spent.`);
      message = `Banished ${h.name}: spent ${cost} light. ${rewardText(h.reward)}. ${h.benefit}`;
      break;
    }
    case 'refill': {
      const c = state.candles.find(c => c.id === action.candleId);
      if (!c || c.used || !known(state, c.position) || !adjacent(state.player, c.position)) return invalid('Stand beside an unused, discovered candle.');
      const p = refillPreview(state, c);
      message = `Used ${c.name}: received ${p.received} light; ${p.wasted} wasted. The candle is spent.`;
      break;
    }
    case 'search': {
      const c = room.containers.find(c => c.id === action.containerId);
      if (!c || c.opened || !known(state, { roomId: room.id, x: c.x, y: c.y }) || !adjacent(state.player, { roomId: room.id, x: c.x, y: c.y })) return invalid('Stand beside an unopened, discovered object.');
      message = `Searched ${c.label}: ${rewardText(c.reward)}.${c.note ? ` ${c.note}` : ''}`;
      break;
    }
    case 'unlock': {
      const c = state.connections.find(c => c.id === action.connectionId);
      const p = c && endpoint(state, c);
      if (!c || c.opened || !c.gate || !p || !known(state, p) || !adjacent(state.player, p)) return invalid('Stand beside a closed passage.');
      if (!state.inventory.includes(c.gate)) return invalid(requirement(c));
      message = `Opened the ${c.kind === 'stairs' ? 'stairway' : 'passage'} with ${ITEMS[c.gate].name}. The tool is reusable.`;
      break;
    }
    case 'settle':
      if (state.objective.kind !== 'keepsake' || !state.objective.altar || state.objective.completed || !adjacent(state.player, state.objective.altar) || !state.inventory.includes('keepsake')) return invalid('Bring the silver locket to the memorial.');
      if (state.light < state.objective.ritualCost) return invalid(`The ritual needs ${state.objective.ritualCost} light. Nothing was spent.`);
      message = 'The locket returns to its owner. The bound soul is released; its tile is now clear. Return to the front door.';
      break;
    case 'leave':
      if (!adjacent(state.player, state.entrance) || !objectiveReady(state)) return invalid(state.objective.description);
      message = 'Your task is complete. The front door opens onto the morning. You escaped.';
      break;
    default: return invalid('That action is unavailable.');
  }
  const before = snapshot(state);
  const next: GameState = { ...structuredClone(before), undo: consequential ? [...state.undo, before].slice(-TUNING.undoLimit) : [...state.undo] };
  if (destination) { next.player = destination; next.steps++; }
  if (action.type === 'banish') {
    const h = next.hauntings.find(h => h.id === action.hauntingId)!;
    next.light -= banishCost(next, h); h.banished = true; grant(next, h.reward);
  } else if (action.type === 'refill') {
    const c = next.candles.find(c => c.id === action.candleId)!;
    next.light = refillPreview(next, c).total; c.used = true;
  } else if (action.type === 'search') {
    const c = next.rooms.find(r => r.id === room.id)!.containers.find(c => c.id === action.containerId)!;
    c.opened = true; grant(next, c.reward);
    for (const lead of c.leads ?? []) addLead(next, `${c.label}: ${leadText(next, lead)}.`);
    if (c.note) addLead(next, c.note);
  } else if (action.type === 'unlock') next.connections.find(c => c.id === action.connectionId)!.opened = true;
  else if (action.type === 'settle') {
    next.light -= next.objective.ritualCost; next.objective.completed = true;
    const h = next.hauntings.find(h => h.id === next.objective.hauntingId);
    if (h && !h.banished) { h.banished = true; grant(next, h.reward); }
  } else if (action.type === 'leave') { next.objective.completed = true; next.status = 'won'; }
  if (consequential) { next.decisions++; log(next, message); }
  const previousChoices = discoveredChoices(state);
  refreshExploration(next);
  const discoveredChoice = [...discoveredChoices(next)].some(id => !previousChoices.has(id));
  return { state: next, committed: true, consequential, message, discoveredChoice };
}
