import assert from 'node:assert/strict';
import { openBrowser } from './browser-harness.mjs';
import { createGame as createGameBase } from '../state.mjs';
// Exercise the retained legacy interaction; compact ON has its own touch suite.
const createGame=(config={},...args)=>createGameBase({...(args[1]==='v2-continuous'?{v2CompactCrewFlow:false}:{}),...config},...args);
import { dispatch, availableCrew } from '../rules.mjs';
import { BOARD, STATIONS } from '../board.mjs';
import { rngForIndexes, fighter } from './fixtures.mjs';

const b=await openBrowser({port:9345,artifactFolder:'crew-stations'});
const {evaluate,click,touch,inject,getState,flush,viewport,screenshot}=b;
const checks=[];const note=message=>{checks.push(message);console.log(message);};
const member=(s,id)=>s.crew.find(c=>c.id===id);
function fresh(ruleset){let s=createGame({opportunityEnabled:false,missionEnemy:0,missionResource:80,v2MissionEnemy:0,v2MissionResource:80,medicalDuration:0,v2MedicalTime:1},'station-browser',ruleset);return ruleset==='v1'?dispatch(s,{type:'startRound'}).state:s;}
function activate(s,id,token='Resource'){const bag=s.bags.mission.tokens;s.rng=rngForIndexes([bag.length],[bag.indexOf(token)]);return dispatch(s,{type:'activate',crewId:id}).state;}
function nextActivation(s,id){for(let i=0;i<40;i++){
  if(s.phase==='select'&&availableCrew(s).some(c=>c.id===id))return activate(s,id);
  if(s.phase==='select')s=dispatch(activate(s,availableCrew(s)[0].id),{type:'action',action:'wait'}).state;
  else if(s.phase==='roundEnd')s=dispatch(s,{type:'endRound'}).state;
  else if(s.phase==='ready')s=dispatch(s,{type:'startRound'}).state;
  else throw Error(s.phase);
}throw Error('No activation');}
const choose=async id=>{await click('[data-ui=choose]');await click(`[data-action=${id}]`);};
try{
  for(const ruleset of ['v1','v2-continuous'])for(const width of [1440,320,360,390]){
    await viewport(width,width===1440?1000:844);
    let s=activate(fresh(ruleset),'navigator');member(s,'engineer').health='injured';await inject(s);
    await choose('manStation');
    assert.ok(await evaluate("[...document.querySelector('[name=stationId]').options].some(o=>o.value==='engineer')"));
    assert.equal(await evaluate("[...document.querySelector('[name=stationId]').options].some(o=>o.value==='radio')"),false);
    await evaluate("document.querySelector('[name=stationId]').value='engineer'");
    await click('#choice-form button[type=submit]');await flush();s=await getState();
    assert.equal(member(s,'navigator').station,'engineer');assert.equal(member(s,'navigator').homeStation,'navigator');
    assert.deepEqual(member(s,'engineer').position,STATIONS.engineer.cells);assert.equal(member(s,'engineer').station,null);
    assert.match(await evaluate("document.querySelector('#crew-list [data-crew=navigator]').textContent"),/AT TOP TURRET/);
    await touch('#crew-list [data-crew=navigator]');
    const details=await evaluate("document.querySelector('#action-content').textContent");
    assert.match(details,/Home Station: Navigator \/ nose gun/);assert.match(details,/Current Station: Engineer \/ top turret/);
    await click('#action-dialog [data-ui=close]');await b.reload();assert.deepEqual(await getState(),s);
    await evaluate("document.querySelector('.crew-panel').scrollIntoView({block:'center',behavior:'instant'})");
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    await screenshot(`replacement-${ruleset}-${width}`);

    s=dispatch(activate(s,'radio'),{type:'action',action:'medical',targetId:'engineer'}).state;
    if(ruleset!=='v1')s=dispatch(activate(s,'pilot','Time'),{type:'action',action:'wait'}).state;
    assert.equal(member(s,'engineer').health,'healthy');assert.equal(member(s,'engineer').station,null);
    await inject(s);await touch('#crew-list [data-crew=engineer]');
    assert.match(await evaluate("document.querySelector('#action-content').textContent"),/Current Station: None - Displaced/);
    assert.equal(await evaluate("document.querySelector('[data-action=returnHome]').disabled"),true);
    await click('#action-dialog [data-ui=close]');
    s=nextActivation(s,'navigator');await inject(s);await choose('leaveStation');await click('#choice-form button[type=submit]');await flush();
    s=await getState();assert.equal(member(s,'navigator').station,null);
    s=nextActivation(s,'engineer');await inject(s);await choose('returnHome');await click('#choice-form button[type=submit]');await flush();
    s=await getState();assert.equal(member(s,'engineer').station,'engineer');assert.equal(member(s,'navigator').station,null);
    note(`${ruleset} ${width}px: Man Station, explicit home/current identity, recovery without eviction, Leave Station, Return Home, exact reload`);
  }

  await viewport(390,844);
  let s=activate(fresh('v2-continuous'),'navigator');member(s,'engineer').health='injured';
  s=dispatch(s,{type:'action',action:'manStation',stationId:'engineer'}).state;s=nextActivation(s,'navigator');
  s.fighters=[fighter('aft',{quadrant:'Aft',hp:3,maxHp:3,engagementRemaining:5}),fighter('low',{altitude:'Low',engagementRemaining:5})];
  s.bags.combat.tokens=['Hit'];await inject(s);await choose('basicFire');
  assert.deepEqual(await evaluate('window.milkRun.getInteraction().crewId'),'navigator');
  assert.ok(await evaluate("document.querySelector('#board [data-fighter=aft]').classList.contains('target-legal')"));
  assert.equal(await evaluate("document.querySelector('#board [data-fighter=low]').classList.contains('target-legal')"),false);
  await touch('#board [data-fighter=aft]');await click('[data-ui=confirm-target]');await flush();
  assert.equal((await getState()).fighters.find(f=>f.id==='aft').hp,2);
  note('Navigator fires using Top Turret Aft/High targeting, with Fore/Low correctly unavailable');

  for(const width of [320,360,390]){
    await viewport(width,844);s=activate(fresh('v2-continuous'),'engineer');
    for(const c of BOARD.filter(c=>c.fuselage&&c.id[1]==='4'))s.cells[c.id]='fire';
    for(const id of ['leftWaist','rightWaist'])member(s,id).health='dead';
    await inject(s);await choose('fireControl');await touch('#board [data-cell="C4-2"]');await click('[data-ui=work-position]');
    const positions=await evaluate("[...document.querySelectorAll('#board [data-work-cell]')].map(e=>e.dataset.workCell)");
    assert.ok(positions.some(id=>id[1]==='3'));assert.ok(positions.some(id=>id[1]==='5'));assert.ok(positions.every(id=>['3','5'].includes(id[1])));
    assert.ok(positions.includes('C3-2'),'occupied safe Radio position remains selectable');
    await touch('#board [data-work-cell="C3-2"]');await click('[data-ui=confirm-target]');await flush();
    const working=await getState();assert.deepEqual(member(working,'engineer').position,['C3-2']);assert.equal(member(working,'engineer').station,null);
    assert.deepEqual(working.jobs[0].cells,['C4-2']);assert.equal(working.jobs[0].remainingTime,4);
    await b.reload();assert.deepEqual(await getState(),working);
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    await screenshot(`adjacent-shared-work-${width}`);
  }
  note('320/360/390px: adjacent-row highlights, shared safe work location, unchanged targets/duration and exact work reload');
  assert.deepEqual(b.exceptions,[]);assert.deepEqual(b.badResponses,[]);
  await b.writeResults({browser:b.version.product,checks,widths:[1440,320,360,390],exceptions:b.exceptions,badResponses:b.badResponses});
  console.log(`Crew station browser checks passed (${checks.length} groups).`);
}finally{await b.close();}
