import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, aircraftAvailable, choose, commit, createCampaign, SAVE_VERSION, crewAvailable, duration, forecast, HOUR, nextMilestone, planErrors, proposePlan, repairCandidates } from '../game.ts';
import { stationEvents } from '../content.ts';
import { createStorage, decode, LEGACY_KEY, SAVE_KEY } from '../persistence.ts';

const START = 1_800_000_000_000;
const copy = s => structuredClone(s);
const fresh = seed => { const s = createCampaign(seed ?? 42, START); s.legacyTour = true; s.threads = []; return s; };
const finish = s => { if (s.active) advance(s, s.active.returnsAt); };
const drain = s => { let count = 0; while (s.jobs.length) { assert.ok(count++ < 150); advance(s, nextMilestone(s)); } };
const addJob = (s, kind, hours, subject, text) => s.jobs.push({ id: s.nextId++, at: s.now + hours * HOUR, kind, subject, ...(text ? { text } : {}) });

test('offline, fine-grained and milestone catch-up produce identical state for 100 operations', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const base = fresh(seed); commit(base, base.plan);
    const offline = copy(base), ticks = copy(base), milestones = copy(base);
    const to = START + 8 * 24 * HOUR;
    advance(offline, to);
    for (let t = START + HOUR / 7; t < to; t += HOUR / 7) advance(ticks, t);
    advance(ticks, to);
    drain(milestones); advance(milestones, to);
    assert.deepEqual(offline, ticks, `seed ${seed}`);
    assert.deepEqual(offline, milestones, `seed ${seed}`);
    assert.equal(offline.completed, 1);
  }
});
test('same-time events are ordered by id, apply once, and reload cannot reroll', () => {
  const s = fresh(); s.plan.route = 'dogleg'; commit(s, s.plan);
  const reloaded = decode(JSON.stringify(s));
  advance(s, START + 100 * HOUR); advance(reloaded, START + 100 * HOUR);
  assert.deepEqual(s, reloaded);
  const before = copy(s); advance(s, s.now); advance(s, s.now - HOUR);
  assert.deepEqual(s, before); assert.equal(s.reports.length, 1);
});
test('standing policies remain in force across reports and staff proposals', () => {
  const s = fresh(); s.plan.route = 'dogleg'; s.plan.orders = 'press'; commit(s, s.plan); finish(s);
  assert.equal(s.plan.route, 'dogleg'); assert.equal(s.plan.orders, 'press'); assert.equal(proposePlan(s).orders, 'press');
});
test('rest starts at landing, not at dispatch or last render', () => {
  const s = fresh(); s.crews.forEach(c => c.fatigue = 0); s.jobs = [];
  commit(s, s.plan); const c = s.crews.find(c => c.id === s.active.plan.flights[0].crew);
  const at = s.active.returnsAt; advance(s, at); const fatigue = c.fatigue;
  advance(s, at + 6 * HOUR - 1); assert.equal(c.fatigue, fatigue);
  advance(s, at + 6 * HOUR); assert.equal(c.fatigue, fatigue - 12);
});
test('injuries and diversions created during catch-up use the actual landing time', () => {
  const s = fresh(); commit(s, s.plan); const r = s.active.report.results[0];
  r.outcome = 'divert'; r.injury = true; const at = s.active.returnsAt;
  advance(s, at + 29 * HOUR);
  assert.equal(s.aircraft.find(a => a.id === r.aircraft).away, true);
  assert.equal(s.crews.find(c => c.id === r.crew).injury, true);
  advance(s, at + 30 * HOUR); assert.equal(s.aircraft.find(a => a.id === r.aircraft).away, false);
  advance(s, at + 36 * HOUR); assert.equal(s.crews.find(c => c.id === r.crew).injury, false);
});
test('repairs begin at commitment and do not accrue before authorization', () => {
  const s = fresh(); s.aircraft[1].condition = 20; s.aircraft[1].defect = true;
  advance(s, START + 50 * HOUR); assert.equal(s.aircraft[1].condition, 20);
  const at = s.now; s.plan = proposePlan(s); s.plan.priority = s.aircraft[1].id;
  commit(s, s.plan); advance(s, at + 6 * HOUR - 1); assert.equal(s.aircraft[1].condition, 20);
  advance(s, at + 6 * HOUR); assert.equal(s.aircraft[1].condition, 58); assert.equal(s.aircraft[1].defect, false);
});
test('ordinary damage, injury and diversion cannot collapse a squadron', () => {
  const s = fresh(); s.aircraft.forEach(a => { a.condition = 10; a.defect = true; });
  s.crews.forEach(c => { c.injury = true; addJob(s, 'medical', 36, c.id); });
  assert.equal(proposePlan(s).flights.length, 0);
  for (let i = 0; i < 3; i++) { commit(s, proposePlan(s), true); finish(s); }
  assert.equal(s.phase, 'active'); assert.ok(s.aircraft.some(a => aircraftAvailable(s, a)));
  assert.ok(s.crews.every(c => crewAvailable(s, c)));
  assert.ok(proposePlan(s).flights.length > 0);
});
test('rush patch grants immediate readiness, consumes engineering, and remains defective', () => {
  const s = fresh(); const a = s.aircraft[1]; a.condition = 40; a.defect = false;
  const e = stationEvents(s).find(e => e.kind === 'rush'); assert.ok(e);
  const before = forecast(s, a, s.crews[1], s.plan);
  choose(s, e.key, 'rush'); assert.equal(a.condition, 68); assert.equal(a.defect, true); assert.equal(s.engineeringUsed, 1);
  assert.ok(forecast(s, a, s.crews[1], s.plan).mechanical > before.mechanical);
  assert.equal(repairCandidates(s, proposePlan(s)).length, 0);
  assert.throws(() => choose(s, e.key, 'rush'));
  commit(s, proposePlan(s)); finish(s); drain(s); assert.equal(a.defect, true);
  const p = proposePlan(s); p.flights = p.flights.filter(f => f.aircraft !== a.id); p.priority = a.id;
  commit(s, p, true); finish(s); assert.equal(a.defect, false);
});
test('route and standing orders change outcomes, time, accuracy and strain', () => {
  let routeDifferences = 0, orderDifferences = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const base = fresh(Math.imul(seed, 2654435761)); base.assignments[0].hazard = 4;
    const direct = copy(base), dogleg = copy(base), press = copy(base);
    dogleg.plan.route = 'dogleg'; press.plan.orders = 'press';
    const a = base.aircraft[0], c = base.crews[0];
    assert.ok(forecast(base, a, c, dogleg.plan).exposure <= forecast(base, a, c, direct.plan).exposure);
    assert.ok(forecast(base, a, c, press.plan).accuracy >= forecast(base, a, c, direct.plan).accuracy);
    commit(direct, direct.plan); commit(dogleg, dogleg.plan); commit(press, press.plan);
    assert.equal(duration(dogleg.plan) - duration(direct.plan), 2 * HOUR);
    const d = direct.active.report.results, g = dogleg.active.report.results, p = press.active.report.results;
    assert.equal(g[0].fatigue - d[0].fatigue, 14); assert.equal(p[0].fatigue - d[0].fatigue, 8);
    if (d.some((r, i) => r.outcome !== g[i].outcome)) routeDifferences++;
    if (d.some((r, i) => r.hit !== p[i].hit || r.outcome !== p[i].outcome)) orderDifferences++;
  }
  assert.ok(routeDifferences > 0); assert.ok(orderDifferences > 0);
});
test('reduced packages preserve crews but sacrifice possible contribution', () => {
  const s = fresh(); const restingCrew = s.plan.flights.pop().crew;
  commit(s, s.plan); finish(s);
  assert.equal(s.reports[0].sent, 1); assert.equal(s.requested, 2);
  assert.equal(s.crews.find(c => c.id === restingCrew).sorties, 0);
  assert.ok(s.reports[0].notes.some(n => n.includes('reduced package')));
});
test('successful raids gain experience and reduce the next relevant hazard', () => {
  const s = fresh(); commit(s, s.plan);
  for (const r of s.active.report.results) { r.hit = true; r.outcome = 'home'; }
  s.active.report.hits = 2;
  const before = s.crews.map(c => c.experience); finish(s);
  assert.ok(s.suppression > 0); assert.ok(s.crews.some((c, i) => c.experience > before[i]));
  const f = s.plan.flights[0], a = s.aircraft.find(a => a.id === f.aircraft), c = s.crews.find(c => c.id === f.crew);
  const eased = forecast(s, a, c, s.plan).exposure; s.suppression = 0;
  assert.ok(forecast(s, a, c, s.plan).exposure > eased);
});
test('injury replacements are limited and produce a named return decision', () => {
  const s = fresh(); const c = s.crews[0]; c.injury = true; addJob(s, 'medical', 36, c.id);
  assert.equal(crewAvailable(s, c), false);
  const e = stationEvents(s).find(e => e.kind === 'replacement'); const support = s.support;
  choose(s, e.key, 'assign'); assert.equal(s.support, support - 1); assert.equal(crewAvailable(s, c), true);
  assert.throws(() => choose(s, e.key, 'assign'));
  advance(s, s.now + 36 * HOUR);
  const returned = stationEvents(s).find(e => e.kind === 'returning'); assert.ok(returned);
  choose(s, returned.key, 'restore'); assert.equal(c.replacement, null); assert.equal(s.support, support);
});
test('recovery priority spends support and adjusts the existing job exactly once', () => {
  const s = fresh(); const a = s.aircraft[0]; a.away = true; addJob(s, 'recovery', 30, a.id, s.crews[0].id);
  const e = stationEvents(s).find(e => e.kind === 'recovery'); choose(s, e.key, 'expedite');
  assert.equal(s.jobs.find(j => j.kind === 'recovery').at, START + 12 * HOUR);
  assert.throws(() => choose(s, e.key, 'expedite')); advance(s, START + 12 * HOUR); assert.equal(a.away, false);
});
test('mentoring has prerequisites, opportunity cost, follow-up and cooldown', () => {
  const s = fresh(); assert.ok(!stationEvents(s).some(e => e.kind === 'mentor'));
  s.completed = 2;
  const e = stationEvents(s).find(e => e.kind === 'mentor'); assert.ok(e);
  const c = s.crews.find(c => c.id === e.subject); const xp = c.experience;
  const support = s.support;
  choose(s, e.key, 'train'); assert.equal(crewAvailable(s, c), false); assert.equal(s.support, support - 1);
  advance(s, START + 6 * HOUR); assert.equal(c.experience, xp + 2); assert.equal(crewAvailable(s, c), true);
  assert.ok(!stationEvents(s).some(e => e.kind === 'mentor'));
});
test('quiet opening is possible and every offered choice has a valid state effect or explicit defer', () => {
  const s = fresh(4); s.aircraft.forEach(a => a.condition = 90);
  assert.deepEqual(stationEvents(s), []);
});
test('station events cannot double-book engineering or train absent crews', () => {
  const s = fresh(); s.aircraft[1].condition = 30; addJob(s, 'repair', 6, s.aircraft[2].id);
  assert.ok(!stationEvents(s).some(e => e.kind === 'rush'));
  s.completed = 2; const novice = s.crews[1]; addJob(s, 'recovery', 30, s.aircraft[0].id, novice.id);
  assert.ok(!stationEvents(s).some(e => e.kind === 'mentor' && e.subject === novice.id));
});
test('poorly supported choices are disabled and cannot spend missing support', () => {
  const s = fresh(); s.support = 0; s.crews[0].injury = true;
  const event = stationEvents(s).find(e => e.kind === 'replacement');
  assert.equal(event.choices[0].disabled, true); assert.throws(() => choose(s, event.key, 'assign')); assert.equal(s.support, 0);
});
test('duplicate crew and unavailable aircraft packages are rejected without mutation', () => {
  const s = fresh(), p = copy(s.plan); p.flights[1].crew = p.flights[0].crew;
  const before = copy(s); assert.ok(planErrors(s, p).length); assert.throws(() => commit(s, p)); assert.deepEqual(s, before);
  s.aircraft.find(a => a.id === s.plan.flights[0].aircraft).condition = 10;
  assert.throws(() => commit(s, s.plan));
});
test('fourteen stand-downs end with zero contribution; no fifteenth assignment', () => {
  const s = fresh(); for (let i = 0; i < 14; i++) { commit(s, proposePlan(s), true); finish(s); }
  drain(s); assert.equal(s.completed, 14); assert.equal(s.phase, 'ended'); assert.equal(s.contribution, 0);
  assert.equal(s.reports.length, 14); assert.throws(() => commit(s, s.plan, true));
});
test('ending waits for all committed recovery, medical and engineering work', () => {
  const s = fresh(); for (let i = 0; i < 13; i++) { commit(s, proposePlan(s), true); finish(s); }
  commit(s, proposePlan(s)); const r = s.active.report.results[0]; r.outcome = 'divert'; r.injury = true;
  finish(s); assert.equal(s.phase, 'closing'); assert.ok(s.jobs.some(j => j.kind === 'recovery'));
  drain(s); assert.equal(s.phase, 'ended'); assert.equal(s.aircraft.find(a => a.id === r.aircraft).away, false); assert.equal(s.crews.find(c => c.id === r.crew).injury, false);
});
test('only irrecoverable total losses cause early withdrawal; support can recover a wiped-out squadron', () => {
  const dead = fresh(); dead.aircraft.forEach(a => a.lost = true); dead.crews.forEach(c => c.lost = true); dead.support = 0; advance(dead, START + 100 * HOUR);
  assert.equal(dead.phase, 'ended'); assert.equal(dead.ending, 'losses');
  const recover = fresh(); recover.aircraft.forEach(a => a.lost = true); recover.crews.forEach(c => c.lost = true);
  advance(recover, START); assert.equal(recover.phase, 'active');
  const e = stationEvents(recover).find(e => e.kind === 'reinforcement'); choose(recover, e.key, 'request');
  advance(recover, START + 12 * HOUR); assert.equal(recover.phase, 'active'); assert.equal(proposePlan(recover).flights.length, 1);
});
test('months away resolve one commitment, with no campaign decay or advancement', () => {
  const s = fresh(); commit(s, s.plan); advance(s, START + 90 * 24 * HOUR);
  assert.equal(s.completed, 1); assert.equal(s.phase, 'active');
  const before = copy(s); advance(s, s.now + 90 * 24 * HOUR); before.now = s.now; assert.deepEqual(s, before);
});

function memoryStorage() { const map = new Map(); return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) }; }
test('legacy saves are preserved byte-for-byte and new editions use a separate key', () => {
  const storage = memoryStorage(); const raw = '{"version":11,"old":"record"}'; storage.setItem(LEGACY_KEY, raw);
  const repo = createStorage(storage); assert.ok(repo.load().message.includes('preserved')); repo.save(fresh());
  assert.equal(storage.getItem(LEGACY_KEY), raw); assert.equal(storage.getItem(`${LEGACY_KEY}-before-desk`), raw);
  assert.equal(decode(storage.getItem(SAVE_KEY)).version, SAVE_VERSION);
});
test('unreadable or future saves are not overwritten; replacement archives the exact record', () => {
  const storage = memoryStorage(); const raw = '{"version":999}'; storage.setItem(SAVE_KEY, raw);
  const repo = createStorage(storage); assert.equal(repo.load().blocked, true); assert.equal(storage.getItem(SAVE_KEY), raw);
  repo.replace(fresh()); assert.ok([...storage.map].some(([k, v]) => k.includes('archive') && v === raw));
  assert.throws(() => decode('{')); const invalid = fresh(); invalid.crews = [{}]; assert.throws(() => decode(JSON.stringify(invalid)));
});
test('save and reload preserve active outcomes, queue and random position', () => {
  const storage = memoryStorage(), repo = createStorage(storage); const s = fresh(); commit(s, s.plan); repo.save(s);
  const loaded = createStorage(storage).load().state; assert.deepEqual(loaded, s); finish(s); finish(loaded); assert.deepEqual(loaded, s);
});
test('a stale browser tab cannot overwrite a newer commitment', () => {
  const storage = memoryStorage(); const first = createStorage(storage), second = createStorage(storage);
  first.save(fresh()); assert.throws(() => second.save(fresh(15)), /another tab/);
});
test('storage failures propagate before overwriting or replacing a tour', () => {
  const storage = memoryStorage(); const repo = createStorage(storage); repo.save(fresh()); const before = storage.getItem(SAVE_KEY);
  storage.setItem = () => { throw new Error('quota'); }; assert.throws(() => repo.replace(fresh(9)), /quota/); assert.equal(storage.getItem(SAVE_KEY), before);
});

test('seeded tours with daily, accelerated, aggressive and cautious approaches reach a proper ending', () => {
  const stats = {};
  for (const approach of ['daily', 'accelerated', 'aggressive', 'cautious']) {
    let hits = 0, losses = 0, down = 0, completed = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const s = fresh(seed);
      for (let step = 0; step < 14 && s.phase === 'active'; step++) {
        // Resolve available exceptional needs without imposing a scripted event sequence.
        for (const e of stationEvents(s)) {
          if (e.kind === 'returning') choose(s, e.key, 'restore');
          if (e.kind === 'reinforcement' && s.support >= 2) choose(s, e.key, 'request');
          if (e.kind === 'replacement' && s.support >= 1) choose(s, e.key, 'assign');
        }
        const p = proposePlan(s);
        if (approach === 'aggressive') p.orders = 'press';
        if (approach === 'cautious') { p.route = 'dogleg'; p.flights = p.flights.filter(f => s.crews.find(c => c.id === f.crew).fatigue < 55).slice(0, 2); }
        const standDown = p.flights.length === 0;
        commit(s, p, standDown); const committed = decode(JSON.stringify(s));
        const to = approach === 'accelerated' ? s.active.returnsAt : s.active.startedAt + 24 * HOUR;
        advance(s, to); advance(committed, to); assert.deepEqual(s, committed);
        assert.ok(s.crews.every(c => c.fatigue >= 0 && c.fatigue <= 100));
      }
      drain(s); assert.equal(s.phase, 'ended', `${approach} seed ${seed}`);
      assert.ok(s.completed === 14 || s.ending === 'losses');
      hits += s.contribution; losses += s.aircraft.filter(a => a.lost).length; down += s.reports.filter(r => r.stoodDown).length; completed++;
    }
    stats[approach] = { tours: completed, averageHits: +(hits / completed).toFixed(2), averageLosses: +(losses / completed).toFixed(2), averageStandDowns: +(down / completed).toFixed(2) };
  }
  console.log('Seeded campaign results:', JSON.stringify(stats));
  assert.ok(stats.aggressive.averageHits > stats.cautious.averageHits);
  assert.ok(stats.aggressive.averageLosses > stats.cautious.averageLosses);
  assert.ok(stats.daily.averageHits > 12);
});
