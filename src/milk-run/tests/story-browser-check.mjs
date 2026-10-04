import assert from 'node:assert/strict';
import { openBrowser } from './browser-harness.mjs';
import { createGame } from '../state.mjs';
import { dispatch } from '../rules.mjs';
import { startStoryThread } from '../story.mjs';
import { addStoryCondition } from '../story-effects.mjs';
import { ResolutionQueue } from '../queue.mjs';
import { createCampaign, createCampaignStore, prepareCampaignSortie, CAMPAIGN_STORE_KEY } from '../campaign.mjs';
import { SAVE_KEY } from '../persistence.mjs';

const b=await openBrowser({port:9357,artifactFolder:'story'});
const {evaluate,click,touch,inject,reload,flush,getState,viewport,screenshot,waitFor}=b;
const checks=[], widths=[320,360,390,430,768,1440], note=text=>{checks.push(text);console.log(text);};
const fresh=(seed='story-browser')=>createGame({opportunityEnabled:false},seed,'v2-continuous');
const pendingWeather=()=>{const s=fresh();startStoryThread(s,'weather_front');return s;};
const closeStory=()=>click('#story-dialog [data-ui=close]');
const store=()=>evaluate('window.milkRun.getCampaignStore()');

try {
  for(const width of widths) {
    await viewport(width,width<768?844:1024);
    const quiet=fresh();await inject(quiet);
    assert.ok(await evaluate("!!document.querySelector('[data-ui=story-conditions]')"));
    assert.equal(await evaluate("document.querySelector('[data-ui=story-conditions]').classList.contains('has-conditions')"),false);
    const state=pendingWeather();await inject(state);await waitFor("document.querySelector('#story-dialog').open");
    assert.match(await evaluate("document.querySelector('#story-title').textContent"),/COAST DISAPPEARS/);
    assert.equal(await evaluate("document.querySelectorAll('#story-dialog [data-story-choice]').length"),2);
    assert.ok(await evaluate("(()=>{const d=document.querySelector('#story-dialog'),r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&d.scrollWidth<=d.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1})()"),`${width}px choice modal fits`);
    assert.ok(await evaluate("[...document.querySelectorAll('[data-story-choice]')].every(e=>e.getBoundingClientRect().height>=44)"));
    await screenshot(`decision-${width}`);
    await closeStory();assert.deepEqual(await getState(),JSON.parse(JSON.stringify(state)));
    assert.equal(await evaluate("document.querySelector('#story-dialog').open"),false);
    await touch('[data-ui=story-conditions]');
    assert.match(await evaluate("document.querySelector('#info-content').textContent"),/waiting for your decision/);
    await click('#info-content [data-ui=story-choice]');
    assert.equal(await evaluate("document.querySelector('#story-dialog').open"),true);
    await touch('#story-dialog [data-story-choice=enter]');await flush();
    const chosen=await getState();assert.equal(chosen.phase,'select');assert.ok(chosen.story.conditions.some(c=>c.id==='heavy_cloud'));
    await reload();assert.deepEqual(await getState(),chosen);
    assert.equal(await evaluate("document.querySelector('#story-dialog').open"),false);
    await touch('[data-ui=story-conditions]');
    const copy=await evaluate("document.querySelector('#info-content').textContent");
    for(const text of ['HEAVY CLOUD','Effect','Resolve / expires','Pending','MISS'])assert.ok(copy.includes(text));
    assert.ok(await evaluate("(()=>{const d=document.querySelector('#info-dialog');return d.getBoundingClientRect().right<=innerWidth+1&&d.scrollWidth<=d.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1})()"));
    await screenshot(`conditions-${width}`);await click('#info-dialog [data-ui=close]');
    note(`${width}px: pending decision, inspect/reopen, touch choice, exact reload and readable Current Conditions fit the viewport`);
  }

  await viewport(390,844);
  const marked=fresh();marked.cells['B2-4']='damaged';
  addStoryCondition(marked,{id:'marked-radio',title:'RADIO CONTACT LOST',description:'The aerial lead at the old hit is failing.',effectText:'Summon Escort is unavailable.',resolveText:'Repair B2-4.',modifiers:{radioBlocked:true},repairCell:'B2-4'});
  addStoryCondition(marked,{id:'kit',title:'EXTRA MEDICAL SUPPLIES',description:'The crew found a sealed emergency pouch.',effectText:'The next Medical action costs no resource.',resolveText:'Used by Medical or at HOME.',tone:'positive',modifiers:{nextFree:'medical'}});
  await inject(marked);await touch('[data-ui=story-conditions]');
  assert.ok(await evaluate("!!document.querySelector('[data-story-condition=kit].positive')"));
  await touch('[data-story-cell="B2-4"]');
  assert.match(await evaluate("document.querySelector('#info-content').textContent"),/RADIO CONTACT LOST/);
  assert.match(await evaluate("document.querySelector('#info-title').textContent"),/Cell History/);
  await screenshot('marked-cell-and-repair');await click('#info-dialog [data-ui=close]');
  assert.ok(await evaluate("!!document.querySelector('[data-story-mark="+'"B2-4"'+"]')"));
  assert.deepEqual(await getState(),JSON.parse(JSON.stringify(marked)));
  note('Positive supplies and marked aircraft problems share Current Conditions; tapping the marked square opens ordinary Cell History without mutating the flight');

  let queued;
  for(let i=0;i<30&&!queued;i++) {
    const state=fresh(`story-queue-${i}`);state.time=4;state.timeTokens=Array(4).fill('Time');state.pendingProgress=true;
    for(let j=0;j<4;j++)state.bags.mission.tokens.splice(state.bags.mission.tokens.indexOf('Time'),1);
    const q=new ResolutionQueue({state,dispatch});q.speed='manual';q.send({type:'continueProgress'});
    if(q.state.story.pending)queued=q.export();q.dispose();
  }
  assert.ok(queued);await inject(queued.state,queued);
  assert.equal(await evaluate("document.querySelector('#story-dialog').open"),false);
  assert.equal((await getState()).phase,'story');
  await reload();assert.equal(await evaluate("document.querySelector('#story-dialog').open"),false);
  await screenshot('checkpoint-before-story');await flush();await waitFor("document.querySelector('#story-dialog').open");
  const held=await getState();await reload();assert.deepEqual(await getState(),held);
  assert.match(await evaluate("document.querySelector('#story-title').textContent"),new RegExp(held.story.pending.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  await screenshot('checkpoint-story-ready');await closeStory();
  note('A resolved Story decision remains hidden throughout saved checkpoint presentation, opens only when the queue finishes, and reload preserves the exact decision');

  await click('[data-ui=dev]');assert.equal(await evaluate("document.querySelector('[name=v2StoryMode]').checked"),true);
  await evaluate("const box=document.querySelector('[name=v2StoryMode]');box.checked=false;box.dispatchEvent(new Event('change',{bubbles:true}))");
  await click('#dev-dialog [data-ui=close]');await reload();
  assert.equal(await evaluate('window.milkRun.getPreferences().v2StoryMode'),false);
  assert.deepEqual(await getState(),held);await closeStory();
  await click('[data-ui=dev]');await click('[data-ui=reset-v2]');
  assert.equal(await evaluate("document.querySelector('[name=v2StoryMode]').checked"),true);await click('#dev-dialog [data-ui=close]');
  await inject(createGame({v2StoryMode:false},'story-off-browser','v2-continuous'));
  assert.equal(await evaluate("!!document.querySelector('[data-ui=story-conditions]')"),false);
  note('Story Mode persists as a next-sortie Dev preference, Reset V2 restores ON, and a Story-OFF flight has no conditions control');

  const created=createCampaign(createCampaignStore());const flight=prepareCampaignSortie(created.store,created.campaign.id,fresh(),{aircraftId:created.campaign.currentAircraftId});
  startStoryThread(flight.state,'weather_front');
  await evaluate(`localStorage.setItem(${JSON.stringify(CAMPAIGN_STORE_KEY)},${JSON.stringify(JSON.stringify(flight.store))})`);
  await inject(flight.state);await closeStory();await click('[data-ui=campaign]');
  await b.command('Browser.setDownloadBehavior',{behavior:'deny'});
  await evaluate("(()=>{const original=URL.createObjectURL;URL.createObjectURL=blob=>{window.__storyBackup=blob;return original(blob)}})()");
  await click('[data-ui=campaign-export]');const backupText=await evaluate('window.__storyBackup.text()');
  const backup=JSON.parse(backupText);assert.deepEqual(backup.activeSession.state.story,flight.state.story);
  await click('#campaign-dialog [data-ui=close]');await click('[data-ui=story-choice]');await click('[data-story-choice=around]');await flush();
  assert.equal((await getState()).story.pending,null);await click('[data-ui=campaign]');
  await evaluate(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(backupText)}],'story-backup.json',{type:'application/json'}));const input=document.querySelector('#campaign-import');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor("!!document.querySelector('[data-ui=campaign-import-confirm]')");await click('[data-ui=campaign-import-confirm]');
  assert.deepEqual(await getState(),backup.activeSession.state);await reload();assert.deepEqual(await getState(),backup.activeSession.state);
  if(await evaluate("document.querySelector('#story-dialog').open"))await closeStory();
  note('Real Campaign file Export/Import restores a pending Story decision, its RNG and its exact active flight after a different choice was made');

  await click('[data-ui=dev]');await click('[data-ui=discard-campaign]');await click('[data-ui=confirm-discard]');
  assert.deepEqual(await store(),created.store);assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(SAVE_KEY)})`),null);
  assert.equal(await evaluate("document.querySelector('#campaign-dialog').open"),true);
  await screenshot('story-discard-no-history');
  note('Dev Discard disposes a pending Story prompt and reservation, restores Hangar availability, removes its autosave and writes no Story history');

  assert.deepEqual(b.exceptions,[]);assert.deepEqual(b.badResponses,[]);
  await b.writeResults({passed:checks.length,checks,widths,exceptions:b.exceptions,badResponses:b.badResponses});
  console.log(JSON.stringify({passed:checks.length,widths,artifacts:b.artifacts},null,2));
} finally {await b.close();}
