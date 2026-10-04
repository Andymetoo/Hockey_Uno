import assert from 'node:assert/strict';
import { openBrowser } from './browser-harness.mjs';
import { STATIONS } from '../board.mjs';
import { damageSquare } from '../rules.mjs';
import { SAVE_KEY } from '../persistence.mjs';
import { member as c, prepared, action, replacement, stacked, session } from './station-audit-fixtures.mjs';
const b=await openBrowser({port:9365,artifactFolder:'station-audit'});
const {inject,click,touch,evaluate,getState,flush,viewport,screenshot,reload}=b;
const widths=[320,360,390,430,768,1440],checks=[],note=s=>{checks.push(s);console.log(s);};
const fit=()=>evaluate("document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('dialog[open]')].every(d=>d.scrollWidth<=d.clientWidth+1&&d.getBoundingClientRect().left>=0&&d.getBoundingClientRect().right<=innerWidth+1)");
const markers=()=>evaluate("[...document.querySelectorAll('#board [data-crew-id]')].map(el=>({id:el.dataset.crewId,r:Number(el.querySelector('circle.crew-body')?.getAttribute('r')??0),label:el.getAttribute('aria-label')}))");
const reclaim=async()=>{await touch('[data-compact-action=reclaimHome]');await touch('[data-compact-confirm]');await flush();};
try{
 for(const width of widths){
  await viewport(width,width<768?844:1050);
  const before=prepared(replacement('pilot','navigator','occupied'),'pilot');await inject(before);
  await touch('[data-compact-action=reclaimHome]');assert.deepEqual(await getState(),before);
  assert.match(await evaluate("document.querySelector('#compact-choice').textContent"),/Navigator.*stays here, Displaced.*Engineer.*physically occupies/);
  assert.ok(await fit());await screenshot(`blocked-confirm-${width}`);
  await touch('[data-compact-confirm]');await flush();let s=await getState();
  assert.equal(c(s,'pilot').station,'pilot');assert.deepEqual(c(s,'navigator').position,STATIONS.pilot.cells);assert.equal(c(s,'navigator').displaced,true);assert.equal(c(s,'engineer').station,'navigator');
  let tokens=await markers();assert.equal(tokens.length,10);assert.ok(tokens.find(t=>t.id==='pilot').r>tokens.find(t=>t.id==='navigator').r);assert.match(tokens.find(t=>t.id==='navigator').label,/Displaced/i);
  await touch('#board [data-crew-id=pilot]');assert.equal(await evaluate("document.querySelectorAll('[data-inspect-occupant]').length"),2);
  await touch('[data-inspect-occupant=navigator]');assert.match(await evaluate("document.querySelector('#info-title').textContent"),/Navigator/);assert.deepEqual(await getState(),s);
  await touch('[data-crew-history="C2-2"]');assert.match(await evaluate("document.querySelector('#info-content').textContent"),/reclaims|Reclaim/);await click('#info-dialog [data-ui=close]');
  await reload();assert.deepEqual(await getState(),s);await screenshot(`single-stack-${width}`);
  await inject(prepared(replacement(),'pilot'));await touch('[data-compact-action=reclaimHome]');assert.match(await evaluate("document.querySelector('#compact-choice').textContent"),/Navigator returns home/);await touch('[data-compact-confirm]');await flush();assert.equal(c(await getState(),'navigator').station,'navigator');

  await inject(prepared(replacement('engineer','copilot','fire'),'engineer'));await reclaim();s=await getState();assert.deepEqual(c(s,'copilot').position,STATIONS.engineer.cells);
  tokens=await markers();assert.equal(tokens.length,10);assert.ok(tokens.find(t=>t.id==='engineer').r>tokens.find(t=>t.id==='copilot').r);
  await touch('#board [data-crew-id=engineer]');assert.equal(await evaluate("document.querySelectorAll('[data-crew-history]').length"),2);await touch('[data-inspect-occupant=copilot]');assert.match(await evaluate("document.querySelector('#info-content').textContent"),/C2-4 \+ D2-3/);assert.ok(await fit());await click('#info-dialog [data-ui=close]');await screenshot(`straddling-stack-${width}`);
  const log=[];damageSquare(s,STATIONS.engineer.cells[1],1,e=>log.push({...e,turn:12,ruleset:'v2-continuous'}),{source:'Flak'});await inject(s,{log});
  assert.equal(c(s,'engineer').health,'injured');assert.equal(c(s,'copilot').health,'injured');assert.notEqual(s.cells[STATIONS.engineer.cells[1]],'fire');tokens=await markers();assert.equal(tokens.length,10);assert.match(tokens.find(t=>t.id==='copilot').label,/Injured/);
  await touch('#board [data-crew-id=copilot] circle.crew-body');assert.match(await evaluate("document.querySelector('.crew-health-history').textContent"),/Flak/);await touch('[data-crew-history="D2-3"]');assert.match(await evaluate("document.querySelector('#info-content').textContent"),/Copilot injured here.*Engineer injured here/);assert.ok(await fit());await click('#info-dialog [data-ui=close]');await screenshot(`injured-stack-${width}`);await reload();assert.deepEqual(await getState(),s);
  note(`${width}px: confirmed return/stay, ten visible tokens, primary/secondary single and straddling footprints, injury/history inspection, exact reload, no overflow`);
 }
 await viewport(320,844);let s=stacked();s.cells['B2-4']='damaged';s=action(s,'radio','repair',{cells:['B2-4'],workCellId:STATIONS.pilot.cells[0]}).state;await inject(s);
 assert.equal((await markers()).length,10);await touch('#board [data-crew-id=pilot]');assert.equal(await evaluate("document.querySelectorAll('[data-inspect-occupant]').length"),3);
 for(const id of ['radio','navigator','pilot']){await touch(`[data-inspect-occupant=${id}]`);assert.deepEqual(await getState(),s);assert.ok(await fit());}
 await screenshot('three-occupant-inspection');await click('#info-dialog [data-ui=close]');note('320px: three physical occupants remain visible and individually inspectable without activation');
 c(s,'navigator').health='injured';const log=[];damageSquare(s,STATIONS.pilot.cells[0],1,e=>log.push({...e,turn:13,ruleset:'v2-continuous'}),{source:'Enemy'});await inject(s,{log});assert.equal(c(s,'navigator').health,'dead');assert.equal(c(s,'pilot').health,'injured');assert.notEqual(s.cells[STATIONS.pilot.cells[0]],'fire');assert.equal((await markers()).length,10);await screenshot('dead-and-surviving-occupants');note('Dead secondary token remains alongside injured survivors; no Fire overlaps living crew');
 s=prepared(replacement(),'pilot');c(s,'navigator').health='injured';await inject(s);await touch('[data-compact-action=reclaimHome]');assert.match(await evaluate("document.querySelector('#crew-flow').textContent"),/casualty.*Return Home/);assert.deepEqual(await getState(),s);note('Injured substitute: unavailable Reclaim exposes Return Home alternative and preserves the body');
 s=prepared(replacement(),'pilot');c(s,'pilot').homeStation='copilot';c(s,'copilot').health='injured';await inject(s);await touch('[data-compact-action=returnHome]');assert.match(await evaluate("document.querySelector('#compact-choice').textContent"),/Copilot/);note('Confirmation names the saved historical home station instead of assuming crew identity');
 const invalid=session(stacked());c(invalid.state,'pilot').position=null;const raw=JSON.stringify(invalid);
 await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)},${JSON.stringify(raw)})`);await reload();assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(SAVE_KEY)})`),raw);assert.match(await evaluate("document.body.textContent"),/original data is retained/);await screenshot('invalid-save-retained');note('Malformed save loads a safe preview, reports the failure, and retains the exact original storage');
 assert.deepEqual(b.exceptions,[]);assert.deepEqual(b.badResponses,[]);await b.writeResults({browser:b.version.product,widths,checks,exceptions:b.exceptions,badResponses:b.badResponses});
 console.log(`Station audit browser checks passed (${checks.length} groups).`);
}finally{await b.close();}
