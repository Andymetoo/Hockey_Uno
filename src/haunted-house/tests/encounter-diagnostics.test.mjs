import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEncounter } from '../encounter-diagnostics.ts';
import { act, previewAttack } from '../game.ts';
import { REWARD_DEFINITIONS } from '../item-definitions.ts';
import { baseFixture, addHaunting, addSupply } from './fixtures.mjs';

function replay(s, id, plan) {
 let health=0,light=0;
 for(const a of plan.actions){const h=s.hauntings.find(h=>h.id===id),p=a.type==='attack'?previewAttack(s,h,a.mode):undefined;const r=act(s,a);assert.equal(r.committed,true);assert.notEqual(r.state.status,'dead');health+=p?.incoming??0;light+=p?.lightCost??(a.type==='ward'?s.resources.light-r.state.resources.light:0);s=r.state;}
 assert.equal(s.hauntings.find(h=>h.id===id).hp,0);assert.equal(plan.healthSpent,health);assert.equal(plan.lightSpent,light);assert.equal(plan.finalHealth,s.resources.health);assert.equal(plan.finalLight,s.resources.light);return s;
}
test('offline plans replay exactly with saved relics, traits, preparations and level recovery',()=>{
 for(const index of [0,1,2])for(const kind of ['shade','armour']){
  const s=baseFixture();s.resources.ward=true;s.resources.empowered=true;s.resources.health=9;
  addSupply(s,'relic',{...structuredClone(REWARD_DEFINITIONS[index]),used:true});const h=addHaunting(s,{kind,trait:'brittle',hp:14,maxHp:20,regen:3,xp:3});
  const original=structuredClone(s),r=evaluateEncounter(s,h.id);assert.equal(r.affordable,true);const final=replay(s,h.id,r.bestPlan);assert.equal(r.bestPlan.levelsGained,final.resources.level-s.resources.level);assert.deepEqual(s,original);
 }
});
test('pocket tonic can make a fight possible and its turn regenerates the wounded target',()=>{
 const s=baseFixture();s.resources.health=2;s.resources.light=0;s.resources.oils=0;const h=addHaunting(s,{hp:4,maxHp:12,attack:3,regen:3,xp:1});
 const r=evaluateEncounter(s,h.id);assert.equal(r.affordable,true);assert.equal(r.bestPlan.tonicsUsed,1);assert.equal(r.bestPlan.actions[0].type,'tonic');assert.equal(r.bestPlan.actions.filter(a=>a.type==='attack').length,2);replay(s,h.id,r.bestPlan);
});
test('lethal leveling kill cannot be financed with its future refund or implicit floor supplies',()=>{
 const s=baseFixture();s.resources.health=2;s.resources.light=0;s.resources.oils=0;s.resources.tonics=0;
 const h=addHaunting(s,{hp:1,maxHp:1,attack:4,xp:10});addSupply(s,'food');
 assert.equal(evaluateEncounter(s,h.id).affordable,false);s.resources.light=4;
 const r=evaluateEncounter(s,h.id);assert.equal(r.affordable,true);assert.equal(r.bestPlan.actions[0].mode,'flare');assert.equal(r.bestPlan.lightSpent,4);assert.ok(r.bestPlan.finalLight>0);replay(s,h.id,r.bestPlan);
});
test('hidden target requires explicit caller reveal and action cap bounds huge encounters',()=>{
 const s=baseFixture();const h=addHaunting(s);s.rooms[0].discovered[h.position.y*s.rooms[0].width+h.position.x]=false;
 assert.equal(evaluateEncounter(s,h.id).affordable,false);s.rooms[0].discovered.fill(true);h.hp=h.maxHp=100000;h.attack=0;s.resources.power=1;
 assert.equal(evaluateEncounter(s,h.id).affordable,false);
});
