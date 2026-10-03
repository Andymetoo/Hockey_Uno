import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { STATIONS } from '../board.mjs';
import { availableCrew, availableActions, dispatch, isAtStation, damageSquare, postAttackPosition } from '../rules.mjs';
import { fighter, rngForIndexes, rngForDice, collect, commitTestBombRun } from './fixtures.mjs';

const member = (state, id) => state.crew.find(crew => crew.id === id);
const fresh = (config = {}) => createGame({ opportunityEnabled: false, v2MissionEnemy: 0, v2MissionResource: 80, v2MissionTime: 20, ...config }, 'continuous-tests', 'v2-continuous');
function activate(state, token = 'Resource', crewId = availableCrew(state)[0]?.id) {
  const bag = state.bags.mission;
  const pool = bag.tokens.length ? bag.tokens : bag.discard;
  const index = pool.indexOf(token);
  assert.ok(index >= 0, `fixture has a ${token} token available`);
  state.rng = rngForIndexes([pool.length], [index]);
  return dispatch(state, { type: 'activate', crewId });
}
const act = (state, action = 'wait', extra = {}) => dispatch(state, { type: 'action', action, ...extra });
function turn(state, token = 'Resource', crewId) {
  const activation = activate(state, token, crewId);
  assert.equal(activation.state.phase, 'action');
  const result = act(activation.state);
  return { state: result.state, events: [...activation.events, ...result.events] };
}
const timeCount = state => [...state.bags.mission.tokens, ...state.bags.mission.discard, ...state.timeTokens, ...(state.overflowTimeTokens ?? [])].filter(token => token === 'Time').length;
const resourceCount = state => state.resources.Officer + state.resources.Enlisted + [...state.bags.mission.tokens, ...state.bags.mission.discard].filter(token => token === 'Resource').length;
const safeFighter = (id = 'f1', overrides = {}) => fighter(id, { facing: 180, engagementRemaining: 5, ...overrides });

test('V2 begins with crew selection and independent clocks, without any formal round command', () => {
  const state = fresh();
  assert.equal(state.ruleset, 'v2-continuous');
  assert.equal(state.phase, 'select');
  assert.deepEqual(state.crewCycle, { number: 1, turn: 0 });
  assert.equal(state.time, 0);
  assert.deepEqual(state.timeTokens, []);
  assert.equal(state.pendingProgress, false);
  assert.ok(state.crew.every(crew => crew.cycleSlotConsumed === false));
  assert.throws(() => dispatch(state, { type: 'startRound' }));
  assert.throws(() => dispatch({ ...state, phase: 'roundEnd' }, { type: 'endRound' }));
  const result = activate(state, 'Time', 'pilot');
  assert.ok(result.events.findIndex(event => event.type === 'CREW_ACTIVATED') < result.events.findIndex(event => event.type === 'MISSION_TOKEN_DRAWN'));
  assert.equal(result.state.phase, 'action', 'Time does not consume the normal action');
  assert.equal(member(result.state, 'pilot').cycleSlotConsumed, true);
});

test('V2 Time tokens remain outside both bag and discard until the fourth-Time checkpoint', () => {
  let state = fresh();
  const total = timeCount(state);
  for (let index = 1; index <= 3; index++) {
    state = turn(state, 'Time').state;
    assert.equal(state.time, index);
    assert.equal(state.timeTokens.length, index);
    assert.equal(state.pendingProgress, false);
    assert.equal(state.mission.position, 0);
    assert.equal(timeCount(state), total);
    assert.ok(!state.bags.mission.discard.includes('Time'));
  }
  const fourth = activate(state, 'Time');
  assert.equal(fourth.state.time, 4);
  assert.equal(fourth.state.pendingProgress, true);
  assert.equal(fourth.state.mission.position, 0);
  assert.equal(fourth.state.phase, 'action');
  const result = act(fourth.state);
  assert.equal(result.state.mission.position, 1);
  assert.equal(result.state.time, 0);
  assert.equal(result.state.pendingProgress, false);
  assert.deepEqual(result.state.timeTokens, []);
  assert.equal(timeCount(result.state), total);
  assert.equal(result.events.filter(event => event.type === 'MISSION_ADVANCED').length, 1);
  assert.equal(result.events.filter(event => event.type === 'ENEMY_PHASE_STARTED').length, 1);
  assert.ok(result.events.findIndex(event => event.type === 'ENEMY_PHASE_STARTED') < result.events.findIndex(event => event.type === 'MISSION_ADVANCED'));
  assert.equal(result.state.crewCycle.number, 1);
  assert.equal(result.state.crew.filter(crew => crew.cycleSlotConsumed).length, 4, 'Progress cannot ready crew');
});

test('V2 Progress waits for the normal action, Opportunity shots and the entire enemy queue', () => {
  let state = fresh({ opportunityEnabled: true });
  for (let index = 0; index < 3; index++) state = turn(state, 'Time').state;
  state.fighters = [safeFighter('f1', { hp: 5, maxHp: 5 }), safeFighter('f2')];
  state = activate(state, 'Time', 'engineer').state;
  const action = act(state);
  assert.equal(action.state.phase, 'opportunity');
  assert.equal(action.state.mission.position, 0);
  assert.equal(action.state.pendingProgress, true);
  action.state.bags.combat = { tokens: ['Burst'], discard: [] };
  const shot = dispatch(action.state, { type: 'opportunityShot', gunnerId: 'engineer', targetId: 'f1' });
  assert.equal(shot.state.fighters[0].hp, 3);
  assert.equal(shot.state.time, 4);
  assert.equal(shot.state.mission.position, 0);
  assert.equal(shot.state.fighters[0].engagementRemaining, 5);
  assert.equal(shot.state.stats.missionDraws, action.state.stats.missionDraws);
  assert.equal(shot.state.crewCycle.turn, action.state.crewCycle.turn);
  const completed = dispatch(shot.state, { type: 'continueEnemyPhase' });
  assert.equal(completed.state.mission.position, 1);
  assert.deepEqual(completed.state.fighters.map(enemy => enemy.engagementRemaining), [4, 4]);
  const types = completed.events.map(event => event.type);
  assert.ok(types.lastIndexOf('FIGHTER_ROTATED') < types.indexOf('MISSION_ADVANCED'));
});

test('V2 Progress refills mission/combat discard and spent resources while conserving held tokens', () => {
  let state = fresh();
  const resources = resourceCount(state), times = timeCount(state);
  state.cells['B2-4'] = 'damaged';
  state = act(activate(state, 'Resource', 'radio').state, 'repair', { cells: ['B2-4'] }).state;
  assert.equal(state.bags.mission.discard.filter(token => token === 'Resource').length, 1);
  const held = structuredClone(state.resources);
  state.bags.combat.discard.push(...state.bags.combat.tokens.splice(0, 3));
  const combat = state.bags.combat.tokens.length + state.bags.combat.discard.length;
  for (let index = 0; index < 4; index++) state = turn(state, 'Time').state;
  assert.equal(state.mission.position, 1);
  assert.deepEqual(state.bags.mission.discard, []);
  assert.deepEqual(state.bags.combat.discard, []);
  assert.equal(state.bags.combat.tokens.length, combat);
  assert.deepEqual(state.resources, held);
  assert.equal(resourceCount(state), resources);
  assert.equal(timeCount(state), times);
});

test('V2 Resource denomination still follows activating Officer/Enlisted rank', () => {
  for (const [crewId, rank] of [['pilot', 'Officer'], ['engineer', 'Enlisted']]) {
    const state = fresh(), before = state.resources[rank], total = resourceCount(state);
    const result = activate(state, 'Resource', crewId);
    assert.equal(result.state.resources[rank], before + 1);
    assert.equal(resourceCount(result.state), total);
    assert.equal(result.state.bags.mission.discard.length, 0);
  }
});

test('V2 empty mission bag emergency-refills discard without releasing accumulated Time', () => {
  let state = fresh();
  state = turn(state, 'Time', 'pilot').state;
  const timeBefore = state.timeTokens.length;
  state.bags.mission = { tokens: [], discard: ['Resource'] };
  const result = activate(state, 'Resource', 'copilot');
  assert.equal(result.state.time, 1);
  assert.equal(result.state.timeTokens.length, timeBefore);
  assert.equal(result.state.mission.position, 0);
  assert.ok(result.events.some(event => event.type === 'MISSION_BAG_REFILLED' && /emergency/i.test(event.message)));
  assert.equal(result.state.bags.mission.tokens.length, 0);
  assert.equal(result.state.bags.mission.discard.length, 0);
});

test('V2 emergency combat refill retains Burst damage and does not advance Time', () => {
  const state = activate(fresh(), 'Resource', 'engineer').state;
  state.fighters = [safeFighter('f1', { hp: 5, maxHp: 5 })];
  state.bags.combat = { tokens: [], discard: ['Burst'] };
  const result = act(state, 'basicFire', { targetId: 'f1' });
  assert.equal(result.state.fighters[0].hp, 3);
  assert.equal(result.state.time, 0);
  assert.ok(result.events.some(event => event.type === 'COMBAT_BAG_REFILLED' && /emergency/i.test(event.message)));
});

for (const [kind, configKey, setup, extra, targetOutcome] of [
  ['repair', 'v2RepairTime', state => { state.cells['B2-4'] = 'damaged'; }, { cells: ['B2-4'] }, state => assert.equal(state.cells['B2-4'], 'healthy')],
  ['fireControl', 'v2FireTime', state => { state.cells['B2-4'] = 'fire'; }, { cells: ['B2-4'] }, state => assert.equal(state.cells['B2-4'], 'damaged')],
  ['medical', 'v2MedicalTime', state => { member(state, 'pilot').health = 'injured'; }, { targetId: 'pilot' }, state => assert.equal(member(state, 'pilot').health, 'healthy')],
]) test(`V2 ${kind} takes four future Time tokens, without retroactively counting its starting draw`, () => {
  let state = fresh({ v2TimePerProgress: 20 });
  setup(state);
  state = act(activate(state, 'Time', 'radio').state, kind, extra).state;
  assert.equal(state.config[configKey], 4);
  assert.equal(state.jobs[0].remainingTime, 4);
  assert.equal('completeRound' in state.jobs[0], false);
  state = turn(state, 'Resource').state;
  assert.equal(state.jobs[0].remainingTime, 4, 'Resource draws do not count as work Time');
  for (let remaining = 3; remaining >= 1; remaining--) {
    state = turn(state, 'Time').state;
    assert.equal(state.jobs[0].remainingTime, remaining);
    assert.deepEqual(availableActions(state, 'radio'), []);
  }
  const complete = activate(state, 'Time');
  assert.equal(complete.state.jobs.length, 0);
  assert.equal(member(complete.state, 'radio').job, null);
  targetOutcome(complete.state);
  assert.deepEqual(member(complete.state, 'radio').position, STATIONS.radio.cells);
});

for (const kind of ['repair', 'fireControl', 'medical']) test(`V2 assisted ${kind} takes two future Time and reserves both workers`, () => {
  let state = fresh({ v2TimePerProgress: 20 });
  state.cells['B2-4'] = kind === 'fireControl' ? 'fire' : 'damaged';
  if (kind === 'medical') member(state, 'pilot').health = 'injured';
  const extra = kind === 'medical' ? { targetId: 'pilot' } : { cells: ['B2-4'] };
  state = act(activate(state, 'Time', 'radio').state, kind, { ...extra, assistantId: 'engineer' }).state;
  assert.equal(state.jobs[0].remainingTime, 2);
  assert.equal(state.jobs[0].assistantId, 'engineer');
  assert.equal(member(state, 'engineer').cycleSlotConsumed, false, 'assistance must not erase an unconsumed time slot');
  for (const id of ['radio', 'engineer']) {
    assert.ok(member(state, id).job);
    assert.equal(availableCrew(state).some(crew => crew.id === id), false);
    assert.deepEqual(availableActions(state, id), []);
  }
  for (let remaining = 1; remaining >= 1; remaining--) {
    state = turn(state, 'Time').state;
    assert.equal(state.jobs[0].remainingTime, remaining);
  }
  state = activate(state, 'Time').state;
  assert.equal(state.jobs.length, 0);
  assert.equal(member(state, 'radio').job, null);
  assert.equal(member(state, 'engineer').job, null);
  assert.equal(availableCrew(state).some(crew => crew.id === 'engineer'), true, 'released assistant can still use their unconsumed slot this Cycle');
});

test('V2 simultaneous Time completions batch-return crossed workers without mutual blocking', () => {
  let state = fresh({ v2RepairTime: 1, v2TimePerProgress: 20 });
  const assignments = [['pilot', 'B2-4', 'D2-1'], ['copilot', 'C2-1', 'C2-2']];
  for (const [, cell] of assignments) state.cells[cell] = 'damaged';
  for (const [crewId, cell, workCellId] of assignments) state = act(activate(state, 'Resource', crewId).state, 'repair', { cells: [cell], workCellId }).state;
  const result = activate(state, 'Time', 'radio');
  assert.equal(result.state.jobs.length, 0);
  for (const [crewId, cell] of assignments) {
    assert.equal(result.state.cells[cell], 'healthy');
    assert.deepEqual(member(result.state, crewId).position, STATIONS[crewId].cells);
    assert.equal(isAtStation(result.state, member(result.state, crewId)), true);
  }
  const types = result.events.map(event => event.type);
  assert.ok(types.lastIndexOf('AIRCRAFT_SQUARE_REPAIRED') < types.indexOf('CREW_RETURNED'));
});

test('V2 jobs reaching zero finish before Progress fire spread and control checks', () => {
  let state = fresh({ v2RepairTime: 1, v2FireTime: 1, v2TimePerProgress: 1 });
  state.cells['B2-4'] = 'damaged';
  state.cells['A3-1'] = 'fire';
  member(state, 'copilot').health = 'dead';
  state = act(activate(state, 'Resource', 'pilot').state, 'repair', { cells: ['B2-4'] }).state;
  state = act(activate(state, 'Resource', 'radio').state, 'fireControl', { cells: ['A3-1'] }).state;
  const before = state.altitude;
  const draw = activate(state, 'Time', 'engineer');
  assert.equal(draw.state.jobs.length, 0);
  assert.equal(draw.state.cells['A3-1'], 'damaged');
  assert.equal(isAtStation(draw.state, member(draw.state, 'pilot')), true);
  const result = act(draw.state);
  assert.equal(result.state.altitude, before, 'Pilot returns before the Control check');
  assert.equal(result.state.mission.position, 1);
  assert.equal(result.events.some(event => event.type === 'FIRE_SPREAD_ROLL'), false);
  const types = [...draw.events, ...result.events].map(event => event.type);
  const completion = types.lastIndexOf('WORK_COMPLETING'), returned = types.lastIndexOf('CREW_RETURNED'), altitude = types.indexOf('ALTITUDE_CHECK');
  assert.ok(completion >= 0 && returned > completion && altitude > returned, 'both work completion and batch return occur before altitude checks');
});

test('V2 Repair still skips a selected target that becomes Fire before completion', () => {
  let state = fresh({ v2RepairTime: 1, v2TimePerProgress: 20 });
  state.cells['B2-4'] = 'damaged';
  state = act(activate(state, 'Resource', 'radio').state, 'repair', { cells: ['B2-4'] }).state;
  state.cells['B2-4'] = 'fire';
  const result = activate(state, 'Time');
  assert.equal(result.state.jobs.length, 0);
  assert.equal(result.state.cells['B2-4'], 'fire');
  assert.equal(result.state.stats.repairs, 0);
});

test('V2 Fire Control suppresses immediately and converts its fires to Damage on completion', () => {
  let state = fresh({ v2FireTime: 2, v2TimePerProgress: 1 });
  state.cells['B2-4'] = 'fire';
  state = act(activate(state, 'Resource', 'radio').state, 'fireControl', { cells: ['B2-4'] }).state;
  const first = turn(state, 'Time');
  assert.equal(first.state.cells['B2-4'], 'fire');
  assert.equal(first.events.some(event => event.type === 'FIRE_SPREAD_ROLL'), false);
  const second = turn(first.state, 'Time');
  assert.equal(second.state.cells['B2-4'], 'damaged');
  assert.equal(second.state.jobs.length, 0);
});

test('V2 ten Turns refresh crew readiness without touching fire, altitude, Progress, fighters or discard', () => {
  let state = fresh();
  state.cells['B2-4'] = 'fire';
  state.engines.forEach(engine => { engine.running = false; });
  state.fighters = [safeFighter('persistent', { engagementRemaining: 99 })];
  state.bags.mission.discard = ['Enemy'];
  state.bags.combat.discard = ['Miss'];
  const events = [], altitude = state.altitude;
  for (let index = 0; index < 10; index++) {
    state.fighters[0].facing = 180;
    const result = turn(state);
    state = result.state; events.push(...result.events);
    if (index < 9) assert.equal(state.crewCycle.number, 1);
  }
  assert.equal(state.crewCycle.number, 2);
  assert.equal(state.crewCycle.turn, 0);
  assert.equal(state.stats.missionDraws, 10);
  assert.equal(availableCrew(state).length, 10);
  assert.ok(state.crew.every(crew => !crew.cycleSlotConsumed && !crew.used));
  assert.equal(state.cells['B2-4'], 'fire');
  assert.equal(state.altitude, altitude);
  assert.equal(state.mission.position, 0);
  assert.equal(state.fighters.length, 1);
  assert.equal(state.fighters[0].engagementRemaining, 89);
  assert.deepEqual(state.bags.mission.discard, ['Enemy']);
  assert.deepEqual(state.bags.combat.discard, ['Miss']);
  for (const type of ['ROUND_STARTED', 'ROUND_END_STARTED', 'FIRE_SPREAD_ROLL', 'ALTITUDE_CHECK', 'MISSION_ADVANCED', 'MISSION_BAG_REFILLED', 'COMBAT_BAG_REFILLED', 'FIGHTERS_CLEARED']) assert.equal(events.some(event => event.type === type), false, `${type} is not a Crew Cycle effect`);
});

test('V2 unavailable crew still consume ten slots, mission draws and enemy phases before refreshing survivors', () => {
  const state = fresh();
  state.bags.mission.tokens = Array(80).fill('Resource');
  for (const crew of state.crew) if (crew.id !== 'pilot') crew.health = 'dead';
  const result = turn(state, 'Resource', 'pilot');
  assert.equal(result.state.crewCycle.number, 2);
  assert.equal(result.state.stats.missionDraws, 10);
  assert.equal(result.events.filter(event => event.type === 'UNAVAILABLE_CREW_SLOT').length, 9);
  assert.equal(result.events.filter(event => event.type === 'ENEMY_PHASE_STARTED').length, 10);
  assert.equal(result.events.filter(event => event.type === 'RESOURCE_WASTED').length, 9);
  assert.equal(result.state.mission.position, 0);
  assert.equal(availableCrew(result.state).length, 1);
});

test('V2 assistant unused slot still produces mission and enemy pressure while their job remains busy', () => {
  let state = fresh();
  state.bags.mission.tokens = Array(80).fill('Resource');
  state.cells['B2-4'] = 'damaged';
  state = act(activate(state, 'Resource', 'radio').state, 'repair', { cells: ['B2-4'], assistantId: 'engineer' }).state;
  const events = [];
  while (state.crewCycle.number === 1) {
    const result = turn(state); state = result.state; events.push(...result.events);
  }
  assert.equal(state.stats.missionDraws, 10);
  assert.ok(events.some(event => event.type === 'UNAVAILABLE_CREW_SLOT' && event.crewId === 'engineer'));
  assert.equal(state.jobs[0].remainingTime, 2);
  assert.equal(member(state, 'engineer').job, state.jobs[0].id);
});

for (const consumed of [false, true]) test(`V2 mid-Cycle job completion ${consumed ? 'does not ready a consumed slot' : 'readies an unconsumed slot'}`, () => {
  let state = fresh({ v2AssistedRepairTime: 1, v2TimePerProgress: 20 });
  state.cells['B2-4'] = 'damaged';
  state = act(activate(state, 'Resource', 'radio').state, 'repair', { cells: ['B2-4'], assistantId: 'engineer' }).state;
  if (consumed) {
    // Resume fixture: the busy assistant's unavailable slot has already run this Cycle.
    member(state, 'engineer').used = true;
    member(state, 'engineer').cycleSlotConsumed = true;
    state.crewCycle.turn++;
    state.slot++;
  }
  const result = activate(state, 'Time', 'copilot');
  assert.equal(result.state.jobs.length, 0);
  assert.equal(result.state.crewCycle.number, 1);
  assert.equal(member(result.state, 'engineer').cycleSlotConsumed, consumed);
  assert.equal(availableCrew(result.state).some(crew => crew.id === 'engineer'), !consumed);
  assert.equal(availableCrew(result.state).some(crew => crew.id === 'radio'), false, 'primary already spent the activation that started work');
});

test('V2 a Time draw during an unavailable slot releases an unconsumed assistant before automatic slots continue', () => {
  let state = fresh({ v2AssistedRepairTime: 1 });
  state.cells['B2-4'] = 'damaged';
  member(state, 'pilot').health = 'injured';
  state = act(activate(state, 'Resource', 'radio').state, 'repair', { cells: ['B2-4'], assistantId: 'engineer' }).state;
  while (availableCrew(state).length > 1) state = turn(state).state;
  state = activate(state, 'Resource').state;
  state.bags.mission = { tokens: ['Time'], discard: [] };
  const result = act(state);
  assert.equal(result.state.crewCycle.number, 1);
  assert.equal(result.state.crewCycle.turn, 9);
  assert.equal(result.state.jobs.length, 0);
  assert.equal(member(result.state, 'pilot').cycleSlotConsumed, true);
  assert.equal(member(result.state, 'engineer').cycleSlotConsumed, false);
  assert.deepEqual(availableCrew(result.state).map(crew => crew.id), ['engineer']);
  assert.deepEqual(result.events.filter(event => event.type === 'UNAVAILABLE_CREW_SLOT').map(event => event.crewId), ['pilot']);
  assert.equal(result.state.stats.missionDraws, 9);
  result.state.bags.mission.tokens.push('Resource');
  const last = turn(result.state, 'Resource', 'engineer');
  assert.equal(last.state.stats.missionDraws, 10);
  assert.equal(last.state.crewCycle.number, 2);
});

test('V2 an assistant whose unavailable slot precedes completion waits until the next Crew Cycle', () => {
  let state = fresh({ v2AssistedRepairTime: 1 });
  state.cells['B2-4'] = 'damaged';
  member(state, 'tail').health = 'injured';
  state = act(activate(state, 'Resource', 'radio').state, 'repair', { cells: ['B2-4'], assistantId: 'engineer' }).state;
  while (availableCrew(state).length > 1) state = turn(state).state;
  state = activate(state, 'Resource').state;
  state.bags.mission = { tokens: ['Resource', 'Time'], discard: [] };
  state.rng = rngForIndexes([2, 1], [0, 0]);
  const result = act(state);
  assert.deepEqual(result.events.filter(event => event.type === 'UNAVAILABLE_CREW_SLOT').map(event => event.crewId), ['engineer', 'tail']);
  const returned = result.events.find(event => event.type === 'CREW_RETURNED' && event.crewId === 'engineer');
  assert.ok(returned);
  assert.equal(returned.state.crewCycle.number, 1);
  assert.equal(member(returned.state, 'engineer').cycleSlotConsumed, true);
  assert.equal(availableCrew(returned.state).some(crew => crew.id === 'engineer'), false);
  assert.equal(result.state.crewCycle.number, 2);
  assert.equal(availableCrew(result.state).some(crew => crew.id === 'engineer'), true);
  assert.equal(result.state.stats.missionDraws, 10);
});

test('V2 a fully unavailable crew advances one bounded Cycle per explicit continuation', () => {
  const state = fresh();
  state.crew.forEach(crew => { crew.health = 'injured'; });
  state.bags.mission = { tokens: Array(30).fill('Resource'), discard: [] };
  const first = dispatch(state, { type: 'advanceUnavailable' });
  assert.equal(first.state.phase, 'select');
  assert.equal(first.state.crewCycle.number, 2);
  assert.equal(first.state.stats.missionDraws, 10);
  assert.equal(first.events.filter(event => event.type === 'UNAVAILABLE_CREW_SLOT').length, 10);
  assert.equal(availableCrew(first.state).length, 0);
  const second = dispatch(first.state, { type: 'advanceUnavailable' });
  assert.equal(second.state.crewCycle.number, 3);
  assert.equal(second.state.stats.missionDraws, 20);
  assert.equal(second.state.mission.position, 0);
});

for (const injuredWorker of ['radio', 'engineer']) test(`V2 injury to assisted-job ${injuredWorker === 'radio' ? 'primary' : 'assistant'} cancels the job and releases both workers`, () => {
  let state = fresh();
  state.cells['B2-4'] = 'damaged';
  state = act(activate(state, 'Resource', 'radio').state, 'repair', { cells: ['B2-4'], workCellId: 'C2-2', assistantId: 'engineer', assistantWorkCellId: 'C2-4' }).state;
  const positions = Object.fromEntries(state.crew.map(crew => [crew.id, [...crew.position]]));
  const used = Object.fromEntries(state.crew.map(crew => [crew.id, crew.cycleSlotConsumed]));
  const { events, emit } = collect();
  damageSquare(state, member(state, injuredWorker).position[0], 1, emit);
  assert.equal(member(state, injuredWorker).health, 'injured');
  assert.equal(state.jobs.length, 0);
  for (const id of ['radio', 'engineer']) {
    assert.equal(member(state, id).job, null);
    assert.equal(member(state, id).cycleSlotConsumed, used[id]);
    assert.deepEqual(member(state, id).position, positions[id]);
  }
  assert.equal(state.cells['B2-4'], 'damaged', 'cancelled work does not grant its repair');
  assert.equal(events.filter(event => event.type === 'WORK_CANCELLED').length, 1);
});

test('V2 Escorts persist through Crew Cycle refresh and depart after the next Progress checkpoint', () => {
  let state = fresh();
  state.escorts = [{ id: 'escort', quadrant: 'Fore', round: 0 }];
  for (let index = 0; index < 10; index++) state = turn(state).state;
  assert.equal(state.crewCycle.number, 2);
  assert.equal(state.escorts.length, 1);
  assert.equal(state.time, 1, 'completed cycle has claimed one physical Time');
  for (let index = 0; index < 2; index++) state = turn(state, 'Time').state;
  assert.equal(state.escorts.length, 1);
  const fourth = activate(state, 'Time');
  assert.equal(fourth.state.escorts.length, 1, 'Escort is available for the triggering Turn enemy phase');
  const result = act(fourth.state);
  assert.equal(result.state.mission.position, 1);
  assert.equal(result.state.escorts.length, 0);
  assert.ok(result.events.some(event => event.type === 'ESCORTS_EXPIRED'));
});

test('V2 Escort damage neither applies Disrupt nor spends Engagement outside an enemy action', () => {
  const state = fresh(), { emit } = collect();
  state.escorts = [{ id: 'escort', quadrant: 'Aft', round: 0 }];
  state.fighters = [safeFighter('f1', { hp: 4, maxHp: 4, engagementRemaining: 3 })];
  postAttackPosition(state, 'f1', emit, { quadrant: 'Aft', altitude: 'High' });
  assert.equal(state.fighters[0].hp, 3);
  assert.equal(Boolean(state.fighters[0].disrupted), false);
  assert.equal(state.fighters[0].engagementRemaining, 3);
});

test('V2 Pilot Direct Fire retains its immediate Basic Shot without consuming the gunner Crew Cycle slot', () => {
  const state = activate(fresh({ opportunityEnabled: true }), 'Time', 'pilot').state;
  state.fighters = [safeFighter('f1', { hp: 4, maxHp: 4 })];
  state.bags.combat = { tokens: ['Burst'], discard: [] };
  const result = act(state, 'directFire', { gunnerId: 'engineer', targetId: 'f1' });
  assert.equal(result.state.fighters[0].hp, 2);
  assert.equal(result.state.resources.Officer, state.resources.Officer - 1);
  assert.equal(member(result.state, 'engineer').cycleSlotConsumed, false);
  assert.equal(member(result.state, 'engineer').used, false);
  assert.equal(member(result.state, 'engineer').activationCompleted, false);
  assert.equal(result.state.time, 1);
  assert.equal(result.state.stats.missionDraws, 1);
  assert.equal(result.state.crewCycle.turn, 1);
  assert.equal(result.state.opportunity, state.opportunity);
  assert.equal(result.events.filter(event => event.type === 'GUNNER_SHOT_ROLL').length, 1);
  assert.equal(result.events.filter(event => event.type === 'ENEMY_PHASE_STARTED').length, 1);
});

test('V2 Progress spreads unsuppressed fires before altitude checks and never advances a destroyed aircraft', () => {
  const state = fresh({ v2TimePerProgress: 1, startingAltitude: 1 });
  state.cells['B2-4'] = 'fire';
  state.engines.forEach(engine => { engine.running = false; });
  const draw = activate(state, 'Time', 'pilot');
  draw.state.rng = rngForDice([1]);
  const result = act(draw.state);
  const types = result.events.map(event => event.type);
  const fire = types.indexOf('FIRE_SPREAD_ROLL'), altitude = types.indexOf('ALTITUDE_CHECK');
  assert.ok(fire >= 0 && altitude > fire);
  assert.equal(result.state.altitude, 0);
  assert.equal(result.state.outcome, 'destroyed');
  assert.equal(result.state.phase, 'ended');
  assert.equal(result.state.mission.position, 0);
  assert.equal(types.includes('MISSION_ADVANCED'), false);
});

test('V2 configured mission lengths change only the V2 target and HOME checkpoints', () => {
  let state = fresh({ v2OutboundLength: 1, v2ReturnLength: 1, v2TimePerProgress: 1 });
  state = turn(state, 'Time').state;
  assert.equal(state.phase, 'bombing');
  assert.equal(state.mission.position, 1);
  assert.equal(state.config.outboundLength, 14);
  assert.equal(state.config.returnLength, 5);
  state = commitTestBombRun(state).state;
  state = turn(state, 'Time').state;
  assert.equal(state.phase, 'ended');
  assert.equal(state.outcome, 'success');
  assert.equal(state.mission.position, 2);
  assert.equal(state.stats.missionDraws, 2);
});

for (const mode of ['any-action', 'attack-pass-only']) for (const facing of [0, 180]) for (const disrupted of [false, true]) test(`V2 Engagement ${mode}: ${facing ? 'rotation' : 'attack pass'}${disrupted ? ' with Disrupt' : ''}`, () => {
  const state = activate(fresh({ v2EngagementMode: mode }), 'Resource', 'pilot').state;
  state.fighters = [safeFighter('f1', { facing, disrupted, engagementRemaining: 2 })];
  state.rng = rngForDice([1]);
  const result = act(state);
  const expected = mode === 'any-action' || facing === 0 ? 1 : 2;
  assert.equal(result.state.fighters[0].engagementRemaining, expected);
  assert.equal(Boolean(result.state.fighters[0].disrupted), false);
  if (disrupted && facing === 0) {
    assert.equal(result.events.filter(event => event.type === 'ATTACK_DISRUPTED').length, 0);
    assert.equal(result.events.find(event => event.type === 'DISRUPT_ACCURACY_RESOLVED').result, 'off-target');
  }
  if (facing === 180) assert.equal(result.events.filter(event => event.type === 'FIGHTER_ROTATED').length, 1);
});

test('V2 fighters finish their last flyby before disengaging at zero, without awarding kill rewards', () => {
  const state = activate(fresh({ opportunityEnabled: true, startingOpportunity: 0 }), 'Resource', 'pilot').state;
  state.fighters = [safeFighter('leaving', { facing: 0, disrupted: true, engagementRemaining: 1 }), safeFighter('remaining', { engagementRemaining: 3 })];
  const result = act(state);
  assert.deepEqual(result.state.fighters.map(enemy => enemy.id), ['remaining']);
  assert.equal(result.state.fighters[0].engagementRemaining, 2);
  assert.equal(result.state.stats.fightersKilled, 0);
  assert.equal(result.state.opportunity, 0);
  const flyby = result.events.findIndex(event => event.type === 'FIGHTER_MOVED' && event.fighterId === 'leaving');
  const disengage = result.events.findIndex(event => event.type === 'FIGHTER_DISENGAGED' && event.fighterId === 'leaving');
  assert.ok(flyby >= 0 && disengage > flyby);
});

for (const [type, key, value] of [['BF-109', 'v2Bf109Engagement', 2], ['BF-110', 'v2Bf110Engagement', 3], ['FW-190', 'v2Fw190Engagement', 4], ['Me-262', 'v2Me262Engagement', 6]]) test(`V2 ${type} gets its own configured Engagement and consumes its first same-Turn action`, () => {
  const state = fresh({ v2MissionEnemy: 1, [key]: value });
  state.deck = { cards: [type], discard: [] };
  const drawn = activate(state, 'Enemy', 'pilot');
  assert.equal(drawn.state.fighters[0].type, type);
  assert.equal(drawn.state.fighters[0].engagementRemaining, value);
  drawn.state.fighters[0].disrupted = true;
  const result = act(drawn.state);
  assert.equal(result.state.fighters[0].engagementRemaining, value - 1);
});

test('V2 fourth Enemy draw at the three-fighter cap is immediate Flak without an Engagement counter', () => {
  const state = fresh({ v2MissionEnemy: 1 });
  state.fighters = [safeFighter('one'), safeFighter('two'), safeFighter('three')];
  const deck = structuredClone(state.deck);
  const result = activate(state, 'Enemy', 'pilot');
  assert.equal(result.state.fighters.length, 3);
  assert.deepEqual(result.state.fighters.map(enemy => enemy.engagementRemaining), [5, 5, 5]);
  assert.deepEqual(result.state.deck, deck);
  assert.equal(result.state.stats.flakAttacks, 1);
  assert.equal(result.events.filter(event => event.type === 'ENEMY_ATTACK').length, result.state.config.flakShots);
  assert.equal(result.state.phase, 'action');
});

test('V2 8 outbound / 3 return mission reaches TARGET, resumes selection after bombing, and completes at HOME', () => {
  let state = fresh();
  const events = [];
  for (let index = 0; index < 40; index++) {
    const result = turn(state, 'Time'); state = result.state; events.push(...result.events);
    if (state.phase === 'bombing') {
      assert.equal(state.mission.position, 8);
      assert.equal(state.phase, 'bombing');
      const bombing = commitTestBombRun(state); state = bombing.state; events.push(...bombing.events);
      assert.equal(state.phase, 'select');
      assert.equal(state.mission.bombed, true);
    }
  }
  assert.equal(state.phase, 'ended');
  assert.equal(state.outcome, 'success');
  assert.equal(state.mission.position, 11);
  assert.equal(state.stats.missionDraws, 40);
  assert.equal(state.time, 0);
  assert.deepEqual(state.timeTokens, []);
  assert.equal(state.pendingProgress, false);
  assert.equal(events.filter(event => event.type === 'MISSION_ADVANCED').length, 11);
  assert.equal(events.filter(event => event.type === 'BOMB_RUN_ROLLED').length, 1);
  assert.equal(events.filter(event => event.type === 'BOMBING_RESOLVED').length, 1);
  assert.equal(events.some(event => ['ROUND_STARTED', 'ROUND_END_STARTED'].includes(event.type)), false);
});
