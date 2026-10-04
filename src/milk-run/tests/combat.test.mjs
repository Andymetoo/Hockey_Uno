import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, postAttackPosition } from '../rules.mjs';
import { fresh, activated, fighter, collect, rngForIndexes } from './fixtures.mjs';

const shot = (state, advanced = false, targetId = 'f1') => dispatch(state, { type: 'action', action: advanced ? 'advancedFire' : 'basicFire', targetId });

test('Basic Fire is one free pull and a miss does not damage its fighter', () => {
  const state = activated();
  state.fighters = [fighter('f1', { facing: 180 })];
  state.bags.combat = { tokens: ['Miss', 'Miss'], discard: [] };
  const before = structuredClone(state);
  const result = shot(state);
  assert.equal(result.state.fighters[0].hp, 2);
  assert.equal(result.state.bags.combat.tokens.length, 1);
  assert.deepEqual(result.state.resources, before.resources);
  assert.deepEqual(state, before, 'dispatch never mutates input state');
  assert.equal(result.events.filter(e => e.type === 'GUNNER_SHOT_ROLL').length, 1);
  assert.equal(result.state.slot, 1);
  assert.throws(() => shot(result.state), /action/i, 'there is no second action in an activation');
});

test('Advanced Fire first miss grants exactly one extra pull even when that pull hits', () => {
  const state = activated();
  state.fighters = [fighter('f1', { hp: 4, maxHp: 4, facing: 180 })];
  state.bags.combat = { tokens: ['Miss', 'Hit', 'Hit', 'Hit'], discard: [] };
  state.rng = rngForIndexes([4, 3], [0, 0]);
  const result = shot(state, true);
  assert.equal(result.state.fighters[0].hp, 3);
  assert.deepEqual(result.state.bags.combat.discard, ['Miss', 'Hit']);
  assert.equal(result.state.bags.combat.tokens.length, 2);
  assert.equal(result.state.resources.Enlisted, state.resources.Enlisted - 1);
  assert.deepEqual(result.state.bags.mission.discard, ['Resource']);
  assert.equal(result.events.filter(e => e.type === 'ADVANCED_FIRE_RETRY').length, 1);
});

test('Advanced Fire continues hits against one target, stops on later miss, and never retries it', () => {
  const state = activated();
  state.fighters = [fighter('f1', { hp: 4, maxHp: 4, facing: 180 }), fighter('f2', { facing: 180 })];
  state.bags.combat = { tokens: ['Hit', 'Hit', 'Miss', 'Hit'], discard: [] };
  state.rng = rngForIndexes([4, 3, 2], [0, 0, 0]);
  const result = shot(state, true);
  assert.equal(result.state.fighters[0].hp, 2);
  assert.equal(result.state.fighters[1].hp, 2);
  assert.deepEqual(result.state.bags.combat.discard, ['Hit', 'Hit', 'Miss']);
  assert.equal(result.events.filter(e => e.type === 'ADVANCED_FIRE_RETRY').length, 0);
});

test('a destroyed fighter leaves the three-slot queue and later fighters slide forward', () => {
  const state = activated();
  state.fighters = [fighter('f1', { facing: 180 }), fighter('f2', { hp: 1, facing: 180 }), fighter('f3', { facing: 180 })];
  state.bags.combat = { tokens: ['Hit', 'Hit'], discard: [] };
  const result = shot(state, true, 'f2');
  assert.deepEqual(result.state.fighters.map(f => f.id), ['f1', 'f3']);
  assert.equal(result.state.bags.combat.tokens.length, 1, 'Advanced Fire stops when selected fighter dies');
  assert.equal(result.state.stats.fightersKilled, 1);
  assert.equal(result.events.filter(e => e.type === 'FIGHTER_DESTROYED').length, 1);
});

test('combat emergency refill occurs during an Advanced Fire burst without ending it', () => {
  const state = activated();
  state.fighters = [fighter('f1', { hp: 3, maxHp: 3 })];
  state.bags.combat = { tokens: ['Hit'], discard: [] };
  const result = shot(state, true);
  assert.equal(result.state.fighters.length, 0);
  assert.equal(result.events.filter(e => e.type === 'COMBAT_BAG_REFILLED').length, 2);
  assert.equal(result.events.filter(e => e.type === 'GUNNER_SHOT_ROLL').length, 3);
});

test('out-of-arc fire is rejected transactionally before spending resources or advancing enemies', () => {
  const state = activated('navigator');
  state.fighters = [fighter('f1', { quadrant: 'Aft' })];
  const before = structuredClone(state);
  assert.throws(() => shot(state, true), /arc/i);
  assert.deepEqual(state, before);
});

test('Enemy token at the three-fighter cap becomes configured Flak without drawing any card', () => {
  const state = dispatch(fresh({ flakShots: 3 }), { type: 'startRound' }).state;
  state.bags.mission = { tokens: ['Enemy'], discard: [] };
  state.fighters = [fighter('f1'), fighter('f2'), fighter('f3')];
  state.deck = { cards: ['Me-262'], discard: [] };
  const result = dispatch(state, { type: 'activate', crewId: 'engineer' });
  assert.equal(result.state.stats.flakAttacks, 1);
  assert.equal(result.events.filter(e => e.type === 'ENEMY_ATTACK').length >= 3, true);
  assert.equal(result.events.filter(e => e.type === 'ENEMY_CARD_DRAWN').length, 0);
  assert.deepEqual(result.state.deck, state.deck);
  assert.equal(result.state.fighters.length, 3);
});

test('new fighter faces inward and waits for the active crew action before attacking', () => {
  const state = dispatch(fresh(), { type: 'startRound' }).state;
  state.bags.mission = { tokens: ['Enemy'], discard: [] };
  state.deck = { cards: ['BF-109'], discard: [] };
  const result = dispatch(state, { type: 'activate', crewId: 'pilot' });
  assert.equal(result.state.phase, 'action');
  assert.equal(result.state.fighters[0].facing, 0);
  assert.equal(result.state.stats.enemyAttacks, 0);
  const acted = dispatch(result.state, { type: 'action', action: 'wait' });
  assert.equal(acted.state.stats.enemyAttacks, 1);
  const types = acted.events.map(e => e.type);
  assert.ok(types.indexOf('ENEMY_ATTACK') < types.indexOf('ENEMY_ATTACK_ROLL'));
  assert.ok(types.indexOf('ENEMY_ATTACK_ROLL') < types.indexOf('FIGHTER_MOVED'));
  assert.ok(types.indexOf('FIGHTER_MOVED') < types.indexOf('FIGHTER_ROTATED'));
  assert.equal(acted.state.deck.cards.length + acted.state.deck.discard.length, 1, 'fighter movement does not duplicate its card');
});

test('off-angle fighters rotate 90 degrees per phase instead of attacking, in queue order', () => {
  const state = activated('pilot');
  state.fighters = [fighter('f1', { facing: 180 }), fighter('f2', { facing: 90 })];
  const result = dispatch(state, { type: 'action', action: 'wait' });
  assert.equal(result.state.stats.enemyAttacks, 0);
  assert.deepEqual(result.state.fighters.map(f => f.facing), [90, 0]);
  assert.deepEqual(result.events.filter(e => e.type === 'FIGHTER_ROTATED').map(e => e.fighterId), ['f1', 'f2']);
});

test('90-degree spawn setting is optional and preserves the default of inward-facing spawns', () => {
  const state = dispatch(fresh({ spawnFacing: 90 }), { type: 'startRound' }).state;
  state.bags.mission = { tokens: ['Enemy'], discard: [] };
  state.deck = { cards: ['BF-110'], discard: [] };
  const spawned = dispatch(state, { type: 'activate', crewId: 'pilot' });
  assert.equal(spawned.state.fighters[0].facing, 90);
  const acted = dispatch(spawned.state, { type: 'action', action: 'wait' });
  assert.equal(acted.state.fighters[0].facing, 0);
  assert.equal(acted.state.stats.enemyAttacks, 0);
});

test('removed Radio Intercept commands reject transactionally', () => {
  const state = dispatch(fresh(), { type: 'startRound' }).state;
  const before = structuredClone(state);
  for (const intercept of [true, false]) assert.throws(() => dispatch(state, { type:'activate',crewId:'radio',intercept }), /removed/);
  assert.deepEqual(state,before);
});

test('escort inflicts one damage only when post-attack movement enters its quadrant', () => {
  const state = fresh();
  state.fighters = [fighter()];
  state.escorts = [{ id: 'escort1', quadrant: 'Port', round: 1 }];
  const { events, emit } = collect();
  postAttackPosition(state, 'f1', emit, { quadrant: 'Aft', altitude: 'Low' });
  assert.equal(state.fighters[0].hp, 2);
  postAttackPosition(state, 'f1', emit, { quadrant: 'Port', altitude: 'High' });
  assert.equal(state.fighters[0].hp, 1);
  assert.equal(events.filter(e => e.type === 'ESCORT_INTERCEPT').length, 1);
});
