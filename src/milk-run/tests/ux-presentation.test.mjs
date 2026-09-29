import test from 'node:test';
import assert from 'node:assert/strict';
import { ResolutionQueue } from '../queue.mjs';
import { advanceVisual, describeEvent, eventCategory, eventDelay, expandPresentation, groupEvents } from '../presentation.mjs';
import { eventMarkup } from '../views.mjs';

const initial = () => ({ round: 1, phase: 'action', config: { animationMs: 750 }, cells: { 'C1-4': 'healthy' }, resources: { Officer: 3 }, rng: 11 });
const withSnapshot = (state, events) => ({ state, events: events.map(event => ({ ...event, state: event.state ?? structuredClone(state) })) });

test('mission draw has a hidden anticipation beat, visible reveal, then resource consequence', () => {
  const state = initial();
  const drawn = { ...structuredClone(state), rng: 13 };
  const gained = { ...structuredClone(drawn), resources: { Officer: 4 } };
  const queue = new ResolutionQueue({ state, dispatch: () => withSnapshot(gained, [
    { type: 'CREW_ACTIVATED', crewId: 'pilot', state },
    { type: 'MISSION_TOKEN_DRAWN', crewId: 'pilot', token: 'Resource', state: drawn },
    { type: 'RESOURCE_GAINED', crewId: 'pilot', rank: 'Officer', amount: 1, state: gained },
    { type: 'CREW_ACTION_READY', crewId: 'pilot' },
  ]) });
  try {
    queue.setSpeed('manual'); queue.send({});
    assert.equal(queue.current.type, 'CREW_ACTIVATED');
    queue.step();
    assert.equal(queue.current.type, 'MISSION_TOKEN_DRAWING');
    assert.equal(queue.view.rng, 11, 'hidden draw cannot leak the future snapshot');
    assert.deepEqual(queue.visual.token, { bag: 'mission', label: '?', value: null, back: true, tone: 'neutral' });
    assert.equal(queue.log.length, 1, 'visual-only anticipation never invents a rules event');
    queue.step();
    assert.equal(queue.visual.token.label, 'RESOURCE');
    assert.equal(queue.view.resources.Officer, 3, 'the token is shown before the pool changes');
    queue.step();
    assert.equal(queue.current.type, 'RESOURCE_GAINED');
    assert.equal(queue.view.resources.Officer, 4);
    assert.equal(queue.visual.token.label, 'RESOURCE', 'token persists during its consequence');
    queue.step();
    assert.equal(queue.busy, false);
    assert.deepEqual(queue.log.map(event => event.type), ['CREW_ACTIVATED', 'MISSION_TOKEN_DRAWN', 'RESOURCE_GAINED', 'CREW_ACTION_READY']);
  } finally { queue.dispose(); }
});

test('hit location and reticle focus precede aircraft damage and preserve every raw consequence', () => {
  const state = initial(), damaged = { ...structuredClone(state), cells: { 'C1-4': 'damaged' } };
  const queue = new ResolutionQueue({ state, dispatch: () => withSnapshot(damaged, [
    { type: 'ENEMY_ATTACK', source: 'BF-109', fighterId: 'f1', state },
    { type: 'ENEMY_ATTACK_ROLL', fighterId: 'f1', roll: 4, result: 'hit', state },
    { type: 'ENEMY_HIT_LOCATION', fighterId: 'f1', cellId: 'C1-4', state },
    { type: 'AIRCRAFT_SQUARE_DAMAGED', cellId: 'C1-4', state: damaged },
    { type: 'CREW_INJURED', crewId: 'pilot', state: damaged },
  ]) });
  try {
    queue.setSpeed('manual'); queue.send({});
    queue.step(); queue.step();
    assert.equal(queue.current.type, 'ENEMY_HIT_LOCATION');
    assert.equal(queue.visual.locationCell, 'C1-4');
    assert.equal(queue.visual.focusCell, null, 'reticle begins at its separate focus beat');
    queue.step();
    assert.equal(queue.current.type, 'ENEMY_LOCATION_FOCUS');
    assert.equal(queue.visual.focusCell, 'C1-4');
    assert.equal(queue.view.cells['C1-4'], 'healthy');
    assert.equal(queue.log.length, 3);
    queue.step();
    assert.equal(queue.view.cells['C1-4'], 'damaged');
    assert.equal(queue.current.type, 'AIRCRAFT_SQUARE_DAMAGED');
    queue.step();
    assert.equal(queue.current.type, 'CREW_INJURED');
  } finally { queue.dispose(); }
});

test('manual waits indefinitely at major beats and drains minor bookkeeping on one tap', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = initial();
  const queue = new ResolutionQueue({ state, dispatch: () => withSnapshot(state, [
    { type: 'ROUND_STARTED' }, { type: 'MISSION_BAG_REFILLED' }, { type: 'COMBAT_BAG_REFILLED' },
    { type: 'CREW_READIED' }, { type: 'CREW_ACTIVATED' },
  ]) });
  try {
    queue.setSpeed('manual'); queue.send({});
    t.mock.timers.tick(100000);
    assert.equal(queue.current.type, 'ROUND_STARTED');
    assert.equal(queue.log.length, 1);
    queue.step();
    assert.equal(queue.current.type, 'CREW_ACTIVATED');
    assert.equal(queue.log.length, 5);
    assert.ok(queue.busy, 'last major beat still needs a deliberate advance');
    queue.step();
    assert.equal(queue.busy, false);
  } finally { queue.dispose(); }
});

test('normal and fast have distinct readable holds; manual and instant retain all raw logs', () => {
  const token = { type: 'MISSION_TOKEN_DRAWN', token: 'Enemy' };
  assert.equal(eventDelay(token, 'normal', { animationMs: 750 }), 1650);
  assert.equal(eventDelay(token, 'fast', { animationMs: 750 }), 300);
  assert.equal(eventDelay(token, 'manual'), Infinity);
  assert.equal(eventDelay(token, 'instant'), 0);
  assert.equal(eventDelay({ type: 'CREW_READIED' }, 'normal'), 0);
  assert.equal(eventDelay({ type: 'ALTITUDE_CHECK', minimum: 0 }, 'manual'), 0);
});

test('each Advanced Fire pull receives its own draw and reveal, with no token balance changes', () => {
  const state = initial();
  const raw = [
    { type: 'GUNNER_FIRE_STARTED', fighterId: 'f1' },
    { type: 'GUNNER_SHOT_ROLL', crewId: 'tail', token: 'Miss' },
    { type: 'ADVANCED_FIRE_RETRY' },
    { type: 'GUNNER_SHOT_ROLL', crewId: 'tail', token: 'Hit' },
    { type: 'FIGHTER_DAMAGED', fighterId: 'f1' },
  ];
  const expanded = expandPresentation(withSnapshot(state, raw).events, state);
  assert.deepEqual(expanded.map(event => event.type), [
    'GUNNER_FIRE_STARTED', 'COMBAT_TOKEN_DRAWING', 'GUNNER_SHOT_ROLL', 'ADVANCED_FIRE_RETRY',
    'COMBAT_TOKEN_DRAWING', 'GUNNER_SHOT_ROLL', 'FIGHTER_DAMAGED',
  ]);
  assert.deepEqual(expanded.filter(event => event.token).map(event => event.token), ['Miss', 'Hit']);
  const queue = new ResolutionQueue({ state, dispatch: () => withSnapshot(state, raw) });
  try {
    queue.setSpeed('manual'); queue.send({}); queue.flush();
    assert.deepEqual(queue.log.map(event => event.type), raw.map(event => event.type));
    assert.equal(queue.visual.token.value, 'Hit');
    assert.ok(queue.log.every(event => !event.state && !event.presentationOnly));
  } finally { queue.dispose(); }
});

test('empty-space X survives bookkeeping until the next attack; a roll miss has no location', () => {
  let visual = advanceVisual({}, { type: 'ENEMY_ATTACK', fighterId: 'f1' });
  visual = advanceVisual(visual, { type: 'ATTACK_EMPTY_SPACE', cellId: 'A1-1' });
  for (const type of ['FIGHTER_MOVED', 'FIGHTER_ROTATED', 'CREW_SELECTION_READY', 'CREW_ACTIVATED']) visual = advanceVisual(visual, { type });
  assert.equal(visual.emptyMissCell, 'A1-1');
  visual = advanceVisual(visual, { type: 'ENEMY_ATTACK', fighterId: 'f2' });
  assert.equal(visual.emptyMissCell, null);
  visual = advanceVisual(visual, { type: 'ENEMY_ATTACK_ROLL', fighterId: 'f2', result: 'miss', roll: 1 });
  assert.equal(visual.attackMissFighter, 'f2');
  assert.equal(visual.locationCell, null);
  assert.equal(visual.focusCell, null);
  const beats = expandPresentation([{ type: 'ENEMY_ATTACK' }, { type: 'ENEMY_ATTACK_ROLL', result: 'miss', roll: 1 }], initial());
  assert.equal(beats.length, 2, 'presentation cannot manufacture a hit location for a miss');
  visual = advanceVisual(visual, { type: 'ENEMY_ATTACK', source: 'Flak 1/2' });
  assert.equal(visual.attackMissFighter, null, 'Flak starts a separate attack, too');
});

test('autosave at face-down draw and at final major beat resumes without duplicate reveals or lost waits', () => {
  const state = initial();
  const dispatch = () => withSnapshot(state, [{ type: 'MISSION_TOKEN_DRAWN', token: 'Enemy' }, { type: 'FIGHTER_SPAWNED', fighterId: 'f1' }]);
  const queue = new ResolutionQueue({ state, dispatch });
  let restored, final;
  try {
    queue.setSpeed('manual'); queue.send({});
    assert.equal(queue.current.type, 'MISSION_TOKEN_DRAWING');
    restored = new ResolutionQueue({ state, dispatch, saved: structuredClone(queue.export()) });
    assert.equal(restored.visual.token.back, true);
    assert.equal(restored.paused, true);
    restored.step();
    assert.equal(restored.current.type, 'MISSION_TOKEN_DRAWN');
    restored.step();
    assert.equal(restored.pending.length, 0);
    assert.equal(restored.busy, true);
    final = new ResolutionQueue({ state, dispatch, saved: structuredClone(restored.export()) });
    assert.equal(final.busy, true, 'final major event is still awaiting continuation after reload');
    final.step();
    assert.equal(final.busy, false);
    assert.deepEqual(final.log.map(event => event.type), ['MISSION_TOKEN_DRAWN', 'FIGHTER_SPAWNED']);
  } finally { queue.dispose(); restored?.dispose(); final?.dispose(); }
});

test('event descriptions and recorder groups separate categories but preserve debugging details', () => {
  assert.equal(describeEvent(null).title, 'Ready for orders', 'restored pending sessions may not have shown their first beat yet');
  assert.equal(describeEvent({ type: 'GUNNER_SHOT_ROLL', token: 'Burst' }).title, 'BURST ×2', 'renderer recognizes a supplied future token but never creates one');
  assert.equal(describeEvent({ type: 'ALTITUDE_ROLL', cause: 'structure', minimum: 5, roll: 4 }).title, 'STRUCTURE · NEED 5+');
  const examples = { CREW_ACTION: 'crew', RESOURCE_GAINED: 'resource', GUNNER_SHOT_ROLL: 'gunfire', ENEMY_ATTACK: 'enemy', FIRE_STARTED: 'damage', CREW_KILLED: 'injury', CREW_HEALED: 'repair', ALTITUDE_LOST: 'altitude' };
  for (const [type, category] of Object.entries(examples)) assert.equal(eventCategory({ type }), category);
  const log = [
    { sequence: 1, round: 1, type: 'CREW_ACTIVATED', message: 'Activate Pilot.', crewId: 'pilot' },
    { sequence: 2, round: 1, type: 'MISSION_TOKEN_DRAWN', message: 'Pilot draws Resource.', token: 'Resource' },
    { sequence: 3, round: 1, type: 'RESOURCE_GAINED', message: 'Gain 1 Officer.', rank: 'Officer', amount: 1 },
    { sequence: 4, round: 1, type: 'ENEMY_ATTACK', message: 'BF-109 attacks.', fighterId: 'f1' },
    { sequence: 5, round: 1, type: 'ENEMY_ATTACK_ROLL', message: 'Roll 1: MISS.', roll: 1, result: 'miss' },
  ];
  const groups = groupEvents(log);
  assert.equal(groups.length, 2);
  assert.match(groups[0].title, /RESOURCE/);
  assert.match(groups[1].title, /MISS/);
  assert.deepEqual(groups.flatMap(group => group.events), log);
});

test('a revealed token remains visible during its consequence without replaying the draw animation', () => {
  for (const [draw, consequence] of [
    [{ type: 'MISSION_TOKEN_DRAWN', token: 'Resource' }, { type: 'RESOURCE_GAINED', rank: 'Officer', amount: 1 }],
    [{ type: 'GUNNER_SHOT_ROLL', token: 'Hit' }, { type: 'FIGHTER_DAMAGED', fighterId: 'f1', amount: 1 }],
  ]) {
    const visual = advanceVisual({}, draw);
    const revealed = eventMarkup(draw, visual).stage;
    assert.match(revealed, /token-reveal/, 'the actual draw should visibly reveal its token');
    const persisted = eventMarkup(consequence, visual).stage;
    assert.match(persisted, new RegExp(`data-token="${draw.token}"`));
    assert.doesNotMatch(persisted, /token-reveal|token-back/, 'a damage/resource consequence must not look like another pull');
  }
});
