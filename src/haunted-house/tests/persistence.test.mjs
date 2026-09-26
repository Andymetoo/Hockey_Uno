import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from '../game.ts';
import { isGameState, loadGame, saveGame, newSeed, parseSave, SAVE_KEY, LEGACY_KEY } from '../persistence.ts';
import { orderingFixture, cheapestFirstFixture } from './fixtures.mjs';

function memoryStorage() {
  const data = new Map([['unrelated-game', 'untouched']]);
  const reads = [];
  return { data, reads, getItem: key => { reads.push(key); return data.get(key) ?? null; }, setItem: (key, value) => data.set(key, value) };
}
function commit(state, action) { const result = act(state, action); assert.equal(result.committed, true, result.message); return result.state; }

test('complete snapshots and bounded undo history round-trip exactly after every decision and undo', () => {
  const storage = memoryStorage();
  let state = orderingFixture();
  assert.equal(isGameState(state), true);
  for (const action of [
    { type: 'banish', hauntingId: 'lesser' }, { type: 'refill', candleId: 'three-light-candle' },
    { type: 'banish', hauntingId: 'stronger' }, { type: 'move', direction: 'south' },
    { type: 'undo' }, { type: 'undo' }, { type: 'refill', candleId: 'three-light-candle' },
  ]) {
    state = commit(state, action);
    assert.equal(saveGame(state, storage).ok, true);
    const loaded = loadGame(storage);
    assert.equal(loaded.kind, 'loaded', loaded.message);
    assert.deepEqual(loaded.state, state);
    if (state.undo.length) assert.deepEqual(act(loaded.state, { type: 'undo' }), act(state, { type: 'undo' }));
    state = loaded.state;
  }
  assert.equal(storage.data.get('unrelated-game'), 'untouched');
  assert.ok(storage.reads.every(key => [SAVE_KEY, LEGACY_KEY].includes(key)));
});

test('a legitimate resource dead end is a valid save, including zero light and its undo stack', () => {
  let state = orderingFixture();
  state = commit(state, { type: 'refill', candleId: 'three-light-candle' });
  state = commit(state, { type: 'banish', hauntingId: 'lesser' });
  assert.equal(state.light, 3);
  assert.equal(act(state, { type: 'banish', hauntingId: 'stronger' }).committed, false);
  assert.equal(parseSave(JSON.stringify(state)).kind, 'loaded', 'structural validation must not call the resource solver');
  state = orderingFixture();
  state = commit(state, { type: 'banish', hauntingId: 'lesser' });
  state = commit(state, { type: 'refill', candleId: 'three-light-candle' });
  state = commit(state, { type: 'banish', hauntingId: 'stronger' });
  assert.equal(state.light, 0);
  assert.equal(state.status, 'active');
  assert.equal(parseSave(JSON.stringify(state)).kind, 'loaded');
  assert.equal(parseSave(JSON.stringify(cheapestFirstFixture())).kind, 'loaded');
});

test('earlier Haunted House saves remain intact and exportable before and after saving a new adventure', () => {
  const storage = memoryStorage();
  assert.equal(loadGame(storage).kind, 'empty');
  const old = '{"version":1,"seed":"old-house","spirit":{"roomId":"attic"}}';
  storage.setItem(LEGACY_KEY, old);
  const result = loadGame(storage);
  assert.equal(result.kind, 'legacy');
  assert.equal(result.raw, old);
  assert.equal(saveGame(orderingFixture(), storage).ok, true);
  assert.equal(storage.getItem(LEGACY_KEY), old);
  const resumed = loadGame(storage);
  assert.equal(resumed.kind, 'loaded');
  assert.equal(resumed.legacyRaw, old, 'earlier data remains downloadable after a new adventure is saved and reloaded');
  assert.equal(storage.data.get('unrelated-game'), 'untouched');
});

test('corrupt, incompatible and nested-history saves are rejected and never overwritten on load', () => {
  const storage = memoryStorage();
  const state = commit(orderingFixture(), { type: 'banish', hauntingId: 'lesser' });
  for (const mutate of [
    s => { s.version = 900; }, s => { s.player.roomId = 'absent'; }, s => { s.light = -1; },
    s => { s.rooms[0].tiles[0] = null; }, s => { s.rooms[0].containers = [null]; },
    s => { s.candles[0].used = 'yes'; }, s => { s.hauntings[0].resistance = null; },
    s => { s.undo[0].undo = []; }, s => { s.undo[0].seed = 'another-house'; },
    s => { s.undo[0].candles[0].restores = 500; }, s => { s.undo[0].hauntings[0].reward.power = 3; },
    s => { s.undo = Array(100).fill(s.undo[0]); }, s => { s.objective = null; },
  ]) {
    const broken = structuredClone(state); mutate(broken);
    const raw = JSON.stringify(broken); storage.setItem(SAVE_KEY, raw);
    assert.equal(loadGame(storage).kind, 'error', mutate.toString());
    assert.equal(storage.getItem(SAVE_KEY), raw);
  }
  for (const raw of ['{broken', 'null', '[]']) { storage.setItem(SAVE_KEY, raw); assert.equal(loadGame(storage).kind, 'error'); assert.equal(storage.getItem(SAVE_KEY), raw); }
});

test('storage exceptions and silent write failures report failure truthfully', () => {
  const state = orderingFixture();
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.equal(loadGame(denied).kind, 'error'); assert.equal(saveGame(state, denied).ok, false);
  assert.equal(saveGame(state, { getItem: () => null, setItem() {} }).ok, false);
});

test('an optional legacy-read failure does not prevent continuing a valid current save', () => {
  const state = orderingFixture();
  const storage = {
    getItem(key) {
      if (key === SAVE_KEY) return JSON.stringify(state);
      if (key === LEGACY_KEY) throw new Error('legacy data unavailable');
      throw new Error('another game must never be read');
    },
    setItem() { throw new Error('loading must not write'); },
  };
  const loaded = loadGame(storage);
  assert.equal(loaded.kind, 'loaded');
  assert.deepEqual(loaded.state, state);
  assert.equal(loaded.legacyRaw, undefined);
});

test('new house seeds are distinct', () => { assert.notEqual(newSeed(), newSeed()); });
