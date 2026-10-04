import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { dispatch } from '../rules.mjs';
import { fighter, rngForIndexes } from './fixtures.mjs';

const v2 = overrides => createGame({
  v2StoryMode: false, opportunityEnabled: true, startingOpportunity: 2, v2MissionEnemy: 0,
  v2MissionResource: 20, v2MissionTime: 20, ...overrides,
}, 'opportunity-phase-test', 'v2-continuous');

function readyShot(state, { hp = 9, tokens = ['Miss', 'Miss'], targetId = 'target' } = {}) {
  state.phase = 'select';
  state.fighters = [fighter(targetId, { hp, maxHp: hp, facing: 90, engagementRemaining: 8 })];
  state.opportunity = Math.min(2, state.config.opportunityCap);
  Object.assign(state.crew.find(crew => crew.id === 'engineer'), { used: true, activationCompleted: true });
  state.bags.combat = { tokens: [...tokens], discard: [] };
  state.rng = rngForIndexes([tokens.length], [0]);
  return state;
}

const eventsOf = (result, type) => result.events.filter(event => event.type === type);

test('V2 Opportunity Provokes Enemy Phase defaults OFF and between-turn shots keep current behavior', () => {
  const state = readyShot(v2());
  assert.equal(state.config.v2OpportunityProvokesEnemyPhase, false);
  const shot = dispatch(state, { type: 'opportunityShot', gunnerId: 'engineer', targetId: 'target' });
  assert.equal(shot.state.phase, 'select');
  assert.equal(eventsOf(shot, 'ENEMY_PHASE_STARTED').length, 0);
  assert.throws(() => dispatch(shot.state, { type: 'continueBetweenOpportunity' }));
  const activation = dispatch(shot.state, { type: 'activate', crewId: 'pilot' });
  assert.equal(eventsOf(activation, 'ENEMY_PHASE_STARTED').length, 0);
  assert.equal(activation.state.phase, 'action');
});

test('the V2 experiment opens one between-turn sequence and resolves exactly one enemy phase before activation', () => {
  const state = readyShot(v2({ v2OpportunityProvokesEnemyPhase: true }));
  const shot = dispatch(state, { type: 'opportunityShot', gunnerId: 'engineer', targetId: 'target' });
  assert.equal(shot.state.phase, 'betweenOpportunity');
  assert.equal(eventsOf(shot, 'ENEMY_PHASE_STARTED').length, 0);
  assert.throws(() => dispatch(shot.state, { type: 'activate', crewId: 'pilot' }), /crew selection phase/i);
  const closed = dispatch(shot.state, { type: 'continueBetweenOpportunity' });
  assert.equal(eventsOf(closed, 'ENEMY_PHASE_STARTED').length, 1);
  assert.equal(closed.state.phase, 'select');
  assert.equal(closed.state.slot, state.slot);
  assert.equal(closed.state.stats.missionDraws, state.stats.missionDraws);
  const activation = dispatch(closed.state, { type: 'activate', crewId: 'pilot' });
  assert.equal(eventsOf(activation, 'ENEMY_PHASE_STARTED').length, 0);
  assert.equal(activation.state.phase, 'action');
});

test('multiple Opportunity Shots in one open sequence still provoke one enemy phase', () => {
  const state = readyShot(v2({ v2OpportunityProvokesEnemyPhase: true }), { hp: 10, tokens: ['Hit', 'Hit'] });
  state.rng = rngForIndexes([2], [0]);
  const first = dispatch(state, { type: 'opportunityShot', gunnerId: 'engineer', targetId: 'target' });
  const second = dispatch(first.state, { type: 'opportunityShot', gunnerId: 'engineer', targetId: 'target' });
  assert.equal(second.state.phase, 'betweenOpportunity');
  assert.equal(second.state.opportunity, 0);
  assert.equal(second.state.fighters[0].hp, 8);
  assert.equal(eventsOf(first, 'ENEMY_PHASE_STARTED').length + eventsOf(second, 'ENEMY_PHASE_STARTED').length, 0);
  const closed = dispatch(second.state, { type: 'continueBetweenOpportunity' });
  assert.equal(eventsOf(closed, 'ENEMY_PHASE_STARTED').length, 1);
});

test('pending Progress from a between-turn Opportunity kill resolves before any experimental enemy phase', () => {
  const state = readyShot(v2({
    v2OpportunityProvokesEnemyPhase: true, v2MissionTime: 1, v2TimePerProgress: 1,
    v2FighterKillGrantsTime: true,
  }), { hp: 1, tokens: ['Hit'] });
  state.opportunity = 1;
  state.bags.mission = { tokens: ['Time'], discard: [] };
  state.bags.combat = { tokens: ['Hit'], discard: [] };
  state.rng = 1;
  const shot = dispatch(state, { type: 'opportunityShot', gunnerId: 'engineer', targetId: 'target' });
  assert.equal(shot.state.pendingProgress, true);
  assert.equal(shot.state.phase, 'betweenOpportunity');
  assert.equal(eventsOf(shot, 'ENEMY_PHASE_STARTED').length, 0);
  assert.throws(() => dispatch(shot.state, { type: 'continueBetweenOpportunity' }), /experimental between-turn/i);
  const progress = dispatch(shot.state, { type: 'continueProgress' });
  assert.equal(eventsOf(progress, 'PROGRESS_STARTED').length, 1);
  assert.equal(eventsOf(progress, 'ENEMY_PHASE_STARTED').length, 0);
  assert.equal(progress.state.pendingProgress, false);
  assert.equal(progress.state.phase, 'select');
});

test('the V2-only experiment does not add between-turn enemy phases to V1', () => {
  let state = createGame({ v2OpportunityProvokesEnemyPhase: true }, 'opportunity-v1-test', 'v1');
  state = dispatch(state, { type: 'startRound' }).state;
  state = dispatch(state, { type: 'activate', crewId: 'engineer' }).state;
  state = dispatch(state, { type: 'action', action: 'wait' }).state;
  if (state.phase === 'opportunity') state = dispatch(state, { type: 'continueEnemyPhase' }).state;
  const target = fighter('v1-target', { facing: 90, hp: 9, maxHp: 9 });
  state.phase = 'select'; state.fighters = [target];
  Object.assign(state.crew.find(crew => crew.id === 'engineer'), { used: true, activationCompleted: true });
  state.bags.combat = { tokens: ['Miss'], discard: [] };
  const shot = dispatch(state, { type: 'opportunityShot', gunnerId: 'engineer', targetId: target.id });
  assert.equal(shot.state.phase, 'select');
  assert.equal(eventsOf(shot, 'ENEMY_PHASE_STARTED').length, 0);
});
