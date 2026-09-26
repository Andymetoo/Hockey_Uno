import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { advance, aircraftAvailable, choose, commit, createCampaign, SAVE_VERSION, crewAvailable, forecast, flightFatigue, HOUR, nextMilestone, proposePlan, repairCandidates, tourMemories } from '../game.ts';
import { makeAssignments, stationEvents } from '../content.ts';
import { createStorage, decode, SAVE_KEY } from '../persistence.ts';

const START = 1_800_000_000_000;
const fresh = (seed = 73) => { const s = createCampaign(seed, START); s.legacyTour = true; s.threads = []; return s; };
const finish = s => advance(s, s.active.returnsAt);
const drain = s => { let n = 0; while (s.jobs.length) { assert.ok(n++ < 200); advance(s, nextMilestone(s)); } };
const job = (s, kind, delay, subject, text) => s.jobs.push({ id: s.nextId++, at: s.now + delay * HOUR, kind, subject, ...(text ? { text } : {}) });
const select = (s, kind, choice, subject) => { const event = stationEvents(s).find(e => e.kind === kind && (!subject || e.subject === subject)); assert.ok(event, `${kind} must be eligible`); choose(s, event.key, choice); return event; };

test('middle decks and demands vary while the opening and final contribution are readable', () => {
  const decks = new Set(), circumstances = new Set(), demands = new Set();
  for (let seed = 1; seed < 90; seed++) {
    const s = fresh(Math.imul(seed, 2654435761));
    assert.equal(s.assignments.length, 14); assert.equal(s.assignments[0].requested, 2);
    assert.deepEqual(s.assignments.slice(11).map(a => a.requested), [3, 3, 2]);
    decks.add(s.assignments.slice(3, 11).map(a => a.title).join('|'));
    s.assignments.forEach(a => circumstances.add(a.circumstance));
    demands.add(s.assignments.slice(3, 11).map(a => a.requested).join(','));
  }
  assert.ok(decks.size > 50); assert.equal(circumstances.size, 6); assert.ok(demands.size > 5);
});
test('circumstances change existing route and orders trade-offs', () => {
  const s = fresh(), a = s.aircraft[0], c = s.crews[0], direct = s.plan, dogleg = { ...s.plan, route: 'dogleg' };
  s.assignments[0].hazard = 4;
  s.assignments[0].circumstance = 'escort';
  const escortedGap = forecast(s, a, c, direct).exposure - forecast(s, a, c, dogleg).exposure;
  s.assignments[0].circumstance = 'flak';
  assert.ok(forecast(s, a, c, direct).exposure - forecast(s, a, c, dogleg).exposure > escortedGap);
  s.assignments[0].circumstance = 'window';
  assert.ok(forecast(s, a, c, direct).accuracy > forecast(s, a, c, dogleg).accuracy);
  s.assignments[0].circumstance = 'fuel';
  assert.equal(flightFatigue(s, a, dogleg) - flightFatigue(s, a, direct), 22);
});
test('different defects cause different foreseeable costs', () => {
  const s = fresh(), a = s.aircraft[0], c = s.crews[1]; a.defect = true;
  a.defectType = 'oil'; const oil = forecast(s, a, c, s.plan);
  a.defectType = 'sight'; const sight = forecast(s, a, c, s.plan);
  a.defectType = 'controls'; const controls = forecast(s, a, c, s.plan);
  assert.ok(oil.mechanical > sight.mechanical); assert.ok(sight.accuracy < oil.accuracy); assert.ok(controls.exposure > oil.exposure);
});
test('a risky field patch is offered only when it restores grounded aircraft to availability', () => {
  const s = fresh(); s.aircraft[0].condition = 60;
  assert.ok(!stationEvents(s).some(e => e.kind === 'rush' && e.subject === 'a0'));
  s.aircraft[0].condition = 40; select(s, 'rush', 'rush', 'a0'); assert.equal(aircraftAvailable(s, s.aircraft[0]), true);
});
test('specialist inspection has a real cost, duration and limited follow-up protection', () => {
  const s = fresh(), a = s.aircraft[0]; a.defect = true; a.defectType = 'sight'; a.condition = 60;
  const support = s.support; select(s, 'inspection', 'bench', a.id);
  assert.equal(s.support, support - 1); assert.equal(s.engineeringUsed, 1); assert.equal(aircraftAvailable(s, a), false);
  advance(s, START + 3 * HOUR - 1); assert.equal(a.defect, true);
  advance(s, START + 3 * HOUR); assert.equal(a.defect, false); assert.equal(a.condition, 72); assert.equal(a.certified, 2);
  assert.equal(repairCandidates(s, { ...s.plan, flights: [] }).length, 0);
  const p = { ...s.plan, flights: [{ aircraft: a.id, crew: s.crews[0].id }] }; commit(s, p); assert.equal(a.certified, 1);
});
test('forward workshops trade recovery time for a lasting repair; scheduled return needs sign-off', () => {
  for (const option of ['overhaul', 'wait']) {
    const s = fresh(), a = s.aircraft[0]; a.away = true; a.condition = 40; a.defect = true; a.defectType = 'controls'; job(s, 'recovery', 30, a.id, s.crews[0].id);
    select(s, 'recovery', option, a.id); advance(s, START + 30 * HOUR);
    assert.equal(a.away, option === 'overhaul');
    advance(s, START + 36 * HOUR);
    assert.equal(a.away, false); assert.equal(a.recovered, option === 'wait'); assert.equal(a.defect, option === 'wait');
    if (option === 'overhaul') { assert.equal(a.condition, 70); assert.equal(a.certified, 2); }
    else assert.ok(stationEvents(s).some(e => e.kind === 'inspection' && e.subject === a.id));
  }
});
test('recovery cannot spend support to make an imminent return later', () => {
  const s = fresh(), a = s.aircraft[0]; a.away = true; job(s, 'recovery', .5, a.id, s.crews[0].id);
  const e = stationEvents(s).find(e => e.kind === 'recovery'); assert.equal(e.choices.find(c => c.id === 'expedite').disabled, true);
  assert.throws(() => choose(s, e.key, 'expedite'));
});
test('strain survives idle calendar time; an off-duty assignment gives real relief', () => {
  const s = fresh(), c = s.crews[0]; c.strain = 3; c.fatigue = 80; job(s, 'rest', 6, c.id);
  advance(s, START + 100 * HOUR); assert.equal(c.fatigue, 36); assert.equal(c.strain, 3);
  commit(s, proposePlan(s), true); finish(s); assert.equal(c.strain, 2); assert.ok(c.fatigue >= 24);
});
test('promised leave cannot be bypassed by acceleration and releases at the next report', () => {
  const s = fresh(), c = s.crews[0]; c.strain = 3; c.fatigue = 65;
  select(s, 'strain', 'leave', c.id); assert.equal(crewAvailable(s, c), false);
  advance(s, START + 200 * HOUR); assert.equal(crewAvailable(s, c), false);
  commit(s, proposePlan(s)); finish(s);
  assert.equal(c.strain, 0); assert.equal(c.fatigue, 0); assert.equal(crewAvailable(s, c), true);
  assert.ok(tourMemories(s).some(t => t.includes('promised')));
});
test('supported debrief and retained replacement clear strain at their stated cost', () => {
  const s = fresh(), c = s.crews[0]; c.strain = 2; c.fatigue = 50; const support = s.support;
  select(s, 'strain', 'debrief', c.id); assert.equal(c.strain, 1); assert.equal(c.fatigue, 38); assert.equal(s.support, support - 1);
  c.returned = true; c.replacement = 'Sgt. Walsh'; c.replacementSorties = 3;
  select(s, 'returning', 'retain', c.id); assert.equal(c.specialist, 'Sgt. Walsh'); assert.equal(c.strain, 0); assert.equal(c.fatigue, 18);
});
test('earned photos offer either accuracy preparation or reduced opposition, once', () => {
  const s = fresh(); commit(s, s.plan); s.active.report.hits = 2; finish(s);
  assert.equal(s.opportunity.kind, 'photos'); assert.equal(s.opportunity.slot, s.completed);
  const other = structuredClone(s), before = other.suppression;
  select(s, 'opportunity', 'brief'); assert.equal(s.briefing, true); assert.equal(s.opportunity, null);
  select(other, 'opportunity', 'share'); assert.equal(other.suppression, before + .5);
  commit(s, proposePlan(s)); assert.equal(s.briefing, false); assert.ok(s.active.report.notes.some(n => n.includes('approach notes')));
});
test('mobile workshops spend the earned opportunity and add exactly one repair allocation', () => {
  const s = fresh(); s.opportunity = { kind: 'transport', source: 'The repair sheds', slot: 0 };
  s.aircraft.forEach(a => a.condition = 40); select(s, 'opportunity', 'bay');
  assert.equal(repairCandidates(s, { ...s.plan, flights: [] }).length, 2);
  commit(s, proposePlan(s), true); assert.equal(s.jobs.filter(j => j.kind === 'repair').length, 3); assert.equal(s.extraBay, 0);
  finish(s); assert.equal(s.jobs.filter(j => j.kind === 'repair').length, 0);
});
test('two station decisions cap each visit and expired opportunities cannot be farmed', () => {
  const s = fresh(); s.crews[0].injury = true; s.crews[1].injury = true; s.aircraft[0].condition = 40;
  select(s, 'replacement', 'wait', 'c0'); select(s, 'replacement', 'wait', 'c1');
  assert.equal(stationEvents(s).length, 0);
  s.opportunity = { kind: 'photos', source: 'Old photographs', slot: 0 }; commit(s, proposePlan(s), true);
  assert.equal(s.opportunity, null); finish(s); s.crews[2].injury = true;
  assert.ok(stationEvents(s).some(e => e.kind === 'replacement' && e.subject === 'c2'));
});
test('replacement familiarity improves through actual sorties, not calendar time', () => {
  const s = fresh(), c = s.crews[0], a = s.aircraft[0]; c.replacement = 'Sgt. Walsh'; c.replacementSorties = 0;
  const freshAccuracy = forecast(s, a, c, s.plan).accuracy; advance(s, START + 50 * HOUR);
  assert.equal(c.replacementSorties, 0);
  c.replacementSorties = 3; assert.ok(forecast(s, a, c, s.plan).accuracy > freshAccuracy);
});
test('a lost replacement crew does not erase the original specialist or their medical work', () => {
  const s = fresh(), c = s.crews[0]; c.injury = true; c.replacement = 'Sgt. Walsh'; job(s, 'medical', 36, c.id);
  commit(s, { ...s.plan, flights: [{ aircraft: 'a0', crew: c.id }] });
  s.active.report.results[0].outcome = 'lost'; s.active.report.results[0].hit = false; s.active.report.hits = 0;
  finish(s); assert.equal(c.lost, true); assert.ok(s.jobs.some(j => j.kind === 'medical' && j.subject === c.id));
  assert.ok(tourMemories(s).some(t => t.includes(c.specialist) && t.includes('survived ashore')));
  advance(s, START + 36 * HOUR); assert.equal(c.injury, false); assert.equal(c.returned, false);
  assert.equal(c.replacement, 'Sgt. Walsh'); assert.ok(s.notices.some(t => t.includes('reassignment by Group')));
});
test('a single old loss does not permit building an unlimited reserve fleet', () => {
  const s = fresh(); for (let i = 0; i < 3; i++) { s.aircraft[i].lost = true; s.crews[i].lost = true; }
  select(s, 'reinforcement', 'request'); advance(s, START + 12 * HOUR);
  s.completed = 5; assert.equal(s.aircraft.filter(a => !a.lost).length, 4); assert.ok(!stationEvents(s).some(e => e.kind === 'reinforcement'));
});
test('automatic proposals refresh after work; a manually edited package stays untouched', () => {
  const s = fresh(); s.aircraft.forEach(a => a.condition = 30); s.plan = proposePlan(s); job(s, 'repair', 6, 'a0');
  const manual = structuredClone(s); manual.planEdited = true;
  advance(s, START + 6 * HOUR); advance(manual, START + 6 * HOUR);
  assert.equal(s.plan.flights.length, 1); assert.equal(manual.plan.flights.length, 0);
});
test('v20 migration preserves every committed result, job timestamp and random position', () => {
  const raw = readFileSync(new URL('./fixtures/v20-active.json', import.meta.url), 'utf8'), original = JSON.parse(raw), s = decode(raw);
  assert.equal(s.version, SAVE_VERSION); assert.deepEqual(s.active, original.active); assert.deepEqual(s.jobs, original.jobs); assert.equal(s.rng, original.rng);
  assert.ok(s.assignments.every(a => a.circumstance === 'ordinary'));
  const reload = decode(JSON.stringify(s)); finish(s); finish(reload); assert.deepEqual(s, reload);
  const map = new Map([[SAVE_KEY, raw]]), storage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  const repo = createStorage(storage); const loaded = repo.load(); assert.ok(loaded.message.includes('backed up')); assert.equal(map.get(SAVE_KEY), raw);
  repo.save(loaded.state); assert.ok([...map].some(([k, v]) => k.includes('before-campaign-pass') && v === raw));
});
test('malformed content fields are rejected instead of silently resetting consequences', () => {
  const s = fresh(); s.crews[0].strain = -1; assert.throws(() => decode(JSON.stringify(s)));
  s.crews[0].strain = 0; s.aircraft[0].defectType = 'unrecognized'; assert.throws(() => decode(JSON.stringify(s)));
});
test('generated flight text accounts for all injuries, losses and mechanical aborts', () => {
  let injuries = 0, abortInjuries = 0, credits = 0, defects = 0;
  for (let seed = 1; seed <= 700; seed++) {
    const s = fresh(Math.imul(seed, 2654435761));
    s.aircraft.forEach(a => { a.condition = 62; a.certified = 2; });
    s.crews.forEach(c => { c.lesson = true; c.fatigue = 65; });
    s.briefing = true; const p = proposePlan(s); p.orders = seed % 2 ? 'press' : 'preserve';
    commit(s, p);
    for (const r of s.active.report.results) {
      if (r.injury) { injuries++; assert.match(r.note, /wounded and admitted/); if (r.outcome === 'abort') abortInjuries++; }
      else assert.doesNotMatch(r.note, /was wounded/);
      if (r.outcome === 'lost') { assert.match(r.note, /was lost/); assert.equal(r.hit, false); }
      else assert.doesNotMatch(r.note, /was lost/);
      if (r.outcome === 'abort') assert.equal(r.hit, false);
      if (r.credits.includes('restraint')) assert.notEqual(r.outcome, 'abort');
      if (r.credits.includes('training') || r.credits.includes('briefing') || r.credits.includes('orders')) assert.equal(r.hit, true);
      credits += r.credits.length; if (r.newDefect) defects++;
    }
  }
  assert.ok(injuries > 20); assert.ok(abortInjuries > 0); assert.ok(credits > 40); assert.ok(defects > 20);
});
test('content-rich tours preserve chronological equivalence and reach endings under several policies', () => {
  const stats = {}, allKinds = new Set();
  for (const approach of ['preserve', 'press', 'prepare', 'rapid']) {
    let hits = 0, losses = 0, decisions = 0, quiet = 0, experienced = 0;
    for (let seed = 1; seed <= 70; seed++) {
      const s = fresh(Math.imul(seed, 2654435761));
      for (let slot = 0; slot < 14 && s.phase === 'active'; slot++) {
        if (!stationEvents(s).length) quiet++;
        for (let choice = 0; choice < 2; choice++) {
          const e = stationEvents(s)[0]; if (!e) break; allKinds.add(e.kind);
          const preference = approach === 'press'
            ? { strain: 'duty', rush: 'rush', inspection: 'carry', opportunity: 'brief', recovery: 'expedite', mentor: 'fly', returning: 'retain', replacement: 'assign', reinforcement: 'request' }
            : { strain: 'leave', rush: 'proper', inspection: 'bench', opportunity: s.opportunity?.kind === 'photos' ? 'share' : 'bay', recovery: 'overhaul', mentor: 'train', returning: 'restore', replacement: 'assign', reinforcement: 'request' };
          const option = e.choices.find(c => c.id === preference[e.kind] && !c.disabled) ?? e.choices.find(c => !c.disabled);
          choose(s, e.key, option.id); decisions++;
        }
        const p = proposePlan(s); p.orders = approach === 'press' ? 'press' : 'preserve';
        if (approach === 'prepare') { p.route = s.assignments[s.completed].circumstance === 'flak' ? 'dogleg' : 'direct'; p.flights = p.flights.filter(f => s.crews.find(c => c.id === f.crew).strain < 3); }
        commit(s, p, !p.flights.length);
        const fine = decode(JSON.stringify(s)), to = approach === 'rapid' ? s.active.returnsAt : s.active.startedAt + 24 * HOUR;
        for (let t = fine.now + HOUR; t < to; t += HOUR) advance(fine, t);
        advance(fine, to); advance(s, to); assert.deepEqual(fine, s, `${approach} seed ${seed} slot ${slot}`);
      }
      drain(s); assert.equal(s.phase, 'ended'); assert.ok(s.completed === 14 || s.ending === 'losses');
      assert.ok(s.support >= 0 && s.support <= 5); assert.ok(s.crews.every(c => c.strain >= 0 && c.strain <= 3));
      hits += s.contribution; losses += s.aircraft.filter(a => a.lost).length; experienced += s.crews.filter(c => !c.lost && c.experience >= 6).length;
      assert.doesNotMatch(tourMemories(s).join(' '), /undefined|NaN/);
    }
    stats[approach] = { averageHits: +(hits / 70).toFixed(2), averageLosses: +(losses / 70).toFixed(2), averageDecisions: +(decisions / 70).toFixed(2), quietVisits: quiet, averageVeteransHome: +(experienced / 70).toFixed(2) };
  }
  console.log('Content-pass campaign sample:', JSON.stringify(stats), 'Event families:', [...allKinds].join(', '));
  assert.ok(allKinds.size >= 8); assert.ok(stats.press.averageLosses > stats.preserve.averageLosses);
  assert.ok(stats.prepare.averageHits > 14); assert.ok(stats.preserve.quietVisits > 0);
});
