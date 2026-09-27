import test from 'node:test';
import assert from 'node:assert/strict';
import { act, exitReadiness, objectiveReady } from '../game.ts';
import { completionReport } from '../completion.ts';
import { parseSave, saveGame, loadGame, loadCompletedRuns } from '../persistence.ts';
import { solve, replayWitness } from '../solver.ts';
import { baseFixture, addHaunting, addSupply, addConnection, position, markTile } from './fixtures.mjs';

function diaryExit() {
 const s=baseFixture();s.runId='diary-exit-regression';s.objective={kind:'diary',title:'The missing diary',description:'Recover the diary and bring it outside.',completed:false};
 s.inventory=['diary'];s.player={...s.entrance};
 addHaunting(s,{kind:'wisp',name:'Living wisp',position:position(2,1)});
 addConnection(s,{opened:false,gate:'moth-key'});
 addSupply(s,'treasure',{position:position(3,3,'study'),amount:3});
 addSupply(s,'food',{position:position(4,3,'study')});
 return s;
}

test('diary at entrance leaves with a living wisp and unexplored, unused optional content',()=>{
 const s=diaryExit();const before=structuredClone(s);
 assert.deepEqual(exitReadiness(s),{prerequisitesMet:true,atExit:true,canLeave:true,actionLabel:'Leave with diary',missingRequirement:null});
 assert.equal(objectiveReady(s),true);assert.deepEqual(s,before);
 const r=act(s,{type:'leave'});assert.equal(r.committed,true);assert.equal(r.state.status,'won');assert.equal(r.state.turns,1);
 assert.equal(r.state.hauntings[0].hp,s.hauntings[0].hp);assert.equal(r.state.supplies.every(x=>!x.used),true);assert.equal(r.state.connections[0].opened,false);
 const report=completionReport(r.state);assert.equal(report.objective.completed,true);assert.equal(report.hauntings.defeated,0);assert.equal(report.treasure.collected,0);assert.ok(report.exploration.discovered<report.exploration.total);
});

test('all objective kinds require their exact item or memorial completion, then only entrance position',()=>{
 for(const kind of ['escape','diary','keepsake']){
  let s=baseFixture();s.objective.kind=kind;s.player={...s.entrance};
  if(kind==='keepsake'){s.objective.altar=position(3,2);markTile(s,s.objective.altar,{kind:'altar'});}
  s.inventory=[kind==='escape'?'diary':'exit-key'];
  assert.equal(exitReadiness(s).prerequisitesMet,false);assert.equal(act(s,{type:'leave'}).committed,false);
  s.inventory=[kind==='escape'?'exit-key':kind==='diary'?'diary':'keepsake'];
  if(kind==='keepsake'){
   assert.equal(exitReadiness(s).canLeave,false);assert.match(exitReadiness(s).missingRequirement,/Place the silver locket/);
   const settled=act(s,{type:'settle'});assert.equal(settled.committed,true);s=settled.state;
  }
  assert.equal(exitReadiness(s).canLeave,true);s.player=position(2,2);
  assert.deepEqual([exitReadiness(s).prerequisitesMet,exitReadiness(s).atExit,exitReadiness(s).canLeave],[true,false,false]);
  assert.equal(exitReadiness(s).missingRequirement,'Return to the entrance first.');assert.equal(act(s,{type:'leave'}).committed,false);
  s=act(s,{type:'move',to:s.entrance}).state;assert.equal(act(s,{type:'leave'}).state.status,'won');
 }
});

test('missing-objective explanation precedes return and ended runs cannot leave again',()=>{
 const s=baseFixture();assert.match(exitReadiness(s).missingRequirement,/front-door key/);
 s.objective.kind='diary';assert.match(exitReadiness(s).missingRequirement,/missing diary/);
 s.objective.kind='keepsake';assert.match(exitReadiness(s).missingRequirement,/Recover the silver locket/);
 const done=act(diaryExit(),{type:'leave'}).state;assert.equal(exitReadiness(done).canLeave,false);assert.equal(act(done,{type:'leave'}).committed,false);
 const dead=diaryExit();dead.status='dead';dead.resources.health=0;assert.equal(exitReadiness(dead).prerequisitesMet,true);assert.equal(exitReadiness(dead).canLeave,false);assert.equal(act(dead,{type:'leave'}).committed,false);
});

test('diary exit survives reload, undo and re-entry without duplicate completion records',()=>{
 const data=new Map(),store={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const initial=diaryExit();assert.equal(saveGame(initial,store).ok,true);
 let s=loadGame(store).state;assert.deepEqual(s,initial);assert.equal(exitReadiness(s).canLeave,true);
 s=act(s,{type:'leave'}).state;assert.equal(saveGame(s,store).ok,true);assert.equal(loadCompletedRuns(store).records.length,1);
 s=parseSave(JSON.stringify(s)).state;s=act(s,{type:'undo'}).state;assert.deepEqual(s,initial);assert.equal(exitReadiness(s).canLeave,true);
 assert.equal(saveGame(s,store).ok,true);assert.equal(loadCompletedRuns(store).records.length,1);
 s=act(s,{type:'leave'}).state;assert.equal(saveGame(s,store).ok,true);assert.equal(loadCompletedRuns(store).records.length,1);
 assert.equal(loadCompletedRuns(store).records[0].report.hauntings.defeated,0);
});

test('solver can finish diary objective with the living wisp untouched',()=>{
 const s=diaryExit(),result=solve(s);assert.equal(result.solved,true);assert.equal(result.actions.some(a=>a.type==='attack'),false);
 const final=replayWitness(s,result.actions,true);assert.equal(final.status,'won');assert.equal(final.hauntings[0].hp,s.hauntings[0].hp);
});
