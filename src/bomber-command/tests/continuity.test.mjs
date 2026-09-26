import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, choose, commit, createCampaign, HOUR, prepareMorning, proposePlan, repairCandidates } from '../game.ts';
import { stationEvents } from '../content.ts';
import { recordThread, snapshotThreads } from '../history.ts';
import { createStorage, decode, SAVE_KEY } from '../persistence.ts';

const START = 1_800_000_000_000;
const fresh = seed => createCampaign(seed ?? 44, START);
const finish = s => advance(s, s.active.returnsAt);
const thread = (s, family, subject, stage = 'open') => {
  const t = { family, subject, stage, dueSlot: s.completed, note: 'The original entry remains in the station book.' };
  s.threads = [t]; snapshotThreads(s); return t;
};
const lose = (s, a, c) => {
  prepareMorning(s);
  commit(s, { ...proposePlan(s), flights: [{ aircraft: a.id, crew: c.id }] });
  Object.assign(s.active.report.results[0], { outcome: 'lost', hit: false, injury: false, note: `${a.name} lost with ${c.pilot}'s flying crew.` });
  s.active.report.hits = 0; finish(s);
};

test('completed engineering history survives a later casualty and later reports', () => {
  const s = fresh(), a = s.aircraft[0], c = s.crews[0];
  const t = thread(s, 'fault', a.id);
  recordThread(s, t, 'bench', 'Finch reserved the aircraft for specialist work.');
  recordThread(s, t, 'repaired', `${a.name} returned from Finch's bay; the original finding was cleared.`);
  const resolution = t.note, milestones = structuredClone(t.milestones);
  lose(s, a, c);
  assert.equal(t.status, 'resolved'); assert.equal(t.stage, 'repaired'); assert.equal(t.note, resolution);
  assert.deepEqual(t.milestones.slice(0, milestones.length), milestones);
  assert.equal(t.milestones.filter(m => m.stage === 'later-loss').length, 1);
  prepareMorning(s); commit(s, proposePlan(s), true); finish(s);
  assert.equal(t.milestones.filter(m => m.stage === 'later-loss').length, 1);
  assert.doesNotMatch(t.note, /lost before/);
  assert.deepEqual(decode(JSON.stringify(s)).threads, s.threads);
});

test('a retained replacement keeps separate original identity and committed report snapshots', () => {
  const s = fresh(), c = s.crews[0];
  c.injury = true;
  const t = thread(s, 'injury', c.id), originalName = c.specialist, originalId = c.specialistId;
  let e = stationEvents(s).find(e => e.kind === 'replacement'); choose(s, e.key, 'assign');
  const replacementName = c.replacement, replacementId = c.replacementId;
  assert.notEqual(replacementId, originalId);
  c.injury = false; c.returned = true;
  e = stationEvents(s).find(e => e.kind === 'returning'); choose(s, e.key, 'retain');
  assert.equal(c.specialistId, replacementId); assert.equal(c.specialist, replacementName);
  assert.equal(t.participants.find(p => p.id === originalId).name, originalName);
  assert.equal(t.participants.find(p => p.id === replacementId).name, replacementName);
  assert.match(t.note, /moved to instruction/);
  commit(s, { ...proposePlan(s), flights: [{ aircraft: s.aircraft[0].id, crew: c.id }] });
  const report = structuredClone(s.active.report);
  assert.equal(report.results[0].specialistName, replacementName);
  assert.equal(report.results[0].specialistId, replacementId);
  assert.deepEqual(decode(JSON.stringify(s)).active.report, report);
  finish(s); c.specialist = 'A later posting';
  assert.equal(s.reports[0].results[0].specialistName, replacementName);
});

test('an original specialist survives ashore after recovery when substitute crew is later lost', () => {
  const s = fresh(), c = s.crews[0], a = s.aircraft[0]; c.injury = true;
  const t = thread(s, 'injury', c.id);
  const e = stationEvents(s).find(e => e.kind === 'replacement'); choose(s, e.key, 'assign');
  c.injury = false; c.returned = true;
  const original = c.specialist, replacement = c.replacement;
  lose(s, a, c);
  assert.equal(t.stage, 'ashore'); assert.ok(t.note.includes(original)); assert.ok(t.note.includes(replacement));
  assert.match(t.note, /survived ashore/);
});

test('briefing reports credit the crew who prepared it, including marginal hits', () => {
  let marginal = 0;
  for (let seed = 1; seed <= 100 && !marginal; seed++) {
    const s = fresh(seed); s.briefing = true; s.briefingSource = "Lt. Bell and Sgt. Turner's crew-led approach briefing";
    commit(s, s.plan);
    assert.match(s.active.report.notes.join(' '), /Bell and Sgt. Turner/);
    assert.doesNotMatch(s.active.report.notes.join(' '), /earlier strike photographs/);
    for (const r of s.active.report.results.filter(r => r.credits.includes('briefing'))) {
      marginal++; assert.match(r.details.join(' '), /Bell and Sgt. Turner/);
      assert.doesNotMatch(r.details.join(' '), /earlier strike photographs/);
    }
  }
  assert.ok(marginal);
});

test('v22 active saves archive exactly, preserve commitments and migrate only recorded history', () => {
  const source = fresh(65), a = source.aircraft[0];
  const t = thread(source, 'fault', a.id); recordThread(source, t, 'repaired', 'Finch closed this finding before the recorded operation.');
  commit(source, source.plan);
  const old = structuredClone(source); old.version = 22;
  for (const k of ['contentVersion','campaign','stories','duties','operations','briefingSource']) delete old[k];
  for (const c of old.crews) { delete c.specialistId; delete c.replacementId; }
  for (const t of old.threads) { delete t.status; delete t.milestones; delete t.participants; }
  const raw = JSON.stringify(old), data = new Map([[SAVE_KEY, raw]]);
  const storage = createStorage({ getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) });
  const { state: loaded, blocked } = storage.load(); assert.equal(blocked, false);
  for (const field of ['active','jobs','rng','nextId','reports','assignments','branches','nextMorningAt','completed']) assert.deepEqual(loaded[field], old[field], field);
  assert.equal(loaded.contentVersion, 0); assert.equal(loaded.campaign, null); assert.deepEqual(loaded.stories, []);
  assert.equal(loaded.threads[0].note, old.threads[0].note); assert.equal(loaded.threads[0].milestones.length, 1);
  assert.equal(loaded.threads[0].status, 'resolved');
  assert.ok([...data].some(([key,value]) => key !== SAVE_KEY && value === raw));
  assert.equal(data.get(SAVE_KEY), raw); storage.save(loaded);
  const rng = loaded.rng; finish(loaded);
  assert.equal(loaded.campaign, null); assert.deepEqual(loaded.stories, []);
  assert.equal(loaded.reports[0].results[0].outcome, old.active.report.results[0].outcome);
  // Any legacy thread selection remains at the same return transition; loading consumed no draws.
  assert.equal(decode(raw).rng, rng);
});

test('new content is rejected when a saved identity, fact, or duty is malformed', () => {
  for (const corrupt of [
    s => { s.campaign.intelligence[0].truth = 'reroll'; },
    s => { s.duties.push({ id: 'x', arcId: 'x', label: 'Invalid crew', crew: 'missing', through: 2 }); },
    s => { s.threads[0].milestones[0].text = 4; },
  ]) { const s = fresh(); thread(s, 'fault', 'a0'); corrupt(s); assert.throws(() => decode(JSON.stringify(s)), /content/); }
});

test('reserve support duties exclude automatic servicing, repairs and dispatch', () => {
  const s = fresh(), a = s.aircraft[0], c = s.crews[0];
  s.duties.push({ id: 'ferry', arcId: 'test', label: 'Ferry work', aircraft: a.id, crew: c.id, through: 1 });
  a.condition = 60; c.strain = 2;
  const p = proposePlan(s);
  assert.ok(!p.flights.some(f => f.aircraft === a.id || f.crew === c.id));
  assert.ok(!repairCandidates(s, p).some(x => x.id === a.id));
  commit(s, p);
  assert.ok(!s.jobs.some(j => j.subject === a.id && ['repair','service'].includes(j.kind)));
  finish(s); assert.equal(c.strain, 2);
});

test('earned workshop capacity stacks safely and an occupied bay is counted only once', () => {
  const s = fresh(); s.extraBay = 2; s.extraBaySources = ["West Fen's fitters", "Group's mobile workshop"];
  for (const a of s.aircraft) a.condition = 70;
  s.engineeringUsed = 1;
  s.jobs.push({ id: s.nextId++, kind: 'repair', at: s.now + 6 * HOUR, subject: 'a0' });
  const plan = { ...proposePlan(s), flights: [] };
  assert.equal(repairCandidates(s, plan).length, 2, 'three bays minus the one already occupied');
  assert.deepEqual(decode(JSON.stringify(s)).extraBaySources, s.extraBaySources);
  commit(s, plan, true);
  assert.match(s.active.report.notes.join(' '), /West Fen's fitters; Group's mobile workshop/);
  assert.equal(s.extraBay, 0); assert.equal(s.extraBaySources, undefined);
});

test('content-rich daily play equals acceleration with a reload after every dispatch', () => {
  for (const seed of [42, 400, 919, 1604, 73210]) {
    let daily = fresh(seed), quick = structuredClone(daily);
    for (let n = 0; n < 14; n++) {
      for (let count = 0; count < 2; count++) {
        const before = JSON.stringify(daily), events = stationEvents(daily);
        assert.equal(JSON.stringify(daily), before, 'opening a panel is read-only');
        assert.deepEqual(events, stationEvents(quick));
        const e = events[0]; if (!e) break;
        const choice = e.choices.find(c => !c.disabled);
        choose(daily,e.key,choice.id); choose(quick,e.key,choice.id);
      }
      const p = proposePlan(daily); commit(daily,p,!p.flights.length); commit(quick,p,!p.flights.length);
      const stop = daily.nextMorningAt;
      daily = decode(JSON.stringify(daily)); quick = decode(JSON.stringify(quick));
      advance(daily,stop); finish(quick);
      if (n < 13) prepareMorning(quick); else advance(quick,stop);
      assert.deepEqual(quick,daily,`seed ${seed} assignment ${n+1}`);
    }
  }
});
