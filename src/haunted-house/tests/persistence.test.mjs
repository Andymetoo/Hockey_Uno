import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../generation.ts';
import { act, interactions } from '../game.ts';
import { loadGame, saveGame, newSeed, parseSave, SAVE_KEY } from '../persistence.ts';

function memoryStorage() {
  const data = new Map([['other-game', 'keep me']]);
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('exact save continuation preserves every field and subsequent seeded outcomes', () => {
  const storage = memoryStorage();
  let original = createGame('a-persistent-house');
  const directions = ['north', 'east', 'south', 'west'];
  for (let turn = 0; turn < 120; turn++) {
    const nearby = interactions(original).find(i => i.available && i.action.type !== 'leave');
    const action = nearby && turn % 3 === 0 ? nearby.action : turn % 7 === 0 ? { type: 'wait' } : { type: 'move', direction: directions[Math.floor(turn / 3) % 4] };
    assert.equal(saveGame(original, storage).ok, true);
    const loaded = loadGame(storage);
    assert.equal(loaded.kind, 'loaded', loaded.message);
    assert.deepEqual(loaded.state, original);
    const next = act(original, action);
    assert.deepEqual(act(loaded.state, action), next);
    original = next.state;
    if (original.status !== 'active') break;
  }
  assert.equal(storage.data.get('other-game'), 'keep me');
  assert.deepEqual([...storage.data.keys()].sort(), ['other-game', SAVE_KEY].sort());
});

test('empty, corrupt, incompatible and structurally invalid saves are never overwritten on load', () => {
  const storage = memoryStorage();
  assert.equal(loadGame(storage).kind, 'empty');
  const state = createGame('bad-save-examples');
  for (const raw of ['{bad', 'null', '[]', JSON.stringify({ ...state, version: 900 }), JSON.stringify({ ...state, player: { roomId: 'missing', x: 2, y: 2 } }), JSON.stringify({ ...state, matches: -1 }), JSON.stringify({ ...state, rooms: [] }), JSON.stringify({ ...state, rng: null })]) {
    storage.setItem(SAVE_KEY, raw);
    const result = loadGame(storage);
    assert.equal(result.kind, 'error');
    assert.equal(result.raw, raw);
    assert.equal(storage.getItem(SAVE_KEY), raw);
  }
});

test('malformed nested data and inconsistent connections are rejected without throwing', () => {
  for (const mutate of [
    s => { s.rooms[0].tiles[0] = null; },
    s => { s.rooms[0].discovered = []; },
    s => { s.connections[0].b.roomId = 'absent'; },
    s => { s.connections[0].a.x = -1; },
    s => { s.connections[0].kind = 'teleport'; },
    s => { s.inventory.push('imaginary'); },
    s => { s.objective = null; },
    s => { s.evidence = [null]; },
    s => { s.rooms[0].containers = [null]; },
  ]) {
    const state = createGame('malformed-nested');
    mutate(state);
    assert.equal(parseSave(JSON.stringify(state)).kind, 'error');
  }
});

test('storage exceptions and silent write failures report failure truthfully', () => {
  const state = createGame('quota-house');
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.equal(loadGame(denied).kind, 'error');
  assert.equal(saveGame(state, denied).ok, false);
  const silent = { getItem: () => null, setItem() {} };
  assert.equal(saveGame(state, silent).ok, false);
});

test('same seed restarts the exact initial house; new seeds produce other houses', () => {
  const seed = newSeed();
  const initial = createGame(seed);
  const played = act(initial, { type: 'wait' }).state;
  assert.notEqual(played.turn, initial.turn);
  assert.deepEqual(createGame(seed), initial);
  const fresh = newSeed();
  assert.notEqual(seed, fresh);
  assert.notDeepEqual(createGame(fresh), initial);
});
