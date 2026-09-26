import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, choose, commit, createCampaign, HOUR, prepareMorning, proposePlan, tourEvaluation } from '../game.ts';
import { stationEvents } from '../content.ts';
import { decode } from '../persistence.ts';

const START = 1_800_000_000_000;
const fresh = seed => createCampaign(seed, START);
const morning = s => { if (s.now < s.nextMorningAt) prepareMorning(s); };
const finish = s => advance(s, s.active.returnsAt);
const pick = (s, kind, id) => { const e = stationEvents(s).find(e => e.kind === kind); assert.ok(e, `missing ${kind}`); choose(s, e.key, id); };
const down = (s, count) => { for (let i = 0; i < count; i++) { morning(s); commit(s, proposePlan(s), true); finish(s); } };

test('six distinct starters leave a reserve; two support deliveries stop at eight', () => {
  const s = fresh(43);
  assert.equal(s.aircraft.length, 6); assert.equal(s.crews.length, 6);
  assert.equal(new Set(s.aircraft.map(a => a.name)).size, 6);
  assert.equal(new Set(s.crews.map(c => c.pilot)).size, 6);
  assert.equal(s.plan.flights.length, 2);
  down(s, 4); morning(s);
  const first = stationEvents(s).find(e => e.kind === 'reinforcement');
  assert.ok(first); choose(s, first.key, 'request'); advance(s, s.now + 12 * HOUR);
  assert.equal(s.aircraft.length, 7);
  down(s, 4); morning(s); s.support = 2;
  const second = stationEvents(s).find(e => e.kind === 'reinforcement');
  assert.ok(second); choose(s, second.key, 'request'); advance(s, s.now + 12 * HOUR);
  assert.equal(s.aircraft.length, 8);
  assert.equal(new Set(s.aircraft.map(a => a.name)).size, 8);
  assert.equal(new Set(s.crews.map(c => c.specialist)).size, 8);
  assert.ok(!stationEvents(s).some(e => e.kind === 'reinforcement'));
});

test('three campaign branches change actual assignments and preserve a fixed ledger', () => {
  for (const [slot, ids] of [[2, ['mobile','main','escort']], [6, ['relief','main','recon']], [9, ['junction','main','verify']]]) {
    const variants = [];
    for (const id of ids) {
      const s = fresh(72); down(s, slot); morning(s);
      s.support = 4;
      const before = structuredClone(s.assignments[slot + 1]);
      pick(s, 'branch', id);
      assert.equal(s.assignments.length, 14);
      assert.equal(s.completed, slot);
      assert.ok(s.branches.some(b => b.slot === slot));
      assert.ok(s.assignments[slot + 1].followup);
      variants.push(JSON.stringify({ ...s.assignments[slot + 1], support: s.support }));
      const loaded = decode(JSON.stringify(s));
      assert.deepEqual(loaded.assignments, s.assignments);
      assert.deepEqual(loaded.branches, s.branches);
      assert.deepEqual(loaded.rng, s.rng);
      commit(s, proposePlan(s), true); finish(s); morning(s);
      assert.equal(s.completed, slot + 1);
      commit(s, proposePlan(s)); s.active.report.results.forEach(r => { r.hit = true; r.outcome = 'home'; }); s.active.report.hits = s.active.report.results.length; finish(s);
      const emptyStores = slot === 9 && id === 'main' && s.campaign.intelligence.find(i => i.id === 'stores').truth === 'empty';
      assert.equal(s.branches.find(b => b.slot === slot).fulfilled, !emptyStores);
      assert.equal(s.completed, slot + 2);
      assert.notDeepEqual(s.assignments[slot + 1], before);
    }
    assert.equal(new Set(variants).size, 3, `branch at ${slot}`);
  }
  const invalid = fresh(9); down(invalid, 2); morning(invalid);
  const p = proposePlan(invalid); p.flights = [];
  assert.throws(() => commit(invalid, p));
  assert.equal(invalid.branches.length, 0);
});

test('mission dilemmas alter current mechanics and cannot be selected twice', () => {
  const escort = fresh(12); down(escort, 4); morning(escort);
  const window = structuredClone(escort);
  pick(escort, 'mission', 'escort'); pick(window, 'mission', 'window');
  assert.equal(escort.assignments[4].circumstance, 'escort');
  assert.equal(window.assignments[4].circumstance, 'window');
  assert.throws(() => pick(window, 'mission', 'escort'));
  const alternate = fresh(18); down(alternate, 11); morning(alternate);
  pick(alternate, 'mission', 'alternate');
  assert.equal(alternate.assignments[11].requested, 2);
  assert.equal(alternate.assignments[11].effect, 'supplies');
});

test('morning acceleration matches elapsed real time and never farms recovery', () => {
  const s = fresh(26); s.crews[0].strain = 2; s.crews[0].fatigue = 60;
  commit(s, s.plan); const real = structuredClone(s), fast = structuredClone(s);
  advance(real, real.nextMorningAt);
  finish(fast); prepareMorning(fast);
  assert.deepEqual(fast, real);
  const before = structuredClone(fast); prepareMorning(fast); assert.deepEqual(fast, before);
  advance(fast, fast.now + 24 * HOUR); const elapsed = fast.now; prepareMorning(fast);
  assert.equal(fast.now, elapsed); assert.equal(fast.completed, 1);
  assert.ok(fast.crews[0].strain > 0);
});

test('a full daily schedule matches return-report plus morning acceleration', () => {
  const daily = fresh(1940672679), accelerated = structuredClone(daily);
  for (let slot = 0; slot < 14; slot++) {
    const d = proposePlan(daily), a = proposePlan(accelerated);
    assert.deepEqual(d, a);
    commit(daily, d, !d.flights.length); commit(accelerated, a, !a.flights.length);
    advance(daily, daily.nextMorningAt);
    finish(accelerated); if (slot === 13) advance(accelerated, accelerated.nextMorningAt); else prepareMorning(accelerated);
    assert.deepEqual(accelerated, daily, `assignment ${slot + 1}`);
  }
});

test('injury, fault, diversion and novice threads keep identities and resolve from real work', () => {
  const cases = [
    ['injury', r => { r.injury = true; r.outcome = 'home'; }, 'replacement'],
    ['fault', r => { r.newDefect = 'oil'; r.outcome = 'home'; }, 'inspection'],
    ['diversion', r => { r.outcome = 'divert'; }, 'recovery'],
  ];
  for (const [family, alter, kind] of cases) {
    let found;
    for (let seed = 1; seed < 80 && !found; seed++) {
      const s = fresh(seed); commit(s, s.plan); const r = s.active.report.results[0]; alter(r);
      s.active.report.results = [r]; s.active.report.sent = 1; s.active.report.hits = Number(r.hit);
      finish(s); if (s.threads.some(t => t.family === family)) found = { s, r };
    }
    assert.ok(found, family);
    const { s, r } = found; const t = s.threads.find(t => t.family === family);
    assert.equal(t.subject, family === 'injury' ? r.crew : r.aircraft);
    assert.deepEqual(decode(JSON.stringify(s)).threads, s.threads);
    morning(s);
    const e = stationEvents(s).find(e => e.kind === kind && e.subject === t.subject);
    assert.ok(e, family);
    if (family === 'injury') { choose(s, e.key, 'assign'); assert.match(t.note, /Sgt\./); advance(s, s.now + 36 * HOUR); assert.equal(t.stage, 'returned'); }
    if (family === 'fault') { choose(s, e.key, 'bench'); advance(s, s.now + 3 * HOUR); assert.equal(t.stage, 'repaired'); }
    if (family === 'diversion') { choose(s, e.key, 'overhaul'); advance(s, s.now + 36 * HOUR); assert.equal(t.stage, 'overhauled'); }
    assert.equal(s.threads.filter(x => x.family === family).length, 1);
  }
  let novice;
  for (let seed = 1; seed < 30 && !novice; seed++) { const s = fresh(seed); if (s.threads.some(t => t.family === 'novice')) novice = s; }
  assert.ok(novice);
  down(novice, 2); morning(novice);
  pick(novice, 'mentor', 'train'); advance(novice, novice.now + 6 * HOUR);
  const t = novice.threads.find(t => t.family === 'novice'); assert.equal(t.stage, 'trained');
  novice.crews.find(c => c.id === t.subject).sorties = 2;
  down(novice, 2); morning(novice);
  pick(novice, 'leadership', 'lead'); assert.equal(t.stage, 'led'); assert.equal(novice.briefing, true);
});

test('unavailable participants close threads without offering impossible choices', () => {
  const s = fresh(5);
  s.threads = [
    { family: 'novice', subject: 'c1', stage: 'offered', dueSlot: 0, note: 'Bell was offered mentoring.' },
    { family: 'fault', subject: 'a1', stage: 'open', dueSlot: 0, note: 'Sunday Punch has a finding.' },
    { family: 'diversion', subject: 'a2', stage: 'open', dueSlot: 0, note: 'Skylark is away.' },
  ];
  s.crews[1].lost = true; s.aircraft[1].lost = true; s.aircraft[2].lost = true;
  assert.ok(!stationEvents(s).some(e => ['mentor','inspection','recovery'].includes(e.kind) && ['c1','a1','a2'].includes(e.subject)));
  commit(s, proposePlan(s)); finish(s);
  assert.equal(s.threads.find(t => t.family === 'novice').stage, 'lost');
  assert.equal(s.threads.find(t => t.family === 'fault').stage, 'lost');
  assert.equal(s.threads.find(t => t.family === 'diversion').stage, 'lost');
  assert.doesNotMatch(s.threads.map(t => t.note).join(' '), /undefined|NaN/);
});

test('evaluation counts objectives, preservation and actual branch fulfillment, not extra hits', () => {
  const s = fresh(1);
  const report = (hits, requested = 3) => ({ hits, requested, stoodDown: false });
  s.reports = [...Array(11)].map(() => report(2)); s.completed = 14;
  s.branches = [2,6,9].map(slot => ({ slot, choice: 'main', promise: 'objective', fulfilled: true }));
  assert.equal(tourEvaluation(s).grade, 'excellent');
  s.reports[0].hits = 10; assert.equal(tourEvaluation(s).grade, 'excellent');
  s.crews[0].lost = true; s.crews[1].lost = true; assert.equal(tourEvaluation(s).grade, 'strong');
  s.reports = [...Array(4)].map(() => report(2)); assert.equal(tourEvaluation(s).grade, 'mixed');
  s.reports = [...Array(2)].map(() => report(20)); assert.equal(tourEvaluation(s).grade, 'failed');
});

test('fresh seeded tours finish with branch variety and no routine decision stack', () => {
  const seen = new Set(); let strainOffers = 0, visits = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const s = fresh(Math.imul(seed, 2654435761));
    for (let slot = 0; slot < 14 && s.phase === 'active'; slot++) {
      morning(s);
      const event = stationEvents(s); assert.ok(event.length <= 3);
      strainOffers += event.filter(e => e.kind === 'strain').length; visits++;
      const branch = event.find(e => e.kind === 'branch');
      if (branch) { const enabled = branch.choices.filter(c => !c.disabled); choose(s, branch.key, enabled[seed % enabled.length].id); seen.add(s.branches.at(-1).choice); }
      const p = proposePlan(s); p.orders = seed % 3 === 0 ? 'press' : 'preserve';
      commit(s, p, !p.flights.length); finish(s);
    }
    while (s.jobs.length) advance(s, Math.min(...s.jobs.map(j => j.at)));
    assert.equal(s.phase, 'ended');
    assert.equal(s.completed, 14);
    assert.ok(s.aircraft.length <= 8);
  }
  assert.ok(seen.size >= 3);
  assert.ok(strainOffers < visits / 2, `strain offers ${strainOffers}/${visits}`);
});
