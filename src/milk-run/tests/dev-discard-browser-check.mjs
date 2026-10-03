import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openBrowser } from './browser-harness.mjs';
import { CAMPAIGN_STORE_KEY } from '../campaign.mjs';
import { SAVE_KEY } from '../persistence.mjs';
import { parseCampaignBackup } from '../campaign-session.mjs';

const b = await openBrowser({ port: 9356, artifactFolder: 'dev-discard' });
const { evaluate, click, viewport, inject, reload, getState, screenshot } = b;
const checks = [], note = text => { checks.push(text); console.log(text); };
const widths = [320, 360, 390, 430, 768, 1440];
const legacy = parseCampaignBackup(JSON.parse(readFileSync(new URL('./fixtures/campaign-v1-backup.json', import.meta.url), 'utf8')));
const state = structuredClone(legacy.activeSession.state), original = legacy.store;
const getStore = () => evaluate('window.milkRun.getCampaignStore()');
const getRaw = key => evaluate(`localStorage.getItem(${JSON.stringify(key)})`);
async function reset(flight = state, extra = {}) {
  await evaluate(`localStorage.setItem(${JSON.stringify(CAMPAIGN_STORE_KEY)},${JSON.stringify(JSON.stringify(original))})`);
  await inject(structuredClone(flight), extra);
}
async function openDiscard() { await click('[data-ui=dev]'); await click('[data-ui=discard-campaign]'); }
async function launch() {
  await click(`[name=aircraftId][value="${state.campaign.aircraftId}"]`);
  await click('#campaign-launch-form button[type=submit]');
}
try {
  for (const width of widths) {
    await viewport(width, width < 768 ? 844 : 1024);
    for (const [outbound, home] of [[1,1],[2,1],[3,1],[4,2],[5,2],[6,3],[7,3]]) {
      const flight = structuredClone(state); flight.mission.position = outbound;
      await reset(flight); await click('[data-ui=turn-back]');
      assert.match(await evaluate("document.querySelector('#info-content').textContent"), new RegExp(`Emergency return: ${home} Progress`));
      assert.deepEqual(await getState(), flight);
      await click('[data-ui=confirm-turn-back]'); await b.flush();
      assert.match(await evaluate("document.querySelector('#mission-label').textContent"), new RegExp(`ABORTED.*${home} PROGRESS TO HOME.*EMERGENCY ROUTE`));
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
    }
    await screenshot(`emergency-return-${width}`);
    await openDiscard();
    const text = await evaluate("document.querySelector('#info-content').textContent");
    for (const copy of ['will not be added to Campaign history', 'pre-sortie Campaign availability', 'cannot be undone']) assert.ok(text.includes(copy));
    assert.equal(await evaluate("(()=>{const d=document.querySelector('#info-dialog');return d.scrollWidth<=d.clientWidth+1&&d.getBoundingClientRect().right<=innerWidth+1})()"), true);
    await screenshot(`discard-confirmation-${width}`);
    await click('[data-ui=cancel-discard]'); await click('#dev-dialog [data-ui=close]');
    note(`${width}px: seven exact Turn Back distances, emergency route label and destructive confirmation fit the viewport`);
  }

  await reset();
  assert.equal(await evaluate("document.querySelectorAll('#campaign-dialog [data-ui=discard-campaign]').length"), 0);
  const beforeSession = await evaluate('window.milkRun.exportSession()'), beforeStore = await getRaw(CAMPAIGN_STORE_KEY), beforeSave = await getRaw(SAVE_KEY);
  await openDiscard(); await click('[data-ui=cancel-discard]');
  assert.deepEqual(await evaluate('window.milkRun.exportSession()'), beforeSession);
  assert.equal(await getRaw(CAMPAIGN_STORE_KEY), beforeStore); assert.equal(await getRaw(SAVE_KEY), beforeSave);
  await click('#dev-dialog [data-ui=close]');
  note('Discard exists only in Dev; Cancel leaves exact session, history and autosave untouched');

  await evaluate("window.milkRun.setSpeed('manual');window.milkRun.send({type:'activate',crewId:'pilot'})");
  assert.ok((await evaluate('window.milkRun.getQueue()')).length > 0);
  await openDiscard(); await click('[data-ui=confirm-discard]');
  const expected = structuredClone(original); expected.campaigns[0].activeSortie = null;
  assert.deepEqual(await getStore(), expected); assert.equal(await getRaw(SAVE_KEY), null);
  assert.equal((await getState()).campaign, undefined); assert.equal((await evaluate('window.milkRun.getQueue()')).length, 0);
  assert.equal(await evaluate("document.querySelector('#campaign-dialog').open"), true);
  assert.ok(await evaluate("!!document.querySelector('#campaign-launch-form')"));
  const hangar = await evaluate("document.querySelector('#campaign-content').textContent");
  assert.match(hangar, /Available/); assert.doesNotMatch(hangar, /Currently on sortie/);
  await screenshot('discarded-hangar');
  note('Confirmed discard during pending presentation clears queue/autosave/linkage, releases the aircraft and preserves all prior finalized history/KIA/losses');

  await click('#campaign-dialog [data-ui=close]'); await click('[data-ui=dev]');
  assert.equal(await evaluate("document.querySelector('[data-ui=discard-campaign]').disabled"), true);
  await click('#dev-dialog [data-ui=close]');
  assert.equal(await getRaw(SAVE_KEY), null, 'UI renders cannot recreate the discarded save');
  await reload(); assert.deepEqual(await getStore(), expected); assert.equal((await getState()).campaign, undefined);
  if (await evaluate("document.querySelector('#sortie-dialog').open")) await click('#sortie-dialog [data-ui=close]');
  await click('[data-ui=campaign]'); await launch();
  const next = await getState();
  assert.notEqual(next.campaign.sortieId, state.campaign.sortieId); assert.deepEqual(next.campaign.crewIds, state.campaign.crewIds);
  assert.equal(next.campaign.aircraftId, state.campaign.aircraftId);
  assert.deepEqual((await getStore()).campaigns[0].sorties, original.campaigns[0].sorties);
  note('No active sortie disables discard; reload cannot resume it, and Hangar launches immediately with the same available aircraft/crew');

  await b.command('Browser.setDownloadBehavior', { behavior: 'deny' });
  await evaluate("URL.createObjectURL=(blob)=>{window.__backup=blob;return 'blob:discard-export'}");
  await click('[data-ui=campaign]'); await click('[data-ui=campaign-export]');
  const exported = await evaluate('window.__backup.text()');
  const parsed = parseCampaignBackup(exported); assert.deepEqual(parsed.activeSession.state, next);
  assert.deepEqual(parsed.store, await getStore()); await click('#campaign-dialog [data-ui=close]');
  note('Export after discard and relaunch validates the exact new reservation and session with untouched history');

  await reset(); await openDiscard();
  const savedStore = await getRaw(CAMPAIGN_STORE_KEY), savedFlight = await getRaw(SAVE_KEY);
  await evaluate(`window.__remove=Storage.prototype.removeItem;Storage.prototype.removeItem=function(key){if(key===${JSON.stringify(SAVE_KEY)}){Storage.prototype.removeItem=window.__remove;throw new Error('test removal denied')}return window.__remove.call(this,key)}`);
  await click('[data-ui=confirm-discard]');
  assert.equal(await getRaw(CAMPAIGN_STORE_KEY), savedStore); assert.equal(await getRaw(SAVE_KEY), savedFlight);
  assert.deepEqual(await getStore(), original); assert.deepEqual(await getState(), state);
  note('Storage removal failure restores both keys and keeps the live sortie/reservation usable');

  const ended = structuredClone(state); ended.phase = 'ended'; ended.outcome = 'destroyed';
  await reset(ended); await click('[data-ui=dev]');
  assert.equal(await evaluate("document.querySelector('[data-ui=discard-campaign]').disabled"), true);
  assert.equal((await getStore()).campaigns[0].sorties.length, original.campaigns[0].sorties.length + 1);
  note('Finalized aircraft loss disables discard and remains in history');

  assert.deepEqual(b.exceptions, []); assert.deepEqual(b.badResponses, []);
  await b.writeResults({ passed: checks.length, checks, widths, exceptions: b.exceptions, badResponses: b.badResponses });
  console.log(JSON.stringify({ passed: checks.length, artifacts: b.artifacts }));
} finally { await b.close(); }
