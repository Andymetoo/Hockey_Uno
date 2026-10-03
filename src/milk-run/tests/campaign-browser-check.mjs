import assert from 'node:assert/strict';
import { openBrowser } from './browser-harness.mjs';
import { CAMPAIGN_STORE_KEY } from '../campaign.mjs';
import { SAVE_KEY, DEV_PREFERENCE_KEYS } from '../persistence.mjs';
import { BOARD, SECTIONS } from '../board.mjs';

const b = await openBrowser({ port: 9353, artifactFolder: 'campaign' });
const { evaluate, click, touch, inject, flush, getState, viewport, screenshot, reload, waitFor } = b;
const checks = [], note = value => { checks.push(value); console.log(value); };
const getStore = () => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(CAMPAIGN_STORE_KEY)}))`);
const currentCampaign = store => store.campaigns.find(campaign => campaign.id === store.activeCampaignId);
const closeCampaign = () => click('#campaign-dialog [data-ui="close"]');
async function openCampaign() { await click('[data-ui="campaign"]'); }
async function launch(seed, aircraftId) {
  if (!aircraftId) aircraftId = currentCampaign(await getStore()).aircraft.find(a => !a.lost).id;
  await touch(`[name="aircraftId"][value="${aircraftId}"]`);
  await evaluate(`(()=>{const form=document.querySelector('#campaign-launch-form');form.elements.namedItem('seed').value=${JSON.stringify(seed)};form.querySelector('[name=bombingTarget]').value='wilhelmshaven';form.requestSubmit();})()`);
  assert.equal(await evaluate("document.querySelector('#campaign-dialog').open"), false);
}
async function turn() {
  const state = await getState();
  const member = state.crew.find(crew => crew.health === 'healthy' && !crew.cycleSlotConsumed && !crew.job);
  assert.ok(member);
  await touch(`#crew-list [data-crew="${member.id}"]`);
  await click('#action-content [data-ui="activate"]'); await flush();
  await click('[data-ui="choose"]'); await click('#action-dialog button[data-action="wait"]');
  await click('#choice-form button[type="submit"]'); await flush();
}
async function confirmAbort() {
  await click('[data-ui="turn-back"]');
  await click('[data-ui="confirm-turn-back"]'); await flush();
}

try {
  await evaluate(`localStorage.removeItem(${JSON.stringify(CAMPAIGN_STORE_KEY)});localStorage.removeItem(${JSON.stringify(SAVE_KEY)});localStorage.setItem(${JSON.stringify(DEV_PREFERENCE_KEYS.v2)},JSON.stringify({version:1,overrides:{v2MissionEnemy:0,v2MissionResource:0,v2MissionTime:4,v2TimePerProgress:1}}));localStorage.setItem(${JSON.stringify(DEV_PREFERENCE_KEYS.common)},JSON.stringify({version:1,overrides:{opportunityEnabled:false,presentationSpeed:'instant'}}));`);
  await reload();
  if (await evaluate("document.querySelector('#sortie-dialog').open")) {
    await click('#sortie-form input[value="v2-continuous"]'); await click('#sortie-form button[type="submit"]');
  }
  await viewport(320, 740); await openCampaign();
  await click('[data-ui="campaign-new"]');
  await evaluate("document.querySelector('#campaign-new-form').elements.namedItem('name').value='The Long Way Home';document.querySelector('#campaign-new-form').requestSubmit()");
  let store = await getStore(), campaign = currentCampaign(store);
  assert.equal(campaign.name, 'The Long Way Home'); assert.equal(campaign.crew.length, 10); assert.equal(campaign.aircraft.length, 1);
  const firstAircraftId = campaign.currentAircraftId, firstRoster = structuredClone(campaign.roster);
  await click('.aircraft-edit > summary');
  await evaluate("(()=>{const form=document.querySelector('[data-aircraft-rename]');form.elements.namedItem('name').value='The Milk Wagon';form.elements.namedItem('serial').value='42-12345';form.requestSubmit();})()");
  await click('.personnel-card:first-child > summary');
  await evaluate(`(()=>{const form=document.querySelector('[data-crew-rename="${firstRoster.pilot}"]');form.elements.namedItem('name').value='A. Miles';form.requestSubmit();})()`);
  campaign = currentCampaign(await getStore());
  assert.equal(campaign.aircraft[0].name, 'The Milk Wagon'); assert.equal(campaign.aircraft[0].serial, '42-12345');
  assert.equal(campaign.crew.find(crew => crew.id === firstRoster.pilot).name, 'A. Miles');
  note('Actual New Campaign form creates one aircraft and ten crew; aircraft/call sign and personnel rename forms persist stable identities');

  for (const [width, height] of [[320, 740], [360, 800], [390, 844], [768, 1024], [1440, 1000]]) {
    await viewport(width, height);
    assert.equal(await evaluate("(()=>{const sheet=document.querySelector('#campaign-dialog').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth+1&&sheet.left>=0&&sheet.right<=innerWidth+1&&document.querySelector('#campaign-content').scrollWidth<=document.querySelector('#campaign-content').clientWidth+1})()"), true, `${width}px campaign area remains within its sheet`);
    const content = await evaluate("document.querySelector('#campaign-content').textContent");
    for (const expected of ['CAMPAIGN OVERVIEW', 'CAMPAIGN HANGAR', 'Crew Roster', 'Sortie History', 'A. Miles']) assert.ok(content.includes(expected), `Campaign overview contains ${expected}`);
    assert.equal(await evaluate("document.querySelector('[data-aircraft-rename] [name=name]').value"), 'The Milk Wagon');
    await screenshot(`overview-${width}`);
    note(`${width}px: compact campaign overview, aircraft service history, personnel roster and sortie history remain readable and overflow-free`);
  }

  await viewport(390, 844); await launch('campaign-return-browser');
  let state = await getState();
  assert.equal(state.ruleset, 'v2-continuous'); assert.equal(state.config.v2TimePerProgress, 1);
  assert.equal(state.mission.targetId, 'wilhelmshaven'); assert.equal(state.campaign.aircraftId, firstAircraftId);
  assert.deepEqual(state.campaign.crewIds, firstRoster);
  await turn(); await turn(); state = await getState(); assert.equal(state.mission.position, 2);
  await reload(); assert.deepEqual(await getState(), state);
  await openCampaign(); assert.ok(await evaluate("!!document.querySelector('[data-ui=campaign-resume]')"));
  await click('[data-ui="campaign-resume"]'); assert.deepEqual(await getState(), state);
  note('Continue Campaign launches a chosen target with stable assignments; real crew actions travel outbound and reload resumes the exact active sortie');

  await click('[data-ui="turn-back"]');
  assert.match(await evaluate("document.querySelector('#info-content').textContent"), /Fly 2 Progress home/);
  assert.deepEqual(await getState(), state, 'opening the required confirmation has no rule effect');
  await click('#info-dialog [data-ui="close"]'); assert.deepEqual(await getState(), state);
  await confirmAbort(); const aborted = await getState();
  assert.equal(aborted.mission.aborted, true); assert.equal(aborted.mission.abortProgress, 2);
  for (const key of ['crew', 'fighters', 'cells', 'jobs', 'resources', 'escorts', 'time', 'timeTokens', 'bags', 'crewCycle', 'stats']) assert.deepEqual(aborted[key], state[key], `Turn Back preserves ${key}`);
  assert.equal(await evaluate("document.querySelector('[data-ui=turn-back]').hidden"), true);
  await turn(); assert.equal((await getState()).outcome, null);
  await turn(); const returned = await getState();
  assert.equal(returned.outcome, 'success'); assert.equal(returned.mission.position, 4);
  assert.match(await evaluate("document.querySelector('#summary').textContent"), /ABORTED.*AIRCRAFT RETURNED/);
  await openCampaign(); campaign = currentCampaign(await getStore());
  assert.equal(campaign.sorties.length, 1); assert.equal(campaign.stats.abortedMissions, 1);
  assert.equal(campaign.sorties[0].bombing.score, null); assert.equal(campaign.sorties[0].bombing.outcome, null);
  assert.equal(campaign.aircraft[0].missionsSurvived, 1);
  await screenshot('aborted-return-service-record');
  note('TURN BACK requires confirmation, preserves combat state, and outbound2 takes exactly2 further Progress to record ABORTED — AIRCRAFT RETURNED with no bombing credit');

  const finalized = await getStore(); await closeCampaign(); await reload(); await openCampaign();
  assert.deepEqual(await getStore(), finalized);
  await closeCampaign(); await openCampaign(); assert.deepEqual(await getStore(), finalized);
  note('Repeated ended-sortie reloads and Campaign Overview visits finalize the same sortie exactly once');

  await launch('campaign-loss-browser'); state = await getState();
  assert.equal(state.campaign.aircraftId, firstAircraftId); assert.deepEqual(state.campaign.crewIds, firstRoster);
  await turn(); await confirmAbort();
  const doomed = await getState();
  doomed.crew.find(crew => crew.id === 'navigator').health = 'dead';
  doomed.crew.find(crew => crew.id === 'pilot').health = 'injured';
  const compromised = Object.keys(SECTIONS).slice(0, 6);
  for (const cell of BOARD.filter(cell => cell.structure && compromised.includes(cell.section))) doomed.cells[cell.id] = 'damaged';
  doomed.time = doomed.config.v2TimePerProgress; doomed.timeTokens = Array(doomed.time).fill('Time'); doomed.pendingProgress = true;
  for (let index = 0; index < doomed.time; index++) doomed.bags.mission.tokens.splice(doomed.bags.mission.tokens.indexOf('Time'), 1);
  const log = [{ sequence: 1, type: 'CREW_INJURED', crewId: 'pilot', message: 'Pilot injured.' }, { sequence: 2, type: 'CREW_KILLED', crewId: 'navigator', message: 'Navigator killed.' }];
  await inject(doomed, { log });
  assert.equal(await evaluate("window.milkRun.send({type:'continueProgress'})"), true); await flush();
  const lost = await getState();
  assert.equal(lost.outcome, 'destroyed'); assert.equal(lost.compromised.length, 6);
  assert.match(await evaluate("document.querySelector('#summary').textContent"), /ABORTED.*AIRCRAFT LOST/);
  assert.match(await evaluate("document.querySelector('#summary').textContent"), /Structural failure.*6 compromised sections/i);
  await openCampaign(); campaign = currentCampaign(await getStore());
  assert.equal(campaign.stats.totalSorties, 2); assert.equal(campaign.stats.planesLost, 1); assert.equal(campaign.stats.crewKIA, 1);
  assert.equal(campaign.crew.find(crew => crew.id === firstRoster.navigator).kia, true);
  assert.equal(campaign.crew.find(crew => crew.id === firstRoster.pilot).woundsSuffered, 1);
  assert.match(await evaluate("document.querySelector('#campaign-content').textContent"), /ABORTED.*AIRCRAFT LOST/);
  await screenshot('lost-aircraft-personnel-record');
  note('An authoritative structural-failure checkpoint records ABORTED — AIRCRAFT LOST, six compromised sections, permanent Navigator KIA and the surviving pilot wound');

  assert.equal(campaign.aircraft.length, 1, 'no forced aircraft replacement');
  assert.equal(await evaluate('!!document.querySelector("#campaign-launch-form")'), false);
  await touch('.commission-panel > summary');
  await evaluate("document.querySelector('#campaign-commission-form').requestSubmit()");
  await launch('campaign-replacement-browser'); state = await getState(); campaign = currentCampaign(await getStore());
  assert.notEqual(state.campaign.aircraftId, firstAircraftId); assert.notEqual(state.campaign.crewIds.navigator, firstRoster.navigator);
  assert.equal(state.campaign.crewIds.pilot, firstRoster.pilot);
  assert.equal(campaign.aircraft.find(aircraft => aircraft.id === state.campaign.aircraftId).replacement, false);
  assert.equal(campaign.crew.find(crew => crew.id === state.campaign.crewIds.navigator).replacement, true);
  assert.equal(campaign.crew.find(crew => crew.id === firstRoster.navigator).kia, true);
  assert.equal(state.crew.every(crew => crew.health === 'healthy'), true);
  assert.equal(Object.values(state.cells).every(value => value === 'healthy'), true);
  assert.equal(state.jobs.length, 0); assert.equal(state.stats.fightersKilled, 0);
  await openCampaign(); assert.match(await evaluate("document.querySelector('#campaign-content').textContent"), /REPLACEMENT/);
  await screenshot('replacement-roster-390');
  note('Explicit commissioning after loss creates a new aircraft; launch replaces KIA identities while survivors keep identity and mechanics start healthy');

  await b.command('Browser.setDownloadBehavior', { behavior: 'deny' });
  await evaluate("(()=>{const original=URL.createObjectURL;URL.createObjectURL=function(blob){window.__campaignExportBlob=blob;return original.call(this,blob)};})()");
  await click('[data-ui="campaign-export"]');
  const backupText = await evaluate('window.__campaignExportBlob.text()'), backup = JSON.parse(backupText);
  assert.equal(backup.kind, 'milk-run-campaign-backup'); assert.equal(backup.version, 1);
  assert.deepEqual(backup.store, await getStore()); assert.deepEqual(backup.activeSession.state, state);
  await click('.aircraft-edit > summary');
  await evaluate("(()=>{const form=document.querySelector('[data-aircraft-rename]');form.elements.namedItem('name').value='Temporary edited name';form.requestSubmit();})()");
  assert.notDeepEqual(await getStore(), backup.store);
  await evaluate(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(backupText)}],'milk-run-backup.json',{type:'application/json'}));const input=document.querySelector('#campaign-import');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor("!!document.querySelector('[data-ui=campaign-import-confirm]')");
  assert.match(await evaluate("document.querySelector('#campaign-content').textContent"), /2 recorded sorties.*active flight/);
  await click('[data-ui="campaign-import-confirm"]');
  assert.deepEqual(await getStore(), backup.store); assert.deepEqual(await getState(), backup.activeSession.state);
  await reload(); assert.deepEqual(await getStore(), backup.store); assert.deepEqual(await getState(), backup.activeSession.state);
  note('Real Export JSON captures versioned campaign plus active flight; file input Import and confirmation restore exact history and sortie without duplicating stats');

  await confirmAbort(); assert.equal((await getState()).outcome, 'success');
  const beforeStandalone = await getStore();
  await click('[data-ui="new-sortie"]'); await click('#sortie-form input[value="v1"]'); await click('#sortie-form button[type="submit"]');
  assert.equal((await getState()).ruleset, 'v1'); assert.equal((await getState()).campaign, undefined);
  assert.deepEqual(await getStore(), beforeStandalone);
  note('After the campaign flight ends, a standalone V1 launch remains available and leaves all campaign history untouched');

  assert.deepEqual(b.exceptions, []); assert.deepEqual(b.badResponses, []);
  await b.writeResults({ passed: checks.length, checks, widths: [320, 360, 390, 768, 1440], exceptions: b.exceptions, badResponses: b.badResponses });
  console.log(JSON.stringify({ passed: checks.length, artifacts: b.artifacts }, null, 2));
} finally { await b.close(); }
