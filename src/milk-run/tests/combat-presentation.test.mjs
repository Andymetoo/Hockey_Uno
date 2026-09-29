import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceVisual, describeEvent, groupEvents } from '../presentation.mjs';
import { eventMarkup } from '../views.mjs';

test('Opportunity spending clears the prior mission draw before its independent Basic pull', () => {
  const visual=advanceVisual({token:{bag:'mission',value:'Resource'},focusCell:'B2-4'},
    {type:'OPPORTUNITY_SPENT',crewId:'engineer',fighterId:'f1',message:'Spend 1 Opportunity.'});
  assert.equal(visual.token,null);
  assert.equal(visual.focusCell,null);
  assert.equal(visual.activeFighterId,'f1');
  assert.equal(visual.shooterId,'engineer');
  assert.doesNotMatch(eventMarkup({type:'OPPORTUNITY_SPENT'},visual).stage,/draw-token/);
});

test('a cancelled attack has its own major beat without implying a die or a hit location', () => {
  const event={type:'ATTACK_DISRUPTED',fighterId:'f1',message:'BF-109 attack cancelled; flyby follows.'};
  const visual=advanceVisual({token:{value:'Burst'},focusCell:'C2-2',locationCell:'C2-2',attackMissFighter:'old'},event);
  const descriptor=describeEvent(event),html=eventMarkup(event,visual).stage;
  assert.equal(descriptor.title,'ATTACK DISRUPTED');assert.equal(descriptor.major,true);
  assert.equal(visual.activeFighterId,'f1');assert.equal(visual.attackResult,'disrupted');
  assert.equal(visual.focusCell,null);assert.equal(visual.locationCell,null);assert.equal(visual.attackMissFighter,null);
  assert.doesNotMatch(html,/die-face|draw-token|location-readout/);
});

test('Burst reveals its two damage value and new economy actions retain separate recorder groups', () => {
  assert.match(eventMarkup({type:'GUNNER_SHOT_ROLL',token:'Burst'}).stage,/BURST ×2/);
  const events=['CREW_ACTION','OPPORTUNITY_SPENT','GUNNER_FIRE_STARTED','GUNNER_SHOT_ROLL','ATTACK_DISRUPTED','FIGHTER_MOVED']
    .map((type,index)=>({type,sequence:index+1,round:1,message:type,...(type==='GUNNER_SHOT_ROLL'?{token:'Burst'}:{})}));
  const groups=groupEvents(events);
  assert.deepEqual(groups.flatMap(g=>g.events),events);
  assert.ok(groups.some(g=>g.events[0].type==='OPPORTUNITY_SPENT'));
  assert.ok(groups.some(g=>g.events[0].type==='ATTACK_DISRUPTED'));
});
