import test from 'node:test';
import assert from 'node:assert/strict';
import { boardMarkup, crewPositions, fighterPositions } from '../board-view.mjs';
import { createGame } from '../state.mjs';
import { fighter } from './fixtures.mjs';
import { STATIONS } from '../board.mjs';

const fresh=()=>createGame({v2StoryMode:false},'board-polish','v2-continuous');

test('fighter movement preserves its final geometry and respects Fast, Manual, instant and reduced motion',()=>{
  const state=fresh();state.fighters=[fighter('moving',{engagementRemaining:4})];
  const previousFighters=fighterPositions(state);state.fighters[0].quadrant='Port';
  const before=structuredClone(state),current={type:'FIGHTER_MOVED',fighterId:'moving',beat:2};
  const normal=boardMarkup(state,{current,previousFighters});
  const fast=boardMarkup(state,{current,previousFighters,presentationSpeed:'fast'});
  const manual=boardMarkup(state,{current,previousFighters,presentationSpeed:'manual'});
  assert.match(normal,/<animateTransform[^>]+dur="360ms"/);
  assert.match(fast,/<animateTransform[^>]+dur="120ms"/);
  assert.match(manual,/<animateTransform[^>]+dur="360ms"/);
  for(const options of [{reducedMotion:true},{presentationSpeed:'instant'},{animate:false}]) {
    const markup=boardMarkup(state,{current,previousFighters,...options});
    assert.doesNotMatch(markup,/<animateTransform/);
    assert.match(markup,/Port High/);
  }
  assert.deepEqual(state,before);
});

test('crew movement is derived from changed physical footprints and never invented on reload',()=>{
  const state=fresh(),previousCrew=crewPositions(state),crew=state.crew.find(c=>c.id==='engineer');
  crew.position=['D3-1'];crew.station=null;crew.displaced=true;
  const before=structuredClone(state),current={type:'CREW_RELOCATED',crewId:'engineer',cellId:'D3-1'};
  const moving=boardMarkup(state,{current,previousCrew});
  assert.match(moving,/crew-move-trail/);
  assert.match(moving,/<animateTransform[^>]+type="translate"/);
  assert.doesNotMatch(boardMarkup(state,{current}),/crew-move-trail|animateTransform/);
  assert.doesNotMatch(boardMarkup(state,{current,previousCrew,reducedMotion:true}),/crew-move-trail|animateTransform/);
  assert.deepEqual(state,before);
});

test('a substitute remains the operator while the injured original remains an inspectable occupant',()=>{
  const state=fresh(),pilot=state.crew.find(c=>c.id==='pilot'),navigator=state.crew.find(c=>c.id==='navigator');
  pilot.health='injured';pilot.station=null;pilot.displaced=true;
  navigator.station='pilot';navigator.position=[...STATIONS.pilot.cells];
  const before=structuredClone(state),markup=boardMarkup(state);
  assert.match(markup,/data-crew-id="navigator" data-footprint="[^"]+" data-operator="true"/);
  assert.match(markup,/data-crew-id="pilot" data-footprint="[^"]+" data-operator="false"/);
  assert.match(markup,/Pilot, Injured[^<]+Physical occupant/);
  assert.equal((markup.match(/data-crew-id=/g)||[]).length,10);
  assert.deepEqual(state,before);
});

test('combat result cues preserve the actual token and are readable without motion',()=>{
  const state=fresh();state.fighters=[fighter('contact',{engagementRemaining:4})];
  const before=structuredClone(state);
  for(const token of ['Hit','Burst','Miss']) {
    const markup=boardMarkup(state,{current:{type:'GUNNER_SHOT_ROLL',crewId:'engineer',fighterId:'contact',token},visual:{shooterId:'engineer'},reducedMotion:true});
    assert.match(markup,new RegExp(`class="shot-result result-${token.toLowerCase()}"`));
    assert.match(markup,new RegExp(`>${token.toUpperCase()}</text>`));
    assert.match(markup,/combat-tracer/);
    assert.doesNotMatch(markup,/<animateTransform/);
  }
  assert.deepEqual(state,before);
  const escortDamage=boardMarkup(state,{current:{type:'FIGHTER_DAMAGED',fighterId:'contact',amount:1},visual:{shooterId:'engineer',escortId:'escort'}});
  assert.doesNotMatch(escortDamage,/combat-tracer/,'an old shooter identity must not attribute Escort damage to a gunner');
});

test('destroyed and disengaged contact stamps never retain a selectable removed fighter',()=>{
  const state=fresh();state.fighters=[fighter('gone',{engagementRemaining:1})];
  const previousFighters=fighterPositions(state);state.fighters=[];
  for(const [type,label] of [['FIGHTER_DESTROYED','DESTROYED'],['FIGHTER_DISENGAGED','BREAKS OFF']]) {
    const markup=boardMarkup(state,{current:{type,fighterId:'gone'},previousFighters});
    assert.match(markup,new RegExp(`>${label}</text>`));
    assert.doesNotMatch(markup,/data-fighter="gone"/);
  }
});

test('suppressed Fire and stopped engines have explicit inspectable state without changing damage',()=>{
  const state=fresh();state.cells['A3-1']='fire';state.engines[0].running=false;
  state.jobs.push({id:'suppression',kind:'fireControl',crewId:'radio',cells:['A3-1']});
  const before=structuredClone(state),markup=boardMarkup(state);
  assert.match(markup,/data-cell="A3-1"[^>]+data-suppressed="true"/);
  assert.match(markup,/Fire suppressed by active Fire Control/);
  assert.match(markup,/stopped indicator only; no aircraft structure/);
  assert.deepEqual(state,before);
});
