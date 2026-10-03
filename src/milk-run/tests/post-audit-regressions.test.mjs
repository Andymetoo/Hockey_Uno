import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGame } from '../state.mjs';
import { dispatch, availableCrew, availableActions, canAbortWork, resolveFireSpread, postAttackPosition } from '../rules.mjs';
import { saveSession, loadSession } from '../persistence.mjs';
import { ResolutionQueue } from '../queue.mjs';
import { describeEvent } from '../presentation.mjs';
import { STATIONS } from '../board.mjs';
import { activated, fighter, collect, rngForDice, nextBombRunCommand } from './fixtures.mjs';

const member = (s, id) => s.crew.find(c => c.id === id);
const fresh = () => createGame({}, 'post-audit', 'v2-continuous');
const sessionFor = s => ({ version: 1, presentationVersion: 2, state: s, view: structuredClone(s), pending: [], log: [], current: null, speed: 'manual' });
const storage = () => { const data = new Map(); return { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) }; };
const timeCount = s => [...s.bags.mission.tokens, ...s.bags.mission.discard, ...(s.timeTokens ?? []), ...(s.overflowTimeTokens ?? [])].filter(t => t === 'Time').length;
const resourceCount = s => s.resources.Officer + s.resources.Enlisted + [...s.bags.mission.tokens, ...s.bags.mission.discard].filter(t => t === 'Resource').length;
function resume(s) { const store = storage(); saveSession(s, store); return loadSession(store); }
function shooting(action = 'basicFire', time = 3) {
  const s = fresh();
  s.phase = action === 'opportunityShot' ? 'opportunity' : 'action';
  s.activeCrew = action === 'directFire' ? 'pilot' : 'engineer';
  Object.assign(member(s, 'engineer'), { used: true, cycleSlotConsumed: true, activationCompleted: action === 'opportunityShot' || action === 'directFire' });
  Object.assign(member(s, s.activeCrew), { used: true, cycleSlotConsumed: true });
  s.time = time; s.timeTokens = Array(time).fill('Time'); s.pendingProgress = time >= 4;
  for (let i = 0; i < time; i++) s.bags.mission.tokens.splice(s.bags.mission.tokens.indexOf('Time'), 1);
  s.fighters = [fighter('kill', { hp: 1, engagementRemaining: 5 }), fighter('next', { hp: 1, engagementRemaining: 5, facing: 180 })];
  s.bags.combat = { tokens: ['Hit', 'Hit', 'Hit'], discard: [] };
  return s;
}
const shot = action => action === 'opportunityShot' ? { type: action, gunnerId: 'engineer', targetId: 'kill' }
  : { type: 'action', action, gunnerId: 'engineer', targetId: 'kill' };

for (const disruptOnHit of [false, true]) test(`actual legacy V2 save preserves Disrupt ${disruptOnHit ? 'Auto Miss' : 'OFF'}, jobs and unlimited Escorts`, async () => {
  const legacy = JSON.parse(await readFile(new URL('./fixtures/legacy-v2-session.json', import.meta.url), 'utf8'));
  const snapshots = [legacy.state, legacy.view, ...legacy.pending.map(e => e.state)];
  for (const s of snapshots) {
    assert.equal(s.v2ConfigVersion, undefined);
    assert.equal(s.config.v2FighterKillGrantsTime, undefined);
    s.config.disruptOnHit = disruptOnHit;
    s.escorts = [{ id: 'old-escort', quadrant: 'Fore', round: 0 }];
  }
  const migrated = resume(legacy);
  const after = [migrated.state, migrated.view, ...migrated.pending.map(e => e.state)];
  after.forEach((s, i) => {
    const expectedCrew = snapshots[i].crew.map(c => {
      const displaced = Boolean(c.job) || c.position.length !== STATIONS[c.station].cells.length || !STATIONS[c.station].cells.every(id => c.position.includes(id));
      return { ...c, homeStation: c.station, station: displaced ? null : c.station, displaced };
    });
    assert.deepEqual(s, { ...snapshots[i], overflowTimeTokens: [], crewPositionVersion: 1, crew: expectedCrew, v2ConfigVersion: 2, config: { ...snapshots[i].config,
      v2NavigatorUnmannedTimePenalty: 0, v2CrewCycleRefreshGrantsTime: false, v2UnavailableCrewPressure: 'full',
      v2FighterKillGrantsTime: false, v2DisruptEnabled: disruptOnHit, v2DisruptEffect: 'auto-miss', v2MaxEscorts: null } });
    for (const k of ['v2RepairTime', 'v2FireTime', 'v2MedicalTime']) assert.equal(s.config[k], 6);
    for (const k of ['v2AssistedRepairTime', 'v2AssistedFireTime', 'v2AssistedMedicalTime']) assert.equal(s.config[k], 4);
  });
  assert.deepEqual(resume(migrated), migrated, 'migration is saved and idempotent');
  const s = shooting(); s.config = migrated.state.config;
  const kill = dispatch(s, shot('basicFire'));
  assert.equal(kill.state.time, 3); assert.equal(timeCount(kill.state), 10);
  s.fighters[0].hp = 3;
  const hit = dispatch(s, shot('basicFire'));
  assert.equal(Boolean(hit.state.fighters[0].disrupted), disruptOnHit);
  if (disruptOnHit) {
    const enemy = dispatch(hit.state, { type: 'continueEnemyPhase' });
    assert.ok(enemy.events.some(e => e.type === 'ATTACK_DISRUPTED'));
    assert.ok(!enemy.events.some(e => e.type === 'ENEMY_ATTACK_ROLL' && e.fighterId === 'kill'));
  }
  s.activeCrew = 'radio'; s.escorts = migrated.state.escorts;
  assert.equal(availableActions(s).find(a => a.id === 'escort').enabled, true);
  assert.equal(dispatch(s, { type: 'action', action: 'escort' }).state.escorts.length, 2);
});

test('new V2 config schema requires all combat fields and preserves explicitly saved interim preferences', () => {
  const s = fresh(); assert.equal(s.v2ConfigVersion, 2);
  for (const key of ['v2FighterKillGrantsTime', 'v2DisruptEnabled', 'v2DisruptEffect', 'v2MaxEscorts']) {
    const bad = sessionFor(s); bad.state = structuredClone(s); delete bad.state.config[key];
    assert.equal(resume(bad), null, key);
  }
  delete s.v2ConfigVersion;
  Object.assign(s.config, { v2FighterKillGrantsTime: false, v2DisruptEnabled: false, v2DisruptEffect: 'auto-miss', v2MaxEscorts: 3 });
  const loaded = resume(sessionFor(s)); assert.deepEqual(loaded.state.config, s.config);
  const future = sessionFor(fresh()); future.state.v2ConfigVersion = 99; assert.equal(resume(future), null);
});

for (const ruleset of ['v1', 'v2-continuous']) test(`${ruleset}: suppression canceled mid-Fire phase cannot add a roll until next phase`, () => {
  let s = ruleset === 'v1' ? activated('engineer') : shooting();
  s.fighters = []; s.config.opportunityEnabled = false;
  s.cells['C3-1'] = 'fire'; s.cells['E3-1'] = 'fire';
  s = dispatch(s, { type: 'action', action: 'fireControl', cells: ['E3-1'], workCellId: 'C3-2' }).state;
  s.rng = 10;
  const { events, emit } = collect(); resolveFireSpread(s, emit);
  assert.equal(member(s, 'engineer').health, 'injured'); assert.equal(s.jobs.length, 0);
  assert.deepEqual(member(s, 'engineer').position, ['C3-2']);
  assert.deepEqual(events.filter(e => e.type === 'FIRE_SPREAD_ROLL').map(e => e.cellId), ['C3-1']);
  assert.equal(s.cells['D3-2'], 'healthy'); assert.equal(s.rng, (10 + 0x6D2B79F5) >>> 0);
  const next = collect(); resolveFireSpread(s, next.emit);
  assert.ok(next.events.some(e => e.type === 'FIRE_SPREAD_ROLL' && e.cells.includes('E3-1')));
});

for (const action of ['basicFire', 'advancedFire', 'opportunityShot', 'directFire']) {
  test(`${action}: kill at 3/4 earns physical Time and independent Opportunity before the normal safe boundary`, () => {
    const s = shooting(action); const r = dispatch(s, shot(action));
    assert.equal(r.state.time, 4); assert.equal(r.state.pendingProgress, true);
    assert.equal(r.state.mission.position, 0); assert.equal(timeCount(r.state), 10);
    assert.equal(r.state.bags.mission.tokens.filter(t => t === 'Time').length, 6);
    assert.ok(r.events.some(e => e.type === 'OPPORTUNITY_GAINED'));
    assert.ok(!r.events.some(e => e.type === 'PROGRESS_STARTED'));
    const end = dispatch(r.state, { type: 'continueEnemyPhase' });
    assert.equal(end.state.mission.position, 1); assert.equal(timeCount(end.state), 10);
    assert.ok(end.events.findIndex(e => e.type === 'PROGRESS_STARTED') > end.events.findIndex(e => e.type === 'ENEMY_PHASE_STARTED'));
  });
  for (const [time, pending] of [[4, true], [4, false], [3, true]]) test(`${action}: full/pending (${time}, ${pending}) banks physical overflow and still awards Opportunity`, () => {
    const s = shooting(action, time); s.pendingProgress = pending;
    const before = [...s.bags.mission.tokens]; const r = dispatch(s, shot(action));
    before.splice(before.indexOf('Time'), 1);
    assert.deepEqual(r.state.bags.mission.tokens, before); assert.equal(r.state.time, time);
    assert.deepEqual(r.state.overflowTimeTokens, ['Time']);
    assert.equal(timeCount(r.state), 10); assert.ok(r.events.some(e => e.type === 'OPPORTUNITY_GAINED'));
    assert.match(r.events.find(e => e.type === 'BONUS_TIME_BANKED').message, /BONUS TIME BANKED/);
    assert.ok(!r.events.some(e => e.type === 'TIME_GAINED'));
  });
}

test('between-turn kill chain closes to Progress before activation, without an extra enemy phase or Turn', () => {
  const s = shooting('opportunityShot'); s.phase = 'select'; s.activeCrew = null;
  let r = dispatch(s, shot('opportunityShot'));
  assert.equal(r.state.phase, 'betweenOpportunity'); assert.equal(r.state.time, 4);
  assert.throws(() => dispatch(r.state, { type: 'activate', crewId: 'pilot' }));
  assert.throws(() => dispatch(r.state, { type: 'continueEnemyPhase' }));
  const bag = [...r.state.bags.mission.tokens];
  r = dispatch(resume(sessionFor(r.state)).state, { type: 'opportunityShot', gunnerId: 'engineer', targetId: 'next' });
  bag.splice(bag.indexOf('Time'), 1);
  assert.deepEqual(r.state.bags.mission.tokens, bag); assert.equal(r.state.time, 4);
  assert.equal(r.state.opportunity, s.opportunity, 'each spent Opportunity is independently earned back');
  assert.ok(r.events.some(e => e.type === 'BONUS_TIME_BANKED'));
  const end = dispatch(r.state, { type: 'continueProgress' });
  assert.equal(end.state.phase, 'select'); assert.equal(end.state.mission.position, 1);
  assert.equal(end.state.time, 1); assert.equal(timeCount(end.state), 10);
  assert.equal(end.state.stats.turns, s.stats.turns); assert.equal(end.state.stats.missionDraws, s.stats.missionDraws);
  assert.deepEqual(end.state.crewCycle, s.crewCycle); assert.deepEqual(end.state.crew, s.crew);
  assert.ok(!end.events.some(e => e.type === 'ENEMY_PHASE_STARTED'));
  assert.equal(end.events.filter(e => e.type === 'PROGRESS_STARTED').length, 1);
  assert.doesNotThrow(() => dispatch(end.state, { type: 'activate', crewId: 'pilot' }));
  assert.throws(() => dispatch(end.state, { type: 'continueProgress' }));
});

test('a saved select state with pending Progress cannot sneak in another activation or unavailable Turn', () => {
  const s = shooting('opportunityShot', 4); s.phase = 'select'; s.activeCrew = null;
  assert.throws(() => dispatch(s, { type: 'activate', crewId: 'pilot' }));
  s.crew.forEach(c => c.health = 'injured');
  assert.throws(() => dispatch(s, { type: 'advanceUnavailable' }));
  assert.equal(dispatch(s, { type: 'continueProgress' }).state.mission.position, 1);
});

test('no Time in the bag means no phantom kill reward or discard draw', () => {
  const s = shooting();
  s.bags.mission.discard.push(...s.bags.mission.tokens.filter(t => t === 'Time'));
  s.bags.mission.tokens = s.bags.mission.tokens.filter(t => t !== 'Time');
  const r = dispatch(s, shot('basicFire'));
  assert.equal(r.state.time, 3); assert.equal(timeCount(r.state), 10);
  assert.ok(r.events.some(e => e.type === 'FIGHTER_KILL_TIME_UNAVAILABLE'));
});

for (const kind of ['repair', 'fireControl', 'medical']) test(`kill-Time completes ${kind} exactly once with normal work effects`, () => {
  const s = shooting();
  s.jobs = [{ id: 'job', kind, crewId: 'radio', cells: ['E3-1'], targetId: 'tail', remainingTime: 1 }];
  member(s, 'radio').job = 'job'; member(s, 'tail').health = 'injured';
  s.cells['E3-1'] = kind === 'repair' ? 'damaged' : 'fire';
  const r = dispatch(s, shot('basicFire'));
  assert.equal(r.state.jobs.length, 0); assert.equal(member(r.state, 'radio').job, null);
  assert.equal(r.events.filter(e => e.type === 'WORK_COMPLETED').length, 1);
  if (kind === 'medical') assert.equal(member(r.state, 'tail').health, 'healthy');
  else assert.equal(r.state.cells['E3-1'], kind === 'repair' ? 'healthy' : 'damaged');
  assert.ok(!dispatch(r.state, { type: 'continueEnemyPhase' }).events.some(e => e.type === 'WORK_COMPLETED'));
});

test('Escort kills and V1 gunfire do not grant Time; Escort damage does not Disrupt', () => {
  const s = shooting(); s.escorts = ['Fore', 'Aft', 'Port', 'Starboard'].map(quadrant => ({ quadrant }));
  const e = collect(); postAttackPosition(s, 'kill', e.emit);
  assert.equal(s.time, 3); assert.equal(timeCount(s), 10);
  assert.ok(e.events.some(e => e.type === 'FIGHTER_DESTROYED'));
  assert.ok(!e.events.some(e => /^FIGHTER_KILL_TIME|FIGHTER_DISRUPTED|OPPORTUNITY_GAINED/.test(e.type)));
  const v1 = activated('engineer'); v1.fighters = [fighter('kill', { hp: 1 })]; v1.bags.combat.tokens = ['Hit'];
  assert.ok(!dispatch(v1, shot('basicFire')).events.some(e => /^FIGHTER_KILL_TIME|TIME_GAINED/.test(e.type)));
});

function working() {
  const s = fresh(); s.cells['E3-1'] = 'fire';
  s.jobs = [{ id: 'work', kind: 'fireControl', crewId: 'engineer', assistantId: 'radio', cells: ['E3-1'], remainingTime: 1 }];
  for (const id of ['engineer', 'radio']) Object.assign(member(s, id), { job: 'work', position: ['C3-2'] });
  Object.assign(member(s, 'engineer'), { used: true, cycleSlotConsumed: true, activationCompleted: true });
  return s;
}
test('V2 selection Abort Work is free, refunds nothing, ends suppression, preserves positions and consumed slots', () => {
  const s = working(); assert.equal(canAbortWork(s, 'work'), true);
  const r = dispatch(s, { type: 'abortWork', jobId: 'work' });
  assert.equal(r.state.jobs.length, 0); assert.equal(r.state.cells['E3-1'], 'fire');
  for (const key of ['resources', 'bags', 'crewCycle', 'slot', 'stats', 'rng', 'time']) assert.deepEqual(r.state[key], s[key], key);
  for (const id of ['engineer', 'radio']) assert.deepEqual(member(r.state, id), { ...member(s, id), job: null, station: null, displaced: true });
  assert.match(r.events[0].message, /Fire suppression ends/);
  const e = collect(); resolveFireSpread(r.state, e.emit);
  assert.ok(e.events.some(e => e.type === 'FIRE_SPREAD_ROLL' && e.cellId === 'E3-1'));
});
for (const phase of ['action', 'opportunity', 'betweenOpportunity', 'bombing', 'ready', 'roundEnd', 'ended', 'enemy']) test(`Abort Work rejected transactionally during ${phase}`, () => {
  const s = working(); s.phase = phase; const before = structuredClone(s);
  assert.equal(canAbortWork(s, 'work'), false); assert.throws(() => dispatch(s, { type: 'abortWork', jobId: 'work' }));
  assert.deepEqual(s, before);
});
test('Abort Work rejects V1, missing jobs, pending Progress, active crew and ended outcomes; queue blocks unresolved shots', () => {
  for (const change of [{ ruleset: 'v1' }, { jobs: [] }, { pendingProgress: true }, { activeCrew: 'pilot' }, { outcome: 'success' }]) {
    const s = Object.assign(working(), change);
    assert.equal(canAbortWork(s, 'work'), false); assert.throws(() => dispatch(s, { type: 'abortWork', jobId: 'work' }));
  }
  const s = working(); const q = new ResolutionQueue({ state: s, dispatch });
  q.speed = 'manual'; q.send({ type: 'activate', crewId: 'pilot' });
  assert.throws(() => q.send({ type: 'abortWork', jobId: 'work' }), /current event sequence/);
});

for (const mode of ['auto-miss', 'accuracy-penalty']) test(`Disrupt ${mode} survives queue stripping, preferences changes and resume`, () => {
  const s = shooting(); s.config.v2DisruptEffect = mode; s.fighters[0].hp = 3;
  const q = new ResolutionQueue({ state: s, dispatch }); q.speed = 'manual'; q.send(shot('basicFire'));
  while (q.current?.type !== 'FIGHTER_DISRUPTED') q.step();
  const title = mode === 'auto-miss' ? 'DISRUPTED · AUTO MISS' : 'DISRUPTED · NEEDS 4+';
  assert.equal(q.current.state, undefined); assert.equal(q.current.disruptEffect, mode);
  assert.equal(describeEvent(q.current).title, title);
  q.state.config.v2DisruptEffect = mode === 'auto-miss' ? 'accuracy-penalty' : 'auto-miss';
  assert.equal(describeEvent(q.current).title, title, 'event owns its resolved rule');
  const saved = resume(q.export()); assert.equal(describeEvent(saved.current).title, title);
  assert.equal(describeEvent(saved.log.find(e => e.type === 'FIGHTER_DISRUPTED')).title, title);
});

test('Disrupt modes retain all die outcomes and next-action Engagement expiry', () => {
  for (const mode of ['auto-miss', 'accuracy-penalty']) for (let roll = 1; roll <= 6; roll++) {
    const s = shooting(); s.config.opportunityEnabled = false; s.config.v2DisruptEffect = mode;
    s.fighters = [fighter('d', { disrupted: true, engagementRemaining: 5 })]; s.rng = rngForDice([roll]);
    const r = dispatch(s, { type: 'action', action: 'wait' });
    assert.equal(r.state.fighters[0].disrupted, false); assert.equal(r.state.fighters[0].engagementRemaining, 4);
    const attack = r.events.find(e => e.type === 'ENEMY_ATTACK_ROLL');
    if (mode === 'auto-miss') assert.equal(attack, undefined);
    else assert.equal(attack.result, roll <= 3 ? 'off-target' : roll <= 5 ? 'hit' : 'critical');
  }
});

test('new Escort cap rejects spending, persists, and frees the slot at Progress', () => {
  const s = shooting(); s.activeCrew = 'radio'; s.escorts = [{ quadrant: 'Fore', id: 'escort' }];
  assert.equal(availableActions(s).find(a => a.id === 'escort').enabled, false);
  const before = structuredClone(s); assert.throws(() => dispatch(s, { type: 'action', action: 'escort' })); assert.deepEqual(s, before);
  const loaded = resume(sessionFor(s)).state; assert.deepEqual(loaded.escorts, s.escorts);
  loaded.phase = 'select'; loaded.activeCrew = null; loaded.pendingProgress = true;
  const next = dispatch(loaded, { type: 'continueProgress' }).state;
  assert.equal(next.escorts.length, 0); assert.equal(availableActions(next, 'radio').find(a => a.id === 'escort').enabled, true);
  assert.equal(resourceCount(next), resourceCount(s));
});

test('two full V2 diagnostics are deterministic, conserve physical tokens, and resume every command with its queued snapshots', t => {
  let commands = 0, snapshots = 0;
  const normalized = value => JSON.stringify(value, (key, v) => ['startedAt', 'endedAt'].includes(key) && v !== null ? 0 : v);
  function flight() {
    let s = createGame({ v2MissionEnemy: 0, v2MissionResource: 0, v2MissionTime: 10, opportunityEnabled: false }, 'full-v2-diagnostic', 'v2-continuous');
    const resources = resourceCount(s), trace = [];
    while (s.phase !== 'ended') {
      const command = s.phase === 'select' ? { type: 'activate', crewId: availableCrew(s)[0].id }
        : s.phase === 'action' ? { type: 'action', action: 'wait' } : nextBombRunCommand(s);
      const before = s, result = dispatch(s, command); s = result.state;
      assert.equal(timeCount(s), 10); assert.equal(resourceCount(s), resources);
      const session = { ...sessionFor(s), view: before, pending: result.events, presenting: true };
      const loaded = resume(session); assert.deepEqual(loaded, session);
      s = loaded.state; snapshots += 2 + result.events.length; commands++;
      trace.push(normalized({ command, state: s, events: result.events }));
      assert.ok(trace.length < 100);
    }
    assert.equal(s.outcome, 'success'); assert.equal(s.mission.position, 11);
    assert.equal(s.stats.turns, 40); assert.equal(s.altitude, 5);
    return trace;
  }
  assert.deepEqual(flight(), flight());
  t.diagnostic(`${commands} commands; ${snapshots} authoritative, visible and queued snapshots round-tripped; Time and Resources conserved after each command.`);
});
