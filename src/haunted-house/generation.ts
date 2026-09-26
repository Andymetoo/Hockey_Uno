import { OBJECTIVES, SAVE_VERSION, TUNING } from './content.ts';
import type { Connection, GameState, ItemId, ObjectiveKind, Position, Room } from './types.ts';
import { adjacent, cardinalNeighbors, neighbors, positionKey, random, refreshExploration, samePosition, seedNumber, tileAt, walkable } from './world.ts';

interface PlannedRoom { name: string; floor: number; parent: number; gate?: Connection['gate']; item?: ItemId; role?: 'altar' | 'supplies' | 'treasure' | 'quiet' | 'empty'; }
interface Plan { kind: ObjectiveKind; rooms: PlannedRoom[]; loops: [number, number][]; }
const OPTIONAL_NAMES = ['Drawing room', 'Old nursery', 'Linen room', 'Rain gallery', 'Music room', 'Box room', 'Portrait hall', 'Guest room', 'Dusty study'];
const PORTALS = [{ x: 4, y: 1 }, { x: 7, y: 4 }, { x: 4, y: 7 }, { x: 1, y: 4 }, { x: 6, y: 1 }, { x: 7, y: 6 }, { x: 2, y: 7 }, { x: 1, y: 2 }];
const OBJECT_SPOTS = [{ x: 3, y: 3 }, { x: 5, y: 3 }, { x: 3, y: 5 }, { x: 5, y: 5 }];

function pick<T>(rng: { rng: number }, values: readonly T[]): T { return values[Math.floor(random(rng) * values.length)]; }
function shuffle<T>(rng: { rng: number }, values: T[]): T[] {
  for (let index = values.length - 1; index > 0; index--) {
    const other = Math.floor(random(rng) * (index + 1));
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
}

/** Establish the dependency graph before selecting any geometry or object positions. */
function requirements(rng: { rng: number }): Plan {
  const kind = pick<ObjectiveKind>(rng, ['escape', 'diary', 'keepsake']);
  const count = TUNING.minRooms + Math.floor(random(rng) * (TUNING.maxRooms - TUNING.minRooms + 1));
  const floors = TUNING.minFloors + Math.floor(random(rng) * (TUNING.maxFloors - TUNING.minFloors + 1));
  const branching = random(rng) < 0.5;
  const rooms: PlannedRoom[] = [
    { name: 'Entrance hall', floor: 0, parent: -1 },
    { name: pick(rng, ['Cloakroom', 'Morning room', 'Butler’s pantry']), floor: 0, parent: 0, item: 'moth-key' },
    { name: 'Workshop', floor: 1, parent: random(rng) < 0.5 ? 0 : 1, gate: 'moth-key', item: 'crowbar' },
    { name: 'Writing room', floor: branching ? 0 : 1, parent: branching ? 0 : 2, gate: branching ? undefined : 'crowbar', item: 'thorn-key' },
    { name: 'Upper landing', floor: floors - 1, parent: branching ? 2 : 3, gate: branching ? 'crowbar' : undefined, role: 'quiet' },
    { name: kind === 'diary' ? 'Sealed archive' : kind === 'keepsake' ? 'Lost bedroom' : 'Housekeeper’s room', floor: floors - 1, parent: 4, gate: 'thorn-key', item: kind === 'escape' ? 'exit-key' : kind },
    { name: kind === 'keepsake' ? 'Memorial room' : 'Winter parlour', floor: 0, parent: 0, role: kind === 'keepsake' ? 'altar' : 'quiet' },
  ];
  const names = shuffle(rng, [...OPTIONAL_NAMES]);
  for (let index = rooms.length; index < count; index++) {
    const possibleParents = Array.from({ length: index }, (_, roomIndex) => roomIndex).filter(roomIndex => roomIndex !== 7);
    const parent = pick(rng, possibleParents);
    const floor = Math.max(0, Math.min(floors - 1, rooms[parent].floor + pick(rng, [-1, 0, 0, 1])));
    const roles: PlannedRoom['role'][] = ['empty', 'supplies', 'treasure', 'quiet'];
    rooms.push({ name: names[index - 7], parent, floor, role: roles[(index - 7) % roles.length] });
  }
  // A guaranteed early loop offers a route choice without bypassing a prerequisite.
  const loops: [number, number][] = [[1, 6]];
  const region = (index: number): string => {
    const gates: string[] = [];
    while (index > 0) { if (rooms[index].gate) gates.push(rooms[index].gate!); index = rooms[index].parent; }
    return gates.sort().join('|');
  };
  const candidates: [number, number][] = [];
  for (let first = 0; first < rooms.length; first++) for (let second = first + 1; second < rooms.length; second++) {
    if (rooms[second].parent !== first && !(first === 1 && second === 6) && Math.abs(rooms[first].floor - rooms[second].floor) <= 1 && region(first) === region(second)) candidates.push([first, second]);
  }
  // Extra loops are optional; the first optional room remains a genuine dead end.
  for (const pair of shuffle(rng, candidates)) {
    if (loops.length >= 2 + Math.floor(count / 6)) break;
    if (pair.includes(7) || random(rng) < 0.5) continue;
    const degree = (index: number) => rooms.filter(room => room.parent === index).length + (index ? 1 : 0) + loops.filter(loop => loop.includes(index)).length;
    if (degree(pair[0]) < 6 && degree(pair[1]) < 6) loops.push(pair);
  }
  return { kind, rooms, loops };
}

function build(seed: string, generationSeed: string): GameState {
  const rng = { rng: seedNumber(generationSeed) };
  const plan = requirements(rng);
  const size = TUNING.roomSize;
  const rooms: Room[] = plan.rooms.map((planned, index) => {
    const room: Room = {
      id: `room-${index}`, name: planned.name, floor: planned.floor, width: size, height: size,
      tiles: Array.from({ length: size * size }, (_, tileIndex) => ({ kind: tileIndex % size === 0 || tileIndex % size === size - 1 || tileIndex < size || tileIndex >= size * (size - 1) ? 'wall' : 'floor' })),
      containers: [], discovered: Array(size * size).fill(false), visited: false,
    };
    const spots = shuffle(rng, OBJECT_SPOTS.map(spot => ({ ...spot })));
    const setObject = (kind: 'furniture' | 'container' | 'altar', label: string, containerId?: string): { x: number; y: number } => {
      const spot = spots.pop()!;
      room.tiles[spot.y * size + spot.x] = { kind, label, ...(containerId ? { containerId } : {}) };
      return spot;
    };
    if (planned.item || planned.role === 'supplies' || planned.role === 'treasure') {
      const id = `container-${index}`;
      const label = planned.item ? pick(rng, ['Carved chest', 'Writing desk', 'Small cabinet']) : planned.role === 'supplies' ? 'Match tin' : 'Velvet-lined box';
      const spot = setObject('container', label, id);
      room.containers.push({ id, label, ...spot, opened: false, ...(planned.item ? { item: planned.item } : planned.role === 'supplies' ? { matches: 3 } : { treasure: 1 + Math.floor(random(rng) * 3) }) });
    } else if (planned.role === 'altar') setObject('altar', 'Memorial');
    else if (planned.role === 'quiet' && random(rng) < 0.65) {
      const id = `container-${index}`;
      const spot = setObject('container', 'Empty drawers', id);
      room.containers.push({ id, label: 'Empty drawers', ...spot, opened: false, note: 'Only dust. Not every room has something to give.' });
    }
    if (planned.role !== 'empty') {
      const furniture = Math.floor(random(rng) * 3);
      for (let count = 0; count < furniture; count++) setObject('furniture', pick(rng, ['Tall wardrobe', 'Covered chair', 'Broken table']));
    }
    return room;
  });
  const freePortals = rooms.map((_, index) => shuffle(rng, PORTALS.filter(portal => index !== 0 || portal.x !== 4 || portal.y !== 7).map(portal => ({ ...portal }))));
  const connections: Connection[] = [];
  const connect = (first: number, second: number, gate?: Connection['gate']): void => {
    const pointA = freePortals[first].pop();
    const pointB = freePortals[second].pop();
    if (!pointA || !pointB) throw new Error('Room connection budget exceeded.');
    const kind = rooms[first].floor === rooms[second].floor ? 'door' : 'stairs';
    const connection: Connection = { id: `passage-${connections.length}`, a: { roomId: rooms[first].id, ...pointA }, b: { roomId: rooms[second].id, ...pointB }, kind, ...(gate ? { gate } : {}), opened: !gate };
    connections.push(connection);
    for (const position of [connection.a, connection.b]) {
      const room = rooms.find(candidate => candidate.id === position.roomId)!;
      room.tiles[position.y * size + position.x] = { kind, connectionId: connection.id, label: kind === 'door' ? 'Doorway' : 'Staircase' };
    }
  };
  plan.rooms.forEach((room, index) => { if (index) connect(room.parent, index, room.gate); });
  plan.loops.forEach(([first, second]) => connect(first, second));
  const entrance: Position = { roomId: rooms[0].id, x: 4, y: 7 };
  rooms[0].tiles[entrance.y * size + entrance.x] = { kind: 'exit', label: 'Front door' };
  const altarRoom = rooms.find(room => room.tiles.some(tile => tile.kind === 'altar'));
  const altarIndex = altarRoom?.tiles.findIndex(tile => tile.kind === 'altar');
  const state: GameState = {
    version: SAVE_VERSION, seed, rng: rng.rng, rooms, connections,
    player: { roomId: rooms[0].id, x: 4, y: 6 }, spirit: { roomId: rooms[rooms.length - 1].id, x: 4, y: 4 }, entrance,
    turn: 0, spiritMoves: 0, inventory: [], matches: TUNING.startingMatches, charm: true, treasure: 0,
    objective: { kind: plan.kind, ...OBJECTIVES[plan.kind], completed: false, ...(altarRoom && altarIndex !== undefined ? { altar: { roomId: altarRoom.id, x: altarIndex % size, y: Math.floor(altarIndex / size) } } : {}) },
    evidence: [], log: ['The front door closes behind you.', 'Your candle is steady. Walk carefully; the house waits while you think.'], status: 'active',
  };
  refreshExploration(state);
  return state;
}

/** Bounded retries plus the same authored, validated fallback for any failed seed. */
export function createGame(seed: string): GameState {
  for (let attempt = 0; attempt < TUNING.generationAttempts; attempt++) {
    try {
      const state = build(seed, `${seed}:layout:${attempt}`);
      if (validateHouse(state).length === 0) return state;
    } catch { /* Retry only a bounded number of construction failures. */ }
  }
  const fallback = build(seed, 'haunted-house:known-valid:1');
  const errors = validateHouse(fallback);
  if (errors.length) throw new Error(`Haunted House fallback is invalid: ${errors.join('; ')}`);
  return fallback;
}

/** Tile-level acquisition simulation. Also accepts a progressed, structurally checked save. */
export function validateHouse(state: GameState): string[] {
  const errors: string[] = [];
  const roomIds = new Set(state.rooms.map(room => room.id));
  if (roomIds.size !== state.rooms.length) errors.push('Room identifiers must be unique.');
  const connectionIds = new Set(state.connections.map(connection => connection.id));
  if (connectionIds.size !== state.connections.length) errors.push('Passage identifiers must be unique.');
  const endpoints = new Set<string>();
  for (const connection of state.connections) {
    if (connection.a.roomId === connection.b.roomId) errors.push(`${connection.id} must connect different rooms.`);
    for (const endpoint of [connection.a, connection.b]) {
      const room = state.rooms.find(candidate => candidate.id === endpoint.roomId);
      const tile = room && tileAt(room, endpoint.x, endpoint.y);
      if (!tile || tile.kind !== connection.kind || tile.connectionId !== connection.id) errors.push(`${connection.id} has an invalid endpoint.`);
      if (endpoints.has(positionKey(endpoint))) errors.push('Passages share an endpoint.');
      endpoints.add(positionKey(endpoint));
    }
    const first = state.rooms.find(room => room.id === connection.a.roomId);
    const second = state.rooms.find(room => room.id === connection.b.roomId);
    if (first && second && (connection.kind === 'stairs' ? Math.abs(first.floor - second.floor) !== 1 : first.floor !== second.floor)) errors.push(`${connection.id} has inconsistent floors.`);
  }
  for (const room of state.rooms) {
    if (room.tiles.length !== room.width * room.height || room.discovered.length !== room.tiles.length) errors.push(`${room.id} has inconsistent dimensions.`);
    room.tiles.forEach((tile, index) => {
      const position = { roomId: room.id, x: index % room.width, y: Math.floor(index / room.width) };
      if (walkable(tile) && cardinalNeighbors(state, position).length < 2) errors.push(`${room.id} has a tile that can trap the spirit.`);
      if ((tile.kind === 'door' || tile.kind === 'stairs') && (!tile.connectionId || !connectionIds.has(tile.connectionId) || !endpoints.has(positionKey(position)))) errors.push(`${room.id} has an unpaired passage tile.`);
      if (tile.kind === 'container' && !room.containers.some(container => container.id === tile.containerId && container.x === position.x && container.y === position.y)) errors.push(`${room.id} has a missing container.`);
    });
    for (const container of room.containers) {
      const tile = tileAt(room, container.x, container.y);
      if (tile?.kind !== 'container' || tile.containerId !== container.id) errors.push(`${container.id} has no physical container tile.`);
    }
  }
  const validPosition = (position: Position) => {
    const room = state.rooms.find(candidate => candidate.id === position.roomId);
    return !!room && walkable(tileAt(room, position.x, position.y));
  };
  if (!validPosition(state.entrance) || !validPosition(state.player) || !validPosition(state.spirit)) errors.push('Entrance, player and spirit must stand on traversable tiles.');
  const entranceRoom = state.rooms.find(room => room.id === state.entrance.roomId);
  if (!entranceRoom || tileAt(entranceRoom, state.entrance.x, state.entrance.y)?.kind !== 'exit') errors.push('The entrance needs an exit tile.');
  if (errors.length) return errors;

  const acquired = new Set<ItemId>(state.inventory);
  let reachable = new Map<string, Position>();
  for (let pass = 0; pass <= 6; pass++) {
    const queue = [{ ...state.entrance }];
    reachable = new Map([[positionKey(state.entrance), state.entrance]]);
    for (let index = 0; index < queue.length; index++) for (const next of neighbors(state, queue[index], gate => acquired.has(gate))) {
      if (!reachable.has(positionKey(next))) { reachable.set(positionKey(next), next); queue.push(next); }
    }
    let changed = false;
    for (const room of state.rooms) for (const container of room.containers) {
      if (!container.item || acquired.has(container.item) || container.opened) continue;
      const position = { roomId: room.id, x: container.x, y: container.y };
      if ([...reachable.values()].some(candidate => adjacent(candidate, position))) { acquired.add(container.item); changed = true; }
    }
    if (!changed) break;
  }
  for (const connection of state.connections) {
    if (connection.gate && !acquired.has(connection.gate)) errors.push(`The ${connection.gate} prerequisite cannot be reached.`);
    if (!reachable.has(positionKey(connection.a)) || !reachable.has(positionKey(connection.b))) errors.push(`${connection.id} has an unreachable endpoint.`);
  }
  for (const room of state.rooms) {
    room.tiles.forEach((tile, index) => {
      if (walkable(tile) && !reachable.has(positionKey({ roomId: room.id, x: index % room.width, y: Math.floor(index / room.width) }))) errors.push(`${room.id} has an unreachable floor tile.`);
    });
    for (const container of room.containers) {
      const position = { roomId: room.id, x: container.x, y: container.y };
      if (![...reachable.values()].some(candidate => adjacent(candidate, position)) || (container.item && !acquired.has(container.item))) errors.push(`${container.id} cannot be searched from a reachable tile.`);
    }
  }
  const objectiveItem: ItemId = state.objective.kind === 'escape' ? 'exit-key' : state.objective.kind;
  if (!acquired.has(objectiveItem)) errors.push('The objective item cannot be recovered.');
  if (state.objective.kind === 'keepsake') {
    const altar = state.objective.altar;
    const room = altar && state.rooms.find(candidate => candidate.id === altar.roomId);
    if (!altar || !room || tileAt(room, altar.x, altar.y)?.kind !== 'altar' || ![...reachable.values()].some(candidate => adjacent(candidate, altar))) errors.push('The memorial cannot be used from a reachable tile.');
  }
  if (!reachable.has(positionKey(state.player))) errors.push('The player has no return route.');
  if (state.status === 'active' && samePosition(state.player, state.spirit)) errors.push('An active player cannot overlap the spirit.');
  return errors;
}
