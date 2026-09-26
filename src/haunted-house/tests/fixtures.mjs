import { SAVE_VERSION, TUNING } from '../content.ts';

export const clone = value => structuredClone(value);
export const position = (x, y, roomId = 'hall') => ({ roomId, x, y });
export const pointKey = p => `${p.roomId}:${p.x},${p.y}`;
export const samePoint = (a, b) => pointKey(a) === pointKey(b);

export function makeRoom(id = 'hall', { width = 7, height = 7, floor = 0, known = true, solid = false } = {}) {
  return {
    id, name: id === 'hall' ? 'Entrance hall' : id, floor, width, height, pattern: 'test-fixture', mapX: 0, mapY: floor,
    tiles: Array.from({ length: width * height }, (_, index) => ({
      kind: solid || index % width === 0 || index % width === width - 1 || index < width || index >= width * (height - 1) ? 'wall' : 'floor',
    })),
    containers: [], discovered: Array(width * height).fill(known), visited: true,
  };
}

export function markTile(state, at, tile) {
  const room = state.rooms.find(candidate => candidate.id === at.roomId);
  room.tiles[at.y * room.width + at.x] = tile;
}

export function baseFixture(options = {}) {
  const room = makeRoom('hall', options);
  const state = {
    version: SAVE_VERSION, seed: 'resource-rule-fixture', rng: 741,
    rooms: [room], connections: [], hauntings: [], candles: [], clusters: [],
    player: position(3, 3), entrance: position(1, 5),
    steps: 0, decisions: 0, light: TUNING.startingLight, maxLight: TUNING.maxLight, ritualPower: TUNING.startingPower,
    inventory: [], treasure: 0,
    objective: { kind: 'escape', title: 'The last door', description: 'Find the front-door key and return to the entrance.', completed: false, ritualCost: 0 },
    journal: [], log: [], status: 'active', undo: [],
  };
  markTile(state, state.entrance, { kind: 'exit' });
  return state;
}

export function addHaunting(state, id, at, resistance, reward = {}, options = {}) {
  const haunting = { id, name: id, position: at, resistance, banished: false, reward, benefit: 'An optional encounter.', ...options };
  markTile(state, at, { kind: 'floor' });
  state.hauntings.push(haunting);
  return haunting;
}

export function addCandle(state, id, at, restores) {
  const candle = { id, name: id, position: at, restores, used: false };
  markTile(state, at, { kind: 'candle', candleId: id });
  state.candles.push(candle);
  return candle;
}

export function addContainer(state, id, at, reward = {}, options = {}) {
  const container = { id, label: id, x: at.x, y: at.y, opened: false, reward, ...options };
  state.rooms.find(room => room.id === at.roomId).containers.push(container);
  markTile(state, at, { kind: 'container', containerId: id });
  return container;
}

export function connectRooms(state, { id = 'passage', kind = 'door', gate, a = position(5, 3), b = position(1, 3, 'study') } = {}) {
  if (!state.rooms.some(room => room.id === b.roomId)) state.rooms.push(makeRoom(b.roomId, { floor: kind === 'stairs' ? 1 : 0 }));
  const connection = { id, a, b, kind, opened: !gate, ...(gate ? { gate } : {}) };
  state.connections.push(connection);
  for (const endpoint of [a, b]) markTile(state, endpoint, { kind, connectionId: id });
  return connection;
}

function localCluster(state, ids) {
  state.clusters.push({ id: 'visible-resource-decision', vantage: clone(state.player), members: ids });
  const room = state.rooms[0];
  room.discovered = room.tiles.map((_, i) => Math.abs(i % room.width - state.player.x) + Math.abs(Math.floor(i / room.width) - state.player.y) <= TUNING.lightRadius);
}

/** The precise 4/5 light, power 1 ordering example from the gameplay specification. */
export function orderingFixture() {
  const state = baseFixture();
  state.seed = 'exact-resource-order';
  addHaunting(state, 'lesser', position(2, 3), 3, { power: 1 }, { benefit: 'Gain 1 ritual power, reducing every later banishment cost.' });
  addHaunting(state, 'stronger', position(4, 3), 7, { item: 'exit-key' }, { benefit: 'Receive the front-door key.' });
  addCandle(state, 'three-light-candle', position(3, 2), 3);
  localCluster(state, [{ kind: 'haunting', id: 'lesser' }, { kind: 'haunting', id: 'stronger' }, { kind: 'candle', id: 'three-light-candle' }]);
  return state;
}

/** A physically guarded refill makes the cheapest initial encounter a losing resource choice. */
export function cheapestFirstFixture() {
  const state = baseFixture({ width: 8, height: 7, solid: true });
  state.seed = 'necessary-refill-access';
  state.entrance = position(1, 3);
  markTile(state, position(1, 5), { kind: 'wall' });
  for (let x = 1; x <= 6; x++) markTile(state, position(x, 3), { kind: 'floor' });
  markTile(state, state.entrance, { kind: 'exit' });
  addHaunting(state, 'treasure', position(3, 4), 2, { treasure: 5 }, { benefit: 'Receive 5 optional treasure.' });
  addHaunting(state, 'candle-keeper', position(4, 3), 4, { power: 1 }, { benefit: 'Gain 1 ritual power and access to a candle restoring 4 light.', guards: ['guarded-candle'] });
  addHaunting(state, 'last-guardian', position(5, 3), 7, { item: 'exit-key' }, { benefit: 'Receive the front-door key.' });
  addCandle(state, 'guarded-candle', position(4, 2), 4);
  localCluster(state, [{ kind: 'haunting', id: 'treasure' }, { kind: 'haunting', id: 'candle-keeper' }, { kind: 'haunting', id: 'last-guardian' }, { kind: 'candle', id: 'guarded-candle' }]);
  return state;
}
