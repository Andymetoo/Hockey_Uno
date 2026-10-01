import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { continuousHudMarkup, activeJobsMarkup, enemyMarkup } from '../views.mjs';

const game=()=>createGame({},'continuous-ui','v2-continuous');

test('V2 HUD independently shows consumed slots, Time pips and outbound or return Progress',()=>{
  const state=game();
  state.crew.slice(0,6).forEach(crew=>crew.cycleSlotConsumed=true);
  state.crewCycle={number:3,turn:5};
  state.time=3;state.mission.position=2;
  const before=structuredClone(state),markup=continuousHudMarkup(state);
  assert.match(markup,/Crew Cycle 3, 6 of 10 slots consumed/);
  assert.match(markup,/Time 3 of 4/);
  assert.match(markup,/OUTBOUND Progress 2 of 8/);
  assert.equal((markup.match(/<i class="filled">/g)??[]).length,3);
  assert.equal((markup.match(/data-status-metric=/g)??[]).length,6);
  assert.match(markup,/Resources 3 Officer and 5 Enlisted/);
  assert.match(markup,/Opportunity 1 of 3/);
  assert.deepEqual(state,before,'HUD cannot advance a clock');
  state.mission.bombed=true;state.mission.position=9;
  assert.match(continuousHudMarkup(state),/RETURN Progress 1 of 3/);
  state.pendingProgress=true;state.time=4;
  assert.match(continuousHudMarkup(state),/Progress checkpoint after this Turn/);
});

test('active job cards expose both workers and the independently stored remaining Time',()=>{
  const state=game();
  state.jobs=[{id:'assisted',kind:'repair',crewId:'engineer',assistantId:'radio',remainingTime:2,cells:['A3-1']}];
  const markup=activeJobsMarkup(state,{jobCountdown:{jobId:'assisted',remainingTime:2}});
  assert.match(markup,/REPAIR — <span>2 TIME REMAINING/);
  assert.match(markup,/Engineer \+ Radio Operator/);
  assert.match(markup,/data-job-id="assisted"/);
  assert.match(markup,/counting-down/);
  assert.doesNotMatch(markup,/Round|completeRound/);
  assert.equal(activeJobsMarkup(createGame()),'');
});

test('large experimental Time thresholds retain a compact meter and exact count',()=>{
  const state=game();state.config.v2TimePerProgress=40;state.time=23;
  const markup=continuousHudMarkup(state);
  assert.match(markup,/Time 23 of 40/);
  assert.match(markup,/<progress class="hud-time-progress"[^>]+max="40" value="23"/);
  assert.doesNotMatch(markup,/<i class="filled">/);
});

test('natural break-off queue state remains distinct from destroyed and disrupted',()=>{
  const state=game();
  state.fighters=[{id:'breakoff',type:'BF-109',hp:2,maxHp:2,quadrant:'Fore',altitude:'High',facing:180,engagementRemaining:0,disrupted:false}];
  const markup=enemyMarkup(state,{visual:{departingFighter:'breakoff',activeFighterId:'breakoff'}});
  assert.match(markup,/fighter-card[^\"]*departing/);
  assert.match(markup,/ENG 0/);
  assert.match(markup,/BREAKING OFF/);
  assert.doesNotMatch(markup,/DISRUPTED|DESTROYED/);
});
