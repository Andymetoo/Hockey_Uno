import assert from 'node:assert/strict';
import { openBrowser } from './browser-harness.mjs';
import { createGame } from '../state.mjs';
import { dispatch } from '../rules.mjs';
import { fighter } from './fixtures.mjs';

const b = await openBrowser({ port: 9341, artifactFolder: 'continuous' });
const { evaluate, click, touch, inject, flush, getState, viewport, screenshot } = b;
const checks = [];
const note = message => { checks.push(message); console.log(message); };
const fresh = config => createGame({ opportunityEnabled: false, ...config }, 'continuous-browser', 'v2-continuous');
const choose = async action => { await click('[data-ui="choose"]'); await click(`[data-action="${action}"]`); };

try {
  await viewport(1440, 1000);
  if (!await evaluate("document.querySelector('#sortie-dialog').open")) await click('[data-ui="new-sortie"]');
  assert.match(await evaluate("document.querySelector('#sortie-dialog').textContent"), /V1 — Round-Based/);
  await click('#sortie-form input[value="v2-continuous"]');
  await click('#sortie-form button[type="submit"]');
  assert.equal((await getState()).ruleset, 'v2-continuous');
  assert.equal((await getState()).phase, 'select');
  assert.match(await evaluate("document.querySelector('#ruleset-label').textContent"), /EXPERIMENTAL/);
  assert.equal(await evaluate("!!document.querySelector('[data-command=startRound]')"), false);
  note('Fresh-sortie chooser launches explicit experimental V2 directly into crew selection');

  for (const [width, height] of [[1440, 1000], [768, 1024], [320, 740], [360, 800], [390, 844]]) {
    await viewport(width, height);
    const s = fresh({ v2MissionEnemy: 0, v2MissionResource: 0, v2MissionTime: 4 });
    s.time = 3; s.timeTokens = ['Time', 'Time', 'Time']; s.bags.mission.tokens = ['Time'];
    s.fighters = [fighter('persistent', { facing: 90, engagementRemaining: 5 })];
    await inject(s);
    await touch('#crew-list [data-crew="engineer"]');
    await click('#action-content [data-ui="activate"]'); await flush();
    const pending = await getState();
    assert.equal(pending.time, 4); assert.equal(pending.pendingProgress, true);
    assert.equal(pending.mission.position, 0);
    assert.match(await evaluate('document.body.textContent'), /TIME 4\/4/);
    assert.match(await evaluate('document.body.textContent'), /PROGRESS CHECKPOINT AFTER THIS TURN/);
    assert.match(await evaluate("document.querySelector('#enemies').textContent"), /ENG(?:AGEMENT)? 5/);
    await b.reload(); assert.deepEqual(await getState(), pending);
    await screenshot(`pending-checkpoint-${width}`);
    await choose('wait'); await click('#choice-form button[type="submit"]'); await flush();
    const progressed = await getState();
    assert.equal(progressed.time, 0); assert.equal(progressed.mission.position, 1);
    assert.equal(progressed.crewCycle.turn, 1);
    assert.equal(progressed.crew.find(c => c.id === 'engineer').cycleSlotConsumed, true);
    assert.equal(progressed.fighters[0].engagementRemaining, 4);
    assert.match(await evaluate("document.querySelector('#enemies').textContent"), /ENG(?:AGEMENT)? 4/);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `${width}px no overflow`);
    await screenshot(`after-checkpoint-${width}`);
  }
  note('Desktop, tablet and 320/360/390px touch: Time checkpoint waits for action/enemies, exact reload, retained fighter and consumed crew slot');

  await viewport(390, 844);
  const repair = fresh(); repair.bags.mission.tokens = ['Resource']; repair.cells['E3-1'] = 'damaged';
  const acting = dispatch(repair, { type: 'activate', crewId: 'engineer' }).state;
  await inject(acting); await choose('repair');
  await touch('#board [data-cell="E3-1"]'); await click('[data-ui="work-position"]');
  await touch('#board [data-work-cell="D3-1"]');
  await evaluate("const select=document.querySelector('#job-assistant');select.value='radio';select.dispatchEvent(new Event('change',{bubbles:true}))");
  assert.match(await evaluate("document.querySelector('#target-detail').textContent"), /4 future Time/);
  await click('[data-ui="confirm-target"]'); await flush();
  const assisted = await getState();
  assert.equal(assisted.jobs[0].assistantId, 'radio'); assert.equal(assisted.jobs[0].remainingTime, 4);
  assert.equal(assisted.crew.find(c => c.id === 'radio').cycleSlotConsumed, false);
  assert.match(await evaluate("document.querySelector('#crew-list [data-crew=radio]').textContent"), /4 Time/);
  await screenshot('assisted-job'); await b.reload(); assert.deepEqual(await getState(), assisted);
  note('V2 Assist UI creates four-Time work, preserves the assistant slot and resumes exact timers');

  await click('[data-ui="new-sortie"]'); await click('#sortie-form input[value="v1"]');
  await click('#sortie-form button[type="submit"]');
  assert.equal((await getState()).ruleset, 'v1'); assert.equal((await getState()).phase, 'ready');
  assert.equal((await getState()).config.outboundLength, 14);
  await click('[data-command="startRound"]'); await flush();
  assert.equal((await getState()).round, 1);
  note('Clean new V1 sortie works without clearing localStorage and retains classic round start');

  const savedV1 = await getState();
  await click('[data-ui="dev"]');
  await evaluate(`(() => {
    const form=document.querySelector('#dev-form');
    form.elements.namedItem('preferredRuleset').value='v2-continuous';
    const time=form.elements.namedItem('v2MissionTime');time.value=1;
    time.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await click('#dev-dialog [data-ui="close"]'); await b.reload();
  assert.deepEqual(await getState(), savedV1, 'invalid next-sortie preferences cannot block or alter resume');
  await click('[data-ui="new-sortie"]'); await click('#sortie-form input[value="v2-continuous"]');
  await click('#sortie-form button[type="submit"]');
  assert.deepEqual(await getState(), savedV1, 'an invalid launch leaves the existing sortie intact');
  assert.match(await evaluate("document.querySelector('#sortie-dialog').textContent"), /at least as many mission Time tokens/);
  await click('#sortie-dialog [data-ui="close"]');
  await click('[data-ui="dev"]'); await click('[data-ui="reset-defaults"]'); await click('#dev-dialog [data-ui="close"]');
  note('Preferred V2 and invalid next-sortie settings neither convert nor block the active V1 save');

  assert.deepEqual(b.exceptions, []); assert.deepEqual(b.badResponses, []);
  await b.writeResults({ browser: b.version.product, checks, exceptions: b.exceptions, badResponses: b.badResponses });
  console.log(JSON.stringify({ passed: checks.length, artifacts: b.artifacts }, null, 2));
} finally { await b.close(); }
