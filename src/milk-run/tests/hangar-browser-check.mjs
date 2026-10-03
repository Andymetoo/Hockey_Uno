import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openBrowser } from './browser-harness.mjs';
import { CAMPAIGN_STORE_KEY } from '../campaign.mjs';
import { beginBombRun, placeBombDie, commitBombRun } from '../bombing.mjs';
const b = await openBrowser({ port: 9354, artifactFolder: 'hangar' });
const { evaluate, touch, click, reload, getState, viewport, screenshot, inject, flush, waitFor } = b;
const checks = [], note = message => { checks.push(message); console.log(message); };
const store = () => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(CAMPAIGN_STORE_KEY)}))`);
const campaign = async () => { const s = await store(); return s.campaigns.find(c => c.id === s.activeCampaignId); };
const open = () => click('[data-ui="campaign"]');
const close = () => click('#campaign-dialog [data-ui="close"]');
async function commission(name) {
  await touch('.commission-panel > summary');
  await evaluate(`document.querySelector('#campaign-commission-form [name=name]').value=${JSON.stringify(name)}`);
  await touch('#campaign-commission-form button');
  return (await campaign()).aircraft.at(-1).id;
}
async function launch(id) {
  assert.equal(await evaluate('!!document.querySelector("[name=aircraftId]:checked")'), false, 'every flight asks for selection');
  await touch(`[name=aircraftId][value="${id}"]`);
  await touch('#campaign-launch-form button[type=submit]');
  assert.equal((await getState()).campaign.aircraftId, id);
  assert.equal(await evaluate('document.querySelector("#campaign-dialog").open'), false);
}
async function finish({ lost = false, kills = 0, dead = null } = {}) {
  const state = await getState(); state.phase = 'bombing'; state.mission.position = 8;
  beginBombRun(state, () => {}); state.mission.bombRun.dice = [3, 3, 4, 6];
  for (const [i, slot] of ['course', 'drift', 'release'].entries()) placeBombDie(state, slot, i, () => {});
  commitBombRun(state, () => {});
  state.phase = 'ended'; state.outcome = lost ? 'destroyed' : 'success'; state.endedAt = Date.now();
  state.mission.position = lost ? 9 : 11; state.stats.fightersKilled = kills;
  if (dead) state.crew.find(c => c.id === dead).health = 'dead';
  if (lost) { state.endReason = { cause: 'structure', compromisedSections: 6 }; state.compromised = ['nose', 'cockpit', 'radio', 'waist', 'tail', 'wing']; }
  await inject(state, { log: Array.from({ length: kills }, (_, i) => ({ sequence: i + 1, type: 'FIGHTER_DESTROYED', fighterId: `f${i}`, crewId: 'radio', fighterType: 'BF-109' })) });
  return state;
}
try {
  await evaluate('localStorage.clear()'); await reload();
  if (await evaluate('document.querySelector("#sortie-dialog").open')) await click('#sortie-form button[type=submit]');
  await viewport(390, 844); await open(); await touch('[data-ui=campaign-new]');
  await touch('#campaign-new-form button');
  const a = (await campaign()).aircraft[0].id;
  assert.equal(await evaluate('document.querySelector("#campaign-launch-form").checkValidity()'), false);
  const secondName = 'Lucky Penny — ' + 'B'.repeat(60), second = await commission(secondName);
  assert.equal((await campaign()).aircraft.length, 2); assert.equal((await campaign()).aircraft[0].lost, false);
  assert.equal(await evaluate('document.querySelectorAll("[name=aircraftId]").length'), 2);
  note('Commissioning a named second aircraft keeps the surviving first aircraft; launch requires a player choice');

  await launch(second); const active = await getState(); await reload(); assert.deepEqual(await getState(), active);
  await open(); assert.match(await evaluate('document.querySelector("#campaign-content").textContent'), /CURRENTLY ON SORTIE/);
  assert.equal(await evaluate('document.querySelectorAll("[name=aircraftId]").length'), 0);
  await touch('[data-ui=campaign-resume]');
  await finish({ kills: 2 }); await open();
  let c = await campaign(); assert.equal(c.aircraft[0].missionsFlown, 0); assert.equal(c.aircraft[1].missionsFlown, 1);
  assert.equal(c.aircraft[1].fightersDestroyed, 2); assert.equal(c.aircraft[1].bombingHistory[0].outcome, 'destroyed');
  await launch(a); await finish({ kills: 1, lost: true, dead: 'radio' });
  await waitFor('document.querySelector("#campaign-dialog").open');
  c = await campaign(); assert.equal(c.aircraft.length, 2); assert.equal(c.aircraft[0].lost, true); assert.equal(c.aircraft[1].lost, false);
  assert.equal(await evaluate(`document.querySelector('[data-aircraft-card="${a}"]').querySelectorAll('[name=aircraftId],form, [data-ui=campaign-launch]').length`), 0);
  assert.equal(await evaluate('document.querySelectorAll("[name=aircraftId]").length'), 1);
  assert.match(await evaluate('document.querySelector("#campaign-content").textContent'), /Structural failure.*6 compromised sections/);
  note('Selecting B then A credits their own kills and bombing; losing A returns to Hangar with B selectable and A permanently memorialized');

  const radio = c.crew.find(m => m.kia).id;
  for (const [width, height] of [[320, 740], [360, 800], [390, 844], [430, 900], [768, 1024], [1440, 1000]]) {
    await viewport(width, height);
    await evaluate(`document.querySelector('[data-aircraft-service="${a}"]').open=false`);
    await touch(`[data-aircraft-service="${a}"] > summary`);
    await touch(`[data-aircraft-service="${a}"] [data-service-personnel="${radio}"]`);
    assert.equal(await evaluate(`document.querySelector('[data-personnel-service="${radio}"]').open`), true);
    assert.equal(await evaluate('document.querySelector(".personnel-archive").open'), true);
    await touch(`[data-personnel-service="${radio}"] [data-service-aircraft="${second}"]`);
    assert.equal(await evaluate(`document.querySelector('[data-aircraft-service="${second}"]').open`), true);
    await evaluate('document.querySelectorAll(".aircraft-edit").forEach(e=>e.open=true)');
    assert.equal(await evaluate('(()=>{const d=document.querySelector("#campaign-dialog"),c=document.querySelector("#campaign-content"),r=d.getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth+1&&r.left>=0&&r.right<=innerWidth+1&&c.scrollWidth<=c.clientWidth+1})()'), true, `${width}px long names and expanded histories fit`);
    await screenshot(`service-record-${width}`);
    note(`${width}px: multiple aircraft, expanded service records, long names and aircraft/personnel touch cross-links fit`);
  }
  await viewport(390, 844); await close(); await open(); await launch(second);
  const after = await getState(); assert.notEqual(after.campaign.crewIds.radio, radio);
  assert.equal((await campaign()).aircraft.length, 2); assert.equal(after.crew.every(c => c.health === 'healthy'), true);
  assert.equal(Object.values(after.cells).every(v => v === 'healthy'), true);
  await open(); const third = await commission('Third Wing');
  assert.equal((await campaign()).activeSortie.aircraftId, second);
  assert.equal((await campaign()).aircraft.length, 3);
  await touch('[data-ui=campaign-resume]');
  await click('[data-ui=turn-back]'); await click('[data-ui=confirm-turn-back]'); await flush();
  const returning = await getState();
  assert.equal(returning.outcome, null); assert.equal(returning.mission.emergencyReturnLength, 1);
  returning.time = returning.config.v2TimePerProgress; returning.pendingProgress = true;
  returning.timeTokens = Array(returning.time).fill('Time');
  for (let i = 0; i < returning.time; i++) returning.bags.mission.tokens.splice(returning.bags.mission.tokens.indexOf('Time'), 1);
  await inject(returning);
  assert.equal(await evaluate("window.milkRun.send({type:'continueProgress'})"), true); await flush();
  assert.equal((await getState()).outcome, 'success'); assert.equal((await getState()).mission.position, 1);
  await open(); await launch(third);
  note('B flies again after A is lost; KIA receives a new identity; commissioning C during B’s flight preserves B’s active assignment');

  await open(); await b.command('Browser.setDownloadBehavior', { behavior: 'deny' });
  await evaluate('(()=>{const original=URL.createObjectURL;URL.createObjectURL=blob=>{window.__backup=blob;return original(blob)}})()');
  await click('[data-ui=campaign-export]'); const exported = await evaluate('window.__backup.text()');
  assert.equal(JSON.parse(exported).store.campaigns[0].aircraft.length, 3);
  async function importFile(text) {
    await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(text)}],'hangar.json',{type:'application/json'}));const input=document.querySelector('#campaign-import');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await waitFor('!!document.querySelector("[data-ui=campaign-import-confirm]")'); await click('[data-ui=campaign-import-confirm]');
  }
  await importFile(exported); assert.deepEqual(await store(), JSON.parse(exported).store);
  await reload(); assert.equal((await getState()).campaign.aircraftId, third);
  await open();
  const legacy = readFileSync(new URL('./fixtures/campaign-v1-backup.json', import.meta.url), 'utf8');
  await importFile(legacy); const imported = await store();
  assert.equal(imported.version, 2); assert.deepEqual((await getState()).campaign, JSON.parse(legacy).activeSession.state.campaign);
  assert.equal(imported.campaigns[0].aircraft.length, 2); assert.equal(imported.campaigns[0].aircraft[1].replacement, true);
  await reload(); assert.equal((await getState()).campaign.aircraftId, imported.campaigns[0].aircraft[1].id);
  note('Real file Import/Export preserves all three Hangar identities and active selection; version-1 backup migrates its replacement and resumes the exact reserved plane');
  assert.deepEqual(b.exceptions, []); assert.deepEqual(b.badResponses, []);
  await b.writeResults({ passed: checks.length, checks, widths: [320, 360, 390, 430, 768, 1440], exceptions: b.exceptions, badResponses: b.badResponses });
  console.log(JSON.stringify({ passed: checks.length, artifacts: b.artifacts }));
} finally { await b.close(); }
