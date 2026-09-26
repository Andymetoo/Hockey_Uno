import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, validateHouse } from '../generation.ts';
import { TUNING } from '../content.ts';
import { act, candle, interactions, objectiveReady } from '../game.ts';
import { parseSave } from '../persistence.ts';

const cardinal = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const pointKey = p => `${p.roomId}:${p.x},${p.y}`;
const samePoint = (a, b) => pointKey(a) === pointKey(b);
const copy = value => structuredClone(value);

function tileAt(state, p) {
  const room = state.rooms.find(candidate => candidate.id === p.roomId);
  if (!room || p.x < 0 || p.y < 0 || p.x >= room.width || p.y >= room.height) return undefined;
  return room.tiles[p.y * room.width + p.x];
}

const walkable = (state, p) => ['floor', 'door', 'stairs', 'exit'].includes(tileAt(state, p)?.kind);

// This solver works on individual tiles and actual container interaction positions.
// A connected room graph alone cannot satisfy its reachability checks.
function reachableTiles(state, inventory) {
  const reached = new Map([[pointKey(state.entrance), state.entrance]]);
  const queue = [state.entrance];
  for (let index = 0; index < queue.length; index++) {
    const here = queue[index];
    const neighbors = cardinal.map(([x, y]) => ({ roomId: here.roomId, x: here.x + x, y: here.y + y }));
    for (const connection of state.connections) {
      if (connection.gate && !connection.opened && !inventory.has(connection.gate)) continue;
      if (samePoint(here, connection.a)) neighbors.push(connection.b);
      if (samePoint(here, connection.b)) neighbors.push(connection.a);
    }
    for (const next of neighbors) {
      if (!walkable(state, next) || reached.has(pointKey(next))) continue;
      reached.set(pointKey(next), next);
      queue.push(next);
    }
  }
  return reached;
}

function canInteract(reached, position) {
  return cardinal.some(([x, y]) => reached.has(pointKey({ roomId: position.roomId, x: position.x + x, y: position.y + y })));
}

function solve(state) {
  const inventory = new Set(state.inventory);
  let reached, priorSize;
  const acquisition = [];
  do {
    priorSize = inventory.size;
    reached = reachableTiles(state, inventory);
    const found = [];
    for (const room of state.rooms) {
      for (const container of room.containers) {
        if (!container.item || inventory.has(container.item)) continue;
        if (canInteract(reached, { roomId: room.id, x: container.x, y: container.y })) found.push(container.item);
      }
    }
    for (const item of found) inventory.add(item);
    if (found.length) acquisition.push(found);
  } while (inventory.size > priorSize);
  return { inventory, reached, acquisition };
}

test('250 seeded houses are repeatable, varied, and solvable through tile-level prerequisites and return paths', () => {
  const sizes = new Set(), floors = new Set(), objectives = new Set(), plans = new Set();
  for (let number = 0; number < 250; number++) {
    const seed = `generation-verification-${number}`;
    const state = createGame(seed);
    assert.deepEqual(validateHouse(state), [], seed);
    assert.deepEqual(createGame(seed), state, `restart must reproduce ${seed}`);
    assert.equal(state.seed, seed);
    assert.equal(state.status, 'active');
    assert.equal(state.turn, 0);
    assert.equal(state.spiritMoves, 0);
    assert.equal(state.charm, true);
    assert.equal(state.matches, TUNING.startingMatches);
    assert.ok(!samePoint(state.player, state.spirit));
    assert.ok(state.spirit.roomId !== state.player.roomId || Math.abs(state.spirit.x - state.player.x) + Math.abs(state.spirit.y - state.player.y) > 1);
    assert.ok(state.rooms.length >= TUNING.minRooms && state.rooms.length <= TUNING.maxRooms);
    const floorCount = new Set(state.rooms.map(room => room.floor)).size;
    assert.ok(floorCount >= TUNING.minFloors && floorCount <= TUNING.maxFloors);
    sizes.add(state.rooms.length); floors.add(floorCount); objectives.add(state.objective.kind);
    plans.add(JSON.stringify(state.connections.map(connection => [connection.a.roomId, connection.b.roomId, connection.gate])));

    const solved = solve(state);
    for (const connection of state.connections) {
      assert.ok(solved.reached.has(pointKey(connection.a)), `${seed}: unreachable endpoint ${connection.id}.a`);
      assert.ok(solved.reached.has(pointKey(connection.b)), `${seed}: unreachable endpoint ${connection.id}.b`);
      if (connection.gate) assert.ok(solved.inventory.has(connection.gate), `${seed}: missing prerequisite ${connection.gate}`);
      for (const endpoint of [connection.a, connection.b]) {
        assert.equal(tileAt(state, endpoint)?.connectionId, connection.id);
        assert.equal(tileAt(state, endpoint)?.kind, connection.kind);
      }
      const floorA = state.rooms.find(room => room.id === connection.a.roomId).floor;
      const floorB = state.rooms.find(room => room.id === connection.b.roomId).floor;
      if (connection.kind === 'stairs') assert.equal(Math.abs(floorA - floorB), 1);
      else assert.equal(floorA, floorB);
    }
    const goalItem = state.objective.kind === 'escape' ? 'exit-key' : state.objective.kind;
    assert.ok(solved.inventory.has(goalItem), `${seed}: objective item must be interactable`);
    assert.ok(solved.reached.has(pointKey(state.entrance)), `${seed}: return to exit`);
    if (state.objective.altar) assert.ok(canInteract(solved.reached, state.objective.altar) || solved.reached.has(pointKey(state.objective.altar)), `${seed}: memorial unreachable`);
    assert.ok(solved.acquisition.length >= 2, `${seed}: progression must have actual dependencies`);
    assert.ok(state.rooms.some(room => room.containers.length === 0), `${seed}: preserve empty rooms`);
    assert.ok(state.connections.length >= state.rooms.length, `${seed}: at least one route loop`);
    for (const room of state.rooms) {
      assert.ok([...solved.reached.values()].some(point => point.roomId === room.id), `${seed}: inaccessible room ${room.id}`);
      for (const container of room.containers) assert.ok(canInteract(solved.reached, { roomId: room.id, x: container.x, y: container.y }), `${seed}: inaccessible container ${container.id}`);
    }
  }
  assert.ok(sizes.size >= 3, 'room budgets must produce several house sizes');
  assert.equal(floors.size, TUNING.maxFloors - TUNING.minFloors + 1);
  assert.deepEqual([...objectives].sort(), ['diary', 'escape', 'keepsake']);
  assert.ok(plans.size > 25, 'house routes must vary beyond item labels');
});

test('every generated walkable square permits a spirit to step away even with the player blocking one neighbor', () => {
  for (let number = 0; number < 100; number++) {
    const state = createGame(`fairness-${number}`);
    for (const room of state.rooms) {
      for (let y = 0; y < room.height; y++) {
        for (let x = 0; x < room.width; x++) {
          const here = { roomId: room.id, x, y };
          if (!walkable(state, here)) continue;
          const exits = cardinal.filter(([dx, dy]) => walkable(state, { roomId: room.id, x: x + dx, y: y + dy }));
          assert.ok(exits.length >= 2, `${state.seed}: trapped spirit at ${pointKey(here)}`);
        }
      }
    }
  }
});

test('validation rejects missing prerequisites, unreachable interactions, and malformed stairs', () => {
  const base = createGame('validation-corruption');
  const missingTool = copy(base);
  for (const room of missingTool.rooms) {
    for (const container of room.containers) if (container.item === 'crowbar') delete container.item;
  }
  assert.ok(validateHouse(missingTool).length > 0, 'essential tools cannot disappear');

  const sealedGoal = copy(base);
  const goalItem = sealedGoal.objective.kind === 'escape' ? 'exit-key' : sealedGoal.objective.kind;
  const goalRoom = sealedGoal.rooms.find(room => room.containers.some(container => container.item === goalItem));
  const container = goalRoom.containers.find(candidate => candidate.item === goalItem);
  for (const [dx, dy] of cardinal) goalRoom.tiles[(container.y + dy) * goalRoom.width + container.x + dx] = { kind: 'wall' };
  assert.ok(validateHouse(sealedGoal).length > 0, 'a graph-reachable room with a sealed objective must fail');

  const brokenStairs = copy(base);
  const stairs = brokenStairs.connections.find(connection => connection.kind === 'stairs');
  assert.ok(stairs);
  const destinationRoom = brokenStairs.rooms.find(room => room.id === stairs.b.roomId);
  destinationRoom.tiles[stairs.b.y * destinationRoom.width + stairs.b.x] = { kind: 'floor' };
  assert.ok(validateHouse(brokenStairs).length > 0, 'stairs must point to corresponding endpoint tiles');

  const selfLocked = copy(base);
  const originalKey = selfLocked.rooms.flatMap(room => room.containers).find(found => found.item === 'moth-key');
  const lockedRoomId = selfLocked.connections.find(connection => connection.gate === 'moth-key').b.roomId;
  const lockedRoom = selfLocked.rooms.find(room => room.id === lockedRoomId);
  const lockedContainer = lockedRoom.containers[0];
  assert.ok(lockedContainer, 'fixture must provide a container behind its first gate');
  originalKey.item = lockedContainer.item;
  lockedContainer.item = 'moth-key';
  assert.ok(validateHouse(selfLocked).length > 0, 'a key behind its own gate must fail');
});

test('the bounded-generation fallback is valid, reproducible, and preserves the requested seed', () => {
  const originalAttempts = TUNING.generationAttempts;
  try {
    TUNING.generationAttempts = 0;
    const state = createGame('force-authored-fallback');
    assert.equal(state.seed, 'force-authored-fallback');
    assert.deepEqual(validateHouse(state), []);
    assert.deepEqual(createGame(state.seed), state);
    const solved = solve(state);
    assert.ok(solved.inventory.has(state.objective.kind === 'escape' ? 'exit-key' : state.objective.kind));
  } finally {
    TUNING.generationAttempts = originalAttempts;
  }
});

function nextObjectiveRoute(state) {
  const tasks = [];
  if (objectiveReady(state)) {
    tasks.push({ at: state.entrance, action: { type: 'leave' } });
  } else if (state.objective.kind === 'keepsake' && state.inventory.includes('keepsake')) {
    tasks.push({ at: state.objective.altar, action: { type: 'settle' } });
  } else {
    for (const room of state.rooms) {
      for (const container of room.containers) {
        if (!container.opened && container.item && !state.inventory.includes(container.item)) {
          tasks.push({ at: { roomId: room.id, x: container.x, y: container.y }, action: { type: 'search', containerId: container.id } });
        }
      }
    }
    for (const connection of state.connections) {
      if (!connection.opened && connection.gate && state.inventory.includes(connection.gate)) {
        for (const at of [connection.a, connection.b]) tasks.push({ at, action: { type: 'unlock', connectionId: connection.id } });
      }
    }
  }

  const queue = [state.player];
  const previous = new Map([[pointKey(state.player), undefined]]);
  const directions = ['north', 'east', 'south', 'west'];
  for (let index = 0; index < queue.length; index++) {
    const here = queue[index];
    const task = tasks.find(candidate => candidate.at.roomId === here.roomId && Math.abs(candidate.at.x - here.x) + Math.abs(candidate.at.y - here.y) <= 1);
    if (task) {
      const actions = [task.action];
      let current = pointKey(here);
      while (previous.get(current)) {
        const step = previous.get(current);
        actions.push(step.action);
        current = step.from;
      }
      return actions.reverse();
    }
    const options = cardinal.map(([dx, dy], direction) => ({
      at: { roomId: here.roomId, x: here.x + dx, y: here.y + dy },
      action: { type: 'move', direction: directions[direction] },
    }));
    for (const connection of state.connections) {
      if (!connection.opened) continue;
      if (samePoint(here, connection.a)) options.push({ at: connection.b, action: { type: 'travel', connectionId: connection.id } });
      if (samePoint(here, connection.b)) options.push({ at: connection.a, action: { type: 'travel', connectionId: connection.id } });
    }
    for (const option of options) {
      const key = pointKey(option.at);
      if (!walkable(state, option.at) || previous.has(key)) continue;
      previous.set(key, { from: pointKey(here), action: option.action });
      queue.push(option.at);
    }
  }
  return undefined;
}

test('12 complete adventures win using public safety readings, with exact save/load after every action', context => {
  const runs = { escape: [], diary: [], keepsake: [] };
  let safetyWaits = 0;
  for (let candidate = 0; Object.values(runs).some(group => group.length < 4); candidate++) {
    assert.ok(candidate < 100, 'expected four examples of every objective');
    let state = createGame(`full-adventure-${candidate}`);
    if (runs[state.objective.kind].length >= 4) continue;
    const initialMatches = state.matches;
    let actions = 0;
    const perform = action => {
      assert.ok(++actions <= 2500, `${state.seed}: route did not complete within the turn budget`);
      if (action.type === 'wait') safetyWaits++;
      const result = act(state, action);
      assert.equal(result.committed, true, `${state.seed}: ${JSON.stringify(action)}: ${result.message}`);
      assert.notEqual(result.state.status, 'lost', `${state.seed}: dependable readings must prevent contact`);
      assert.equal(result.state.charm, true, `${state.seed}: no hidden hazard should need a charm`);
      assert.equal(result.state.matches, initialMatches, `${state.seed}: required routes need no finite information supply`);
      const loaded = parseSave(JSON.stringify(result.state));
      assert.equal(loaded.kind, 'loaded', `${state.seed}: save invalid after ${JSON.stringify(action)}: ${loaded.message ?? ''}`);
      assert.deepEqual(loaded.state, result.state);
      state = loaded.state;
    };
    while (state.status === 'active') {
      const route = nextObjectiveRoute(state);
      assert.ok(route?.length, `${state.seed}: no reachable next objective interaction`);
      for (const action of route) {
        if (action.type === 'move') {
          let waits = 0;
          while (candle(state)) {
            assert.ok(waits++ < TUNING.spiritEveryTurns, `${state.seed}: guttering candle never clears`);
            perform({ type: 'wait' });
          }
        }
        if (action.type === 'travel') {
          let waits = 0;
          const threshold = () => interactions(state).find(interaction => interaction.action.type === 'travel' && interaction.action.connectionId === action.connectionId);
          assert.ok(threshold(), `${state.seed}: missing threshold reading at a passage`);
          while (!threshold().available) {
            assert.ok(waits++ < TUNING.spiritEveryTurns, `${state.seed}: occupied threshold never clears`);
            perform({ type: 'wait' });
          }
        }
        perform(action);
      }
    }
    assert.equal(state.status, 'won');
    assert.equal(state.objective.completed, true);
    runs[state.objective.kind].push(state.turn);
  }
  assert.ok(safetyWaits > 0, 'the full adventures must exercise an actual hidden-hazard delay');
  context.diagnostic(Object.entries(runs).map(([kind, turns]) => `${kind}: ${turns.join(', ')} turns`).join('; '));
  context.diagnostic(`${safetyWaits} safety waits based on public candle or threshold readings`);
});
