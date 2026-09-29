// Actual-browser regression checks for the combat/economy playtest pass.
import assert from 'node:assert/strict';
import { openBrowser, sleep } from './browser-harness.mjs';
import { createGame } from '../state.mjs';
import { DEFAULT_CONFIG } from '../config.mjs';
import { DEV_PREFERENCES_KEY } from '../persistence.mjs';
import { dispatch } from '../rules.mjs';
import { activated, fighter } from './fixtures.mjs';

const b=await openBrowser({port:9339,artifactFolder:'combat-economy'});
const {evaluate,click,touch,inject,flush,current,getState,getView,screenshot,viewport}=b;
const checks=[];
const note=text=>{checks.push(text);console.log(text);};
const send=command=>evaluate(`window.milkRun.send(${JSON.stringify(command)})`);
const choose=async action=>{await click('[data-ui="choose"]');await click(`[data-action="${action}"]`);};
const close=()=>evaluate("document.querySelector('dialog[open]')?.close()");
async function advanceTo(type) {
  for(let count=0;count<100;count++) {
    if((await current())?.type===type)return;
    await click('[data-ui="step"]');
  }
  throw new Error(`Missing ${type}`);
}
async function changeForm(values) {
  await evaluate(`(() => {const f=document.querySelector('#dev-form');for(const [key,value] of Object.entries(${JSON.stringify(values)})){const field=f.elements.namedItem(key);if(typeof value==='boolean')field.checked=value;else field.value=value;}f.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
const physicalResources=s=>s.resources.Enlisted+s.resources.Officer+s.bags.mission.tokens.filter(t=>t==='Resource').length+s.bags.mission.discard.filter(t=>t==='Resource').length;

try {
  await viewport(390,844);
  const initial=createGame({},'economy-browser-defaults');
  await inject(initial,{speed:'normal'});
  assert.equal(initial.config.outboundLength,14);assert.equal(initial.config.returnLength,5);
  assert.equal(initial.config.medicalDuration,2);assert.equal(initial.config.repairDuration,2);assert.equal(initial.config.fireDuration,2);
  assert.equal(initial.opportunity,1);
  assert.match(await evaluate("document.querySelector('.opportunity-count').textContent"),/1\/3/);
  assert.match(await evaluate("document.querySelector('#bags').textContent"),/4.*burst/i);
  await evaluate("localStorage.setItem('unrelated-economy-fixture','preserved')");
  await click('[data-ui="dev"]');
  const overrides={outboundLength:17,returnLength:7,medicalDuration:3,repairDuration:3,fireDuration:3,combatHit:0,combatBurst:8,combatMiss:2,
    disruptOnHit:false,opportunityEnabled:true,startingOpportunity:2,opportunityCap:5,opportunityOnKill:false,presentationSpeed:'fast'};
  await changeForm(overrides);
  assert.deepEqual(await getState(),initial,'editing next-run preferences does not modify the current sortie');
  let preferences=await evaluate('window.milkRun.getPreferences()');
  for(const [key,value] of Object.entries(overrides))assert.equal(preferences[key],value,key);
  assert.equal(await evaluate("document.querySelector('#rules-modified').hidden"),false);
  await close();await b.reload();
  assert.deepEqual(await getState(),initial);
  preferences=await evaluate('window.milkRun.getPreferences()');
  for(const [key,value] of Object.entries(overrides))assert.equal(preferences[key],value,`${key} survives reload`);
  await click('[data-ui="dev"]');
  assert.equal(await evaluate("document.querySelector('#dev-form [name=combatHit]').value"),'0');
  await click('[data-ui="apply-dev"]');
  const custom=await getState();
  assert.equal(custom.opportunity,2);assert.equal(custom.bags.combat.tokens.length,10);
  assert.equal(custom.bags.combat.tokens.filter(t=>t==='Burst').length,8);
  assert.equal(await evaluate("document.querySelector('#speed').value"),'fast');
  await click('[data-ui="dev"]');await click('[data-ui="reset-defaults"]');
  assert.deepEqual(await getState(),custom,'Reset to Defaults preserves the active custom sortie');
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(DEV_PREFERENCES_KEY)})`),null);
  assert.deepEqual(await evaluate('window.milkRun.getPreferences()'),DEFAULT_CONFIG);
  await close();await b.reload();await click('[data-ui="dev"]');
  assert.equal(await evaluate("document.querySelector('#dev-form [name=combatBurst]').value"),'4');
  const beforeInvalid=await getState();
  await changeForm({combatHit:0,combatBurst:0,combatMiss:0});
  assert.match(await evaluate("document.querySelector('#dev-prefs-status').textContent"),/not saved|at least|empty/i);
  await click('[data-ui="apply-dev"]');
  assert.deepEqual(await getState(),beforeInvalid,'all-zero combat bag cannot launch');
  assert.ok(await evaluate("!!document.querySelector('#dev-dialog .action-error')"));
  await click('[data-ui="reset-defaults"]');await click('[data-ui="apply-dev"]');
  assert.deepEqual((await getState()).config,DEFAULT_CONFIG);
  assert.equal(await evaluate("document.querySelector('#rules-modified').hidden"),true);
  note('Canonical defaults, independent token counts, persistent next-run preferences, modified indicator, non-destructive reset and explicit empty-bag rejection');

  const burst=activated('engineer');burst.fighters=[fighter('burst-survivor',{hp:4,maxHp:4})];burst.bags.combat={tokens:['Burst'],discard:[]};
  await inject(burst,{speed:'manual'});await choose('basicFire');
  await touch('#board [data-fighter="burst-survivor"]');await click('[data-ui="confirm-target"]');
  await advanceTo('GUNNER_SHOT_ROLL');
  assert.equal((await current()).token,'Burst');assert.equal((await getView()).fighters[0].hp,4);
  assert.match(await evaluate("document.querySelector('#board-stage .draw-token').textContent"),/BURST\s*×2/i);
  await sleep(600);await screenshot('burst-token');
  await advanceTo('FIGHTER_DAMAGED');assert.equal((await getView()).fighters[0].hp,2);
  await advanceTo('FIGHTER_DISRUPTED');
  assert.ok(await evaluate("!!document.querySelector('#board .disrupt-marker')"));
  assert.ok(await evaluate("!!document.querySelector('#enemies .disrupted-badge')"));
  await screenshot('fighter-disrupted');
  await flush();assert.equal((await getState()).phase,'opportunity');
  assert.equal(await evaluate("window.milkRun.exportSession().log.some(e=>e.type==='ENEMY_PHASE_STARTED')"),false);
  await click('[data-command="continueEnemyPhase"]');
  await advanceTo('ATTACK_DISRUPTED');
  assert.match(await evaluate("document.querySelector('#board').textContent"),/ATTACK DISRUPTED/i);
  assert.equal((await getView()).fighters[0].disrupted,false);
  assert.equal(await evaluate("window.milkRun.getQueue().some(e=>e.type==='ENEMY_ATTACK_ROLL')"),false);
  await advanceTo('FIGHTER_MOVED');await flush();
  assert.equal((await getState()).stats.enemyAttacks,0);
  note('Burst reveals ×2 before damage, survivor Disrupted is visible, cancelled attack has no roll and still performs its flyby');

  const opportunity=activated('pilot');opportunity.phase='opportunity';Object.assign(opportunity.crew.find(c=>c.id==='engineer'),{used:true,activationCompleted:true});
  opportunity.fighters=[fighter('chain-1'),fighter('chain-2'),fighter('chain-3')];opportunity.bags.combat={tokens:['Burst'],discard:[]};
  await inject(opportunity);
  for(const id of ['chain-1','chain-2','chain-3']) {
    const before=await getState();
    await touch('[data-ui="opportunity"]');await touch('#crew-list [data-crew="engineer"]');
    await touch(`#enemies [data-fighter="${id}"]`);await click('[data-ui="confirm-target"]');await flush();
    const after=await getState();
    assert.equal(after.slot,before.slot);assert.equal(after.phase,before.phase);assert.equal(after.activeCrew,before.activeCrew);
    assert.equal(after.stats.missionDraws,before.stats.missionDraws);assert.equal(after.stats.enemyAttacks,before.stats.enemyAttacks);
    assert.equal(after.opportunity,1,'the kill returns the spent Opportunity');
    assert.deepEqual(after.resources,before.resources);
  }
  const chained=await getState();
  assert.equal(chained.fighters.length,0);assert.equal(chained.stats.opportunitySpent,3);assert.equal(chained.stats.opportunityGained,3);
  assert.equal(chained.stats.fightersKilled,3);
  await screenshot('opportunity-chain');
  note('Three direct Opportunity kills chain legally while preserving activation, slot, mission draws, resources and enemy phases');

  const between=activated('pilot');between.phase='select';between.opportunity=1;
  Object.assign(between.crew.find(c=>c.id==='engineer'),{used:true,activationCompleted:true});
  between.fighters=[fighter('between-activations',{hp:3,maxHp:3})];between.bags.combat={tokens:['Hit'],discard:[]};
  await inject(between);const beforeBetween=await getState();
  await touch('[data-ui="opportunity"]');await touch('#crew-list [data-crew="engineer"]');
  await touch('#enemies [data-fighter="between-activations"]');await click('[data-ui="confirm-target"]');await flush();
  const afterBetween=await getState();
  assert.equal(afterBetween.phase,'select');assert.equal(afterBetween.opportunity,0);assert.equal(afterBetween.fighters[0].hp,2);
  assert.equal(afterBetween.slot,beforeBetween.slot);assert.equal(afterBetween.stats.missionDraws,beforeBetween.stats.missionDraws);
  assert.equal(afterBetween.stats.enemyAttacks,beforeBetween.stats.enemyAttacks);
  note('Banked Opportunity is usable between crew activations and consumes no slot, draw, or enemy phase');

  const cancelled=activated('pilot');cancelled.phase='select';cancelled.opportunity=1;
  Object.assign(cancelled.crew.find(c=>c.id==='engineer'),{used:true,activationCompleted:true});
  cancelled.fighters=[fighter('cancel-shot')];cancelled.bags.combat={tokens:['Hit'],discard:[]};
  await inject(cancelled);await touch('[data-ui="opportunity"]');await touch('#crew-list [data-crew="engineer"]');
  await touch('#enemies [data-fighter="cancel-shot"]');await click('[data-ui="cancel-target"]');await flush();
  assert.deepEqual(await getState(),cancelled,'canceling before confirmation preserves every resource and game state field');
  note('Canceling a fully targeted Opportunity shot spends no token and leaves the fighter unchanged');

  const pilot=activated('pilot');pilot.fighters=[fighter('pilot-direct',{hp:3,maxHp:3})];pilot.bags.combat={tokens:['Hit'],discard:[]};await inject(pilot);await choose('directFire');
  await touch('#crew-list [data-crew="engineer"]');await touch('#enemies [data-fighter="pilot-direct"]');await flush();
  assert.equal((await getState()).fighters[0].hp,2);
  assert.equal((await getState()).opportunity,pilot.opportunity);
  assert.equal((await getState()).resources.Officer,pilot.resources.Officer-1);
  assert.equal(await evaluate("window.milkRun.exportSession().log.filter(e=>e.type==='GUNNER_SHOT_ROLL').length"),1);
  assert.equal(await evaluate("window.milkRun.exportSession().log.filter(e=>e.type==='ENEMY_PHASE_STARTED').length"),1);
  const unavailable=activated('pilot');unavailable.phase='opportunity';Object.assign(unavailable.crew.find(c=>c.id==='engineer'),{used:true,activationCompleted:true});unavailable.fighters=[fighter('cannot-shoot')];unavailable.opportunity=0;
  await inject(unavailable);await touch('[data-ui="opportunity"]');
  assert.match(await evaluate("document.querySelector('#info-content').textContent"),/opportunity/i);
  assert.deepEqual(await getState(),unavailable);await close();
  const disabled=activated('pilot',{opportunityEnabled:false});disabled.fighters=[fighter('direct-when-disabled')];await inject(disabled);await click('[data-ui="choose"]');
  assert.equal(await evaluate("document.querySelector('[data-action=directFire]')?.disabled??true"),false);
  assert.equal(await evaluate("!!document.querySelector('[data-ui=opportunity].unavailable')"),true);
  assert.match(await evaluate("document.querySelector('[data-ui=opportunity]').title"),/disabled for this sortie/i);await close();
  note('Pilot Direct Fire fires immediately without generating Opportunity; empty or disabled Opportunity remains clearly unavailable');

  for(const direction of ['Officer','Enlisted']) {
    const conversion=activated('copilot');conversion.resources={Officer:3,Enlisted:5};conversion.bags.mission={tokens:['Enemy','Resource'],discard:['Resource']};
    const total=physicalResources(conversion);await inject(conversion);await choose('convert');
    await evaluate(`document.querySelector('#choice-form [name=to]').value=${JSON.stringify(direction)}`);
    await click('#choice-form button[type="submit"]');await flush();
    const result=await getState();assert.equal(physicalResources(result),total);
    if(direction==='Officer') {assert.deepEqual(result.resources,{Officer:4,Enlisted:3});assert.equal(result.bags.mission.discard.length,2);}
    else {assert.deepEqual(result.resources,{Officer:2,Enlisted:7});assert.deepEqual(result.bags.mission.tokens,['Enemy']);assert.equal(result.bags.mission.discard.length,1);}
  }
  const noBagResource=activated('copilot');noBagResource.resources={Officer:3,Enlisted:5};noBagResource.bags.mission={tokens:['Enemy'],discard:['Resource']};
  await inject(noBagResource);await choose('convert');
  assert.equal(await evaluate("document.querySelector('#choice-form option[value=Enlisted]').disabled"),true);
  assert.match(await evaluate("document.querySelector('.conversion-explanation').textContent"),/mission bag|Resource/i);
  await screenshot('conversion-unavailable');await close();
  note('Copilot conversions conserve physical resources in both directions; bag-empty reverse conversion is visibly disabled despite Resource discard');

  assert.equal(await evaluate("localStorage.getItem('unrelated-economy-fixture')"),'preserved');
  assert.deepEqual(b.exceptions,[]);assert.deepEqual(b.badResponses,[]);
  await b.writeResults({browser:b.version.product,checks,exceptions:b.exceptions,badResponses:b.badResponses});
  console.log(`Combat/economy browser checks passed (${checks.length} scenario groups).`);
} catch(error) {
  await screenshot('failure').catch(()=>{});
  await b.writeResults({checks,failure:error.stack,current:await current().catch(()=>null),interaction:await evaluate('window.milkRun.getInteraction()').catch(()=>null),exceptions:b.exceptions,badResponses:b.badResponses});
  throw error;
} finally {await b.close();}
