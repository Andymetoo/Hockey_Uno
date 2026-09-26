import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraftAvailable, crewAvailable, createCampaign, advance, commit, prepareMorning, proposePlan } from '../game.ts';
import { advanceStories, applyStoryChoice, storyDefinitions, storyDuty, storyEvents } from '../stories.ts';
import { advanceOldStories, applyOldStoryChoice, oldStoryEvents } from '../old-stories.ts';
import { snapshotThreads } from '../history.ts';

const START = 1_800_000_000_000;
const fresh = () => {
  const s = createCampaign(610, START);
  s.contentVersion = 0; s.stories = []; s.duties = []; s.threads = [];
  s.completed = 3; s.nextMorningAt = START;
  for (const c of s.crews) { c.fatigue = 0; c.strain = 0; c.leaveThrough = 0; }
  return s;
};
const report = s => ({ slot: s.completed, title: 'A recorded operation', summary: '', requested: 2, sent: 2, hits: 2, results: [], notes: [], at: s.now, stoodDown: false });
function arc(s, family, extra = {}) {
  const c = s.crews[0], junior = s.crews[1];
  const a = {
    id: `story-${family}`, family, title: storyDefinitions[family].title, status: 'active', stage: 'offered', opened: s.completed,
    dueSlot: s.completed, expiresSlot: s.completed + 2,
    participants: [
      { role: 'lead', kind: 'crew', id: c.id, name: c.pilot, specialistId: c.specialistId ?? `${c.id}-original`, specialistName: c.specialist },
      { role: 'junior', kind: 'crew', id: junior.id, name: junior.pilot, specialistId: junior.specialistId ?? `${junior.id}-original`, specialistName: junior.specialist },
      { role: 'aircraft', kind: 'aircraft', id: s.aircraft[4].id, name: s.aircraft[4].name },
    ], note: 'An undertaking recorded at the station.', milestones: [{ slot: s.completed, stage: 'offered', text: 'An undertaking recorded at the station.' }], ...extra,
  };
  s.stories.push(a); return a;
}
function choose(s, id) {
  const e = storyEvents(s).find(e => e.choices.some(c => c.id === id && !c.disabled));
  assert.ok(e, `offered ${id}`); applyStoryChoice(s, e, id);
}
function next(s, completed = s.completed + 1) { s.completed = completed; const r = report(s); advanceStories(s, r, () => { throw Error('Continuing arc must not draw randomness'); }); return r; }

test('confidence has a delayed review, real reserve costs, and durable resolution', () => {
  const s = fresh(), a = arc(s, 'confidence'), lead = s.crews[0], junior = s.crews[1];
  const oldExperience = junior.experience;
  choose(s, 'check');
  assert.ok(storyDuty(s, 'crew', lead.id));
  assert.equal(crewAvailable(s, lead), false);
  next(s, 4); assert.equal(a.stage, 'testing'); assert.equal(storyEvents(s).length, 0);
  next(s, 5); assert.equal(a.stage, 'review');
  choose(s, 'teach');
  assert.equal(a.status, 'resolved'); assert.equal(junior.experience, oldExperience + 1); assert.equal(junior.lesson, true);
  assert.equal(new Set(s.duties.map(d => d.id)).size, s.duties.length);
  assert.equal(crewAvailable(s, lead), false); assert.equal(crewAvailable(s, junior), false);
  const note = a.note, history = structuredClone(a.milestones);
  lead.lost = true; next(s, 6); next(s, 7);
  assert.equal(a.status, 'resolved'); assert.equal(a.note, note);
  assert.deepEqual(a.milestones.slice(0, history.length), history);
  assert.equal(a.milestones.filter(m => m.stage === `later-loss-${lead.id}`).length, 1);
});

test('crew-led confidence briefing identifies its author and trades against strain', () => {
  const s = fresh(), a = arc(s, 'confidence'), c = s.crews[0];
  choose(s, 'lead');
  assert.equal(s.briefing, true); assert.match(s.briefingSource, /Maddox.*crew-led/); assert.equal(c.strain, 1);
  next(s, 5); const oldExp = c.experience; choose(s, 'lead');
  assert.equal(a.status, 'resolved'); assert.equal(c.experience, oldExp + 1); assert.equal(c.strain, 2); assert.equal(c.lesson, true);
});

test('a promised workshop arrives exactly two assignments later and only once', () => {
  const s = fresh(), a = arc(s, 'neighbors'), oldSupport = s.support;
  choose(s, 'crates');
  assert.equal(s.support, oldSupport - 1); assert.equal(s.extraBay, 0);
  next(s, 4); assert.equal(s.extraBay, 0);
  next(s, 5); assert.equal(a.status, 'resolved'); assert.equal(s.extraBay, 1);
  next(s, 6); assert.equal(s.extraBay, 1);
});

test('a ferry promise reserves actual participants for one assignment and has two repayments', () => {
  for (const repayment of ['workshop', 'transport']) {
    const s = fresh(), a = arc(s, 'neighbors'), c = s.crews[0], airframe = s.aircraft[4];
    choose(s, 'promise'); assert.equal(crewAvailable(s, c), true); assert.equal(aircraftAvailable(s, airframe), true);
    next(s, 5); choose(s, 'send');
    assert.equal(crewAvailable(s, c), false); assert.equal(aircraftAvailable(s, airframe), false);
    if (repayment === 'transport') s.jobs.push({ id: 999, kind: 'recovery', at: START + 30 * 3_600_000, subject: s.aircraft[5].id, text: s.crews[5].id });
    next(s, 6); assert.equal(a.stage, 'favor');
    assert.equal(crewAvailable(s, c), true); assert.equal(aircraftAvailable(s, airframe), true);
    choose(s, repayment); assert.equal(a.status, 'resolved');
    if (repayment === 'workshop') assert.equal(s.extraBay, 1);
    else assert.equal(s.jobs.find(j => j.id === 999).at, START + 24 * 3_600_000);
  }
});

test('seeded intelligence survives panels and reload, and a mistaken estimate has real behavior', () => {
  for (const finding of ['guns', 'tracks']) {
    const s = fresh(), a = arc(s, 'interpretation', { finding, knowledge: 'estimated' });
    const snapshot = structuredClone(s); storyEvents(s); storyEvents(s); assert.deepEqual(s, snapshot);
    choose(s, 'file'); const reload = JSON.parse(JSON.stringify(s));
    next(s, 5); next(reload, 5); assert.deepEqual(reload, s);
    assert.equal(a.knowledge, 'confirmed');
    choose(s, 'group');
    assert.equal(s.suppression, finding === 'guns' ? .5 : 0);
    assert.equal(a.status, 'resolved');
    if (finding === 'tracks') assert.match(a.note, /No guns.*no operational benefit/);
  }
});

test('survey comparison buys confirmation with a real absence even when gun estimate was wrong', () => {
  const s = fresh(), a = arc(s, 'interpretation', { finding: 'tracks', knowledge: 'estimated' }), support = s.support;
  choose(s, 'compare');
  assert.equal(s.support, support - 1); assert.equal(crewAvailable(s, s.crews[0]), false); assert.equal(a.knowledge, 'estimated');
  next(s, 4); assert.equal(crewAvailable(s, s.crews[0]), true); assert.equal(a.knowledge, 'estimated');
  next(s, 5); choose(s, 'local');
  assert.equal(s.briefing, true); assert.match(s.briefingSource, /confirmed survey comparison/);
});

test('critical reviews defer through injury, temporary replacement and forward recovery', () => {
  const s = fresh(), a = arc(s, 'confidence'), c = s.crews[0], original = structuredClone(a.participants[0]);
  choose(s, 'check'); c.injury = true; c.replacement = 'Sgt. Walsh'; c.replacementId = 'p-walsh';
  next(s, 5); assert.equal(a.stage, 'review'); assert.equal(storyEvents(s).length, 0);
  next(s, 7); assert.equal(a.status, 'active');
  c.injury = false;
  s.jobs.push({ id: 999, kind: 'recovery', subject: 'a0', text: c.id, at: s.now + 3_600_000 });
  assert.equal(storyEvents(s).length, 0);
  s.jobs = s.jobs.filter(j => j.id !== 999); c.specialist = 'Sgt. Walsh'; c.specialistId = 'p-walsh'; c.replacement = null;
  assert.ok(storyEvents(s).length); assert.deepEqual(a.participants[0], original);
  choose(s, 'lead'); assert.equal(a.status, 'resolved');
});

test('a medically recovered original ashore is never reported aboard the lost flying crew', () => {
  const s = fresh(), a = arc(s, 'confidence'), c = s.crews[0], original = c.specialist;
  choose(s, 'lead');
  c.replacement = 'Sgt. Walsh'; c.replacementId = 'p-walsh'; c.injury = false; c.returned = true; c.lost = true;
  next(s, 4);
  assert.equal(a.status, 'closed'); assert.match(a.note, new RegExp(`${original} remained ashore and was not aboard`));
});

test('relief can transfer experience or preserve a rested veteran without inventing a new identity', () => {
  const instruct = fresh(), a = arc(instruct, 'relief'), c = instruct.crews[0], junior = instruct.crews[1], oldExp = junior.experience;
  choose(instruct, 'promise'); next(instruct, 5); choose(instruct, 'instruct');
  assert.equal(a.status, 'resolved'); assert.equal(crewAvailable(instruct, c), false); assert.equal(junior.experience, oldExp + 2);
  assert.equal(crewAvailable(instruct, junior), false); next(instruct, 6); assert.equal(crewAvailable(instruct, junior), true);
  const rest = fresh(), b = arc(rest, 'relief'); choose(rest, 'extend'); next(rest, 5); choose(rest, 'rest');
  assert.equal(rest.crews[0].leaveThrough, 6); assert.equal(b.stage, 'resting');
  commit(rest, proposePlan(rest), true); advance(rest, rest.active.returnsAt);
  assert.equal(rest.crews[0].fatigue, 0); assert.equal(rest.crews[0].strain, 0); assert.equal(b.status, 'resolved');
});

test('opening expiry and impossible ferry have explicit staff resolutions; earned work never silently expires', () => {
  const opening = fresh(), a = arc(opening, 'neighbors'); next(opening, 5);
  assert.equal(a.status, 'closed'); assert.match(a.note, /Group transport/);
  const ferry = fresh(), b = arc(ferry, 'neighbors'); choose(ferry, 'promise'); next(ferry, 5);
  ferry.aircraft[4].lost = true; next(ferry, 6);
  assert.equal(storyEvents(ferry)[0].choices.find(c => c.id === 'send').disabled, true);
  next(ferry, 7); assert.equal(b.status, 'closed'); assert.match(b.note, /could wait no longer/);
  const critical = fresh(), c = arc(critical, 'interpretation', { finding: 'guns', knowledge: 'estimated' });
  choose(critical, 'file'); critical.crews[0].injury = true; next(critical, 5); next(critical, 8);
  assert.equal(c.status, 'active'); assert.equal(c.stage, 'findings');
});

test('selection persists one seeded opportunity, honors quiet days, exclusions and active cap', () => {
  const s = fresh(); s.contentVersion = 1; s.completed = 5;
  s.crews[0].sorties = 4;
  s.reports = [1, 2].map(slot => ({ ...report(s), slot, results: [{ crew: 'c0', aircraft: 'a0', hit: true, outcome: 'home' }] }));
  let draws = 0;
  advanceStories(s, report(s), () => { draws++; return 0; });
  assert.equal(s.stories.length, 1); assert.equal(s.stories[0].family, 'confidence'); assert.equal(draws, 2);
  const before = structuredClone(s); storyEvents(s); assert.deepEqual(s, before);
  s.completed = 6; advanceStories(s, report(s), () => { throw Error('Start cooldown must not draw'); });
  const quiet = fresh(); quiet.contentVersion = 1; quiet.completed = 5;
  advanceStories(quiet, report(quiet), () => 1); assert.equal(quiet.stories.length, 0);
  const full = fresh(); full.contentVersion = 1; full.completed = 7;
  arc(full, 'confidence', { opened: 2, stage: 'testing', dueSlot: 10 });
  arc(full, 'neighbors', { opened: 2, stage: 'promised', dueSlot: 10 });
  arc(full, 'interpretation', { opened: 2, stage: 'checking', dueSlot: 10 });
  advanceStories(full, report(full), () => { throw Error('Active cap must not draw'); });
  assert.equal(full.stories.length, 3);
});

test('actual dispatch excludes support-duty reserves and report/morning acceleration remains equivalent', () => {
  const s = fresh(); arc(s, 'neighbors'); choose(s, 'promise'); next(s, 5); choose(s, 'send');
  const planned = proposePlan(s);
  assert.ok(planned.flights.every(f => f.crew !== 'c0' && f.aircraft !== 'a4'));
  const elapsed = structuredClone(s), accelerated = structuredClone(s);
  commit(elapsed, proposePlan(elapsed), true); commit(accelerated, proposePlan(accelerated), true);
  advance(elapsed, elapsed.nextMorningAt);
  advance(accelerated, accelerated.active.returnsAt); prepareMorning(accelerated);
  assert.deepEqual(accelerated, elapsed);
});

test('a carried fault can end in a real strip repair or a useful retirement without adding a loss', () => {
  for (const choiceId of ['repair', 'parts']) {
    const s = fresh(); s.contentVersion = 1; s.support = 1;
    const a = s.aircraft[0]; a.defect = true; a.defectType = 'controls';
    s.threads.push({ family: 'fault', subject: a.id, stage: 'carry', dueSlot: 1, note: 'The control finding was carried.', status: 'active', milestones: [{ slot: 1, stage: 'carry', text: 'The control finding was carried.' }] });
    snapshotThreads(s);
    const e = oldStoryEvents(s)[0]; assert.ok(e);
    applyOldStoryChoice(s, e, choiceId);
    assert.equal(aircraftAvailable(s, a), false);
    if (choiceId === 'repair') {
      assert.equal(s.support, 1); assert.equal(s.engineeringUsed, 1);
      advance(s, s.now + 6 * 3_600_000);
      assert.equal(a.defect, false); assert.equal(a.certified, 2); assert.equal(s.threads[0].status, 'resolved');
    } else {
      assert.equal(s.support, 3); assert.equal(a.lost, false); assert.equal(s.threads[0].stage, 'retired');
      assert.equal(s.threads[0].status, 'resolved');
      s.completed = 13; assert.equal(aircraftAvailable(s, a), false);
    }
  }
});

test('ferry notes preserve their real crew and deliver recovery help once two assignments later', () => {
  const s = fresh(); s.contentVersion = 1; s.support = 1;
  const a = s.aircraft[0], c = s.crews[2]; a.recovered = true;
  s.threads.push({ family: 'diversion', subject: a.id, stage: 'home', dueSlot: 3, note: `${a.name} returned with ${c.pilot}.`, status: 'active', participants: [{ role: 'aircraft', kind: 'aircraft', id: a.id, name: a.name }, { role: 'recovering crew', kind: 'crew', id: c.id, name: c.pilot }] });
  snapshotThreads(s); const t = s.threads[0];
  const e = oldStoryEvents(s)[0]; assert.match(e.body, /Rivera/);
  applyOldStoryChoice(s, e, 'notes'); assert.equal(crewAvailable(s, c), false);
  s.completed = 4; advanceOldStories(s, report(s)); assert.equal(s.support, 1);
  s.completed = 5; advanceOldStories(s, report(s)); assert.equal(s.support, 2); assert.equal(t.status, 'resolved');
  advanceOldStories(s, report(s)); assert.equal(s.support, 2);
  assert.match(t.note, /returning crew's written account/);
});

test('ferry record release and paperwork already written handle an absent or later lost participant', () => {
  const s = fresh(); s.contentVersion = 1; const a = s.aircraft[0], c = s.crews[2];
  s.threads.push({ family: 'diversion', subject: a.id, stage: 'home', dueSlot: 3, note: 'The ferry is back.', status: 'active', participants: [{ role: 'aircraft', kind: 'aircraft', id: a.id, name: a.name }, { role: 'recovering crew', kind: 'crew', id: c.id, name: c.pilot }] });
  snapshotThreads(s); c.injury = true;
  const e = oldStoryEvents(s)[0]; assert.equal(e.choices.find(c => c.id === 'notes').disabled, true);
  c.injury = false; applyOldStoryChoice(s, e, 'notes');
  const t = s.threads[0]; a.lost = true; t.status = 'closed'; t.stage = 'lost'; t.note = 'Lost after returning; the completed ferry remains in the log.';
  const saved = t.note; s.support = 1; s.completed = 5;
  advanceOldStories(s, report(s));
  assert.equal(s.support, 2); assert.equal(t.note, saved); assert.equal(t.status, 'closed');
  assert.ok(t.milestones.some(m => m.stage === 'recovery-credit'));
});

test('the final station visit cannot promise a ferry credit beyond the fourteen assignments', () => {
  const s = fresh(); s.contentVersion = 1; s.completed = 13;
  s.threads.push({ family: 'diversion', subject: 'a0', stage: 'home', dueSlot: 13, note: 'The ferry is back.', status: 'active', participants: [{ role: 'aircraft', kind: 'aircraft', id: 'a0', name: s.aircraft[0].name }, { role: 'recovering crew', kind: 'crew', id: 'c2', name: s.crews[2].pilot }] });
  snapshotThreads(s);
  const e = oldStoryEvents(s)[0]; assert.equal(e.choices.find(c => c.id === 'notes').disabled, true);
  assert.throws(() => applyOldStoryChoice(s, e, 'notes'));
  applyOldStoryChoice(s, e, 'release'); assert.equal(s.threads[0].status, 'resolved');
});

test('accepting reserve duties removes their selected flights immediately', () => {
  const s = fresh(); arc(s, 'neighbors');
  s.plan.flights = [{ crew: 'c0', aircraft: 'a1' }, { crew: 'c1', aircraft: 'a4' }, { crew: 'c2', aircraft: 'a2' }];
  choose(s, 'promise'); next(s, 5); choose(s, 'send');
  assert.deepEqual(s.plan.flights, [{ crew: 'c2', aircraft: 'a2' }]);
  const training = fresh(); arc(training, 'confidence');
  training.plan.flights = [{ crew: 'c0', aircraft: 'a0' }, { crew: 'c1', aircraft: 'a1' }];
  choose(training, 'check'); assert.deepEqual(training.plan.flights, [{ crew: 'c1', aircraft: 'a1' }]);
  const log = fresh(); log.contentVersion = 1;
  log.threads.push({ family: 'diversion', subject: 'a0', stage: 'home', dueSlot: 3, note: 'Returned.', status: 'active', participants: [{ role: 'aircraft', kind: 'aircraft', id: 'a0', name: log.aircraft[0].name }, { role: 'recovering crew', kind: 'crew', id: 'c2', name: log.crews[2].pilot }] });
  log.plan.flights = [{ crew: 'c2', aircraft: 'a2' }]; snapshotThreads(log);
  applyOldStoryChoice(log, oldStoryEvents(log)[0], 'notes'); assert.deepEqual(log.plan.flights, []);
});

test('existing briefing prevents a second briefing charge without blocking other resolutions', () => {
  const s = fresh(); arc(s, 'confidence'); s.briefing = true; s.briefingSource = 'Existing photographs';
  const opening = storyEvents(s)[0]; assert.equal(opening.choices.find(c => c.id === 'lead').disabled, true);
  assert.throws(() => applyStoryChoice(s, opening, 'lead'));
  assert.equal(s.crews[0].strain, 0); assert.equal(s.briefingSource, 'Existing photographs');
  choose(s, 'check');
  const finding = fresh(); arc(finding, 'interpretation', { stage: 'findings', finding: 'guns', knowledge: 'confirmed', choice: 'compare' }); finding.briefing = true;
  const e = storyEvents(finding)[0]; assert.equal(e.choices.find(c => c.id === 'local').disabled, true);
  assert.throws(() => applyStoryChoice(finding, e, 'local'));
  choose(finding, 'group'); assert.equal(finding.suppression, .5);
});

test('sent instruments earn the delayed workshop even if the named crew is later lost', () => {
  const s = fresh(), a = arc(s, 'neighbors'); choose(s, 'crates');
  s.crews[0].lost = true; next(s, 4); assert.equal(a.status, 'active'); assert.equal(s.extraBay, 0);
  next(s, 5); assert.equal(a.status, 'resolved'); assert.equal(s.extraBay, 1);
  assert.deepEqual(s.extraBaySources, ["West Fen's fitters, sent in return for the spare instruments"]);
  next(s, 6); assert.equal(s.extraBay, 1);
});

test('a completed ferry favor can be claimed by staff after its crew is injured or lost', () => {
  for (const unavailable of ['injured', 'lost']) {
    const s = fresh(), a = arc(s, 'neighbors'); choose(s, 'promise'); next(s, 5); choose(s, 'send'); next(s, 6);
    if (unavailable === 'lost') s.crews[0].lost = true;
    else s.crews[0].injury = true;
    next(s, 7); assert.equal(a.stage, 'favor'); assert.equal(a.status, 'active');
    choose(s, 'workshop'); assert.equal(s.extraBay, 1); assert.equal(a.status, 'resolved');
    assert.deepEqual(s.extraBaySources, ["West Fen's workshop lorry, earned by the completed ferry"]);
  }
});

test('recovery transport never postpones an already imminent recovery', () => {
  const s = fresh(); arc(s, 'neighbors', { stage: 'favor' });
  const imminent = s.now + 30 * 60_000;
  s.jobs.push({ id: 999, kind: 'recovery', subject: 'a3', text: 'c3', at: imminent });
  choose(s, 'transport'); assert.equal(s.jobs.find(j => j.id === 999).at, imminent);
  const log = fresh(); log.support = 1;
  log.threads.push({ family: 'diversion', subject: 'a0', stage: 'logbook', dueSlot: 3, note: 'Written.', status: 'active', milestones: [{ slot: 1, stage: 'logbook', text: 'Written.' }] });
  snapshotThreads(log); log.jobs.push({ id: 999, kind: 'recovery', subject: 'a3', text: 'c3', at: imminent });
  advanceOldStories(log, report(log)); assert.equal(log.jobs.find(j => j.id === 999).at, imminent);
});
