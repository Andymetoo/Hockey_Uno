// Touch/framing checks deliberately do NOT use harness.touch: that helper scrolls
// the target into view and would hide the physical-phone regression under test.
import assert from 'node:assert/strict';
import { openBrowser, sleep } from './browser-harness.mjs';
import { createGame } from '../state.mjs';
import { dispatch, legalWorkPositions, legalTargets } from '../rules.mjs';
import { fighter } from './fixtures.mjs';

const baseline = process.argv.includes('--baseline');
const label = baseline ? 'baseline' : 'final';
const b = await openBrowser({ port: 9373, artifactFolder: `visual-ux-${label}` });
const checks = [], measurements = [];
const note = name => { checks.push(name); console.log(name); };
const fresh = () => createGame({ v2StoryMode:false, v2MissionEnemy:0, v2MissionResource:100, opportunityEnabled:false }, 'visual-ux-browser', 'v2-continuous');
const prep = (crewId='engineer') => dispatch(fresh(),{type:'activate',crewId}).state;
const tile = id => `[data-compact-action="${id}"]`;
async function rawTouch(selector) {
  const p = await b.evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing touch target');const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);return {x,y,visible:y>=0&&y<=innerHeight&&x>=0&&x<=innerWidth,uncovered:!!hit&&(e===hit||e.contains(hit)||hit.contains(e))};})()`);
  assert.ok(p.visible && p.uncovered, `Raw touch target is visible and uncovered: ${selector} ${JSON.stringify(p)}`);
  await b.command('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});
  await b.command('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
  await sleep(60);
}
async function geometry(name,width) {
  const m=await b.evaluate(`(async () => {
    window.uxSamples=(await import('./performance.mjs')).performanceSamples;
    const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
    const board=rect(document.querySelector('#board')),dock=rect(document.querySelector('.action-dock'));
    const topbar=rect(document.querySelector('.topbar')),status=rect(document.querySelector('#status')),top=Math.max(0,topbar.bottom,status.bottom),bottom=Math.min(innerHeight,dock.top);
    const cells=[...document.querySelectorAll('#board [data-cell]')].map(e=>rect(e));
    const aircraft={top:Math.min(...cells.map(r=>r.top)),bottom:Math.max(...cells.map(r=>r.bottom))};
    const height=aircraft.bottom-aircraft.top,visible=Math.max(0,Math.min(aircraft.bottom,bottom)-Math.max(aircraft.top,top));
    const fighters=[...document.querySelectorAll('#board [data-fighter]')].map(e=>({id:e.dataset.fighter,...rect(e)}));
    const profile=label=>{const samples=(window.uxSamples??[]).filter(s=>s.label===label).map(s=>s.ms).sort((a,b)=>a-b);return {n:samples.length,mean:samples.reduce((a,b)=>a+b,0)/(samples.length||1),p95:samples[Math.floor(samples.length*.95)]??0};};
    return {scrollY,screen:{width:innerWidth,height:innerHeight},overflow:document.documentElement.scrollWidth-innerWidth,board,dock,usable:{top,bottom,height:bottom-top},aircraft:{...aircraft,height,visible,visibleFraction:visible/height},fighters,mode:document.querySelector('#crew-flow').dataset.state,dom:document.querySelectorAll('*').length,recorderRows:document.querySelectorAll('#event-log li').length,frame:document.querySelector('.board-and-altitude').dataset.framed??null,profile:{render:profile('render'),layout:profile('viewport-layout'),framing:profile('board-framing')}};
  })()`);
  measurements.push({name,width,...m});return m;
}
async function touchChoice(kind,id) {
  await rawTouch(`#board [data-${kind}="${id}"]`);
  if(await b.evaluate(`!!document.querySelector('[data-target-choice="${id}"]')`))await rawTouch(`[data-target-choice="${id}"]`);
}
async function key(key,code,keyCode) {
  await b.command('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});
  await b.command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode});
  await sleep(80);
}
async function userScroll() {
  const area=await b.evaluate(`(()=>{const r=document.querySelector('#board').getBoundingClientRect(),d=document.querySelector('.action-dock').getBoundingClientRect();return {x:Math.max(25,r.left+12),y:Math.min(d.top-30,Math.max(220,r.top+180))};})()`);
  await b.command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[area]});
  for(let step=1;step<=6;step++){
    await b.command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:area.x,y:area.y-step*20}]});
    await sleep(30);
  }
  await b.command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(300);
  return b.evaluate('scrollY');
}
try {
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:'window.MILK_RUN_PROFILE=true'});
  for(const width of [320,360,390,430,768,1440]) {
    const height=width<768?844:1000;await b.viewport(width,height);
    await b.inject(fresh(),{speed:'manual'});
    await b.evaluate(`(async()=>{window.MILK_RUN_PROFILE=true;window.uxSamples=(await import('./performance.mjs')).performanceSamples;uxSamples.length=0;})()`);
    // The only deliberate setup scroll is to the crew rack, before activation.
    await b.evaluate(`document.querySelector('[data-crew="engineer"]').scrollIntoView({block:'center',behavior:'instant'})`);
    await rawTouch('[data-crew="engineer"]');
    await b.evaluate('scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"})');
    const t=Date.now();await b.flush();await sleep(500);
    const ready=await geometry('palette-from-bottom',width);ready.observationWindowMs=Date.now()-t;
    if(!baseline){assert.ok(ready.aircraft.visibleFraction>.94,`${width}px aircraft framed above ready sheet: ${ready.aircraft.visibleFraction}`);assert.ok(ready.overflow<=1);}
    if([360,390,430,1440].includes(width))await b.screenshot(`palette-${width}`);
    let s=dispatch(fresh(),{type:'activate',crewId:'engineer'}).state;
    s.fighters=[fighter('visual',{hp:4,maxHp:4,engagementRemaining:5})];s.bags.combat={tokens:['Hit'],discard:[]};
    await b.inject(s);await b.evaluate('scrollTo({top:0,behavior:"instant"})');
    const before=await b.getState();const start=Date.now();await rawTouch(tile('basicFire'));await sleep(500);
    const targeting=await geometry('target-from-top',width);targeting.observationWindowMs=Date.now()-start;
    if(!baseline){assert.ok(targeting.aircraft.visibleFraction>.94,`${width}px aircraft framed for targeting`);assert.ok(targeting.fighters.every(f=>f.top>=targeting.usable.top-2&&f.bottom<=targeting.usable.bottom+2),`${width}px fighters fit usable region`);}
    if([360,390,430,1440].includes(width))await b.screenshot(`targeting-${width}`);
    assert.deepEqual(await b.getState(),before,'Choosing action changes no rules or RNG');
    if(!baseline) {
      await rawTouch('#board [data-fighter="visual"]');
      assert.deepEqual(await b.getState(),before,'Touch target remains tentative');
      await rawTouch('[data-ui="confirm-target"]');await b.flush();
      assert.equal(await b.evaluate(`milkRun.exportSession().log.filter(e=>e.type==='GUNNER_SHOT_ROLL').length`),1);
      note(`${width}px raw-touch Basic Fire / target / Confirm; usable board and fighter framing; no overflow`);
    } else {
      note(`${width}px baseline palette aircraft ${(ready.aircraft.visibleFraction*100).toFixed(1)}% visible; targeting ${(targeting.aircraft.visibleFraction*100).toFixed(1)}%`);
    }
  }
  if(!baseline) {
    await b.viewport(390,844);
    let spawnState,spawnTarget;
    for(let i=0;i<100&&!spawnState;i++) {
      const candidate=createGame({v2StoryMode:false,v2MissionEnemy:100,v2MissionResource:0,opportunityEnabled:false},`visual-spawn-${i}`,'v2-continuous');
      const resolved=dispatch(candidate,{type:'activate',crewId:'engineer'}).state;
      if(legalTargets(resolved,'engineer').length){spawnState=candidate;spawnTarget=legalTargets(resolved,'engineer')[0].id;}
    }
    assert.ok(spawnState,'Deterministic real Enemy-draw fixture found');await b.inject(spawnState,{speed:'manual'});
    await b.evaluate(`document.querySelector('[data-crew="engineer"]').scrollIntoView({block:'center',behavior:'instant'})`);
    await rawTouch('[data-crew="engineer"]');assert.equal((await b.getState()).stats.missionDraws,1);await b.flush();await sleep(450);
    await b.screenshot('enemy-spawn-ready-390');await rawTouch(tile('basicFire'));await sleep(450);
    await rawTouch(`#board [data-fighter="${spawnTarget}"]`);await rawTouch('[data-ui="confirm-target"]');await b.flush();
    assert.equal(await b.evaluate(`milkRun.exportSession().log.filter(e=>e.type==='GUNNER_SHOT_ROLL').length`),1);
    note('Real crew tap → Enemy draw/spawn → palette → Basic Fire → board target → Confirm → combat result');

    let cluster=prep();cluster.fighters=['cluster-a','cluster-b','cluster-c'].map(id=>fighter(id,{hp:4,maxHp:4,engagementRemaining:5}));await b.inject(cluster);
    await rawTouch(tile('basicFire'));await sleep(450);
    const edge=await b.evaluate(`(()=>{const r=document.querySelector('#board [data-fighter="cluster-a"]').getBoundingClientRect();return{x:r.right-3,y:r.top+r.height/2};})()`);
    await b.command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[edge]});await b.command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100);
    assert.ok(await b.evaluate(`document.querySelectorAll('[data-target-choice]').length>=2`),'Close fighters expose a readable chooser');
    await rawTouch('[data-target-choice="cluster-b"]');assert.deepEqual(await b.getState(),cluster);
    await b.screenshot('clustered-targets-390');await rawTouch('[data-ui="confirm-target"]');await b.flush();
    note('Three clustered fighters retain full-size ambiguity chooser and deliberate Confirm under raw touch');

    let s=prep();s.fighters=[fighter('steady',{hp:4,maxHp:4,engagementRemaining:5})];await b.inject(s);await sleep(450);
    await b.evaluate(`window.__visualBoard=document.querySelector('#board svg')`);
    const framedY=await b.evaluate('scrollY');const inspectedY=await userScroll();
    assert.ok(Math.abs(inspectedY-framedY)>30,'An intentional touch scroll actually moves the document');
    await rawTouch(tile('medical'));await sleep(500);
    assert.ok(Math.abs((await b.evaluate('scrollY'))-inspectedY)<3,'Unavailable action detail rerender does not steal deliberate scroll');
    assert.equal(await b.evaluate(`window.__visualBoard===document.querySelector('#board svg')`),true,'Unavailable action detail preserves mounted board DOM');
    await rawTouch(tile('basicFire'));await sleep(450);await userScroll();
    const targetScroll=await b.evaluate('scrollY');
    await b.click('#board [data-fighter="steady"]');await sleep(450);
    assert.ok(Math.abs((await b.evaluate('scrollY'))-targetScroll)<3,'Tentative target selection does not steal deliberate scroll');
    assert.deepEqual(await b.getState(),s);note('Intentional touch scrolling survives unavailable action detail and tentative target rerenders');

    for(const [width,height] of [[360,640],[390,700]]) {
      await b.viewport(width,height);await b.inject(s);await b.evaluate('scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"})');
      await rawTouch(tile('basicFire'));await sleep(450);
      const short=await geometry('short-phone-targeting',width);
      assert.ok(short.aircraft.visibleFraction>.94,'Short-phone target grid is framed above controller');
      assert.ok(short.fighters.every(f=>f.top>=short.usable.top-2&&f.bottom<=short.usable.bottom+2),'Short-phone fighter remains visible');
      await rawTouch('#board [data-fighter="steady"]');await rawTouch('[data-ui="confirm-target"]');await b.flush();
      note(`${width}×${height} short-phone raw touch target and Confirm without document scrolling`);
    }

    await b.viewport(390,844);
    s=prep('radio');s.crew.find(c=>c.id==='pilot').health='injured';await b.inject(s);
    await rawTouch(tile('medical'));await sleep(450);await touchChoice('crew-id','pilot');
    assert.deepEqual(await b.getState(),s);await rawTouch('[data-ui="work-position"]');await sleep(450);
    const patient=s.crew.find(c=>c.id==='pilot');const medicalPosition=legalWorkPositions(s,'radio',patient.position)[0].id;
    await touchChoice('cell',medicalPosition);assert.deepEqual(await b.getState(),s);
    await rawTouch('[data-ui="confirm-target"]');await b.flush();assert.equal((await b.getState()).jobs[0].kind,'medical');
    note('Medical raw touch patient → work position → Confirm, no scrolling and no state mutation before Confirm');

    for(const [action,status] of [['repair','damaged'],['fireControl','fire']]) {
      s=prep('radio');s.cells['A3-1']=status;s.cells['A3-2']=status;await b.inject(s);
      await rawTouch(tile(action));await sleep(450);await touchChoice('cell','A3-1');await touchChoice('cell','A3-2');
      assert.deepEqual(await b.getState(),s);await rawTouch('[data-ui="work-position"]');await sleep(450);
      await touchChoice('cell',legalWorkPositions(s,'radio',['A3-1','A3-2'])[0].id);
      assert.deepEqual(await b.getState(),s);await rawTouch('[data-ui="confirm-target"]');await b.flush();
      assert.equal((await b.getState()).jobs[0].kind,action);assert.equal((await b.getState()).jobs[0].cells.length,2);
      note(`${action}: two legal cells, safe work position and explicit Confirm using raw touch`);
    }

    s=prep('pilot');s.fighters=[fighter('direct',{hp:4,maxHp:4,engagementRemaining:5})];await b.inject(s);
    await rawTouch(tile('directFire'));await sleep(450);await touchChoice('crew-id','engineer');await sleep(450);
    await rawTouch('#board [data-fighter="direct"]');assert.deepEqual(await b.getState(),s);
    await rawTouch('[data-ui="confirm-target"]');await b.flush();assert.equal((await b.getState()).resources.Officer,s.resources.Officer-1);
    note('Pilot Direct Fire frames gunner and fighter stages with tentative selection and raw-touch Confirm');

    s=fresh();s.config.opportunityEnabled=true;s.opportunity=1;
    Object.assign(s.crew.find(c=>c.id==='engineer'),{used:true,activationCompleted:true,cycleSlotConsumed:true});
    s.fighters=[fighter('opportunity',{hp:4,maxHp:4,engagementRemaining:5})];await b.inject(s);
    await rawTouch('[data-ui="opportunity"]');await sleep(450);await touchChoice('crew-id','engineer');await sleep(450);
    await rawTouch('#board [data-fighter="opportunity"]');assert.deepEqual(await b.getState(),s);
    await rawTouch('[data-ui="confirm-target"]');await b.flush();assert.equal((await b.getState()).opportunity,0);
    assert.equal((await b.getState()).stats.missionDraws,s.stats.missionDraws);
    note('Opportunity raw-touch gunner/target/Confirm preserves its separate draw-free action');

    s=prep();s.fighters=[fighter('keyboard',{hp:4,maxHp:4,engagementRemaining:5})];await b.inject(s);await sleep(150);
    await b.evaluate(`document.querySelector('[data-compact-action="medical"]').focus({preventScroll:true})`);await key('Enter','Enter',13);
    assert.equal(await b.evaluate(`document.activeElement.dataset.compactAction`),'medical','Unavailable detail preserves keyboard focus');
    await b.evaluate(`document.querySelector('[data-compact-action="basicFire"]').focus({preventScroll:true})`);await key('Enter','Enter',13);await sleep(350);
    assert.equal(await b.evaluate(`document.activeElement.dataset.fighter`),'keyboard','Entering Fire moves keyboard focus to a valid target');
    assert.deepEqual(await b.getState(),s);await key('Escape','Escape',27);
    assert.equal(await b.evaluate(`document.querySelector('#crew-flow').dataset.state`),'ready');assert.deepEqual(await b.getState(),s);
    assert.ok(await b.evaluate(`!!document.activeElement.dataset.compactAction`),'Escape returns focus to action palette');
    note('Real keyboard Enter preserves unavailable-action focus and enters valid Fire target; Escape cancels without state/RNG changes');

    await b.evaluate(`milkRun.setSpeed('manual');milkRun.flush()`);
    s=prep();s.fighters=[fighter('reduced',{hp:4,maxHp:4,engagementRemaining:5})];await b.inject(s,{speed:'normal'});
    // Change the OS preference on the loaded live state. A preference-change
    // render may save, so never interleave it with test-fixture storage writes.
    await b.command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await sleep(150);
    await rawTouch(tile('basicFire'));await sleep(450);
    const motion=await b.evaluate(`({matches:matchMedia('(prefers-reduced-motion: reduce)').matches,animations:document.getAnimations().map(a=>({duration:a.effect.getTiming().duration,iterations:a.effect.getTiming().iterations})),smil:[...document.querySelectorAll('#board animateTransform')].map(e=>e.getAttribute('dur'))})`);
    assert.ok(motion.matches);assert.ok(motion.animations.every(a=>Number(a.duration)<=1),'Reduced motion has no long CSS animations');
    assert.ok(motion.smil.every(d=>parseFloat(d)<=.001),'Reduced motion has no long SVG transforms');
    await rawTouch('#board [data-fighter="reduced"]');await rawTouch('[data-ui="confirm-target"]');await b.flush();
    assert.equal(await b.evaluate(`milkRun.exportSession().log.filter(e=>e.type==='GUNNER_SHOT_ROLL').length`),1);
    await b.screenshot('reduced-motion-390');note('OS reduced motion preserves visible state and target/Confirm interaction while suppressing large motion');
  }
  assert.deepEqual(b.exceptions,[]);assert.deepEqual(b.badResponses,[]);
  await b.writeResults({label,checks,measurements,exceptions:b.exceptions,badResponses:b.badResponses});
} catch(error) {
  const diagnostic=await b.evaluate(`({phase:milkRun.getState().phase,crew:milkRun.getState().activeCrew,ruleset:milkRun.getState().ruleset,mode:document.querySelector('#crew-flow').dataset.state,body:document.body.textContent.slice(-2200)})`);
  await b.screenshot('failure');
  await b.writeResults({label,checks,measurements,error:error.message,diagnostic,exceptions:b.exceptions,badResponses:b.badResponses});
  console.log(JSON.stringify(diagnostic));throw error;
} finally {await b.close();}
