import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { dispatch } from '../rules.mjs';
import { ResolutionQueue } from '../queue.mjs';
import { advanceVisual, describeEvent, eventDelay, groupEvents } from '../presentation.mjs';
import { fighter } from './fixtures.mjs';

const initial = () => createGame({}, 'continuous-presentation', 'v2-continuous');
const raw = (state, type, metadata = {}) => ({ type, message: type, state: structuredClone(state), ...metadata });
const result = events => ({ state: events.at(-1).state, events });

function checkpointSequence() {
  const state = initial();
  state.time = 4; state.timeTokens = ['Time', 'Time', 'Time', 'Time']; state.pendingProgress = true;
  const advanced = structuredClone(state); advanced.mission.position = 1;
  const refilled = structuredClone(advanced);
  refilled.time = 0; refilled.timeTokens = []; refilled.pendingProgress = false;
  return { state, events: [
    raw(state, 'PROGRESS_STARTED'),
    raw(state, 'CHECKPOINT_JOBS_COMPLETED', { message: 'All work due from this Time is complete. No work is repeated.' }),
    raw(state, 'FIRE_PHASE_STARTED', { message: 'Fire phase: 0 unsuppressed fire groups; 0 squares under suppression.' }),
    raw(state, 'AIRCRAFT_CONDITION_CHECKED'),
    ...['control', 'structure', 'engines'].flatMap(cause => [
      raw(state, 'ALTITUDE_CHECK', { cause, minimum: 0 }),
      raw(state, 'ALTITUDE_MAINTAINED', { cause, message: `${cause}: altitude maintained without a roll.` }),
    ]),
    raw(advanced, 'MISSION_ADVANCED'),
    raw(refilled, 'MISSION_BAG_REFILLED'),
    raw(refilled, 'COMBAT_BAG_REFILLED'),
    raw(refilled, 'PROGRESS_BAGS_REFILLED'),
    raw(refilled, 'PROGRESS_COMPLETED'),
  ] };
}

test('V2 safe checkpoint checks are inspectable while V1 retains its compact fire/altitude behavior', () => {
  const v2 = initial(), v1 = createGame();
  for (const event of [
    { type: 'FIRE_PHASE_STARTED', message: 'Fire phase: 0 unsuppressed fire groups; 0 squares under suppression.' },
    { type: 'ALTITUDE_CHECK', cause: 'control', minimum: 0 },
  ]) {
    for (const context of [{ state: v2 }, { ruleset: 'v2-continuous' }]) {
      assert.equal(describeEvent({ ...event, ...context }).major, true);
      assert.equal(eventDelay({ ...event, ...context }, 'manual'), Infinity);
      assert.ok(eventDelay({ ...event, ...context }, 'normal') >= 500);
    }
    assert.equal(describeEvent({ ...event, state: v1 }).major, false);
    assert.equal(eventDelay({ ...event, state: v1 }, 'manual'), 0);
    assert.equal(describeEvent(event).major, false, 'older V1 logs lacking identity preserve their timing');
  }
});

for (const speed of ['manual', 'normal']) test(`V2 ${speed} checkpoint presents jobs, fire, conditions, all altitude causes, movement and refill in order`, t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, events } = checkpointSequence();
  const queue = new ResolutionQueue({ state, dispatch: () => result(events) });
  const expected = ['PROGRESS_STARTED', 'CHECKPOINT_JOBS_COMPLETED', 'FIRE_PHASE_STARTED', 'AIRCRAFT_CONDITION_CHECKED',
    'ALTITUDE_CHECK', 'ALTITUDE_CHECK', 'ALTITUDE_CHECK', 'MISSION_ADVANCED', 'PROGRESS_BAGS_REFILLED', 'PROGRESS_COMPLETED'];
  try {
    queue.setSpeed(speed); queue.send({});
    for (const [index, type] of expected.entries()) {
      assert.equal(queue.current.type, type);
      assert.equal(queue.current.ruleset, 'v2-continuous');
      assert.equal(describeEvent(queue.current).major, true, 'stripping snapshot from current beat must retain V2 timing');
      if (index < 7) assert.equal(queue.view.mission.position, 0);
      else assert.equal(queue.view.mission.position, 1);
      if (index < 8) assert.equal(queue.view.time, 4);
      else assert.equal(queue.view.time, 0);
      if (speed === 'manual') {
        const before = queue.current;
        t.mock.timers.tick(100000);
        assert.equal(queue.current, before, 'manual never skips even an uneventful checkpoint stage');
        queue.step();
      } else {
        const delay = eventDelay(queue.current, speed, queue.state.config);
        assert.ok(delay >= 500);
        t.mock.timers.tick(delay - 1);
        assert.equal(queue.current.type, type);
        t.mock.timers.tick(1);
      }
    }
    assert.equal(queue.busy, false);
    assert.deepEqual(queue.log.map(event => event.type), events.map(event => event.type));
    assert.deepEqual(queue.view, result(events).state);
    assert.equal(queue.view.rng, state.rng);
  } finally { queue.dispose(); }
});

test('V2 Time-driven job countdown displays its numerical remaining Time before completion and preserves resume', () => {
  const state = initial();
  state.jobs = [{ id: 'job-1', kind: 'fireControl', crewId: 'radio', cells: ['B2-4'], remainingTime: 1 }];
  const time = structuredClone(state); time.time = 1; time.timeTokens = ['Time'];
  const decremented = structuredClone(time); decremented.jobs[0].remainingTime = 0;
  const completed = structuredClone(decremented); completed.jobs = [];
  const events = [raw(time, 'TIME_GAINED'), raw(decremented, 'WORK_TIME_ADVANCED', { jobId: 'job-1', crewId: 'radio', remainingTime: 0 }),
    raw(decremented, 'WORK_COMPLETING', { crewId: 'radio' }), raw(completed, 'FIRE_EXTINGUISHED', { cellId: 'B2-4' }), raw(completed, 'CREW_ACTION_READY')];
  const queue = new ResolutionQueue({ state, dispatch: () => result(events) });
  let restored;
  try {
    queue.setSpeed('manual'); queue.send({});
    assert.equal(queue.view.jobs[0].remainingTime, 1);
    queue.step();
    assert.equal(queue.current.type, 'WORK_TIME_ADVANCED');
    assert.equal(describeEvent(queue.current).title, 'FIRE CONTROL · 0 TIME REMAINING');
    assert.equal(queue.current.jobId, 'job-1');
    assert.equal(queue.current.remainingTime, 0);
    assert.equal(queue.view.jobs[0].remainingTime, 0);
    assert.deepEqual(queue.visual.jobCountdown, { jobId: 'job-1', remainingTime: 0 });
    restored = new ResolutionQueue({ state, dispatch: () => result(events), saved: structuredClone(queue.export()) });
    assert.equal(describeEvent(restored.current).title, 'FIRE CONTROL · 0 TIME REMAINING');
    assert.equal(restored.view.jobs[0].remainingTime, 0);
    restored.step();
    assert.equal(restored.current.type, 'WORK_COMPLETING');
    restored.step();
    assert.equal(restored.current.type, 'FIRE_EXTINGUISHED');
    assert.deepEqual(restored.view.jobs, []);
    restored.step();
    assert.equal(restored.visual.jobCountdown, null);
    assert.equal(restored.busy, false);
  } finally { queue.dispose(); restored?.dispose(); }
});

test('V2 positive Engagement countdown has its own visible beat without changing fighter position', () => {
  const state = initial(); state.fighters = [fighter('f1', { engagementRemaining: 5, facing: 90 })];
  const spent = structuredClone(state); spent.fighters[0].engagementRemaining = 4;
  const events = [raw(state, 'FIGHTER_ROTATED', { fighterId: 'f1', facing: 90 }), raw(spent, 'ENGAGEMENT_SPENT', { fighterId: 'f1' }), raw(spent, 'CREW_SELECTION_READY')];
  const queue = new ResolutionQueue({ state, dispatch: () => result(events) });
  try {
    queue.setSpeed('manual'); queue.send({});
    assert.equal(queue.view.fighters[0].engagementRemaining, 5);
    queue.step();
    assert.equal(queue.current.type, 'ENGAGEMENT_SPENT');
    assert.equal(describeEvent(queue.current).title, 'BF-109 · 4 ENGAGEMENT REMAINING');
    assert.equal(queue.view.fighters[0].engagementRemaining, 4);
    assert.equal(queue.view.fighters[0].quadrant, state.fighters[0].quadrant);
    assert.equal(eventDelay(queue.current, 'manual'), Infinity);
    queue.step();
    assert.equal(queue.busy, false);
  } finally { queue.dispose(); }
});

test('V2 zero Engagement shows BREAKS OFF before removal, distinctly from a kill, including saved queue resume', () => {
  const state = initial(); state.fighters = [fighter('f1', { engagementRemaining: 1, disrupted: false })];
  const zero = structuredClone(state); zero.fighters[0].engagementRemaining = 0;
  const removed = structuredClone(zero); removed.fighters = [];
  const events = [raw(state, 'FIGHTER_MOVED', { fighterId: 'f1' }), raw(zero, 'ENGAGEMENT_SPENT', { fighterId: 'f1' }),
    raw(zero, 'FIGHTER_BREAKING_OFF', { fighterId: 'f1', enemyType: 'BF-109' }),
    raw(removed, 'FIGHTER_DISENGAGED', { fighterId: 'f1' }), raw(removed, 'CREW_SELECTION_READY')];
  const queue = new ResolutionQueue({ state, dispatch: () => result(events) });
  let restored;
  try {
    queue.visual = { token: { value: 'Hit' }, shooterId: 'engineer', attackerId: 'f1', attackResult: 'disrupted', focusCell: 'C2-2' };
    queue.setSpeed('manual'); queue.send({});
    queue.step();
    assert.equal(queue.current.type, 'FIGHTER_BREAKING_OFF');
    assert.equal(describeEvent(queue.current).title, 'BF-109 BREAKS OFF');
    assert.equal(describeEvent(queue.current).category, 'departure');
    assert.equal(describeEvent({ type: 'FIGHTER_DESTROYED' }).category, 'gunfire');
    assert.equal(queue.view.fighters.length, 1, 'fighter must remain in the visible snapshot during departure');
    assert.equal(queue.view.fighters[0].engagementRemaining, 0);
    assert.equal(queue.state.fighters.length, 0, 'resolved rules can already know the departure without revealing it early');
    assert.equal(queue.visual.departingFighter, 'f1');
    assert.equal(queue.visual.activeFighterId, 'f1');
    for (const field of ['token', 'shooterId', 'attackerId', 'attackResult', 'focusCell']) assert.equal(queue.visual[field], null);
    assert.equal(queue.log.some(event => event.type === 'FIGHTER_DISENGAGED'), false);
    restored = new ResolutionQueue({ state, dispatch: () => result(events), saved: structuredClone(queue.export()) });
    assert.equal(restored.visual.departingFighter, 'f1');
    assert.equal(restored.view.fighters.length, 1);
    restored.step();
    assert.equal(restored.view.fighters.length, 0);
    assert.equal(restored.visual.departingFighter, null);
    assert.equal(restored.visual.activeFighterId, null);
    assert.equal(restored.busy, false);
    assert.equal(restored.log.filter(event => event.type === 'FIGHTER_DISENGAGED').length, 1);
    assert.equal(restored.view.stats.fightersKilled, 0);
  } finally { queue.dispose(); restored?.dispose(); }
});

test('V2 checkpoint clears stale attack graphics and recorder keeps countdown/departure stages distinct', () => {
  const visual = advanceVisual({ token: { value: 'Burst' }, shooterId: 'engineer', activeFighterId: 'f1', attackResult: 'disrupted', departingFighter: 'f1' }, { type: 'PROGRESS_STARTED' });
  for (const field of ['token', 'shooterId', 'activeFighterId', 'attackResult', 'departingFighter']) assert.equal(visual[field], null);
  const events = ['TIME_GAINED', 'WORK_TIME_ADVANCED', 'PROGRESS_STARTED', 'CHECKPOINT_JOBS_COMPLETED', 'AIRCRAFT_CONDITION_CHECKED', 'PROGRESS_BAGS_REFILLED', 'FIGHTER_BREAKING_OFF', 'FIGHTER_DISENGAGED']
    .map((type, index) => ({ type, sequence: index + 1, ruleset: 'v2-continuous', message: type }));
  const groups = groupEvents(events);
  assert.deepEqual(groups.flatMap(group => group.events), events);
  for (const type of ['WORK_TIME_ADVANCED', 'CHECKPOINT_JOBS_COMPLETED', 'AIRCRAFT_CONDITION_CHECKED', 'PROGRESS_BAGS_REFILLED', 'FIGHTER_BREAKING_OFF']) assert.ok(groups.some(group => group.events[0].type === type));
  assert.equal(describeEvent({ type: 'FIGHTER_DISENGAGED' }).major, false);
});

test('V2 real rule events hold the departing fighter before ordered checkpoint snapshots are presented', () => {
  let state = createGame({ opportunityEnabled: false, v2TimePerProgress: 1 }, 'real-checkpoint', 'v2-continuous');
  state.bags.mission = { tokens: ['Time'], discard: [] };
  state.fighters = [fighter('last-pass', { engagementRemaining: 1, facing: 180 })];
  state = dispatch(state, { type: 'activate', crewId: 'pilot' }).state;
  const queue = new ResolutionQueue({ state, dispatch });
  const visible = [];
  try {
    queue.setSpeed('manual'); queue.send({ type: 'action', action: 'wait' });
    while (queue.busy) {
      visible.push(queue.current.type);
      if (queue.current.type === 'FIGHTER_BREAKING_OFF') {
        assert.equal(queue.view.fighters[0].id, 'last-pass');
        assert.equal(queue.view.fighters[0].engagementRemaining, 0);
        assert.equal(queue.visual.departingFighter, 'last-pass');
        assert.equal(queue.view.mission.position, 0);
      }
      if (queue.current.type === 'PROGRESS_STARTED') {
        assert.equal(queue.view.fighters.length, 0);
        assert.equal(queue.visual.departingFighter, null);
        assert.equal(queue.view.mission.position, 0);
      }
      queue.step();
    }
    const ordered = ['FIGHTER_BREAKING_OFF', 'PROGRESS_STARTED', 'CHECKPOINT_JOBS_COMPLETED', 'FIRE_PHASE_STARTED',
      'AIRCRAFT_CONDITION_CHECKED', 'ALTITUDE_CHECK', 'MISSION_ADVANCED', 'PROGRESS_BAGS_REFILLED', 'PROGRESS_COMPLETED'];
    let previous = -1;
    for (const type of ordered) {
      const index = visible.indexOf(type);
      assert.ok(index > previous, `${type} is a visible, correctly ordered rule event`);
      previous = index;
    }
    assert.equal(visible.includes('FIGHTER_DISENGAGED'), false);
    assert.equal(queue.view.mission.position, 1);
    assert.equal(queue.view.time, 0);
    assert.equal(queue.view.fighters.length, 0);
  } finally { queue.dispose(); }
});
