import assert from 'node:assert/strict';
import { openBrowser } from './browser-harness.mjs';
import { createGame as createGameBase } from '../state.mjs';
// Exercise the retained legacy interaction; compact ON has its own touch suite.
const createGame=(config={},...args)=>createGameBase({...(args[1]==='v2-continuous'?{v2CompactCrewFlow:false}:{}),...config},...args);
import { beginBombRun, bombRunPreview } from '../bombing.mjs';
import { die } from '../random.mjs';

const b = await openBrowser({ port: 9352, artifactFolder: 'bomb-run' });
const { evaluate, click, touch, inject, flush, getState, viewport, screenshot, reload } = b;
const checks = [];
const note = text => { checks.push(text); console.log(text); };
const fresh = () => createGame({ v2StoryMode: false, opportunityEnabled: false }, 'bomb-run-browser', 'v2-continuous');

try {
  for (const [width, height] of [[320, 740], [360, 800], [390, 844], [768, 1024], [1440, 1000]]) {
    await viewport(width, height);
    const state = fresh(); state.phase = 'bombing'; state.mission.position = state.config.v2OutboundLength;
    state.resources.Officer = 2;
    Object.assign(state.crew.find(crew => crew.id === 'bombardier'), { used: true, cycleSlotConsumed: true });
    beginBombRun(state, () => {}); state.mission.bombRun.dice = [3, 1, 5, 6];
    await inject(state);
    assert.equal(await evaluate("document.querySelectorAll('[data-bomb-die]').length"), 4);
    assert.equal(await evaluate("document.querySelectorAll('[data-bomb-slot]').length"), 3);
    assert.equal(await evaluate("document.querySelector('[data-command=commitBombRun]').disabled"), true);
    assert.match(await evaluate("document.querySelector('.bomb-run').textContent"), /Bremen/);
    const select = width < 768 ? touch : click;
    for (const [index, slot] of ['course', 'drift', 'release'].entries()) {
      await select(`[data-bomb-die="${index}"]`);
      await select(`[data-bomb-slot="${slot}"]`); await flush();
    }
    let current = await getState();
    assert.deepEqual(current.mission.bombRun.placement, { course: 0, drift: 1, release: 2 });
    assert.equal(current.mission.bombRun.unusedDie, 3);
    assert.match(await evaluate("document.querySelector('.bomb-total').textContent"), /8\/9.*TARGET DESTROYED/);
    const geometry = await evaluate("(()=>{const panel=document.querySelector('.bomb-run').getBoundingClientRect();return {page:document.documentElement.scrollWidth<=innerWidth+1,panel:panel.left>=0&&panel.right<=innerWidth+1,targets:[...document.querySelectorAll('.bomb-run button')].every(button=>button.getBoundingClientRect().height>=44),pips:document.querySelectorAll('.bomb-dice-tray .pip').length}})()");
    assert.deepEqual(geometry, { page: true, panel: true, targets: true, pips: 15 });
    await evaluate("document.querySelector('.bomb-run').scrollIntoView({block:'center',behavior:'instant'})");
    await screenshot(`bomb-run-${width}`);

    await select('[data-bomb-die="1"]'); await select('[data-bomb-slot="course"]'); await flush();
    assert.deepEqual((await getState()).mission.bombRun.placement, { course: 1, drift: 0, release: 2 });
    await select('[data-bomb-die="0"]'); await select('[data-bomb-slot="course"]'); await flush();
    assert.deepEqual((await getState()).mission.bombRun.placement, { course: 0, drift: 1, release: 2 });

    current = await getState(); let rng = { rng: current.rng }; let expectedRoll = die(rng);
    await select('[data-bomb-die="0"]'); await select('[data-bomb-reroll="free"]'); await flush();
    current = await getState();
    assert.equal(current.mission.bombRun.dice[0], expectedRoll);
    assert.equal(current.mission.bombRun.freeRerollAvailable, false);
    assert.equal(current.mission.bombRun.freeRerollUsed, true);
    assert.equal(current.resources.Officer, 2);
    rng = { rng: current.rng }; expectedRoll = die(rng);
    await select('[data-bomb-die="3"]'); await select('[data-bomb-reroll="officer"]'); await flush();
    current = await getState();
    assert.equal(current.mission.bombRun.dice[3], expectedRoll);
    assert.equal(current.mission.bombRun.officerRerollsSpent, 1);
    assert.equal(current.resources.Officer, 1);
    assert.equal(current.stats.OfficerSpent, 1);
    assert.equal(current.bags.mission.discard.filter(token => token === 'Resource').length, 1);
    await reload(); assert.deepEqual(await getState(), current);
    assert.equal(await evaluate("document.querySelector('[data-bomb-reroll=free]').disabled"), true);
    assert.equal(await evaluate("document.querySelector('[data-command=commitBombRun]').disabled"), false);
    const expected = bombRunPreview(current);
    await select('[data-command="commitBombRun"]'); await flush();
    current = await getState();
    assert.equal(current.phase, 'select');
    assert.equal(current.mission.bombed, true);
    assert.equal(current.mission.bombRun.committedScore, expected.total);
    assert.equal(current.mission.bombRun.outcome, expected.outcome);
    assert.equal(current.stats.turns, state.stats.turns);
    assert.equal(current.stats.missionDraws, state.stats.missionDraws);
    assert.equal(current.mission.bombRun.unusedDie, 3);
    note(`${width}px: four tactile dice, touch/mouse placement and swaps, free/Officer rerolls, exact mid-run resume, score and Commit`);
  }

  await viewport(390, 844);
  const legacy = fresh(); legacy.phase = 'bombing'; legacy.mission.position = legacy.config.v2OutboundLength;
  delete legacy.mission.bombRun;
  const legacyRng = { rng: legacy.rng }, expectedDice = Array.from({ length: 4 }, () => die(legacyRng));
  await inject(legacy);
  assert.equal((await getState()).rng, legacy.rng, 'restoring an old target snapshot never rolls dice');
  assert.match(await evaluate("document.querySelector('[data-command=bomb]').textContent"), /Begin Bomb Run/i);
  await touch('[data-command="bomb"]'); await flush();
  const legacyStarted = await getState();
  assert.deepEqual(legacyStarted.mission.bombRun.dice, expectedDice);
  assert.equal(legacyStarted.rng, legacyRng.rng);
  assert.equal(await evaluate("!!document.querySelector('[data-command=bomb]')"), false);
  await reload(); assert.deepEqual(await getState(), legacyStarted);
  note('Legacy V2 target save offers Begin Bomb Run once; load never rolls, deliberate start rolls exactly4d6, subsequent resume preserves dice');

  const unmanned = fresh(); unmanned.mission.position = unmanned.config.v2OutboundLength - 1;
  unmanned.crew.find(crew => crew.id === 'bombardier').health = 'injured';
  await inject(unmanned);
  assert.match(await evaluate('document.body.textContent'), /BOMBSIGHT.*UNMANNED.*NO DROP POSSIBLE AT TARGET/);
  unmanned.time = unmanned.config.v2TimePerProgress;
  unmanned.timeTokens = Array(unmanned.time).fill('Time'); unmanned.pendingProgress = true;
  for (let i = 0; i < unmanned.time; i++) unmanned.bags.mission.tokens.splice(unmanned.bags.mission.tokens.indexOf('Time'), 1);
  await inject(unmanned);
  assert.equal(await evaluate("window.milkRun.send({type:'continueProgress'})"), true); await flush();
  const noDrop = await getState();
  assert.equal(noDrop.mission.bombingResult, 'no-drop');
  assert.equal(noDrop.mission.bombRun.status, 'no-drop');
  assert.equal(noDrop.mission.bombRun.committedScore, null);
  assert.equal(noDrop.phase, 'select');
  assert.equal(noDrop.mission.position, noDrop.config.v2OutboundLength);
  assert.equal(await evaluate("window.milkRun.exportSession().log.some(event=>event.type==='BOMBING_NO_DROP'&&event.outcome==='no-drop')"), true);
  await reload(); assert.deepEqual(await getState(), noDrop);
  note('Target warning is visible one Progress away; unavailable Bombardier causes automatic NO DROP at arrival and exact return-leg resume');

  await click('[data-ui="new-sortie"]');
  await click('#sortie-form input[value="v2-continuous"]');
  assert.equal(await evaluate("document.querySelectorAll('[data-bomb-target-choice] option').length"), 3);
  await evaluate("document.querySelector('[data-bomb-target-choice]').value='schweinfurt';document.querySelector('#sortie-form').requestSubmit()");
  assert.equal((await getState()).mission.targetId, 'schweinfurt');
  note('Fresh V2 sortie chooses among all three authored Bomb Run targets');

  assert.deepEqual(b.exceptions, []); assert.deepEqual(b.badResponses, []);
  await b.writeResults({ passed: checks.length, checks, widths: [320, 360, 390, 768, 1440], exceptions: b.exceptions, badResponses: b.badResponses });
  console.log(JSON.stringify({ passed: checks.length, artifacts: b.artifacts }, null, 2));
} finally { await b.close(); }
