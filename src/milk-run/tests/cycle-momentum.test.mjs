import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { dispatch } from '../rules.mjs';
import { createCampaign, createCampaignStore, prepareCampaignSortie } from '../campaign.mjs';
import { loadDevPreferences, saveDevPreferences, resetDevPreferencesScope, saveSession, loadSession } from '../persistence.mjs';
import { describeEvent } from '../presentation.mjs';

const storage = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) }; };
test('new V2 and Campaign sorties default cycle Time ON; experimental OFF and Reset V2 remain available', () => {
  assert.equal(createGame({}, 'new', 'v2-continuous').config.v2CrewCycleRefreshGrantsTime, true);
  const c = createCampaign(createCampaignStore());
  assert.equal(prepareCampaignSortie(c.store, c.campaign.id, createGame({}, 'new', 'v2-continuous'), { aircraftId: c.campaign.currentAircraftId }).state.config.v2CrewCycleRefreshGrantsTime, true);
  const store = storage(); saveDevPreferences({ v2CrewCycleRefreshGrantsTime: false }, store);
  assert.equal(loadDevPreferences(store).v2CrewCycleRefreshGrantsTime, false);
  resetDevPreferencesScope('v2', store); assert.equal(loadDevPreferences(store).v2CrewCycleRefreshGrantsTime, true);
});
for (const value of [false, true, undefined]) test(`saved cycle Time ${value} retains historical behavior in resolved, visible and pending snapshots`, () => {
  const state = createGame({}, 'saved', 'v2-continuous');
  if (value === undefined) delete state.config.v2CrewCycleRefreshGrantsTime; else state.config.v2CrewCycleRefreshGrantsTime = value;
  const session = { version: 1, state, view: structuredClone(state), pending: [{ type: 'CREW_SELECTION_READY', state: structuredClone(state) }], log: [] };
  const store = storage(); saveSession(session, store); const loaded = loadSession(store);
  for (const s of [loaded.state, loaded.view, ...loaded.pending.map(e => e.state)]) {
    assert.deepEqual(s, { ...state, config: { ...state.config, v2CrewCycleRefreshGrantsTime: value ?? false } });
  }
});
for (const mode of ['normal', 'full', 'pending', 'empty', 'overflow-occupied']) test(`completed cycle ${mode}: exact physical reward, once-only jobs, conservation and concise presentation`, () => {
  const state = createGame({ opportunityEnabled: false }, 'cycle-complete', 'v2-continuous');
  state.phase = 'action'; state.activeCrew = 'pilot'; state.crewCycle.turn = 9; state.slot = 10;
  state.crew.forEach(c => { c.cycleSlotConsumed = true; c.used = true; });
  state.jobs = [{ id: 'job', kind: 'repair', crewId: 'radio', remainingTime: 4, cells: ['B2-4'] }];
  state.crew.find(c => c.id === 'radio').job = 'job';
  if (['full', 'pending', 'overflow-occupied'].includes(mode)) {
    state.time = 4; state.timeTokens = Array(4).fill('Time');
    for (let i = 0; i < 4; i++) state.bags.mission.tokens.splice(state.bags.mission.tokens.indexOf('Time'), 1);
    state.pendingProgress = mode !== 'full';
  }
  if (mode === 'overflow-occupied') { state.overflowTimeTokens.push('Time'); state.bags.mission.tokens.splice(state.bags.mission.tokens.indexOf('Time'), 1); }
  if (mode === 'empty') { state.bags.mission.discard.push(...state.bags.mission.tokens.filter(t => t === 'Time')); state.bags.mission.tokens = state.bags.mission.tokens.filter(t => t !== 'Time'); }
  const count = s => [...s.bags.mission.tokens, ...s.bags.mission.discard, ...s.timeTokens, ...s.overflowTimeTokens].filter(t => t === 'Time').length;
  const total = count(state), reward = !['empty', 'overflow-occupied'].includes(mode);
  const result = dispatch(state, { type: 'action', action: 'wait' });
  assert.equal(count(result.state), total); assert.equal(result.state.crewCycle.number, 2);
  assert.equal(result.events.filter(e => e.type === 'CREW_CYCLE_TIME_TAKEN').length, reward ? 1 : 0);
  assert.equal(result.events.filter(e => e.type === 'WORK_TIME_ADVANCED').length, reward ? 1 : 0);
  assert.equal(result.state.jobs[0].remainingTime, reward ? 3 : 4);
  if (reward) {
    const event = result.events.find(e => e.type === 'CREW_CYCLE_TIME_TAKEN'), d = describeEvent(event);
    assert.equal(d.major, true); assert.equal(d.category, 'time'); assert.match(d.title, /CREW CYCLE COMPLETE · \+1 TIME/);
    assert.equal(result.state.time, 1); assert.equal(event.state.bags.mission.tokens.length, state.bags.mission.tokens.length - 1);
  }
});
