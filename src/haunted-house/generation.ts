import { OBJECTIVES, SAVE_VERSION, TUNING } from './content.ts';
import { makePatternRoom, type PatternRoom } from './room-patterns.ts';
import { solveHouse } from './solver.ts';
import type { Candle, Connection, Direction, GameSnapshot, GameState, Haunting, ItemId, Lead, ObjectiveKind, Position, Reward } from './types.ts';
import { adjacent, positionKey, random, refreshExploration, samePosition, seedNumber, tileAt, walkable } from './world.ts';

export interface GenerationOptions { attempts?: number; solverBudget?: number; forceFallback?: boolean }
type Opening = 'strength' | 'route' | 'replenishment';
const OPPOSITE: Record<Direction, Direction> = { north: 'south', east: 'west', south: 'north', west: 'east' };
const DELTAS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
const FALLBACK_SEED = 'haunted-house:resource-fallback:2';
const pick = <T>(rng: { rng: number }, values: readonly T[]): T => values[Math.floor(random(rng) * values.length)];
const integer = (rng: { rng: number }, min: number, max: number): number => min + Math.floor(random(rng) * (max - min + 1));

/** Choose bounded puzzle ingredients first; place their concrete geometry second. */
function build(seed: string, generationSeed: string, fallback = false): GameState {
  const rng = { rng: seedNumber(generationSeed) };
  const kind = fallback ? 'escape' : pick<ObjectiveKind>(rng, ['escape', 'diary', 'keepsake']);
  const ritualCost = kind === 'keepsake' ? 1 : 0;
  const opening = fallback ? 'strength' : pick<Opening>(rng, ['strength', 'route', 'replenishment']);
  const count = fallback ? 8 : integer(rng, TUNING.minRooms, TUNING.maxRooms);
  const floors = fallback ? 2 : integer(rng, TUNING.minFloors, TUNING.maxFloors);
  const objectiveRoomName = kind === 'escape' ? 'Housekeeper’s archive' : kind === 'diary' ? 'Sealed archive' : 'Lost bedroom';
  const layouts: PatternRoom[] = [];
  const addRoom = (pattern: string, name: string, floor: number, mapX: number, mapY: number): number => {
    layouts.push(makePatternRoom(pattern, `room-${layouts.length}`, name, floor, mapX, mapY));
    return layouts.length - 1;
  };
  addRoom(opening === 'strength' ? 'foyer-wide' : opening === 'route' ? 'foyer-l' : 'foyer-alcove', 'Entrance hall', 0, 0, 0);
  addRoom('workshop', 'Workshop', 0, 1, 0);
  addRoom('study', 'Boarded study', 0, 2, 0);
  addRoom(pick(rng, ['landing', 'long-hall']), 'Lower stair hall', 0, 2, -1);
  addRoom('landing', 'Upper landing', 1, 2, -1);
  addRoom('guard-gallery', 'Portrait gallery', 1, 3, -1);
  addRoom(kind === 'keepsake' ? 'memorial' : 'archive', objectiveRoomName, floors - 1, floors === 3 ? 3 : 4, -1);
  addRoom(pick(rng, ['closet', 'storage']), 'Linen closet', 0, -1, 0);
  if (count > 8) addRoom('long-hall', 'Rain passage', 0, 1, -1);
  if (count > 9) addRoom('nursery', 'Old nursery', 0, 0, -1);
  if (count > 10) addRoom('treasure-alcove', 'Collector’s cabinet', 0, 3, 0);
  if (count > 11) addRoom('divided-parlour', 'Divided drawing room', 1, 2, -2);

  const rooms = layouts.map(layout => layout.room);
  const connections: Connection[] = [];
  const candles: Candle[] = [];
  const hauntings: Haunting[] = [];
  const usedPorts = new Set<string>();
  const connect = (first: number, direction: Direction, second: number, gate?: Connection['gate']): Connection => {
    const a = layouts[first].ports[direction];
    const b = layouts[second].ports[OPPOSITE[direction]];
    if (!a || !b || usedPorts.has(positionKey(a)) || usedPorts.has(positionKey(b))) throw new Error('Unavailable room doorway.');
    usedPorts.add(positionKey(a)); usedPorts.add(positionKey(b));
    const kind = rooms[first].floor === rooms[second].floor ? 'door' : 'stairs';
    const connection: Connection = { id: `passage-${connections.length}`, a, b, kind, opened: !gate, ...(gate ? { gate } : {}) };
    connections.push(connection);
    for (const at of [a, b]) {
      const room = rooms.find(candidate => candidate.id === at.roomId)!;
      room.tiles[at.y * room.width + at.x] = { kind, connectionId: connection.id, label: kind === 'stairs' ? 'Staircase' : 'Doorway' };
    }
    return connection;
  };
  connect(0, 'east', 1);
  const boardedStudy = connect(1, 'east', 2, 'crowbar');
  const mothPassage = connect(2, 'north', 3, 'moth-key');
  connect(3, 'north', 4);
  connect(4, 'east', 5);
  const finalPassage = connect(5, 'east', 6, 'thorn-key');
  connect(0, 'west', 7);
  if (count > 8) { connect(1, 'north', 8); connect(8, 'east', 3, 'moth-key'); }
  if (count > 9) { connect(0, 'north', 9); connect(9, 'east', 8); }
  if (count > 10) connect(2, 'east', 10);
  if (count > 11) connect(4, 'north', 11);

  const position = (room: number, anchor: string): Position => {
    const found = layouts[room].anchors[anchor];
    if (!found) throw new Error(`Missing ${anchor} in room ${room}`);
    return found;
  };
  const container = (id: string, label: string, at: Position, reward: Reward, note?: string, leads?: Lead[]): void => {
    const room = rooms.find(candidate => candidate.id === at.roomId)!;
    if (tileAt(room, at.x, at.y)?.kind !== 'floor') throw new Error(`Occupied container placement: ${id}`);
    room.tiles[at.y * room.width + at.x] = { kind: 'container', label, containerId: id };
    room.containers.push({ id, label, x: at.x, y: at.y, opened: false, reward, ...(note ? { note } : {}), ...(leads ? { leads } : {}) });
  };
  const candle = (id: string, name: string, at: Position, restores: number): void => {
    const room = rooms.find(candidate => candidate.id === at.roomId)!;
    if (tileAt(room, at.x, at.y)?.kind !== 'floor') throw new Error(`Occupied candle placement: ${id}`);
    room.tiles[at.y * room.width + at.x] = { kind: 'candle', label: name, candleId: id };
    candles.push({ id, name, position: at, restores, used: false });
  };
  const spirit = (id: string, name: string, at: Position, resistance: number, reward: Reward, benefit: string, guards?: string[]): Haunting => {
    const haunting: Haunting = { id, name, position: at, resistance, banished: false, reward, benefit, ...(guards ? { guards } : {}) };
    hauntings.push(haunting); return haunting;
  };
  // Three light makes the guarded-candle variant tight enough that optional
  // treasure can prevent a keepsake run from retaining its final ritual charge.
  const mainCandleAmount = 3;
  candle('candle-entrance', 'Hall candle', position(0, 'd'), mainCandleAmount);
  candle('candle-study', 'Scholar’s candle', position(2, 'c'), 4);
  candle('candle-landing', 'Landing candle', position(4, 'a'), 4);
  spirit('haunt-instructor', 'The Whispering Tutor', position(0, 'a'), opening === 'strength' ? 3 : opening === 'route' ? 5 : 4,
    { power: 1 }, 'Learn a stronger ritual: +1 permanent ritual power.');
  spirit('haunt-caretaker', 'The Hollow Caretaker', position(0, 'b'), opening === 'strength' ? 5 : opening === 'route' ? 3 : 4,
    { item: 'crowbar' }, `Receive the reusable crowbar. It opens the boards between ${rooms[1].name} and ${rooms[2].name}.`);
  spirit('haunt-miser', 'The Pocket Miser', position(0, 'c'), 2, { treasure: 2 }, 'Recover two pieces of optional treasure.');
  if (opening === 'replenishment') {
    spirit('haunt-wick', 'The Wick Keeper', position(0, 'h'), 5, {}, `Open access to the Hall candle: restore ${mainCandleAmount} light once.`, ['candle-entrance']);
  }
  container('study-manual', 'Ritual manual', position(2, 'a'), { power: 1 },
    `The improved ritual will help against the guardian of ${rooms[5].name}.`, [{ kind: 'haunting', id: 'haunt-portrait' }]);
  spirit('haunt-librarian', 'The Folded Librarian', position(2, 'b'), 6, { item: 'moth-key' },
    `Receive the Moth key. It opens the route to ${rooms[3].name}.`);
  const objectiveItem: ItemId = kind === 'escape' ? 'exit-key' : kind;
  const objectiveLabel = kind === 'escape' ? 'Front-door key' : kind === 'diary' ? 'Missing diary' : 'Silver locket';
  spirit('haunt-portrait', 'The Faceless Portrait', position(5, 'g'), 7, { item: 'thorn-key' },
    `Receive the Thorn key and open the passage to ${rooms[6].name}, where the ${objectiveLabel.toLowerCase()} waits.${ritualCost ? ` The memorial beyond requires ${ritualCost} light.` : ''}`, [finalPassage.id]);
  container('objective-chest', kind === 'keepsake' ? 'Bedside keepsake box' : 'Housekeeper’s writing desk', position(6, 'a'), { item: objectiveItem });
  container('entrance-note', 'Caretaker’s note', position(0, 'n'), {},
    `A ritual manual remains in ${rooms[2].name}. The Hollow Caretaker holds the crowbar for its boarded passage.`,
    [{ kind: 'container', id: 'study-manual' }, { kind: 'connection', id: boardedStudy.id }, { kind: 'haunting', id: 'haunt-caretaker' }]);
  container('workshop-note', 'Marked workbench drawer', position(1, 'a'), {},
    `The Moth lock leads from ${rooms[2].name} to ${rooms[3].name}. A candle waits in ${rooms[4].name}, above the stairs.`,
    [{ kind: 'connection', id: mothPassage.id }, { kind: 'candle', id: 'candle-landing' }]);

  let altar: Position | undefined;
  if (kind === 'keepsake') {
    altar = position(6, 'b');
    rooms[6].tiles[altar.y * rooms[6].width + altar.x] = { kind: 'altar', label: 'Memorial' };
    const resident = spirit('haunt-resident', 'The Waiting Resident', position(6, 'g'), 9, { treasure: 1 },
      'Return the silver locket at the memorial to release its owner and reclaim a keepsake token.');
    resident.resolution = 'keepsake';
  }
  if (count > 10) {
    container('collector-box', 'Collector’s locked-away folio', position(10, 'a'), { power: 1, treasure: 2 });
    spirit('haunt-collector', 'The Ink Collector', position(10, 'g'), 6, {},
      'Open the alcove containing a ritual folio: +1 power and two pieces of treasure.', ['collector-box']);
  }
  const spiritTarget = fallback ? hauntings.length : integer(rng, Math.max(TUNING.minSpirits, hauntings.length), TUNING.maxSpirits);
  const extraSpots = [position(1, 'b'), { roomId: rooms[2].id, x: 7, y: 4 }, { roomId: rooms[6].id, x: 8, y: 6 }];
  for (let index = 0; hauntings.length < spiritTarget && index < extraSpots.length; index++) {
    spirit(`haunt-optional-${index}`, ['The Ash Apprentice', 'The Paper Hoarder', 'The Velvet Guest'][index], extraSpots[index], index === 0 ? 6 : 4,
      index === 0 ? { power: 1 } : { treasure: 3 }, index === 0 ? 'Learn an optional ritual improvement: +1 power.' : 'Recover three pieces of optional treasure.');
  }
  const candleTarget = fallback ? 3 : integer(rng, TUNING.minCandles, TUNING.maxCandles);
  if (candleTarget > 3) candle('candle-workshop', 'Tallow stub', { roomId: rooms[1].id, x: 6, y: 1 }, 2);
  if (candleTarget > 4) {
    const at = count > 9 ? position(9, 'b') : position(5, 'a');
    candle('candle-spare', count > 9 ? 'Nursery candle' : 'Gallery taper', at, 3);
  }
  const entrance = layouts[0].ports.south!;
  rooms[0].tiles[entrance.y * rooms[0].width + entrance.x] = { kind: 'exit', label: 'Front door' };
  const state: GameState = {
    version: SAVE_VERSION, seed, rng: rng.rng, rooms, connections, hauntings, candles,
    clusters: [
      { id: `opening-${opening}`, vantage: position(0, 'P'), members: [
        { kind: 'haunting', id: 'haunt-instructor' }, { kind: 'haunting', id: 'haunt-caretaker' },
        { kind: 'haunting', id: 'haunt-miser' }, { kind: 'candle', id: 'candle-entrance' },
        ...(opening === 'replenishment' ? [{ kind: 'haunting' as const, id: 'haunt-wick' }] : []),
      ] },
      { id: 'study-choice', vantage: { roomId: rooms[2].id, x: 2, y: 3 }, members: [
        { kind: 'container', id: 'study-manual' }, { kind: 'haunting', id: 'haunt-librarian' }, { kind: 'candle', id: 'candle-study' },
      ] },
      { id: 'upper-guardian', vantage: { roomId: rooms[4].id, x: 3, y: 3 }, members: [
        { kind: 'haunting', id: 'haunt-portrait' }, { kind: 'candle', id: 'candle-landing' },
      ] },
    ],
    player: { ...position(0, 'P') }, entrance, steps: 0, decisions: 0,
    light: TUNING.startingLight, maxLight: TUNING.maxLight, ritualPower: TUNING.startingPower,
    inventory: [], treasure: 0, objective: { kind, ...OBJECTIVES[kind],
      description: `${OBJECTIVES[kind].description}${ritualCost ? ` The memorial ritual requires ${ritualCost} light.` : ''}`, completed: false, ritualCost,
      ...(altar ? { altar, hauntingId: 'haunt-resident' } : {}) },
    journal: [`The ${rooms[6].name} holds the ${objectiveLabel.toLowerCase()}.`, `The crowbar opens ${rooms[2].name}; its ritual manual strengthens future banishments.`],
    log: ['The front door closes behind you.', 'Inspect the nearby hauntings and candle before spending your light.'], status: 'active', undo: [],
  };
  refreshExploration(state);
  return state;
}

/** Bounded retries. A fixed authored fallback is independently geometry-validated. */
export function createGame(seed: string, options: GenerationOptions = {}): GameState {
  const attempts = options.forceFallback ? 0 : Math.max(0, Math.min(TUNING.generationAttempts, Math.floor(options.attempts ?? TUNING.generationAttempts)));
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const house = build(seed, `${seed}:resource:${attempt}`);
      if (validateHouse(house, { solverBudget: options.solverBudget }).length === 0) return house;
    } catch { /* Construction and validation have a strict retry limit. */ }
  }
  const fallback = build(seed, FALLBACK_SEED, true);
  const errors = validateHouse(fallback);
  if (errors.length) throw new Error(`Haunted House fallback is invalid: ${errors.join('; ')}`);
  return fallback;
}

interface FloodOptions { removeAllSpirits?: boolean; keepSpirit?: string; openAllGates?: boolean }

/** Physical reachability used only by generation checks; it does not spend items. */
function flood(house: GameSnapshot, start: Position, options: FloodOptions = {}): Map<string, Position> {
  const byId = new Map(house.rooms.map(room => [room.id, room]));
  const blockedSpirits = new Set(house.hauntings.filter(spirit =>
    !spirit.banished && (!options.removeAllSpirits || spirit.id === options.keepSpirit)).map(spirit => positionKey(spirit.position)));
  const blockedGates = new Set(house.connections.filter(connection => !connection.opened && !options.openAllGates)
    .flatMap(connection => [positionKey(connection.a), positionKey(connection.b)]));
  const portals = new Map(house.connections.flatMap(connection => [[positionKey(connection.a), connection.b], [positionKey(connection.b), connection.a]] as [string, Position][]));
  const allowed = (at: Position): boolean => {
    const room = byId.get(at.roomId);
    return !!room && walkable(tileAt(room, at.x, at.y)) && !blockedSpirits.has(positionKey(at)) && !blockedGates.has(positionKey(at));
  };
  const result = new Map<string, Position>();
  if (!allowed(start)) return result;
  const queue = [start]; result.set(positionKey(start), start);
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    const next = DELTAS.map(([x, y]) => ({ roomId: current.roomId, x: current.x + x, y: current.y + y }));
    const peer = portals.get(positionKey(current));
    if (peer) next.push(peer);
    for (const candidate of next) if (allowed(candidate) && !result.has(positionKey(candidate))) {
      result.set(positionKey(candidate), candidate); queue.push(candidate);
    }
  }
  return result;
}

function leadPositions(house: GameSnapshot, lead: Lead): Position[] {
  if (lead.kind === 'haunting') return house.hauntings.filter(spirit => spirit.id === lead.id).map(spirit => spirit.position);
  if (lead.kind === 'candle') return house.candles.filter(candle => candle.id === lead.id).map(candle => candle.position);
  if (lead.kind === 'container') return house.rooms.flatMap(room => room.containers.filter(container => container.id === lead.id).map(container => ({ roomId: room.id, x: container.x, y: container.y })));
  if (lead.kind === 'connection') return house.connections.filter(connection => connection.id === lead.id).flatMap(connection => [connection.a, connection.b]);
  return house.rooms.filter(room => room.id === lead.id).flatMap(room => room.tiles.flatMap((tile, index) => walkable(tile) ? [{ roomId: room.id, x: index % room.width, y: Math.floor(index / room.width) }] : []));
}

/** Every local decision cluster can be surveyed without committing any resource. */
export function validateInformationFairness(house: GameSnapshot): string[] {
  const errors: string[] = [];
  for (const cluster of house.clusters) {
    const safe = [...flood(house, cluster.vantage).values()];
    if (!safe.length) { errors.push(`${cluster.id} has no safe vantage.`); continue; }
    for (const member of cluster.members) {
      const targets = leadPositions(house, member);
      if (!targets.length || !targets.some(target => safe.some(at => at.roomId === target.roomId && Math.abs(at.x - target.x) + Math.abs(at.y - target.y) <= TUNING.lightRadius))) {
        errors.push(`${cluster.id} hides ${member.id} until after a commitment.`);
      }
    }
  }
  return errors;
}

/** New-house validation. Progressed saves use structural validation instead. */
export function validateHouse(house: GameSnapshot, options: { solverBudget?: number } = {}): string[] {
  const errors: string[] = [];
  const rooms = new Map(house.rooms.map(room => [room.id, room]));
  const connectionIds = new Set(house.connections.map(connection => connection.id));
  if (rooms.size !== house.rooms.length) errors.push('Room identifiers must be unique.');
  if (connectionIds.size !== house.connections.length) errors.push('Connection identifiers must be unique.');
  const endpointKeys = new Set<string>();
  const onTerrain = (at: Position): boolean => { const room = rooms.get(at.roomId); return !!room && walkable(tileAt(room, at.x, at.y)); };
  for (const connection of house.connections) {
    const first = rooms.get(connection.a.roomId); const second = rooms.get(connection.b.roomId);
    if (!first || !second || first.id === second.id) { errors.push(`${connection.id} connects invalid rooms.`); continue; }
    if (connection.kind === 'stairs' ? Math.abs(first.floor - second.floor) !== 1 : first.floor !== second.floor) errors.push(`${connection.id} has inconsistent floors.`);
    if (connection.kind === 'door') {
      const dx = second.mapX - first.mapX; const dy = second.mapY - first.mapY;
      if (Math.abs(dx) + Math.abs(dy) !== 1) errors.push(`${connection.id} does not connect neighbouring rooms.`);
      if (dx > 0 && !(connection.a.x > first.width / 2 && connection.b.x < second.width / 2) || dx < 0 && !(connection.a.x < first.width / 2 && connection.b.x > second.width / 2) || dy > 0 && !(connection.a.y > first.height / 2 && connection.b.y < second.height / 2) || dy < 0 && !(connection.a.y < first.height / 2 && connection.b.y > second.height / 2)) errors.push(`${connection.id} has inconsistent doorway directions.`);
    }
    for (const endpoint of [connection.a, connection.b]) {
      const room = rooms.get(endpoint.roomId); const tile = room && tileAt(room, endpoint.x, endpoint.y);
      if (tile?.kind !== connection.kind || tile.connectionId !== connection.id) errors.push(`${connection.id} has an invalid endpoint.`);
      if (endpointKeys.has(positionKey(endpoint))) errors.push('Two passages share an endpoint.');
      endpointKeys.add(positionKey(endpoint));
    }
  }
  for (const room of house.rooms) {
    if (room.tiles.length !== room.width * room.height || room.discovered.length !== room.tiles.length) errors.push(`${room.id} has inconsistent dimensions.`);
    room.tiles.forEach((tile, index) => {
      const at = { roomId: room.id, x: index % room.width, y: Math.floor(index / room.width) };
      if (['door', 'stairs'].includes(tile.kind) && (!tile.connectionId || !connectionIds.has(tile.connectionId) || !endpointKeys.has(positionKey(at)))) errors.push(`${room.id} contains an unpaired passage.`);
      if (tile.kind === 'container' && !room.containers.some(container => container.id === tile.containerId && container.x === at.x && container.y === at.y)) errors.push(`${room.id} has an orphaned container tile.`);
      if (tile.kind === 'candle' && !house.candles.some(candle => candle.id === tile.candleId && samePosition(candle.position, at))) errors.push(`${room.id} has an orphaned candle tile.`);
    });
    for (const container of room.containers) {
      if (tileAt(room, container.x, container.y)?.containerId !== container.id) errors.push(`${container.id} is missing its container tile.`);
      for (const lead of container.leads ?? []) if (!leadPositions(house, lead).length) errors.push(`${container.id} has a clue pointing at missing content.`);
    }
  }
  const spiritPositions = new Set<string>();
  for (const spirit of house.hauntings) {
    if (!onTerrain(spirit.position) || endpointKeys.has(positionKey(spirit.position))) errors.push(`${spirit.id} must occupy its own floor tile.`);
    if (spiritPositions.has(positionKey(spirit.position))) errors.push('Hauntings cannot share a tile.');
    spiritPositions.add(positionKey(spirit.position));
  }
  for (const candle of house.candles) {
    const room = rooms.get(candle.position.roomId);
    if (!room || tileAt(room, candle.position.x, candle.position.y)?.candleId !== candle.id || candle.restores <= 0) errors.push(`${candle.id} has an invalid placement or restoration.`);
  }
  const entranceRoom = rooms.get(house.entrance.roomId);
  if (!onTerrain(house.player) || !entranceRoom || tileAt(entranceRoom, house.entrance.x, house.entrance.y)?.kind !== 'exit') errors.push('The player and entrance need valid floor positions.');
  if (errors.length) return errors;

  const allOpen = flood(house, house.entrance, { removeAllSpirits: true, openAllGates: true });
  const canInteract = (at: Position, reachable: Map<string, Position>): boolean => [...reachable.values()].some(candidate => adjacent(candidate, at));
  for (const room of house.rooms) {
    room.tiles.forEach((tile, index) => {
      if (walkable(tile) && !allOpen.has(positionKey({ roomId: room.id, x: index % room.width, y: Math.floor(index / room.width) }))) errors.push(`${room.id} has unreachable floor geometry.`);
    });
    for (const container of room.containers) if (!canInteract({ roomId: room.id, x: container.x, y: container.y }, allOpen)) errors.push(`${container.id} has no interaction position.`);
  }
  for (const candle of house.candles) if (!canInteract(candle.position, allOpen)) errors.push(`${candle.id} has no interaction position.`);
  for (const spirit of house.hauntings) {
    if (!canInteract(spirit.position, allOpen)) errors.push(`${spirit.id} has no interaction position.`);
    if (!spirit.guards?.length) continue;
    const blocked = flood(house, house.entrance, { removeAllSpirits: true, keepSpirit: spirit.id, openAllGates: true });
    for (const guard of spirit.guards) {
      const connection = house.connections.find(candidate => candidate.id === guard);
      const target = connection ? [connection.a, connection.b] : [
        ...house.candles.filter(candle => candle.id === guard).map(candle => candle.position),
        ...house.rooms.flatMap(room => room.containers.filter(container => container.id === guard).map(container => ({ roomId: room.id, x: container.x, y: container.y }))),
      ];
      if (!target.length) errors.push(`${spirit.id} guards missing content.`);
      else if (connection ? target.some(at => blocked.has(positionKey(at))) : target.some(at => canInteract(at, blocked))) errors.push(`${spirit.id} can be bypassed on the way to ${guard}.`);
      else if (connection ? !target.every(at => allOpen.has(positionKey(at))) : !target.some(at => canInteract(at, allOpen))) errors.push(`${guard} stays inaccessible after banishment.`);
    }
  }
  if (house.objective.kind === 'keepsake') {
    const altar = house.objective.altar; const room = altar && rooms.get(altar.roomId);
    if (!altar || !room || tileAt(room, altar.x, altar.y)?.kind !== 'altar' || !canInteract(altar, allOpen) || !house.hauntings.some(spirit => spirit.id === house.objective.hauntingId && spirit.resolution === 'keepsake')) errors.push('The keepsake needs a reachable memorial and associated haunting.');
  }
  errors.push(...validateInformationFairness(house));
  if (errors.length) return errors;
  const solution = solveHouse(house, { budget: options.solverBudget });
  if (solution.status === 'exhausted') errors.push(`Resource validation exhausted its ${solution.explored}-state search budget.`);
  else if (solution.status !== 'solved') errors.push('The completed house has no resource solution with an escape route.');
  return errors;
}
