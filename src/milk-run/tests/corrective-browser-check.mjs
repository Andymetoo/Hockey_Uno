// Real touch regressions for the corrective rules/UI pass.
import assert from 'node:assert/strict';
import { openBrowser } from './browser-harness.mjs';
import { createGame } from '../state.mjs';
import { dispatch } from '../rules.mjs';
import { BOARD } from '../board.mjs';
import { activated, fighter } from './fixtures.mjs';

const b = await openBrowser({ port: 9340, artifactFolder: 'corrective' });
const { evaluate, click, touch, inject, flush, getState, screenshot, viewport } = b;
const checks = [];
const choose = async action => { await click('[data-ui="choose"]'); await click(`[data-action="${action}"]`); };
const close = () => click('dialog[open] [data-ui="close"]');
const eventTypes = () => evaluate('window.milkRun.exportSession().log.map(e=>e.type)');
const note = message => { checks.push(message); console.log(message); };

try {
  for (const [width, height] of [[1440,1000], [320,740], [360,800], [390,844]]) {
    await viewport(width, height);
    const radio = dispatch(createGame({ missionEnemy:1, missionResource:0, bf109Cards:1, bf110Cards:0, fw190Cards:0, me262Cards:0, flakCards:0 }, 'intercept-footer'), { type:'startRound' }).state;
    await inject(radio);
    await touch('#crew-list [data-crew="radio"]');
    await click('#action-content [data-ui="close"]');
    await touch('#intercept');
    assert.equal(await evaluate("document.querySelector('#sheet-intercept').checked"), true, 'closed sheet mirrors the visible footer preference');
    await touch('[data-ui="activate"]'); await flush();
    const intercepted = await eventTypes();
    assert.ok(intercepted.includes('INTERCEPT_DECLARED'));
    assert.ok(intercepted.includes('FLAK_STARTED'));
    assert.equal(intercepted.includes('FIGHTER_SPAWNED'), false);
    assert.equal((await getState()).stats.missionDraws, 1);

    // Both controls edit the same preference, including unchecking after a sheet closes.
    await inject(radio); await touch('#crew-list [data-crew="radio"]'); await touch('#sheet-intercept');
    await click('#action-content [data-ui="close"]');
    assert.equal(await evaluate("document.querySelector('#intercept').checked"), true);
    await touch('#intercept'); await touch('[data-ui="activate"]'); await flush();
    assert.equal((await eventTypes()).includes('INTERCEPT_DECLARED'), false);
    assert.equal((await getState()).fighters.length, 1);

    const gunner = activated('engineer');
    gunner.fighters = [fighter('before-enemies', { hp:3, maxHp:3 })];
    gunner.bags.combat = { tokens:['Hit'], discard:[] };
    await inject(gunner);
    assert.equal(await evaluate("!!document.querySelector('[data-ui=opportunity]')"), false, 'no shot before the normal action');
    await choose('wait'); await click('#choice-form button[type="submit"]'); await flush();
    assert.equal((await getState()).phase, 'opportunity');
    assert.equal((await getState()).crew.find(c => c.id === 'engineer').activationCompleted, true);
    assert.equal((await eventTypes()).includes('ENEMY_PHASE_STARTED'), false);
    assert.ok(await evaluate("!!document.querySelector('[data-command=continueEnemyPhase]')"));
    if (width === 390) {
      const savedWindow = await getState(); await b.reload();
      assert.deepEqual(await getState(), savedWindow, 'resuming the window does not run the pending enemy phase');
      assert.ok(await evaluate("!!document.querySelector('[data-command=continueEnemyPhase]')"));
    }
    await screenshot(`opportunity-window-${width}`);
    const beforeShot = await getState();
    await touch('[data-ui="opportunity"]'); await touch('#crew-list [data-crew="engineer"]');
    await touch('#board [data-fighter="before-enemies"]'); await click('[data-ui="confirm-target"]'); await flush();
    const afterShot = await getState();
    assert.equal(afterShot.phase, 'opportunity'); assert.equal(afterShot.fighters[0].hp, 2);
    assert.equal(afterShot.slot, beforeShot.slot); assert.equal(afterShot.stats.missionDraws, beforeShot.stats.missionDraws);
    assert.equal((await eventTypes()).includes('ENEMY_PHASE_STARTED'), false);
    await touch('[data-command="continueEnemyPhase"]'); await flush();
    const continued = await eventTypes();
    assert.equal(continued.filter(e => e === 'ENEMY_PHASE_STARTED').length, 1);
    assert.ok(continued.includes('ATTACK_DISRUPTED'));
    assert.equal(await evaluate("!!document.querySelector('[data-ui=opportunity]')"), false, 'window closes before next activation');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
  }
  note('Desktop and 320/360/390 touch: shared Intercept preference and an explicit completed-action Opportunity window before one enemy phase');

  const pilot = activated('pilot'); pilot.opportunity = 0;
  Object.assign(pilot.crew.find(c => c.id === 'engineer'), { used:true, activationCompleted:true });
  pilot.fighters = [fighter('pilot-order', { hp:3, maxHp:3 })]; pilot.bags.combat = { tokens:['Hit'], discard:[] };
  await inject(pilot); await choose('directFire'); await click('#choice-form button[type="submit"]'); await flush();
  assert.equal((await getState()).phase, 'opportunity'); assert.equal((await getState()).opportunity, 1);
  assert.equal((await eventTypes()).includes('ENEMY_PHASE_STARTED'), false);
  await touch('[data-ui="opportunity"]'); await touch('#crew-list [data-crew="engineer"]');
  await touch('#enemies [data-fighter="pilot-order"]'); await click('[data-ui="confirm-target"]'); await flush();
  assert.equal((await getState()).fighters[0].hp, 2); assert.equal((await getState()).phase, 'opportunity');
  await touch('[data-command="continueEnemyPhase"]'); await flush();
  assert.equal((await eventTypes()).filter(e => e === 'ENEMY_PHASE_STARTED').length, 1);
  note('Pilot Direct Fire immediately opens the pre-enemy window and its new Opportunity can be spent before the enemy phase');

  const medical = activated('pilot');
  medical.crew.find(c => c.id === 'radio').health = 'injured';
  medical.crew.find(c => c.id === 'tail').health = 'injured';
  for (const cell of BOARD.filter(c => c.fuselage && c.id[1] === '3')) medical.cells[cell.id] = 'fire';
  await inject(medical); await choose('medical');
  assert.equal(await evaluate("document.querySelector('#crew-list [data-crew=radio]').classList.contains('target-legal')"), false);
  assert.equal(await evaluate("document.querySelector('#crew-list [data-crew=tail]').classList.contains('target-legal')"), true);
  await touch('#crew-list [data-crew="radio"]');
  assert.equal(await evaluate('window.milkRun.getInteraction().targetId'), null);
  await touch('#crew-list [data-crew="tail"]'); await click('[data-ui="work-position"]');
  assert.ok(await evaluate("document.querySelectorAll('#board [data-work-cell]').length > 0"));
  await screenshot('medical-safe-patients-only');
  note('Medical highlights only patients with safe internal work positions and cannot select a trapped patient');

  // A valid ordinary repair choice previously shifted this worker visibly onto the wing.
  const repair = activated('engineer'); repair.cells['E3-1'] = 'damaged';
  const working = dispatch(repair, { type:'action', action:'repair', cells:['E3-1'], workCellId:'D3-1' }).state;
  await inject(working);
  const marker = await evaluate("(() => {const c=document.querySelector('#board [data-crew-id=engineer] > circle');return {x:Number(c.getAttribute('cx')),y:Number(c.getAttribute('cy')),r:Number(c.getAttribute('r'))};})()");
  const position = BOARD.find(c => c.id === 'D3-1');
  assert.ok(marker.x - marker.r >= 89 + position.x * 36 && marker.x + marker.r <= 89 + (position.x + 1) * 36);
  assert.ok(marker.y - marker.r >= 87 + position.y * 36 && marker.y + marker.r <= 87 + (position.y + 1) * 36);
  await evaluate("document.querySelector('#board').scrollIntoView({block:'center',behavior:'instant'})");
  await screenshot('worker-contained-in-interior');
  note('Shared worker markers remain entirely within their actual interior footprint');

  const states = activated('rightWaist');
  const crew = id => states.crew.find(c => c.id === id);
  crew('pilot').used = true; crew('pilot').activationCompleted = true;
  crew('bombardier').health = 'dead'; crew('navigator').health = 'injured'; crew('leftWaist').health = 'injured';
  states.jobs = [{ id:'repair',kind:'repair',crewId:'engineer',cells:['E3-1'],completeRound:3 }, { id:'fire',kind:'fireControl',crewId:'ball',cells:['A3-1'],completeRound:3 }, { id:'medical',kind:'medical',crewId:'radio',targetId:'leftWaist',completeRound:3 }];
  crew('engineer').job='repair'; crew('ball').job='fire'; crew('radio').job='medical';
  for (const [width,height] of [[1440,1000],[320,740],[360,800],[390,844]]) {
    await viewport(width,height); await inject(states); await touch('#crew-list [data-crew="tail"]'); await close();
    await evaluate("document.querySelector('.crew-panel').scrollIntoView({block:'center',behavior:'instant'})");
    assert.equal(await evaluate("document.querySelectorAll('#crew-list [data-crew]').length"),10);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
    for (const status of ['dead','injured','used','ready','repair','medical','fire','treated','active','selected']) {
      assert.ok(await evaluate(`!!document.querySelector('#crew-list .status-${status}')`), `${width}: ${status} visible`);
    }
    if (width < 650) {
      assert.ok(await evaluate("[...document.querySelectorAll('.crew-status')].every(e=>parseFloat(getComputedStyle(e).fontSize)>=10)"));
      const rows = await evaluate("[...new Set([...document.querySelectorAll('.crew-card')].map(e=>Math.round(e.getBoundingClientRect().top)))].length");
      assert.equal(rows,2);
    }
    await screenshot(`crew-states-${width}`);
  }
  note('All crew states remain distinct on desktop and a two-row 320/360/390 rack with enlarged status text');
  assert.deepEqual(b.exceptions,[]); assert.deepEqual(b.badResponses,[]);
  await b.writeResults({ browser:b.version.product,checks,exceptions:b.exceptions,badResponses:b.badResponses });
  console.log(`Corrective browser checks passed (${checks.length} groups).`);
} catch (error) {
  await screenshot('failure').catch(()=>{});
  await b.writeResults({ checks,failure:error.stack,state:await getState().catch(()=>null),exceptions:b.exceptions,badResponses:b.badResponses });
  throw error;
} finally { await b.close(); }
