import assert from 'node:assert/strict';
import { openBrowser } from './browser-harness.mjs';
import { createGame as createGameBase } from '../state.mjs';
// Exercise the retained legacy interaction; compact ON has its own touch suite.
const createGame=(config={},...args)=>createGameBase({...(args[1]==='v2-continuous'?{v2CompactCrewFlow:false}:{}),...config},...args);
import { dispatch, damageSquare, resolveAttack } from '../rules.mjs';
import { STATIONS } from '../board.mjs';
import { startStoryThread, evaluateStoryBoundary } from '../story.mjs';
import { beginBombRun } from '../bombing.mjs';

const b=await openBrowser({port:9362,artifactFolder:'correctness-story'});
const {inject,click,touch,evaluate,getState,flush,viewport,screenshot,reload}=b;
const widths=[320,360,390,430,768,1440],checks=[];
const note=s=>{checks.push(s);console.log(s);};
const fresh=()=>createGame({v2StoryMode:false,opportunityEnabled:false,v2MissionEnemy:0,v2MissionResource:0,v2MissionTime:10},'crew-story-browser','v2-continuous');
const c=(s,id)=>s.crew.find(c=>c.id===id);
const action=(s,id,action,extra={})=>{s=structuredClone(s);s.activeCrew=id;s.phase='action';c(s,id).used=true;c(s,id).cycleSlotConsumed=true;return dispatch(s,{type:'action',action,...extra}).state;};
const prep=(s,id)=>{s.phase='action';s.activeCrew=id;c(s,id).used=true;c(s,id).cycleSlotConsumed=true;return s;};
const choose=async action=>{await click('[data-ui=choose]');await click(`[data-action=${action}]`);await click('#choice-form button[type=submit]');await flush();};
function replacement(home='pilot',substitute='navigator') {let s=fresh();damageSquare(s,STATIONS[home].cells[0],1,()=>{});return action(s,substitute,'manStation',{stationId:home});}
const fit=()=>evaluate("document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('dialog[open]')].every(d=>d.scrollWidth<=d.clientWidth+1&&d.getBoundingClientRect().left>=0&&d.getBoundingClientRect().right<=innerWidth+1)");

try {
  for(const width of widths){
    await viewport(width,width<768?844:1050);
    let s=replacement();await inject(s);
    const markers=await evaluate("(()=>{const ids=['pilot','navigator'];return ids.map(id=>{const el=document.querySelector('#board [data-crew-id='+id+']'),circle=el.querySelector('circle.crew-body');return {id,r:Number(circle.getAttribute('r')),x:Number(circle.getAttribute('cx')),y:Number(circle.getAttribute('cy')),label:el.getAttribute('aria-label')};});})()");
    assert.ok(markers[0].r<markers[1].r);assert.notDeepEqual([markers[0].x,markers[0].y],[markers[1].x,markers[1].y]);assert.match(markers[0].label,/Injured/);
    const top=await evaluate("(()=>{const el=document.querySelector('#board [data-crew-id=pilot] circle.crew-body'),r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('[data-crew-id]')?.dataset.crewId;})()");
    // Bring the shared seat into view before a real touch on its casualty chip.
    await evaluate("document.querySelector('#board [data-crew-id=pilot]').scrollIntoView({block:'center'})");
    await touch('#board [data-crew-id=pilot]');assert.match(await evaluate("document.querySelector('#action-title').textContent"),/Pilot/);
    assert.match(await evaluate("document.querySelector('.crew-health-history').textContent"),/INJURED.*Turn 0.*Aircraft hit/);
    await touch('[data-crew-history="C2-2"]');assert.match(await evaluate("document.querySelector('#info-title').textContent"),/C2-2.*Cell History|Cell History.*C2-2/);
    await click('#info-dialog [data-ui=close]');await screenshot(`shared-pilot-${width}`);

    // Treat the original through production work completion, then reclaim.
    s=action(s,'radio','medical',{targetId:'pilot',workCellId:'D2-3'});s.jobs[0].remainingTime=1;
    s=dispatch(s,{type:'activate',crewId:'bombardier'}).state;assert.equal(c(s,'pilot').health,'healthy');
    s=prep(s,'pilot');await inject(s);const subSlot=c(s,'navigator').cycleSlotConsumed;
    await choose('reclaimHome');s=await getState();assert.equal(c(s,'pilot').station,'pilot');assert.equal(c(s,'navigator').station,'navigator');assert.equal(c(s,'navigator').cycleSlotConsumed,subSlot);assert.ok(await fit());await screenshot(`reclaimed-pilot-${width}`);

    let pending=createGame({},'cloud-pass-0','v2-continuous');startStoryThread(pending,'weather_front');await inject(pending);await b.waitFor("document.querySelector('#story-dialog').open");
    assert.equal(await evaluate("document.querySelector('[data-ui=story-continue]').disabled"),true);
    await touch('[data-story-choice=enter]');assert.deepEqual(await getState(),pending);assert.equal(await evaluate("document.querySelector('[data-story-choice=enter]').getAttribute('aria-pressed')"),'true');
    await click('#story-dialog [data-ui=close]');await touch('[data-ui=story-conditions]');await click('#info-content [data-ui=story-choice]');assert.deepEqual(await getState(),pending);assert.equal(await evaluate("document.querySelector('[data-ui=story-continue]').disabled"),false);
    await screenshot(`selected-story-${width}`);await reload();await b.waitFor("document.querySelector('#story-dialog').open");assert.deepEqual(await getState(),pending);assert.equal(await evaluate("document.querySelector('[data-ui=story-continue]').disabled"),true);
    await touch('[data-story-choice=enter]');await evaluate("(()=>{const b=document.querySelector('[data-ui=story-continue]');b.click();b.click();})()");await flush();
    const committed=await getState();assert.equal(committed.story.facts.filter(f=>f.kind==='choice').length,1);assert.equal(committed.story.pending,null);
    await touch('[data-ui=story-conditions]');assert.match(await evaluate("document.querySelector('#info-content').textContent"),/Next update: after the next Progress checkpoint/);assert.ok(await fit());await screenshot(`cloud-next-checkpoint-${width}`);
    note(`${width}px: casualty and operator visible; health/cell shortcut; healed Pilot reclaims; select/inspect/reload/Continue commits once; lifecycle and dialogs fit`);
  }

  await viewport(390,844);
  let s=replacement();s=action(s,'radio','manStation',{stationId:'navigator'});c(s,'pilot').health='healthy';s=prep(s,'pilot');await inject(s);await choose('reclaimHome');s=await getState();assert.equal(c(s,'navigator').displaced,true);assert.equal(c(s,'radio').station,'navigator');assert.deepEqual(c(s,'navigator').position,STATIONS.pilot.cells);await screenshot('substitute-safely-displaced');note('Blocked substitute home: stays on Pilot footprint without evicting the second substitute');

  s=fresh();c(s,'bombardier').health='injured';s=action(s,'engineer','manStation',{stationId:'bombardier'});s=action(s,'radio','manStation',{stationId:'engineer'});await inject(prep(s,'engineer'));await choose('reclaimHome');s=await getState();assert.equal(c(s,'engineer').station,'engineer');assert.equal(c(s,'radio').station,'radio');await screenshot('engineer-reclaims-top-turret');
  await click('[data-crew=engineer]');assert.equal(await evaluate("document.querySelectorAll('[data-crew-history]').length"),2);await click('[data-crew-history="D2-3"]');assert.match(await evaluate("document.querySelector('#info-title').textContent"),/D2-3/);note('Engineer leaves bombsight, reclaims turret, returns Radio; both straddling Cell History shortcuts available');

  s=fresh();s.stats.turns=38;s.cells['D2-1']='damaged';const log=[];resolveAttack(s,e=>log.push({...e,turn:38,ruleset:'v2-continuous'}),{source:'Flak',roll:2,cellId:'D2-1'});assert.equal(s.cells['D2-1'],'damaged');assert.equal(c(s,'copilot').health,'injured');await inject(s,{log});await click('[data-crew=copilot]');assert.match(await evaluate("document.querySelector('.crew-health-history').textContent"),/Turn 38.*Flak.*D2-1/);await screenshot('direct-hit-blocks-fire');await click('[data-crew-history="D2-1"]');assert.match(await evaluate("document.querySelector('#info-content').textContent"),/Fire occupation stopped/);
  resolveAttack(s,e=>log.push({...e,turn:38,ruleset:'v2-continuous'}),{source:'BF-110',roll:6,cellId:'D2-1'});assert.equal(c(s,'copilot').health,'dead');assert.equal(s.cells['D2-1'],'fire');await inject(s,{log});await screenshot('crit-death-then-fire');note('Direct Flak hit blocks ignition with injury; later Crit kills the injured occupant and starts Fire, with health and cell history');

  for(const width of widths){await viewport(width,844);s=fresh();c(s,'bombardier').health='injured';s=action(s,'engineer','manStation',{stationId:'bombardier'});s.mission.position=7;await inject(s);assert.match(await evaluate("document.querySelector('#bombardier-warning').textContent"),/UNQUALIFIED.*Engineer.*Enlisted.*before TARGET/);assert.ok(await fit());await screenshot(`bombsight-warning-${width}`);s.phase='bombing';beginBombRun(s,()=>{});await inject(s);assert.match(await evaluate("document.querySelector('.bomb-run-no-drop').textContent"),/NO DROP.*Engineer.*Enlisted/);assert.ok(await fit());}
  note('All six widths: pre-target Enlisted bombsight warning and persistent exact NO DROP result');

  for(let n=0;n<30;n++){s=createGame({},`cloud-pass-${n}`,'v2-continuous');startStoryThread(s,'weather_front');s=dispatch(s,{type:'storyChoice',choiceId:'enter'}).state;if(s.story.threads.weather_front.due.stage==='deeper')break;}
  evaluateStoryBoundary(s);await inject(s);await touch('[data-ui=story-conditions]');assert.match(await evaluate("document.querySelector('#info-content').textContent"),/through TARGET.*Next update: at TARGET/);await screenshot('cloud-through-target');note('Scheduled inland cloud continuation explicitly says through TARGET');
  await inject(prep(fresh(),'radio'));await click('[data-ui=choose]');assert.match(await evaluate("document.querySelector('[data-action=medical]').textContent"),/No injured target/);assert.ok(await evaluate("document.querySelector('[data-action=medical]').disabled"));note('Unavailable Medical stays visible with its exact reason');
  assert.deepEqual(b.exceptions,[]);assert.deepEqual(b.badResponses,[]);await b.writeResults({browser:b.version.product,checks,widths,exceptions:b.exceptions,badResponses:b.badResponses});console.log(`Correctness/Story browser checks passed (${checks.length} groups).`);
}finally{await b.close();}
