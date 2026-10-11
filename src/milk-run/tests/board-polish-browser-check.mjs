import assert from 'node:assert/strict';
import { openBrowser } from './browser-harness.mjs';
import { fresh, stacked, prepared, member } from './station-audit-fixtures.mjs';
import { fighter } from './fixtures.mjs';

const b=await openBrowser({port:9371,artifactFolder:'visual-board-audit'});
const checks=[],measurements=[],note=message=>{checks.push(message);console.log(message);};
try {
  for(const width of [320,360,390,430,768,1440]) {
    await b.viewport(width,width<768?844:1000);
    const state=stacked();member(state,'navigator').health='injured';
    state.cells['A3-1']='fire';state.cells['A3-2']='damaged';
    state.fighters=[fighter('cluster-a',{hp:2,maxHp:4,engagementRemaining:3}),fighter('cluster-b',{hp:3,maxHp:3,engagementRemaining:4,disrupted:true}),fighter('cluster-c',{hp:2,maxHp:2,engagementRemaining:2})];
    await b.inject(state);await b.evaluate("document.querySelector('#board').scrollIntoView({block:'center',behavior:'instant'})");
    const readout=await b.evaluate(`(()=>{
      const board=document.querySelector('#board'),nav=board.querySelector('[data-crew-id=navigator]'),pilot=board.querySelector('[data-crew-id=pilot]');
      return {width,overflow:document.documentElement.scrollWidth>innerWidth+1,boardNodes:board.querySelectorAll('*').length,dom:document.querySelectorAll('*').length,
        crew:board.querySelectorAll('[data-crew-id]').length,injuredFill:getComputedStyle(nav.querySelector('.crew-body')).fill,
        healthyFill:getComputedStyle(pilot.querySelector('.crew-body')).fill,operator:pilot.dataset.operator,occupant:nav.dataset.operator,
        radii:[pilot,nav].map(e=>Number(e.querySelector('.crew-body').getAttribute('r'))),
        fighters:board.querySelectorAll('[data-fighter]').length,flames:board.querySelectorAll('path.fire-symbol').length,
        ongoing:board.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations===Infinity).length};
    })()`.replace('return {width,','return {width:'+width+','));
    assert.equal(readout.overflow,false);assert.equal(readout.crew,10);assert.equal(readout.fighters,3);
    assert.notEqual(readout.injuredFill,readout.healthyFill);assert.equal(readout.operator,'true');assert.equal(readout.occupant,'false');
    assert.ok(readout.radii[0]>readout.radii[1]);assert.equal(readout.flames,1);assert.equal(readout.ongoing,0);
    await b.screenshot(`after-board-${width}`);measurements.push(readout);
    await b.touch('#board [data-fighter=cluster-b] .fighter-token-face');
    assert.equal(await b.evaluate("document.querySelector('#info-dialog').open"),true,'nearby altitude sector must not intercept the clustered contact tap');
    assert.match(await b.evaluate("document.querySelector('#info-content').textContent"),/HP 3\/3/);
    await b.click('#info-dialog [data-ui=close]');
    await b.touch('#board [data-crew-id=pilot]');await b.touch('[data-inspect-occupant=navigator]');
    assert.match(await b.evaluate("document.querySelector('#info-content').textContent"),/INJURED/);
    assert.deepEqual(await b.getState(),state);await b.click('#info-dialog [data-ui=close]');
    note(`${width}px: aircraft damage, Fire, three fighters with unoccluded touch inspection, injured stacked occupant, operator identity; no overflow or repeating board animations`);
  }
  await b.viewport(390,844);
  const state=prepared(fresh(),'engineer');state.fighters=[fighter('target',{hp:2,maxHp:2,engagementRemaining:5})];
  state.bags.combat={tokens:['Burst'],discard:[]};await b.inject(state,{speed:'manual'});
  await b.touch('[data-compact-action=basicFire]');await b.click('#enemies [data-fighter=target]');
  assert.deepEqual(await b.getState(),state);
  assert.ok(await b.evaluate("!!document.querySelector('#board .target-vector')"));
  await b.screenshot('after-target-390');await b.click('[data-ui=confirm-target]');
  for(let i=0;i<25&&(await b.current())?.type!=='GUNNER_SHOT_ROLL';i++)await b.click('[data-ui=step]');
  assert.equal((await b.current()).type,'GUNNER_SHOT_ROLL');
  assert.equal(await b.evaluate("document.querySelector('#board .shot-result text')?.textContent"),'BURST');
  assert.ok(await b.evaluate("!!document.querySelector('#board .tracer-burst')"));
  await b.screenshot('after-burst-390');
  const resolved=await b.getState();await b.reload();assert.deepEqual(await b.getState(),resolved);
  assert.equal(await b.evaluate("document.querySelector('#board .shot-result text')?.textContent"),'BURST');
  assert.equal(await b.evaluate("document.querySelectorAll('#board animateTransform').length"),0);
  note('Basic Fire stays tentative until Confirm; Manual shows the real BURST and tracer; reloading the beat preserves the exact result without replaying movement');
  for(let i=0;i<25&&(await b.current())?.type!=='FIGHTER_DESTROYED';i++)await b.click('[data-ui=step]');
  assert.equal((await b.current()).type,'FIGHTER_DESTROYED');
  assert.ok(await b.evaluate("!!document.querySelector('#board .contact-destroyed')"));
  assert.equal(await b.evaluate("document.querySelectorAll('#board [data-fighter=target]').length"),0);
  await b.screenshot('after-destroyed-390');await b.flush();
  note('Destruction leaves a brief inspectable stamp at the last contact position, with no selectable ghost fighter');
  await b.evaluate("window.milkRun.setSpeed('manual');window.milkRun.flush();document.querySelectorAll('dialog[open]').forEach(d=>d.close())");
  await b.command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await b.waitFor("matchMedia('(prefers-reduced-motion:reduce)').matches");
  await b.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await b.inject(state,{speed:'normal'});await b.evaluate("window.milkRun.setSpeed('manual')");
  await b.click('[data-compact-action=basicFire]');await b.click('#enemies [data-fighter=target]');await b.click('[data-ui=confirm-target]');
  for(let i=0;i<25&&(await b.current())?.type!=='GUNNER_SHOT_ROLL';i++)await b.click('[data-ui=step]');
  assert.equal(await b.evaluate("document.querySelectorAll('#board animateTransform').length"),0);
  assert.equal(await b.evaluate("getComputedStyle(document.querySelector('#board .combat-tracer')).animationName"),'none');
  assert.equal(await b.evaluate("document.querySelector('#board .shot-result text')?.textContent"),'BURST');
  note('Reduced motion retains combat information and removes SVG/CSS movement');
  await b.flush();await b.evaluate("window.__savedBoard=document.querySelector('#board svg');window.milkRun.setSpeed('manual')");
  assert.equal(await b.evaluate("window.__savedBoard===document.querySelector('#board svg')"),true);
  const timing=await b.evaluate("(async()=>{const {boardMarkup}=await import('./board-view.mjs');const state=window.milkRun.getView(),times=[];for(let i=0;i<40;i++){const start=performance.now();boardMarkup(state);times.push(performance.now()-start);}return {mean:times.reduce((a,b)=>a+b,0)/times.length,max:Math.max(...times)};})()");
  note('Unchanged render preserves the mounted board DOM');
  assert.deepEqual(b.exceptions,[]);assert.deepEqual(b.badResponses,[]);
  await b.writeResults({checks,measurements,timing,exceptions:b.exceptions,badResponses:b.badResponses});
} finally {await b.close();}
