import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dispatch } from '../rules.mjs';
import { SAVE_KEY, loadSession } from '../persistence.mjs';
import { legacyWitnessState } from './fixtures/legacy-witness.mjs';

test('historical combat witness preserves its old settings on migration and rejects its retired ordered-shot command', async () => {
  const witness=JSON.parse(await readFile(new URL('./fixtures/baseline-home-witness.json',import.meta.url),'utf8'));
  assert.equal(witness.commands.length,207);
  assert.equal(witness.commands.filter(c=>c.action==='orderShot').length,3);
  assert.equal(witness.commands.filter(c=>c.action==='convert').length,6);
  const original=legacyWitnessState(witness.seed), encoded=JSON.stringify({version:1,state:original,view:original,pending:[],log:[],current:null,speed:'normal'});
  const migrated=loadSession({getItem:key=>key===SAVE_KEY?encoded:null});
  assert.ok(migrated);
  assert.deepEqual(migrated.state.bags,original.bags);
  assert.equal(migrated.state.rng,original.rng);
  assert.equal(migrated.state.config.outboundLength,6);
  assert.equal(migrated.state.config.returnLength,4);
  assert.equal(migrated.state.config.repairDuration,1);
  assert.equal(migrated.state.config.combatBurst,0);
  assert.equal(migrated.state.config.disruptOnHit,false);
  assert.equal(migrated.state.config.opportunityEnabled,false);
  let state=migrated.state;
  for(const command of witness.commands) {
    if(command.action==='orderShot') {
      const before=structuredClone(state);
      assert.throws(()=>dispatch(state,command),/available|unknown|action/i);
      assert.deepEqual(state,before,'a retired decision cannot partially spend resources or advance the sortie');
      break;
    }
    state=dispatch(state,command).state;
  }
  assert.ok(state.stats.missionDraws>0&&state.stats.fightersSpawned>0,'compatible opening decisions still replay');
});
