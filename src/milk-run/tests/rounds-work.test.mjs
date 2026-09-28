import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, STATIONS, ENGINE_CELLS, getCell } from '../board.mjs';
import { dispatch, availableActions, resolveFireSpread, resolveAltitude } from '../rules.mjs';
import { fresh, activated, fighter, collect, rngForDice } from './fixtures.mjs';

const square = (x, y) => BOARD.find(c => c.x === x && c.y === y).id;
const action = (state, id, extra = {}) => dispatch(state, { type: 'action', action: id, ...extra });
const nextRound = state => dispatch({ ...state, phase: 'ready' }, { type: 'startRound' });

test('Resource draws match active rank, and spending returns exactly spent tokens on next round refill', () => {
  for (const [crewId, rank] of [['pilot','Officer'],['engineer','Enlisted']]) {
    const state = activated(crewId);
    assert.equal(state.resources[rank], fresh().resources[rank] + 1);
    const id = square(0, 4);
    state.cells[id] = 'damaged';
    const worked = action(state, 'repair', { cells: [id] });
    assert.equal(worked.state.resources[rank], state.resources[rank] - 1);
    assert.equal(worked.state.bags.mission.tokens.length, 99);
    assert.deepEqual(worked.state.bags.mission.discard, ['Resource']);
    const started = nextRound(worked.state);
    assert.equal(started.state.bags.mission.tokens.length, 100);
    assert.equal(started.state.bags.mission.discard.length, 0);
    assert.equal(started.state.resources[rank], worked.state.resources[rank]);
  }
});

test('Copilot alone converts resources at 2:1 and preserves the physical token total', () => {
  const state = activated('copilot');
  const total = s => Object.values(s.resources).reduce((a,b) => a+b,0) + s.bags.mission.tokens.filter(t=>t==='Resource').length + s.bags.mission.discard.filter(t=>t==='Resource').length;
  const result = action(state, 'convert', { to: 'Officer' });
  assert.equal(result.state.resources.Enlisted, state.resources.Enlisted - 2);
  assert.equal(result.state.resources.Officer, state.resources.Officer + 1);
  assert.equal(total(result.state), total(state));
  assert.equal(result.state.bags.mission.discard.filter(t=>t==='Resource').length, 1);
  const ordinary = activated('pilot');
  assert.throws(() => action(ordinary, 'convert', { to: 'Enlisted' }), /available/i);
});

test('Pilot orders exactly one used-gunner Basic Shot without a draw or additional enemy phase', () => {
  const state = activated('pilot');
  state.crew.find(c=>c.id==='engineer').used = true;
  state.fighters = [fighter('f1', { hp: 4, maxHp: 4, facing: 180 })];
  state.bags.combat = { tokens: ['Hit','Hit','Hit'], discard: [] };
  const result = action(state, 'orderShot', { gunnerId: 'engineer', targetId: 'f1' });
  assert.equal(result.state.fighters[0].hp, 3);
  assert.equal(result.state.stats.missionDraws, state.stats.missionDraws);
  assert.equal(result.state.slot, state.slot);
  assert.equal(result.events.filter(e=>e.type==='ENEMY_PHASE_STARTED').length, 1);
  assert.equal(result.events.filter(e=>e.type==='GUNNER_SHOT_ROLL').length, 1);
  assert.equal(result.state.resources.Officer, state.resources.Officer - 1);
});

test('unavailable slots occur after active crew, waste resource draws, and still resolve enemy phases', () => {
  const state = activated('pilot');
  state.crew.filter(c=>c.id!=='pilot').forEach(c=>{c.health='dead';});
  const result = action(state, 'wait');
  assert.equal(result.state.phase, 'roundEnd');
  assert.equal(result.state.slot, 10);
  assert.equal(result.state.stats.missionDraws, 10);
  assert.equal(result.events.filter(e=>e.type==='UNAVAILABLE_CREW_SLOT').length, 9);
  assert.equal(result.events.filter(e=>e.type==='RESOURCE_WASTED').length, 9);
  assert.equal(result.events.filter(e=>e.type==='ENEMY_PHASE_STARTED').length, 10);
  assert.equal(result.state.resources.Enlisted, state.resources.Enlisted);
  assert.equal(result.state.resources.Officer, state.resources.Officer);
  assert.equal(result.state.bags.mission.discard.length, 9);
});

test('unavailable mission-draw option can suppress those draws while preserving ten time slots', () => {
  const state = activated('pilot', { unavailableDraws: false });
  state.crew.filter(c=>c.id!=='pilot').forEach(c=>{c.health='dead';});
  const result = action(state, 'wait');
  assert.equal(result.state.slot, 10);
  assert.equal(result.state.stats.missionDraws, 1);
  assert.equal(result.events.filter(e=>e.type==='UNAVAILABLE_DRAW_SKIPPED').length, 9);
});

test('end round clears surviving fighters and escorts by default, with fighter persistence configurable', () => {
  for (const clearFighters of [true, false]) {
    const state = fresh({ clearFighters });
    state.phase = 'roundEnd'; state.round = 1; state.slot = 10;
    state.fighters = [fighter(),fighter('f2')];
    state.escorts = [{ id: 'e1', quadrant: 'Port', round: 1 }];
    const deckBefore = state.deck.cards.length + state.deck.discard.length;
    const result = dispatch(state, { type: 'endRound' });
    assert.equal(result.state.fighters.length, clearFighters ? 0 : 2);
    assert.equal(result.state.escorts.length, 0);
    assert.equal(result.state.mission.position, 1);
    assert.equal(result.state.deck.cards.length + result.state.deck.discard.length, deckBefore, 'discarded draw cards are not duplicated at cleanup');
  }
});

test('Repair is queued for configured round start, relocates safely, and automatically returns the worker', () => {
  const state = activated('radio', { repairDuration: 2 });
  const ids = [square(0,4),square(1,4),square(1,5)];
  ids.forEach(id=>{state.cells[id]='damaged';});
  const result = action(state, 'repair', { cells: ids });
  assert.equal(result.state.jobs.length, 1);
  assert.equal(result.state.jobs[0].completeRound, 3);
  assert.ok(ids.every(id=>result.state.cells[id]==='damaged'));
  assert.ok(result.state.crew.find(c=>c.id==='radio').position.every(id=>result.state.cells[id]!=='fire'));
  assert.equal(availableActions(result.state,'radio').length, 0);
  const waiting = nextRound(result.state);
  assert.equal(waiting.state.jobs.length, 1);
  const complete = nextRound(waiting.state);
  assert.equal(complete.state.jobs.length, 0);
  assert.ok(ids.every(id=>complete.state.cells[id]==='healthy'));
  assert.equal(complete.state.stats.repairs, 3);
  assert.deepEqual(complete.state.crew.find(c=>c.id==='radio').position, STATIONS.radio.cells);
});

test('Engineer extra repair capacity follows configuration, and disconnected work is rejected transactionally', () => {
  const state = activated('engineer', { repairCap: 3, engineerBonus: 2 });
  const ids = [0,1,2,3,4].map(x=>square(x,4));
  ids.forEach(id=>{state.cells[id]='damaged';});
  assert.equal(action(state, 'repair', { cells: ids }).state.jobs[0].cells.length, 5);
  const distant = square(5,10);
  state.cells[distant] = 'damaged';
  const before = structuredClone(state);
  assert.throws(()=>action(state,'repair',{cells:[ids[0],distant]}), /connected/i);
  assert.deepEqual(state,before);
});

test('eight-way work permits diagonal selections; default work is orthogonal', () => {
  for (const eightWayWork of [false,true]) {
    const state = activated('radio', { eightWayWork });
    const ids = [square(2,4),square(3,5)];
    ids.forEach(id=>{state.cells[id]='damaged';});
    if (eightWayWork) assert.equal(action(state,'repair',{cells:ids}).state.jobs.length,1);
    else assert.throws(()=>action(state,'repair',{cells:ids}),/connected/i);
  }
});

test('Fire Control suppresses active fire and completes to Damage, with extinguish outcome configurable', () => {
  for (const extinguishLeavesDamage of [true,false]) {
    const state = activated('radio', { fireDuration: 2, extinguishLeavesDamage });
    const id = square(0,4);
    state.cells[id]='fire';
    const started = action(state,'fireControl',{cells:[id]});
    assert.equal(started.state.cells[id],'fire');
    assert.ok(started.state.crew.find(c=>c.id==='radio').position.every(p=>started.state.cells[p]!=='fire'));
    const waiting = nextRound(started.state);
    assert.equal(waiting.events.filter(e=>e.type==='FIRE_SPREAD_ROLL').length,0);
    assert.equal(waiting.state.cells[id],'fire');
    const complete = nextRound(waiting.state);
    assert.equal(complete.state.cells[id],extinguishLeavesDamage?'damaged':'healthy');
    assert.equal(complete.state.jobs.length,0);
  }
});

test('healthy crew stop first fire spread; later spread kills injured crew and takes their square', () => {
  const state = fresh({ eightWayWork: true });
  const source = square(4,2), destination = square(5,2);
  state.cells[source] = 'fire';
  const { events, emit } = collect();
  state.rng = rngForDice([4]);
  resolveFireSpread(state,emit);
  assert.equal(state.crew.find(c=>c.id==='pilot').health,'injured');
  assert.equal(state.cells[destination],'healthy');
  assert.deepEqual(state.crew.find(c=>c.id==='pilot').position,STATIONS.pilot.cells,'fire does not teleport crew');
  assert.equal(events.filter(e=>e.type==='FIRE_SPREAD_ROLL').length,1);
  assert.equal(state.cells[square(5,1)],'healthy','diagonal work option does not change fire spread');
  state.rng = rngForDice([4]);
  resolveFireSpread(state,emit);
  assert.equal(state.crew.find(c=>c.id==='pilot').health,'dead');
  assert.equal(state.cells[destination],'fire');
});

test('workers stay displaced if their assigned station is burning when a job completes', () => {
  const state = activated('radio');
  const id=square(0,4);state.cells[id]='damaged';
  const worked=action(state,'repair',{cells:[id]}).state;
  const workPosition=[...worked.crew.find(c=>c.id==='radio').position];
  worked.cells[STATIONS.radio.cells[0]]='fire';
  worked.rng=rngForDice([1]);
  const result=nextRound(worked);
  assert.deepEqual(result.state.crew.find(c=>c.id==='radio').position,workPosition);
  assert.equal(result.state.crew.find(c=>c.id==='radio').job,null);
  assert.ok(result.events.some(e=>e.type==='CREW_DISPLACED'));
});

test('Medical heals injury at its configured start and never revives a dead crew member', () => {
  const state=activated('radio');
  state.crew.find(c=>c.id==='pilot').health='injured';
  const worked=action(state,'medical',{targetId:'pilot'}).state;
  assert.equal(worked.crew.find(c=>c.id==='pilot').health,'injured');
  const healed=nextRound(worked).state;
  assert.equal(healed.crew.find(c=>c.id==='pilot').health,'healthy');
  worked.crew.find(c=>c.id==='pilot').health='dead';
  assert.equal(nextRound(worked).state.crew.find(c=>c.id==='pilot').health,'dead');
});

test('engine restart requires an active, correctly seated cockpit occupant and configurable dice success', () => {
  const state=activated('pilot',{restartMax:4});state.engines[0].running=false;
  for(const roll of [4,5]) {
    state.rng=rngForDice([roll]);
    const result=action(state,'restartEngine',{targetId:'E1'});
    assert.equal(result.state.engines[0].running,roll===4);
    assert.equal(result.state.stats.enginesRestarted,roll===4?1:0);
  }
  state.cells[ENGINE_CELLS.E1[0]]='damaged';
  assert.throws(()=>action(state,'restartEngine',{targetId:'E1'}),/repaired/i);
  const engineer=activated('engineer');engineer.engines[0].running=false;
  assert.throws(()=>action(engineer,'restartEngine',{targetId:'E1'}),/available/i);
});

test('Man Cockpit costs an activation and enables an Enlisted substitute to control/restart from that seat', () => {
  const state=activated('engineer');state.crew.find(c=>c.id==='pilot').health='dead';
  const moved=action(state,'manCockpit',{stationId:'pilot'});
  const member=moved.state.crew.find(c=>c.id==='engineer');
  assert.equal(member.used,true);assert.equal(member.station,'pilot');assert.deepEqual(member.position,STATIONS.pilot.cells);
  assert.equal(moved.state.phase,'select');
  const next=nextRound(moved.state).state;
  const again=dispatch(next,{type:'activate',crewId:'engineer'}).state;again.engines[0].running=false;again.rng=rngForDice([1]);
  assert.equal(action(again,'restartEngine',{targetId:'E1'}).state.engines[0].running,true);
  again.crew.find(c=>c.id==='copilot').health='dead';again.rng=rngForDice([4]);
  const {emit}=collect();resolveAltitude(again,emit);
  assert.equal(again.stats.altitudeLostByCause.control,1,'Enlisted substitute needs 5+');
});

test('Relocate is unavailable when no other safe unoccupied fuselage position exists', () => {
  const state=activated('radio');
  state.crew.find(c=>c.id==='radio').position=[STATIONS.radio.cells[0]];
  for(const cell of BOARD.filter(c=>c.fuselage))state.cells[cell.id]='fire';
  state.cells[STATIONS.radio.cells[0]]='healthy';
  const relocate=availableActions(state,'radio').find(a=>a.id==='relocate');
  assert.equal(relocate.enabled,false);
  assert.throws(()=>action(state,'relocate',{targetId:STATIONS.radio.cells[0]}));
});

test('Relocate rejects the current one-square work position without using an action', () => {
  const state=activated('radio');
  state.crew.find(c=>c.id==='radio').position=[STATIONS.radio.cells[0]];
  const before=structuredClone(state);
  assert.equal(availableActions(state,'radio').find(a=>a.id==='relocate').enabled,true,'there are other legal destinations');
  assert.throws(()=>action(state,'relocate',{targetId:STATIONS.radio.cells[0]}));
  assert.deepEqual(state,before);
});

test('a full configured START → TARGET → HOME sortie completes, with bombing miss still allowing return', () => {
  let state=fresh({outboundLength:6,returnLength:4,bombingMin:6});
  const events=[];
  for(let commands=0;state.phase!=='ended'&&commands<300;commands++) {
    let command;
    if(state.phase==='ready') command={type:'startRound'};
    else if(state.phase==='select') command={type:'activate',crewId:state.crew.find(c=>!c.used&&c.health==='healthy'&&!c.job).id};
    else if(state.phase==='action') command={type:'action',action:'wait'};
    else if(state.phase==='roundEnd') command={type:'endRound'};
    else {state.rng=rngForDice([1]);command={type:'bomb'};}
    const result=dispatch(state,command);state=result.state;events.push(...result.events);
  }
  assert.equal(state.phase,'ended');assert.equal(state.outcome,'success');
  assert.equal(state.mission.position,10);assert.equal(state.round,10);
  assert.equal(state.mission.bombed,true);assert.equal(state.mission.bombingResult,'miss');
  assert.equal(state.stats.missionDraws,100);assert.equal(state.stats.rounds,10);
  assert.equal(events.filter(e=>e.type==='BOMBING_ROLL').length,1);
  assert.ok(events.every(e=>e.state&&e.message&&e.type),'every rules event includes its isolated presentation snapshot');
  assert.throws(()=>dispatch(state,{type:'startRound'}),/ended/i);
});
