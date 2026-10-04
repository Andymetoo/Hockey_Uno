import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { STATIONS, getCell } from '../board.mjs';
import { dispatch, damageSquare, resolveAttack, resolveFireSpread, medicalEligibility, availableActions, isAtStation, homeActionStatus, resolveAltitude } from '../rules.mjs';
import { assertFireOccupancy, healthProvenance, missionTurn } from '../crew-health.mjs';
import { specialistStatus, currentStationId } from '../crew-position.mjs';
import { beginBombRun, bombRunTargetWarning } from '../bombing.mjs';
import { crewMarkerLayout, boardMarkup } from '../board-view.mjs';
import { conditionLifecycle, storyChoiceMarkup } from '../story-view.mjs';
import { startStoryThread, evaluateStoryBoundary } from '../story.mjs';
import { STORY_THREADS } from '../story-content.mjs';
import { deriveCellHistory } from '../diagnostics.mjs';
import { rngForDice, collect } from './fixtures.mjs';
import { loadSession } from '../persistence.mjs';

const fresh = (extra={}) => createGame({v2StoryMode:false, opportunityEnabled:false, v2MissionEnemy:0, v2MissionResource:0, v2MissionTime:10, ...extra}, 'MR-ZE7B-S2E6', 'v2-continuous');
const crew = (s,id) => s.crew.find(c=>c.id===id);
function action(s,id,action,extra={}) { s=structuredClone(s);s.phase='action';s.activeCrew=id;crew(s,id).used=true;crew(s,id).cycleSlotConsumed=true;return dispatch(s,{type:'action',action,...extra}); }
const seat = (s,id,station) => { for(const c of s.crew)if(c.id!==id&&c.station===station){c.station=null;c.displaced=true;}Object.assign(crew(s,id),{station,position:[...STATIONS[station].cells],displaced:false}); };
const session = s => ({version:1,state:s,view:s,pending:[],log:[],current:null,speed:'instant'});

for(const source of ['Enemy','Flak','Story damage']) for(const health of ['healthy','injured']) test(`${source}: damaged occupied square resolves ${health} before ignition`,()=>{
  const s=fresh(),e=collect();s.cells['D2-1']='damaged';crew(s,'copilot').health=health;
  if(source==='Story damage')damageSquare(s,'D2-1',1,e.emit,{source});else resolveAttack(s,e.emit,{source,roll:2,cellId:'D2-1'});
  assert.equal(crew(s,'copilot').health,health==='healthy'?'injured':'dead');
  assert.equal(s.cells['D2-1'],health==='healthy'?'damaged':'fire');
  assert.ok(e.events.some(e=>e.type===(health==='healthy'?'FIRE_STOPPED_BY_CREW':'FIRE_STARTED')));assertFireOccupancy(s);
});
test('Crit applies consecutive crew/structure steps with no living occupant at FIRE_STARTED',()=>{
  const s=fresh(),snapshots=[];resolveAttack(s,e=>snapshots.push({...e,state:structuredClone(s)}),{roll:6,cellId:'D2-1'});
  assert.equal(crew(s,'copilot').health,'dead');assert.equal(s.cells['D2-1'],'fire');
  assert.ok(snapshots.findIndex(e=>e.type==='CREW_INJURED')<snapshots.findIndex(e=>e.type==='CREW_KILLED'));
  snapshots.forEach(e=>assertFireOccupancy(e.state));
});
test('all living physical occupants take damage, even displaced original behind substitute',()=>{
  const s=fresh();crew(s,'pilot').health='injured';seat(s,'navigator','pilot');s.cells['C2-2']='damaged';
  damageSquare(s,'C2-2',1,()=>{});assert.equal(crew(s,'pilot').health,'dead');assert.equal(crew(s,'navigator').health,'injured');assert.equal(s.cells['C2-2'],'damaged');assertFireOccupancy(s);
});
test('Spread blocks first occupation even with obsolete toggle OFF; straddling crew hit once',()=>{
  const s=fresh();s.config.crewBlocksFirstFire=false;s.cells['C2-3']='fire';s.rng=rngForDice([4]);resolveFireSpread(s,()=>{});
  assert.equal(crew(s,'engineer').health,'injured');assert.notEqual(s.cells['C2-4'],'fire');assertFireOccupancy(s);
});
test('structural-only damage cannot bypass the ignition gate',()=>{
  const s=fresh();s.cells['D2-1']='damaged';damageSquare(s,'D2-1',1,()=>{},{injureCrew:false});
  assert.equal(crew(s,'copilot').health,'injured');assert.equal(s.cells['D2-1'],'damaged');assertFireOccupancy(s);
});
test('stable boundary asserts illegal input without silently deleting or moving crew',()=>{
  const s=fresh();s.cells['D2-1']='fire';const before=structuredClone(s);assert.throws(()=>dispatch(s,{type:'activate',crewId:'pilot'}),/Fire\/crew invariant/);assert.deepEqual(s,before);
});

function treatment() {let s=fresh();crew(s,'copilot').health='injured';return action(s,'radio','medical',{targetId:'copilot',workCellId:'C2-4'}).state;}
test('Crit patient death cancels Medical before return, never heals later',()=>{
  const s=treatment(),e=collect();damageSquare(s,'D2-1',2,e.emit);assert.equal(s.jobs.length,0);assert.equal(crew(s,'radio').job,null);
  assert.ok(e.events.findIndex(e=>e.type==='CREW_RETURNED')>e.events.findIndex(e=>e.type==='FIRE_STARTED'));
  const r=dispatch(s,{type:'activate',crewId:'pilot'});assert.ok(!r.events.some(e=>e.type==='CREW_HEALED'));assertFireOccupancy(r.state);
});
test('caregiver injury stops Medical and releases all worker pointers',()=>{
  const s=treatment();s.cells['C2-4']='damaged';damageSquare(s,'C2-4',1,()=>{});assert.equal(s.jobs.length,0);assert.equal(crew(s,'radio').job,null);assert.equal(crew(s,'radio').health,'injured');assert.equal(crew(s,'copilot').health,'injured');assertFireOccupancy(s);
});
test('Medical completion leaves no stale lockout when the next patient needs treatment',()=>{
  let s=treatment();s.jobs[0].remainingTime=1;s=dispatch(s,{type:'activate',crewId:'pilot'}).state;
  assert.equal(crew(s,'copilot').health,'healthy');assert.equal(s.jobs.length,0);assert.equal(crew(s,'radio').job,null);
  crew(s,'navigator').health='injured';assert.equal(medicalEligibility(s,'radio','navigator').enabled,true);
  s=action(s,'radio','medical',{targetId:'navigator'}).state;assert.equal(s.jobs[0].targetId,'navigator');
});
for(const kind of ['none','treated','resource','fire','caregiver','dead','work'])test(`Medical reason: ${kind}`,()=>{
  const s=fresh();crew(s,'copilot').health='injured';let expected;
  if(kind==='none'){crew(s,'copilot').health='healthy';expected=/No injured/;}
  if(kind==='treated'){s.jobs.push({kind:'medical',targetId:'copilot'});expected=/already being treated/;}
  if(kind==='resource'){s.resources.Enlisted=0;expected=/Enlisted resource/;}
  if(kind==='fire'){s.cells['D2-1']='fire';expected=/contains Fire/;}
  if(kind==='caregiver'){crew(s,'radio').job='busy';expected=/Caregiver is unavailable/;}
  if(kind==='dead'){crew(s,'copilot').health='dead';expected=/no longer alive/;}
  if(kind==='work'){crew(s,'copilot').job='stale';expected=/another active job/;}
  assert.match(medicalEligibility(s,'radio',kind==='none'?undefined:'copilot').reason,expected);
});

for(const home of ['pilot','copilot','navigator','bombardier','engineer','radio','ball','leftWaist','rightWaist','tail'])test(`${home}: healed original reclaims atomically and substitute returns home`,()=>{
  let s=fresh();const substitute=home==='navigator'?'copilot':'navigator';crew(s,home).health='injured';s=action(s,substitute,'manStation',{stationId:home}).state;
  assert.deepEqual(crew(s,home).position,STATIONS[home].cells);crew(s,home).health='healthy';
  const used=crew(s,substitute).cycleSlotConsumed;const r=action(s,home,'reclaimHome');
  assert.equal(currentStationId(crew(r.state,home)),home);assert.equal(currentStationId(crew(r.state,substitute)),substitute);assert.equal(crew(r.state,substitute).cycleSlotConsumed,used);
  for(const e of r.events)if(e.type==='STATION_RECLAIMED'){assert.ok(isAtStation(e.state,crew(e.state,home)));assert.ok(isAtStation(e.state,crew(e.state,substitute)));}
});
for(const used of [true,false])test(`reclaim: blocked substitute home displaces safely without cascading; slot ${used}`,()=>{
  const s=fresh();seat(s,'navigator','pilot');crew(s,'navigator').used=used;crew(s,'navigator').cycleSlotConsumed=used;seat(s,'engineer','navigator');
  const r=action(s,'pilot','reclaimHome');assert.equal(crew(r.state,'engineer').station,'navigator');assert.equal(crew(r.state,'navigator').station,null);assert.equal(crew(r.state,'navigator').displaced,true);assert.equal(crew(r.state,'navigator').used,used);assert.equal(crew(r.state,'navigator').cycleSlotConsumed,used);assertFireOccupancy(r.state);
});
test('station chain untangles with independent reclaims and preserves cockpit Control',()=>{
  let s=fresh();seat(s,'pilot','copilot');seat(s,'copilot','engineer');seat(s,'navigator','pilot');seat(s,'engineer','navigator');
  for(const id of ['pilot','engineer','navigator']) {s=action(s,id,homeActionStatus(s,id).reclaimReason?'returnHome':'reclaimHome').state;const e=collect();resolveAltitude(s,e.emit);assert.equal(e.events.find(e=>e.type==='ALTITUDE_CHECK'&&e.cause==='control').minimum,0);}
  for(const id of ['pilot','copilot','navigator','engineer'])assert.equal(crew(s,id).station,id);
});
test('Engineer leaves top turret for Bombardier, then returns when safe',()=>{
  const s=fresh();crew(s,'bombardier').health='injured';const moved=action(s,'engineer','manStation',{stationId:'bombardier'}).state;
  assert.equal(homeActionStatus(moved,'engineer').returnReason,'');const returned=action(moved,'engineer','returnHome').state;assert.equal(crew(returned,'engineer').station,'engineer');
});
test('Return Home describes substitute, Fire and physical work blocker separately',()=>{
  const s=fresh();seat(s,'navigator','pilot');assert.match(homeActionStatus(s,'pilot').returnReason,/Reclaim/);
  s.cells['C2-2']='fire';assert.match(homeActionStatus(s,'pilot').reclaimReason,/Fire/);s.cells['C2-2']='healthy';
  Object.assign(crew(s,'engineer'),{job:'busy',position:['C2-2'],station:null});assert.match(homeActionStatus(s,'pilot').reclaimReason,/finish work/);
});
test('physical casualty chips paint above primary operator and retain health',()=>{
  const s=fresh();crew(s,'pilot').health='injured';seat(s,'navigator','pilot');const layout=crewMarkerLayout(s),a=layout.find(c=>c.id==='pilot'),b=layout.find(c=>c.id==='navigator');assert.ok(a.radius<b.radius);assert.notDeepEqual([a.x,a.y],[b.x,b.y]);
  const markup=boardMarkup(s);assert.ok(markup.indexOf('data-crew-id="navigator"')<markup.indexOf('data-crew-id="pilot"'));assert.match(markup,/Pilot, Injured/);
});
test('nose home geometry, labels and damage exposure agree',()=>{
  const s=fresh();assert.deepEqual(STATIONS.navigator.cells,['C1-4']);assert.deepEqual(STATIONS.bombardier.cells,['D1-3']);assert.equal(getCell('C1-4').section,'NosePort');
  damageSquare(s,'C1-4',1,()=>{});assert.equal(crew(s,'navigator').health,'injured');assert.equal(crew(s,'bombardier').health,'healthy');
});
test('legacy nose geometry preserves bodies, home identity and RNG, with displaced old seats',()=>{
  const s=fresh();s.boardVersion='plane-grid-v1';s.crewPositionVersion=1;crew(s,'navigator').position=['D1-3'];crew(s,'bombardier').position=['C1-4'];delete crew(s,'navigator').healthSince;
  const loaded=loadSession({getItem:()=>JSON.stringify(session(s))}).state;assert.equal(loaded.rng,s.rng);assert.deepEqual(crew(loaded,'navigator').position,['D1-3']);assert.equal(crew(loaded,'navigator').homeStation,'navigator');assert.equal(crew(loaded,'navigator').displaced,true);assert.match(healthProvenance(loaded,crew(loaded,'navigator')),/unavailable/);
});
for(const id of ['engineer','pilot','bombardier'])test(`bombsight ${id} uses authoritative qualification and exact target reason`,()=>{
  const s=fresh();seat(s,id,'bombardier');s.mission.position=7;const status=specialistStatus(s,'bombardier');assert.equal(status.kind,id==='engineer'?'unqualified':id==='pilot'?'officer':'actual');
  if(id==='engineer')assert.match(bombRunTargetWarning(s),/UNQUALIFIED.*Engineer.*Enlisted.*before TARGET/);else assert.equal(bombRunTargetWarning(s),'');
  s.phase='bombing';const e=collect();beginBombRun(s,e.emit);assert.equal(s.mission.bombRun.status,id==='engineer'?'no-drop':'placing');if(id==='engineer')assert.match(e.events[0].message,/NO DROP.*Engineer.*Enlisted/);
});
test('new injury/heal provenance has mission turn, source and turns ago; history reuses event cell',()=>{
  let s=fresh();s.stats.turns=38;const e=collect();damageSquare(s,'D2-1',1,e.emit,{source:'Flak'});s.stats.turns=44;
  assert.match(healthProvenance(s,crew(s,'copilot')),/Turn 38.*6 turns ago.*Flak.*D2-1/);assert.ok(deriveCellHistory(e.events,'D2-1').entries.some(e=>e.type==='CREW_INJURED'));
  s=action(s,'radio','medical',{targetId:'copilot'}).state;s.jobs[0].remainingTime=1;s=dispatch(s,{type:'activate',crewId:'pilot'}).state;assert.match(healthProvenance(s,crew(s,'copilot')),/Medical completed/);
});
test('Story preview is pure; Continue is explicitly disabled without selection',()=>{
  const s=fresh({v2StoryMode:true});startStoryThread(s,'weather_front');const before=structuredClone(s);assert.match(storyChoiceMarkup(s.story.pending),/data-ui="story-continue" disabled/);assert.match(storyChoiceMarkup(s.story.pending,'enter'),/aria-pressed="true"/);assert.deepEqual(s,before);
});
test('Heavy Cloud scheduled branch is deterministic and lifecycle changes from next checkpoint to TARGET',()=>{
  let selected;
  for(let n=0;n<50&&!selected;n++){const s=createGame({v2StoryMode:true},`cloud-pass-${n}`,'v2-continuous');startStoryThread(s,'weather_front');const r=dispatch(s,{type:'storyChoice',choiceId:'enter'}).state;if(r.story.threads.weather_front.due.stage==='deeper')selected=r;}
  assert.ok(selected);assert.match(conditionLifecycle(selected,selected.story.conditions[0]),/Next update: after the next Progress/);
  const loaded=loadSession({getItem:()=>JSON.stringify(session(selected))}).state;assert.deepEqual(loaded,selected);const rng=loaded.story.rng;evaluateStoryBoundary(loaded);
  assert.equal(loaded.story.rng,rng);assert.match(conditionLifecycle(loaded,loaded.story.conditions[0]),/through TARGET/);
});
test('condition lifecycle covers usage, repair, altitude and multi-checkpoint expiry',()=>{
  const s=fresh({v2StoryMode:true});assert.match(conditionLifecycle(s,{dueBoundary:2}),/2 Progress/);assert.match(conditionLifecycle(s,{repairCell:'C3-2'}),/C3-2 is repaired/);assert.match(conditionLifecycle(s,{modifiers:{nextFree:'medical'}}),/when used/);assert.match(conditionLifecycle(s,{altitudeAtMost:3}),/Altitude 3/);
});

test('health turn counts unavailable slots even when their mission draws are disabled',()=>{
  const s=fresh({unavailableDraws:false});s.stats.turns=37;s.stats.missionDraws=20;s.crewCycle={number:4,turn:7};s.slot=8;
  damageSquare(s,'D2-1',1,()=>{});assert.equal(crew(s,'copilot').healthSince.turn,38);
  s.stats.turns=44;s.crewCycle={number:5,turn:4};s.slot=4;assert.equal(missionTurn(s),44);assert.match(healthProvenance(s,crew(s,'copilot')),/6 turns ago/);
});
test('reclaim refuses burning home and unavailable substitute transactionally',()=>{
  let s=fresh();seat(s,'navigator','pilot');s.cells['C2-2']='fire';assert.throws(()=>action(s,'pilot','reclaimHome'),/Fire/);
  s.cells['C2-2']='healthy';crew(s,'navigator').health='injured';assert.throws(()=>action(s,'pilot','reclaimHome'),/casualty/);
  s=action(s,'pilot','returnHome').state;assert.equal(crew(s,'pilot').station,'pilot');assert.equal(crew(s,'navigator').station,null);
});
test('a burning substitute home forces a safe fallback and preserves every other operator',()=>{
  const s=fresh();seat(s,'navigator','pilot');s.cells['C1-4']='fire';const r=action(s,'pilot','reclaimHome');assert.equal(crew(r.state,'navigator').displaced,true);assertFireOccupancy(r.state);assert.equal(crew(r.state,'bombardier').station,'bombardier');
});
test('dead original remains visible while a healthy substitute operates its station',()=>{
  let s=fresh();crew(s,'engineer').health='dead';s=action(s,'navigator','manStation',{stationId:'engineer'}).state;assert.equal(isAtStation(s,crew(s,'navigator')),true);assert.deepEqual(crew(s,'engineer').position,STATIONS.engineer.cells);assert.match(boardMarkup(s),/Engineer, Dead/);
});

test('Story damage effect dispatches through the same occupied ignition service',()=>{
  const choice=STORY_THREADS.find(t=>t.id==='weather_front').stages.front.choices[0];
  const effects=choice.effects;
  try {
    choice.effects=[{type:'damage',cellId:'D2-1',steps:1}];
    const s=fresh({v2StoryMode:true});s.cells['D2-1']='damaged';startStoryThread(s,'weather_front');
    const r=dispatch(s,{type:'storyChoice',choiceId:'enter'});assert.equal(crew(r.state,'copilot').health,'injured');assert.equal(r.state.cells['D2-1'],'damaged');assert.equal(crew(r.state,'copilot').healthSince.source,'Story damage');assertFireOccupancy(r.state);
  } finally {choice.effects=effects;}
});
test('an invalid Medical target cannot bypass eligibility when another target is legal',()=>{
  const s=fresh();crew(s,'copilot').health='injured';crew(s,'navigator').health='injured';crew(s,'copilot').job='invalid';
  assert.ok(availableActions(s,'radio').find(a=>a.id==='medical').enabled);assert.throws(()=>action(s,'radio','medical',{targetId:'copilot'}),/another active job/);
});
