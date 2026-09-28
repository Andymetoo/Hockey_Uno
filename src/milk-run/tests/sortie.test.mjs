import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGame } from '../state.mjs';
import { dispatch } from '../rules.mjs';
import { DEFAULT_CONFIG } from '../config.mjs';

test('committed default-rules witness reaches HOME through combat, injuries, fire, and crisis work', async () => {
  const witness=JSON.parse(await readFile(new URL('./fixtures/baseline-home-witness.json',import.meta.url),'utf8'));
  let state=createGame({},witness.seed),events=0;
  for(const command of witness.commands){const result=dispatch(state,command);state=result.state;events+=result.events.length;}
  assert.deepEqual(state.config,DEFAULT_CONFIG);
  assert.equal(state.outcome,'success');assert.equal(state.round,10);assert.equal(state.mission.position,10);
  assert.equal(state.crew.filter(c=>c.health!=='dead').length,witness.result.alive);
  assert.deepEqual(state.stats,witness.result.stats);
  assert.equal(events,witness.result.events);
  assert.ok(state.stats.fightersKilled>0&&state.stats.flakAttacks>0&&state.stats.enemyCrits>0&&state.stats.firesStarted>0&&state.stats.repairs>0&&state.stats.crewInjured>0);
});
