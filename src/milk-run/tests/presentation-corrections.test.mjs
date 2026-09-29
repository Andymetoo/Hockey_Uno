import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { dispatch, resolveAttack } from '../rules.mjs';
import { ResolutionQueue } from '../queue.mjs';
import { describeEvent } from '../presentation.mjs';
import { SAVE_KEY, loadSession, saveSession } from '../persistence.mjs';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};
function stepUntil(queue, type) {
  for (let guard = 0; queue.current?.type !== type && queue.busy && guard < 100; guard++) queue.step();
  assert.equal(queue.current?.type, type);
}

for (const bagName of ['mission', 'combat']) for (const emergency of [false, true]) {
  test(`${bagName} ${emergency ? 'emergency refill' : 'normal draw'} conceals composition until reveal, including save/resume`, () => {
    let state = dispatch(createGame({ missionEnemy: 0 }, 'hidden-token-regression'), { type: 'startRound' }).state;
    if (bagName === 'combat') {
      state = dispatch(state, { type: 'activate', crewId: 'engineer' }).state;
      state.fighters = [{ id: 'fighter-test', type: 'BF-109', hp: 2, maxHp: 2, quadrant: 'Fore', altitude: 'High', facing: 0, heading: 180 }];
    }
    const candidates = bagName === 'mission' ? ['Enemy', 'Resource'] : ['Burst', 'Miss'];
    state.bags[bagName] = emergency ? { tokens: [], discard: candidates } : { tokens: candidates, discard: [] };
    const before = structuredClone(state), storage = memoryStorage();
    let result, restored;
    const queue = new ResolutionQueue({ state, dispatch: (s, command) => (result = dispatch(s, command)) });
    try {
      queue.setSpeed('manual');
      queue.send(bagName === 'mission' ? { type: 'activate', crewId: 'pilot' } : { type: 'action', action: 'basicFire', targetId: 'fighter-test' });
      const drawingType = bagName === 'mission' ? 'MISSION_TOKEN_DRAWING' : 'COMBAT_TOKEN_DRAWING';
      const revealType = bagName === 'mission' ? 'MISSION_TOKEN_DRAWN' : 'GUNNER_SHOT_ROLL';
      stepUntil(queue, drawingType);
      assert.equal(queue.visual.token.back, true);
      assert.equal(queue.visual.token.value, null);
      assert.deepEqual(queue.view.bags[bagName], before.bags[bagName], 'face-down bag and discard cannot disclose which token was removed');
      assert.equal(queue.view.rng, before.rng, 'future random progress is not exposed by the hidden draw snapshot');
      assert.deepEqual(queue.view.resources, before.resources);
      assert.deepEqual(queue.view.fighters, before.fighters, 'fighter HP/spawn remains behind its semantic consequence');
      assert.deepEqual(queue.view.cells, before.cells);
      if (emergency) assert.ok(queue.log.some(event => event.type === `${bagName.toUpperCase()}_BAG_REFILLED`), 'refill bookkeeping is retained in the raw log');
      const expectedReveal = queue.pending.find(event => event.type === revealType);
      assert.ok(expectedReveal);
      assert.equal(saveSession(queue.export(), storage), true);
      const saved = loadSession(storage);
      assert.ok(saved);
      restored = new ResolutionQueue({ state, dispatch, saved });
      assert.equal(restored.paused, true);
      assert.deepEqual(restored.view.bags[bagName], before.bags[bagName], 'autosave preserves the concealed state');
      assert.deepEqual(restored.pending, JSON.parse(JSON.stringify(queue.pending)), 'current saves retain their already-expanded beat sequence');
      restored.step();
      assert.equal(restored.current.type, revealType);
      assert.equal(restored.visual.token.value, expectedReveal.token);
      assert.deepEqual(restored.view, expectedReveal.state, 'reveal restores the exact authoritative semantic snapshot');
      restored.flush();
      assert.deepEqual(restored.view, result.state);
      assert.deepEqual(restored.state, result.state);
      assert.deepEqual(restored.log.map(event => event.type), result.events.map(event => event.type));
      assert.equal(restored.busy, false);
    } finally { queue.dispose(); restored?.dispose(); }
  });
}

function legacyLocationSession() {
  const state = createGame({}, 'legacy-location'); state.round = 1;
  const events = [];
  resolveAttack(state, event => events.push({ ...event, state: structuredClone(state) }), { source: 'BF-109', roll: 4, cellId: 'B2-4' });
  const locationIndex = events.findIndex(event => event.type === 'ENEMY_HIT_LOCATION');
  const log = events.slice(0, locationIndex + 1).map(({ state, ...event }, index) => ({ ...event, round: 1, sequence: index + 1 }));
  return { version: 1, state: structuredClone(state), view: events[locationIndex].state,
    pending: events.slice(locationIndex + 1), current: log.at(-1), log, speed: 'normal' };
}

test('legacy location save inserts one focus beat before damage, then resumes to the exact final state', () => {
  const saved = legacyLocationSession(), storage = memoryStorage();
  storage.setItem(SAVE_KEY, JSON.stringify(saved));
  const queue = new ResolutionQueue({ state: saved.state, dispatch, saved: loadSession(storage) });
  let restored;
  try {
    assert.equal(queue.current.type, 'ENEMY_HIT_LOCATION');
    assert.equal(queue.pending[0].type, 'ENEMY_LOCATION_FOCUS');
    assert.equal(queue.pending.filter(event => event.type === 'ENEMY_LOCATION_FOCUS').length, 1);
    assert.equal(queue.view.cells['B2-4'], 'healthy');
    queue.step();
    assert.equal(queue.current.type, 'ENEMY_LOCATION_FOCUS');
    assert.equal(queue.visual.focusCell, 'B2-4');
    assert.equal(queue.view.cells['B2-4'], 'healthy', 'focus must not include its forthcoming damage');
    assert.equal(queue.log.length, saved.log.length, 'synthetic focus is not a fabricated rules event');
    restored = new ResolutionQueue({ state: saved.state, dispatch, saved: structuredClone(queue.export()) });
    assert.equal(restored.pending.some(event => event.type === 'ENEMY_LOCATION_FOCUS'), false, 'resaving the upgraded queue must not replay the focus');
    restored.step();
    assert.equal(restored.current.type, 'AIRCRAFT_SQUARE_DAMAGED');
    assert.equal(restored.view.cells['B2-4'], 'damaged');
    restored.flush();
    assert.deepEqual(restored.state, saved.state);
    assert.deepEqual(restored.view, saved.state);
    assert.deepEqual(restored.log.map(event => event.type), [...saved.log, ...saved.pending].map(event => event.type));
  } finally { queue.dispose(); restored?.dispose(); }
});

test('current-format save at hit location keeps its existing focus exactly once', () => {
  const saved = legacyLocationSession();
  const upgraded = new ResolutionQueue({ state: saved.state, dispatch, saved });
  let restored;
  try {
    const currentFormat = structuredClone(upgraded.export());
    restored = new ResolutionQueue({ state: saved.state, dispatch, saved: currentFormat });
    assert.deepEqual(restored.pending, currentFormat.pending);
    assert.equal(restored.pending.filter(event => event.type === 'ENEMY_LOCATION_FOCUS').length, 1);
    restored.step();
    assert.equal(restored.current.type, 'ENEMY_LOCATION_FOCUS');
    assert.equal(restored.view.cells['B2-4'], 'healthy');
  } finally { upgraded.dispose(); restored?.dispose(); }
});

test('completed activation drains to the Opportunity decision without dispatching the enemy phase', () => {
  const state = createGame(), complete = structuredClone(state), window = structuredClone(state);
  complete.crew[0].used = true; window.crew[0].used = true; window.phase = 'opportunity';
  const commands = [];
  const queue = new ResolutionQueue({ state, dispatch: (input, command) => {
    commands.push(command);
    return { state: window, events: [
      { type: 'CREW_ACTION', crewId: 'pilot', message: 'Pilot acts.', state: input },
      { type: 'ACTIVATION_COMPLETED', crewId: 'pilot', message: 'Pilot is used.', state: complete },
      { type: 'OPPORTUNITY_WINDOW_OPENED', message: 'Fire or continue to enemies.', state: window },
    ] };
  } });
  try {
    queue.setSpeed('manual'); queue.send({ type: 'action', action: 'wait' });
    assert.equal(queue.busy, true);
    queue.step();
    assert.equal(queue.busy, false);
    assert.equal(queue.view.phase, 'opportunity');
    assert.equal(queue.log.at(-1).type, 'OPPORTUNITY_WINDOW_OPENED');
    assert.equal(commands.length, 1, 'only the player may continue the enemy phase');
    for (const type of ['ACTIVATION_COMPLETED', 'OPPORTUNITY_WINDOW_OPENED']) assert.equal(describeEvent({ type }).major, false);
    assert.equal(describeEvent({ type: 'OPPORTUNITY_WINDOW_OPENED' }).category, 'crew');
  } finally { queue.dispose(); }
});
