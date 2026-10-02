import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { dispatch, availableCrew } from '../rules.mjs';
import { missionLengths } from '../rulesets.mjs';
import { canTurnBack } from '../turn-back.mjs';
import { SAVE_KEY, loadSession } from '../persistence.mjs';
import { createCampaignStore, createCampaign, prepareCampaignSortie, finalizeCampaignSortie } from '../campaign.mjs';
import { fighter } from './fixtures.mjs';

function setup(position = 2) {
  let next = 0; const idFactory = () => `turn-back-${++next}`;
  const created = createCampaign(createCampaignStore(), { idFactory });
  const prepared = prepareCampaignSortie(created.store, created.campaign.id,
    createGame({ v2MissionEnemy: 0, v2MissionResource: 0, v2MissionTime: 10, opportunityEnabled: false }, 'turn-back', 'v2-continuous'), { aircraftId: created.campaign.currentAircraftId, idFactory });
  prepared.state.mission.position = position;
  return prepared;
}

for (const distance of [2, 5, 7]) test(`Turn Back at outbound ${distance} requires exactly ${distance} more Progress to HOME`, () => {
  const { state, store } = setup(distance); assert.equal(canTurnBack(state), true);
  let result = dispatch(state, { type: 'turnBack', confirmed: true }), current = result.state;
  const events = [...result.events];
  assert.equal(current.mission.position, distance); assert.equal(current.mission.aborted, true);
  assert.deepEqual(missionLengths(current), { outboundLength: distance, returnLength: distance });
  let progress = 0;
  for (let guard = 0; guard < 200 && current.phase !== 'ended'; guard++) {
    const command = current.phase === 'select' ? { type: 'activate', crewId: availableCrew(current)[0].id } : { type: 'action', action: 'wait' };
    result = dispatch(current, command); current = result.state; events.push(...result.events);
    progress += result.events.filter(event => event.type === 'MISSION_ADVANCED').length;
  }
  assert.equal(current.outcome, 'success'); assert.equal(current.mission.position, distance * 2);
  assert.equal(progress, distance); assert.equal(current.stats.turns, distance * 4);
  assert.ok(!events.some(event => /^BOMBING_|^BOMB_RUN_/.test(event.type)));
  const finished = finalizeCampaignSortie(store, current, events);
  assert.equal(finished.record.result, 'ABORTED — AIRCRAFT RETURNED'); assert.equal(finished.record.missionLength, distance * 2);
  assert.equal(finished.store.campaigns[0].stats.cumulativeBombingScore, 0); assert.equal(finished.store.campaigns[0].stats.completedMissions, 0);
});

test('Turn Back is free and preserves fighters, positions, damage, fires, work, clocks, escorts, inventories, RNG and crew actions', () => {
  const { state } = setup(5);
  state.fighters = [fighter('still-attacking', { engagementRemaining: 4, heading: 180 })]; state.cells['E3-1'] = 'fire'; state.cells['D3-1'] = 'damaged';
  state.jobs = [{ id: 'ongoing-repair', kind: 'repair', crewId: 'engineer', remainingTime: 3, cells: ['D3-1'], workCellId: 'C3-2' }];
  Object.assign(state.crew.find(member => member.id === 'engineer'), { job: 'ongoing-repair', position: ['C3-2'], station: null });
  state.escorts = [{ id: 'escort', quadrant: 'Fore' }]; state.altitude = 3; state.time = 2; state.timeTokens = ['Time', 'Time'];
  state.bags.mission.tokens.splice(0, 2); state.resources.Officer = 2;
  const before = structuredClone(state), result = dispatch(state, { type: 'turnBack', confirmed: true });
  for (const key of ['fighters', 'cells', 'jobs', 'crew', 'engines', 'altitude', 'resources', 'bags', 'deck', 'time', 'timeTokens', 'overflowTimeTokens', 'escorts', 'rng', 'crewCycle', 'stats', 'opportunity'])
    assert.deepEqual(result.state[key], before[key], key);
  assert.deepEqual(state, before, 'dispatch remains transactional');
  assert.equal(result.events.length, 1); assert.equal(result.events[0].type, 'MISSION_ABORTED');
  assert.match(result.events[0].message, /MISSION ABORTED.*RETURNING HOME/);
  const session = { version: 1, presentationVersion: 2, state: result.state, view: before, pending: result.events, log: [], current: null, speed: 'manual' };
  assert.deepEqual(loadSession({ getItem: key => key === SAVE_KEY ? JSON.stringify(session) : null }), session);
});

test('Turn Back requires explicit confirmation and rejects standalone, action, Opportunity, pending checkpoint, return and completed bombing', () => {
  const { state } = setup();
  for (const command of [{ type: 'turnBack' }, { type: 'turnBack', confirmed: false }, { type: 'turnBack', confirmed: 'true' }]) assert.throws(() => dispatch(state, command), /Confirm/);
  const variants = [value => delete value.campaign, value => value.ruleset = 'v1', value => value.phase = 'action', value => value.phase = 'opportunity',
    value => value.phase = 'betweenOpportunity', value => value.pendingProgress = true, value => value.activeCrew = 'pilot',
    value => value.mission.bombed = true, value => value.mission.aborted = true, value => value.mission.position = 9,
    value => value.outcome = 'destroyed'];
  for (const change of variants) {
    const invalid = structuredClone(state); change(invalid); const before = structuredClone(invalid);
    assert.equal(canTurnBack(invalid), false); assert.throws(() => dispatch(invalid, { type: 'turnBack', confirmed: true }));
    assert.deepEqual(invalid, before);
  }
});

test('campaign may turn back at TARGET before committing a Bomb Run and receives no credit for provisional dice', () => {
  const { state, store } = setup(8); state.phase = 'bombing';
  state.mission.bombRun = { version: 1, target: { id: 'bremen', name: 'Bremen' }, status: 'placing', dice: [3, 4, 5, 6],
    placement: { course: 0, drift: 1, release: 2 }, unusedDie: 3, committedScore: null, slotScores: null,
    outcome: null, officerRerollsSpent: 0, freeRerollUsed: false };
  assert.equal(canTurnBack(state), true);
  const result = dispatch(state, { type: 'turnBack', confirmed: true });
  assert.equal(result.state.phase, 'select'); assert.equal(result.state.mission.abortProgress, 8);
  assert.deepEqual(result.state.mission.bombRun.dice, [3, 4, 5, 6]);
  result.state.phase = 'ended'; result.state.outcome = 'success'; result.state.mission.position = 16;
  const finished = finalizeCampaignSortie(store, result.state);
  assert.equal(finished.record.bombing.status, 'aborted'); assert.equal(finished.record.bombing.score, null);
  assert.deepEqual(finished.store.campaigns[0].stats.bombingOutcomes, {});
});

test('destruction on the return after abort records aircraft loss, kills and KIA with no bombing credit', () => {
  const { state, store } = setup(2);
  let result = dispatch(state, { type: 'turnBack', confirmed: true }), current = result.state;
  current.altitude = 1; current.engines.forEach(engine => engine.running = false);
  current.crew.find(member => member.id === 'tail').health = 'dead'; current.stats.fightersKilled = 1;
  current.time = 4; current.timeTokens = ['Time', 'Time', 'Time', 'Time']; current.bags.mission.tokens.splice(0, 4); current.pendingProgress = true;
  result = dispatch(current, { type: 'continueProgress' });
  assert.equal(result.state.outcome, 'destroyed'); assert.equal(result.state.endReason.cause, 'altitude');
  assert.equal(result.state.mission.position, 2, 'fatal checkpoint never advances physical Progress');
  const finalized = finalizeCampaignSortie(store, result.state, [{ type: 'FIGHTER_DESTROYED', fighterId: 'f1', crewId: 'engineer' }, { type: 'CREW_KILLED', crewId: 'tail' }]);
  assert.equal(finalized.record.result, 'ABORTED — AIRCRAFT LOST'); assert.equal(finalized.record.bombing.score, null);
  assert.equal(finalized.store.campaigns[0].stats.planesLost, 1); assert.equal(finalized.store.campaigns[0].stats.crewKIA, 1);
  assert.equal(finalized.store.campaigns[0].stats.fightersDestroyed, 1); assert.equal(finalized.store.campaigns[0].stats.completedMissions, 0);
});

test('abort at HOME records an immediate survived abort without consuming a crew turn', () => {
  const { state, store } = setup(0), result = dispatch(state, { type: 'turnBack', confirmed: true });
  assert.equal(result.state.outcome, 'success'); assert.equal(result.state.phase, 'ended'); assert.equal(result.state.stats.turns, 0);
  assert.equal(finalizeCampaignSortie(store, result.state).record.missionLength, 0);
});
