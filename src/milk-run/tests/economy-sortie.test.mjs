import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGame } from '../state.mjs';
import { DEFAULT_CONFIG } from '../config.mjs';
import { dispatch } from '../rules.mjs';

test('current default combat economy completes a reproducible 19-round START → TARGET → HOME sortie', async () => {
  const witness = JSON.parse(await readFile(new URL('./fixtures/combat-economy-home-witness.json', import.meta.url), 'utf8'));
  assert.deepEqual(witness.config, Object.fromEntries(Object.keys(witness.config).map(key => [key, DEFAULT_CONFIG[key]])), 'every original V1 witness setting still uses current V1 defaults, without easy-mode overrides');
  let state = createGame({}, witness.seed);
  const combatPulls = { Hit: 0, Burst: 0, Miss: 0 }, eventCounts = {};
  const resourceCount = snapshot => snapshot.resources.Officer + snapshot.resources.Enlisted +
    [...snapshot.bags.mission.tokens, ...snapshot.bags.mission.discard].filter(token => token === 'Resource').length;
  const initialResources = resourceCount(state), initialCombat = state.bags.combat.tokens.length;
  const seenActions = new Set();
  for (const [index, command] of witness.commands.entries()) {
    const prior = state;
    let resolved;
    assert.doesNotThrow(() => { resolved = dispatch(state, command); }, `witness command ${index + 1}: ${JSON.stringify(command)}`);
    state = resolved.state;
    if (command.action) seenActions.add(command.action);
    for (const event of resolved.events) {
      eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
      if (event.type === 'GUNNER_SHOT_ROLL') combatPulls[event.token]++;
      if (event.type === 'WORK_STARTED') {
        const job = event.state.jobs.find(job => job.id === event.jobId);
        assert.equal(job.completeRound, event.state.round + 2, 'all default crisis jobs retain the two-round commitment');
      }
    }
    assert.equal(resourceCount(state), initialResources, 'conversion, spending, collection and refill conserve Resource tokens');
    assert.equal(state.bags.combat.tokens.length + state.bags.combat.discard.length, initialCombat, 'all three combat token types remain in the combat economy');
    assert.ok(state.opportunity >= 0 && state.opportunity <= state.config.opportunityCap);
    if (command.type === 'opportunityShot') {
      assert.equal(state.phase, prior.phase);
      assert.equal(state.slot, prior.slot);
      assert.equal(state.activeCrew, prior.activeCrew);
      assert.equal(state.stats.missionDraws, prior.stats.missionDraws);
      assert.equal(state.stats.enemyAttacks, prior.stats.enemyAttacks, 'Opportunity never secretly advances the enemy phase');
    }
  }
  assert.equal(state.outcome, 'success');
  assert.equal(state.round, 19);
  assert.equal(state.mission.position, 19);
  assert.equal(state.mission.bombed, true);
  assert.equal(state.stats.missionDraws, 190);
  assert.ok(state.stats.fightersSpawned > 0 && state.stats.flakAttacks > 0 && state.stats.enemyAttacks > 0);
  assert.ok(state.stats.fightersKilled > 0 && state.stats.opportunitySpent > 0);
  assert.ok(eventCounts.ATTACK_DISRUPTED > 0 && combatPulls.Burst > 0);
  for (const action of ['directFire', 'advancedFire', 'convert', 'repair', 'fireControl', 'medical', 'restartEngine']) assert.ok(seenActions.has(action), `${action} participates in the complete sortie`);
  assert.deepEqual({ outcome: state.outcome, round: state.round, position: state.mission.position, altitude: state.altitude,
    bombingResult: state.mission.bombingResult, rng: state.rng, opportunity: state.opportunity,
    livingCrew: state.crew.filter(crew => crew.health !== 'dead').length, stats: state.stats, combatPulls, eventCounts }, witness.metrics);
});
