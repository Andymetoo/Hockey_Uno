// Reproducible complete local validation; artifacts stay inside Milk Run.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
const folder=new URL('../.checks/playtest-validation/',import.meta.url);
await mkdir(folder,{recursive:true});
const tests=(await readdir(new URL('./',import.meta.url))).filter(n=>n.endsWith('.test.mjs')).map(n=>`src/milk-run/tests/${n}`);
const suites=['browser','ux-browser','rules-browser','corrective-browser','continuous-browser','dev-tools-browser','crew-stations-browser',
  'diagnostics-browser','status-qol-browser','bomb-run-browser','bomb-run-test-browser','campaign-browser','hangar-browser','dev-discard-browser','story-browser','playtest-correctives-browser','long-session-browser'];
const tasks=[['node',['--test','--test-reporter=tap',...tests]],...suites.map(name=>[name,[`src/milk-run/tests/${name}-check.mjs`]]),['story-review',['src/milk-run/tests/story-playability-review.mjs','24']]];
const results=[];
for(const [name,args] of tasks){
  const start=Date.now();let output='';
  const code=await new Promise(resolve=>{const p=spawn(process.execPath,args,{windowsHide:true});p.stdout.on('data',d=>output+=d);p.stderr.on('data',d=>output+=d);p.on('exit',resolve);});
  await writeFile(new URL(`${name}.log`,folder),output);
  const result={name,code,seconds:(Date.now()-start)/1000,...(name==='node'?{totals:output.split('\n').filter(l=>/^# (tests|pass|fail|skipped|cancelled)/.test(l))}:{})};
  results.push(result);console.log(JSON.stringify(result));
  await writeFile(new URL('results.json',folder),JSON.stringify(results,null,2));
}
if(results.some(r=>r.code!==0))process.exitCode=1;
