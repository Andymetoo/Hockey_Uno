import assert from 'node:assert/strict';
import { openBrowser } from './browser-harness.mjs';
import { createGame } from '../state.mjs';
import { dispatch } from '../rules.mjs';
import { CONFIG_FIELDS, DEFAULT_CONFIG } from '../config.mjs';
import { DEV_PREFERENCE_KEYS } from '../persistence.mjs';
import { fighter } from './fixtures.mjs';

const b = await openBrowser({ port: 9342, artifactFolder: 'dev-tools' });
const { evaluate, click, touch, viewport, inject, getState, getView, flush, screenshot } = b;
const checks = [], widths = [1440, 768, 320, 360, 390];
const note = text => { checks.push(text); console.log(text); };
const fresh = overrides => createGame({ opportunityEnabled: false, ...overrides }, 'ui-dev-pass', 'v2-continuous');
async function editFields(values) {
  await evaluate(`(() => { const form=document.querySelector('#dev-form');
    for(const [key,value] of Object.entries(${JSON.stringify(values)})) {
      const input=form.elements.namedItem(key);if(input.type==='checkbox')input.checked=value;else input.value=value;
    } form.dispatchEvent(new Event('change',{bubbles:true})); })()`);
}
async function launch(ruleset) {
  await click(`[name="ruleset"][value="${ruleset}"]`);
  await click('#sortie-form button[type=submit]');
}
async function nextUntil(type) {
  for (let step = 0; step < 160; step++) {
    if ((await b.current())?.type === type) return;
    assert.ok(await evaluate('window.milkRun.exportSession().presenting'), `still presenting before ${type}`);
    await click('[data-ui=step]');
  }
  assert.fail(`did not reach ${type}`);
}

try {
  await inject(createGame()); await viewport(1440, 1000);
  assert.equal(await evaluate("document.querySelector('#ruleset-label').textContent"), 'V1 — ROUND-BASED');
  await click('[data-ui=dev]'); await click('[data-ui=reset-defaults]');
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.config-scope')].map(e=>e.dataset.scope)"), ['common', 'v1', 'v2']);
  for (const field of CONFIG_FIELDS) assert.ok(await evaluate(`!!document.querySelector('#dev-form [name="${field.key}"]')`), field.key);
  assert.equal(await evaluate("document.querySelectorAll('[data-config-scope=v2] .experimental-badge').length"), CONFIG_FIELDS.filter(f => f.scope === 'v2').length);
  const custom = {
    combatHit: 9, combatBurst: 3, combatMiss: 5, bf109Hp: 6,
    outboundLength: 7, returnLength: 4, missionEnemy: 2, missionResource: 8,
    v2CrewCycleTurns: 10, v2MissionEnemy: 7, v2MissionResource: 9, v2MissionTime: 12,
    v2TimePerProgress: 3, v2OutboundLength: 2, v2ReturnLength: 2,
    v2RepairTime: 5, v2FireTime: 7, v2MedicalTime: 9,
    v2AssistedRepairTime: 2, v2AssistedFireTime: 3, v2AssistedMedicalTime: 4,
    v2Bf109Engagement: 3, v2Bf110Engagement: 4, v2Fw190Engagement: 6, v2Me262Engagement: 7,
    v2EngagementMode: 'attack-pass-only', v2RefillAtProgress: false,
    v2FighterKillGrantsTime: false, v2DisruptEnabled: false, v2DisruptEffect: 'auto-miss', v2MaxEscorts: 3,
    v2NavigatorUnmannedTimePenalty: 1, v2CrewCycleRefreshGrantsTime: true, v2UnavailableCrewPressure: 'compressed',
  };
  const oldV1 = await getState(); await editFields(custom);
  assert.deepEqual(await getState(), oldV1, 'editing all construction controls preserves active V1');
  const documents = await evaluate(`Object.fromEntries(Object.entries(${JSON.stringify(DEV_PREFERENCE_KEYS)}).map(([scope,key])=>[scope,JSON.parse(localStorage.getItem(key))]))`);
  assert.equal(documents.v1.overrides.outboundLength, 7);
  assert.equal(documents.v1.overrides.v2RepairTime, undefined);
  assert.equal(documents.v2.overrides.v2RepairTime, 5);
  assert.equal(documents.v2.overrides.combatHit, undefined);
  assert.equal(documents.common.overrides.combatHit, 9);
  await click('[data-ui=apply-dev]'); await launch('v2-continuous');
  const customV2 = await getState();
  for (const [key, value] of Object.entries(custom)) assert.equal(customV2.config[key], value, `${key} reaches the new sortie`);
  assert.deepEqual(['Enemy', 'Resource', 'Time'].map(t => customV2.bags.mission.tokens.filter(v => v === t).length), [7, 9, 12]);
  assert.equal(await evaluate("document.querySelector('#ruleset-label').textContent"), 'V2 — CONTINUOUS TIME · EXPERIMENTAL');
  assert.match(await evaluate("document.querySelector('#rules-modified').textContent"), /COMMON.*V2/);
  assert.doesNotMatch(await evaluate("document.querySelector('#rules-modified').textContent"), /V1/);
  await click('[data-ui=dev]'); await click('[data-ui=reset-v1]');
  let preferences = await evaluate('window.milkRun.getPreferences()');
  assert.equal(preferences.outboundLength, 14); assert.equal(preferences.v2RepairTime, 5); assert.equal(preferences.combatHit, 9);
  assert.deepEqual(await getState(), customV2);
  await editFields({ outboundLength: 11 }); await click('[data-ui=reset-v2]');
  preferences = await evaluate('window.milkRun.getPreferences()');
  assert.equal(preferences.outboundLength, 11); assert.equal(preferences.v2RepairTime, 4); assert.equal(preferences.combatHit, 9);
  for (const key of Object.keys(DEFAULT_CONFIG).filter(key => key.startsWith('v2'))) assert.equal(preferences[key], DEFAULT_CONFIG[key], `Reset V2: ${key}`);
  await click('#dev-dialog [data-ui=close]'); await b.reload();
  assert.deepEqual(await getState(), customV2);
  assert.deepEqual(await evaluate('window.milkRun.getPreferences()'), preferences);
  note('All V2 controls persist into a fresh V2 sortie; Common/V1/V2 records and both resets remain independent');

  for (const width of widths) {
    await viewport(width, width < 768 ? 844 : 1000);
    const state = fresh(); state.time = 3; state.timeTokens = Array(3).fill('Time');
    state.bags.mission.tokens.splice(state.bags.mission.tokens.indexOf('Time'), 3);
    state.crewCycle.turn = 6; state.slot = 6; state.stats.turns = 6;
    for (const crew of state.crew.slice(0, 6)) { crew.used = true; crew.cycleSlotConsumed = true; }
    state.fighters = [fighter('eng-visible', { engagementRemaining: 3 })];
    await inject(state); await evaluate('scrollTo(0,0)');
    const layout = await evaluate(`(() => {const hud=document.querySelector('#status');return {
      count:hud.querySelectorAll('.hud-metric').length,height:hud.getBoundingClientRect().height,
      header:document.querySelector('.topbar').getBoundingClientRect().height,
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      labels:[...hud.querySelectorAll('.hud-metric')].map(e=>e.getAttribute('aria-label')),
    }})()`);
    assert.equal(layout.count, 6); assert.equal(layout.overflow, false);
    await screenshot(`six-clocks-${width}`);
    if (width < 768) assert.ok(layout.height + layout.header <= 220, `${width}px compact header: ${layout.height + layout.header}`);
    assert.match(layout.labels.join(' '), /3 of 4/);
    assert.match(layout.labels.join(' '), /6.*10/);
    assert.match(await evaluate("document.querySelector('#enemies').textContent"), /ENG 3/);
    await touch('[data-hud=time]');
    assert.match(await evaluate("document.querySelector('#info-content').textContent"), /TIME 3\/4/);
    await click('#info-dialog [data-ui=close]');
    assert.deepEqual(await getState(), state, 'inspecting clocks never mutates state');
  }
  note('Six inspectable HUD values fit desktop/tablet and 320/360/390px without page overflow or oversized header');

  await viewport(320, 844);
  const longClock = fresh({ v2TimePerProgress: 40, v2MissionTime: 40 });
  longClock.time = 39; longClock.timeTokens = Array(39).fill('Time');
  longClock.bags.mission.tokens.splice(longClock.bags.mission.tokens.indexOf('Time'), 39);
  await inject(longClock);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
  assert.ok(await evaluate("document.querySelector('#status').getBoundingClientRect().height + document.querySelector('.topbar').getBoundingClientRect().height <= 220"));
  assert.match(await evaluate("document.querySelector('[data-hud=time]').getAttribute('aria-label')"), /39 of 40/);
  await screenshot('large-tunable-time-meter-320');

  // Actual queued countdown: pause on each job tick before any completion.
  await viewport(390, 844);
  let working = fresh({ v2MissionEnemy: 0, v2MissionResource: 0, v2MissionTime: 4 });
  working.cells['E3-1'] = 'damaged';
  working = dispatch(working, { type: 'activate', crewId: 'engineer' }).state;
  working = dispatch(working, { type: 'action', action: 'repair', cells: ['E3-1'], assistantId: 'radio', workCellId: 'D3-1' }).state;
  await inject(working, { speed: 'manual' });
  assert.match(await evaluate("document.querySelector('#active-jobs').textContent"), /REPAIR.*2 TIME REMAINING/);
  assert.match(await evaluate("document.querySelector('#active-jobs').textContent"), /Engineer.*Radio/s);
  await evaluate("window.milkRun.send({type:'activate',crewId:'pilot'})");
  await nextUntil('WORK_TIME_ADVANCED');
  assert.equal((await getView()).jobs[0].remainingTime, 1);
  assert.match(await evaluate("document.querySelector('#active-jobs').textContent"), /1 TIME REMAINING/);
  await screenshot('visible-job-countdown');
  const savedCountdown = await getView(); await b.reload(); assert.deepEqual(await getView(), savedCountdown); await flush();
  note('Assisted job names and numerical Time decrement appear in the actual queue and survive reload');

  let departure = fresh({ v2MissionEnemy: 0, v2MissionResource: 0, v2MissionTime: 4 });
  departure.time = 3; departure.timeTokens = Array(3).fill('Time'); departure.bags.mission.tokens = ['Time'];
  departure.fighters = [fighter('breakoff', { engagementRemaining: 1, facing: 90 })];
  departure = dispatch(departure, { type: 'activate', crewId: 'pilot' }).state;
  await inject(departure, { speed: 'manual' });
  await evaluate("window.milkRun.send({type:'action',action:'wait'})");
  await nextUntil('FIGHTER_BREAKING_OFF');
  assert.match(await evaluate("document.querySelector('#board-stage').textContent"), /BF-109 BREAKS OFF/);
  assert.equal((await getView()).fighters.length, 1);
  assert.ok(await evaluate("!!document.querySelector('#enemies .fighter-card.departing')"));
  await screenshot('natural-breakoff');
  const stages = ['CHECKPOINT_JOBS_COMPLETED', 'FIRE_PHASE_STARTED', 'AIRCRAFT_CONDITION_CHECKED', 'ALTITUDE_CHECK', 'MISSION_ADVANCED', 'PROGRESS_BAGS_REFILLED'];
  for (const type of stages) { await nextUntil(type); assert.equal((await getView()).fighters.length, 0); }
  await screenshot('checkpoint-bag-refill'); await flush();
  assert.equal((await getState()).mission.position, 1);
  assert.equal((await getState()).stats.fightersKilled, 0);
  note('Natural break-off holds the aircraft before removal; every checkpoint stage is inspectable afterward');

  // Full default-length V2 diagnostic flight through the same browser command UI.
  await inject(fresh({ v2MissionEnemy: 0, v2MissionResource: 0, v2MissionTime: 4 }), { speed: 'instant' });
  await evaluate(`(() => {for(let guard=0;guard<100;guard++) {
    const s=window.milkRun.getState();if(s.phase==='ended')return;
    if(s.phase==='bombing') {
      const run=s.mission.bombRun,slot=['course','drift','release'].find(id=>run.placement[id]===null);
      if(slot) { const used=Object.values(run.placement);window.milkRun.send({type:'placeBombDie',slot,dieIndex:[0,1,2,3].find(i=>!used.includes(i))}); }
      else document.querySelector('[data-command=commitBombRun]').click();
    }
    else if(s.phase==='select') { const crew=s.crew.find(c=>!c.cycleSlotConsumed&&c.health==='healthy'&&!c.job);window.milkRun.send({type:'activate',crewId:crew.id}); }
    else if(s.phase==='action')window.milkRun.send({type:'action',action:'wait'});
    else throw Error('Unexpected phase '+s.phase);
    window.milkRun.flush();
  } throw Error('Diagnostic flight exceeded command bound');})()`);
  const home = await getState(); assert.equal(home.outcome, 'success'); assert.equal(home.mission.position, 11);
  assert.equal(home.telemetry.outboundTime, 32); assert.equal(home.telemetry.returnTime, 12);
  assert.equal(home.stats.turns, 44);
  assert.match(await evaluate("document.querySelector('#summary').textContent"), /Playtest telemetry/i);
  await screenshot('home-telemetry');
  note('Full V2 reaches TARGET and HOME in 44 Time-only diagnostic Turns and renders its playtest report');

  await click('[data-ui=dev]'); await click('[data-ui=reset-defaults]');
  assert.deepEqual(await evaluate('window.milkRun.getPreferences()'), DEFAULT_CONFIG);
  await click('#dev-dialog [data-ui=close]');
  await click('[data-ui=new-sortie]'); await launch('v2-continuous');
  const canonical = await getState();
  assert.deepEqual(canonical.config, { ...DEFAULT_CONFIG, preferredRuleset: 'v2-continuous' });
  assert.deepEqual(['Enemy', 'Resource', 'Time'].map(t => canonical.bags.mission.tokens.filter(v => v === t).length), [20, 12, 10]);
  note('Reset defaults followed by a new V2 sortie restores canonical combat/work rules and the physical 20/12/10 bag');
  assert.deepEqual(b.exceptions, []); assert.deepEqual(b.badResponses, []);
  await b.writeResults({ browser: b.version.product, widths, checks, exceptions: b.exceptions, badResponses: b.badResponses });
  console.log(JSON.stringify({ passed: checks.length, widths, artifacts: b.artifacts }, null, 2));
} finally { await b.close(); }
