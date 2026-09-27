import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { act, previewAttack, restartState } from '../game.ts';
import { REWARD_DEFINITIONS, activeModifierDescriptions, relicRecoveryPreview } from '../item-definitions.ts';
import { encounterChoices } from '../diagnostics.ts';
import { solve, replayWitness } from '../solver.ts';
import { beginRun, completionReport } from '../completion.ts';
import { parseSave, saveGame, loadCompletedRuns } from '../persistence.ts';
import { baseFixture, addHaunting, addSupply, position } from './fixtures.mjs';
const relic = (s, index, options = {}) => addSupply(s, 'relic', { ...structuredClone(REWARD_DEFINITIONS[index]), ...options });

test('narrow damage rewards change intended thresholds and previews match execution with traits and Oil', () => {
 for (const index of [0, 1]) for (const kind of ['shade', 'revenant', 'wisp', 'armour']) for (const mode of ['strike', 'flare']) for (const empowered of [false, true]) {
  let s = baseFixture(); const x = relic(s, index); s = act(s, {type:'use', supplyId:x.id}).state;
  const h = addHaunting(s, {kind, hp:8, maxHp:8, trait:mode === 'strike' ? 'brittle' : 'smouldering'}); s.resources.empowered = empowered;
  const p = previewAttack(s,h,mode), e = x.effect;
  assert.equal(p.itemDamage, e.mode === mode && e.targets.includes(kind) ? 2 : 0);
  const result=act(s,{type:'attack',hauntingId:h.id,mode}); assert.equal(result.committed,true);
  assert.equal(result.state.hauntings[0].hp,p.enemyAfter); assert.equal(result.state.resources.health,p.finalHealth); assert.equal(result.state.resources.light,p.finalLight);
 }
 const s=baseFixture();const h=addHaunting(s,{hp:8,maxHp:8});assert.equal(encounterChoices(s,h).strikeHits,2);relic(s,0,{used:true});assert.equal(encounterChoices(s,h).strikeHits,1);
});

test('ribbon subtracts after Ward rounding, clamps at zero, and cannot recover lethal exchanges', () => {
 for (const attack of [0,1,2,5,6,7]) for (const ward of [false,true]) {
  const s=baseFixture();relic(s,2,{used:true});const h=addHaunting(s,{attack,hp:6,maxHp:6,xp:3});s.resources.ward=ward;s.resources.health=2;
  const expected=Math.max(0,(ward?Math.ceil(attack/2):attack)-1), p=previewAttack(s,h,'strike'); assert.equal(p.incoming,expected);
  const r=act(s,{type:'attack',hauntingId:h.id,mode:'strike',acceptDeath:true});assert.equal(r.state.resources.health,p.finalHealth);
  if(expected>=2){assert.equal(r.state.status,'dead');assert.equal(r.state.resources.level,1);assert.equal(p.levelsGained,0);}else assert.equal(r.state.resources.level,2);
  assert.equal(previewAttack(s,h,'flare').incomingReduction,0);
 }
});

test('dual recovery previews caps and waste, regenerates other spirits, and undoes exactly', () => {
 let s=baseFixture();s.resources.health=21;s.resources.light=8;const h=addHaunting(s,{hp:10,maxHp:17,regen:2});const x=relic(s,3);const before=structuredClone(s);
 assert.deepEqual(relicRecoveryPreview(s,x),{health:{received:1,wasted:3,total:22},light:{received:2,wasted:2,total:10}});
 assert.equal(completionReport(s).supplies.floor.recovery,1);
 s=act(s,{type:'use',supplyId:x.id}).state;assert.equal(s.resources.health,22);assert.equal(s.resources.light,10);assert.equal(s.hauntings[0].hp,12);assert.equal(activeModifierDescriptions(s).length,0);
 assert.equal(completionReport(s).supplies.floor.recovery,undefined);assert.deepEqual(act(s,{type:'undo'}).state,before);
});

test('saved effect and name snapshots survive content changes, full undo and exact restart', () => {
 for(const index of [0,1,2,3]) {
  let s=baseFixture();const x=relic(s,index);const initial=structuredClone(s);s=act(s,{type:'use',supplyId:x.id}).state;
  const raw=JSON.stringify(s), definition=REWARD_DEFINITIONS[index], old=structuredClone(definition);
  try {definition.name='changed catalogue';definition.effect={kind:'guard',amount:9};const loaded=parseSave(raw);assert.equal(loaded.kind,'loaded');assert.deepEqual(loaded.state,s);assert.deepEqual(restartState(loaded.state),initial);assert.deepEqual(act(loaded.state,{type:'undo'}).state,initial);} finally {Object.assign(definition,old);}
 }
});

test('frozen pre-relic v4 save continues with old names, exact arithmetic, placement and undo', () => {
 const raw=fs.readFileSync(new URL('./v4-continuation.fixture.json',import.meta.url),'utf8');const parsed=parseSave(raw);assert.equal(parsed.kind,'loaded');assert.equal(JSON.stringify(parsed.state),JSON.stringify(JSON.parse(raw)));
 let s=parsed.state;assert.equal(s.version,4);assert.deepEqual(s.supplies.map(x=>x.name),['Ritual primer','Heartwood charm',"Alchemist's case"]);assert.equal(s.resources.health,15);assert.equal(s.resources.light,5);assert.equal(s.hauntings[0].hp,11);
 const p=previewAttack(s,s.hauntings[0],'strike');assert.equal(p.damage,8);assert.equal(p.incoming,4);assert.equal(p.itemDamage,0);assert.equal(p.incomingReduction,0);
 s=act(s,{type:'attack',hauntingId:'h0',mode:'strike'}).state;assert.equal(s.resources.health,11);assert.equal(s.hauntings[0].hp,3);
 const loaded=parseSave(JSON.stringify(s));assert.equal(loaded.kind,'loaded');assert.deepEqual(act(loaded.state,{type:'undo'}).state,parsed.state);
 const restarted=restartState(loaded.state);assert.equal(restarted.turns,0);assert.equal(restarted.resources.health,22);assert.equal(restarted.hauntings[0].hp,17);assert.deepEqual(restarted.supplies,parsed.state.supplies);assert.equal(beginRun(restarted).runId===s.runId,false);
});

test('v4 continuation exactly matches six golden turns produced by the committed pre-change engine', () => {
 const baseline=JSON.parse(fs.readFileSync(new URL('./v4-continuation.expected.json',import.meta.url),'utf8'));
 let s=parseSave(fs.readFileSync(new URL('./v4-continuation.fixture.json',import.meta.url),'utf8')).state;
 for(let i=0;i<baseline.actions.length;i++){const r=act(s,baseline.actions[i]);assert.equal(r.committed,true);assert.deepEqual(r.state,baseline.frames[i]);s=parseSave(JSON.stringify(r.state)).state;}
 for(let i=baseline.actions.length-2;i>=0;i--){s=act(s,{type:'undo'}).state;assert.deepEqual(s,baseline.frames[i]);}
});

test('relic snapshot validation rejects missing or malformed effects without altering the bytes', () => {
 for(const effect of [undefined,{kind:'damage',mode:'strike',targets:['bogus'],amount:2},{kind:'guard',amount:-1},{kind:'recovery',health:1.5,light:4}]) {const s=baseFixture();relic(s,0,{effect});const raw=JSON.stringify(s), p=parseSave(raw);assert.equal(p.kind,'error');assert.equal(p.raw,raw);}
});

test('recovery conservation counts one use and duplicate endings retain one completion record', () => {
 let s=baseFixture();s.runId='relic-ending';s.inventory=['exit-key'];s.player=position(1,1);relic(s,3);s=act(s,{type:'leave'}).state;
 const data=new Map(),store={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 assert.equal(saveGame(s,store).ok,true);assert.equal(saveGame(parseSave(JSON.stringify(s)).state,store).ok,true);
 const records=loadCompletedRuns(store).records;assert.equal(records.length,1);assert.equal(records[0].report.supplies.floor.recovery,1);assert.equal(records[0].report.supplies.total,3);
});

test('solver branches on dual recovery and replays the same combat engine to a win', () => {
 const s=baseFixture();s.resources.health=1;s.resources.light=0;s.resources.tonics=0;s.resources.oils=0;
 addHaunting(s,{hp:6,maxHp:6,attack:5,reward:'exit-key'});relic(s,3);
 const witness=solve(s);assert.equal(witness.solved,true);assert.ok(witness.actions.some(a=>a.type==='use'));assert.equal(replayWitness(s,witness.actions,true).status,'won');
});
