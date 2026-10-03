import assert from 'node:assert/strict';
import { openBrowser } from './browser-harness.mjs';
import { createGame } from '../state.mjs';
import { dispatch } from '../rules.mjs';
import { beginBombRun, BOMBING_TARGETS, bombRunPreview } from '../bombing.mjs';
import { die } from '../random.mjs';
import { createCampaignStore, createCampaign, prepareCampaignSortie, finalizeCampaignSortie, CAMPAIGN_STORE_KEY } from '../campaign.mjs';

const b = await openBrowser({ port: 9355, artifactFolder: 'bomb-run-test' });
const { evaluate, click, touch, viewport, inject, reload, getState } = b;
const checks = [], note = text => { checks.push(text); console.log(text); };
const selector = text => `#bomb-run-test-dialog ${text}`;
const testState = async () => (await evaluate('window.milkRun.getBombRunTest()')).state;
const snapshot = () => evaluate(`({session:structuredClone(window.milkRun.exportSession()),campaign:window.milkRun.getCampaignStore(),preferences:window.milkRun.getPreferences(),storage:Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))})`);
const spy = () => evaluate(`(()=>{window.__writes=[];if(!window.__storageOriginal){window.__storageOriginal={};for(const method of ['setItem','removeItem','clear']){window.__storageOriginal[method]=Storage.prototype[method];Storage.prototype[method]=function(...args){window.__writes.push([method,...args]);return window.__storageOriginal[method].apply(this,args)}}}})()`);
const assertIsolated = async before => {
  assert.deepEqual(await snapshot(), before, 'complete live state, queue, history, identities, preferences and all storage unchanged');
  assert.deepEqual(await evaluate('window.__writes'), [], 'not even an identical autosave or campaign write');
  const after = await getState();
  assert.equal(die({ rng: after.rng }), die({ rng: before.session.state.rng }), 'next real d6 is identical');
  const command = after.phase === 'bombing' ? { type: 'rerollBombDie', source: 'free', dieIndex: 0 } : after.phase === 'select' ? { type: 'activate', crewId: 'pilot' } : null;
  if (command) assert.deepEqual(dispatch(after, command), dispatch(before.session.state, command), 'next real production command, RNG and all events are identical');
};
async function open() { await click('[data-ui=dev]'); const before = await snapshot(); await spy(); await click('[data-ui=test-bomb-run]'); return before; }
async function place(select = click) { for (const [dieIndex, slot] of ['course','drift','release'].entries()) { await select(selector(`[data-bomb-die="${dieIndex}"]`)); await select(selector(`[data-bomb-slot="${slot}"]`)); } }
async function play(select = click) {
  assert.equal(await evaluate("document.querySelector('#bomb-run-test-dialog').open"), true);
  assert.match(await evaluate("document.querySelector('#bomb-run-test-dialog').textContent"), /BOMB RUN TEST — RESULTS ARE NOT SAVED/);
  let state = await testState();
  assert.equal(state.mission.bombRun.dice.length, 4); assert.ok(state.mission.bombRun.dice.every(d => d >= 1 && d <= 6));
  assert.equal(state.mission.bombRun.operatorId, 'bombardier'); assert.equal(state.resources.Officer, 3);
  await select(selector('[data-bomb-die="0"]')); const rng = { rng: state.rng };
  await select(selector('[data-bomb-reroll="free"]')); state = await testState();
  assert.equal(state.mission.bombRun.dice[0], die(rng)); assert.equal(state.resources.Officer, 3);
  assert.equal(state.mission.bombRun.freeRerollUsed, true);
  for (let i = 0; i < 3; i++) await select(selector('[data-bomb-reroll="officer"]'));
  state = await testState(); assert.equal(state.resources.Officer, 0); assert.equal(state.mission.bombRun.officerRerollsSpent, 3);
  assert.equal(await evaluate(`document.querySelector('${selector('[data-bomb-reroll="officer"]')}').disabled`), true);
  await place(select); state = await testState(); const expected = bombRunPreview(state);
  assert.deepEqual(state.mission.bombRun.placement, { course: 0, drift: 1, release: 2 }); assert.equal(state.mission.bombRun.unusedDie, 3);
  await select(selector('[data-command=commitBombRun]')); state = await testState();
  assert.equal(state.mission.bombRun.committedScore, expected.total); assert.equal(state.mission.bombRun.outcome, expected.outcome);
  assert.match(await evaluate("document.querySelector('.bomb-test-result').textContent"), /BOMB RUN.*TOTAL/);
}
function active() {
  const state = createGame({}, 'active-bomb-run-must-not-change', 'v2-continuous');
  state.phase = 'bombing'; state.mission.position = 8; state.mission.targetId = 'schweinfurt';
  state.time = 1; state.timeTokens = ['Time']; state.bags.mission.tokens.splice(state.bags.mission.tokens.indexOf('Time'), 1);
  state.overflowTimeTokens = ['Time']; state.bags.mission.tokens.splice(state.bags.mission.tokens.indexOf('Time'), 1);
  state.crew.find(c => c.id === 'tail').health = 'injured';
  state.jobs = [{ id: 'repair', kind: 'repair', crewId: 'radio', remainingTime: 3, cells: ['B2-4'], workCellId: 'C2-2' }];
  Object.assign(state.crew.find(c => c.id === 'radio'), { job: 'repair', station: null, displaced: true, position: ['C2-2'] });
  state.cells['B2-4'] = 'damaged';
  state.fighters = [{ id: 'enemy', type: 'BF-109', hp: 2, maxHp: 2, quadrant: 'Fore', altitude: 'High', facing: 0, heading: 180, engagementRemaining: 3 }];
  beginBombRun(state, () => {}); return state;
}
try {
  await evaluate('localStorage.clear()'); await reload();
  assert.equal(await evaluate("document.querySelector('#sortie-dialog').open"), true);
  await click('#sortie-dialog [data-ui=close]');
  let before = await open(); await play(); await click(selector('[data-test-close]')); await assertIsolated(before);
  assert.equal(await evaluate('window.milkRun.getBombRunTest()'), null);
  assert.equal(await evaluate("document.querySelector('#dev-dialog').open"), true);
  note('No launched sortie: complete tester flow leaves initial chooser game/session and storage untouched');

  for (const width of [320,360,390,430,768,1440]) {
    await viewport(width, width < 768 ? 900 : 1100); await inject(active()); before = await open();
    const select = width < 768 ? touch : click;
    await play(select); await assertIsolated(before);
    const previous = await testState();
    await select(selector('[data-test-again]')); let state = await testState();
    assert.equal(state.mission.targetId, previous.mission.targetId); assert.notEqual(state.seed, previous.seed);
    assert.equal(state.resources.Officer, 3); assert.equal(state.mission.bombRun.freeRerollAvailable, true);
    assert.equal(state.mission.bombRun.committedScore, null);
    for (const target of Object.values(BOMBING_TARGETS)) {
      await evaluate(`(()=>{const select=document.querySelector('[data-test-target]');select.value=${JSON.stringify(target.id)};select.dispatchEvent(new Event('change',{bubbles:true}))})()`);
      assert.deepEqual((await testState()).mission.bombRun.target, target);
    }
    await place(select); await select(selector('[data-command=commitBombRun]'));
    const number = await evaluate('window.milkRun.getBombRunTest().number');
    await select(selector('[data-test-random]')); state = await testState();
    assert.ok(BOMBING_TARGETS[state.mission.targetId]); assert.equal(await evaluate('window.milkRun.getBombRunTest().number'), number + 1);
    assert.equal(await evaluate("document.querySelector('[data-test-target]').value"), 'random');
    const geometry = await evaluate(`(()=>{const d=document.querySelector('#bomb-run-test-dialog'),r=d.getBoundingClientRect(),p=d.querySelector('.bomb-run').getBoundingClientRect();return {page:document.documentElement.scrollWidth<=innerWidth+1,dialog:r.left>=0&&r.right<=innerWidth+1,content:d.scrollWidth<=d.clientWidth+1,panel:p.left>=0&&p.right<=innerWidth+1,buttons:[...d.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44)}})()`);
    assert.deepEqual(geometry, {page:true,dialog:true,content:true,panel:true,buttons:true});
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.bomb-test-banner h2')).color"), 'rgb(255, 243, 198)');
    await b.screenshot(`tester-${width}`); await select(selector('[data-test-close]')); await assertIsolated(before);
    note(`${width}px: production touch/mouse controls, rerolls, Commit/result, all targets, Test Again, random reset and exact live Bomb Run isolation`);
  }

  const created = createCampaign(createCampaignStore());
  let prepared = prepareCampaignSortie(created.store, created.campaign.id, createGame({}, 'history', 'v2-continuous'), { aircraftId: created.campaign.currentAircraftId });
  prepared.state.phase = 'ended'; prepared.state.outcome = 'success'; prepared.state.endedAt = Date.now();
  const recorded = finalizeCampaignSortie(prepared.store, prepared.state).store;
  prepared = prepareCampaignSortie(recorded, created.campaign.id, createGame({}, 'campaign', 'v2-continuous'), { aircraftId: created.campaign.currentAircraftId });
  const flight = { ...active(), campaign: prepared.state.campaign };
  await evaluate(`localStorage.setItem(${JSON.stringify(CAMPAIGN_STORE_KEY)},${JSON.stringify(JSON.stringify(prepared.store))})`); await inject(flight);
  before = await open(); await play(); await click(selector('[data-test-again]')); await click(selector('[data-test-close]')); await assertIsolated(before);
  assert.equal((await evaluate('window.milkRun.getCampaignStore()')).campaigns[0].sorties.length, 1);
  note('Active Campaign with existing aircraft/crew/sortie history and live Bomb Run remains exactly unchanged; zero persistence writes');

  const pendingState = createGame({}, 'pending-flight', 'v2-continuous'), result = dispatch(pendingState, { type: 'activate', crewId: 'pilot' });
  await inject(result.state, { view: pendingState, pending: result.events, presenting: true, speed: 'normal' });
  before = await open(); await play(); await evaluate('new Promise(resolve=>setTimeout(resolve,1000))'); await assertIsolated(before);
  await b.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await b.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate('window.milkRun.getBombRunTest()'), null); await assertIsolated(before);
  note('Pending presentation snapshots/queue stay identical during tester and Escape close');

  await click('[data-ui=test-bomb-run]'); await evaluate("document.querySelector('#bomb-run-test-dialog').dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:-10,clientY:-10}))");
  assert.equal(await evaluate('window.milkRun.getBombRunTest()'), null); await assertIsolated(before);
  await click('[data-ui=test-bomb-run]'); await reload();
  assert.equal(await evaluate('window.milkRun.getBombRunTest()'), null); assert.deepEqual(await getState(), before.session.state);
  note('Backdrop discards tester; reload loses temporary test and resumes exact saved flight');

  // Even a live automatic presentation timer must not advance behind the modal.
  await inject(result.state, { view: pendingState, pending: result.events, presenting: true, speed: 'normal' });
  await click('[data-ui=dev]'); await spy();
  before = await evaluate(`(()=>{document.querySelector('[data-ui=play]').click();window.__writes=[];const before={session:structuredClone(window.milkRun.exportSession()),campaign:window.milkRun.getCampaignStore(),preferences:window.milkRun.getPreferences(),storage:Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))};document.querySelector('[data-ui=test-bomb-run]').click();return before})()`);
  await evaluate('new Promise(resolve=>setTimeout(resolve,1800))'); await assertIsolated(before);
  await click(selector('[data-test-close]')); await assertIsolated(before);
  await b.waitFor('JSON.stringify(window.milkRun.exportSession().current)!=='+JSON.stringify(JSON.stringify(before.session.current)));
  await click('[data-ui=dev]');
  note('Automatic presentation timer is suspended without serialized mutations and resumes after Close');

  await click('[data-ui=dev]');
  await evaluate("const setting=document.querySelector('[name=v2CrewCycleRefreshGrantsTime]');setting.checked=false;setting.dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await evaluate('window.milkRun.getPreferences().v2CrewCycleRefreshGrantsTime'), false);
  await click('[data-ui=reset-v2]'); assert.equal(await evaluate('window.milkRun.getPreferences().v2CrewCycleRefreshGrantsTime'), true);
  assert.equal(await evaluate("document.querySelector('[name=v2CrewCycleRefreshGrantsTime]').checked"), true);
  note('Playtest checkbox still disables cycle Time; Reset V2 restores ON');
  assert.deepEqual(b.exceptions, []); assert.deepEqual(b.badResponses, []);
  await b.writeResults({ passed: checks.length, checks, widths: [320,360,390,430,768,1440], exceptions: b.exceptions, badResponses: b.badResponses });
  console.log(JSON.stringify({passed:checks.length,artifacts:b.artifacts},null,2));
} finally { await b.close(); }
