/** Paired pre-mix/current placement audit, using identical candidate budgets.
 * node src/haunted-house/tests/encounter-batch.mjs --seeds 16 --output .haunted-checks/encounter-final.json
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { generateCandidate, verifyCandidate } from '../generation.ts';
import { TUNING } from '../content.ts';
import { act, cloneGame, previewAttack } from '../game.ts';
import { known, positionKey } from '../world.ts';
import { roomDistances, validateDependencies } from '../dependencies.ts';
import { openingVisibility } from '../encounter-placement.ts';
import { evaluateEncounter } from '../encounter-diagnostics.ts';
import { encounterChoices, witnessMetrics } from '../diagnostics.ts';
import { completionReport } from '../completion.ts';
import { replayWitness } from '../solver.ts';

const args=process.argv.slice(2), arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const count=Number(arg('--seeds','16')), output=arg('--output','.haunted-checks/encounter-final.json');
if(!Number.isInteger(count)||count<1||count>100)throw new Error('Use --seeds 1..100.');
const seeds=Array.from({length:count},(_,i)=>`hh-encounters-${String(i).padStart(2,'0')}`);
const report={seeds,budget:{attempts:TUNING.generationAttempts,states:TUNING.solverBudget,width:TUNING.solverWidth},cases:[{name:'prior',runs:[]},{name:'mixed',runs:[]}],limitations:[
 'Initial visibility is the saved starting 3x3; empty exploration is the fixed point using only empty discovered destinations/open passages, with occupants and locked gates intact. It is not a conventional walking flood fill.',
 'Tier >=3 is a distribution label, not an affordability judgment. Simple-threat means pure Strikes are lethal and pure Flares exceed current light; mixed/prepared/tonic plans can still win.',
 'Encounter probes enumerate bounded legal fight plans with available pockets/prepared buffs/saved relics, without consuming floor supplies. Failure to find a plan is not proof of impossibility. Actual witness actions account for all collected rewards/supplies.',
 'Return-later examples are observations of the unmodified winning witness: enemy seen untouched, player leaves its room, improves through a kill in another room, then first attacks it. Remote attacks are legal; physical return is not required.',
 'Generation timing excludes diagnostic probes and witness measurements. Finite, omniscient witnesses establish a win, not fairness of hidden choices or human pacing.'
]};
const hist=xs=>xs.reduce((o,x)=>(o[x]=(o[x]??0)+1,o),{});
const sum=(xs,f)=>xs.reduce((n,x)=>n+f(x),0);
const mean=(xs,f)=>+(sum(xs,f)/Math.max(1,xs.length)).toFixed(2);
const save=()=>{mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');};
const profile=h=>{const {position,...rest}=h;return rest;};
function assertBudget(seed,variant,mixed){
 const old=generateCandidate(seed,variant,{encounters:'prior'});
 assert.deepEqual(mixed.hauntings.map(profile),old.hauntings.map(profile));
 for(const key of ['rooms','connections','supplies','resources','objective','journal','entrance'])assert.deepEqual(mixed[key],old[key]);
}
function probe(s,h){
 const measured=evaluateEncounter(s,h.id), {bestPlan,...rest}=measured;
 return {...rest,bestPlan:bestPlan?{...bestPlan,actions:bestPlan.actions.map(a=>a.type==='attack'?a.mode:a.type)}:null};
}
function placement(s){
 const depth=roomDistances(s,s.entrance.roomId),closure=openingVisibility(s),regular=s.hauntings.filter(h=>!h.boss);
 const early=regular.filter(h=>closure.has(positionKey(h.position))).map(h=>{
  const shadow=cloneGame(s),room=shadow.rooms.find(r=>r.id===h.position.roomId);room.discovered[h.position.y*room.width+h.position.x]=true;
  const assessment=probe(shadow,h),c=assessment.choices;
  return {id:h.id,name:h.name,kind:h.kind,tier:h.tier,room:h.position.roomId,roomName:room.name,depth:depth.get(room.id),initial:known(s,h.position),hp:h.hp,attack:h.attack,xp:h.xp,assessment,simpleThreat:!c.strikeSurvives&&!c.flareAffordable};
 });
 const reference=cloneGame(s);Object.assign(reference.resources,{power:8,health:25,maxHealth:25,light:10,level:2,xp:0});
 return {regular:regular.map(h=>({id:h.id,tier:h.tier,floor:s.rooms.find(r=>r.id===h.position.roomId).floor,depth:depth.get(h.position.roomId),hp:h.hp,attack:h.attack,xp:h.xp,kind:h.kind,room:h.position.roomId,referenceLevel2:encounterChoices(reference,h)})),early,
  boss:s.hauntings.filter(h=>h.boss).map(h=>({tier:h.tier,hp:h.hp,attack:h.attack,xp:h.xp})),
  initialVisibleTiles:sum(s.rooms,r=>r.discovered.filter(Boolean).length),emptyExplorationVisibleTiles:closure.size,
  openingSupplies:s.supplies.filter(x=>!x.used&&closure.has(positionKey(x.position))).map(x=>({name:x.name,kind:x.kind,amount:x.amount})),
  budget:{hp:sum(regular,h=>h.maxHp),attack:sum(regular,h=>h.attack),xp:sum(regular,h=>h.xp),supplies:completionReport(s).supplies.total},dependencyValid:validateDependencies(s).valid};
}
function route(initial,actions){
 let state=initial;const sightings=new Map(),firstAttacks=new Map(),kills=[],returnLater=[],spent=new Map(),earlyRecovery=[];
 const seenAt=s=>{for(const h of s.hauntings)if(h.hp>0&&known(s,h.position)&&!sightings.has(h.id))sightings.set(h.id,{turn:s.turns,room:h.position.roomId,playerRoom:s.player.roomId,level:s.resources.level,power:s.resources.power,health:s.resources.health,light:s.resources.light,assessment:probe(s,h),left:false,otherRoomKills:[]});};
 seenAt(state);
 for(const action of actions){
  if(action.type==='attack'){
   const h=state.hauntings.find(h=>h.id===action.hauntingId),p=previewAttack(state,h,action.mode);
   if(!firstAttacks.has(h.id)){
    const first={turn:state.turns,level:state.resources.level,power:state.resources.power,health:state.resources.health,light:state.resources.light,assessment:probe(state,h),fromRoom:state.player.roomId};firstAttacks.set(h.id,first);
    const sight=sightings.get(h.id);
    if(sight?.left&&sight.otherRoomKills.some(k=>k.level>sight.level)&&(first.level>sight.level||first.power>sight.power))returnLater.push({id:h.id,name:h.name,kind:h.kind,tier:h.tier,hp:h.maxHp,attack:h.attack,room:state.rooms.find(r=>r.id===h.position.roomId).name,firstSeen:sight,firstAttack:first});
   }
   const bill=spent.get(h.id)??{health:0,light:0,strikes:0,flares:0};bill.health+=p.incoming;bill.light+=p.lightCost;bill[action.mode==='strike'?'strikes':'flares']++;spent.set(h.id,bill);
  }
  if(action.type==='use'&&kills.length<2){const x=state.supplies.find(x=>x.id===action.supplyId);if(['food','candle'].includes(x.kind))earlyRecovery.push({turn:state.turns,name:x.name,kind:x.kind,full:x.kind==='food'?state.resources.health===state.resources.maxHealth:state.resources.light===state.resources.maxLight});}
  const r=act(state,action,false);assert.ok(r.committed&&r.state.status!=='dead');
  if(action.type==='attack'){
   const before=state.hauntings.find(h=>h.id===action.hauntingId),after=r.state.hauntings.find(h=>h.id===action.hauntingId);
   if(!after.hp){const start=firstAttacks.get(before.id),sight=sightings.get(before.id);kills.push({id:before.id,name:before.name,tier:before.tier,room:before.position.roomId,turn:r.state.turns,levelBefore:state.resources.level,levelAfter:r.state.resources.level,powerAfter:r.state.resources.power,xpAward:before.xp,xpAfter:r.state.resources.xp,firstAttack:start.turn,earlyStrong:!before.boss&&before.tier>=3&&start.level<=2,initiallySeen:known(initial,before.position),...spent.get(before.id)});
    for(const [id,entry]of sightings)if(id!==before.id&&!firstAttacks.has(id)&&entry.room!==before.position.roomId&&entry.left)entry.otherRoomKills.push({id:before.id,name:before.name,room:state.rooms.find(r=>r.id===before.position.roomId).name,turn:r.state.turns,level:r.state.resources.level});
   }
  }
  state=r.state;seenAt(state);
  for(const [id,entry]of sightings)if(!firstAttacks.has(id)&&state.player.roomId!==entry.room&&state.turns>entry.turn)entry.left=true;
 }
 assert.equal(state.status,'won');
 const metrics=witnessMetrics(initial,actions);delete metrics.choices;
 return {...metrics,remaining:completionReport(state).supplies,finalLevel:state.resources.level,finalPower:state.resources.power,killsTimeline:kills,returnLater,earlyRecovery,
  earlyStrongSeen: [...sightings].filter(([id,s])=>initial.hauntings.some(h=>h.id===id&&!h.boss&&h.tier>=3)&&s.level<=2).length,
  sightings:[...sightings].map(([id,s])=>({id,...s})),skipped:state.hauntings.filter(h=>h.hp>0).length};
}
for(const seed of seeds)for(const batch of report.cases){
 const run={seed,attempts:[]};batch.runs.push(run);
 for(let variant=0;variant<TUNING.generationAttempts;variant++){
  const start=performance.now();let initial;
  try{initial=generateCandidate(seed,variant,{encounters:batch.name});}catch(error){run.attempts.push({variant,reason:'construction',ms:Math.round(performance.now()-start),message:String(error)});continue;}
  const result=verifyCandidate(initial),ms=Math.round(performance.now()-start),finished=result.solved?replayWitness(initial,result.actions):undefined;
  run.attempts.push({variant,reason:result.reason,visited:result.visited,ms,replayed:!!finished});
  if(!finished)continue;
  if(batch.name==='mixed')assertBudget(seed,variant,initial);
  run.accepted={variant,placement:placement(initial),route:route(initial,result.actions)};break;
 }
 run.generationMs=sum(run.attempts,a=>a.ms);console.log(`${batch.name} ${seed}: ${run.accepted?`v${run.accepted.variant}, ${run.accepted.route.turns} turns, ${run.accepted.route.returnLater.length} returns`:'FAILED'}; ${run.attempts.length} candidates; ${run.generationMs} ms`);save();
}
for(const batch of report.cases){
 const accepted=batch.runs.flatMap(r=>r.accepted?[r.accepted]:[]),attempts=batch.runs.flatMap(r=>r.attempts),enemies=accepted.flatMap(a=>a.placement.regular),early=accepted.flatMap(a=>a.placement.early),kills=accepted.flatMap(a=>a.route.killsTimeline);
 const group=key=>Object.fromEntries([...new Set(enemies.map(h=>h[key]))].sort().map(k=>{const hs=enemies.filter(h=>h[key]===k);return[k,{count:hs.length,tiers:hist(hs.map(h=>h.tier)),meanHp:mean(hs,h=>h.hp),meanAttack:mean(hs,h=>h.attack),meanXp:mean(hs,h=>h.xp)}];}));
 batch.summary={accepted:accepted.length,failures:count-accepted.length,candidates:attempts.length,rejected:attempts.filter(a=>!a.replayed).length,reasons:hist(attempts.filter(a=>!a.replayed).map(a=>a.reason)),meanCandidateMs:mean(attempts,a=>a.ms),maxCandidateMs:Math.max(...attempts.map(a=>a.ms)),meanHouseMs:mean(batch.runs,r=>r.generationMs),
 byFloor:group('floor'),byDepth:group('depth'),initialStrongHouses:accepted.filter(a=>a.placement.early.some(e=>e.initial&&e.tier>=3)).length,emptyExplorationStrongHouses:accepted.filter(a=>a.placement.early.some(e=>e.tier>=3)).length,initialSimpleThreatHouses:accepted.filter(a=>a.placement.early.some(e=>e.initial&&e.simpleThreat)).length,emptyExplorationSimpleThreatHouses:accepted.filter(a=>a.placement.early.some(e=>e.simpleThreat)).length,
 earlyStrong:early.filter(e=>e.tier>=3).length,earlyStrongAffordable:early.filter(e=>e.tier>=3&&e.assessment.affordable).length,earlyStrongNoPlan:early.filter(e=>e.tier>=3&&!e.assessment.affordable).length,
 deepTier1:enemies.filter(e=>e.depth>=2&&e.tier===1).length,deepTier1Houses:accepted.filter(a=>a.placement.regular.some(e=>e.depth>=2&&e.tier===1)).length,deepEasyAtLevel2:enemies.filter(e=>e.depth>=2&&e.referenceLevel2.strikeHits<=2&&e.referenceLevel2.strikeSurvives).length,
 returnLaterHouses:accepted.filter(a=>a.route.returnLater.length).length,returnLaterEncounters:sum(accepted,a=>a.route.returnLater.length),previouslyUnaffordableReturns:sum(accepted,a=>a.route.returnLater.filter(r=>!r.firstSeen.assessment.affordable&&r.firstAttack.assessment.affordable).length),previouslyUnaffordableReturnHouses:accepted.filter(a=>a.route.returnLater.some(r=>!r.firstSeen.assessment.affordable&&r.firstAttack.assessment.affordable)).length,earlyStrongKills:kills.filter(k=>k.earlyStrong).length,
 meanTurns:mean(accepted,a=>a.route.turns),meanSuppliesPreserved:mean(accepted,a=>a.route.remaining.total),meanKills:mean(accepted,a=>a.route.kills),meanSkipped:mean(accepted,a=>a.route.skipped),meanFinalLevel:mean(accepted,a=>a.route.finalLevel),meanLightRefunded:mean(accepted,a=>a.route.lightRefunded),twoFlareRefills:sum(accepted,a=>a.route.twoFlareRefillKills),consecutiveTwoFlareRefills:sum(accepted,a=>a.route.consecutiveTwoFlareRefills),meanEarlyRecovery:mean(accepted,a=>a.route.earlyRecovery.length),earlyFullSupplyClears:sum(accepted,a=>a.route.earlyRecovery.filter(x=>x.full).length),
 meanHpBudget:mean(accepted,a=>a.placement.budget.hp),meanAttackBudget:mean(accepted,a=>a.placement.budget.attack),meanXpBudget:mean(accepted,a=>a.placement.budget.xp),meanSupplyBudget:mean(accepted,a=>a.placement.budget.supplies)};
 console.log(JSON.stringify({name:batch.name,...batch.summary}));
}
save();console.log(`Wrote ${output}`);
