import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { dispatch } from '../rules.mjs';
import { crewStatus } from '../ui-model.mjs';
import { crewMarkup, enemyMarkup, eventMarkup, logMarkup } from '../views.mjs';
import { assistantOptions, beginTargeting, selectTarget, canConfirm, targetingCommand } from '../targeting.mjs';
import { describeEvent, eventDelay } from '../presentation.mjs';
import { ResolutionQueue } from '../queue.mjs';
import { loadSession, saveSession } from '../persistence.mjs';

const v2 = () => createGame({ presentationSpeed: 'manual' }, 'v2-presentation', 'v2-continuous');
const fighter = { id: 'test-fighter', type: 'BF-109', hp: 2, maxHp: 2, quadrant: 'Fore', altitude: 'High', facing: 0, engagementRemaining: 3 };
const storage = () => { const values = new Map();return { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value) }; };

test('V2 crew display keeps availability, Cycle slot and job Time distinct', () => {
  const state = v2();
  state.jobs.push({ id: 'repair', kind: 'repair', crewId: 'engineer', assistantId: 'radio', remainingTime: 3, cells: ['A3-1'] });
  for (const id of ['engineer', 'radio']) state.crew.find(crew => crew.id === id).job = 'repair';
  state.crew.find(crew => crew.id === 'radio').cycleSlotConsumed = true;
  const tail = state.crew.find(crew => crew.id === 'tail');
  tail.cycleSlotConsumed = true;
  tail.used = false;
  assert.equal(crewStatus(state,tail).label,'Cycle slot consumed');
  const markup = crewMarkup(state,null);
  assert.match(markup,/3 Time remaining · assisted/);
  assert.match(markup,/SLOT OPEN/);
  assert.match(markup,/SLOT USED/);
  assert.doesNotMatch(markup,/Until Round|Rundefined/);
});

test('V2 queue shows individual Engagement and Progress escort expiry; V1 retains its labels', () => {
  const state = v2();
  state.fighters.push({...fighter});
  state.escorts.push({id:'escort',quadrant:'Fore'});
  const markup = enemyMarkup(state);
  assert.match(markup,/ENGAGEMENT 3/);
  assert.match(markup,/3 Engagement remaining/);
  assert.match(markup,/until next Progress checkpoint/);
  assert.doesNotMatch(markup,/round end/);
  const classic = createGame();
  classic.fighters.push({...fighter});
  classic.escorts.push({id:'escort',quadrant:'Fore'});
  classic.jobs.push({id:'work',kind:'repair',crewId:'engineer',completeRound:3,cells:['A3-1']});
  classic.crew.find(crew=>crew.id==='engineer').job='work';
  assert.match(enemyMarkup(classic),/until round end/);
  assert.doesNotMatch(enemyMarkup(classic),/ENGAGEMENT/);
  assert.match(crewMarkup(classic,null),/Until Round 3 start/);
});

test('optional Assist selects available workers even after their slot and preserves a pure targeting preview', () => {
  const state = v2();
  state.cells['A3-1']='damaged';
  state.crew.find(crew=>crew.id==='tail').cycleSlotConsumed=true;
  state.crew.find(crew=>crew.id==='pilot').health='dead';
  state.crew.find(crew=>crew.id==='radio').job='other-work';
  state.jobs.push({id:'care',kind:'medical',crewId:'radio',targetId:'copilot',remainingTime:5});
  const before=structuredClone(state);
  let interaction=selectTarget(state,beginTargeting('repair','engineer'),'cell','A3-1');
  interaction=selectTarget(state,{...interaction,stage:'work'},'cell','C3-2');
  const candidates=assistantOptions(state,interaction).map(crew=>crew.id);
  assert.ok(candidates.includes('tail'),'a consumed slot does not prevent assistance');
  for(const id of ['engineer','pilot','radio','copilot'])assert.ok(!candidates.includes(id));
  interaction={...interaction,assistantId:'tail'};
  assert.equal(canConfirm(state,interaction),true);
  assert.deepEqual(targetingCommand(interaction),{type:'action',action:'repair',cells:['A3-1'],workCellId:'C3-2',assistantId:'tail'});
  assert.equal(canConfirm(state,{...interaction,assistantId:'pilot'}),false);
  assert.deepEqual(state,before);
  assert.deepEqual(assistantOptions(createGame(),interaction),[],'V1 has no new Assist selection');
});

for (const emergency of [false,true]) test(`V2 Time ${emergency?'emergency refill':'normal draw'} stays hidden through a saved face-down beat`, () => {
  const state=v2(), store=storage();
  state.bags.mission=emergency?{tokens:[],discard:['Time']}:{tokens:['Time'],discard:[]};
  state.time=3;
  state.timeTokens=['Time','Time','Time'];
  const before=structuredClone(state);
  const queue=new ResolutionQueue({state,dispatch});
  let resumed;
  try{
    queue.send({type:'activate',crewId:'pilot'});
    while(queue.current.type!=='MISSION_TOKEN_DRAWING')queue.step();
    assert.deepEqual(queue.view.bags.mission,before.bags.mission);
    assert.equal(queue.view.time,3);
    assert.equal(queue.view.pendingProgress,false);
    assert.equal(queue.visual.token.value,null);
    assert.equal(saveSession(queue.export(),store),true);
    resumed=new ResolutionQueue({state,dispatch,saved:loadSession(store)});
    assert.deepEqual(resumed.view.bags.mission,before.bags.mission);
    resumed.step();
    assert.equal(resumed.current.type,'MISSION_TOKEN_DRAWN');
    assert.equal(resumed.visual.token.value,'Time');
    assert.match(eventMarkup(resumed.current,resumed.visual).stage,/data-token="Time"/);
    resumed.flush();
    assert.equal(resumed.view.time,4);
    assert.equal(resumed.view.pendingProgress,true);
    assert.equal(resumed.view.phase,'action');
    assert.equal(resumed.view.mission.position,0);
    assert.doesNotMatch(eventMarkup(resumed.log[0]).detail,/ROUND|TURN 0/);
    assert.match(logMarkup(resumed.log),/C1 T1/);
  }finally{queue.dispose();resumed?.dispose();}
});

test('readiness refresh is quiet, pending Progress stays clear, and semantic global Turn survives queue metadata', () => {
  assert.equal(eventDelay({type:'CREW_CYCLE_REFRESHED'},'manual'),0);
  assert.equal(describeEvent({type:'MISSION_TOKEN_DRAWN',token:'Time'}).title,'TIME');
  assert.equal(describeEvent({type:'MISSION_TOKEN_DRAWN',token:'Time'}).tone,'time');
  assert.equal(describeEvent({type:'PROGRESS_PENDING'}).title,'PROGRESS CHECKPOINT AFTER THIS TURN');
  const state=v2();state.crewCycle={number:2,turn:1};state.stats.turns=11;
  const queue=new ResolutionQueue({state,dispatch:()=>({state,events:[{type:'TURN_COMPLETE',turn:11,state}]})});
  try{queue.send({});assert.equal(queue.log[0].turn,11);assert.equal(queue.log[0].cycleTurn,1);assert.equal(queue.log[0].crewCycle,2);assert.equal(queue.log[0].round,undefined);}finally{queue.dispose();}
});
