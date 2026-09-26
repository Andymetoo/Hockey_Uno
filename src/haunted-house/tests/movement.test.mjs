import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from '../game.ts';
import { planRoute } from '../movement.ts';
import { addCandle, addContainer, addHaunting, baseFixture, clone, connectRooms, markTile, position } from './fixtures.mjs';

function follow(state, route) {
  assert.ok(Array.isArray(route), 'expected a known safe route');
  for (const action of route) {
    assert.ok(['move', 'travel'].includes(action.type), 'click routes never include decisions');
    const result = act(state, action);
    assert.equal(result.committed, true, result.message);
    assert.equal(result.consequential, false);
    state = result.state;
  }
  return state;
}

test('destination routes use revealed traversable tiles and avoid a discovered haunting', () => {
  let state = baseFixture();
  addHaunting(state, 'blocker', position(4, 3), 3, { power: 1 });
  const original = clone(state);
  const route = planRoute(state, position(5, 3));
  assert.ok(route.length > 2, 'the direct route is occupied');
  state = follow(state, route);
  assert.deepEqual(state.player, position(5, 3));
  assert.equal(state.light, original.light);
  assert.deepEqual(state.hauntings, original.hauntings);
  assert.equal(state.undo.length, 0);
  assert.equal(planRoute(original, position(4, 3)), null, 'haunting tiles are not destinations');
});

test('routing cannot use undiscovered shortcuts or secretly route through unknown floor', () => {
  const state = baseFixture();
  state.player = position(1, 3);
  for (let y = 1; y <= 5; y++) state.rooms[0].discovered[y * 7 + 3] = false;
  assert.equal(planRoute(state, position(5, 3)), null, 'revealed islands do not reveal a hidden path');
  assert.equal(planRoute(state, position(3, 3)), null);
  state.rooms[0].discovered[2 * 7 + 3] = true;
  const route = planRoute(state, position(5, 3));
  assert.ok(route.length > 4);
  const final = follow(state, route);
  assert.deepEqual(final.player, position(5, 3));
});

test('approaching a candle, object, or spirit stops adjacent and cannot collect or spend', () => {
  for (const kind of ['candle', 'container', 'haunting']) {
    let state = baseFixture();
    state.player = position(1, 1);
    const target = position(4, 4);
    if (kind === 'candle') addCandle(state, 'target', target, 3);
    if (kind === 'container') addContainer(state, 'target', target, { item: 'crowbar' });
    if (kind === 'haunting') addHaunting(state, 'target', target, 3, { power: 1 });
    const before = clone(state);
    state = follow(state, planRoute(state, target, true));
    assert.equal(Math.abs(state.player.x - target.x) + Math.abs(state.player.y - target.y), 1);
    assert.equal(state.light, 4);
    assert.equal(state.ritualPower, 1);
    assert.deepEqual(state.inventory, []);
    assert.equal(state.undo.length, 0);
    assert.deepEqual(state.candles, before.candles);
    assert.deepEqual(state.hauntings, before.hauntings);
    assert.deepEqual(state.rooms[0].containers, before.rooms[0].containers);
  }
});

test('closed gates require an explicit unlock even when their reusable tool is held', () => {
  const state = baseFixture();
  const connection = connectRooms(state, { gate: 'crowbar' });
  state.inventory.push('crowbar');
  assert.equal(planRoute(state, connection.a), null);
  const approached = follow(state, planRoute(state, connection.a, true));
  assert.equal(approached.connections[0].opened, false);
  const unlocked = act(approached, { type: 'unlock', connectionId: connection.id }).state;
  const crossed = follow(unlocked, planRoute(unlocked, connection.a));
  assert.deepEqual(crossed.player, connection.b);
});

test('ordinary doorways and stairs support convenient bidirectional travel without resource effects', () => {
  for (const kind of ['door', 'stairs']) {
    const state = baseFixture();
    const connection = connectRooms(state, { kind });
    const crossed = follow(state, planRoute(state, connection.a));
    assert.deepEqual(crossed.player, connection.b);
    const returned = follow(crossed, planRoute(crossed, connection.b));
    assert.deepEqual(returned.player, connection.a);
    assert.equal(returned.light, 4);
    assert.equal(returned.decisions, 0);
  }
});

test('a route can be replaced from its current tile, and movement reports newly discovered choices', () => {
  const state = baseFixture();
  state.player = position(1, 3);
  state.rooms[0].discovered.fill(true);
  addCandle(state, 'new-choice', position(4, 2), 3);
  state.rooms[0].discovered[2 * 7 + 4] = false;
  const original = planRoute(state, position(5, 3));
  const first = act(state, original[0]);
  const next = act(first.state, original[1]);
  assert.equal(first.discoveredChoice || next.discoveredChoice, true, 'the UI receives a meaningful route-stop signal');
  const replacement = follow(next.state, planRoute(next.state, position(2, 5)));
  assert.deepEqual(replacement.player, position(2, 5));
  assert.equal(replacement.candles[0].used, false);
  assert.equal(replacement.light, 4);
});

test('an open portal cannot be used as an intermediate same-room shortcut', () => {
  const state = baseFixture({ solid: true });
  for (let x = 1; x <= 5; x++) markTile(state, position(x, 3), { kind: 'floor' });
  state.player = position(1, 3);
  connectRooms(state, { a: position(3, 3) });
  assert.equal(planRoute(state, position(5, 3)), null);
});
