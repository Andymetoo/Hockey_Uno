import test from 'node:test';
import assert from 'node:assert/strict';
import { BombRunTest } from '../bomb-run-test.mjs';
import { createGame } from '../state.mjs';
import { dispatch } from '../rules.mjs';
import { BOMBING_TARGETS, bombRunPreview, bombardierOperator } from '../bombing.mjs';
import { bombRunMarkup } from '../bomb-run-view.mjs';
import { eventMarkup } from '../views.mjs';
import { die } from '../random.mjs';
import { createCampaign, createCampaignStore, prepareCampaignSortie } from '../campaign.mjs';

const place = sandbox => ['course', 'drift', 'release'].forEach((slot, dieIndex) => sandbox.send({ type: 'placeBombDie', slot, dieIndex }));
for (const target of Object.values(BOMBING_TARGETS)) test(`tester uses production 4d6, placements, scoring and result for ${target.name}`, () => {
  const sandbox = new BombRunTest('test-seed'); sandbox.start(target.id);
  const state = sandbox.state, rng = { rng: createGame({}, state.seed, 'v2-continuous').rng };
  assert.deepEqual(state.mission.bombRun.dice, Array.from({ length: 4 }, () => die(rng)));
  assert.equal(state.rng, rng.rng); assert.deepEqual(state.mission.bombRun.target, target);
  assert.equal(bombardierOperator(state).id, 'bombardier');
  assert.equal(state.mission.bombRun.freeRerollAvailable, true);
  place(sandbox);
  assert.deepEqual(sandbox.state.mission.bombRun.placement, { course: 0, drift: 1, release: 2 });
  assert.equal(sandbox.state.mission.bombRun.unusedDie, 3);
  const preview = bombRunPreview(sandbox.state), production = dispatch(sandbox.state, { type: 'commitBombRun' });
  sandbox.send({ type: 'commitBombRun' });
  assert.deepEqual(sandbox.state, production.state);
  assert.equal(sandbox.state.mission.bombRun.committedScore, preview.total);
  assert.equal(sandbox.state.mission.bombRun.outcome, preview.outcome);
  assert.match(bombRunMarkup(sandbox.state), /BOMBS AWAY/);
  assert.match(eventMarkup(sandbox.events.find(e => e.type === 'BOMBING_RESOLVED')).stage, /BOMB RUN/);
});

test('tester offers one actual Bombardier reroll plus exactly three conserved disposable Officer rerolls', () => {
  const sandbox = new BombRunTest('rerolls'), count = s => s.resources.Officer + s.resources.Enlisted + [...s.bags.mission.tokens, ...s.bags.mission.discard].filter(t => t === 'Resource').length;
  const total = count(sandbox.state);
  sandbox.send({ type: 'rerollBombDie', dieIndex: 0, source: 'free' });
  assert.equal(sandbox.state.resources.Officer, 3);
  assert.throws(() => sandbox.send({ type: 'rerollBombDie', dieIndex: 0, source: 'free' }));
  for (let i = 0; i < 3; i++) sandbox.send({ type: 'rerollBombDie', dieIndex: i, source: 'officer' });
  assert.equal(sandbox.state.resources.Officer, 0); assert.equal(count(sandbox.state), total);
  assert.equal(sandbox.state.mission.bombRun.officerRerollsSpent, 3);
  assert.throws(() => sandbox.send({ type: 'rerollBombDie', dieIndex: 0, source: 'officer' }));
});

test('Test Again resets target, dice seed, placements, rerolls, resources and result; random uses production definitions', () => {
  const sandbox = new BombRunTest('again'); sandbox.start('schweinfurt');
  sandbox.send({ type: 'rerollBombDie', dieIndex: 0, source: 'free' });
  sandbox.send({ type: 'rerollBombDie', dieIndex: 0, source: 'officer' }); place(sandbox); sandbox.send({ type: 'commitBombRun' });
  const seed = sandbox.state.seed; sandbox.again();
  assert.equal(sandbox.state.mission.targetId, 'schweinfurt'); assert.notEqual(sandbox.state.seed, seed);
  assert.equal(sandbox.state.resources.Officer, 3); assert.equal(sandbox.state.mission.bombRun.freeRerollAvailable, true);
  assert.equal(sandbox.state.mission.bombRun.officerRerollsSpent, 0);
  assert.equal(sandbox.state.mission.bombRun.status, 'placing'); assert.equal(sandbox.state.mission.bombed, false);
  assert.deepEqual(sandbox.state.mission.bombRun.placement, { course: null, drift: null, release: null });
  const targets = new Set(); for (let i = 0; i < 30; i++) { sandbox.start('random'); targets.add(sandbox.state.mission.targetId); }
  assert.deepEqual([...targets].sort(), Object.keys(BOMBING_TARGETS).sort());
  assert.throws(() => sandbox.send({ type: 'activate', crewId: 'pilot' }));
});

for (const kind of ['none', 'standalone', 'campaign']) test(`tester has no access to ${kind} flight/history and preserves its next deterministic draw`, () => {
  const created = createCampaign(createCampaignStore());
  const prepared = prepareCampaignSortie(created.store, created.campaign.id, createGame({}, 'live-seed', 'v2-continuous'), { aircraftId: created.campaign.currentAircraftId });
  const state = kind === 'none' ? null : kind === 'campaign' ? prepared.state : createGame({}, 'live-seed', 'v2-continuous');
  const active = { state, store: prepared.store }, before = structuredClone(active);
  const expected = state && dispatch(state, { type: 'activate', crewId: 'pilot' });
  const sandbox = new BombRunTest('independent');
  sandbox.send({ type: 'rerollBombDie', dieIndex: 2, source: 'free' }); sandbox.send({ type: 'rerollBombDie', dieIndex: 1, source: 'officer' });
  place(sandbox); sandbox.send({ type: 'commitBombRun' }); sandbox.again(); sandbox.start('random');
  assert.deepEqual(active, before);
  if (state) assert.deepEqual(dispatch(state, { type: 'activate', crewId: 'pilot' }), expected);
});
