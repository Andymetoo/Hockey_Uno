import test from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS } from '../board.mjs';
import { dispatch, availableCrew, availableActions, isAtStation, resolveFireSpread } from '../rules.mjs';
import { activated, collect } from './fixtures.mjs';

const work = (state, action, extra) => dispatch(state, { type: 'action', action, ...extra });
const nextRound = state => dispatch({ ...state, phase: 'ready' }, { type: 'startRound' });

test('two-round Medical keeps worker and patient unavailable through N+1 and releases both at N+2 start', () => {
  const state = activated('radio', { medicalDuration: 2 });
  state.crew.find(crew => crew.id === 'pilot').health = 'injured';
  const started = work(state, 'medical', { targetId: 'pilot', workCellId: STATIONS.pilot.cells[0] }).state;
  assert.equal(started.jobs[0].completeRound, state.round + 2);
  for (const crewId of ['radio', 'pilot']) assert.equal(availableCrew(started).some(crew => crew.id === crewId), false);
  const waiting = nextRound(started).state;
  assert.equal(waiting.round, state.round + 1);
  assert.equal(waiting.jobs.length, 1);
  for (const crewId of ['radio', 'pilot']) {
    assert.equal(availableCrew(waiting).some(crew => crew.id === crewId), false);
    assert.deepEqual(availableActions(waiting, crewId), []);
  }
  const complete = nextRound(waiting).state;
  assert.equal(complete.round, state.round + 2);
  assert.equal(complete.jobs.length, 0);
  for (const crewId of ['radio', 'pilot']) assert.equal(availableCrew(complete).some(crew => crew.id === crewId), true);
  assert.equal(complete.crew.find(crew => crew.id === 'pilot').health, 'healthy');
});

test('an externally healed patient invalidates Medical and releases the caregiver at the next safe boundary', () => {
  const state = activated('radio', { medicalDuration: 2 });
  state.crew.find(crew => crew.id === 'pilot').health = 'injured';
  const started = work(state, 'medical', { targetId: 'pilot' }).state;
  const patient = started.crew.find(crew => crew.id === 'pilot');
  patient.health = 'healthy';
  const waiting = nextRound(started).state;
  assert.equal(waiting.jobs.length, 0);
  assert.equal(availableCrew(waiting).some(crew => crew.id === 'pilot'), true);
  assert.equal(isAtStation(waiting, waiting.crew.find(crew => crew.id === 'pilot')), true);
  assert.equal(waiting.crew.find(crew => crew.id === 'radio').job, null);
  const complete = nextRound(waiting).state;
  assert.equal(availableCrew(complete).some(crew => crew.id === 'pilot'), true);
  assert.equal(isAtStation(complete, complete.crew.find(crew => crew.id === 'pilot')), true);
});

test('two-round Repair stores exactly the selected set and skips newly burning targets without cancelling other repairs', () => {
  const state = activated('engineer', { repairDuration: 2 });
  const cells = ['A3-1', 'A3-2', 'B3-1'];
  for (const id of cells) state.cells[id] = 'damaged';
  const started = work(state, 'repair', { cells }).state;
  assert.deepEqual(started.jobs[0].cells, cells);
  assert.equal(started.jobs[0].completeRound, state.round + 2);
  const waiting = nextRound(started).state;
  assert.ok(cells.every(id => waiting.cells[id] === 'damaged'));
  assert.equal(availableCrew(waiting).some(crew => crew.id === 'engineer'), false);
  waiting.cells[cells[1]] = 'fire';
  // A suppression job holds this externally changed fire still during round start.
  waiting.jobs.push({ id: 'external-suppression', kind: 'fireControl', crewId: 'tail', cells: [cells[1]], completeRound: waiting.round + 10 });
  const completed = nextRound(waiting);
  assert.equal(completed.state.cells[cells[0]], 'healthy');
  assert.equal(completed.state.cells[cells[1]], 'fire');
  assert.equal(completed.state.cells[cells[2]], 'healthy');
  assert.equal(completed.state.stats.repairs, 2);
  assert.equal(completed.events.filter(event => event.type === 'WORK_TARGET_CHANGED').length, 1);
  assert.equal(completed.state.jobs.some(job => job.kind === 'repair'), false);
});

test('Fire Control suppresses its selected group immediately, holds through N+1, and extinguishes at N+2 start', () => {
  const state = activated('radio', { fireDuration: 2, extinguishLeavesDamage: true });
  const cells = ['A3-1', 'A3-2'];
  for (const id of cells) state.cells[id] = 'fire';
  const started = work(state, 'fireControl', { cells }).state;
  const immediate = collect(); resolveFireSpread(started, immediate.emit);
  assert.equal(immediate.events.some(event => event.type === 'FIRE_SPREAD_ROLL'), false);
  const waiting = nextRound(started);
  assert.equal(waiting.events.some(event => event.type === 'FIRE_SPREAD_ROLL'), false);
  assert.ok(cells.every(id => waiting.state.cells[id] === 'fire'));
  assert.equal(availableCrew(waiting.state).some(crew => crew.id === 'radio'), false);
  const complete = nextRound(waiting.state);
  assert.ok(cells.every(id => complete.state.cells[id] === 'damaged'));
  assert.equal(complete.state.jobs.length, 0);
  assert.equal(complete.events.filter(event => event.type === 'FIRE_EXTINGUISHED').length, 2);
});

test('crisis selection permits fewer squares than the cap and preserves the explicit work position', () => {
  const state = activated('engineer', { repairDuration: 2 });
  state.cells['A3-1'] = 'damaged';
  const workCellId = STATIONS.radio.cells[0];
  const result = work(state, 'repair', { cells: ['A3-1'], workCellId });
  assert.deepEqual(result.state.jobs[0].cells, ['A3-1']);
  assert.deepEqual(result.state.jobs[0].workPosition, [workCellId]);
});
