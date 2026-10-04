import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { BOARD, STATIONS } from '../board.mjs';
import { dispatch, availableCrew, availableActions, eligibleStations, operatingArc, isAtStation, crisisTargetCap,
  legalWorkPositions, resolveAltitude, damageSquare, directFireGunners } from '../rules.mjs';
import { homeStationId, currentStationId } from '../crew-position.mjs';
import { stationStatus, arcPreview } from '../ui-model.mjs';
import { crewMarkup } from '../views.mjs';
import { crewMarkerLayout } from '../board-view.mjs';
import { saveSession, loadSession } from '../persistence.mjs';
import { fighter, collect, rngForIndexes } from './fixtures.mjs';

const member = (s, id) => s.crew.find(c => c.id === id);
function fresh(ruleset = 'v2-continuous', overrides = {}) {
  let s = createGame({ opportunityEnabled: false, missionEnemy: 0, missionResource: 80,
    v2MissionEnemy: 0, v2MissionResource: 80, v2MissionTime: 10, ...overrides }, 'crew-stations', ruleset);
  return ruleset === 'v1' ? dispatch(s, { type: 'startRound' }).state : s;
}
function activate(s, crewId, token = 'Resource') {
  const bag = s.bags.mission.tokens.length ? s.bags.mission.tokens : s.bags.mission.discard;
  s.rng = rngForIndexes([bag.length], [bag.indexOf(token)]);
  return dispatch(s, { type: 'activate', crewId }).state;
}
const act = (s, action, extra = {}) => dispatch(s, { type: 'action', action, ...extra });
function nextActivation(s, id) {
  for (let i = 0; i < 40; i++) {
    if (s.phase === 'select' && availableCrew(s).some(c => c.id === id)) return activate(s, id);
    if (s.phase === 'select') s = act(activate(s, availableCrew(s)[0].id), 'wait').state;
    else if (s.phase === 'roundEnd') s = dispatch(s, { type: 'endRound' }).state;
    else if (s.phase === 'ready') s = dispatch(s, { type: 'startRound' }).state;
    else throw Error(s.phase);
  }
  throw Error('No activation for '+id);
}
function sessionFor(s) { return { version: 1, presentationVersion: 2, state: s, view: structuredClone(s), pending: [], current: null, log: [], speed: 'manual' }; }
function resume(session) { let raw; const storage = { getItem: () => raw, setItem: (k,v) => { raw=v; } }; saveSession(session,storage); return loadSession(storage); }

for (const ruleset of ['v1','v2-continuous']) {
  test(`${ruleset}: Navigator mans Top Turret, retains identity/rank/repair cap, and uses its arcs`, () => {
    const s = activate(fresh(ruleset), 'navigator'); member(s,'engineer').health = 'injured';
    const position = [...member(s,'engineer').position], resources = { ...s.resources };
    assert.ok(eligibleStations(s,'navigator').includes('engineer'));
    const r = act(s,'manStation',{stationId:'engineer'}), nav=member(r.state,'navigator');
    assert.equal(nav.homeStation,'navigator'); assert.equal(nav.station,'engineer'); assert.equal(nav.displaced,false);
    assert.equal(nav.used,true); assert.equal(nav.activationCompleted,true); assert.equal(r.state.slot,s.slot);
    assert.deepEqual(r.state.resources,resources); assert.deepEqual(member(r.state,'engineer').position,position);
    assert.equal(member(r.state,'engineer').station,null); assert.equal(member(r.state,'engineer').displaced,true);
    assert.deepEqual(operatingArc(r.state,'navigator'),{quadrants:['Fore','Port','Starboard','Aft'],altitudes:['Level','High']});
    assert.equal(crisisTargetCap(r.state,'navigator','repair'),r.state.config.repairCap);
    assert.equal(crisisTargetCap(r.state,'engineer','repair'),r.state.config.repairCap+r.state.config.engineerBonus);
    assert.ok(availableActions(r.state,'navigator').some(a=>a.id==='rotateFighter'));
    r.state.fighters=[fighter('aft',{quadrant:'Aft'}),fighter('low',{altitude:'Low'})];
    assert.deepEqual(arcPreview(r.state,'navigator').fighterIds,['aft']);
    assert.ok(directFireGunners(r.state).some(c=>c.id==='navigator'));
    assert.match(crewMarkup(r.state,null),/Home Station: Navigator \/ nose gun\. Current Station: Engineer \/ top turret/);
    assert.equal(stationStatus(r.state,nav).currentName,'Engineer / top turret');
    const later=nextActivation(r.state,'navigator'); later.fighters=[fighter('aft',{quadrant:'Aft',engagementRemaining:5})];
    later.bags.combat.tokens=['Hit'];
    assert.ok(act(later,'basicFire',{targetId:'aft'}).events.some(e=>e.type==='FIGHTER_DAMAGED'&&e.fighterId==='aft'));
  });

  test(`${ruleset}: Engineer heals without eviction, substitute leaves, original returns only by spending an action`, () => {
    let s=activate(fresh(ruleset,{medicalDuration:0,v2MedicalTime:1}),'navigator');member(s,'engineer').health='injured';
    s=act(s,'manStation',{stationId:'engineer'}).state;
    s=act(activate(s,'radio'),'medical',{targetId:'engineer'}).state;
    if(ruleset!=='v1') s=act(activate(s,'pilot','Time'),'wait').state;
    assert.equal(member(s,'engineer').health,'healthy');assert.equal(member(s,'engineer').station,null);
    assert.equal(isAtStation(s,member(s,'engineer')),false);assert.equal(member(s,'navigator').station,'engineer');
    assert.deepEqual(member(s,'engineer').position,STATIONS.engineer.cells);
    assert.equal(availableActions(s,'engineer').find(a=>a.id==='returnHome').enabled,false);
    s=nextActivation(s,'navigator');const draws=s.stats.missionDraws;
    s=act(s,'leaveStation').state;
    assert.equal(member(s,'navigator').station,null);assert.equal(member(s,'navigator').displaced,true);
    assert.equal(s.stats.missionDraws,draws);assert.ok(!member(s,'navigator').position.some(id=>STATIONS.engineer.cells.includes(id)));
    assert.equal(availableActions(s,'engineer').find(a=>a.id==='returnHome').enabled,true);
    s=act(nextActivation(s,'engineer'),'returnHome').state;
    assert.equal(member(s,'engineer').station,'engineer');assert.equal(isAtStation(s,member(s,'engineer')),true);
    s=act(nextActivation(s,'navigator'),'returnHome').state;
    assert.equal(member(s,'navigator').station,'navigator');assert.deepEqual(member(s,'navigator').position,STATIONS.navigator.cells);
  });

  test(`${ruleset}: healthy occupants and Fire block reassignment transactionally`, () => {
    const s=activate(fresh(ruleset),'navigator'),before=structuredClone(s);
    assert.throws(()=>act(s,'manStation',{stationId:'engineer'}),/vacant/);assert.deepEqual(s,before);
    member(s,'engineer').health='injured';s.cells['C2-4']='fire';
    assert.throws(()=>act(s,'manStation',{stationId:'engineer'}),/vacant/);
    s.cells['C2-4']='healthy';member(s,'navigator').health='injured';
    assert.throws(()=>act(s,'manStation',{stationId:'engineer'}));
  });

  for(const [id,seat,minimum] of [['pilot','copilot',0],['navigator','pilot',3],['engineer','pilot',5]])
    test(`${ruleset}: ${id} at ${seat} preserves Control qualification and personal abilities`, () => {
      let s=activate(fresh(ruleset),id);for(const crew of s.crew)if(['pilot','copilot'].includes(crew.id)&&crew.id!==id)crew.health='injured';
      s=act(s,'manStation',{stationId:seat}).state;
      const events=collect();resolveAltitude(s,events.emit);
      assert.equal(events.events.find(e=>e.type==='ALTITUDE_CHECK'&&e.cause==='control').minimum,minimum);
      const actions=availableActions(s,id).map(a=>a.id);
      assert.equal(actions.includes('directFire'),id==='pilot');assert.equal(actions.includes('convert'),false);
      assert.ok(actions.includes('restartEngine'));assert.equal(operatingArc(s,id),null);
      const original=member(s,seat);if(original.id!==id){original.health='healthy';assert.equal(isAtStation(s,original),false);assert.equal(member(s,id).station,seat);}
    });

  test(`${ruleset}: empty cockpit and a displaced trained pilot do not provide Control`, () => {
    let s=activate(fresh(ruleset),'pilot');member(s,'copilot').health='injured';
    s=act(s,'leaveStation').state;const events=collect();resolveAltitude(s,events.emit);
    assert.equal(events.events.find(e=>e.type==='ALTITUDE_CHECK'&&e.cause==='control').minimum,7);
    assert.equal(s.stats.altitudeLostByCause.control,1);
  });

  test(`${ruleset}: a non-Gunner identity at a gun station can Basic/Advanced/Opportunity fire`, () => {
    let s=activate(fresh(ruleset,{opportunityEnabled:true}),'pilot');member(s,'engineer').health='injured';
    s=act(s,'manStation',{stationId:'engineer'}).state;
    s.fighters=[fighter('aft',{quadrant:'Aft',hp:4,maxHp:4,engagementRemaining:5})];s.bags.combat.tokens=['Hit'];
    assert.equal(currentStationId(member(s,'pilot')),'engineer');
    assert.ok(availableActions(s,'pilot').find(a=>a.id==='advancedFire').enabled);
    assert.ok(dispatch(s,{type:'opportunityShot',gunnerId:'pilot',targetId:'aft'}).events.some(e=>e.type==='FIGHTER_DAMAGED'));
  });

  test(`${ruleset}: work completion returns home only if a substitute has not occupied it`, () => {
    let s=activate(fresh(ruleset,{repairDuration:1,v2RepairTime:1}),'engineer');s.cells['E3-1']='damaged';
    s=act(s,'repair',{cells:['E3-1'],workCellId:'C3-2'}).state;
    s=act(activate(s,'navigator'),'manStation',{stationId:'engineer'}).state;
    if(ruleset==='v1'){s.phase='ready';s=dispatch(s,{type:'startRound'}).state;}
    else s=activate(s,'pilot','Time');
    assert.equal(s.jobs.length,0);assert.equal(s.cells['E3-1'],'healthy');
    assert.equal(member(s,'navigator').station,'engineer');assert.deepEqual(member(s,'engineer').position,['C3-2']);
    assert.equal(member(s,'engineer').station,null);assert.equal(member(s,'engineer').displaced,true);
  });

  test(`${ruleset}: injury cancels work at its location without restoring a station`, () => {
    let s=activate(fresh(ruleset),'engineer');s.cells['E3-1']='fire';
    s=act(s,'fireControl',{cells:['E3-1'],workCellId:'C3-2'}).state;
    const e=collect();damageSquare(s,'C3-2',1,e.emit);
    assert.equal(s.jobs.length,0);assert.equal(member(s,'engineer').station,null);assert.equal(member(s,'engineer').displaced,true);
    assert.deepEqual(member(s,'engineer').position,['C3-2']);assert.equal(homeStationId(member(s,'engineer')),'engineer');
  });

  test(`${ruleset}: a substitute completing work returns to personal home, not the replacement station`, () => {
    let s=activate(fresh(ruleset,{repairDuration:0,v2RepairTime:1}),'navigator');
    member(s,'engineer').health='injured';
    s=act(s,'manStation',{stationId:'engineer'}).state;
    s=nextActivation(s,'navigator');s.cells['E3-1']='damaged';
    let result=act(s,'repair',{cells:['E3-1'],workCellId:'C3-2'});
    if(ruleset!=='v1') {
      s=result.state;const bag=s.bags.mission.tokens;
      s.rng=rngForIndexes([bag.length],[bag.indexOf('Time')]);
      result=dispatch(s,{type:'activate',crewId:'pilot'});
    }
    assert.equal(member(result.state,'navigator').station,'navigator');
    assert.equal(member(result.state,'navigator').homeStation,'navigator');
    assert.deepEqual(member(result.state,'navigator').position,STATIONS.navigator.cells);
    assert.equal(member(result.state,'engineer').station,null);
    assert.equal(result.events.filter(e=>e.type==='WORK_COMPLETED').length,1);
  });
}

test('wing work remains same-row interior, sharing safe occupied footprints and rejecting Fire', () => {
  const s=fresh();const options=legalWorkPositions(s,'navigator',['E3-1']);
  assert.ok(options.length>1);assert.ok(options.every(c=>c.fuselage&&c.id[1]==='3'));
  assert.ok(options.some(c=>c.id==='C3-2'),'Radio occupancy does not block safe work');
  s.cells['C3-2']='fire';assert.ok(!legalWorkPositions(s,'navigator',['E3-1']).some(c=>c.id==='C3-2'));
  for(const c of BOARD.filter(c=>c.fuselage&&c.id[1]==='3'))s.cells[c.id]='fire';
  assert.deepEqual(legalWorkPositions(s,'navigator',['E3-1']),[],'wing work does not reach a different row');
});

test('central Fire Control prefers its row and offers both adjacent interior rows only when needed', () => {
  let s=activate(fresh(),'engineer');s.cells['C4-2']='fire';
  assert.ok(legalWorkPositions(s,'engineer',['C4-2']).every(c=>c.id[1]==='4'));
  for(const c of BOARD.filter(c=>c.fuselage&&c.id[1]==='4'))s.cells[c.id]='fire';
  for(const id of ['leftWaist','rightWaist'])member(s,id).health='dead';
  const choices=legalWorkPositions(s,'engineer',['C4-2']);
  assert.deepEqual(new Set(choices.map(c=>c.id[1])),new Set(['3','5']));assert.ok(choices.every(c=>c.fuselage&&s.cells[c.id]!=='fire'));
  const chosen=choices.find(c=>c.id[1]==='5').id;
  s=act(s,'fireControl',{cells:['C4-2'],workCellId:chosen}).state;
  assert.deepEqual(member(s,'engineer').position,[chosen]);assert.deepEqual(s.jobs[0].cells,['C4-2']);assert.equal(s.jobs[0].remainingTime,4);
});

test('station replacement and active work restore authoritative, visible and pending positioning exactly', () => {
  let s=activate(fresh(),'navigator');member(s,'engineer').health='injured';
  const r=act(s,'manStation',{stationId:'engineer'});
  const session={...sessionFor(r.state),view:s,pending:r.events,presenting:true};assert.deepEqual(resume(session),session);
  s=activate(r.state,'radio');s.cells['E3-1']='damaged';const work=act(s,'repair',{cells:['E3-1'],workCellId:'C3-2'});
  const working={...sessionFor(work.state),view:s,pending:work.events,presenting:true};assert.deepEqual(resume(working),working);
  assert.equal(resume(working).state.crew.find(c=>c.id==='radio').station,null);
});

test('legacy position migration preserves old cockpit assignments as home and never moves displaced workers', () => {
  const s=fresh('v1');delete s.crewPositionVersion;
  for(const c of s.crew){delete c.homeStation;delete c.displaced;}
  member(s,'pilot').health='dead';Object.assign(member(s,'engineer'),{station:'pilot',position:[...STATIONS.pilot.cells]});
  member(s,'radio').position=['C4-2'];member(s,'radio').job='old-job';
  s.jobs=[{id:'old-job',kind:'repair',crewId:'radio',cells:['E3-1'],completeRound:3}];
  const session={...sessionFor(s),pending:[{type:'WORK_STARTED',state:structuredClone(s)}]};const result=resume(session);
  for(const snap of [result.state,result.view,result.pending[0].state]) {
    assert.equal(member(snap,'engineer').homeStation,'pilot');assert.equal(member(snap,'engineer').station,'pilot');
    assert.equal(member(snap,'radio').homeStation,'radio');assert.equal(member(snap,'radio').station,null);assert.equal(member(snap,'radio').displaced,true);
    assert.deepEqual(member(snap,'radio').position,['C4-2']);
    for(const key of ['rng','bags','jobs','mission','resources','stats'])assert.deepEqual(snap[key],s[key],key);
  }
  assert.deepEqual(resume(result),result);
});

test('offset markers keep substitute and injured original within their actual shared footprint', () => {
  let s=activate(fresh(),'navigator');member(s,'engineer').health='injured';s=act(s,'manStation',{stationId:'engineer'}).state;
  const layout=crewMarkerLayout(s),nav=layout.find(c=>c.id==='navigator'),eng=layout.find(c=>c.id==='engineer');
  assert.equal(nav.fixed,true);assert.equal(eng.fixed,false);assert.notDeepEqual([nav.x,nav.y],[eng.x,eng.y]);
  for(const c of [nav,eng]){assert.ok(c.x-c.outerRadius>=c.bounds.left);assert.ok(c.x+c.outerRadius<=c.bounds.right);assert.ok(c.y-c.outerRadius>=c.bounds.top);assert.ok(c.y+c.outerRadius<=c.bounds.bottom);}
});
