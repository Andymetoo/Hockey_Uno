import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { STATIONS } from '../board.mjs';
import { die } from '../random.mjs';
import { saveSession, loadSession, SAVE_KEY } from '../persistence.mjs';
import { BOMBING_TARGETS, BOMBRUN_SLOTS, DEFAULT_BOMBING_TARGET, getBombingTarget,
  rangeDistance, scoreBombDie, targetOutcome, bombingOutcomeLabel, beginBombRun,
  placeBombDie, rerollBombDie, commitBombRun, bombRunPreview, bombardierOperator,
  bombRunTargetWarning, validateBombRunSnapshot, resolveBombing } from '../bombing.mjs';

const noop = () => {};
function fresh(targetId = DEFAULT_BOMBING_TARGET) {
  const state = createGame({}, 'bomb-run-regression', 'v2-continuous');
  state.phase = 'bombing';
  state.mission.position = state.config.v2OutboundLength;
  state.mission.targetId = targetId;
  return state;
}
const crew = (state, id) => state.crew.find(member => member.id === id);
const resourceCount = state => state.resources.Officer + state.resources.Enlisted +
  [...state.bags.mission.tokens, ...state.bags.mission.discard].filter(token => token === 'Resource').length;
function substitute(state, id) {
  const bombardier = crew(state, 'bombardier');
  bombardier.station = null; bombardier.displaced = true; bombardier.position = ['C3-1'];
  Object.assign(crew(state, id), { station: 'bombardier', displaced: false, position: [...STATIONS.bombardier.cells] });
}
function placeThree(state) {
  for (let index = 0; index < 3; index++) placeBombDie(state, BOMBRUN_SLOTS[index], index, noop);
}

// Every inclusive d6 range and every die face, including singleton ranges and
// both boundaries, are scored independently from the implementation formula.
for (let minimum = 1; minimum <= 6; minimum++) for (let maximum = minimum; maximum <= 6; maximum++) {
  test(`Bomb Run range ${minimum}–${maximum}: all six die faces and edges`, () => {
    const allowed = Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
    for (let value = 1; value <= 6; value++) {
      const expected = Math.min(...allowed.map(face => Math.abs(value - face)));
      assert.equal(rangeDistance(value, [minimum, maximum]), expected);
      assert.equal(scoreBombDie(value, [minimum, maximum]), [3, 2, 1, 0, 0, 0][expected]);
    }
  });
}

test('targets retain the authored ranges, thresholds and future modifier extension point', () => {
  assert.equal(DEFAULT_BOMBING_TARGET, 'bremen');
  const expected = {
    wilhelmshaven: [[[2, 5], [2, 5], [3, 5]], [7, 5, 3, 1, 0]],
    bremen: [[[3, 4], [2, 4], [4, 5]], [8, 6, 4, 1, 0]],
    schweinfurt: [[[4, 4], [2, 3], [5, 5]], [9, 7, 5, 2, 0]],
  };
  for (const [id, [ranges, thresholds]] of Object.entries(expected)) {
    const target = getBombingTarget(id);
    assert.deepEqual(Object.values(target.ranges), ranges);
    assert.deepEqual(Object.values(target.thresholds), thresholds);
    assert.deepEqual(target.modifiers, {});
    assert.throws(() => { target.ranges.course[0] = 6; }, TypeError);
  }
  assert.throws(() => getBombingTarget('unknown'), /Unknown/);
});

for (const target of Object.values(BOMBING_TARGETS)) test(`${target.name} outcomes at every score 0–9`, () => {
  const expected = {
    wilhelmshaven: ['miss', 'minimal', 'minimal', 'partial', 'partial', 'heavy', 'heavy', 'destroyed', 'destroyed', 'destroyed'],
    bremen: ['miss', 'minimal', 'minimal', 'minimal', 'partial', 'partial', 'heavy', 'heavy', 'destroyed', 'destroyed'],
    schweinfurt: ['miss', 'miss', 'minimal', 'minimal', 'minimal', 'partial', 'partial', 'heavy', 'heavy', 'destroyed'],
  }[target.id];
  assert.deepEqual(Array.from({ length: 10 }, (_, score) => targetOutcome(score, target)), expected);
});

test('invalid die faces, malformed ranges and invalid scores reject without clamping', () => {
  for (const value of [0, 7, -1, 1.5, NaN]) assert.throws(() => scoreBombDie(value, [2, 5]));
  for (const range of [[0, 6], [2, 7], [4, 3], [2], [1.5, 4]]) assert.throws(() => scoreBombDie(4, range));
  for (const score of [-1, 10, 1.5, NaN]) assert.throws(() => targetOutcome(score, getBombingTarget()));
});

test('begin rolls exactly 4d6 and snapshots the chosen target without spending a turn, action or resource', () => {
  const state = fresh('schweinfurt'), expectedRng = { rng: state.rng };
  const dice = Array.from({ length: 4 }, () => die(expectedRng));
  const before = structuredClone({ crew: state.crew, resources: state.resources, stats: state.stats, cycle: state.crewCycle });
  const events = [];
  beginBombRun(state, event => events.push(event));
  assert.deepEqual(state.mission.bombRun.dice, dice);
  assert.equal(state.rng, expectedRng.rng);
  assert.equal(state.phase, 'bombing');
  assert.equal(state.mission.bombed, false);
  assert.deepEqual({ crew: state.crew, resources: state.resources, stats: state.stats, cycle: state.crewCycle }, before);
  assert.deepEqual(state.mission.bombRun.target, getBombingTarget('schweinfurt'));
  assert.notEqual(state.mission.bombRun.target, getBombingTarget('schweinfurt'));
  assert.deepEqual(events.map(event => event.type), ['BOMBING_STARTED', 'BOMB_RUN_ROLLED']);
  assert.equal(validateBombRunSnapshot(state), true);
  const snapshot = structuredClone(state);
  assert.throws(() => beginBombRun(state, noop), /already begun/);
  assert.deepEqual(state, snapshot);
});

test('three distinct placements leave exactly one unused die; assignment swaps and clearing remain free', () => {
  const state = fresh(); beginBombRun(state, noop);
  const rng = state.rng, resources = structuredClone(state.resources);
  placeBombDie(state, 'course', 0, noop);
  placeBombDie(state, 'drift', 1, noop);
  assert.equal(state.mission.bombRun.unusedDie, null);
  placeBombDie(state, 'release', 2, noop);
  assert.deepEqual(state.mission.bombRun.placement, { course: 0, drift: 1, release: 2 });
  assert.equal(state.mission.bombRun.unusedDie, 3);
  placeBombDie(state, 'course', 1, noop);
  assert.deepEqual(state.mission.bombRun.placement, { course: 1, drift: 0, release: 2 });
  placeBombDie(state, 'release', 3, noop);
  assert.equal(state.mission.bombRun.unusedDie, 2);
  placeBombDie(state, 'drift', null, noop);
  assert.equal(state.mission.bombRun.unusedDie, null);
  assert.equal(bombRunPreview(state).complete, false);
  assert.equal(bombRunPreview(state).total, null);
  assert.equal(state.rng, rng);
  assert.deepEqual(state.resources, resources);
  assert.equal(validateBombRunSnapshot(state), true);
});

test('invalid placements and incomplete Commit leave state unchanged', () => {
  const state = fresh(); beginBombRun(state, noop);
  for (const [slot, index] of [['unknown', 0], ['course', 4], ['course', -1], ['course', 1.5]]) {
    const before = structuredClone(state);
    assert.throws(() => placeBombDie(state, slot, index, noop));
    assert.deepEqual(state, before);
  }
  placeBombDie(state, 'course', 0, noop);
  const before = structuredClone(state);
  assert.throws(() => commitBombRun(state, noop), /three different dice/);
  assert.deepEqual(state, before);
});

test('Commit records each slot, total, outcome and unused die; closes all reroll/placement commands', () => {
  const state = fresh(); beginBombRun(state, noop);
  state.mission.bombRun.dice = [3, 1, 5, 6];
  placeThree(state);
  const events = []; const result = commitBombRun(state, event => events.push(event));
  assert.deepEqual(result.slotScores, { course: 3, drift: 2, release: 3 });
  assert.equal(result.total, 8);
  assert.equal(result.outcome, 'destroyed');
  assert.equal(state.mission.bombRun.committedScore, 8);
  assert.equal(state.mission.bombRun.unusedDie, 3);
  assert.equal(state.mission.bombed, true);
  assert.equal(state.mission.bombingResult, 'destroyed');
  assert.equal(state.phase, 'select');
  assert.match(events[0].message, /COURSE 3\/3.*DRIFT 2\/3.*RELEASE 3\/3.*TOTAL 8\/9 — TARGET DESTROYED/);
  assert.equal(events[0].operatorId, 'bombardier');
  assert.equal(validateBombRunSnapshot(state), true);
  const before = structuredClone(state);
  assert.throws(() => commitBombRun(state, noop));
  assert.throws(() => placeBombDie(state, 'course', 3, noop));
  assert.throws(() => rerollBombDie(state, 3, 'free', noop));
  assert.deepEqual(state, before);
});

test('the healthy actual Bombardier gets one free reroll, even with a consumed crew slot', () => {
  const state = fresh(); Object.assign(crew(state, 'bombardier'), { used: true, cycleSlotConsumed: true });
  beginBombRun(state, noop); placeThree(state);
  assert.equal(state.mission.bombRun.freeRerollAvailable, true);
  const beforeResources = resourceCount(state), rng = { rng: state.rng };
  const expected = die(rng), placement = structuredClone(state.mission.bombRun.placement);
  rerollBombDie(state, 1, 'free', noop);
  assert.equal(state.mission.bombRun.dice[1], expected);
  assert.equal(state.rng, rng.rng);
  assert.deepEqual(state.mission.bombRun.placement, placement);
  assert.equal(state.mission.bombRun.freeRerollAvailable, false);
  assert.equal(state.mission.bombRun.freeRerollUsed, true);
  assert.equal(state.mission.bombRun.officerRerollsSpent, 0);
  assert.equal(resourceCount(state), beforeResources);
  const before = structuredClone(state);
  assert.throws(() => rerollBombDie(state, 1, 'free', noop), /unavailable/);
  assert.deepEqual(state, before);
});

for (const id of ['pilot', 'copilot', 'navigator']) test(`${id} Officer substitute can drop but gets no Bombardier reroll`, () => {
  const state = fresh(); substitute(state, id);
  crew(state, id).used = true;
  assert.equal(bombardierOperator(state).id, id);
  beginBombRun(state, noop);
  assert.equal(state.mission.bombRun.operatorId, id);
  assert.equal(state.mission.bombRun.freeRerollAvailable, false);
  assert.throws(() => rerollBombDie(state, 0, 'free', noop));
  placeThree(state); commitBombRun(state, noop);
  assert.equal(state.mission.bombed, true);
  assert.equal(validateBombRunSnapshot(state), true);
});

test('Enlisted at the bombsight can physically hold the station but causes immediate NO DROP without RNG', () => {
  const state = fresh(); substitute(state, 'engineer');
  const rng = state.rng; const events = [];
  assert.equal(bombardierOperator(state), null);
  beginBombRun(state, event => events.push(event));
  assert.equal(state.rng, rng);
  assert.equal(state.phase, 'select');
  assert.equal(state.mission.bombed, true);
  assert.equal(state.mission.bombingResult, 'no-drop');
  assert.equal(state.mission.bombRun.committedScore, null);
  assert.deepEqual(state.mission.bombRun.dice, []);
  assert.match(events[0].message, /NO DROP.*Engineer.*Enlisted.*Turning for HOME/);
  assert.equal(validateBombRunSnapshot(state), true);
});

for (const reason of ['injured', 'dead', 'displaced', 'working', 'fire', 'treated', 'elsewhere']) {
  test(`${reason} Bombardier is not operational and cannot roll or drop`, () => {
    const state = fresh(); const member = crew(state, 'bombardier');
    if (['injured', 'dead'].includes(reason)) member.health = reason;
    if (reason === 'displaced') member.displaced = true;
    if (reason === 'working') member.job = 'job1';
    if (reason === 'fire') state.cells[member.position[0]] = 'fire';
    if (reason === 'treated') state.jobs.push({ id: 'medical1', kind: 'medical', targetId: member.id });
    if (reason === 'elsewhere') { member.station = 'ball'; member.position = [...STATIONS.ball.cells]; }
    assert.equal(bombardierOperator(state), null);
    beginBombRun(state, noop);
    assert.equal(state.mission.bombingResult, 'no-drop');
  });
}

test('Officer rerolls can repeat, spend physical resources once, and can target placed or unused dice', () => {
  const state = fresh(); state.resources.Officer = 3;
  beginBombRun(state, noop); placeThree(state);
  const resources = resourceCount(state), discarded = state.bags.mission.discard.length;
  for (const index of [0, 3, 2]) {
    const rng = { rng: state.rng }; const expected = die(rng);
    rerollBombDie(state, index, 'officer', noop);
    assert.equal(state.mission.bombRun.dice[index], expected);
    assert.equal(resourceCount(state), resources);
  }
  assert.equal(state.mission.bombRun.freeRerollAvailable, true);
  assert.equal(state.mission.bombRun.officerRerollsSpent, 3);
  assert.equal(state.stats.OfficerSpent, 3);
  assert.equal(state.resources.Officer, 0);
  assert.equal(state.bags.mission.discard.length, discarded + 3);
  assert.equal(state.mission.bombRun.unusedDie, 3);
  const before = structuredClone(state);
  assert.throws(() => rerollBombDie(state, 0, 'officer', noop), /needs 1 Officer/);
  assert.deepEqual(state, before);
  rerollBombDie(state, 3, 'auto', noop);
  assert.equal(state.mission.bombRun.freeRerollUsed, true);
  assert.equal(resourceCount(state), resources);
  assert.equal(validateBombRunSnapshot(state), true);
});

test('automatic reroll uses free entitlement first and only then spends Officer tokens', () => {
  const state = fresh(); state.resources.Officer = 1; beginBombRun(state, noop);
  rerollBombDie(state, 0, 'auto', noop);
  assert.equal(state.resources.Officer, 1);
  rerollBombDie(state, 0, 'auto', noop);
  assert.equal(state.resources.Officer, 0);
  assert.equal(state.mission.bombRun.officerRerollsSpent, 1);
});

test('target warning appears one outbound Progress away and uses current qualified seating', () => {
  const state = fresh(); crew(state, 'bombardier').health = 'injured';
  state.mission.position = state.config.v2OutboundLength - 2;
  assert.equal(bombRunTargetWarning(state), '');
  state.mission.position++;
  assert.match(bombRunTargetWarning(state), /BOMBSIGHT.*UNMANNED.*NO DROP POSSIBLE AT TARGET/);
  substitute(state, 'navigator');
  assert.equal(bombRunTargetWarning(state), '');
  substitute(state, 'engineer'); crew(state, 'navigator').station = null;
  assert.match(bombRunTargetWarning(state), /NO DROP/);
  state.mission.aborted = true; assert.equal(bombRunTargetWarning(state), '');
  state.mission.aborted = false; state.mission.bombed = true; assert.equal(bombRunTargetWarning(state), '');
  state.ruleset = 'v1'; state.mission.bombed = false; assert.equal(bombRunTargetWarning(state), '');
});

test('mid-run save/resume preserves target, dice, placements, unused die, rerolls, RNG and later result exactly', () => {
  const state = fresh('wilhelmshaven'); state.resources.Officer = 2;
  const pending = [], emit = event => pending.push({ ...event, state: structuredClone(state) });
  beginBombRun(state, emit); placeThree(state);
  rerollBombDie(state, 0, 'free', emit); rerollBombDie(state, 3, 'officer', emit);
  placeBombDie(state, 'release', 3, emit);
  const saved = { version: 1, state, view: pending[0].state, pending, log: [], speed: 'manual' };
  const values = new Map(), storage = { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) ?? null };
  assert.equal(saveSession(saved, storage), true);
  const loaded = loadSession(storage);
  assert.ok(loaded);
  assert.deepEqual(loaded, saved);
  for (const snapshot of [loaded.state, loaded.view, ...loaded.pending.map(event => event.state)]) assert.equal(validateBombRunSnapshot(snapshot), true);
  const expected = structuredClone(state);
  rerollBombDie(expected, 1, 'officer', noop); commitBombRun(expected, noop);
  rerollBombDie(loaded.state, 1, 'officer', noop); commitBombRun(loaded.state, noop);
  assert.deepEqual(loaded.state, expected);
  assert.equal(validateBombRunSnapshot(loaded.state), true);
  assert.ok(values.get(SAVE_KEY));
});

test('Bomb Run validation rejects corrupted dice, duplicate identities, rerolls and forged committed scores', () => {
  const state = fresh(); beginBombRun(state, noop); placeThree(state);
  for (const mutate of [
    run => { run.version = 2; }, run => { run.dice[0] = 7; }, run => { run.dice.pop(); },
    run => { run.placement.drift = 0; }, run => { run.unusedDie = 2; },
    run => { run.officerRerollsSpent = -1; }, run => { run.freeRerollUsed = true; },
    run => { run.target.ranges.course = [5, 2]; }, run => { run.target.thresholds.heavy = 9; },
    run => { run.operatorId = 'unknown'; }, run => { run.operatorId = 'engineer'; }, run => { run.outcome = 'destroyed'; },
  ]) {
    const broken = structuredClone(state); mutate(broken.mission.bombRun);
    assert.equal(validateBombRunSnapshot(broken), false);
  }
  commitBombRun(state, noop);
  for (const mutate of [run => { run.committedScore = -1; }, run => { run.slotScores.course = 99; }, run => { run.outcome = 'fabricated'; }]) {
    const broken = structuredClone(state); mutate(broken.mission.bombRun);
    assert.equal(validateBombRunSnapshot(broken), false);
  }
  assert.equal(validateBombRunSnapshot(fresh()), true);
});

test('V1 provisional bombing retains its one die threshold, ignores station qualifications, and has no Bomb Run', () => {
  for (const minimum of [1, 4, 6]) {
    const state = createGame({ bombingMin: minimum }, 'v1-bombing-unchanged', 'v1');
    state.phase = 'bombing'; crew(state, 'bombardier').health = 'dead';
    const rng = { rng: state.rng }, roll = die(rng), events = [];
    resolveBombing(state, event => events.push(event));
    assert.equal(state.rng, rng.rng);
    assert.equal(state.mission.bombingResult, roll >= minimum ? 'hit' : 'miss');
    assert.equal(state.mission.bombRun, undefined);
    assert.deepEqual(events.map(event => event.type), ['BOMBING_STARTED', 'BOMBING_ROLL', 'BOMBING_RESOLVED']);
    assert.equal(events[1].roll, roll);
    assert.throws(() => beginBombRun(state, noop), /V2/);
  }
  assert.equal(bombingOutcomeLabel('destroyed'), 'TARGET DESTROYED');
  assert.equal(bombingOutcomeLabel('no-drop'), 'NO DROP');
});
