import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCandidate, createGame, verifyCandidate } from '../generation.ts';
import { approachableAtStart, openingVisibility } from '../encounter-placement.ts';
import { roomDistances, validateDependencies } from '../dependencies.ts';
import { known, positionKey, refreshExploration } from '../world.ts';
import { explorationAction, replayWitness } from '../solver.ts';
import { act } from '../game.ts';
import { baseFixture, addConnection, addHaunting, position } from './fixtures.mjs';

test('mixed placement preserves every generated profile and all other content across paired seeds', () => {
 const profileOnly = s => ({ ...s, hauntings: s.hauntings.map(({ position, ...h }) => h) });
 const roomCounts = s => s.rooms.map(r => s.hauntings.filter(h => h.position.roomId === r.id).length);
 let changed = 0;
 for (let i = 0; i < 64; i++) {
  const seed = `mixed-probe-${i}`, prior = generateCandidate(seed, 0, { encounters: 'prior' }), mixed = generateCandidate(seed);
  assert.deepEqual(profileOnly(mixed), profileOnly(prior));
  assert.deepEqual(roomCounts(mixed), roomCounts(prior), 'quiet rooms and encounter counts remain fixed');
  assert.deepEqual(mixed.hauntings.find(h => h.boss), prior.hauntings.find(h => h.boss));
  const beforeView = openingVisibility(prior), afterView = openingVisibility(mixed), distances = roomDistances(prior, prior.entrance.roomId);
  const originalSlots = prior.hauntings.filter(h => !h.boss && distances.get(h.position.roomId) <= 1 && beforeView.has(positionKey(h.position))).length;
  const affordable = prior.hauntings.filter(h => !h.boss && h.tier === 1 && approachableAtStart(prior, h)).length;
  if (JSON.stringify(prior.hauntings) !== JSON.stringify(mixed.hauntings)) assert.ok(mixed.hauntings.filter(h => h.tier === 1 && approachableAtStart(mixed, h) && afterView.has(positionKey(h.position))).length >= Math.min(2, originalSlots, affordable));
  assert.equal(validateDependencies(mixed).valid, true);
  assert.equal(new Set(mixed.hauntings.map(h => positionKey(h.position))).size, mixed.hauntings.length);
  for (const h of mixed.hauntings) assert.ok(!mixed.supplies.some(s => positionKey(s.position) === positionKey(h.position)));
  if (JSON.stringify(prior.hauntings) !== JSON.stringify(mixed.hauntings)) changed++;
 }
 assert.ok(changed > 30);
 assert.deepEqual(generateCandidate('mixed-seeded'), generateCandidate('mixed-seeded'));
});

test('mixed houses permit early strong, initially visible strong, and deep easy spirits without universal quotas', () => {
 let early = 0, initial = 0, deep = 0, twoChoices = 0;
 for (let i = 0; i < 100; i++) {
  const s = generateCandidate(`mixed-probe-${i}`), distance = roomDistances(s, s.entrance.roomId), visible = openingVisibility(s);
  early += +s.hauntings.some(h => !h.boss && h.tier >= 3 && distance.get(h.position.roomId) <= 1);
  initial += +s.hauntings.some(h => !h.boss && h.tier >= 3 && known(s, h.position));
  deep += +s.hauntings.some(h => !h.boss && h.tier === 1 && distance.get(h.position.roomId) >= 2);
  twoChoices += +(s.hauntings.filter(h => h.tier === 1 && visible.has(positionKey(h.position)) && approachableAtStart(s, h)).length >= 2);
 }
 assert.ok(early >= 20 && early < 100);
 assert.ok(initial >= 5 && initial < 70);
 assert.ok(deep >= 30 && deep < 100);
 assert.ok(twoChoices >= 60);
});

test('opening visibility agrees with actual empty-destination movement and open passage actions', () => {
 for (const seed of ['mixed-probe-0', 'mixed-probe-3', 'mixed-probe-19']) {
  const initial = generateCandidate(seed), expected = openingVisibility(initial);
  let state = initial;
  for (let i = 0; i < 500; i++) {
   const action = explorationAction(state); if (!action) break;
   assert.ok(['move', 'travel'].includes(action.type));
   const result = act(state, action, false); assert.equal(result.committed, true); state = result.state;
  }
  const seen = new Set(state.rooms.flatMap(r => r.discovered.flatMap((v, i) => v ? [positionKey({ roomId: r.id, x: i % r.width, y: Math.floor(i / r.width) })] : [])));
  assert.deepEqual(seen, expected);
  assert.deepEqual(state.resources, initial.resources);
  assert.deepEqual(state.hauntings, initial.hauntings, 'no live scaling while exploring');
 }
});

test('historical ingredient modes ignore the mixed distribution option', () => {
 for (const ingredients of ['baseline', 'expanded']) {
  assert.deepEqual(generateCandidate('historical-placement', 0, { ingredients, encounters: 'mixed' }), generateCandidate('historical-placement', 0, { ingredients, encounters: 'prior' }));
 }
});

test('opening travel cannot land on an occupied far endpoint', () => {
 const s = baseFixture({ known: false });
 const c = addConnection(s, { a: position(2, 2), b: position(1, 1, 'study') });
 addHaunting(s, { position: c.b });
 assert.ok(!openingVisibility(s).has(positionKey(c.b)));
 s.player = s.entrance; refreshExploration(s);
 const result = act(s, { type: 'travel', connectionId: c.id, from: c.a }, false);
 assert.equal(result.committed, false); assert.equal(result.message, 'That landing is occupied.');
});

test('accepted mixed house retains a real optional-branch-skipping winning witness', { timeout: 180000 }, () => {
 const initial = createGame('mixed-proof'), result = verifyCandidate(initial);
 assert.equal(result.solved, true);
 const won = replayWitness(initial, result.actions); assert.ok(won);
 for (const id of validateDependencies(initial).optionalGates) assert.equal(won.connections.find(c => c.id === id).opened, false);
});
