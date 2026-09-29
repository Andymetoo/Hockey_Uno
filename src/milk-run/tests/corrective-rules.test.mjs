import test from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS } from '../board.mjs';
import { dispatch, availableCrew, availableActions, isAtStation, resolveAltitude, opportunityAvailability, eligibleMedicalTargets } from '../rules.mjs';
import { fresh, activated, fighter, collect } from './fixtures.mjs';
import { createGame } from '../state.mjs';
import { SAVE_KEY, loadSession, saveSession } from '../persistence.mjs';

const member = (s, id) => s.crew.find(c => c.id === id);
const command = (s, c) => dispatch(s, c).state;
const action = (s, action, extra = {}) => command(s, { type: 'action', action, ...extra });
function advanceRound(s) {
  while (s.phase === 'select') {
    s = command(s, { type: 'activate', crewId: availableCrew(s)[0].id });
    s = action(s, 'wait');
  }
  assert.equal(s.phase, 'roundEnd');
  s = command(s, { type: 'endRound' });
  return dispatch(s, { type: 'startRound' });
}
function crossedWorkers(assignments) {
  let s = command(fresh(), { type: 'startRound' });
  for (const [, target] of assignments) s.cells[target] = 'damaged';
  for (const [crewId, target, workCellId] of assignments) {
    s = command(s, { type: 'activate', crewId });
    s = action(s, 'repair', { cells: [target], workCellId });
  }
  return s;
}

for (const [name, assignments] of [
  ['Pilot/Copilot', [['pilot', 'B2-4', 'D2-1'], ['copilot', 'C2-1', 'C2-2']]],
  ['Radio/Engineer', [['radio', 'B2-4', 'C2-4'], ['engineer', 'A3-1', 'C3-2']]],
]) for (const reverse of [false, true]) test(`${name} simultaneous returns release crossed temporary positions, order ${reverse ? 'reversed' : 'forward'}`, () => {
  let s = crossedWorkers(reverse ? [...assignments].reverse() : assignments);
  assert.ok(s.jobs.every(j => j.completeRound === 3));
  s = advanceRound(s).state;
  assert.equal(s.jobs.length, 2, 'both workers stay busy for all of Round 2');
  const completed = advanceRound(s);
  assert.equal(completed.state.round, 3);
  assert.equal(completed.state.jobs.length, 0);
  for (const [id, target] of assignments) {
    const c = member(completed.state, id);
    assert.deepEqual(c.position, STATIONS[c.station].cells);
    assert.equal(isAtStation(completed.state, c), true);
    assert.equal(availableCrew(completed.state).some(c => c.id === id), true);
    assert.equal(completed.state.cells[target], 'healthy');
  }
  const types = completed.events.map(e => e.type);
  assert.ok(types.lastIndexOf('AIRCRAFT_SQUARE_REPAIRED') < types.indexOf('CREW_RETURNED'), 'all job effects precede the batch return');
  const before = completed.state.altitude, control = collect();
  resolveAltitude(completed.state, control.emit);
  assert.equal(completed.state.altitude, before, 'returned pilots control the aircraft');
});

test('a worker whose home remains burning still blocks another return at their temporary position', () => {
  const s = crossedWorkers([['pilot', 'B2-4', 'D2-1'], ['copilot', 'C2-1', 'C2-2']]);
  s.round = 2; s.phase = 'ready'; s.cells['C2-2'] = 'fire';
  s.jobs.push({ id: 'suppression', kind: 'fireControl', crewId: 'tail', cells: ['C2-2'], completeRound: 10 });
  member(s, 'tail').job = 'suppression';
  const result = dispatch(s, { type: 'startRound' });
  assert.deepEqual(member(result.state, 'pilot').position, ['D2-1']);
  assert.deepEqual(member(result.state, 'copilot').position, ['C2-2']);
  assert.equal(result.events.filter(e => e.type === 'CREW_DISPLACED').length, 2);
});

test('a genuinely remaining worker blocks a return; completing workers do not evict them', () => {
  const s = crossedWorkers([['radio', 'B2-4', 'C2-4'], ['engineer', 'A3-1', 'C3-2']]);
  s.jobs.find(j => j.crewId === 'engineer').completeRound = 4;
  s.round = 2; s.phase = 'ready';
  const result = dispatch(s, { type: 'startRound' });
  assert.deepEqual(member(result.state, 'radio').position, ['C2-4']);
  assert.deepEqual(member(result.state, 'engineer').position, ['C3-2']);
  assert.equal(result.state.jobs.length, 1);
  assert.ok(member(result.state, 'engineer').job);
});

test('Medical requires a reachable injured patient and explains a fully burning interior row', () => {
  const s = activated('radio');
  member(s, 'pilot').health = 'injured';
  for (const id of ['C2-2', 'C2-4', 'D2-1', 'D2-3']) s.cells[id] = 'fire';
  const medical = availableActions(s).find(a => a.id === 'medical');
  assert.equal(medical.enabled, false);
  assert.match(medical.reason, /safe interior work position/i);
  assert.deepEqual(eligibleMedicalTargets(s, 'radio'), []);
  const before = structuredClone(s);
  assert.throws(() => action(s, 'medical', { targetId: 'pilot' }), /safe interior/i);
  assert.deepEqual(s, before);
  member(s, 'tail').health = 'injured';
  assert.equal(availableActions(s).find(a => a.id === 'medical').enabled, true);
  assert.deepEqual(eligibleMedicalTargets(s, 'radio').map(c => c.id), ['tail']);
});

test('activation alone cannot qualify a gunner; finishing the normal action opens a pre-enemy window', () => {
  const s = activated('engineer');
  s.fighters = [fighter('target', { hp: 4, maxHp: 4 })];
  s.bags.combat = { tokens: ['Hit'], discard: [] };
  assert.equal(member(s, 'engineer').used, true);
  assert.equal(member(s, 'engineer').activationCompleted, false);
  assert.equal(opportunityAvailability(s).enabled, false);
  assert.throws(() => command(s, { type: 'opportunityShot', gunnerId: 'engineer', targetId: 'target' }), /after the crew action/i);
  const result = dispatch(s, { type: 'action', action: 'basicFire', targetId: 'target' });
  assert.equal(result.state.phase, 'opportunity');
  assert.equal(member(result.state, 'engineer').activationCompleted, true);
  assert.equal(result.state.fighters[0].hp, 3);
  assert.equal(result.state.stats.enemyAttacks, 0);
  assert.equal(result.events.some(e => e.type === 'ENEMY_PHASE_STARTED'), false);
  assert.throws(() => action(result.state, 'basicFire', { targetId: 'target' }), /only after activating/i);
  const shot = dispatch(result.state, { type: 'opportunityShot', gunnerId: 'engineer', targetId: 'target' });
  assert.equal(shot.state.fighters[0].hp, 2);
  assert.equal(shot.state.phase, 'opportunity');
  assert.equal(shot.state.stats.missionDraws, s.stats.missionDraws);
  assert.equal(shot.state.slot, s.slot);
  assert.equal(shot.events.some(e => e.type === 'ENEMY_PHASE_STARTED' || e.type === 'CREW_ACTIVATED'), false);
  const continued = dispatch(shot.state, { type: 'continueEnemyPhase' });
  assert.equal(continued.events.filter(e => e.type === 'ENEMY_PHASE_STARTED').length, 1);
  assert.equal(continued.events.filter(e => e.type === 'ATTACK_DISRUPTED').length, 1);
  assert.equal(continued.state.phase, 'select');
  assert.throws(() => command(continued.state, { type: 'continueEnemyPhase' }), /only from/i);
});

test('Pilot-created Opportunity is spendable immediately, with repeated kill chains and explicit Continue', () => {
  let s = command(fresh({ startingOpportunity: 0 }), { type: 'startRound' });
  s = command(s, { type: 'activate', crewId: 'engineer' });
  s = action(s, 'wait');
  s = command(s, { type: 'activate', crewId: 'pilot' });
  s.fighters = ['one', 'two', 'three'].map(id => fighter(id));
  s.bags.combat = { tokens: ['Burst'], discard: [] };
  const officer = s.resources.Officer, draws = s.stats.missionDraws, slot = s.slot;
  const direct = dispatch(s, { type: 'action', action: 'directFire' });
  s = direct.state;
  assert.equal(s.resources.Officer, officer - 1);
  assert.equal(s.phase, 'opportunity');
  assert.equal(s.opportunity, 1);
  assert.equal(direct.events.some(e => e.type === 'ENEMY_PHASE_STARTED' || e.type === 'GUNNER_SHOT_ROLL'), false);
  for (const targetId of ['one', 'two', 'three']) {
    s = command(s, { type: 'opportunityShot', gunnerId: 'engineer', targetId });
    assert.equal(s.opportunity, 1, 'kill returns the spent Opportunity and can chain');
    assert.ok(s.opportunity <= s.config.opportunityCap);
    assert.equal(s.phase, 'opportunity');
    assert.equal(s.stats.missionDraws, draws);
    assert.equal(s.stats.enemyAttacks, 0);
    assert.equal(s.slot, slot);
  }
  assert.equal(s.stats.opportunitySpent, 3);
  assert.equal(opportunityAvailability(s).enabled, false, 'no targets remain');
  const result = dispatch(s, { type: 'continueEnemyPhase' });
  assert.equal(result.events.filter(e => e.type === 'ENEMY_PHASE_STARTED').length, 1);
  assert.equal(result.state.phase, 'select');
});

test('Continue may decline all shots and eligibility resets next round', () => {
  let s = activated('engineer'); s.fighters = [fighter('target', { facing: 90 })];
  s = action(s, 'wait');
  assert.equal(s.phase, 'opportunity');
  const before = s.bags.combat.tokens.length;
  s = command(s, { type: 'continueEnemyPhase' });
  assert.equal(s.bags.combat.tokens.length, before);
  assert.equal(s.opportunity, 1);
  assert.equal(s.fighters[0].facing, 0);
  s.phase = 'ready'; s.fighters = [];
  s = command(s, { type: 'startRound' });
  assert.ok(s.crew.every(c => !c.activationCompleted));
});

test('Opportunity is unavailable outside its window and auto-skips when no legal shot exists', () => {
  for (const phase of ['ready', 'select', 'action', 'roundEnd', 'bombing']) {
    const s = activated('engineer');
    s.phase = phase; s.fighters = [fighter()]; member(s, 'engineer').activationCompleted = true;
    assert.equal(opportunityAvailability(s).enabled, false);
    assert.throws(() => command(s, { type: 'opportunityShot', gunnerId: 'engineer', targetId: 'f1' }));
  }
  for (const overrides of [{ opportunityEnabled: false }, { startingOpportunity: 0 }]) {
    const s = activated('engineer', overrides); s.fighters = [fighter('target', { facing: 90 })];
    const result = dispatch(s, { type: 'action', action: 'wait' });
    assert.equal(result.state.phase, 'select');
    assert.equal(result.events.filter(e => e.type === 'ENEMY_PHASE_STARTED').length, 1);
  }
});

test('version-2 migration preserves pending resolution and never qualifies the currently activated gunner', () => {
  const state = activated('engineer');
  state.rulesVersion = 2;
  member(state, 'radio').used = true;
  for (const c of state.crew) delete c.activationCompleted;
  const session = { version: 1, presentationVersion: 2, state, view: structuredClone(state), pending: [{ type: 'CREW_ACTION_READY', state: structuredClone(state) }], log: [], speed: 'manual' };
  const storage = { data: null, getItem() { return this.data; }, setItem(key, value) { assert.equal(key, SAVE_KEY); this.data = value; } };
  saveSession(session, storage);
  const loaded = loadSession(storage);
  for (const s of [loaded.state, loaded.view, loaded.pending[0].state]) {
    assert.equal(s.rulesVersion, 3);
    assert.equal(member(s, 'engineer').activationCompleted, false);
    assert.equal(member(s, 'radio').activationCompleted, true);
    for (const key of ['bags', 'resources', 'rng', 'phase', 'jobs', 'opportunity']) assert.deepEqual(s[key], state[key]);
  }
  saveSession(loaded, storage);
  assert.deepEqual(loadSession(storage), loaded, 'migration is idempotent');
});

test('an autosaved open Opportunity window preserves its completion flags and awaits Continue', () => {
  let s = activated('engineer'); s.fighters = [fighter('target', { facing: 90 })];
  s = action(s, 'wait');
  const session = { version: 1, presentationVersion: 2, state: s, view: structuredClone(s), pending: [], log: [], speed: 'manual' };
  const storage = { data: null, getItem() { return this.data; }, setItem(key, value) { this.data = value; } };
  saveSession(session, storage);
  assert.deepEqual(loadSession(storage), session);
  assert.equal(opportunityAvailability(loadSession(storage).state).enabled, true);
  assert.equal(createGame().config.outboundLength, 14);
});
