import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { dispatch, availableActions } from '../rules.mjs';
import { compactCrewFlow, crewFlowState, actionPalette, compactCost, nearbyTargets, STATION_PALETTE } from '../crew-flow.mjs';
import { beginTargeting, selectTarget, canConfirm, targetingCommand } from '../targeting.mjs';
import { fighter } from './fixtures.mjs';
const fresh=(config={})=>createGame({v2StoryMode:false,v2MissionEnemy:0,v2MissionResource:100,...config},'compact-flow','v2-continuous');
test('compact gate defaults ON for new V2, preserves OFF, absent and V1 legacy',()=>{
  assert.equal(compactCrewFlow(fresh()),true);assert.equal(compactCrewFlow(fresh({v2CompactCrewFlow:false})),false);
  const old=fresh();delete old.config.v2CompactCrewFlow;assert.equal(compactCrewFlow(old),false);assert.equal(compactCrewFlow(createGame()),false);
});
test('derived interaction states prioritize presentation and Story over tentative input',()=>{
  const view=fresh(),q={view,busy:false};assert.equal(crewFlowState(q,null,null),'selection');
  view.phase='action';assert.equal(crewFlowState(q,null,null),'ready');assert.equal(crewFlowState(q,null,{}),'choosing');assert.equal(crewFlowState(q,{},null),'targeting');
  q.busy=true;assert.equal(crewFlowState(q,{},{}),'resolving');q.current={type:'CREW_ACTIVATED'};assert.equal(crewFlowState(q,null,null),'activating');q.busy=false;view.phase='story';assert.equal(crewFlowState(q,{},{}),'story');
});
test('palette retains engine reasons/costs and all action families, grouping only station destinations',()=>{
  for(const c of fresh().crew){const s=fresh(),actions=availableActions(s,c.id),p=actionPalette(actions);
    for(const a of actions.filter(a=>!STATION_PALETTE.includes(a.id)))assert.deepEqual(p.find(x=>x.id===a.id),a);
    assert.ok(p.some(a=>a.id==='stations'));assert.ok(p.some(a=>a.id==='medical'&&!a.enabled&&a.reason));assert.ok(!p.some(a=>a.id==='intercept'));
  }
  assert.equal(compactCost('1 Enlisted'),'1E');assert.equal(compactCost('2 Officer'),'2O');assert.equal(compactCost(),'FREE');
});
test('compact and legacy execute identical commands, RNG, draws and cycle accounting',()=>{
  let on=fresh(),off=structuredClone(on);off.config.v2CompactCrewFlow=false;
  for(const cmd of [{type:'activate',crewId:'radio'},{type:'action',action:'wait'}]){on=dispatch(on,cmd).state;off=dispatch(off,cmd).state;}
  off.config.v2CompactCrewFlow=true;assert.deepEqual(on,off);assert.equal(on.stats.missionDraws,1);assert.equal(on.crewCycle.turn,1);
});
test('target selection is pure; Direct Fire requires a confirmable complete command',()=>{
  let s=fresh();s.fighters=[fighter('one',{engagementRemaining:5})];s=dispatch(s,{type:'activate',crewId:'pilot'}).state;
  const before=structuredClone(s);let t=beginTargeting('directFire','pilot');t=selectTarget(s,t,'crew','engineer');assert.equal(canConfirm(s,t),false);t=selectTarget(s,t,'fighter','one');assert.equal(canConfirm(s,t),true);assert.deepEqual(s,before);
  assert.deepEqual(targetingCommand(t),{type:'action',action:'directFire',targetId:'one',gunnerId:'engineer'});
});
test('screen-space overlap chooser includes nearby valid hit areas without selecting',()=>{
  const rects=[{id:'a',x:0,y:0,width:44,height:44},{id:'b',x:30,y:0,width:44,height:44},{id:'c',x:200,y:0,width:44,height:44}];
  assert.deepEqual(nearbyTargets(rects,'a',22,22),['a','b']);assert.deepEqual(nearbyTargets(rects,'c',222,22),['c']);
});
test('removed Intercept rejects for both rulesets; capped Enemy still generates exactly two Flak rolls',()=>{
  for(const ruleset of ['v1','v2-continuous']){let s=createGame({v2StoryMode:false},'overflow-retained',ruleset);if(ruleset==='v1')s=dispatch(s,{type:'startRound'}).state;
    s.bags.mission={tokens:['Enemy'],discard:[]};s.fighters=Array.from({length:s.config.maxFighters},(_,i)=>fighter('f'+i,{engagementRemaining:5}));
    const before=structuredClone(s);assert.throws(()=>dispatch(s,{type:'activate',crewId:'radio',intercept:true}),/removed/);assert.deepEqual(s,before);
    const result=dispatch(s,{type:'activate',crewId:'radio'});assert.equal(result.events.filter(e=>e.type==='FLAK_STARTED').length,1);assert.equal(result.events.filter(e=>e.type==='ENEMY_ATTACK_ROLL').length,2);assert.ok(!result.events.some(e=>e.type==='FIGHTER_SPAWNED'));
  }
});
