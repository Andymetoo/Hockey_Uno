import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, CONFIG_FIELDS, normalizeConfig } from '../config.mjs';
import { createGame } from '../state.mjs';
import { dispatch, availableCrew } from '../rules.mjs';
import { SAVE_KEY, loadSession, saveSession, loadDevPreferences, saveDevPreferences } from '../persistence.mjs';
import { fighter } from './fixtures.mjs';

const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const sessionFor = state => ({ version: 1, presentationVersion: 2, state, view: structuredClone(state), pending: [], log: [], current: null, speed: 'manual', presenting: false });

const V2_DEFAULTS = {
  v2CrewCycleTurns: 10,
  v2MissionEnemy: 15, v2MissionResource: 20, v2MissionTime: 10,
  v2TimePerProgress: 4, v2OutboundLength: 8, v2ReturnLength: 3,
  v2RepairTime: 6, v2FireTime: 6, v2MedicalTime: 6,
  v2AssistedRepairTime: 4, v2AssistedFireTime: 4, v2AssistedMedicalTime: 4,
  v2Bf109Engagement: 5, v2Bf110Engagement: 5, v2Fw190Engagement: 5, v2Me262Engagement: 5,
  v2EngagementMode: 'any-action',
};

test('V1 remains the explicit default and every V2 default is independent and represented in Dev settings', () => {
  const v1 = createGame({}, 'ruleset-defaults'), v2 = createGame({}, 'ruleset-defaults', 'v2-continuous');
  assert.equal(v1.ruleset, 'v1');
  assert.equal(v1.phase, 'ready');
  assert.equal(v2.ruleset, 'v2-continuous');
  assert.equal(v2.phase, 'select');
  assert.equal(v1.config.outboundLength, 14);
  assert.equal(v1.config.returnLength, 5);
  assert.deepEqual(Object.fromEntries(Object.keys(V2_DEFAULTS).map(key => [key, DEFAULT_CONFIG[key]])), V2_DEFAULTS);
  for (const key of Object.keys(V2_DEFAULTS)) assert.ok(CONFIG_FIELDS.some(field => field.key === key), `${key} appears in Dev settings`);
  assert.equal(v2.bags.mission.tokens.filter(token => token === 'Enemy').length, 15);
  assert.equal(v2.bags.mission.tokens.filter(token => token === 'Resource').length, 20);
  assert.equal(v2.bags.mission.tokens.filter(token => token === 'Time').length, 10);
  assert.equal(v1.bags.mission.tokens.filter(token => token === 'Time').length, 0);
  assert.equal(v2.config.maxFighters, 3);
  assert.deepEqual(CONFIG_FIELDS.find(field => field.key === 'v2EngagementMode').options.map(option => option.value), ['any-action', 'attack-pass-only']);
});

test('V2 Dev settings normalize and persist independently of V1 mission and work values', () => {
  const storage = memoryStorage();
  const overrides = { preferredRuleset: 'v2-continuous', v2MissionEnemy: 4, v2MissionResource: 33, v2MissionTime: 7,
    v2TimePerProgress: 3, v2OutboundLength: 9, v2ReturnLength: 2, v2RepairTime: 8, v2FireTime: 9, v2MedicalTime: 10,
    v2AssistedRepairTime: 2, v2AssistedFireTime: 3, v2AssistedMedicalTime: 5,
    v2Bf109Engagement: 2, v2Bf110Engagement: 3, v2Fw190Engagement: 4, v2Me262Engagement: 7,
    v2EngagementMode: 'attack-pass-only' };
  assert.equal(saveDevPreferences(overrides, storage), true);
  const restored = loadDevPreferences(storage);
  assert.deepEqual(Object.fromEntries(Object.keys(overrides).map(key => [key, restored[key]])), overrides);
  assert.equal(restored.outboundLength, 14);
  assert.equal(restored.returnLength, 5);
  for (const key of ['repairDuration', 'fireDuration', 'medicalDuration']) assert.equal(restored[key], 2);
  const next = createGame(restored);
  assert.equal(next.ruleset, 'v2-continuous');
  assert.equal(next.bags.mission.tokens.length, 44);
});

test('V2 Crew Cycle remains exactly ten Turns and configurations must include enough physical Time to reach Progress', () => {
  assert.equal(normalizeConfig({ v2CrewCycleTurns: 3 }).v2CrewCycleTurns, 10);
  assert.equal(normalizeConfig({ v2CrewCycleTurns: 20 }).v2CrewCycleTurns, 10);
  assert.throws(() => createGame({ v2MissionTime: 3, v2TimePerProgress: 4 }, 'starvation', 'v2-continuous'));
  assert.doesNotThrow(() => createGame({ v2MissionTime: 4, v2TimePerProgress: 4 }, 'enough-time', 'v2-continuous'));
  assert.doesNotThrow(() => createGame({ v2MissionTime: 3, v2TimePerProgress: 4 }, 'v1-unchanged', 'v1'));
});

test('saves lacking a ruleset identifier migrate every snapshot to V1 without changing their live state', () => {
  const storage = memoryStorage();
  let state = dispatch(createGame({ missionEnemy: 0, missionResource: 40 }), { type: 'startRound' }).state;
  state = dispatch(state, { type: 'activate', crewId: 'radio' }).state;
  state.cells['B2-4'] = 'damaged';
  state = dispatch(state, { type: 'action', action: 'repair', cells: ['B2-4'] }).state;
  delete state.ruleset;
  state.config.preferredRuleset = 'v2-continuous';
  const session = sessionFor(state);
  session.pending = [{ type: 'WORK_STARTED', state: structuredClone(state) }];
  saveSession(session, storage);
  saveDevPreferences({ preferredRuleset: 'v2-continuous' }, storage);
  const bytes = storage.getItem(SAVE_KEY), loaded = loadSession(storage);
  assert.equal(storage.getItem(SAVE_KEY), bytes);
  for (const snapshot of [loaded.state, loaded.view, ...loaded.pending.map(event => event.state)]) {
    assert.equal(snapshot.ruleset, 'v1');
    const { ruleset, ...rest } = snapshot;
    assert.deepEqual(rest, state, 'migration adds only identity; it never recalculates active clocks/bags/crew');
  }
  assert.equal(loaded.state.jobs[0].completeRound, 3);
  assert.equal('remainingTime' in loaded.state.jobs[0], false);
});

test('preference changes cannot convert an active V1 sortie, including when resuming or dispatching its next action', () => {
  const storage = memoryStorage();
  const state = dispatch(createGame({ missionEnemy: 0, missionResource: 40 }), { type: 'startRound' }).state;
  const session = sessionFor(state);
  saveSession(session, storage);
  saveDevPreferences({ preferredRuleset: 'v2-continuous', v2TimePerProgress: 1, v2RepairTime: 1 }, storage);
  const loaded = loadSession(storage);
  assert.deepEqual(loaded, session);
  assert.equal(createGame(loadDevPreferences(storage)).ruleset, 'v2-continuous');
  assert.throws(() => dispatch(loaded.state, { type: 'changeRuleset', ruleset: 'v2-continuous' }));
  const next = dispatch(loaded.state, { type: 'activate', crewId: 'pilot' });
  assert.equal(next.state.ruleset, 'v1');
  assert.equal(next.state.round, 1);
  assert.equal('time' in next.state, false);
});

test('V1 save/resume preserves pending presentation, RNG, N+2 jobs and the next deterministic rule result', () => {
  const storage = memoryStorage();
  let state = dispatch(createGame({ missionEnemy: 0, missionResource: 40 }), { type: 'startRound' }).state;
  state = dispatch(state, { type: 'activate', crewId: 'radio' }).state;
  state.cells['B2-4'] = 'damaged';
  const work = dispatch(state, { type: 'action', action: 'repair', cells: ['B2-4'] });
  const session = sessionFor(work.state);
  session.view = work.events[0].state;
  session.pending = work.events.slice(1);
  session.presenting = true;
  saveSession(session, storage);
  const loaded = loadSession(storage);
  assert.deepEqual(loaded, session);
  const next = { type: 'activate', crewId: availableCrew(work.state)[0].id };
  assert.deepEqual(dispatch(loaded.state, next), dispatch(work.state, next));
});

test('V2 save/resume preserves pending Progress, exact jobs/fighter clocks, consumed slots and every presentation snapshot', () => {
  const storage = memoryStorage();
  const state = createGame({ opportunityEnabled: false }, 'v2-save', 'v2-continuous');
  state.time = 4; state.timeTokens = ['Time', 'Time', 'Time', 'Time']; state.pendingProgress = true;
  state.bags.mission.tokens.splice(state.bags.mission.tokens.indexOf('Time'), 4);
  state.crewCycle = { number: 3, turn: 7 };
  state.slot = 7; state.phase = 'action'; state.activeCrew = 'pilot';
  for (const crew of state.crew.slice(0, 7)) { crew.cycleSlotConsumed = true; crew.used = true; }
  state.jobs = [{ id: 'repair-save', kind: 'repair', crewId: 'radio', assistantId: 'engineer', cells: ['B2-4'], remainingTime: 3 }];
  state.cells['B2-4'] = 'damaged';
  for (const id of ['radio', 'engineer']) state.crew.find(crew => crew.id === id).job = 'repair-save';
  state.fighters = [fighter('f1', { engagementRemaining: 2, facing: 180, disrupted: true })];
  const session = sessionFor(state);
  session.view.time = 3; session.view.timeTokens.pop(); session.view.pendingProgress = false;
  session.pending = [{ type: 'TIME_GAINED', state: structuredClone(state) }];
  session.log = [{ type: 'MISSION_TOKEN_DRAWN', token: 'Time', sequence: 1 }];
  session.presenting = true;
  saveSession(session, storage);
  saveDevPreferences({ preferredRuleset: 'v1', v2RepairTime: 20, v2Bf109Engagement: 20, v2TimePerProgress: 1 }, storage);
  const loaded = loadSession(storage);
  assert.deepEqual(loaded, session);
  const command = { type: 'action', action: 'wait' };
  assert.deepEqual(dispatch(loaded.state, command), dispatch(state, command));
  assert.equal(dispatch(loaded.state, command).state.mission.position, 1);
});

test('V2 incomplete clock saves are rejected instead of silently inferring timers', () => {
  const storage = memoryStorage();
  for (const key of ['crewCycle', 'time', 'timeTokens', 'pendingProgress']) {
    const session = sessionFor(createGame({}, 'invalid-clock', 'v2-continuous'));
    delete session.state[key];
    saveSession(session, storage);
    assert.equal(loadSession(storage), null, key);
  }
  for (const key of ['remainingTime', 'engagementRemaining']) {
    const state = createGame({}, 'invalid-timer', 'v2-continuous');
    if (key === 'remainingTime') state.jobs = [{ id: 'job', kind: 'repair', crewId: 'radio', cells: ['B2-4'] }];
    else state.fighters = [fighter()];
    saveSession(sessionFor(state), storage);
    assert.equal(loadSession(storage), null, key);
  }
});

test('unknown or mixed ruleset identifiers are rejected in resolved, visible and queued snapshots', () => {
  const storage = memoryStorage();
  for (const location of ['state', 'view', 'pending']) for (const identity of ['future-v9', null, 'v2-continuous']) {
    const session = sessionFor(createGame());
    session.pending = [{ type: 'CREW_ACTIVATED', state: structuredClone(session.state) }];
    (location === 'pending' ? session.pending[0].state : session[location]).ruleset = identity;
    saveSession(session, storage);
    assert.equal(loadSession(storage), null, `${location} / ${identity}`);
  }
});
