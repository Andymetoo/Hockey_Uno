/** Reproducible adventure audit. No pass-rate or tactic quota changes generation.
 * node src/haunted-house/tests/adventure-batch.mjs --seeds 16 --output .haunted-checks/adventure-batch.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { generateCandidate, verifyCandidate } from '../generation.ts';
import { TUNING, ITEMS } from '../content.ts';
import { solve, replayWitness } from '../solver.ts';
import { validateDependencies } from '../dependencies.ts';
import { witnessMetrics } from '../diagnostics.ts';
import { act, previewAttack } from '../game.ts';
import { completionReport } from '../completion.ts';

const args = process.argv.slice(2), arg = (k, fallback) => args.includes(k) ? args[args.indexOf(k)+1] : fallback;
const count = Number(arg('--seeds','16')), phase = arg('--phase','all');
if (!Number.isInteger(count) || count < 1 || count > 100 || !['all','previous','adventure'].includes(phase)) throw new Error('Use --seeds 1..100 and --phase all|previous|adventure.');
const output = arg('--output','.haunted-checks/adventure-batch.json');
const seeds = Array.from({length:count},(_,i)=>`hh-adventure-${String(i).padStart(2,'0')}`);
const report = {seeds, budgets:{attempts:TUNING.generationAttempts,search:TUNING.solverBudget,width:TUNING.solverWidth},cases:[],limitations:'Finite omniscient witnesses, not human difficulty or hidden-information fairness. Graph distance measures separation, not move cost: a discovered remote destination is one turn. Alternative preferences are bounded solver policies, not all possible play orders.'};
function save() {mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
function distance(s,from,to,closed) {
 const queue=[[from,0]], seen=new Set([from]);
 for(const [at,n] of queue){if(at===to)return n;for(const c of s.connections){if(c.id===closed)continue;const next=c.a.roomId===at?c.b.roomId:c.b.roomId===at?c.a.roomId:undefined;if(next&&!seen.has(next)){seen.add(next);queue.push([next,n+1]);}}}
 return null;
}
function structure(s) {
 const deps=validateDependencies(s), room=id=>s.rooms.find(r=>r.id===id).name;
 const keys=s.connections.filter(c=>c.gate).map(c=>{
  const source=s.supplies.find(x=>x.item===c.gate);
  return {id:c.gate,name:ITEMS[c.gate].name,gate:c.id,lock:c.name??c.kind,from:room(c.a.roomId),to:room(c.b.roomId),source:source?room(source.position.roomId):null,
   sameRoom:!!source&&[c.a.roomId,c.b.roomId].includes(source.position.roomId),distance:source?distance(s,source.position.roomId,c.a.roomId,c.id):null,
   prerequisites:deps.prerequisites[c.id],required:deps.requiredGates.includes(c.id)};
 });
 const chain=(id,seen=new Set())=>seen.has(id)?Infinity:1+Math.max(0,...(deps.prerequisites[id]??[]).map(x=>chain(x,new Set([...seen,id]))));
 const keeper=s.hauntings.find(h=>h.boss);
 return {objective:s.objective.kind,structure:s.objective.structure??'previous',description:s.objective.description,rooms:s.rooms.map(r=>({id:r.id,name:r.name,identity:r.identity??'cosmetic',floor:r.floor,width:r.width,height:r.height})),
  keys,dependencyValid:deps.valid,dependencyErrors:deps.errors,maxChain:Math.max(0,...keys.map(k=>chain(k.gate))),shortcuts:s.connections.length-s.rooms.length+1,
  quietRooms:s.rooms.filter(r=>!s.hauntings.some(h=>h.position.roomId===r.id)).map(r=>r.name),
  keeper:{room:room(keeper.position.roomId),kind:keeper.kind,hp:keeper.hp,attack:keeper.attack,item:ITEMS[keeper.reward].name},memorial:s.objective.altar?room(s.objective.altar.roomId):null,
  rewards:s.supplies.filter(x=>['power','vitality','relic'].includes(x.kind)||x.name==="Alchemist's case").map(x=>({id:x.definitionId??x.kind,name:x.name,room:room(x.position.roomId),effect:x.effect??{kind:x.kind,amount:x.amount}})),
  budget:{food:s.supplies.filter(x=>x.kind==='food').length,light:s.supplies.filter(x=>x.kind==='candle').reduce((n,x)=>n+x.amount,0),tonics:s.supplies.filter(x=>x.kind==='tonic').reduce((n,x)=>n+x.amount,0),oils:s.supplies.filter(x=>x.kind==='oil').reduce((n,x)=>n+x.amount,0)},
  journal:s.journal,notes:s.supplies.filter(x=>x.kind==='note').map(x=>({room:room(x.position.roomId),type:x.noteType??'rules',text:x.text}))};
}
function route(s,actions) {
 const metrics=witnessMetrics(s,actions),seenRooms=new Set([s.player.roomId]);let current=s,roomChanges=0,roomReentries=0,entriesWithoutDiscovery=0,healthSpent=0,lightSpent=0;
 const supplied=[];
 for(const action of actions){
  if(action.type==='attack'){const p=previewAttack(current,current.hauntings.find(h=>h.id===action.hauntingId),action.mode);healthSpent+=p.incoming;lightSpent+=p.lightCost;}
  if(action.type==='ward')lightSpent+=TUNING.wardCost;
  if(action.type==='use'){const x=current.supplies.find(x=>x.id===action.supplyId);supplied.push({id:x.id,kind:x.kind,name:x.name,room:x.position.roomId});}
  const next=act(current,action,false);if(!next.committed||next.state.status==='dead')throw new Error('Invalid measured route');
  if(current.player.roomId!==next.state.player.roomId){roomChanges++;if(seenRooms.has(next.state.player.roomId))roomReentries++;seenRooms.add(next.state.player.roomId);if(current.rooms.reduce((n,r)=>n+r.discovered.filter(Boolean).length,0)===next.state.rooms.reduce((n,r)=>n+r.discovered.filter(Boolean).length,0))entriesWithoutDiscovery++;}
  current=next.state;
 }
 const choices=metrics.choices;delete metrics.choices;
 return {...metrics,healthSpent,lightSpent,roomChanges,roomReentries,entriesWithoutDiscovery,consumedSupplies:supplied,remaining:completionReport(current).supplies,skippedHauntings:s.hauntings.length-metrics.kills,
  encounters:{samples:choices.length,meanStrikeHits:choices.reduce((n,c)=>n+c.strikeHits,0)/Math.max(1,choices.length),meanStrikeHealth:choices.reduce((n,c)=>n+c.strikeHealthCost,0)/Math.max(1,choices.length),meanFlareLight:choices.reduce((n,c)=>n+c.flareLightCost,0)/Math.max(1,choices.length),wardSurvival:choices.filter(c=>c.wardChangesSurvival).length,oilThresholds:choices.filter(c=>c.oilStrikeHitsSaved||c.oilFlareHitsSaved).length}};
}
for(const config of [{name:'previous',ingredients:'expanded'},{name:'adventure',ingredients:'adventure'}].filter(c=>phase==='all'||c.name===phase)){
 const batch={...config,runs:[]};report.cases.push(batch);
 for(const [index,seed] of seeds.entries()){
  const run={seed,attempts:[]};batch.runs.push(run);const started=performance.now();
  for(let variant=0;variant<TUNING.generationAttempts;variant++){
   const before=performance.now();let initial;
   try{initial=generateCandidate(seed,variant,{ingredients:config.ingredients,encounters:'prior'});}catch(error){run.attempts.push({variant,reason:'construction',message:String(error.message),ms:Math.round(performance.now()-before),replayed:false});continue;}
   const result=verifyCandidate(initial),finished=result.solved?replayWitness(initial,result.actions):undefined;
   run.attempts.push({variant,reason:result.reason,visited:result.visited,ms:Math.round(performance.now()-before),replayed:!!finished});
   if(!finished)continue;
   run.accepted={variant,structure:structure(initial),route:route(initial,result.actions),alternatives:[]};
   if(index<3)for(const preference of ['health','light']){
    const start=performance.now(),alternative=solve(initial,TUNING.solverBudget,preference),replayed=alternative.solved&&!!replayWitness(initial,alternative.actions);
    run.accepted.alternatives.push({preference,replayed,reason:alternative.reason,ms:Math.round(performance.now()-start),...(replayed?{route:route(initial,alternative.actions)}:{})});
   }
   break;
  }
  run.ms=Math.round(performance.now()-started);console.log(`${config.name} ${seed}: ${run.accepted?`variant ${run.accepted.variant}, ${run.accepted.route.turns} turns`:'FAILED'}; ${run.attempts.length} candidates, ${run.ms} ms`);save();
 }
 const accepted=batch.runs.flatMap(r=>r.accepted?[r.accepted]:[]),attempts=batch.runs.flatMap(r=>r.attempts),keys=accepted.flatMap(a=>a.structure.keys),mean=fn=>+(accepted.reduce((n,a)=>n+fn(a),0)/Math.max(1,accepted.length)).toFixed(2),hist=xs=>xs.reduce((m,x)=>(m[x]=(m[x]??0)+1,m),{});
 batch.summary={seeds:count,accepted:accepted.length,failures:count-accepted.length,candidates:attempts.length,rejected:attempts.filter(a=>!a.replayed).length,rejectionReasons:hist(attempts.filter(a=>!a.replayed).map(a=>a.reason)),meanAttemptMs:+(attempts.reduce((n,a)=>n+a.ms,0)/attempts.length).toFixed(1),maxAttemptMs:Math.max(...attempts.map(a=>a.ms)),
  sameRoomKeys:keys.filter(k=>k.sameRoom).length,differentRoomKeys:keys.filter(k=>!k.sameRoom).length,keyDistances:hist(keys.map(k=>k.distance)),maxDependencyChain:Math.max(...accepted.map(a=>a.structure.maxChain)),structures:hist(accepted.map(a=>a.structure.structure)),roomIdentities:hist(accepted.flatMap(a=>a.structure.rooms.map(r=>r.identity))),rewards:hist(accepted.flatMap(a=>a.structure.rewards.map(r=>r.id))),objectiveFamilies:hist(accepted.map(a=>a.structure.objective)),
  shortcuts:accepted.reduce((n,a)=>n+a.structure.shortcuts,0),quietRooms:accepted.reduce((n,a)=>n+a.structure.quietRooms.length,0),meanTurns:mean(a=>a.route.turns),meanKills:mean(a=>a.route.kills),meanSkippedHauntings:mean(a=>a.route.skippedHauntings),meanHealthSpent:mean(a=>a.route.healthSpent),meanLightSpent:mean(a=>a.route.lightSpent),meanRemainingSupplies:mean(a=>a.route.remaining.total),meanFoodBudget:mean(a=>a.structure.budget.food),meanCandleLightBudget:mean(a=>a.structure.budget.light),meanRoomReentries:mean(a=>a.route.roomReentries),meanEntriesWithoutDiscovery:mean(a=>a.route.entriesWithoutDiscovery),
  alternatives:accepted.reduce((n,a)=>n+a.alternatives.length,0),alternativeWins:accepted.reduce((n,a)=>n+a.alternatives.filter(x=>x.replayed).length,0),alternateOrders:accepted.reduce((n,a)=>n+a.alternatives.filter(x=>x.replayed&&JSON.stringify(x.route.encounterOrder)!==JSON.stringify(a.route.encounterOrder)).length,0)};
 console.log(JSON.stringify({name:config.name,...batch.summary}));save();
}
console.log(`Wrote ${output}`);
