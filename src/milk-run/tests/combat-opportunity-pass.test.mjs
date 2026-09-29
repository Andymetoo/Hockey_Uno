import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, opportunityAvailability, gunArcLegal, postAttackPosition } from '../rules.mjs';
import { beginTargeting, targetOptions, selectTarget, canConfirm, targetingCommand } from '../targeting.mjs';
import { fresh, activated, fighter, collect } from './fixtures.mjs';

const member = (s,id) => s.crew.find(c=>c.id===id);
const action = (s,id,extra={}) => dispatch(s,{type:'action',action:id,...extra});

test('both nose guns can target Fore / Low and reject Low outside Fore', () => {
  const s=fresh(); s.fighters=[fighter('nose-low',{quadrant:'Fore',altitude:'Low'}),fighter('side-low',{quadrant:'Port',altitude:'Low'})];
  for(const id of ['navigator','bombardier']) { assert.equal(gunArcLegal(s,id,'nose-low'),true); assert.equal(gunArcLegal(s,id,'side-low'),false); }
});

test('authoritative arcs: Radio Aft High/Level, Top High/Level all quadrants, Ball Level/Low all quadrants', () => {
  const s=fresh(); s.fighters=[fighter('target')];
  for(const quadrant of ['Fore','Port','Starboard','Aft']) for(const altitude of ['High','Level','Low']) {
    Object.assign(s.fighters[0],{quadrant,altitude});
    assert.equal(gunArcLegal(s,'radio','target'),quadrant==='Aft'&&['High','Level'].includes(altitude));
    assert.equal(gunArcLegal(s,'engineer','target'),['High','Level'].includes(altitude));
    assert.equal(gunArcLegal(s,'ball','target'),['Level','Low'].includes(altitude));
  }
});

test('Disrupted fighter facing in skips attack, announces ATTACK DISRUPTED, flies by, and clears', () => {
  const s=activated('pilot'); s.fighters=[fighter('in',{disrupted:true,facing:0})];
  const result=action(s,'wait');
  assert.equal(result.state.stats.enemyAttacks,0); assert.equal(result.state.fighters[0].disrupted,false);
  assert.ok(result.events.some(e=>e.type==='ATTACK_DISRUPTED'&&e.message.includes('ATTACK DISRUPTED')));
  assert.ok(result.events.some(e=>e.type==='FIGHTER_MOVED'));
});

test('Disrupted fighter facing away rotates normally and clears Disrupt on that enemy action', () => {
  const s=activated('pilot'); s.fighters=[fighter('away',{disrupted:true,facing:90})];
  const result=action(s,'wait');
  assert.equal(result.state.fighters[0].facing,0); assert.equal(result.state.fighters[0].disrupted,false);
  assert.equal(result.state.stats.enemyAttacks,0);
  assert.ok(result.events.some(e=>e.type==='FIGHTER_ROTATED'));
  assert.ok(result.events.some(e=>e.type==='DISRUPT_CLEARED'));
});

test('Escort damage does not apply Disrupt and an Escort kill grants no Opportunity', () => {
  const s=fresh(); s.fighters=[fighter('escort',{hp:1,disrupted:false})]; s.escorts=[{id:'e',quadrant:'Port',round:1}];
  const {emit}=collect(); postAttackPosition(s,'escort',emit,{quadrant:'Port',altitude:'High'});
  assert.equal(s.fighters.length,0); assert.equal(s.opportunity,1); assert.equal(s.stats.opportunityGained,0);
});

test('Opportunity reasons identify no enemies, no completed shooter and no in-arc fighter', () => {
  let s=activated('pilot'); s.phase='select'; assert.match(opportunityAvailability(s).reason,/no active fighters/i);
  s.fighters=[fighter('x')]; assert.match(opportunityAvailability(s).reason,/completed their normal activation/i);
  Object.assign(member(s,'engineer'),{used:true,activationCompleted:true}); s.fighters=[fighter('x',{quadrant:'Port',altitude:'Low'})];
  assert.match(opportunityAvailability(s).reason,/inside any completed gunner/i);
  assert.equal(opportunityAvailability(s).enabled,false);
});

test('a banked Opportunity with no legal shot is explained before the automatic enemy phase', () => {
  const s=activated('engineer');s.opportunity=1;
  const result=action(s,'wait');
  const unavailable=result.events.find(e=>e.type==='OPPORTUNITY_UNAVAILABLE');
  assert.match(unavailable.message,/No active fighters/i);
  assert.equal(result.events.filter(e=>e.type==='ENEMY_PHASE_STARTED').length,1);
});

test('Opportunity cannot be spent before confirmed legal shooter and target; canceling targeting is free', () => {
  let s=activated('pilot'); s.phase='select'; s.fighters=[fighter('x')]; Object.assign(member(s,'engineer'),{used:true,activationCompleted:true});
  const noTarget={...s,fighters:[fighter('outside',{quadrant:'Port',altitude:'Low'})]};
  assert.throws(()=>dispatch(noTarget,{type:'opportunityShot',gunnerId:'engineer',targetId:'outside'}));
  assert.equal(noTarget.opportunity,s.opportunity);
  const targeting=beginTargeting('opportunityShot',null);
  assert.deepEqual(targetOptions(noTarget,targeting).crew,[]);
  assert.equal(canConfirm(noTarget,targeting),false);
  const selectedGunner=selectTarget(s,targeting,'crew','engineer');
  const selected=selectTarget(s,selectedGunner,'fighter','x');
  assert.equal(canConfirm(s,selected),true);
  const cmd=targetingCommand(selected); assert.equal(cmd.type,'opportunityShot');
  assert.equal(s.opportunity,1,'selection is a pure preview and cancel has no state command');
});

test('banked Opportunity can be used between completed activations without consuming next activation or enemy phase', () => {
  let s=activated('engineer'); s.fighters=[fighter('banked',{facing:90})];
  s=action(s,'wait').state;
  if(s.phase==='opportunity') s=dispatch(s,{type:'continueEnemyPhase'}).state;
  assert.equal(s.phase,'select');
  // The fighter has only rotated toward the bomber; Engineer remains a completed operator.
  if(!s.fighters.length) s.fighters=[fighter('banked')];
  const before={slot:s.slot,draws:s.stats.missionDraws,attacks:s.stats.enemyAttacks};
  const shot=dispatch(s,{type:'opportunityShot',gunnerId:'engineer',targetId:s.fighters[0].id});
  assert.equal(shot.state.phase,'select'); assert.equal(shot.state.opportunity,s.opportunity-1);
  assert.deepEqual({slot:shot.state.slot,draws:shot.state.stats.missionDraws,attacks:shot.state.stats.enemyAttacks},before);
});

test('Pilot Direct Fire uses another untapped gun immediately without tapping it or changing Opportunity', () => {
  let s=activated('pilot'); s.fighters=[fighter('low',{quadrant:'Fore',altitude:'Low',hp:3,maxHp:3})]; s.bags.combat={tokens:['Hit'],discard:[]};
  const before=member(s,'navigator'); const op=s.opportunity;
  const result=action(s,'directFire',{gunnerId:'navigator',targetId:'low'});
  assert.equal(result.state.fighters[0].hp,2); assert.equal(result.state.opportunity,op);
  assert.equal(result.state.stats.opportunityGained,0); assert.equal(result.state.stats.missionDraws,s.stats.missionDraws);
  assert.equal(member(result.state,'navigator').used,before.used);
  assert.equal(member(result.state,'navigator').activationCompleted,before.activationCompleted);
  assert.equal(result.events.filter(e=>e.type==='GUNNER_SHOT_ROLL').length,1);
});

test('B-17 gunfire kill grants Opportunity, including Pilot Direct Fire; Escort does not', () => {
  let s=activated('pilot'); s.fighters=[fighter('kill',{hp:1,maxHp:1})]; s.bags.combat={tokens:['Hit'],discard:[]};
  let result=action(s,'directFire',{gunnerId:'engineer',targetId:'kill'});
  assert.equal(result.state.opportunity,s.opportunity+1); assert.equal(result.state.stats.opportunityGained,1);
  s=fresh(); s.fighters=[fighter('escort-kill',{hp:1,maxHp:1})]; s.escorts=[{id:'e',quadrant:'Port',round:1}];
  postAttackPosition(s,'escort-kill',()=>{},{quadrant:'Port',altitude:'High'});
  assert.equal(s.opportunity,1); assert.equal(s.stats.opportunityGained,0);
});
