import test from 'node:test';
import assert from 'node:assert/strict';
import { crewStatus, stationStatus, availableCount, actionGroup, arcPreview, footprintCenter } from '../ui-model.mjs';
import { STATIONS, getCell } from '../board.mjs';
import { dispatch } from '../rules.mjs';
import { fresh, activated, fighter } from './fixtures.mjs';

test('gun preview and crew selection helpers are pure before activation', () => {
  const state = dispatch(fresh(), { type: 'startRound' }).state;
  state.fighters = [fighter('legal'), fighter('wrong-altitude', { altitude: 'Low' }), fighter('wrong-quadrant', { quadrant: 'Aft' })];
  const before = structuredClone(state), navigator = state.crew.find(c => c.id === 'navigator');
  assert.deepEqual(arcPreview(state, 'navigator').fighterIds, ['legal', 'wrong-altitude']);
  assert.deepEqual(new Set(arcPreview(state, 'navigator').sectors), new Set(['Fore/High', 'Fore/Level', 'Fore/Low']));
  assert.equal(crewStatus(state, navigator, true).id, 'selected');
  assert.equal(availableCount(state), 10);
  assert.deepEqual(state, before, 'preview consumes no action, token, resource, or RNG');
  navigator.position = ['C4-2'];
  assert.equal(arcPreview(state, 'navigator').arc, null, 'a displaced gunner has no station preview');
  assert.deepEqual(arcPreview(state, 'navigator').fighterIds, []);
});

test('crew status separates readiness, use, casualties, workers and medical patients', () => {
  const state = fresh(), crew = state.crew.find(c => c.id === 'pilot');
  assert.equal(crewStatus(state, crew).id, 'ready');
  assert.equal(crewStatus(state, crew, true).id, 'selected');
  crew.used = true;
  assert.equal(crewStatus(state, crew, true).id, 'used', 'selection cannot hide a spent activation');
  crew.health = 'injured';
  assert.equal(crewStatus(state, crew).id, 'injured');
  state.jobs = [{ id: 'treatment', kind: 'medical', crewId: 'radio', targetId: crew.id, completeRound: 2 }];
  assert.equal(crewStatus(state, crew).id, 'treated');
  crew.health = 'dead';
  assert.equal(crewStatus(state, crew).id, 'dead', 'a stale treatment does not obscure death');
  crew.health = 'healthy'; state.jobs = []; crew.job = 'job';
  for (const [kind, expected] of [['repair', 'repair'], ['fireControl', 'fire'], ['medical', 'medical']]) {
    state.jobs = [{ id: 'job', kind, crewId: crew.id, completeRound: 2 }];
    const status = crewStatus(state, crew);
    assert.equal(status.id, expected); assert.ok(status.icon); assert.ok(status.label);
    assert.equal(status.job.completeRound, 2);
  }
});

test('available crew count includes the acting crew until their action is committed', () => {
  const state = activated('pilot');
  assert.equal(availableCount(state), 10);
  state.crew.find(c => c.id === 'navigator').health = 'injured';
  state.crew.find(c => c.id === 'bombardier').health = 'dead';
  state.crew.find(c => c.id === 'radio').job = 'work';
  assert.equal(availableCount(state), 7);
  const result = dispatch(state, { type: 'action', action: 'wait' });
  assert.equal(availableCount(result.state), 6);
});

test('a completed actor is visibly used during the Opportunity window', () => {
  const state = activated('engineer'); state.fighters = [fighter()];
  const result = dispatch(state, { type: 'action', action: 'wait' }).state;
  assert.equal(result.phase, 'opportunity');
  assert.equal(result.activeCrew, 'engineer');
  assert.equal(crewStatus(result, result.crew.find(c => c.id === 'engineer')).id, 'used');
  assert.equal(availableCount(result), 9);
});

test('cockpit duty explains leaving for crisis work and regaining control on return', () => {
  let state = activated('pilot');
  const pilot = () => state.crew.find(c => c.id === 'pilot');
  assert.equal(stationStatus(state, pilot()).label, 'CONTROLLING AIRCRAFT');
  state.crew.find(c => c.id === 'radio').health = 'injured';
  state = dispatch(state, { type: 'action', action: 'medical', targetId: 'radio' }).state;
  const working = stationStatus(state, pilot());
  assert.equal(working.operating, false); assert.match(working.label, /UNCONTROLLED/);
  assert.equal(working.job.kind, 'medical');
  assert.equal(working.position, pilot().position.join(' + '));
  state = dispatch({ ...state, phase: 'ready' }, { type: 'startRound' }).state;
  assert.match(stationStatus(state, pilot()).label, /UNCONTROLLED/, 'the worker remains busy for the complete following round');
  state = dispatch({ ...state, phase: 'ready' }, { type: 'startRound' }).state;
  assert.equal(stationStatus(state, pilot()).label, 'CONTROLLING AIRCRAFT');
  assert.equal(stationStatus(state, pilot()).job, null);
});

test('action groups distinguish person role abilities from currently operated stations', () => {
  for (const id of ['repair', 'fireControl', 'medical', 'relocate', 'wait']) assert.equal(actionGroup(id), 'General Actions');
  for (const id of ['directFire', 'convert', 'rotateFighter', 'escort']) assert.equal(actionGroup(id), 'Role Actions');
  for (const id of ['basicFire', 'advancedFire', 'restartEngine', 'manCockpit', 'reclaimHome']) assert.equal(actionGroup(id), 'Station Actions');
});

test('a straddling crew token center preserves the entire mapped hit footprint', () => {
  for (const station of Object.values(STATIONS)) {
    const before = [...station.cells], center = footprintCenter(station.cells);
    assert.ok(center);
    assert.deepEqual(center, { x: station.cells.reduce((sum, id) => sum + getCell(id).x + .5, 0) / station.cells.length,
      y: station.cells.reduce((sum, id) => sum + getCell(id).y + .5, 0) / station.cells.length });
    assert.deepEqual(station.cells, before);
  }
  assert.equal(footprintCenter([]), null);
});
