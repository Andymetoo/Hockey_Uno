import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { availableCrew, dispatch } from '../rules.mjs';
import { saveSession, loadSession } from '../persistence.mjs';
import { v2TelemetryRows } from '../telemetry.mjs';
import { rngForIndexes, commitTestBombRun } from './fixtures.mjs';

const fresh = overrides => createGame({ v2StoryMode: false, opportunityEnabled: false, v2MissionEnemy: 10, v2MissionResource: 80, v2MissionTime: 40, ...overrides }, 'telemetry-controls', 'v2-continuous');
function activate(state, token = 'Time', crewId = availableCrew(state)[0].id) {
  const pool = state.bags.mission.tokens.length ? state.bags.mission.tokens : state.bags.mission.discard;
  const index = pool.indexOf(token); assert.ok(index >= 0);
  state.rng = rngForIndexes([pool.length], [index]);
  return dispatch(state, { type: 'activate', crewId }).state;
}
const act = (state, action = 'wait', extra = {}) => dispatch(state, { type: 'action', action, ...extra });
const step = state => act(activate(state)).state;
const member = (state, id) => state.crew.find(c => c.id === id);

test('V2 full 8/3 mission records Turns, cycles, Time by leg, checkpoints and average Progress', () => {
  let state = fresh({ v2MissionEnemy: 0, v2MissionResource: 0, v2MissionTime: 4 });
  while (state.phase !== 'ended') {
    state = state.phase === 'bombing' ? commitTestBombRun(state).state : step(state);
  }
  assert.equal(state.outcome, 'success');
  assert.equal(state.stats.turns, 41);
  assert.equal(state.crewCycle.number - 1, 4);
  assert.equal(state.telemetry.timeTokensDrawn, 44);
  assert.equal(state.telemetry.outboundTime, 32);
  assert.equal(state.telemetry.returnTime, 12);
  assert.equal(state.telemetry.progressCheckpoints, 11);
  assert.equal(state.telemetry.completeHistory, true);
  const rows = Object.fromEntries(v2TelemetryRows(state).map(row => [row.label, row.value]));
  assert.equal(rows['Average Turns per Progress'], '3.73');
  assert.equal(rows['Altitude lost'], 0);
  assert.equal(rows['Average fighter actions completed'], '—');
});

for (const mode of ['any-action', 'attack-pass-only']) test(`V2 telemetry separates actual actions and Engagement countdown in ${mode}`, () => {
  let state = fresh({ v2EngagementMode: mode, spawnFacing: 90, v2Bf109Engagement: 1 });
  state.deck = { cards: ['BF-109'], discard: [] };
  state = activate(state, 'Enemy', 'pilot');
  assert.equal(state.telemetry.fightersSpawned, 1);
  const result = act(state); state = result.state;
  assert.equal(state.telemetry.fighterActionsCompleted, 1);
  assert.equal(state.telemetry.engagementActionsSpent, mode === 'any-action' ? 1 : 0);
  assert.equal(state.telemetry.fightersDisengaged, mode === 'any-action' ? 1 : 0);
  assert.equal(state.telemetry.fightersDestroyed, 0);
  assert.equal(state.stats.fightersKilled, 0);
  if (mode === 'any-action') {
    const breaking = result.events.find(e => e.type === 'FIGHTER_BREAKING_OFF');
    assert.equal(breaking.state.fighters.length, 1);
    assert.equal(breaking.state.fighters[0].engagementRemaining, 0);
    assert.equal(state.fighters.length, 0);
  }
  assert.equal(v2TelemetryRows(state).find(row => row.label === 'Average fighter actions completed').value, '1.00');
});

test('V2 gunfire kill instrumentation records destruction separately from natural disengagement', () => {
  let state = fresh({ combatHit: 0, combatBurst: 1, combatMiss: 0 });
  state.deck = { cards: ['BF-109'], discard: [] };
  state = activate(state, 'Enemy', 'engineer');
  Object.assign(state.fighters[0], { quadrant: 'Fore', altitude: 'High' });
  const result = act(state, 'basicFire', { targetId: state.fighters[0].id });
  assert.equal(result.state.telemetry.fightersDestroyed, 1);
  assert.equal(result.state.telemetry.fightersDisengaged, 0);
  assert.equal(result.state.telemetry.fighterActionsCompleted, 0);
  assert.equal(result.state.stats.fightersKilled, 1);
});

for (const kind of ['Repair', 'Fire', 'Medical']) for (const assisted of [false, true]) test(`configured V2 ${assisted ? 'assisted ' : ''}${kind} Time controls actual jobs and telemetry`, () => {
  const key = `v2${assisted ? 'Assisted' : ''}${kind}Time`;
  let state = fresh({ [key]: 2, v2TimePerProgress: 40 });
  const action = { Repair: 'repair', Fire: 'fireControl', Medical: 'medical' }[kind];
  state.cells['B2-4'] = kind === 'Fire' ? 'fire' : 'damaged';
  if (kind === 'Medical') member(state, 'pilot').health = 'injured';
  const target = kind === 'Medical' ? { targetId: 'pilot' } : { cells: ['B2-4'] };
  state = act(activate(state, 'Resource', 'radio'), action, { ...target, ...(assisted ? { assistantId: 'engineer' } : {}) }).state;
  assert.equal(state.jobs[0].remainingTime, 2);
  assert.equal(state.telemetry.jobsBegun, 1);
  assert.equal(state.telemetry.assistedJobs, assisted ? 1 : 0);
  assert.equal(state.telemetry.jobsCompleted, 0);
  state = step(state); assert.equal(state.jobs[0].remainingTime, 1);
  state = step(state);
  assert.equal(state.jobs.length, 0);
  assert.equal(state.telemetry.jobsCompleted, 1);
});

for (const refill of [false, true]) test(`V2 normal refill ${refill ? 'ON' : 'OFF'} preserves Time return and emergency refill`, () => {
  let state = fresh({ v2RefillAtProgress: refill, v2TimePerProgress: 1 });
  state.bags.mission = { tokens: ['Time'], discard: ['Resource'] };
  state.bags.combat = { tokens: ['Hit'], discard: ['Burst'] };
  const result = act(activate(state)); state = result.state;
  assert.equal(state.time, 0);
  assert.deepEqual(state.timeTokens, []);
  assert.equal(state.bags.mission.tokens.filter(t => t === 'Time').length, 1);
  assert.equal(state.bags.mission.discard.length, refill ? 0 : 1);
  assert.equal(state.bags.combat.discard.length, refill ? 0 : 1);
  assert.ok(result.events.some(e => e.type === 'PROGRESS_BAGS_REFILLED'));
  if (!refill) {
    state.bags.mission.tokens = [];
    state = activate(state, 'Resource');
    assert.equal(state.bags.mission.discard.length, 0, 'empty-bag fallback still recycles discard');
  }
});

for (const [type, hpKey, engagementKey] of [
  ['BF-109', 'bf109Hp', 'v2Bf109Engagement'], ['BF-110', 'bf110Hp', 'v2Bf110Engagement'],
  ['FW-190', 'fw190Hp', 'v2Fw190Engagement'], ['Me-262', 'me262Hp', 'v2Me262Engagement'],
]) test(`${type} Common HP and V2 Engagement settings affect newly spawned fighters`, () => {
  const state = fresh({ [hpKey]: 7, [engagementKey]: 8 });
  state.deck = { cards: [type], discard: [] };
  const next = activate(state, 'Enemy');
  assert.equal(next.fighters[0].hp, 7);
  assert.equal(next.fighters[0].maxHp, 7);
  assert.equal(next.fighters[0].engagementRemaining, 8);
});

test('older V2 snapshots resume exactly and mark new telemetry as partial without inventing history', () => {
  let state = step(fresh());
  delete state.telemetry;
  delete state.config.v2RefillAtProgress;
  const session = { version: 1, state, view: structuredClone(state), pending: [], log: [], speed: 'manual' };
  let stored;
  const storage = { setItem(key, value) { stored = value; }, getItem() { return stored; } };
  assert.equal(saveSession(session, storage), true);
  assert.deepEqual(loadSession(storage), session);
  state = step(state);
  assert.equal(state.telemetry.completeHistory, false);
  assert.equal(state.telemetry.sinceTurn, 1);
  assert.equal(state.telemetry.timeTokensDrawn, 1);
  assert.match(v2TelemetryRows(state)[0].value, /since Turn 1/);
});

test('V1 keeps its original telemetry and ignores the V2 refill preference', () => {
  let state = createGame({ v2RefillAtProgress: false });
  assert.equal(state.telemetry, undefined);
  state.bags.mission.discard = ['Enemy'];
  const before = state.bags.mission.tokens.length;
  state = dispatch(state, { type: 'startRound' }).state;
  assert.equal(state.bags.mission.tokens.length, before + 1);
  assert.equal(state.telemetry, undefined);
  assert.deepEqual(v2TelemetryRows(state), []);
});
