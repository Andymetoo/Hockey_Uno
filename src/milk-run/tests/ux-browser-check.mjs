// Playtest UX regression checks against real rendered controls, not a DOM mock.
// Run: node src/milk-run/tests/ux-browser-check.mjs
import assert from 'node:assert/strict';
import { openBrowser, sleep } from './browser-harness.mjs';
import { createGame as createGameBase } from '../state.mjs';
// Exercise the retained legacy interaction; compact ON has its own touch suite.
const createGame=(config={},...args)=>createGameBase({...(args[1]==='v2-continuous'?{v2CompactCrewFlow:false}:{}),...config},...args);
import { dispatch } from '../rules.mjs';
import { BOARD, STATIONS, CREW_DEFS } from '../board.mjs';
import { die } from '../random.mjs';
import { activated, fighter, rngForIndexes } from './fixtures.mjs';

const b = await openBrowser();
const { evaluate, click, touch, viewport, inject, screenshot, flush, getState, getView, current } = b;
const checks = [], layouts = [];
const sizes = [[1440, 1000], [768, 1024], [320, 740], [360, 800], [390, 844], [430, 932]];
const safe = createGame({ missionEnemy: 0, missionResource: 100 }, 'ux-browser');
const note = label => { checks.push(label); console.log(label); };
const closeSheet = () => evaluate("document.querySelector('dialog[open]')?.close()");
const send = command => evaluate(`window.milkRun.send(${JSON.stringify(command)})`);
const speed = value => evaluate(`window.milkRun.setSpeed(${JSON.stringify(value)})`);
const choose = async action => { await click('[data-ui="choose"]'); await click(`[data-action="${action}"]`); };
async function advanceTo(type, maximum = 100) {
  for (let i = 0; i < maximum; i++) {
    if ((await current())?.type === type) return;
    await click('[data-ui="step"]');
  }
  throw new Error(`No ${type} beat in ${maximum} steps`);
}
async function stageInView() {
  await b.waitFor(`(() => {const r=document.querySelector('#board-stage').getBoundingClientRect(),dock=document.querySelector('.action-dock').getBoundingClientRect(),status=document.querySelector('#status').getBoundingClientRect();return r.y>=status.bottom-1&&r.bottom<=dock.y;})()`);
}
function rngFor(rolls) {
  for (let value = 0; value < 1000000; value++) {
    const state = { rng: value };
    if (rolls.every(([sides, result]) => die(state, sides) === result)) return value;
  }
  throw new Error('No RNG witness');
}
async function layout(label, mobile) {
  const shown = await evaluate(`(() => {
    const rect = e => { const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,board:rect(document.querySelector('#board svg')),
      crew:[...document.querySelectorAll('#crew-list [data-crew]')].map(e=>({...rect(e),id:e.dataset.crew})),
      opportunity:rect(document.querySelector('#opportunity-control')),
      dock:rect(document.querySelector('.action-dock')), quarters:document.querySelectorAll('#board [data-cell]').length,
      crewTokens:[...document.querySelectorAll('#board .crew-marker')].map(e=>({id:e.dataset.crewId,footprint:e.dataset.footprint})),
      primary:[...document.querySelectorAll('#primary-action button')].map(rect)};
  })()`);
  assert.ok(shown.scrollWidth <= shown.width + 1, `${label}: no page overflow`);
  assert.ok(shown.board.width > 200 && shown.board.x >= -1 && shown.board.right <= shown.width + 1, `${label}: board fits`);
  assert.equal(shown.quarters, 144); assert.equal(shown.crewTokens.length, 10);
  for (const definition of CREW_DEFS) assert.equal(shown.crewTokens.find(c => c.id === definition.id)?.footprint, STATIONS[definition.station].cells.join(' '));
  assert.equal(shown.crew.length, 10);
  assert.ok(shown.crew.every(r => r.width >= 44 && r.height >= 44), `${label}: crew touch targets`);
  assert.ok(shown.opportunity.width >= 44 && shown.opportunity.height >= 44, `${label}: permanent Opportunity control is visible and reachable`);
  if (mobile) {
    const rows = new Map();
    for (const r of shown.crew) { const y = Math.round(r.y); rows.set(y, (rows.get(y) || 0) + 1); }
    assert.deepEqual([...rows.values()], [5, 5], `${label}: two rows of five crew`);
    assert.ok(Math.max(...shown.crew.map(r => r.bottom)) - Math.min(...shown.crew.map(r => r.y)) < 190, `${label}: compact crew overview`);
  }
  assert.ok(shown.primary.every(r => r.height >= 44 && r.width >= 44));
  layouts.push({ label, ...shown });
}

try {
  await evaluate("localStorage.setItem('unrelated-prototype-ux', 'preserved')");
  for (const [width, height] of sizes) {
    await viewport(width, height); await inject(safe);
    await layout(`${width}x${height}`, width < 650);
    await screenshot(`ready-${width}`);
    await click('[data-command="startRound"]'); await flush();
    const before = await getState();
    await click('[data-crew="engineer"]');
    assert.deepEqual(await getState(), before, 'crew preview does not activate');
    await closeSheet();
    assert.equal(await evaluate("document.querySelectorAll('#board .sector.arc-legal').length"), 8, 'Top Turret previews eight legal sectors');
    await screenshot(`arc-preview-${width}`);
    await click('[data-ui="activate"]'); await flush();
    await click('[data-ui="choose"]');
    const sheet = await evaluate(`(() => {const r=document.querySelector('dialog[open]').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,text:document.querySelector('dialog[open]').innerText};})()`);
    assert.ok(sheet.x >= -1 && sheet.y >= -1 && sheet.right <= width + 1 && sheet.bottom <= height + 1, `${width}: sheet fits`);
    assert.match(sheet.text, /General Actions/i); assert.match(sheet.text, /Combat Actions/i);
    await screenshot(`action-sheet-${width}`); await closeSheet();
  }
  note('Desktop/tablet and 320/360/390/430 portrait layouts, two-row rack, sheets, board geometry and preview-only selection');

  // Persistent Opportunity control and arc audit on the real board.
  const noEnemies = dispatch(createGame({ missionEnemy:0, missionResource:100 }, 'opportunity-ui-no-fighters'), {type:'startRound'}).state;
  await viewport(390,844); await inject(noEnemies);
  await evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())");
  assert.equal(await evaluate("document.querySelector('#opportunity-control').classList.contains('unavailable')"), true);
  assert.match(await evaluate("document.querySelector('#opportunity-control').title"), /No active fighters/i);
  const arcPreview = dispatch(createGame({ missionEnemy:0, missionResource:100 }, 'authoritative-preview'), {type:'startRound'}).state;
  arcPreview.fighters=[fighter('preview-target',{quadrant:'Fore',altitude:'Low'}),fighter('radio-target',{quadrant:'Aft',altitude:'Level'})];
  const noCompleted=structuredClone(arcPreview);noCompleted.fighters=[fighter('waiting-target',{quadrant:'Fore',altitude:'High'})];
  await inject(noCompleted);assert.match(await evaluate("document.querySelector('#opportunity-control').title"),/No healthy gunner has completed/i);
  const noArc=structuredClone(arcPreview);noArc.fighters=[fighter('outside-arc',{quadrant:'Aft',altitude:'High'})];
  Object.assign(noArc.crew.find(c=>c.id==='navigator'),{used:true,activationCompleted:true});
  await inject(noArc);assert.match(await evaluate("document.querySelector('#opportunity-control').title"),/No fighter is inside/i);
  const noToken=structuredClone(arcPreview);noToken.fighters=[fighter('no-token-target',{quadrant:'Fore',altitude:'High'})];noToken.opportunity=0;
  Object.assign(noToken.crew.find(c=>c.id==='engineer'),{used:true,activationCompleted:true});
  await inject(noToken);assert.match(await evaluate("document.querySelector('#opportunity-control').title"),/No Opportunity tokens/i);
  for(const gunner of ['navigator','bombardier']) {
    await inject(arcPreview); await evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())"); await touch(`#crew-list [data-crew="${gunner}"]`); await closeSheet();
    for(const altitude of ['High','Level','Low']) assert.equal(await evaluate(`document.querySelector('[data-sector="Fore/${altitude}"]').classList.contains('arc-legal')`),true,`${gunner} preview includes Fore ${altitude}`);
  }
  await inject(arcPreview); await evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())"); await touch('#crew-list [data-crew="radio"]'); await closeSheet();
  assert.equal(await evaluate("document.querySelector('[data-sector=\"Aft/Level\"]').classList.contains('arc-legal')"),true,'Radio preview includes Aft Level');
  note('Persistent Opportunity status and Nose Fore High/Level/Low plus Radio Aft Level previews');

  // Banked Opportunity starts a target flow and stays banked until shot confirmation.
  const banked=dispatch(createGame({missionEnemy:0,missionResource:100},'opportunity-ui-banked'),{type:'startRound'}).state;
  banked.phase='select';banked.opportunity=1;banked.fighters=[fighter('banked-target',{facing:180})];
  const gunner=banked.crew.find(c=>c.id==='engineer');gunner.used=true;gunner.activationCompleted=true;
  await inject(banked);await evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())");assert.equal(await evaluate("document.querySelector('#opportunity-control').classList.contains('available')"),true);
  await touch('#opportunity-control');assert.equal((await evaluate('window.milkRun.getInteraction()')).stage,'gunner');
  assert.equal(await evaluate("document.querySelector('#crew-list [data-crew=engineer]').classList.contains('target-legal')"),true,'eligible completed gunner is highlighted');
  await touch('#crew-list [data-crew="engineer"]');await touch('#enemies [data-fighter="banked-target"]');
  assert.equal((await getState()).opportunity,1,'target selection spends no token');
  await touch('[data-ui="cancel-target"]');assert.equal((await getState()).opportunity,1,'cancel before confirmation spends no token');
  note('Enabled Opportunity starts its own gunner and fighter targeting flow; cancel leaves the token banked');

  // Pilot uses an untapped gunner and its direct shot does not become Opportunity.
  const pilot=dispatch(createGame({missionEnemy:0,missionResource:100,directFireCost:1},'pilot-direct-ui'),{type:'startRound'}).state;
  pilot.phase='action';pilot.activeCrew='pilot';pilot.resources.Officer=1;pilot.fighters=[fighter('pilot-target',{hp:3,maxHp:3,facing:180})];pilot.opportunity=0;pilot.bags.combat={tokens:['Hit'],discard:[]};
  await inject(pilot);await evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())");await speed('manual');await click('[data-ui="choose"]');
  const directText=await evaluate("document.querySelector('[data-action=directFire]').innerText");
  assert.match(directText,/order any healthy gunner.*immediate Basic Shot/i);assert.doesNotMatch(directText,/Opportunity/i);
  await click('[data-action=directFire]');
  assert.equal(await evaluate("document.querySelector('#crew-list [data-crew=engineer]').classList.contains('target-legal')"),true,'healthy operating gunner is highlighted for Pilot order');
  await touch('#crew-list [data-crew="engineer"]');
  assert.match(await evaluate("document.querySelector('#board-stage').innerText"),/Pilot Direct Fire/i);
  assert.equal((await evaluate('window.milkRun.getInteraction()')).action,'directFire');
  assert.equal(await evaluate("document.querySelector('#enemies [data-fighter=pilot-target]').classList.contains('target-legal')"),true,'legal target highlights after gunner selection');
  await touch('#enemies [data-fighter="pilot-target"]');
  assert.equal((await getState()).phase,'action','target selection remains tentative');
  await click('[data-ui="confirm-target"]');
  assert.equal(await evaluate("document.querySelector('#opportunity-control').disabled"),true,'Opportunity cannot interrupt a resolving shot');
  await flush();
  assert.equal((await getState()).crew.find(c=>c.id==='engineer').used,false,'Pilot fire does not consume or tap gunner activation');
  assert.equal((await getState()).opportunity,0,'Pilot Fire grants no Opportunity absent a kill');
  assert.equal((await getState()).fighters[0].hp,2,'Pilot Direct Fire resolves a Basic Shot immediately');
  note('Pilot Direct Fire has distinct copy, targets a tapped-state-independent gunner and fires immediately without tapping it');

  const menu=activated('engineer');menu.fighters=[fighter('menu-target',{facing:180})];
  await inject(menu);await evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())");await click('[data-ui="choose"]');
  const menuActions=await evaluate("[...document.querySelectorAll('#action-content [data-action]')].map(e=>e.dataset.action)");
  assert.ok(menuActions.indexOf('basicFire')<menuActions.indexOf('advancedFire'),'gunner Basic Fire precedes Advanced Fire');
  assert.equal(menuActions.includes('medical'),true,'Medical remains visible with unavailable reason');
  assert.match(await evaluate("document.querySelector('[data-action=medical]').textContent"),/No injured target/);
  assert.equal(menuActions.includes('repair'),true,'Repair remains visible with reason');
  assert.equal(menuActions.includes('fireControl'),true,'Fire Control remains visible with reason');
  await closeSheet();
  note('Gunner action menu puts Basic/Advanced first and explains unavailable crisis actions');

  // Every fighter in a three aircraft formation has a separate touch center at phone widths.
  const cluster=activated('engineer');cluster.fighters=[fighter('touch-1',{facing:180}),fighter('touch-2',{facing:180}),fighter('touch-3',{facing:180})];
  for(const width of [320,360,390]) {
    await viewport(width,800);await inject(cluster);await evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())");
    const centers=await evaluate(`[...document.querySelectorAll('#board [data-fighter]')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height,id:e.dataset.fighter}})`);
    assert.equal(centers.length,3);assert.ok(centers.every(p=>p.w>=36&&p.h>=36),`${width}: three separate usable touch targets`);
    for(const target of ['touch-1','touch-2','touch-3']) {
      await inject(cluster);await evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())");await choose('basicFire');
      assert.equal(await evaluate("[...document.querySelectorAll('#board [data-fighter]')].every(e=>e.classList.contains('target-legal'))"),true,`${width}: all clustered fighters are legal targets`);
      await touch(`#board [data-fighter="${target}"]`);
      assert.equal((await evaluate('window.milkRun.getInteraction()')).targetId,target,`${width}: direct touch selects ${target}`);
      await click('[data-ui="cancel-target"]');
    }
    await screenshot(`three-fighter-touch-${width}`);
  }
  note('Three-fighter shared-sector formation has individually touchable targets at 320/360/390px');

  // Additional UI scenarios below deliberately use manual presentation: a test
  // never races animation timers, and every consequence can be inspected.
  await viewport(390, 844);
  await inject(dispatch(safe, { type: 'startRound' }).state);
  await speed('manual');
  await touch('[data-crew="engineer"]'); await closeSheet();
  await touch('[data-ui="activate"]');
  await stageInView();
  const firstBeat = await current();
  await sleep(300);
  assert.deepEqual(await current(), firstBeat, 'manual presentation never auto-advances a major beat');
  await advanceTo('MISSION_TOKEN_DRAWING');
  assert.ok(await evaluate("!!document.querySelector('#board-stage .draw-token.token-back[data-token=back]')"));
  await advanceTo('MISSION_TOKEN_DRAWN');
  assert.match(await evaluate("document.querySelector('#event').innerText"), /RESOURCE/i);
  assert.ok(await evaluate("!!document.querySelector('#board-stage .draw-token.token-reveal[data-token=Resource]')"));
  const reveal = await current(); await sleep(200); assert.deepEqual(await current(), reveal);
  await flush(); assert.equal((await getState()).phase, 'action');
  note('Real touch activates once, manual draw/reveal waits for input and decisions resume only after resolution');

  const combat = activated('engineer');
  combat.fighters = [fighter('cluster-1', { facing: 180, heading: 0 }), fighter('cluster-2', { hp: 1, facing: 180, heading: 0 }), fighter('illegal-low', { altitude: 'Low', facing: 180, heading: 0 })];
  combat.bags.combat = { tokens: ['Hit', 'Hit'], discard: [] };
  await inject(combat); await choose('basicFire');
  assert.equal(await evaluate("document.querySelectorAll('#board [data-fighter]').length"), 3);
  assert.equal(await evaluate("document.querySelectorAll('#enemies [data-fighter]').length"), 3);
  const cardText = await evaluate("document.querySelector('#enemies').innerText");
  assert.match(cardText, /BF-109/); assert.match(cardText, /FORE/i); assert.match(cardText, /HIGH/i); assert.match(cardText, /HP/i);
  await touch('#board [data-fighter="cluster-2"]');
  assert.deepEqual(await getState(), combat, 'selecting a target is tentative');
  await screenshot('direct-cluster-target');
  await click('[data-ui="confirm-target"]'); await flush();
  assert.deepEqual((await getState()).fighters.map(f => f.id), ['cluster-1', 'illegal-low']);
  assert.equal((await getState()).fighters[0].hp, 2, 'the other clustered fighter was not hit');
  note('Individual direct fighter targeting in a shared sector, queue information, confirmation and queue sliding');

  const advanced = activated('engineer'); advanced.fighters = [fighter('burst-target', { hp: 4, maxHp: 4, facing: 180 })];
  advanced.bags.combat = { tokens: ['Hit', 'Miss'], discard: [] }; advanced.rng = rngForIndexes([2, 1], [0, 0]);
  await inject(advanced); await speed('manual'); await choose('advancedFire');
  await touch('#enemies [data-fighter="burst-target"]'); await click('[data-ui="confirm-target"]');
  await stageInView();
  await advanceTo('COMBAT_TOKEN_DRAWING');
  assert.ok(await evaluate("!!document.querySelector('#board-stage .draw-token.token-back')"));
  await advanceTo('GUNNER_SHOT_ROLL');
  assert.ok(await evaluate("!!document.querySelector('#board-stage .draw-token[data-token=Hit]')"));
  assert.equal((await getView()).fighters[0].hp, 4, 'the revealed token precedes damage');
  await advanceTo('FIGHTER_DAMAGED'); assert.equal((await getView()).fighters[0].hp, 3);
  await advanceTo('COMBAT_TOKEN_DRAWING'); await advanceTo('GUNNER_SHOT_ROLL');
  assert.ok(await evaluate("!!document.querySelector('#board-stage .draw-token[data-token=Miss]')"));
  await sleep(600);
  assert.ok(await evaluate("(() => {const r=document.querySelector('#board-stage .draw-token').getBoundingClientRect();return r.width/r.height>.85;})()"), 'revealed token settles face-on and remains legible');
  await screenshot('advanced-fire-second-pull'); await flush();
  assert.equal((await getState()).fighters[0].hp, 3);
  note('Advanced Fire presents a distinct visual draw, Hit, damage, second draw and Miss without changing its token rules');

  for (const [action, condition] of [['repair', 'damaged'], ['fireControl', 'fire']]) {
    const work = activated('engineer'); work.cells['A3-1'] = condition; work.cells['A3-2'] = condition; work.cells['C6-2'] = condition;
    if(condition==='fire')work.crew.find(c=>c.id==='tail').health='dead';
    await inject(work); await choose(action);
    assert.ok(await evaluate("document.querySelector('#board [data-cell=\"A3-1\"]').classList.contains('target-legal')"));
    await touch('#board [data-cell="A3-1"]'); await touch('#board [data-cell="A3-2"]');
    assert.equal(await evaluate("document.querySelector('#board [data-cell=\"C6-2\"]').classList.contains('target-legal')"), false, 'disconnected target is unavailable');
    await click('[data-ui="work-position"]');
    assert.ok(await evaluate("!!document.querySelector('#board [data-work-cell=\"C3-2\"]')"), 'shared interior lane is selectable');
    await touch('#board [data-work-cell="C3-2"]');
    assert.deepEqual(await getState(), work, 'targets and position remain tentative');
    await screenshot(`${action}-internal-position`);
    await click('[data-ui="confirm-target"]'); await flush();
    const working = await getState();
    assert.deepEqual(working.jobs[0].cells, ['A3-1', 'A3-2']);
    assert.deepEqual(working.crew.find(c => c.id === 'engineer').position, ['C3-2']);
    assert.equal(await evaluate("document.querySelectorAll('#board .work-outline').length"), 2);
    assert.equal(await evaluate("document.querySelectorAll('#board .crew-marker').length"), 10, 'overlapping work does not hide a crew token');
    await screenshot(`${action}-working`);
  }
  note('Repair and Fire Control select connected board quarters, require same-row internal worker placement, and distinguish targets from worker');

  const treatment = activated('pilot'); treatment.crew.find(c => c.id === 'radio').health = 'injured';
  await inject(treatment); await choose('medical');
  await touch('#crew-list [data-crew="radio"]'); await click('[data-ui="work-position"]');
  await touch('#board [data-work-cell="D3-1"]'); await click('[data-ui="confirm-target"]'); await flush();
  assert.equal((await getState()).jobs[0].targetId, 'radio');
  assert.ok(await evaluate("document.querySelector('#crew-list [data-crew=\"pilot\"]').classList.contains('status-medical')"));
  assert.ok(await evaluate("document.querySelector('#crew-list [data-crew=\"radio\"]').classList.contains('status-treated')"));
  await touch('#crew-list [data-crew="pilot"]');
  await click('#action-dialog .crew-detail > summary');
  assert.match(await evaluate("document.querySelector('dialog[open]').innerText"), /UNCONTROLLED/);
  await screenshot('pilot-medical-uncontrolled'); await closeSheet();
  note('Medical selects an injured crew card, distinguishes medic/patient states, and explains the uncontrolled pilot seat');

  const ordered = activated('pilot'); ordered.phase = 'opportunity'; Object.assign(ordered.crew.find(c => c.id === 'engineer'), { used: true, activationCompleted: true });
  ordered.fighters = [fighter('opportunity-target', { hp: 1, facing: 180 })]; ordered.bags.combat = { tokens: ['Hit'], discard: [] };
  await inject(ordered); await touch('[data-ui="opportunity"]');
  await touch('#crew-list [data-crew="engineer"]'); await touch('#enemies [data-fighter="opportunity-target"]');
  await click('[data-ui="confirm-target"]'); await flush();
  assert.equal((await getState()).fighters.length, 0);
  assert.equal((await getState()).stats.missionDraws, ordered.stats.missionDraws);
  note('Opportunity Basic Shot selects a completed gunner and a queue card directly without another mission draw');

  const attack = activated('pilot');
  attack.fighters = [fighter('attacker', { heading: 180 })];
  attack.rng = rngFor([[6, 6], [6, 3], [6, 2], [4, 2]]);
  await inject(attack); await speed('manual'); await send({ type: 'action', action: 'wait' });
  await advanceTo('ENEMY_ATTACK_ROLL');
  assert.equal((await getView()).cells['C2-2'], 'healthy');
  await advanceTo('ENEMY_HIT_LOCATION');
  assert.equal((await getView()).cells['C2-2'], 'healthy');
  await advanceTo('ENEMY_LOCATION_FOCUS');
  assert.ok(await evaluate("!!document.querySelector('#board [data-cell=\"C2-2\"].struck')"));
  assert.ok(await evaluate("!!document.querySelector('#board .focus-reticle.contract')"));
  await advanceTo('AIRCRAFT_SQUARE_DAMAGED');
  assert.equal((await getView()).cells['C2-2'], 'damaged');
  assert.equal((await getView()).crew.find(c => c.id === 'pilot').health, 'healthy');
  await screenshot('critical-before-crew-injury');
  await advanceTo('CREW_INJURED');
  assert.equal((await getView()).crew.find(c => c.id === 'pilot').health, 'injured');
  const pending = await evaluate('window.milkRun.getQueue().length');
  await b.reload(); assert.equal(await evaluate('window.milkRun.getQueue().length'), pending);
  assert.equal((await current()).type, 'CREW_INJURED'); await flush();
  note('Exact-quarter critical location, structural damage and crew injury are separate visible beats; pending autosave resumes exactly');

  const missed = activated('pilot'); missed.fighters = [fighter('missing-attacker')]; missed.rng = rngFor([[6, 1]]);
  await inject(missed); await speed('manual'); await send({ type: 'action', action: 'wait' });
  await advanceTo('ENEMY_ATTACK_ROLL');
  assert.equal((await current()).result, 'miss');
  assert.equal(await evaluate("window.milkRun.getQueue().some(e=>e.type==='ENEMY_HIT_LOCATION')"), false);
  assert.equal(await evaluate("document.querySelectorAll('#board [data-cell].struck').length"), 0);
  await screenshot('attack-roll-miss'); await flush();
  note('Attack-roll MISS has no generated location or highlighted aircraft square');

  const empty = activated('pilot'); empty.fighters = [fighter('empty-attacker')];
  empty.rng = rngFor([[6, 2], [6, 1], [6, 1], [4, 1], [4, 1]]);
  await inject(empty); await speed('manual'); await send({ type: 'action', action: 'wait' });
  await advanceTo('ATTACK_EMPTY_SPACE');
  assert.equal(await evaluate("document.querySelector('#board .empty-miss')?.dataset.missCell"), 'A1-1');
  await flush();
  assert.equal(await evaluate("document.querySelector('#board .empty-miss')?.dataset.missCell"), 'A1-1', 'empty-air X remains after flyby and bookkeeping');
  await screenshot('empty-air-marker');
  await send({ type: 'activate', crewId: 'engineer' }); await flush();
  await send({ type: 'action', action: 'wait' }); await flush();
  assert.equal((await getState()).phase, 'opportunity');
  assert.equal(await evaluate("document.querySelector('#board .empty-miss')?.dataset.missCell"), 'A1-1', 'an Opportunity decision does not count as the next enemy attack');
  await click('[data-command="continueEnemyPhase"]'); await advanceTo('ENEMY_ATTACK');
  assert.equal(await evaluate("document.querySelectorAll('#board .empty-miss').length"), 0, 'next attack clears X');
  await flush();
  note('Empty-air hit location displays a blue X until the next enemy attack');

  const escort = activated('radio'); escort.rng = rngFor([[4, 2]]);
  await inject(escort); await speed('manual'); await send({ type: 'action', action: 'escort' });
  await advanceTo('ESCORT_SUMMONED');
  assert.equal(await evaluate("document.querySelectorAll('#board .escort-marker').length"), 1);
  await screenshot('escort-summoned'); await flush();
  let escorted = await getState();
  escorted = dispatch(escorted, { type: 'activate', crewId: 'pilot' }).state;
  escorted.fighters = [fighter('escort-target')];
  escorted.rng = rngFor([[6, 1], [4, 2]]);
  await inject(escorted); await speed('manual'); await send({ type: 'action', action: 'wait' });
  await advanceTo('ESCORT_INTERCEPT');
  assert.ok(await evaluate("!!document.querySelector('#board .escort-marker.intercepting')"));
  await screenshot('escort-intercept'); await flush();
  const endEscort = await getState(); endEscort.phase = 'roundEnd'; endEscort.slot = 10;
  await inject(endEscort); await send({ type: 'endRound' }); await flush();
  assert.equal(await evaluate("document.querySelectorAll('#board .escort-marker').length"), 0);
  note('Escort has a persistent blue board token, visible intercept, and round-end removal');

  const altitude = createGame({}, 'ux-altitude'); altitude.phase = 'roundEnd'; altitude.round = 1; altitude.slot = 10;
  for (const section of ['NosePort', 'NoseStarboard', 'Fuselage', 'Tail']) {
    const squares = BOARD.filter(c => c.section === section);
    for (const square of squares.slice(0, Math.floor(squares.length / 2) + 1)) altitude.cells[square.id] = 'damaged';
  }
  altitude.engines.slice(0, 3).forEach(e => { e.running = false; }); altitude.rng = rngFor([[6, 4], [6, 4]]);
  await inject(altitude); await speed('manual'); await send({ type: 'endRound' });
  await advanceTo('ALTITUDE_ROLL');
  assert.equal((await current()).cause, 'structure'); assert.equal((await current()).minimum, 5);
  assert.match(await evaluate("document.querySelector('#event').innerText"), /5\+/);
  assert.equal((await getView()).altitude, 5);
  await advanceTo('ALTITUDE_LOST'); assert.equal((await getView()).altitude, 4);
  await screenshot('altitude-loss');
  await click('[data-ui="step"]'); await advanceTo('ALTITUDE_ROLL');
  assert.equal((await current()).cause, 'engines');
  await advanceTo('ALTITUDE_LOST'); assert.equal((await getView()).altitude, 3);
  await flush();
  note('Structure and engine altitude checks roll and lose altitude in independent visible beats');

  const inspect = activated('pilot'); inspect.fighters = [fighter('turning', { facing: 90, heading: 270 })];
  await inject(inspect); await speed('normal'); await send({ type: 'action', action: 'wait' });
  await click('#board [data-cell="A1-1"]');
  const held = await current(), heldPending = await evaluate('window.milkRun.getQueue().length');
  assert.equal(await evaluate("document.querySelector('[data-ui=pause]').textContent"), 'Play');
  await sleep(1800);
  assert.deepEqual(await current(), held, 'inspection pauses a normal presentation while its sheet is open');
  assert.equal(await evaluate('window.milkRun.getQueue().length'), heldPending);
  await closeSheet(); await click('[data-ui="pause"]');
  await b.waitFor(`window.milkRun.exportSession().current.beat!==${held.beat}`);
  await speed('manual');
  await evaluate("document.querySelector('#log-details').open=true");
  await b.waitFor("!!document.querySelector('#event-log [data-log-group]')");
  const opened = await evaluate("(() => {const group=document.querySelector('#event-log [data-log-group]');group.open=true;const raw=group.querySelector('.log-raw');raw.open=true;return {group:group.dataset.logGroup,raw:raw.querySelector('summary').textContent};})()");
  await advanceTo('FIGHTER_ROTATED');
  assert.equal(await evaluate("document.querySelector('#board [data-fighter=turning]').dataset.heading"), '180');
  const rotation = await evaluate("(() => {const a=document.querySelector('#board [data-fighter=turning] animateTransform[type=rotate]');return a?{from:a.getAttribute('from'),to:a.getAttribute('to')}:null;})()");
  assert.deepEqual(rotation, { from: '270', to: '180' }, 'visual turn follows the stored absolute heading');
  assert.equal(await evaluate(`document.querySelector('#event-log [data-log-group="${opened.group}"]').open`), true);
  assert.equal(await evaluate(`(() => {const group=document.querySelector('#event-log [data-log-group="${opened.group}"]');return [...group.querySelectorAll('.log-raw')].find(d=>d.querySelector('summary').textContent===${JSON.stringify(opened.raw)})?.open;})()`), true);
  await flush();
  note('Inspection pauses Normal mode, Play resumes, absolute headings animate correctly, and expanded raw recorder details survive new beats');

  await evaluate("document.querySelector('#log-details').open=true");
  assert.ok(await evaluate("document.querySelector('#event-log').innerText.length>0"));
  assert.equal(await evaluate("localStorage.getItem('unrelated-prototype-ux')"), 'preserved');
  assert.deepEqual(b.exceptions, [], 'no runtime errors'); assert.deepEqual(b.badResponses, [], 'all assets load');
  await b.writeResults({ browser: b.version.product, checks, layouts, exceptions: b.exceptions, badResponses: b.badResponses,
    note: 'Chromium desktop and responsive touch emulation. Physical phones remain a manual check.' });
  console.log(`UX browser checks passed (${checks.length} scenario groups).`);
} catch (error) {
  await screenshot('failure').catch(() => {});
  await b.writeResults({ browser: b.version.product, passedChecks: checks, layouts, failure: error.stack,
    current: await current().catch(() => null), exceptions: b.exceptions, badResponses: b.badResponses });
  throw error;
} finally { await b.close(); }
