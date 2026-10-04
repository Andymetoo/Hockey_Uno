import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, STATIONS, getCell } from '../board.mjs';
import { dispatch, damageSquare, resolveAttack, resolveFireSpread, resolveAltitude, homeActionStatus, automaticHomeReturnStatus, reclaimReliefPlan, isAtStation, availableActions, directFireGunners, legalWorkPositions } from '../rules.mjs';
import { homeStationId, currentStationId, crewStateProblems, assertCrewTransition, specialistStatus, effectiveTimeThreshold } from '../crew-position.mjs';
import { assertFireOccupancy } from '../crew-health.mjs';
import { beginBombRun, bombRunTargetWarning } from '../bombing.mjs';
import { crewMarkerLayout } from '../board-view.mjs';
import { loadSession, saveSession } from '../persistence.mjs';
import { ResolutionQueue } from '../queue.mjs';
import { addStoryCondition } from '../story-effects.mjs';
import { deriveCellHistory } from '../diagnostics.mjs';
import { createCampaign, createCampaignStore, prepareCampaignSortie } from '../campaign.mjs';
import { collect, rngForDice, rngForIndexes, fighter } from './fixtures.mjs';
import { fresh, member as c, prepared, action, replacement, stacked, session } from './station-audit-fixtures.mjs';
const stable=s=>{assertFireOccupancy(s);assert.deepEqual(crewStateProblems(s),[]);assert.equal(s.crew.length,10);};
const flags=crew=>Object.fromEntries(['used','cycleSlotConsumed','activationCompleted','lastAction','job','health','homeStation'].map(k=>[k,crew[k]]));
const resume=s=>{let raw;const storage={getItem:()=>raw,setItem:(k,v)=>raw=v};saveSession(s,storage);return loadSession(storage);};

for(const mode of ['v1','v2-continuous'])for(const blocked of ['free','occupied','fire','injured','dead'])test(`${mode}: Pilot relief with Navigator home ${blocked}`,()=>{
  const s=replacement('pilot','navigator',blocked,mode),before=structuredClone(s),navFlags=flags(c(s,'navigator')),plan=reclaimReliefPlan(s,'pilot');assert.deepEqual(s,before);
  const r=action(s,'pilot','reclaimHome'),after=r.state,returns=['free','dead'].includes(blocked);
  assert.equal(c(after,'pilot').station,'pilot');assert.equal(c(after,'navigator').station,returns?'navigator':null);assert.equal(c(after,'navigator').displaced,!returns);
  assert.deepEqual(c(after,'navigator').position,STATIONS[returns?'navigator':'pilot'].cells);assert.deepEqual(flags(c(after,'navigator')),navFlags);
  assert.deepEqual(c(after,'engineer'),c(s,'engineer'));assert.deepEqual(after.resources,s.resources);assert.equal(after.rng,s.rng);assert.equal(after.stats.missionDraws,s.stats.missionDraws);
  assert.equal(plan.relief,returns?'returned':'stayed');stable(after);
  const event=r.events.find(e=>e.type==='STATION_RECLAIMED');assert.equal(isAtStation(event.state,c(event.state,'pilot')),true);assert.equal(event.relief,plan.relief);
});
for(const [home,sub] of [['engineer','copilot'],['radio','copilot'],['ball','navigator'],['pilot','copilot'],['copilot','pilot']])for(const blocked of ['free','fire'])test(`${home}: relief of ${sub}, ${blocked} home retains exact footprint`,()=>{
  const s=replacement(home,sub,blocked);const r=action(s,home,'reclaimHome');assert.deepEqual(c(r.state,sub).position,STATIONS[blocked==='free'?sub:home].cells);stable(r.state);
  if(blocked==='fire'){const layout=crewMarkerLayout(r.state);assert.equal(layout.find(p=>p.id===home).fixed,true);assert.equal(layout.find(p=>p.id===sub).fixed,false);assert.equal(layout.find(p=>p.id===sub).footprint,[...STATIONS[home].cells].sort().join(' '));}
});
for(const health of ['injured','dead'])for(const blocked of ['free','occupied','fire'])test(`${health} substitute with ${blocked} home: Return replaces, body stays`,()=>{
  const s=replacement('pilot','navigator',blocked);c(s,'navigator').health=health;
  assert.equal(isAtStation(s,c(s,'navigator')),false);assert.match(homeActionStatus(s,'pilot').reclaimReason,/casualty/);assert.equal(homeActionStatus(s,'pilot').returnReason,'');
  assert.throws(()=>action(s,'pilot','reclaimHome'),/casualty/);const before=flags(c(s,'navigator')),r=action(s,'pilot','returnHome');
  assert.equal(c(r.state,'navigator').station,null);assert.deepEqual(c(r.state,'navigator').position,STATIONS.pilot.cells);assert.deepEqual(flags(c(r.state,'navigator')),before);stable(r.state);
});
for(const used of [false,true])test(`relief preserves substitute activation flags: used=${used}`,()=>{
  const s=replacement();Object.assign(c(s,'navigator'),{used,cycleSlotConsumed:used,activationCompleted:used,lastAction:used?'wait':null});const before=flags(c(s,'navigator'));assert.deepEqual(flags(c(action(s,'pilot','reclaimHome').state,'navigator')),before);
});
for(const home of ['pilot','engineer'])for(const cellId of STATIONS[home].cells)for(const source of ['Enemy','Flak','Story damage'])for(const steps of [1,2])test(`${source} ${steps}-step hit to ${home} ${cellId}: every physical occupant, structure once`,()=>{
  const sub=home==='pilot'?'navigator':'copilot',s=stacked(home,sub,'fire'),e=collect();
  if(source==='Story damage')damageSquare(s,cellId,steps,e.emit,{source});else resolveAttack(s,e.emit,{source,roll:steps===1?2:6,cellId});
  assert.equal(c(s,home).health,steps===1?'injured':'dead');assert.equal(c(s,sub).health,steps===1?'injured':'dead');assert.equal(s.cells[cellId],steps===1?'damaged':'fire');
  assert.equal(e.events.filter(e=>e.type==='AIRCRAFT_SQUARE_DAMAGED').length,1);assert.equal(e.events.filter(e=>e.type==='CREW_INJURED').length,2);assert.equal(s.stats.aircraftHits,1);stable(s);
  for(const other of STATIONS[home].cells.filter(id=>id!==cellId))assert.equal(s.cells[other],'healthy');
});
for(const injured of ['pilot','navigator'])test(`stacked ${injured} dies while the other survives; no survivor teleport or Fire`,()=>{
  const s=stacked();c(s,injured).health='injured';const before=s.crew.map(c=>c.position);damageSquare(s,STATIONS.pilot.cells[0],1,()=>{});assert.equal(c(s,injured).health,'dead');assert.equal(c(s,injured==='pilot'?'navigator':'pilot').health,'injured');assert.deepEqual(s.crew.map(c=>c.position),before);assert.equal(s.cells[STATIONS.pilot.cells[0]],'damaged');stable(s);
});
for(const home of ['pilot','engineer'])test(`Fire Spread into ${home} hits both occupants once and cannot ignite under a survivor`,()=>{
  const sub=home==='pilot'?'navigator':'copilot',s=stacked(home,sub,'occupied');
  const target=getCell(STATIONS[home].cells[0]),source=BOARD.find(b=>b.structure&&Math.abs(b.x-target.x)+Math.abs(b.y-target.y)===1&&!s.crew.some(c=>c.health!=='dead'&&c.position.includes(b.id)));
  assert.ok(source);s.cells[source.id]='fire';const dx=target.x-source.x,dy=target.y-source.y,roll=dx===1?4:dx===-1?6:dy===1?5:3;s.rng=rngForDice([roll]);const e=collect();resolveFireSpread(s,e.emit);
  assert.equal(c(s,home).health,'injured');assert.equal(c(s,sub).health,'injured');assert.equal(e.events.filter(e=>e.type==='CREW_INJURED'&&[home,sub].includes(e.crewId)).length,2);assert.notEqual(s.cells[target.id],'fire');stable(s);
});
test('straddling automatic destination rejects one burning cell, accepts damage/Story marks/remote repair',()=>{
  let s=replacement('bombardier','engineer');s.cells[STATIONS.engineer.cells[1]]='fire';assert.equal(reclaimReliefPlan(s,'bombardier').relief,'stayed');
  s.cells[STATIONS.engineer.cells[1]]='damaged';s.config.v2StoryMode=true;addStoryCondition(s,{id:'audit-mark',title:'Damaged turret',effectText:'Repair the marked cell.',repairCell:STATIONS.engineer.cells[1]});
  const workCellId=legalWorkPositions(s,'radio',[STATIONS.engineer.cells[1]]).find(cell=>!STATIONS.engineer.cells.includes(cell.id)).id;
  s=action(s,'radio','repair',{cells:[STATIONS.engineer.cells[1]],workCellId}).state;
  assert.equal(reclaimReliefPlan(s,'bombardier').relief,'returned');const jobs=structuredClone(s.jobs);const r=action(s,'bombardier','reclaimHome');assert.deepEqual(r.state.jobs,jobs);stable(r.state);
});
for(const sub of ['engineer','copilot'])test(`Bombardier reclaims from ${sub} immediately before TARGET; current identity supplies bombsight`,()=>{
  const s=replacement('bombardier',sub,'occupied');s.config.v2OutboundLength=1;s.pendingProgress=true;s.time=4;s.timeTokens=Array(4).fill('Time');
  assert.equal(specialistStatus(s,'bombardier').kind,sub==='engineer'?'unqualified':'officer');const r=action(s,'bombardier','reclaimHome');assert.equal(r.state.phase,'bombing');assert.equal(r.state.mission.bombRun.operatorId,'bombardier');assert.equal(r.state.mission.bombRun.freeRerollAvailable,true);assert.equal(r.state.mission.bombingResult,null);stable(r.state);
});
test('Navigator reclaim immediately updates penalty; Officer and Enlisted qualifications derive from operator',()=>{
  for(const sub of ['engineer','copilot']){const s=replacement('navigator',sub,'fire');s.config.v2NavigatorUnmannedTimePenalty=1;assert.equal(effectiveTimeThreshold(s),sub==='engineer'?5:4);const r=action(s,'navigator','reclaimHome');assert.equal(specialistStatus(r.state,'navigator').kind,'actual');assert.equal(effectiveTimeThreshold(r.state),4);stable(r.state);}
});
test('both cockpit seats substituted: atomic Reclaim keeps post-action Control at checkpoint',()=>{
  let s=replacement();c(s,'copilot').health='injured';s=action(s,'radio','manStation',{stationId:'copilot'}).state;s.pendingProgress=true;s.time=4;s.timeTokens=Array(4).fill('Time');const r=action(s,'pilot','reclaimHome');const control=r.events.find(e=>e.type==='ALTITUDE_CHECK'&&e.cause==='control');assert.equal(control.minimum,0);assert.equal(c(r.state,'radio').station,'copilot');stable(r.state);
});
for(const kind of ['repair','medical','fireControl'])test(`${kind}: substituting worker relinquishes station, cannot move during work, returns conservatively`,()=>{
  let s=replacement('bombardier','engineer');if(kind==='medical')c(s,'tail').health='injured';else s.cells['A3-1']=kind==='repair'?'damaged':'fire';
  const targets=kind==='medical'?c(s,'tail').position:['A3-1'],position=legalWorkPositions(s,'engineer',targets)[0].id;
  s=action(s,'engineer',kind,kind==='medical'?{targetId:'tail',workCellId:position}:{cells:targets,workCellId:position}).state;assert.equal(currentStationId(c(s,'engineer')),null);const before=structuredClone(s);assert.throws(()=>action(s,'engineer','reclaimHome'),/cannot act/);assert.deepEqual(s,before);
  s=action(s,'navigator','manStation',{stationId:'engineer'}).state;s.jobs[0].remainingTime=1;s.bags.mission.tokens=['Time'];s=dispatch(s,{type:'activate',crewId:'pilot'}).state;
  assert.equal(c(s,'engineer').job,null);assert.equal(c(s,'engineer').displaced,true);assert.deepEqual(c(s,'engineer').position,[position]);assert.equal(c(s,'navigator').station,'engineer');stable(s);
});
test('three occupants remain present; third working occupant blocks Reclaim without cancelling its job',()=>{
  let s=replacement();s.cells['B2-4']='damaged';s=action(s,'radio','repair',{cells:['B2-4'],workCellId:STATIONS.pilot.cells[0]}).state;assert.equal(s.crew.filter(c=>c.position.includes(STATIONS.pilot.cells[0])).length,3);
  const before=structuredClone(s);assert.match(homeActionStatus(s,'pilot').reclaimReason,/Radio.*finish work/);assert.throws(()=>action(s,'pilot','reclaimHome'),/Radio/);assert.deepEqual(s,before);assert.equal(crewMarkerLayout(s).length,10);stable(s);
});
test('cycle refresh preserves displaced stacked footprints; no extra draw on Reclaim',()=>{
  const s=replacement('pilot','navigator','occupied');for(const crew of s.crew){crew.used=true;crew.cycleSlotConsumed=true;crew.activationCompleted=true;}s.crewCycle.turn=9;s.slot=10;const draws=s.stats.missionDraws;
  const r=action(s,'pilot','reclaimHome');assert.equal(r.state.crewCycle.number,2);assert.equal(r.state.stats.missionDraws,draws);assert.deepEqual(c(r.state,'navigator').position,STATIONS.pilot.cells);assert.equal(c(r.state,'navigator').cycleSlotConsumed,false);assert.equal(c(r.state,'navigator').displaced,true);stable(r.state);
});
test('HOME can be reached with stacked survivors without reassigning Campaign identities',()=>{
  const created=createCampaign(createCampaignStore()),flight=prepareCampaignSortie(created.store,created.campaign.id,fresh(),{aircraftId:created.campaign.currentAircraftId});
  let s=flight.state;c(s,'pilot').health='injured';s=action(s,'navigator','manStation',{stationId:'pilot'}).state;c(s,'pilot').health='healthy';s=action(s,'engineer','manStation',{stationId:'navigator'}).state;s=action(s,'pilot','reclaimHome').state;
  const ids=structuredClone(s.campaign.crewIds),positions=s.crew.map(c=>[c.id,c.position]);s.mission.bombed=true;s.mission.bombingResult='hit';s.mission.position=s.config.v2OutboundLength+s.config.v2ReturnLength-1;s.time=4;s.timeTokens=Array(4).fill('Time');s.pendingProgress=true;
  const r=dispatch(s,{type:'continueProgress'});assert.equal(r.state.outcome,'success');assert.deepEqual(r.state.campaign.crewIds,ids);assert.deepEqual(r.state.crew.map(c=>[c.id,c.position]),positions);stable(r.state);
});
for(const kind of ['substitution','ready','stacked','straddling','injured','job'])test(`save/export/import roundtrip preserves ${kind} and queued Reclaim snapshots`,()=>{
  let s=kind==='straddling'?stacked('engineer','copilot','fire'):['substitution','ready'].includes(kind)?replacement():stacked();if(kind==='ready')s=prepared(s,'pilot');if(kind==='injured')c(s,'navigator').health='injured';if(kind==='job'){s.cells['A3-1']='damaged';s=action(s,'radio','repair',{cells:['A3-1']}).state;}
  assert.deepEqual(resume(session(s)),session(s));stable(s);
  if(kind==='ready'){const result=dispatch(s,{type:'action',action:'reclaimHome'}),queued={...session(result.state),view:s,pending:result.events,presenting:true};assert.deepEqual(resume(queued),queued);}
});
test('presentation locks stale Reclaim inputs and revalidates the authoritative destination',()=>{
  let s=prepared(replacement(),'pilot');const q=new ResolutionQueue({state:s,dispatch});q.speed='manual';q.send({type:'action',action:'reclaimHome'});assert.throws(()=>q.send({type:'action',action:'reclaimHome'}),/finish/);q.dispose();
  s=prepared(replacement(),'pilot');const before=structuredClone(s);s.cells[STATIONS.pilot.cells[0]]='fire';assert.throws(()=>dispatch(s,{type:'action',action:'reclaimHome'}),/Fire/);assert.equal(c(s,'navigator').station,c(before,'navigator').station);
});
test('station operator casualty removes gun eligibility; displaced body never fires for the primary',()=>{
  const s=stacked('engineer','copilot','fire');s.fighters=[fighter('one',{engagementRemaining:5})];assert.ok(directFireGunners(s).some(c=>c.id==='engineer'));assert.ok(!directFireGunners(s).some(c=>c.id==='copilot'));damageSquare(s,STATIONS.engineer.cells[0],1,()=>{});assert.ok(!directFireGunners(s).some(c=>['engineer','copilot'].includes(c.id)));stable(s);
});
test('corrupt new operators/jobs reject transactionally; existing weird metadata is diagnosed without relocation',()=>{
  const s=fresh(),bad=structuredClone(s);Object.assign(c(bad,'navigator'),{station:'pilot',position:[...STATIONS.pilot.cells],displaced:false});assert.throws(()=>assertCrewTransition(s,bad),/multiple operational/);assert.ok(crewStateProblems(bad).length);assert.deepEqual(resume(session(bad)),session(bad));
  const orphan=structuredClone(s);c(orphan,'radio').job='missing';assert.throws(()=>assertCrewTransition(s,orphan),/orphan/);
  for(const badPosition of [null,[],['NOT-A-CELL']]){const invalid=structuredClone(s);c(invalid,'pilot').position=badPosition;assert.equal(resume(session(invalid)),null);}
});

test('three living occupants all receive one hit; worker cancellation leaves every body in place',()=>{
  let s=stacked();s.cells['B2-4']='damaged';s=action(s,'radio','repair',{cells:['B2-4'],workCellId:STATIONS.pilot.cells[0]}).state;
  const positions=s.crew.map(c=>c.position);damageSquare(s,STATIONS.pilot.cells[0],1,()=>{});
  for(const id of ['pilot','navigator','radio'])assert.equal(c(s,id).health,'injured');
  assert.equal(s.jobs.length,0);assert.deepEqual(s.crew.map(c=>c.position),positions);stable(s);
});
test('one occupied cell of a multi-cell return home blocks relief; remote workers are never evicted',()=>{
  let s=replacement('bombardier','engineer');s.cells['B2-4']='damaged';
  s=action(s,'radio','repair',{cells:['B2-4'],workCellId:STATIONS.engineer.cells[0]}).state;
  const job=structuredClone(s.jobs),worker=structuredClone(c(s,'radio')),r=action(s,'bombardier','reclaimHome');
  assert.deepEqual(c(r.state,'engineer').position,STATIONS.bombardier.cells);assert.equal(c(r.state,'engineer').displaced,true);assert.deepEqual(r.state.jobs,job);assert.deepEqual(c(r.state,'radio'),worker);stable(r.state);
});
test('assistant and caregiver cannot reclaim during Medical; patient heals without stealing the substitute station',()=>{
  let s=replacement();c(s,'pilot').health='injured';s=action(s,'radio','medical',{targetId:'pilot',workCellId:'D2-3'}).state;
  s=action(s,'engineer','assistWork',{jobId:s.jobs[0].id,workCellId:'C2-4'}).state;
  for(const id of ['radio','engineer','pilot'])assert.throws(()=>action(s,id,'reclaimHome'),/cannot act/);
  const job=structuredClone(s.jobs);assert.equal(c(s,'navigator').station,'pilot');assert.deepEqual(s.jobs,job);
  s.jobs[0].remainingTime=1;s.bags.mission.tokens=['Time'];s=dispatch(s,{type:'activate',crewId:'bombardier'}).state;
  assert.equal(c(s,'pilot').health,'healthy');assert.equal(c(s,'pilot').station,null);assert.equal(c(s,'navigator').station,'pilot');assert.equal(s.jobs.length,0);stable(s);
});
for(const blocker of ['fire','injured','stacked'])test(`post-job return blocked by ${blocker} leaves worker at their coherent work position`,()=>{
  let s=fresh();s.cells['A3-1']='damaged';s=action(s,'engineer','repair',{cells:['A3-1']}).state;const position=[...c(s,'engineer').position];
  if(blocker==='fire')s.cells[STATIONS.engineer.cells[0]]='fire';
  else {s=action(s,'radio','manStation',{stationId:'engineer'}).state;if(blocker==='injured')c(s,'radio').health='injured';else{c(s,'radio').health='injured';s=action(s,'navigator','manStation',{stationId:'engineer'}).state;}}
  s.jobs[0].remainingTime=1;s.bags.mission.tokens=['Time'];s=dispatch(s,{type:'activate',crewId:'pilot'}).state;
  assert.equal(c(s,'engineer').job,null);assert.equal(c(s,'engineer').station,null);assert.deepEqual(c(s,'engineer').position,position);stable(s);
});
test('selected actor killed before Reclaim cannot commit or replay a draw',()=>{
  const s=prepared(replacement(),'pilot');c(s,'pilot').health='dead';const before=structuredClone(s);assert.throws(()=>dispatch(s,{type:'action',action:'reclaimHome'}),/cannot act/);assert.deepEqual(s,before);
});
test('saved historical home, not identity, governs Reclaim and relieved return',()=>{
  let s=fresh();Object.assign(c(s,'pilot'),{homeStation:'copilot',station:null,displaced:true});Object.assign(c(s,'copilot'),{homeStation:'pilot',station:'pilot',position:[...STATIONS.pilot.cells]});
  s=action(s,'navigator','manStation',{stationId:'copilot'}).state;s=resume(session(s)).state;
  const r=action(s,'pilot','reclaimHome');assert.equal(c(r.state,'pilot').station,'copilot');assert.equal(c(r.state,'copilot').station,'pilot');assert.equal(c(r.state,'navigator').station,'navigator');stable(r.state);
});
test('Reclaim history is accessible from both straddling cells and the legal return destination',()=>{
  for(const blocked of ['free','fire']){const r=action(replacement('engineer','copilot',blocked),'engineer','reclaimHome');
    for(const id of [...STATIONS.engineer.cells,...(blocked==='free'?STATIONS.copilot.cells:[])])assert.equal(deriveCellHistory(r.events,id).entries.filter(e=>e.type==='STATION_RECLAIMED').length,1);
  }
});
