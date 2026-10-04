import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { dispatch, availableCrew, eligibleAssistJobs, legalWorkPositions, damageSquare, resolveAttack, gunArcLegal, resolveAltitude } from '../rules.mjs';
import { gainFighterKillTime, gainBonusTime } from '../continuous.mjs';
import { effectiveTimeThreshold, specialistOperator, leaveStation } from '../crew-position.mjs';
import { STATIONS } from '../board.mjs';
import { saveSession, loadSession } from '../persistence.mjs';
import { sortieResult } from '../results.mjs';
import { fighter, collect, rngForIndexes } from './fixtures.mjs';

const fresh = (config = {}, ruleset = 'v2-continuous') => createGame({ opportunityEnabled: false, v2MissionEnemy: 0, v2MissionResource: 80, v2MissionTime: 20, ...config }, 'playtest-consolidation', ruleset);
const crew = (state, id) => state.crew.find(c => c.id === id);
const physicalTime = s => [...s.bags.mission.tokens, ...s.bags.mission.discard, ...s.timeTokens, ...s.overflowTimeTokens].filter(t => t === 'Time').length;
function holdTime(s, count) {
  for (let i = 0; i < count; i++) s.bags.mission.tokens.splice(s.bags.mission.tokens.indexOf('Time'), 1);
  s.time = count; s.timeTokens = Array(count).fill('Time'); s.pendingProgress = count >= effectiveTimeThreshold(s);
}
function activate(s, id, token = 'Resource') {
  s.rng = rngForIndexes([s.bags.mission.tokens.length], [s.bags.mission.tokens.indexOf(token)]);
  return dispatch(s, { type: 'activate', crewId: id }).state;
}
const action = (s, name, extra = {}) => dispatch(s, { type: 'action', action: name, ...extra });
function resume(s) {
  const store = new Map(), storage = { getItem: k => store.get(k), setItem: (k,v) => store.set(k,v) };
  saveSession({ version: 1, state: s, view: structuredClone(s), pending: [], log: [] }, storage);
  return loadSession(storage)?.state;
}
function jobState(kind = 'repair', remainingTime = 4) {
  let s = fresh();
  if (kind === 'medical') crew(s, 'tail').health = 'injured';
  else s.cells['B2-4'] = kind === 'repair' ? 'damaged' : 'fire';
  s = action(activate(s, 'radio'), kind, kind === 'medical' ? { targetId: 'tail' } : { cells: ['B2-4'] }).state;
  s.jobs[0].remainingTime = remainingTime;
  return s;
}

test('overflow takes a physical token, immediately advances work once, survives exact save, and transfers without a second advance', () => {
  let s = jobState(); holdTime(s, 4);
  const total = physicalTime(s), initialBag = s.bags.mission.tokens.length;
  const e = collect();
  gainFighterKillTime(s, e.emit, () => {});
  assert.equal(s.time, 4); assert.equal(s.jobs[0].remainingTime, 3);
  assert.equal(s.bags.mission.tokens.length, initialBag - 1);
  assert.deepEqual(s.overflowTimeTokens, ['Time']);
  assert.equal(physicalTime(s), total);
  assert.equal(e.events.filter(event => event.type === 'BONUS_TIME_BANKED').length, 1);
  s = resume(s); assert.ok(s); assert.equal(s.jobs[0].remainingTime, 3);
  const result = dispatch(s, { type: 'continueProgress' });
  assert.equal(result.state.time, 1); assert.deepEqual(result.state.timeTokens, ['Time']);
  assert.deepEqual(result.state.overflowTimeTokens, []);
  assert.equal(result.state.jobs[0].remainingTime, 3);
  assert.equal(result.events.filter(event => event.type === 'WORK_TIME_ADVANCED').length, 0);
  assert.equal(physicalTime(result.state), total);
});

test('occupied overflow rejects a second physical reward without advancing jobs', () => {
  const s = jobState(); holdTime(s, 4); const e = collect();
  assert.equal(gainFighterKillTime(s, e.emit, () => {}), true);
  const before = structuredClone(s);
  assert.equal(gainFighterKillTime(s, e.emit, () => {}), false);
  assert.deepEqual(s, before);
  assert.equal(e.events.at(-1).type, 'FIGHTER_KILL_TIME_FULL');
});

for (const source of ['fighter-kill', 'crew-cycle']) test(`${source} never manufactures overflow from an empty bag or discard`, () => {
  const s = fresh(); holdTime(s, 4);
  s.bags.mission.discard.push(...s.bags.mission.tokens.filter(t => t === 'Time'));
  s.bags.mission.tokens = s.bags.mission.tokens.filter(t => t !== 'Time');
  const before = structuredClone(s);
  assert.equal(gainBonusTime(s, () => {}, () => {}, source), false);
  assert.deepEqual(s, before);
});

test('invalid overflow saves reject rather than silently duplicating physical Time', () => {
  for (const value of [['Time','Time'], ['Resource'], 'Time']) {
    const s = fresh(); s.overflowTimeTokens = value;
    assert.equal(resume(s), undefined);
  }
});

for (const kind of ['repair', 'fireControl', 'medical']) for (const time of [4,3,2,1]) test(`Assist Work ${kind} changes ${time} to ${Math.min(time,2)}, consumes the assistant action and costs no resources`, () => {
  let s = jobState(kind, time);
  s = activate(s, 'engineer');
  const job = s.jobs[0], resources = structuredClone(s.resources);
  assert.equal(eligibleAssistJobs(s).some(j => j.id === job.id), true);
  const r = action(s, 'assistWork', { jobId: job.id });
  assert.equal(r.state.jobs[0].remainingTime, Math.min(time,2));
  assert.equal(r.state.jobs[0].assistantId, 'engineer');
  assert.equal(crew(r.state,'engineer').cycleSlotConsumed, true);
  assert.equal(crew(r.state,'engineer').activationCompleted, true);
  assert.equal(crew(r.state,'engineer').job, job.id);
  assert.deepEqual(r.state.resources, resources);
  assert.equal(availableCrew(r.state).some(c => ['radio','engineer'].includes(c.id)), false);
  assert.deepEqual(resume(r.state), r.state);
});

test('Assist Work enforces existing safe row positioning and rejects illegal or burning positions transactionally', () => {
  let s = activate(jobState(), 'engineer');
  const id = s.jobs[0].id;
  assert.throws(() => action(s, 'assistWork', { jobId: id, workCellId: 'A1-1' }));
  const cell = legalWorkPositions(s, 'engineer', s.jobs[0].cells)[0].id;
  s.cells[cell] = 'fire';
  // This fixture models a vacant burning work square.
  for(const c of s.crew)if(c.position.includes(cell)) {c.position=['C5-2'];c.station=null;c.displaced=true;}
  assert.throws(() => action(s, 'assistWork', { jobId: id, workCellId: cell }));
  const r = action(s, 'assistWork', { jobId: id });
  assert.notEqual(crew(r.state,'engineer').position[0], cell);
  assert.equal(crew(r.state,'engineer').station, null);
});

for (const worker of ['radio', 'engineer']) test(`injuring the joined ${worker} cancels shared suppression without teleporting either worker`, () => {
  let s = activate(jobState('fireControl'), 'engineer');
  s = action(s, 'assistWork', { jobId: s.jobs[0].id, workCellId: 'C2-4' }).state;
  const positions = ['radio','engineer'].map(id => [...crew(s,id).position]);
  damageSquare(s, crew(s,worker).position[0], 1, () => {});
  assert.equal(s.jobs.length, 0);
  for (const [i,id] of ['radio','engineer'].entries()) {
    assert.equal(crew(s,id).job, null);
    assert.deepEqual(crew(s,id).position, positions[i]);
  }
  assert.equal(s.cells['B2-4'], 'fire');
});

function seat(s, id, station) {
  for (const c of s.crew) if (c.station === station && c.id !== id) { leaveStation(c); c.position = ['C3-1']; }
  Object.assign(crew(s,id), { station, displaced: false, position: [...STATIONS[station].cells] });
}

test('Navigator can fire the Ball Turret arc while losing navigation; Officer substitute restores only the station function', () => {
  const s = fresh({ v2NavigatorUnmannedTimePenalty: 1 }); seat(s, 'navigator', 'ball');
  s.fighters = [fighter('low', { quadrant: 'Fore', altitude: 'Low', engagementRemaining: 5 })];
  assert.equal(gunArcLegal(s, 'navigator', 'low'), true);
  assert.equal(specialistOperator(s,'navigator'), null); assert.equal(effectiveTimeThreshold(s),5);
  seat(s,'copilot','navigator');
  assert.equal(specialistOperator(s,'navigator').id,'copilot'); assert.equal(effectiveTimeThreshold(s),4);
  seat(s,'radio','navigator');
  assert.equal(specialistOperator(s,'navigator'),null); assert.equal(effectiveTimeThreshold(s),5);
});

for (const station of ['navigator','bombardier']) test(`${station} function respects healthy seated qualification and ignores used status`, () => {
  const s = fresh(); const actual = crew(s,station);
  actual.used = true; actual.cycleSlotConsumed = true;
  assert.equal(specialistOperator(s,station).id, station);
  for (const health of ['injured','dead']) { actual.health = health; assert.equal(specialistOperator(s,station),null); }
  actual.health = 'healthy'; actual.job = 'work'; assert.equal(specialistOperator(s,station),null);
  actual.job = null; actual.displaced = true; assert.equal(specialistOperator(s,station),null);
  actual.displaced = false; s.cells[actual.position[0]] = 'fire'; assert.equal(specialistOperator(s,station),null);
});

test('navigation penalty dynamically changes a pending threshold when the Navigator leaves during the fourth-Time action', () => {
  let s = fresh({ v2NavigatorUnmannedTimePenalty: 1 }); holdTime(s,3);
  s = activate(s,'navigator','Time'); assert.equal(s.pendingProgress,true);
  const r = action(s,'leaveStation');
  assert.equal(effectiveTimeThreshold(r.state),5); assert.equal(r.state.time,4);
  assert.equal(r.state.pendingProgress,false); assert.equal(r.state.mission.position,0);
});

test('navigation default zero adds no time cost even when the specialist is absent', () => {
  const s = fresh(); leaveStation(crew(s,'navigator'));
  assert.equal(s.config.v2NavigatorUnmannedTimePenalty,0); assert.equal(effectiveTimeThreshold(s),4);
});

test('new-sortie validation prevents an unmanned Navigator threshold exceeding the entire physical Time supply', () => {
  assert.throws(() => fresh({ v2MissionTime:4, v2NavigatorUnmannedTimePenalty:1 }), /Navigator Unmanned Time Penalty/);
  assert.doesNotThrow(() => fresh({ v2MissionTime:5, v2NavigatorUnmannedTimePenalty:1 }));
});

test('enemy injury to a manned Navigator dynamically retracts pending Progress until the larger threshold is reached', () => {
  const s=fresh({v2NavigatorUnmannedTimePenalty:1});holdTime(s,4);
  assert.equal(s.pendingProgress,true);
  damageSquare(s,STATIONS.navigator.cells[0],1,()=>{});
  assert.equal(s.pendingProgress,false);assert.equal(effectiveTimeThreshold(s),5);
  assert.equal(s.time,4);
  gainFighterKillTime(s,()=>{},()=>{});
  assert.equal(s.pendingProgress,true);assert.equal(s.time,5);assert.deepEqual(s.overflowTimeTokens,[]);
  assert.equal(physicalTime(s),20);
});

for (const ruleset of ['v1','v2-continuous']) test(`${ruleset}: Critical immediately kills healthy crew; later hits cannot kill the same crew twice`, () => {
  const s = fresh({},ruleset), e = collect();
  resolveAttack(s,e.emit,{ roll:6, cellId:STATIONS.navigator.cells[0] });
  assert.equal(crew(s,'navigator').health,'dead'); assert.equal(s.stats.crewKilled,1);
  resolveAttack(s,e.emit,{ roll:6, cellId:STATIONS.navigator.cells[0] });
  assert.equal(s.stats.crewKilled,1);
  assert.equal(e.events.filter(event => event.type === 'CREW_INJURED').length,1);
  assert.equal(e.events.filter(event => event.type === 'CREW_KILLED').length,1);
});

for (const mode of ['full','draw-only','compressed']) test(`${mode}: nine unavailable slots retain all mission draws and return selection with exact normal enemy-phase counts`, () => {
  let s = fresh({v2UnavailableCrewPressure:mode});
  for (const c of s.crew) if (c.id !== 'pilot') c.health = 'dead';
  s.bags.mission.tokens = Array(80).fill('Resource');
  const r = action(activate(s,'pilot'),'wait');
  assert.equal(r.state.stats.missionDraws,10);
  assert.equal(r.events.filter(e => e.type==='UNAVAILABLE_CREW_SLOT').length,9);
  assert.equal(r.events.filter(e => e.type==='RESOURCE_WASTED').length,9);
  assert.equal(r.events.filter(e => e.type==='ENEMY_PHASE_STARTED').length, mode==='full'?10:mode==='compressed'?2:1);
  assert.equal(r.state.phase,'select'); assert.deepEqual(availableCrew(r.state).map(c=>c.id),['pilot']);
  assert.equal(r.state.config.v2UnavailableCrewPressure,mode);
});

for (const mode of ['full','draw-only','compressed']) test(`${mode}: unavailable Enemy tokens spawn fighters and capped spawns resolve Flak immediately`, () => {
  let s = fresh({v2UnavailableCrewPressure:mode,maxFighters:1,v2Bf109Engagement:40});
  for (const c of s.crew) if (c.id!=='pilot') c.health='dead';
  s = activate(s,'pilot'); s.bags.mission.tokens = Array(9).fill('Enemy'); s.bags.mission.discard=[];
  s.deck={cards:['BF-109'],discard:[]};
  const r=action(s,'wait');
  assert.equal(r.state.stats.fightersSpawned,1); assert.equal(r.state.stats.flakAttacks,8);
  assert.equal(r.events.filter(e=>e.type==='FLAK_STARTED').length,8);
  assert.equal(r.events.filter(e=>e.type==='ENEMY_ATTACK' && e.source.startsWith('Flak')).length,16);
  assert.equal(r.events.filter(e=>e.type==='ENEMY_PHASE_STARTED').length,mode==='full'?10:mode==='compressed'?2:1);
  const spawn=r.events.findIndex(e=>e.type==='FIGHTER_SPAWNED');
  if (mode==='compressed') assert.ok(r.events.findIndex(e=>e.type==='UNAVAILABLE_PRESSURE_COMBINED')>spawn);
});

for (const mode of ['full','draw-only','compressed']) test(`${mode}: automatic Time releases the next available worker and ends its unavailable block`, () => {
  let s=jobState('repair',1); s.config.v2UnavailableCrewPressure=mode;
  for (const c of s.crew) { c.used=true; c.cycleSlotConsumed=true; }
  for (const id of ['pilot','radio']) { crew(s,id).used=false; crew(s,id).cycleSlotConsumed=false; }
  crew(s,'pilot').health='injured'; s.slot=8; s.crewCycle.turn=8;
  s.bags.mission.tokens=['Time']; s.bags.mission.discard=[];
  const r=dispatch(s,{type:'advanceUnavailable'});
  assert.equal(r.state.time,1); assert.equal(r.state.jobs.length,0);
  assert.deepEqual(availableCrew(r.state).map(c=>c.id),['radio']);
  assert.equal(r.events.filter(e=>e.type==='UNAVAILABLE_CREW_SLOT').length,1);
  assert.equal(r.events.filter(e=>e.type==='ENEMY_PHASE_STARTED').length,mode==='draw-only'?0:1);
  assert.equal(r.state.phase,'select');
});

for (const enabled of [false,true]) test(`cycle refresh physical Time option ${enabled?'ON':'OFF'} grants ${enabled?1:0} token exactly once`, () => {
  let s=fresh({v2CrewCycleRefreshGrantsTime:enabled}); const total=physicalTime(s);
  for (let turn=0;turn<10;turn++) s=action(activate(s,availableCrew(s)[0].id),'wait').state;
  assert.equal(s.crewCycle.number,2); assert.equal(s.time,enabled?1:0); assert.equal(physicalTime(s),total);
});

test('cycle refresh at full Time uses overflow and carries the reward after its checkpoint', () => {
  let s=fresh({v2CrewCycleRefreshGrantsTime:true});
  for (let turn=0;turn<9;turn++) s=action(activate(s,availableCrew(s)[0].id),'wait').state;
  holdTime(s,3); s=activate(s,availableCrew(s)[0].id,'Time');
  const total=physicalTime(s),r=action(s,'wait');
  assert.equal(r.state.time,1); assert.equal(r.state.mission.position,1);
  assert.equal(r.events.filter(e=>e.type==='BONUS_TIME_BANKED').length,1);
  assert.equal(physicalTime(r.state),total);
});

test('end reason distinguishes fatal structure from crash and carries authoritative return distance', () => {
  const s=fresh(); s.compromised=['a','b','c','d','e','f']; s.mission.position=10;
  resolveAltitude(s,()=>{});
  assert.equal(sortieResult(s).title,'AIRCRAFT LOST'); assert.match(sortieResult(s).reason,/Structural failure.*6 compromised/);
  assert.equal(sortieResult(s).distance,1);
  const crash=fresh(); crash.altitude=1; crash.engines.forEach(e=>e.running=false); resolveAltitude(crash,()=>{});
  assert.equal(sortieResult(crash).cause,'altitude');
});
