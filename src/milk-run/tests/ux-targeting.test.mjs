import test from 'node:test';
import assert from 'node:assert/strict';
import { beginTargeting, targetOptions, selectTarget, canConfirm, targetingCommand, selectableGunners } from '../targeting.mjs';
import { activated, fighter } from './fixtures.mjs';

test('direct targeting accepts one legal fighter and rejects illegal or stale targets without mutation', () => {
  const state = activated('navigator');
  state.fighters = [fighter('fore'), fighter('aft', { quadrant: 'Aft' }), fighter('low', { altitude: 'Low' })];
  const original = structuredClone(state), initial = beginTargeting('advancedFire', 'navigator');
  assert.deepEqual(targetOptions(state, initial).fighters, ['fore']);
  assert.equal(selectTarget(state, initial, 'fighter', 'aft'), initial);
  assert.equal(selectTarget(state, initial, 'fighter', 'low'), initial);
  const selected = selectTarget(state, initial, 'fighter', 'fore');
  assert.equal(canConfirm(state, selected), true);
  assert.deepEqual(targetingCommand(selected), { type: 'action', action: 'advancedFire', targetId: 'fore' });
  assert.deepEqual(state, original);
  state.fighters = [];
  assert.equal(canConfirm(state, selected), false, 'a no-longer-present target cannot be submitted');
});

test('same-sector fighters remain independently selectable by identity', () => {
  const state = activated(); state.fighters = [fighter('one'), fighter('two'), fighter('three')];
  const initial = beginTargeting('basicFire', 'engineer');
  assert.deepEqual(targetOptions(state, initial).fighters, ['one', 'two', 'three']);
  for (const id of ['one', 'two', 'three']) assert.equal(selectTarget(state, initial, 'fighter', id).targetId, id);
});

test('Opportunity Shot selects a completed gunner during its window then that gunner\'s legal fighter', () => {
  const state = activated('pilot'); state.phase = 'opportunity';
  Object.assign(state.crew.find(c => c.id === 'navigator'), { used: true, activationCompleted: true });
  state.fighters = [fighter('fore'), fighter('aft', { quadrant: 'Aft' })];
  assert.deepEqual(selectableGunners(state).map(c => c.id), ['navigator']);
  const initial = beginTargeting('opportunityShot', 'pilot');
  assert.equal(initial.stage, 'gunner'); assert.equal(canConfirm(state, initial), false);
  assert.equal(selectTarget(state, initial, 'crew', 'engineer'), initial);
  const gunner = selectTarget(state, initial, 'crew', 'navigator');
  assert.equal(gunner.stage, 'target'); assert.deepEqual(targetOptions(state, gunner).fighters, ['fore']);
  const selected = selectTarget(state, gunner, 'fighter', 'fore');
  assert.equal(canConfirm(state, selected), true);
  assert.deepEqual(targetingCommand(selected), { type: 'opportunityShot', targetId: 'fore', gunnerId: 'navigator' });
});

test('board repair targeting enforces connected caps and separately requires an internal work position', () => {
  const state = activated('engineer', { repairCap: 2, engineerBonus: 0 });
  for (const id of ['A3-1', 'A3-2', 'B3-1', 'C6-2']) state.cells[id] = 'damaged';
  const initial = beginTargeting('repair', 'engineer'), before = structuredClone(state);
  const primary = selectTarget(state, initial, 'cell', 'A3-1');
  assert.equal(selectTarget(state, primary, 'cell', 'C6-2'), primary, 'disconnected square is not selectable');
  const both = selectTarget(state, primary, 'cell', 'A3-2');
  assert.deepEqual(both.cells, ['A3-1', 'A3-2']);
  assert.equal(selectTarget(state, both, 'cell', 'B3-1'), both, 'capacity is enforced');
  assert.equal(canConfirm(state, both), false, 'selecting repair squares alone cannot start work');
  const work = { ...both, stage: 'work' };
  assert.ok(targetOptions(state, work).work.includes('C3-2'), 'occupied two-square crew footprint does not block work');
  assert.equal(selectTarget(state, work, 'cell', 'A3-1'), work, 'a wing square is never a physical work position');
  const positioned = selectTarget(state, work, 'cell', 'C3-2');
  assert.equal(canConfirm(state, positioned), true);
  assert.deepEqual(targetingCommand(positioned), { type: 'action', action: 'repair', cells: ['A3-1', 'A3-2'], workCellId: 'C3-2' });
  assert.deepEqual(state, before, 'selection leaves rules state untouched until confirmation');
});

test('medical targets injured crew directly and excludes deaths and patients already receiving care', () => {
  const state = activated('pilot');
  state.crew.find(c => c.id === 'radio').health = 'injured';
  state.crew.find(c => c.id === 'engineer').health = 'injured';
  state.crew.find(c => c.id === 'tail').health = 'dead';
  state.jobs = [{ id: 'existing', kind: 'medical', targetId: 'engineer', crewId: 'copilot', completeRound: 2 }];
  const initial = beginTargeting('medical', 'pilot');
  assert.deepEqual(targetOptions(state, initial).crew, ['radio']);
  assert.equal(selectTarget(state, initial, 'crew', 'tail'), initial);
  const patient = selectTarget(state, initial, 'crew', 'radio');
  assert.equal(canConfirm(state, patient), false);
  const work = selectTarget(state, { ...patient, stage: 'work' }, 'cell', 'D3-1');
  assert.equal(canConfirm(state, work), true);
});

test('medical targeting excludes patients without any safe interior work position on their row', () => {
  const state = activated('pilot');
  state.crew.find(c => c.id === 'radio').health = 'injured';
  state.crew.find(c => c.id === 'tail').health = 'injured';
  for (const id of ['C3-2', 'C3-4', 'D3-1', 'D3-3']) state.cells[id] = 'fire';
  const initial = beginTargeting('medical', 'pilot');
  assert.deepEqual(targetOptions(state, initial).crew, ['tail']);
  assert.equal(selectTarget(state, initial, 'crew', 'radio'), initial);
  assert.ok(targetOptions(state, selectTarget(state, initial, 'crew', 'tail')).work.length > 0);
});
