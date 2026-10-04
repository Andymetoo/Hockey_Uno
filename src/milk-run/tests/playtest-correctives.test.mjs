import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { freshSortieSeed } from '../random.mjs';
import { dispatch, resolveFireSpread, resolveAttack, damageSquare, legalWorkPositions } from '../rules.mjs';
import { ResolutionQueue } from '../queue.mjs';
import { saveSession, loadSession } from '../persistence.mjs';
import { missionExportFilename } from '../mission-export.mjs';
import { createCampaignStore, createCampaign, prepareCampaignSortie, finalizeCampaignSortie } from '../campaign.mjs';
import { campaignBackup, parseCampaignBackup } from '../campaign-session.mjs';
import { addStoryCondition } from '../story-effects.mjs';
import { startStoryThread } from '../story.mjs';
import { recorderWindow } from '../recorder.mjs';
import { collect, fighter, rngForDice } from './fixtures.mjs';

const fresh = (config = {}, seed = 'correctives') => createGame({v2MissionEnemy:0,v2MissionResource:0,v2MissionTime:10,...config}, seed, 'v2-continuous');
const crew = (s,id) => s.crew.find(c=>c.id===id);
function reload(s) {
  let value;
  const storage={setItem:(k,v)=>{value=v;},getItem:()=>value};
  const q=new ResolutionQueue({state:s,dispatch});
  assert.ok(saveSession(q.export(),storage));
  return loadSession(storage);
}
function medical(story = true, assistant = false) {
  const s=fresh({v2StoryMode:story});
  crew(s,'copilot').health='injured'; s.phase='action'; s.activeCrew='radio';
  const cells=legalWorkPositions(s,'radio',crew(s,'copilot').position);
  assert.ok(cells.some(c=>c.id==='C2-4'));
  return dispatch(s,{type:'action',action:'medical',targetId:'copilot',workCellId:'C2-4',
    ...(assistant?{assistantId:'ball',assistantWorkCellId:'C2-2'}:{})}).state;
}

test('ordinary V2 sorties receive fresh short seeds; explicit seeds reproduce tactical and Story RNG',()=>{
  const a=createGame({},undefined,'v2-continuous'), b=createGame({},undefined,'v2-continuous');
  assert.match(a.seed,/^MR-[A-Z2-9]{4}-[A-Z2-9]{4}$/); assert.notEqual(a.seed,b.seed);
  assert.equal(new Set(Array.from({length:100},freshSortieSeed)).size,100);
  const x=fresh({},'manual-seed'),y=fresh({},'manual-seed'); y.startedAt=x.startedAt;
  assert.deepEqual(dispatch(x,{type:'activate',crewId:'pilot'}),dispatch(y,{type:'activate',crewId:'pilot'}));
});
test('save and JSON export/import retain authoritative seed, metadata, filename and RNG',()=>{
  const s=fresh({},'MR-Q7TR-8K2W'), q=new ResolutionQueue({state:s,dispatch});
  const exported=JSON.parse(JSON.stringify(q.export()));
  assert.equal(exported.metadata.seed,s.seed);
  assert.ok(missionExportFilename(s).includes(s.seed));
  assert.ok(!missionExportFilename({...s,seed:'a/b:c'}).includes('/'));
  assert.equal(loadSession({getItem:()=>JSON.stringify(exported)}).state.seed,s.seed);
  assert.deepEqual(reload(s).state,s);
});
test('successive Campaign flights retain their distinct seeds in history and backup',()=>{
  let {store,campaign}=createCampaign(createCampaignStore());
  const seeds=[];
  for(let i=0;i<2;i++) {
    const s=createGame({},undefined,'v2-continuous'); seeds.push(s.seed);
    const prepared=prepareCampaignSortie(store,campaign.id,s,{aircraftId:campaign.currentAircraftId});
    prepared.state.outcome='success';prepared.state.phase='ended';prepared.state.endedAt=Date.now();
    prepared.state.mission.position=11;
    store=finalizeCampaignSortie(prepared.store,prepared.state,[]).store;
  }
  assert.notEqual(...seeds);
  assert.deepEqual(store.campaigns[0].sorties.map(s=>s.seed),seeds);
  assert.deepEqual(parseCampaignBackup(JSON.stringify(campaignBackup(store,null))).store.campaigns[0].sorties.map(s=>s.seed),seeds);
});

for(const story of [false,true]) {
  test(`Story ${story}: injured Medical patient dies on spread, job cancels, caregiver returns after fire`,()=>{
    const s=medical(story),e=collect();s.cells['D2-2']='fire';s.rng=rngForDice([6]);
    const positions=[];
    resolveFireSpread(s,event=>{e.emit(event);positions.push({type:event.type,position:[...crew(s,'radio').position]});});
    assert.equal(crew(s,'copilot').health,'dead'); assert.equal(s.cells['D2-1'],'fire');
    assert.equal(s.jobs.length,0);assert.equal(crew(s,'radio').job,null);
    assert.equal(crew(s,'radio').station,'radio');
    assert.ok(positions.find(p=>p.type==='WORK_CANCELLED').position.includes('C2-4'));
    assert.ok(e.events.findIndex(e=>e.type==='CREW_RETURNED')>e.events.findIndex(e=>e.type==='FIRE_STARTED'));
    assert.equal(reload(s).state.crew.find(c=>c.id==='copilot').health,'dead');
    const r=dispatch(s,{type:'activate',crewId:'pilot'});
    assert.equal(crew(r.state,'copilot').health,'dead');assert.ok(!r.events.some(e=>e.type==='CREW_HEALED'));
  });
  test(`Story ${story}: healthy first-fire occupant still blocks spread`,()=>{
    const s=fresh({v2StoryMode:story});s.cells['D2-2']='fire';s.rng=rngForDice([6]);resolveFireSpread(s,()=>{});
    assert.equal(crew(s,'copilot').health,'injured');assert.equal(s.cells['D2-1'],'healthy');
  });
  for(const roll of [2,6]) test(`Story ${story}: direct ${roll===6?'Crit':'hit'} cancels a dead patient's Medical`,()=>{
    const s=medical(story),e=collect();resolveAttack(s,e.emit,{source:'BF-110',roll,cellId:'D2-1'});
    assert.equal(crew(s,'copilot').health,'dead');assert.equal(s.jobs.length,0);assert.equal(crew(s,'radio').job,null);
    assert.equal(crew(s,'radio').station,'radio');
  });
  for(const steps of [1,2]) test(`Story ${story}: caregiver ${steps===1?'injury':'death'} cancels assisted Medical`,()=>{
    const s=medical(story,true);damageSquare(s,'C2-4',steps,()=>{});
    assert.equal(s.jobs.length,0);assert.equal(crew(s,'radio').job,null);assert.equal(crew(s,'ball').job,null);
    assert.equal(crew(s,'copilot').health,'injured');
  });
  test(`Story ${story}: invalid burning patient cannot become healthy on completion`,()=>{
    const s=medical(story);s.cells['D2-1']='fire';s.jobs[0].remainingTime=1;
    const r=dispatch(s,{type:'activate',crewId:'pilot'});
    assert.equal(r.state.jobs.length,0);assert.equal(crew(r.state,'copilot').health,'injured');
    assert.ok(!r.events.some(e=>e.type==='CREW_HEALED'));
    assert.ok(!r.state.crew.some(c=>c.health==='healthy'&&c.position.some(id=>r.state.cells[id]==='fire')));
  });
}
test('a burning Medical work square cancels the job without healing the patient',()=>{
  const s=medical();s.cells['C2-4']='damaged';damageSquare(s,'C2-4',1,()=>{});
  assert.equal(s.cells['C2-4'],'fire');assert.equal(s.jobs.length,0);assert.equal(crew(s,'radio').job,null);
});
test('a blocked caregiver home uses existing displaced return semantics',()=>{
  const s=medical();s.cells['C3-2']='fire';resolveAttack(s,()=>{},{roll:2,cellId:'D2-1'});
  assert.equal(crew(s,'radio').displaced,true);assert.deepEqual(crew(s,'radio').position,['C2-4']);
});
test('Story medical supplies and timing conditions use the same casualty cancellation',()=>{
  let s=fresh();crew(s,'copilot').health='injured';
  startStoryThread(s,'medical_locker');s=dispatch(s,{type:'storyChoice',choiceId:'medical'}).state;
  addStoryCondition(s,{id:'oxygen-test',threadId:'oxygen_line',title:'Oxygen delay',effectText:'Slower Medical',modifiers:{jobTime:{medical:1}}});
  s.phase='action';s.activeCrew='radio';s.resources.Enlisted=0;
  s=dispatch(s,{type:'action',action:'medical',targetId:'copilot',workCellId:'C2-4'}).state;
  assert.equal(s.jobs[0].remainingTime,5);assert.equal(s.resources.Enlisted,0);
  s.cells['D2-2']='fire';s.rng=rngForDice([6]);resolveFireSpread(s,()=>{});
  assert.equal(crew(s,'copilot').health,'dead');assert.equal(s.jobs.length,0);assert.equal(crew(s,'radio').job,null);
});
test('shared work position never shields an injured patient; casualty return waits for all fire groups',()=>{
  let s=fresh();crew(s,'copilot').health='injured';s.phase='action';s.activeCrew='radio';
  s=dispatch(s,{type:'action',action:'medical',targetId:'copilot',workCellId:'D2-1'}).state;
  s.cells['D2-2']='fire';s.rng=rngForDice([6]);resolveFireSpread(s,()=>{});
  assert.equal(crew(s,'copilot').health,'dead');assert.equal(crew(s,'radio').health,'injured');
  // The healthy caregiver still intentionally blocks this first fire spread.
  assert.notEqual(s.cells['D2-1'],'fire');assert.equal(s.jobs.length,0);
});
test('a selectable safe patient cannot make a different burning patient a legal Medical target',()=>{
  const s=fresh();crew(s,'pilot').health='injured';crew(s,'copilot').health='injured';s.cells['D2-1']='fire';
  s.phase='action';s.activeCrew='radio';
  assert.throws(()=>dispatch(s,{type:'action',action:'medical',targetId:'copilot',workCellId:'C2-4'}),/standing on Fire/);
});
test('missing target or assistant invalidates Medical and releases remaining workers',()=>{
  for(const missing of ['copilot','ball']) {
    const s=medical(true,true);s.crew=s.crew.filter(c=>c.id!==missing);
    const r=dispatch(s,{type:'activate',crewId:'pilot'});
    assert.equal(r.state.jobs.length,0);assert.equal(crew(r.state,'radio').job,null);
    assert.ok(!r.events.some(e=>e.type==='CREW_HEALED'));
  }
});

for(const enabled of [false,true]) for(const type of ['BF-109','BF-110','FW-190','Me-262']) {
  test(`Crit experiment ${enabled}: ${type} aircraft and crew severity`,()=>{
    const s=fresh({v2AircraftSpecificCrits:enabled}),e=collect();
    resolveAttack(s,e.emit,{source:type,roll:6,cellId:'D2-1'});
    const one=enabled&&type==='BF-109';
    assert.equal(s.cells['D2-1'],one?'damaged':'fire');assert.equal(crew(s,'copilot').health,one?'injured':'dead');
    assert.equal(reload(s).state.config.v2AircraftSpecificCrits,enabled);
    assert.equal(e.events.find(e=>e.type==='ENEMY_ATTACK_ROLL').damageSteps,enabled?(one?1:2):undefined);
  });
}
function shotState(hp,enabled=true) {
  const s=fresh({v2BadlyDamagedBreakoff:enabled});
  s.fighters=[fighter('test',{hp,maxHp:hp,engagementRemaining:5,badlyDamagedTriggered:false})];
  crew(s,'bombardier').activationCompleted=true;crew(s,'bombardier').used=true;
  s.opportunity=3;s.bags.combat.tokens=['Hit','Hit','Hit'];s.bags.combat.discard=[];
  return s;
}
const shot=s=>dispatch(s,{type:'opportunityShot',gunnerId:'bombardier',targetId:'test'});
for(const hp of [2,3,4]) test(`${hp} HP threshold reduces Engagement exactly once and persists`,()=>{
  let s=shotState(hp), events=[];
  for(let i=0;i<Math.ceil(hp/2);i++){const r=shot(s);s=r.state;events.push(...r.events);}
  assert.equal(s.fighters[0].hp,Math.floor(hp/2));assert.equal(s.fighters[0].engagementRemaining,4);
  assert.equal(s.fighters[0].badlyDamagedTriggered,true);assert.equal(s.fighters[0].disrupted,true);
  assert.equal(events.filter(e=>e.type==='FIGHTER_BADLY_DAMAGED').length,1);
  s=reload(s).state;assert.equal(s.config.v2BadlyDamagedBreakoff,true);
  if(hp===4){const r=shot(s);assert.equal(r.state.fighters[0].engagementRemaining,4);assert.ok(!r.events.some(e=>e.type==='FIGHTER_BADLY_DAMAGED'));}
});
test('badly damaged experiment OFF preserves baseline; Disrupt remains independent',()=>{
  const r=shot(shotState(2,false));assert.equal(r.state.fighters[0].engagementRemaining,5);
  assert.equal(r.state.fighters[0].disrupted,true);assert.ok(!r.events.some(e=>e.type==='FIGHTER_BADLY_DAMAGED'));
});
test('zero Engagement damage uses normal breakoff with no kill, Time or Opportunity reward',()=>{
  const s=shotState(2);s.fighters[0].engagementRemaining=1;const r=shot(s);
  assert.equal(r.state.fighters.length,0);assert.equal(r.state.stats.fightersKilled,0);
  assert.equal(r.state.time,0);assert.equal(r.state.opportunity,s.opportunity-1);
  assert.equal(r.state.stats.opportunityGained,0);
  assert.ok(r.events.some(e=>e.type==='FIGHTER_BREAKING_OFF'));assert.ok(r.events.some(e=>e.type==='FIGHTER_DISENGAGED'));
  assert.ok(!r.events.some(e=>e.type==='FIGHTER_DESTROYED'||e.type==='FIGHTER_KILL_TIME_TAKEN'));
});
test('a Burst taking a 4-HP Me-262 to 2 HP triggers once, but lethal damage stays a kill',()=>{
  const s=shotState(4);s.fighters[0].type='Me-262';s.bags.combat.tokens=['Burst'];
  const r=shot(s);assert.equal(r.state.fighters[0].hp,2);assert.equal(r.state.fighters[0].engagementRemaining,4);
  const killed=shot(r.state);assert.equal(killed.state.stats.fightersKilled,1);
  assert.ok(!killed.events.some(e=>e.type==='FIGHTER_BADLY_DAMAGED'));
});
test('old saves already below threshold do not trigger retroactively; explicitly unprocessed ones can',()=>{
  for(const explicit of [false,true]) {
    const s=shotState(6);s.fighters[0].hp=3;if(!explicit)delete s.fighters[0].badlyDamagedTriggered;
    const restored=reload(s).state,r=shot(restored);
    assert.equal(r.state.fighters[0].engagementRemaining,explicit?4:5);
  }
});
test('both experiments and the once-only trigger survive exact pending-presentation export/import',()=>{
  const s=shotState(2);s.config.v2AircraftSpecificCrits=true;
  const q=new ResolutionQueue({state:s,dispatch});q.paused=true;
  q.send({type:'opportunityShot',gunnerId:'bombardier',targetId:'test'});
  assert.ok(q.pending.length);assert.equal(q.state.fighters[0].badlyDamagedTriggered,true);
  const exported=JSON.parse(JSON.stringify(q.export()));
  assert.deepEqual(loadSession({getItem:()=>JSON.stringify(exported)}),exported);
  q.dispose();
});
test('Story temporary combat token still triggers damage pressure without altering ownership',()=>{
  const s=shotState(2);
  s.bags.combat.tokens=[];
  addStoryCondition(s,{id:'checked-ammo',title:'Checked ammo',effectText:'A Hit token',threadId:'ammo_locker',tokens:[{bag:'combat',token:'Hit',count:1}]});
  const token=s.bags.combat.tokens[0];assert.ok(token.startsWith('Story:'));
  s.config.v2DisruptEnabled=false;
  const r=shot(s);assert.equal(r.state.fighters[0].engagementRemaining,4);assert.ok(!r.state.fighters[0].disrupted);
  assert.ok(r.state.bags.combat.discard.includes(token));
});
test('recorder pages retain every event exactly once and older pages stay fixed as history grows',()=>{
  const log=Array.from({length:12017},(_,i)=>({sequence:i+1}));
  const seen=[];let end=null;
  do {const page=recorderWindow(log,end);assert.ok(page.events.length<=100);seen.unshift(...page.events);end=page.from;}while(end);
  assert.deepEqual(seen,log);
  const page=recorderWindow(log,1000);log.push({sequence:12018});assert.deepEqual(recorderWindow(log,1000).events,page.events);
});
