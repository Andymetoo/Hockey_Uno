import test from 'node:test';
import assert from 'node:assert/strict';
import { ResolutionQueue } from '../queue.mjs';
import { SAVE_KEY, LEGACY_SAVE_KEY, saveSession, loadSession, hasLegacyBoardSave } from '../persistence.mjs';
import { BOARD_VERSION } from '../board.mjs';

const initial = () => ({ version: 1, boardVersion: BOARD_VERSION, round: 1, phase: 'action', damage: 0, crew: [], config: { animationSpeed: 'normal' }, bags: {}, cells: {}, rng: 42 });
function sequence(state) {
  const hit = { ...state, phase: 'resolving' };
  const damaged = { ...hit, damage: 1 };
  const final = { ...damaged, phase: 'select' };
  return {
    state: final,
    events: [
      { type: 'ENEMY_ATTACK_ROLL', message: 'BF-109 rolls a hit.', state: hit },
      { type: 'AIRCRAFT_SQUARE_DAMAGED', message: 'B1-4 is damaged.', state: damaged },
      { type: 'FIGHTER_ROTATED', message: 'Fighter faces port.', state: final },
    ],
  };
}
const memoryStorage = () => {
  const data = new Map([['another-prototype', 'preserved']]);
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test('presentation reveals each semantic state in order and blocks decisions until it finishes', () => {
  const changes = [];
  const queue = new ResolutionQueue({ state: initial(), dispatch: sequence, onChange: q => changes.push(q.current?.type) });
  try {
    queue.togglePause();
    queue.send({ type: 'action' });
    assert.equal(queue.state.damage, 1, 'rules may calculate future consequences');
    assert.equal(queue.view.damage, 0, 'future damage remains hidden while roll is presented');
    assert.equal(queue.current.type, 'ENEMY_ATTACK_ROLL');
    assert.equal(queue.busy, true);
    assert.throws(() => queue.send({ type: 'activate' }), /finish/i);
    queue.step();
    assert.equal(queue.view.damage, 1);
    assert.equal(queue.current.type, 'AIRCRAFT_SQUARE_DAMAGED');
    assert.equal(queue.log.length, 2);
    queue.step();
    assert.equal(queue.current.type, 'FIGHTER_ROTATED');
    assert.equal(queue.busy, true, 'last visible event still gets its presentation interval');
    queue.step();
    assert.equal(queue.busy, false);
    assert.equal(queue.view.phase, 'select');
    assert.deepEqual(queue.log.map(e => e.type), ['ENEMY_ATTACK_ROLL', 'AIRCRAFT_SQUARE_DAMAGED', 'FIGHTER_ROTATED']);
    assert.deepEqual(queue.log.map(e => e.sequence), [1, 2, 3]);
    assert.ok(queue.log.every(e => !('state' in e)), 'persistent log does not duplicate whole game snapshots');
  } finally { queue.dispose(); }
});

test('skip animation preserves all events and pending autosave resumes at the same cause', () => {
  const storage = memoryStorage();
  const queue = new ResolutionQueue({ state: initial(), dispatch: sequence });
  let restored;
  try {
    queue.togglePause();
    queue.send({ type: 'action' });
    assert.equal(saveSession(queue.export(), storage), true);
    const saved = loadSession(storage);
    assert.equal(saved.view.damage, 0);
    assert.equal(saved.state.damage, 1);
    assert.equal(saved.pending.length, 2);
    restored = new ResolutionQueue({ state: initial(), dispatch: sequence, saved });
    assert.equal(restored.paused, true, 'restored chain waits for deliberate continue');
    assert.equal(restored.current.type, 'ENEMY_ATTACK_ROLL');
    assert.throws(() => restored.send({ type: 'activate' }), /finish/i);
    restored.flush();
    assert.equal(restored.busy, false);
    assert.equal(restored.view.damage, 1);
    assert.deepEqual(restored.log.map(e => e.type), ['ENEMY_ATTACK_ROLL', 'AIRCRAFT_SQUARE_DAMAGED', 'FIGHTER_ROTATED']);
    assert.equal(saveSession(restored.export(), storage), true);
    assert.equal(loadSession(storage).pending.length, 0);
    assert.equal(storage.getItem('another-prototype'), 'preserved');
  } finally { queue.dispose(); restored?.dispose(); }
});

test('save errors and invalid saves are recoverable rather than runtime failures', () => {
  const denied = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.equal(saveSession({ version: 1 }, denied), false);
  assert.equal(loadSession(denied), null);
  const storage = memoryStorage();
  for (const value of ['not json', 'null', '{}', JSON.stringify({ version: 999 })]) {
    storage.setItem(SAVE_KEY, value);
    assert.equal(loadSession(storage), null);
  }
});

test('autosave rejects mixed board geometry while preserving the prior prototype board save unchanged', () => {
  const storage=memoryStorage(), legacy='original approximate-board sortie';
  storage.setItem(LEGACY_SAVE_KEY,legacy);
  assert.equal(hasLegacyBoardSave(storage),true);
  assert.equal(loadSession(storage),null,'legacy geometry is not silently loaded as the corrected board');
  const queue=new ResolutionQueue({state:initial(),dispatch:sequence});
  try {
    queue.togglePause();queue.send({type:'action'});
    const session=queue.export();
    assert.equal(saveSession(session,storage),true);
    assert.ok(loadSession(storage));
    for(const kind of ['state','view','pending']) {
      const invalid=structuredClone(session);
      const snapshot=kind==='pending'?invalid.pending[0].state:invalid[kind];
      snapshot.boardVersion='approximate-board';
      saveSession(invalid,storage);
      assert.equal(loadSession(storage),null,`${kind} must use the authoritative board version`);
    }
    assert.equal(storage.getItem(LEGACY_SAVE_KEY),legacy);
    assert.equal(storage.getItem('another-prototype'),'preserved');
  } finally {queue.dispose();}
});

test('normal presentation uses configured delay, fast uses short delays, and zero delay starts instant', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = initial();state.config.animationMs=500;
  const queue = new ResolutionQueue({ state, dispatch: sequence });
  try {
    queue.send({ type:'action' });
    assert.equal(queue.log.length,1);
    t.mock.timers.tick(499);assert.equal(queue.log.length,1);
    t.mock.timers.tick(1);assert.equal(queue.log.length,2);
    queue.setSpeed('fast');
    t.mock.timers.tick(109);assert.equal(queue.log.length,2);
    t.mock.timers.tick(1);assert.equal(queue.log.length,3);
    queue.setSpeed('instant');t.mock.timers.tick(1);
    assert.equal(queue.busy,false);
    const instantState=initial();instantState.config.animationMs=0;
    const instant=new ResolutionQueue({state:instantState,dispatch:sequence});
    assert.equal(instant.speed,'instant');instant.dispose();
  } finally { queue.dispose(); }
});
