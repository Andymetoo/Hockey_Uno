import assert from 'node:assert/strict';
import { openBrowser } from './browser-harness.mjs';
import { createGame } from '../state.mjs';
import { fighter } from './fixtures.mjs';

const b=await openBrowser({port:9348,artifactFolder:'status-qol'});
const {evaluate,inject,flush,getState,viewport,screenshot,touch,reload}=b;
const checks=[];
const note=message=>{checks.push(message);console.log(message);};
try {
  const v2=createGame({opportunityEnabled:false},'status-qol','v2-continuous');
  v2.phase='action';v2.activeCrew='engineer';
  Object.assign(v2.crew.find(c=>c.id==='engineer'),{used:true,cycleSlotConsumed:true,activationCompleted:false});
  v2.fighters=[fighter('status-fighter',{hp:2,maxHp:3,quadrant:'Fore',altitude:'High',facing:180,engagementRemaining:5})];
  v2.bags.combat={tokens:['Hit'],discard:[]};

  for(const width of [320,360,390]) {
    await viewport(width,800);await inject(v2);
    const initial=await evaluate(`(()=>{const m=document.querySelector('[data-fighter="status-fighter"]'),svg=m.ownerSVGElement,ring=m.querySelectorAll('.fighter-status-segment'),filled=getComputedStyle(m.querySelector('.hp.filled')),empty=[...m.querySelectorAll('.depleted')].map(e=>getComputedStyle(e).stroke),gradient=svg.querySelector('#fighter-hp-gradient');return {aria:m.getAttribute('aria-label'),hp:m.querySelectorAll('.hp.filled').length,eng:m.querySelectorAll('.engagement.filled').length,stroke:parseFloat(filled.strokeWidth)*svg.getBoundingClientRect().width/620,color:filled.stroke,gradient:{kind:gradient.tagName,units:gradient.getAttribute('gradientUnits'),stops:[...gradient.querySelectorAll('stop')].map(stop=>({offset:stop.getAttribute('offset')??'0',color:getComputedStyle(stop).stopColor}))},empty,segments:ring.length,scroll:document.documentElement.scrollWidth<=innerWidth+1};})()`);
    assert.match(initial.aria,/HP 2\/3/);assert.match(initial.aria,/Engagement 5\/5/);
    assert.equal(initial.hp,2);assert.equal(initial.eng,5);assert.equal(initial.segments,8);
    assert.ok(initial.stroke>=1.25,`${width}px filled ring stroke stays bold enough to read`);
    assert.equal(initial.color,'url("#fighter-hp-gradient")','HP uses its dedicated blue gradient');
    assert.deepEqual(initial.gradient,{kind:'linearGradient',units:'userSpaceOnUse',stops:[{offset:'0',color:'rgb(82, 167, 220)'},{offset:'1',color:'rgb(18, 59, 104)'}]},'HP preserves the authored blue-to-midnight gradient');
    assert.ok(initial.empty.every(stroke=>stroke==='none'),'depleted segments are completely blank');
    assert.equal(initial.scroll,true,`${width}px no horizontal overflow`);
    await screenshot(`fighter-rings-${width}`);
  }
  note('320/360/390px: segmented 2/3 HP and full five-Engagement rings remain visible, labeled, and overflow-free');

  await viewport(390,844);await inject(v2);
  await evaluate("window.milkRun.send({type:'action',action:'basicFire',targetId:'status-fighter'})");await flush();
  const attacked=await getState();assert.equal(attacked.fighters[0].hp,1);assert.equal(attacked.fighters[0].engagementRemaining,4);
  assert.equal(await evaluate("document.querySelectorAll('[data-fighter=status-fighter] .hp.filled').length"),1);
  assert.equal(await evaluate("document.querySelectorAll('[data-fighter=status-fighter] .engagement.filled').length"),4);
  await touch('[data-fighter="status-fighter"]');
  assert.match(await evaluate("document.querySelector('#info-content').textContent"),/HP 1\/3/);
  assert.match(await evaluate("document.querySelector('#info-content').textContent"),/Engagement 4\/5/);
  await b.click('#info-dialog [data-ui=close]');
  await reload();
  assert.equal(await evaluate("document.querySelectorAll('[data-fighter=status-fighter] .hp.filled').length"),1);
  assert.equal(await evaluate("document.querySelectorAll('[data-fighter=status-fighter] .engagement.filled').length"),4);
  note('Damage and enemy action update both rings immediately; tap inspection names HP/Engagement X/Y and resume restores them');

  const v1=createGame({opportunityEnabled:false},'crew-tilt','v1');
  v1.round=1;v1.phase='select';v1.bags.mission.tokens=['Resource'];
  await inject(v1);await touch('#crew-list [data-crew=engineer]');
  await b.click('#action-content [data-ui=activate]');await flush();
  let crewState=await getState();assert.equal(crewState.phase,'action');
  let status=await evaluate("(()=>{const e=document.querySelector('[data-crew=engineer]'),m=new DOMMatrix(getComputedStyle(e).transform);return {classes:e.className,angle:Math.atan2(m.b,m.a)*180/Math.PI};})()");
  assert.match(status.classes,/status-active/);assert.ok(Math.abs(status.angle)<.1,'active unresolved crew remains level');
  await evaluate("window.milkRun.send({type:'action',action:'wait'})");await flush();
  crewState=await getState();assert.equal(crewState.crew.find(c=>c.id==='engineer').used,true);
  status=await evaluate("(()=>{const e=document.querySelector('[data-crew=engineer]'),m=new DOMMatrix(getComputedStyle(e).transform);return {classes:e.className,angle:Math.atan2(m.b,m.a)*180/Math.PI};})()");
  assert.match(status.classes,/status-used/);assert.match(status.classes,/selected/);assert.ok(Math.abs(status.angle)>1,'selected used crew tilts without another card click');
  note('Selected unresolved crew stays level; activation completion immediately tilts the still-selected Used card');

  assert.deepEqual(b.exceptions,[]);assert.deepEqual(b.badResponses,[]);
  await b.writeResults({browser:b.version.product,checks,exceptions:b.exceptions,badResponses:b.badResponses});
  console.log(JSON.stringify({passed:checks.length,artifacts:b.artifacts},null,2));
} finally {await b.close();}
