import { TUNING } from './content.ts';
import type { Action, GameSnapshot, ItemId, Position, Reward } from './types.ts';
import { positionKey, walkable } from './world.ts';

export interface SolutionStep { action: Action; position: Position }
export interface SolveResult { status: 'solved' | 'unsolvable' | 'exhausted'; explored: number; solution: SolutionStep[] }
export interface SolveOptions { budget?: number }

const ITEMS: ItemId[] = ['moth-key', 'thorn-key', 'crowbar', 'exit-key', 'diary', 'keepsake'];
const itemBit = (item: ItemId): number => 1 << ITEMS.indexOf(item);
const DELTAS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

interface SearchState {
  spirits: number; candles: number; containers: number; gates: number;
  inventory: number; power: number; light: number; completed: boolean; at: number;
  parent?: SearchState; step?: SolutionStep;
}

/**
 * A deliberately bounded planner for this game's small authored ingredients.
 * Footsteps are collapsed into a flood of the current safe component. It knows
 * the complete house; information fairness is a separate generation check.
 */
export function solveHouse(house: GameSnapshot, options: SolveOptions = {}): SolveResult {
  const requestedBudget = options.budget ?? TUNING.solverBudget;
  const budget = Number.isFinite(requestedBudget) ? Math.max(0, Math.floor(requestedBudget)) : TUNING.solverBudget;
  if (house.status === 'won') return { status: 'solved', explored: 0, solution: [] };
  if (budget === 0) return { status: 'exhausted', explored: 0, solution: [] };
  const containers = house.rooms.flatMap(room => room.containers.map(container => ({ ...container, position: { roomId: room.id, x: container.x, y: container.y } })));
  // Bit masks remain exact, and unsupported oversized authored inputs fail honestly.
  if ([house.hauntings.length, house.candles.length, containers.length, house.connections.length].some(count => count > 30)) {
    return { status: 'exhausted', explored: 0, solution: [] };
  }
  const positions: Position[] = [];
  const indices = new Map<string, number>();
  for (const room of house.rooms) room.tiles.forEach((tile, index) => {
    if (!walkable(tile)) return;
    const position = { roomId: room.id, x: index % room.width, y: Math.floor(index / room.width) };
    indices.set(positionKey(position), positions.length);
    positions.push(position);
  });
  const start = indices.get(positionKey(house.player));
  if (start === undefined) return { status: 'unsolvable', explored: 0, solution: [] };
  const adjacentIndices = (position: Position): number[] => DELTAS.flatMap(([x, y]) => {
    const index = indices.get(positionKey({ roomId: position.roomId, x: position.x + x, y: position.y + y }));
    return index === undefined ? [] : [index];
  });
  const edges = positions.map(adjacentIndices);
  const spiritAt = new Int32Array(positions.length).fill(-1);
  const gateAt = new Int32Array(positions.length).fill(-1);
  const portalPeer = new Int32Array(positions.length).fill(-1);
  house.hauntings.forEach((spirit, index) => {
    const tile = indices.get(positionKey(spirit.position));
    if (tile !== undefined) spiritAt[tile] = index;
  });
  house.connections.forEach((connection, index) => {
    const first = indices.get(positionKey(connection.a));
    const second = indices.get(positionKey(connection.b));
    if (first === undefined || second === undefined) return;
    gateAt[first] = index; gateAt[second] = index;
    portalPeer[first] = second; portalPeer[second] = first;
  });
  const spiritAccess = house.hauntings.map(spirit => adjacentIndices(spirit.position));
  const candleAccess = house.candles.map(candle => adjacentIndices(candle.position));
  const containerAccess = containers.map(container => adjacentIndices(container.position));
  const gateAccess = house.connections.map(connection => [...adjacentIndices(connection.a), ...adjacentIndices(connection.b)]);
  const altarAccess = house.objective.altar ? adjacentIndices(house.objective.altar) : [];
  const entranceIndex = indices.get(positionKey(house.entrance));
  const exitAccess = [...adjacentIndices(house.entrance), ...(entranceIndex === undefined ? [] : [entranceIndex])];
  const keepsakeSpirit = house.hauntings.findIndex(spirit => spirit.id === house.objective.hauntingId);
  const objectiveItem = house.objective.kind === 'escape' ? 'exit-key' : house.objective.kind;
  const mask = <T>(values: T[], predicate: (value: T) => boolean): number => values.reduce((bits, value, index) => predicate(value) ? bits | (1 << index) : bits, 0);
  const root: SearchState = {
    spirits: mask(house.hauntings, spirit => spirit.banished), candles: mask(house.candles, candle => candle.used),
    containers: mask(containers, container => container.opened), gates: mask(house.connections, connection => connection.opened),
    inventory: house.inventory.reduce((bits, item) => bits | itemBit(item), 0), power: house.ritualPower,
    light: house.light, completed: house.objective.kind === 'keepsake' ? house.objective.completed : house.inventory.includes(objectiveItem), at: start,
  };
  const stack: SearchState[] = [root];
  const dominance = new Map<string, number>();
  let explored = 0;
  const applyReward = (state: SearchState, reward: Reward): void => {
    state.power += reward.power ?? 0;
    if (reward.item) {
      state.inventory |= itemBit(reward.item);
      if (house.objective.kind !== 'keepsake' && reward.item === objectiveItem) state.completed = true;
    }
  };
  const solution = (node: SearchState, last: SolutionStep): SolutionStep[] => {
    const steps = [last];
    let current: SearchState | undefined = node;
    while (current?.step) { steps.push(current.step); current = current.parent; }
    return steps.reverse();
  };

  while (stack.length) {
    if (explored >= budget) return { status: 'exhausted', explored, solution: [] };
    const node = stack.pop()!;
    const allowed = (tile: number): boolean =>
      (spiritAt[tile] < 0 || !!(node.spirits & (1 << spiritAt[tile]))) &&
      (gateAt[tile] < 0 || !!(node.gates & (1 << gateAt[tile])));
    if (!allowed(node.at)) continue;
    const reachable = new Uint8Array(positions.length);
    const queue = [node.at]; reachable[node.at] = 1;
    let component = node.at;
    for (let head = 0; head < queue.length; head++) {
      const tile = queue[head];
      if (tile < component) component = tile;
      for (const next of edges[tile]) if (!reachable[next] && allowed(next)) { reachable[next] = 1; queue.push(next); }
      const peer = portalPeer[tile];
      if (peer >= 0 && !reachable[peer] && allowed(peer)) { reachable[peer] = 1; queue.push(peer); }
    }
    const signature = `${node.spirits}/${node.candles}/${node.containers}/${node.gates}/${node.inventory}/${node.power}/${Number(node.completed)}/${component}`;
    if ((dominance.get(signature) ?? -1) >= node.light) continue;
    dominance.set(signature, node.light);
    explored++;
    const access = (tiles: number[]): number | undefined => tiles.find(tile => reachable[tile]);
    const exit = access(exitAccess);
    if (node.completed && exit !== undefined) {
      return { status: 'solved', explored, solution: solution(node, { action: { type: 'leave' }, position: positions[exit] }) };
    }
    const choices: { priority: number; next: SearchState }[] = [];
    const nextState = (action: Action, at: number): SearchState => ({ ...node, parent: node, step: { action, position: positions[at] }, at });
    for (let index = 0; index < containers.length; index++) {
      const container = containers[index];
      if (node.containers & (1 << index)) continue;
      // Pure narration and score cannot make an otherwise impossible route possible.
      if (!container.reward.item && !container.reward.power) continue;
      const at = access(containerAccess[index]);
      if (at === undefined) continue;
      const next = nextState({ type: 'search', containerId: container.id }, at);
      next.containers |= 1 << index; applyReward(next, container.reward);
      choices.push({ priority: container.reward.item === objectiveItem ? 0 : 1, next });
    }
    for (let index = 0; index < house.connections.length; index++) {
      const connection = house.connections[index];
      if ((node.gates & (1 << index)) || (connection.gate && !(node.inventory & itemBit(connection.gate)))) continue;
      const at = access(gateAccess[index]);
      if (at === undefined) continue;
      const next = nextState({ type: 'unlock', connectionId: connection.id }, at);
      next.gates |= 1 << index;
      choices.push({ priority: 2, next });
    }
    if (house.objective.kind === 'keepsake' && !node.completed && (node.inventory & itemBit('keepsake')) && node.light >= house.objective.ritualCost) {
      const at = access(altarAccess);
      if (at !== undefined) {
        const next = nextState({ type: 'settle' }, at);
        next.completed = true; next.light -= house.objective.ritualCost;
        if (keepsakeSpirit >= 0 && !(next.spirits & (1 << keepsakeSpirit))) {
          next.spirits |= 1 << keepsakeSpirit; applyReward(next, house.hauntings[keepsakeSpirit].reward);
        }
        choices.push({ priority: 0, next });
      }
    }
    for (let index = 0; index < house.hauntings.length; index++) {
      const spirit = house.hauntings[index];
      if ((node.spirits & (1 << index)) || spirit.resolution === 'keepsake' || (spirit.requires && !(node.inventory & itemBit(spirit.requires)))) continue;
      const cost = Math.max(1, spirit.resistance - node.power);
      if (cost > node.light) continue;
      const at = access(spiritAccess[index]);
      if (at === undefined) continue;
      const next = nextState({ type: 'banish', hauntingId: spirit.id }, at);
      next.spirits |= 1 << index; next.light -= cost; applyReward(next, spirit.reward);
      choices.push({ priority: spirit.reward.power ? 3 : spirit.reward.item ? 4 : spirit.guards?.length ? 5 : 9, next });
    }
    for (let index = 0; index < house.candles.length; index++) {
      if ((node.candles & (1 << index)) || node.light >= house.maxLight) continue;
      const candle = house.candles[index];
      const at = access(candleAccess[index]);
      if (at === undefined) continue;
      const next = nextState({ type: 'refill', candleId: candle.id }, at);
      next.candles |= 1 << index;
      next.light = Math.min(house.maxLight, node.light + candle.restores);
      choices.push({ priority: node.light + candle.restores <= house.maxLight ? 6 : 8, next });
    }
    // Depth first, promising progression first. Finite actions and safe dominance
    // bound this search; no heuristic failure is called mathematical impossibility.
    choices.sort((first, second) => second.priority - first.priority);
    for (const choice of choices) stack.push(choice.next);
  }
  return { status: 'unsolvable', explored, solution: [] };
}
