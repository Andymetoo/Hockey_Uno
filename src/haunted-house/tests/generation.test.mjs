import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, validateHouse } from '../generation.ts';
import { solveHouse } from '../solver.ts';
import { TUNING } from '../content.ts';
import { act, interactions } from '../game.ts';
import { parseSave } from '../persistence.ts';
import { refreshExploration } from '../world.ts';
import { cheapestFirstFixture, clone, orderingFixture, pointKey, samePoint } from './fixtures.mjs';

const cardinal = [[0, -1, 'north'], [1, 0, 'east'], [0, 1, 'south'], [-1, 0, 'west']];

function tileAt(state, p) {
  const room = state.rooms.find(candidate => candidate.id === p.roomId);
  if (!room || p.x < 0 || p.y < 0 || p.x >= room.width || p.y >= room.height) return undefined;
  return room.tiles[p.y * room.width + p.x];
}

function safe(state, p) {
  const tile = tileAt(state, p);
  if (!tile || !['floor', 'door', 'stairs', 'exit'].includes(tile.kind)) return false;
  if (state.hauntings.some(h => !h.banished && samePoint(h.position, p))) return false;
  return !tile.connectionId || state.connections.some(c => c.id === tile.connectionId && c.opened);
}

/** Independent reachability follows real move semantics, including automatic portal crossing. */
function pathsFrom(state, start = state.player) {
  const queue = [start];
  const paths = new Map([[pointKey(start), []]]);
  for (let index = 0; index < queue.length; index++) {
    const here = queue[index];
    const choices = cardinal.map(([dx, dy, direction]) => {
      const neighbor = { roomId: here.roomId, x: here.x + dx, y: here.y + dy };
      if (!safe(state, neighbor)) return undefined;
      const connection = state.connections.find(c => c.id === tileAt(state, neighbor)?.connectionId);
      const to = connection ? samePoint(connection.a, neighbor) ? connection.b : connection.a : neighbor;
      return safe(state, to) ? { to, action: { type: 'move', direction } } : undefined;
    });
    for (const connection of state.connections.filter(c => c.opened)) {
      if (samePoint(connection.a, here) && safe(state, connection.b)) choices.push({ to: connection.b, action: { type: 'travel', connectionId: connection.id } });
      if (samePoint(connection.b, here) && safe(state, connection.a)) choices.push({ to: connection.a, action: { type: 'travel', connectionId: connection.id } });
    }
    for (const choice of choices.filter(Boolean)) {
      if (paths.has(pointKey(choice.to))) continue;
      paths.set(pointKey(choice.to), [...paths.get(pointKey(here)), choice.action]);
      queue.push(choice.to);
    }
  }
  return paths;
}

const canInteract = (paths, p) => cardinal.some(([dx, dy]) => paths.has(pointKey({ roomId: p.roomId, x: p.x + dx, y: p.y + dy })));

function apply(state, action) {
  const result = act(state, action);
  assert.equal(result.committed, true, `${state.seed}: ${JSON.stringify(action)}: ${result.message}`);
  return result.state;
}

test('40 seeded houses are repeatable, within pacing budgets, and solved after final geometric placement', context => {
  const sizes = new Set(), floors = new Set(), objectives = new Set(), patterns = new Set(), footprints = new Set(), openings = new Set();
  let largestSearch = 0;
  for (let number = 0; number < 40; number++) {
    const seed = `resource-generation-${number}`;
    const state = createGame(seed);
    assert.equal(state.seed, seed);
    assert.deepEqual(createGame(seed), state, `same seed reproduces ${seed}`);
    assert.deepEqual(validateHouse(state), [], seed);
    const solved = solveHouse(state);
    assert.equal(solved.status, 'solved', seed);
    assert.ok(solved.solution.some(step => step.action.type === 'leave'));
    largestSearch = Math.max(largestSearch, solved.explored);
    assert.equal(state.status, 'active');
    assert.equal(state.light, TUNING.startingLight);
    assert.equal(state.ritualPower, TUNING.startingPower);
    assert.equal(state.maxLight, TUNING.maxLight);
    if (state.objective.kind === 'keepsake') {
      const finalRitual = new RegExp(`${state.objective.ritualCost} light`);
      assert.match(state.objective.description, finalRitual, 'the final ritual cost is known before any commitment');
      assert.match(state.hauntings.find(h => h.id === 'haunt-portrait').benefit, finalRitual, 'the last guardian warns that light must remain for the memorial');
    }
    assert.ok(state.rooms.length >= TUNING.minRooms && state.rooms.length <= TUNING.maxRooms);
    assert.ok(state.hauntings.length >= TUNING.minSpirits && state.hauntings.length <= TUNING.maxSpirits);
    assert.ok(state.candles.length >= TUNING.minCandles && state.candles.length <= TUNING.maxCandles);
    const floorCount = new Set(state.rooms.map(room => room.floor)).size;
    assert.ok(floorCount >= TUNING.minFloors && floorCount <= TUNING.maxFloors);
    sizes.add(state.rooms.length); floors.add(floorCount); objectives.add(state.objective.kind);
    for (const room of state.rooms) {
      patterns.add(room.pattern);
      footprints.add(`${room.width}x${room.height}:${room.tiles.map(t => t.kind === 'wall' ? '#' : '.').join('')}`);
      assert.equal(room.tiles.length, room.width * room.height);
      assert.equal(room.discovered.length, room.tiles.length);
    }
    let opening = interactions(state).filter(entry => !entry.resolved && ['banish', 'search', 'refill'].includes(entry.action.type));
    for (const path of pathsFrom(state).values()) {
      if (opening.length || path.length > 3) continue;
      const nearby = path.reduce((at, action) => apply(at, action), state);
      opening = interactions(nearby).filter(entry => !entry.resolved && ['banish', 'search', 'refill'].includes(entry.action.type));
    }
    assert.ok(opening.length > 0, `${seed}: the opening offers a useful visible interaction within three free steps`);
    openings.add(opening.map(entry => `${entry.name}:${entry.detail}`).join('|'));
    for (const connection of state.connections) {
      assert.equal(tileAt(state, connection.a)?.connectionId, connection.id);
      assert.equal(tileAt(state, connection.b)?.connectionId, connection.id);
      const first = state.rooms.find(room => room.id === connection.a.roomId);
      const second = state.rooms.find(room => room.id === connection.b.roomId);
      assert.notEqual(first.id, second.id);
      assert.equal(first.floor === second.floor, connection.kind === 'door');
    }
  }
  assert.ok(sizes.size >= 3, 'adventure room counts vary');
  assert.equal(floors.size, 2, 'both two-floor and three-floor adventures occur');
  assert.equal(objectives.size, 3);
  assert.ok(patterns.size >= 5, 'closets, halls, chambers, and shaped rooms use authored footprints');
  assert.ok(footprints.size >= 8, 'room geometry varies beyond names and furniture');
  assert.ok(openings.size >= 3, 'houses do not share one mandatory tutorial opening');
  context.diagnostic(`${sizes.size} room counts; ${patterns.size} named patterns; ${footprints.size} footprints; maximum ${largestSearch} solver states`);
});

test('12 complete generated adventures replay solver witnesses through actual walking and public actions', context => {
  const completed = { escape: 0, diary: 0, keepsake: 0 };
  let steps = 0, decisions = 0, optionalSurvivors = 0;
  for (let candidate = 0; Object.values(completed).some(count => count < 4); candidate++) {
    assert.ok(candidate < 100, 'every objective must be generated');
    let state = createGame(`resource-complete-${candidate}`);
    const kind = state.objective.kind;
    if (completed[kind] >= 4) continue;
    const solved = solveHouse(state);
    assert.equal(solved.status, 'solved');
    for (const step of solved.solution) {
      const path = pathsFrom(state).get(pointKey(step.position));
      assert.ok(path, `${state.seed}: solver action position must be reachable under real movement: ${JSON.stringify(step)}`);
      for (const action of path) { state = apply(state, action); steps++; }
      refreshExploration(state);
      state = apply(state, step.action);
      const resumed = parseSave(JSON.stringify(state));
      assert.equal(resumed.kind, 'loaded', `${state.seed}: generated state and undo history load after ${step.action.type}: ${resumed.message ?? ''}`);
      assert.deepEqual(resumed.state, state, 'save continuation preserves every generated object, reward, discovery, and snapshot');
      state = resumed.state;
      decisions++;
      assert.ok(state.light >= 0 && state.light <= state.maxLight);
    }
    assert.equal(state.status, 'won');
    assert.equal(state.objective.completed, true);
    assert.equal(state.player.roomId, state.entrance.roomId);
    assert.ok(samePoint(state.player, state.entrance) || Math.abs(state.player.x - state.entrance.x) + Math.abs(state.player.y - state.entrance.y) === 1);
    optionalSurvivors += state.hauntings.filter(h => !h.banished).length;
    completed[kind]++;
  }
  assert.ok(optionalSurvivors > 0, 'solutions do not require clearing every haunting');
  context.diagnostic(`12 wins: ${steps} free walking actions and ${decisions} decisions; ${optionalSurvivors} optional hauntings left`);
});

test('a generated replenishment adventure makes the cheapest opening spirit a poor decision, recoverable with undo', () => {
  let state = createGame('scan-65');
  assert.equal(solveHouse(state).status, 'solved');
  const miser = state.hauntings.find(haunting => haunting.id === 'haunt-miser');
  assert.ok(miser);
  const paths = pathsFrom(state);
  const approach = cardinal.map(([dx, dy]) => paths.get(pointKey({ roomId: miser.position.roomId, x: miser.position.x + dx, y: miser.position.y + dy }))).find(Boolean);
  assert.ok(approach, 'the tempting treasure spirit is accessible without another decision');
  for (const action of approach) state = apply(state, action);
  assert.equal(Math.max(1, miser.resistance - state.ritualPower), 1);
  state = apply(state, { type: 'banish', hauntingId: miser.id });
  assert.equal(solveHouse(state).status, 'unsolvable', 'spending the opening light on treasure prevents completion');
  const saved = parseSave(JSON.stringify(state));
  assert.equal(saved.kind, 'loaded', 'a poor resource decision remains a valid save');
  state = apply(saved.state, { type: 'undo' });
  assert.equal(solveHouse(state).status, 'solved', 'undo recovers the original opportunity without rerolling');
});

test('solver distinguishes exact-order solvability, a legitimate resource dead end, and an exhausted budget', () => {
  for (const state of [orderingFixture(), cheapestFirstFixture()]) {
    const before = clone(state);
    assert.equal(solveHouse(state).status, 'solved');
    assert.deepEqual(state, before, 'validation never consumes or discovers anything');
    const exhausted = solveHouse(state, { budget: 0 });
    assert.equal(exhausted.status, 'exhausted');
    assert.equal(exhausted.explored, 0);
    assert.deepEqual(exhausted.solution, []);
    const limited = solveHouse(state, { budget: 1 });
    assert.equal(limited.status, 'exhausted');
    assert.ok(limited.explored <= 1);
  }
  let wrongOrder = orderingFixture();
  wrongOrder = apply(wrongOrder, { type: 'refill', candleId: 'three-light-candle' });
  wrongOrder = apply(wrongOrder, { type: 'banish', hauntingId: 'lesser' });
  assert.equal(solveHouse(wrongOrder).status, 'unsolvable');
  let cheapest = cheapestFirstFixture();
  cheapest = apply(cheapest, { type: 'banish', hauntingId: 'treasure' });
  assert.equal(solveHouse(cheapest).status, 'unsolvable');
  cheapest = apply(cheapest, { type: 'undo' });
  assert.equal(solveHouse(cheapest).status, 'solved');
});

test('bounded generation has a reproducible, independently validated fallback even when search attempts exhaust', () => {
  const seed = 'forced-resource-fallback';
  const forced = createGame(seed, { forceFallback: true });
  assert.equal(forced.seed, seed);
  assert.deepEqual(validateHouse(forced), []);
  assert.deepEqual(createGame(seed, { forceFallback: true }), forced);
  assert.deepEqual(createGame(seed, { attempts: 0 }), forced);
  const exhausted = createGame(seed, { attempts: 1, solverBudget: 0 });
  assert.deepEqual(exhausted, forced);
  assert.equal(solveHouse(forced).status, 'solved');
});

test('final validation rejects broken physical connections, inaccessible rewards, and exhausted resource supplies', () => {
  const initial = createGame('resource-mutant-checks');
  const brokenStairs = clone(initial);
  const stairs = brokenStairs.connections.find(c => c.kind === 'stairs');
  const room = brokenStairs.rooms.find(r => r.id === stairs.b.roomId);
  room.tiles[stairs.b.y * room.width + stairs.b.x] = { kind: 'floor' };
  assert.ok(validateHouse(brokenStairs).length > 0);

  const starved = clone(initial);
  starved.light = 0;
  starved.candles.forEach(c => { c.used = true; });
  assert.notEqual(solveHouse(starved).status, 'solved');
  assert.ok(validateHouse(starved).length > 0);

  const sealed = clone(initial);
  const objectiveItem = sealed.objective.kind === 'escape' ? 'exit-key' : sealed.objective.kind;
  const targetHaunting = sealed.hauntings.find(h => h.reward.item === objectiveItem);
  const targetContainer = sealed.rooms.flatMap(r => r.containers.map(c => ({ ...c, roomId: r.id }))).find(c => c.reward.item === objectiveItem);
  const target = targetHaunting?.position ?? { roomId: targetContainer.roomId, x: targetContainer.x, y: targetContainer.y };
  const targetRoom = sealed.rooms.find(r => r.id === target.roomId);
  for (const [dx, dy] of cardinal) {
    const x = target.x + dx, y = target.y + dy;
    if (x >= 0 && y >= 0 && x < targetRoom.width && y < targetRoom.height) targetRoom.tiles[y * targetRoom.width + x] = { kind: 'wall' };
  }
  assert.ok(validateHouse(sealed).length > 0, 'a connected room graph cannot rescue a physically sealed reward');
});

test('declared spirit guards physically deny interaction or passage access until banished', () => {
  let checked = 0;
  for (let number = 0; number < 8; number++) {
    const house = createGame(`guard-geometry-${number}`);
    for (const guard of house.hauntings.filter(h => h.guards?.length)) {
      const state = clone(house);
      state.connections.forEach(c => { c.opened = true; });
      state.hauntings.forEach(h => { h.banished = h.id !== guard.id; });
      const before = pathsFrom(state, state.entrance);
      state.hauntings.find(h => h.id === guard.id).banished = true;
      const after = pathsFrom(state, state.entrance);
      for (const id of guard.guards) {
        const candle = state.candles.find(c => c.id === id);
        const container = state.rooms.flatMap(r => r.containers.map(c => ({ ...c, roomId: r.id }))).find(c => c.id === id);
        const connection = state.connections.find(c => c.id === id);
        const target = candle?.position ?? (container && { roomId: container.roomId, x: container.x, y: container.y });
        if (target) {
          assert.equal(canInteract(before, target), false, `${guard.name} must block ${id}`);
          assert.equal(canInteract(after, target), true, `${id} must become accessible`);
        } else {
          assert.ok(connection, `guard references an actual object or connection: ${id}`);
          assert.ok([connection.a, connection.b].some(p => !before.has(pointKey(p)) && after.has(pointKey(p))), `${guard.name} must physically open ${id}`);
        }
        checked++;
      }
    }
  }
  assert.ok(checked >= 8, 'generated puzzles exercise physical guard placement');
});
