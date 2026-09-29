import test from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS } from '../board.mjs';
import { dispatch, availableActions, postAttackPosition, conversionOptions, opportunityAvailability, opportunityGunners } from '../rules.mjs';
import { activated, fresh, fighter, collect, rngForIndexes } from './fixtures.mjs';

// Existing attack/rotation cases exercise the whole activation: explicitly pass
// the new decision window without taking an Opportunity shot.
const action = (state, name, extra = {}) => {
  const result = dispatch(state, { type: 'action', action: name, ...extra });
  if (result.state.phase !== 'opportunity') return result;
  const continued = dispatch(result.state, { type: 'continueEnemyPhase' });
  return { state: continued.state, events: [...result.events, ...continued.events] };
};
const resourcesTotal = state => state.resources.Officer + state.resources.Enlisted + [...state.bags.mission.tokens, ...state.bags.mission.discard].filter(token => token === 'Resource').length;
const shotState = (tokens, extra = {}) => {
  const state = activated('engineer', { disruptOnHit: true, opportunityEnabled: true, opportunityCap: 3, opportunityOnKill: true, ...extra });
  state.fighters = [fighter('f1', { hp: 6, maxHp: 6, facing: 180 })];
  state.bags.combat = { tokens: [...tokens], discard: [] };
  return state;
};
const opportunityState = tokens => {
  const state = shotState(tokens);
  state.phase = 'opportunity';
  state.crew.find(crew => crew.id === 'engineer').activationCompleted = true;
  return state;
};

test('Basic Fire Burst deals two damage using exactly one pull and no Enlisted resource', () => {
  const state = shotState(['Burst', 'Burst']);
  const result = action(state, 'basicFire', { targetId: 'f1' });
  assert.equal(result.state.fighters[0].hp, 4);
  assert.equal(result.state.bags.combat.tokens.length, 1);
  assert.deepEqual(result.state.bags.combat.discard, ['Burst']);
  assert.equal(result.state.resources.Enlisted, state.resources.Enlisted);
  assert.equal(result.events.filter(event => event.type === 'GUNNER_SHOT_ROLL').length, 1);
});

test('Advanced Fire continues through Burst and Hit, then stops on a later Miss', () => {
  const state = shotState(['Burst', 'Hit', 'Miss', 'Burst']);
  state.rng = rngForIndexes([4, 3, 2], [0, 0, 0]);
  const result = action(state, 'advancedFire', { targetId: 'f1' });
  assert.equal(result.state.fighters[0].hp, 3);
  assert.deepEqual(result.state.bags.combat.discard, ['Burst', 'Hit', 'Miss']);
  assert.equal(result.state.resources.Enlisted, state.resources.Enlisted - 1);
  assert.equal(result.events.filter(event => event.type === 'ADVANCED_FIRE_RETRY').length, 0);
  assert.equal(result.events.filter(event => event.type === 'FIGHTER_DISRUPTED').length, 1, 'Disruption does not stack');
});

test('Advanced Fire first Miss permits one Burst pull and then stops despite the damaging token', () => {
  const state = shotState(['Miss', 'Burst', 'Hit']);
  state.rng = rngForIndexes([3, 2], [0, 0]);
  const result = action(state, 'advancedFire', { targetId: 'f1' });
  assert.equal(result.state.fighters[0].hp, 4);
  assert.deepEqual(result.state.bags.combat.discard, ['Miss', 'Burst']);
  assert.equal(result.events.filter(event => event.type === 'ADVANCED_FIRE_RETRY').length, 1);
});

test('Disruption cancels the next facing-in attack without a roll, still flies by and then clears', () => {
  const state = shotState(['Hit']);
  state.fighters[0].facing = 0;
  const result = action(state, 'basicFire', { targetId: 'f1' });
  const types = result.events.map(event => event.type);
  assert.equal(result.state.fighters[0].disrupted, false);
  assert.equal(result.state.stats.enemyAttacks, 0);
  assert.equal(result.state.stats.enemyHits, 0);
  assert.equal(types.includes('ENEMY_ATTACK_ROLL'), false);
  assert.equal(types.includes('ENEMY_HIT_LOCATION'), false);
  assert.ok(types.indexOf('FIGHTER_DISRUPTED') < types.indexOf('ATTACK_DISRUPTED'));
  assert.ok(types.indexOf('ATTACK_DISRUPTED') < types.indexOf('FIGHTER_MOVED'));
});

test('Disruption clears after the facing-away rotation, then the following action attacks normally', () => {
  let state = action(shotState(['Hit']), 'basicFire', { targetId: 'f1' }).state;
  assert.equal(state.fighters[0].facing, 90);
  state.fighters[0].disrupted = true;
  state.fighters[0].facing = 90;
  assert.equal(state.fighters[0].disrupted, true);
  state.phase = 'action'; state.activeCrew = 'pilot';
  let result = action(state, 'wait');
  assert.equal(result.state.fighters[0].facing, 0);
  assert.equal(result.state.fighters[0].disrupted, false);
  assert.equal(result.events.some(event => event.type === 'DISRUPT_CLEARED'), true);
  state = result.state; state.phase = 'action'; state.activeCrew = 'pilot';
  result = action(state, 'wait');
  assert.equal(result.events.filter(event => event.type === 'ATTACK_DISRUPTED').length, 0);
  assert.equal(result.events.filter(event => event.type === 'ENEMY_ATTACK').length, 1);
});

test('Disruption can be disabled and misses never disrupt', () => {
  for (const [token, disruptOnHit] of [['Miss', true], ['Hit', false]]) {
    const result = action(shotState([token], { disruptOnHit }), 'basicFire', { targetId: 'f1' });
    assert.equal(Boolean(result.state.fighters[0].disrupted), false);
    assert.equal(result.events.some(event => event.type === 'FIGHTER_DISRUPTED'), false);
  }
});

test('Escort hit during a cancelled attack flyby does not apply Disruption', () => {
  const state = activated('pilot', { disruptOnHit: true });
  state.fighters = [fighter('f1', { hp: 3, maxHp: 3, facing: 0, disrupted: true })];
  state.escorts = [{ id: 'escort', quadrant: 'Port', round: 1 }];
  state.rng = rngForIndexes([4, 3], [3, 0]);
  const result = action(state, 'wait');
  assert.equal(result.state.fighters[0].quadrant, 'Port');
  assert.equal(result.state.fighters[0].hp, 2);
  assert.equal(result.state.fighters[0].disrupted, false);
  assert.equal(result.events.filter(event => event.type === 'ATTACK_DISRUPTED').length, 1);
  assert.equal(result.events.filter(event => event.type === 'FIGHTER_DISRUPTED').length, 0);
  assert.equal(result.state.stats.enemyAttacks, 0);
});

test('Escort damage does not Disrupt survivors and Escort kills do not award Opportunity', () => {
  for (const hp of [1, 2]) {
    const state = fresh({ disruptOnHit: true, opportunityEnabled: true, opportunityOnKill: true });
    state.opportunity = 1;
    state.fighters = [fighter('f1', { hp })];
    state.escorts = [{ id: 'escort', quadrant: 'Port', round: 1 }];
    const { events, emit } = collect();
    postAttackPosition(state, 'f1', emit, { quadrant: 'Port', altitude: 'High' });
    if (hp === 2) {
      assert.equal(Boolean(state.fighters[0].disrupted), false);
      assert.equal(state.opportunity, 1);
    } else {
      assert.equal(state.fighters.length, 0);
      assert.equal(state.opportunity, 1);
      assert.equal(events.filter(event => event.type === 'OPPORTUNITY_GAINED').length, 0);
    }
  }
});

test('fighter kills award Opportunity up to its cap and obey gain-on-kill and enabled toggles', () => {
  for (const [pool, onKill, enabled, expected] of [[1, true, true, 2], [3, true, true, 3], [1, false, true, 1], [0, true, false, 0]]) {
    const state = shotState(['Burst'], { opportunityOnKill: onKill, opportunityEnabled: enabled });
    state.opportunity = pool; state.fighters[0].hp = 2;
    const result = action(state, 'basicFire', { targetId: 'f1' });
    assert.equal(result.state.fighters.length, 0);
    assert.equal(result.state.opportunity, expected);
    assert.equal(result.state.stats.opportunityGained || 0, expected - pool);
  }
});

test('Opportunity Shot uses exactly one Hit/Burst/Miss pull and leaves activation, mission draws and enemy phases unchanged', () => {
  for (const [token, damage] of [['Hit', 1], ['Burst', 2], ['Miss', 0]]) {
    const state = opportunityState([token, token]);
    const phase = 'opportunity';
    state.fighters[0].facing = 0; state.opportunity = 2;
    const result = dispatch(state, { type: 'opportunityShot', gunnerId: 'engineer', targetId: 'f1' });
    assert.equal(result.state.fighters[0].hp, 6 - damage);
    assert.equal(result.state.fighters[0].facing, 0);
    assert.equal(result.state.opportunity, 1);
    assert.equal(result.state.stats.opportunitySpent, 1);
    assert.equal(result.state.phase, phase);
    assert.equal(result.state.activeCrew, state.activeCrew);
    assert.equal(result.state.slot, state.slot);
    assert.equal(result.state.stats.missionDraws, state.stats.missionDraws);
    assert.equal(result.state.stats.enemyAttacks, 0);
    assert.deepEqual(result.state.crew, state.crew);
    assert.deepEqual(result.state.resources, state.resources);
    assert.equal(result.events.filter(event => event.type === 'GUNNER_SHOT_ROLL').length, 1);
    assert.equal(result.events.some(event => event.type === 'ENEMY_PHASE_STARTED' || event.type === 'CREW_ACTIVATED'), false);
  }
});

test('Opportunity Shot kills can earn the spent token back, without a chain exception', () => {
  const state = opportunityState(['Burst']);
  state.opportunity = 1; state.fighters[0].hp = 2;
  const result = dispatch(state, { type: 'opportunityShot', gunnerId: 'engineer', targetId: 'f1' });
  assert.equal(result.state.fighters.length, 0);
  assert.equal(result.state.opportunity, 1);
  assert.equal(result.state.stats.opportunitySpent, 1);
  assert.equal(result.state.stats.opportunityGained, 1);
  assert.equal(result.events.filter(event => event.type === 'GUNNER_SHOT_ROLL').length, 1);
});

test('Opportunity Shot rejects unavailable, unused, displaced, burning-station and out-of-arc gunners transactionally', () => {
  const failures = [
    state => { state.crew.find(crew => crew.id === 'engineer').used = false; },
    state => { state.crew.find(crew => crew.id === 'engineer').health = 'injured'; },
    state => { state.crew.find(crew => crew.id === 'engineer').job = 'work'; },
    state => { state.crew.find(crew => crew.id === 'engineer').position = ['C4-2']; },
    state => { state.cells[STATIONS.engineer.cells[0]] = 'fire'; },
    state => { state.fighters[0].altitude = 'Low'; },
    state => { state.opportunity = 0; },
    state => { state.config.opportunityEnabled = false; },
    state => { state.phase = 'ready'; },
    state => { state.phase = 'bombing'; },
  ];
  for (const alter of failures) {
    const state = opportunityState(['Hit']); state.opportunity = 1; alter(state);
    const before = structuredClone(state);
    assert.equal(opportunityAvailability(state).enabled, false);
    assert.throws(() => dispatch(state, { type: 'opportunityShot', gunnerId: 'engineer', targetId: 'f1' }));
    assert.deepEqual(state, before);
  }
  assert.ok(opportunityGunners(opportunityState(['Hit'])).some(crew => crew.id === 'engineer'));
});

test('Pilot Direct Fire spends one Officer and immediately makes one basic gun shot', () => {
  const state = activated('pilot', { opportunityEnabled: true, directFireCost: 1 });
  state.opportunity = 1;
  state.fighters = [fighter('f1', { hp: 3, maxHp: 3, facing: 90 })];
  state.bags.combat = { tokens: ['Hit'], discard: [] };
  const result = action(state, 'directFire', { gunnerId: 'engineer', targetId: 'f1' });
  assert.equal(result.state.resources.Officer, state.resources.Officer - 1);
  assert.equal(result.state.opportunity, 1);
  assert.deepEqual(result.state.bags.mission.discard, ['Resource']);
  assert.equal(result.events.filter(event => event.type === 'ENEMY_PHASE_STARTED').length, 1);
  assert.equal(result.events.filter(event => event.type === 'GUNNER_SHOT_ROLL').length, 1);
  assert.equal(result.state.fighters[0].hp, 2);
  assert.equal(result.state.stats.missionDraws, state.stats.missionDraws);
  for (const alter of [s => { s.fighters = []; }, s => { s.resources.Officer = 0; }]) {
    const invalid = structuredClone(state); alter(invalid);
    assert.equal(availableActions(invalid, 'pilot').find(item => item.id === 'directFire').enabled, false);
    assert.throws(() => action(invalid, 'directFire'));
  }
});

test('Copilot reciprocal conversions conserve physical resources and move only the surplus token', () => {
  for (const to of ['Officer', 'Enlisted']) for (const ratio of [2, 3]) {
    const state = activated('copilot', { conversionRate: ratio });
    const before = resourcesTotal(state);
    const option = conversionOptions(state).find(item => item.to === to);
    assert.equal(option.enabled, true);
    const result = action(state, 'convert', { to });
    assert.equal(resourcesTotal(result.state), before);
    assert.equal(result.state.resources[option.from], state.resources[option.from] - option.cost);
    assert.equal(result.state.resources[to], state.resources[to] + option.gain);
    assert.equal(result.state.bags.mission.tokens.length, state.bags.mission.tokens.length - option.bagNeeded);
    assert.equal(result.state.bags.mission.discard.length, to === 'Officer' ? ratio - 1 : 0);
    assert.equal(result.state.stats[`${option.from}Spent`], option.cost);
    assert.equal(result.state.stats[`${to}Gained`] - state.stats[`${to}Gained`], option.gain);
    assert.equal(result.state.rng, state.rng, 'conversion consumes no random draws');
  }
});

test('Officer-to-Enlisted conversion cannot use Resource discard or force an emergency refill', () => {
  const state = activated('copilot');
  state.resources.Officer = 1; state.resources.Enlisted = 0;
  state.bags.mission = { tokens: ['Enemy'], discard: ['Resource', 'Resource'] };
  const before = structuredClone(state);
  assert.equal(conversionOptions(state).find(item => item.to === 'Enlisted').enabled, false);
  assert.equal(availableActions(state, 'copilot').find(item => item.id === 'convert').enabled, false);
  assert.throws(() => action(state, 'convert', { to: 'Enlisted' }), /mission bag|discard/i);
  assert.deepEqual(state, before);
  state.bags.mission.tokens.push('Resource');
  const result = action(state, 'convert', { to: 'Enlisted' });
  assert.equal(result.state.resources.Enlisted, 2);
  assert.deepEqual(result.state.bags.mission.tokens, ['Enemy']);
  assert.deepEqual(result.state.bags.mission.discard, ['Resource', 'Resource']);
});
