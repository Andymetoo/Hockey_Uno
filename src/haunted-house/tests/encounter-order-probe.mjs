/** Legal early-victory alternative routes, separate from unmodified batch return-later metrics.
 * Run encounter-batch first, then: node src/haunted-house/tests/encounter-order-probe.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateCandidate, verifyCandidate } from '../generation.ts';
import { evaluateEncounter } from '../encounter-diagnostics.ts';
import { explorationAction, replayWitness } from '../solver.ts';
import { act, previewAttack } from '../game.ts';
import { witnessMetrics } from '../diagnostics.ts';
import { completionReport } from '../completion.ts';
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const input=arg('--input','.haunted-checks/encounter-final.json'),output=arg('--output','.haunted-checks/encounter-orders.json');
const batch=JSON.parse(readFileSync(input,'utf8')).cases.find(b=>b.name==='mixed'),results=[];
for(const run of batch.runs){
 const target=run.accepted?.placement.early.find(e=>e.tier>=3&&e.assessment.affordable);if(!target)continue;
 const initial=generateCandidate(run.seed,run.accepted.variant),prefix=[];let state=initial;
 for(let i=0;i<2500;i++){const a=explorationAction(state);if(!a)break;const r=act(state,a,false);assert.ok(r.committed);prefix.push(a);state=r.state;}
 const trial=evaluateEncounter(state,target.id);assert.ok(trial.affordable);prefix.push(...trial.bestPlan.actions);
 for(const a of trial.bestPlan.actions){const r=act(state,a,false);assert.ok(r.committed&&r.state.status!=='dead');state=r.state;}
 const afterFirst={turn:state.turns,resources:state.resources},suffix=verifyCandidate(state),all=[...prefix,...suffix.actions];
 const final=suffix.solved?replayWitness(initial,all):undefined;
 const result={seed:run.seed,variant:run.accepted.variant,target:target.name,tier:target.tier,room:target.roomName,earlyPlan:trial.bestPlan,afterFirst,solved:!!final,reason:suffix.reason,visited:suffix.visited};
 if(final){
  const m=witnessMetrics(initial,all);delete m.choices;result.metrics=m;result.suppliesPreserved=completionReport(final).supplies.total;
  let replay=initial;const bill=new Map(),kills=[];
  for(const a of all){if(a.type==='attack'){const h=replay.hauntings.find(h=>h.id===a.hauntingId),p=previewAttack(replay,h,a.mode),cost=bill.get(h.id)??{health:0,light:0};cost.health+=p.incoming;cost.light+=p.lightCost;bill.set(h.id,cost);}
   const next=act(replay,a,false).state;if(a.type==='attack'&&!next.hauntings.find(h=>h.id===a.hauntingId).hp){const h=replay.hauntings.find(h=>h.id===a.hauntingId);kills.push({name:h.name,tier:h.tier,levelBefore:replay.resources.level,levelAfter:next.resources.level,turn:next.turns,...bill.get(h.id)});}replay=next;}
  result.kills=kills;
 }
 results.push(result);console.log(`${run.seed} ${target.name} first: ${result.solved?'verified win':result.reason}`);
}
writeFileSync(output,JSON.stringify({input,limitations:'Explicit alternative encounter policy, not spontaneous behavior or proof of all possible play orders. Empty exploration and first fight use legal actions; suffix uses production optional-branch-skipping verification. No detours are added to return-later metrics.',results},null,2)+'\n');
console.log(`Wrote ${output}`);
