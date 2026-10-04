import assert from 'node:assert/strict';
import { openBrowser } from './browser-harness.mjs';
import { createGame } from '../state.mjs';
import { dispatch } from '../rules.mjs';
import { fighter, rngForDice } from './fixtures.mjs';
import { BOARD } from '../board.mjs';

const b = await openBrowser({ port: 9341, artifactFolder: 'continuous' });
const { evaluate, click, touch, inject, flush, getState, viewport, screenshot } = b;
const checks = [];
const note = message => { checks.push(message); console.log(message); };
const fresh = config => createGame({ v2StoryMode: false, opportunityEnabled: false, ...config }, 'continuous-browser', 'v2-continuous');
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
  assert.match(await evaluate("document.querySelector('#target-detail').textContent"), /2 future Time/);
  await click('[data-ui="confirm-target"]'); await flush();
  const assisted = await getState();
  assert.equal(assisted.jobs[0].assistantId, 'radio'); assert.equal(assisted.jobs[0].remainingTime, 2);
  assert.equal(assisted.crew.find(c => c.id === 'radio').cycleSlotConsumed, false);
  assert.match(await evaluate("document.querySelector('#crew-list [data-crew=radio]').textContent"), /2 Time/);
  await screenshot('assisted-job'); await b.reload(); assert.deepEqual(await getState(), assisted);
  note('V2 Assist UI creates two-Time work, preserves the assistant slot and resumes exact timers');

  // Joining existing work is a normal crew action, independently of initial assistance.
  const joinBase = fresh(); joinBase.bags.mission.tokens = ['Resource', 'Resource']; joinBase.cells['E3-1'] = 'damaged';
  let joinState = dispatch(joinBase, { type: 'activate', crewId: 'engineer' }).state;
  joinState = dispatch(joinState, { type: 'action', action: 'repair', cells: ['E3-1'], workCellId: 'D3-1' }).state;
  await inject(joinState); await click('[data-job]');
  assert.match(await evaluate("document.querySelector('#info-content').textContent"), /Assist Work available/);
  await click('#info-dialog [data-ui=close]');
  await touch('#crew-list [data-crew="radio"]'); await click('#action-content [data-ui="activate"]'); await flush();
  await choose('assistWork');
  assert.ok(await evaluate("document.querySelector('#assist-position').options.length>0"));
  const beforeAssist=await getState();
  await click('#choice-form button[type=submit]'); await flush();
  const joined=await getState();
  assert.equal(joined.jobs[0].remainingTime,2); assert.equal(joined.jobs[0].assistantId,'radio');
  assert.equal(joined.crew.find(c=>c.id==='radio').cycleSlotConsumed,true);
  assert.deepEqual(joined.resources,beforeAssist.resources);
  await b.reload(); assert.deepEqual(await getState(),joined);
  note('Touch Assist Work joins an active job, consumes its crew action, costs no resources, and resumes exactly');

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

  for (const effect of ['auto-miss', 'accuracy-penalty']) {
    const s = fresh({ v2DisruptEffect: effect });
    s.phase = 'action'; s.activeCrew = 'engineer';
    Object.assign(s.crew.find(c => c.id === 'engineer'), { used: true, cycleSlotConsumed: true });
    s.fighters = [fighter('disrupt', { hp: 3, maxHp: 3, engagementRemaining: 5 })];
    s.bags.combat = { tokens: ['Hit'], discard: [] };
    await inject(s, { speed: 'manual' });
    await evaluate("window.milkRun.send({type:'action',action:'basicFire',targetId:'disrupt'})");
    for (let i = 0; i < 80 && (await b.current())?.type !== 'FIGHTER_DISRUPTED'; i++) await click('[data-ui=step]');
    assert.equal((await b.current()).type, 'FIGHTER_DISRUPTED');
    const title = effect === 'auto-miss' ? 'DISRUPTED · AUTO MISS' : 'DISRUPTED · NEEDS 4+';
    assert.equal(await evaluate("document.querySelector('.stage-title').textContent"), title);
    await b.reload();
    assert.equal(await evaluate("document.querySelector('.stage-title').textContent"), title);
    await evaluate("document.querySelector('#log-details').open=true");
    await b.waitFor("!!document.querySelector('#event-log [data-log-group]')");
    assert.ok(await evaluate(`[...document.querySelectorAll('#event-log .log-event-message b')].some(e=>e.textContent===${JSON.stringify(title)})`));
    await screenshot(`disrupt-${effect}`); await flush();
  }
  note('Disrupt Auto Miss and Needs 4+ banners and recorder entries retain their resolved mode through reload');

  for (const width of [320, 360, 390]) {
    await viewport(width, 844);
    const s = fresh({ opportunityEnabled: true });
    s.time = 3; s.timeTokens = Array(3).fill('Time');
    for (let i = 0; i < 3; i++) s.bags.mission.tokens.splice(s.bags.mission.tokens.indexOf('Time'), 1);
    Object.assign(s.crew.find(c => c.id === 'engineer'), { used: true, cycleSlotConsumed: true, activationCompleted: true });
    s.fighters = ['first', 'second'].map(id => fighter(id, { hp: 1, engagementRemaining: 5 }));
    s.bags.combat = { tokens: ['Hit', 'Hit'], discard: [] };
    await inject(s);
    await evaluate("window.milkRun.send({type:'opportunityShot',gunnerId:'engineer',targetId:'first'});window.milkRun.flush()");
    const pending = await getState();
    assert.equal(pending.phase, 'betweenOpportunity'); assert.equal(pending.time, 4);
    assert.ok(await evaluate("!!document.querySelector('[data-command=continueProgress]')"));
    await b.reload(); assert.deepEqual(await getState(), pending);
    await touch('#crew-list [data-crew=pilot]');
    assert.equal(await evaluate("!!document.querySelector('#action-content [data-ui=activate]')"), false);
    await click('#action-dialog [data-ui=close]');
    await evaluate("window.milkRun.send({type:'opportunityShot',gunnerId:'engineer',targetId:'second'});window.milkRun.flush()");
    const chained = await getState(); assert.equal(chained.time, 4);
    const bankAfter=[...pending.bags.mission.tokens];bankAfter.splice(bankAfter.indexOf('Time'),1);
    assert.deepEqual(chained.bags.mission.tokens, bankAfter);
    assert.deepEqual(chained.overflowTimeTokens,['Time']);
    assert.match(await evaluate("document.querySelector('[data-hud=time]').textContent"),/\+1 BANKED/);
    assert.equal(chained.opportunity, s.opportunity);
    await touch('[data-command=continueProgress]'); await flush();
    const end = await getState(); assert.equal(end.mission.position, 1); assert.equal(end.time, 1);
    assert.deepEqual(end.overflowTimeTokens,[]);
    assert.equal(end.stats.enemyAttacks, 0); assert.equal(end.stats.turns, 0); assert.equal(end.stats.missionDraws, 0);
    assert.deepEqual(end.crewCycle, s.crewCycle);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
    await screenshot(`between-turn-progress-${width}`);
  }
  note('320/360/390: full-Time kill banks one physical overflow, resumes exactly, then carries into Progress without another activation or enemy phase');

  for (const phase of ['select', 'action', 'opportunity', 'betweenOpportunity', 'bombing', 'ended']) {
    const s = fresh(); s.phase = phase;
    if (phase === 'action') s.activeCrew = 'pilot';
    if (phase === 'betweenOpportunity') s.config.v2OpportunityProvokesEnemyPhase=true;
    if (phase === 'ended') { s.outcome='destroyed';s.endReason={cause:'altitude'};s.altitude=0;s.endedAt=s.startedAt+1000; }
    s.jobs = [{ id: 'abort-check', kind: 'fireControl', crewId: 'engineer', cells: ['E3-1'], remainingTime: 1 }];
    s.cells['E3-1'] = 'fire';
    Object.assign(s.crew.find(c => c.id === 'engineer'), { job: 'abort-check', position: ['C3-2'], used: true, cycleSlotConsumed: true });
    await inject(s); await click('[data-job=abort-check]');
    assert.equal(await evaluate("document.querySelector('[data-ui=abort-work]').disabled"), phase !== 'select', phase);
    if (phase === 'select') {
      await click('[data-ui=abort-work]'); await flush();
      const end = await getState(); assert.equal(end.jobs.length, 0);
      assert.deepEqual(end.resources, s.resources); assert.deepEqual(end.bags, s.bags);
      assert.deepEqual(end.crew.find(c => c.id === 'engineer').position, ['C3-2']);
      assert.equal(end.crew.find(c => c.id === 'engineer').cycleSlotConsumed, true);
    } else await click('#info-dialog [data-ui=close]');
  }
  note('Abort Work is enabled only at normal V2 crew selection; it preserves position, resources and consumed slots');

  for (const width of [320,360,390]) {
    await viewport(width,844);
    const s=fresh({v2NavigatorUnmannedTimePenalty:1});s.time=3;s.timeTokens=Array(3).fill('Time');
    for(let i=0;i<3;i++)s.bags.mission.tokens.splice(s.bags.mission.tokens.indexOf('Time'),1);
    Object.assign(s.crew.find(c=>c.id==='navigator'),{station:null,displaced:true,position:['C3-1']});
    await inject(s);
    assert.match(await evaluate("document.querySelector('[data-hud=time]').getAttribute('aria-label')"),/Time 3 of 5, Navigation unmanned/);
    assert.match(await evaluate("document.querySelector('[data-hud=time]').textContent"),/NAVIGATION UNMANNED/);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
    await screenshot(`navigation-unmanned-${width}`);
  }
  note('320/360/390: dynamic navigation HUD shows 3 of 5 and explicit NAVIGATION UNMANNED without overflow');

  await viewport(390,844);
  const critical=fresh();critical.phase='action';critical.activeCrew='pilot';critical.slot=1;
  Object.assign(critical.crew.find(c=>c.id==='pilot'),{used:true,cycleSlotConsumed:true});
  critical.fighters=[fighter('critical-enemy',{engagementRemaining:5})];critical.rng=rngForDice([6]);
  await inject(critical,{speed:'manual'});
  await evaluate("window.milkRun.send({type:'action',action:'wait'})");
  for(let i=0;i<80 && (await b.current())?.type!=='ENEMY_ATTACK_ROLL';i++)await click('[data-ui=step]');
  assert.equal((await b.current()).result,'critical');
  assert.equal(await evaluate("document.querySelector('.stage-title').textContent"),'CRITICAL HIT');
  assert.ok(await evaluate("document.querySelector('#board-stage').classList.contains('critical-hit')"));
  assert.ok(await evaluate("!window.milkRun.exportSession().log.some(e=>e.type==='ENEMY_HIT_LOCATION')"));
  assert.ok(await evaluate("window.milkRun.getQueue().some(e=>e.type==='ENEMY_HIT_LOCATION')"));
  await screenshot('critical-before-location');
  await b.reload();
  assert.ok(await evaluate("document.querySelector('#primary-action [data-ui=play]').previousElementSibling.dataset.ui==='skip'"));
  const beforePlay=(await b.current()).beat;
  await click('#primary-action [data-ui=play]');
  assert.ok((await b.current()).beat>beforePlay,'bottom Play advances a paused beat synchronously');
  assert.equal(await evaluate('window.milkRun.exportSession().speed'),'normal');
  await flush();await evaluate("document.querySelector('#log-details').open=true");
  await b.waitFor("!!document.querySelector('#event-log [data-log-group]')");
  assert.match(await evaluate("document.querySelector('#event-log').textContent"),/CRITICAL HIT/);
  note('Critical shows its strong brief beat before location and recorder summary; paused bottom Play beside Skip resumes immediately');

  for(const lost of [true,false]) {
    const s=fresh();s.time=4;s.timeTokens=Array(4).fill('Time');s.pendingProgress=true;s.mission.position=10;s.mission.bombed=true;s.mission.bombingResult='heavy';
    for(let i=0;i<4;i++)s.bags.mission.tokens.splice(s.bags.mission.tokens.indexOf('Time'),1);
    if(lost){const sections=[...new Set(BOARD.filter(c=>c.structure).map(c=>c.section))].slice(0,6);for(const cell of BOARD)if(cell.structure&&sections.includes(cell.section))s.cells[cell.id]='damaged';}
    await inject(s);await evaluate("window.milkRun.send({type:'continueProgress'});window.milkRun.flush()");
    assert.equal((await getState()).outcome,lost?'destroyed':'success');
    assert.equal(await evaluate("document.querySelector('#summary .sortie-result h2').textContent"),lost?'AIRCRAFT LOST':'RETURNED HOME');
    if(lost){assert.match(await evaluate("document.querySelector('#summary').textContent"),/Structural failure.*6 compromised sections/);assert.match(await evaluate("document.querySelector('#summary').textContent"),/1 Progress from HOME/);}
    else assert.match(await evaluate("document.querySelector('#summary').textContent"),/Mission completed/);
    await evaluate("document.querySelector('#log-details').open=true");await b.waitFor("!!document.querySelector('#event-log .sortie-ending')");
    assert.match(await evaluate("document.querySelector('#event-log .sortie-ending').textContent"),lost?/AIRCRAFT LOST.*Structural failure/s:/RETURNED HOME.*Mission completed/s);
    await screenshot(lost?'aircraft-lost-result':'returned-home-result');
  }
  note('Authoritative aircraft-loss and HOME panels show reason/distance and visually marked Flight Recorder endings');

  assert.deepEqual(b.exceptions, []); assert.deepEqual(b.badResponses, []);
  await b.writeResults({ browser: b.version.product, checks, exceptions: b.exceptions, badResponses: b.badResponses });
  console.log(JSON.stringify({ passed: checks.length, artifacts: b.artifacts }, null, 2));
} finally { await b.close(); }
