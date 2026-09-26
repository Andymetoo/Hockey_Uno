import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaign } from '../game.ts';
import {
  operationalDefinitions, operationalCandidates, operationalEvent, selectOperationalEvent,
  resolveOperationalEvent, expireOperationalEvent,
} from '../operations.ts';

function station() {
  const s = createCampaign(518, Date.UTC(2026, 0, 1, 8));
  s.contentVersion = 1; s.completed = 5; s.jobs = []; s.duties = []; s.support = 3;
  s.operations = { checkedSlot: -1, lastSelected: -3, selected: null, history: [], consequences: [] };
  s.briefing = false; s.engineeringUsed = 0;
  s.crews.forEach(c => { c.fatigue = 0; c.injury = false; c.leaveThrough = 0; c.lost = false; });
  s.aircraft.forEach(a => { a.condition = 85; a.defect = false; a.lost = false; a.away = false; });
  return s;
}
function present(s, id, participants = {}) {
  s.operations.selected = { id, slot: s.completed, ...participants };
  return operationalEvent(s);
}
function choose(s, id, choice, participants = {}) {
  const e = present(s, id, participants);
  assert.equal(resolveOperationalEvent(s, e.key, choice), true);
}
function returned(s) {
  s.completed++;
  s.reports.push({ slot: s.completed, results: [], notes: [], title: 'Test report' });
  selectOperationalEvent(s, () => 0);
}

test('twelve operational definitions have distinct IDs, two finished choices, and explicit staff defaults', () => {
  const s = station();
  assert.equal(operationalDefinitions.length, 12);
  assert.equal(new Set(operationalDefinitions.map(d => d.id)).size, 12);
  for (const d of operationalDefinitions) {
    const e = present(s, d.id, { crew: 'c0', pilot: 'Capt. Maddox', otherCrew: 'c1', otherPilot: 'Lt. Bell', aircraft: 'a0', aircraftName: 'Lucky Lady' });
    assert.equal(e.choices.length, 2);
    assert.ok(e.body.length > 80);
    assert.ok(e.choices.every(c => c.detail.length > 35));
    assert.ok(d.defaultText.length > 30);
  }
});

test('operational offers are persisted; panels and reload never draw again; quiet selection persists too', () => {
  const s = station(); let draws = 0;
  const draw = () => { draws++; return .8; };
  selectOperationalEvent(s, draw);
  const selected = structuredClone(s.operations.selected);
  const saved = JSON.stringify(s);
  for (let i = 0; i < 8; i++) operationalEvent(s);
  assert.equal(JSON.stringify(s), saved);
  const loaded = JSON.parse(saved);
  selectOperationalEvent(loaded, draw);
  assert.deepEqual(loaded.operations.selected, selected);
  assert.equal(draws, 2);
  const quiet = station();
  selectOperationalEvent(quiet, () => 0);
  selectOperationalEvent(quiet, () => { throw new Error('quiet panel rerolled'); });
  assert.equal(quiet.operations.selected, null);
});

test('prerequisites protect opening, legacy saves, cooldown, repeat families, and fixed mission slots', () => {
  const s = station(); s.completed = 1;
  assert.deepEqual(operationalCandidates(s), []);
  s.completed = 5; s.contentVersion = 0;
  assert.deepEqual(operationalCandidates(s), []);
  s.contentVersion = 1; s.operations.lastSelected = 4;
  selectOperationalEvent(s, () => { throw new Error('cooldown drew randomness'); });
  assert.equal(s.operations.selected, null);
  s.operations.history.push({ id: 'formation-lead', slot: 3, status: 'resolved', text: 'Done.' });
  assert.ok(!operationalCandidates(s).some(o => o.id === 'formation-lead'));
  s.completed = 11;
  selectOperationalEvent(s, () => { throw new Error('fixed mission drew randomness'); });
});

test('an absent named participant disables their offered duty without substituting another crew', () => {
  const s = station(); const c = s.crews[0];
  present(s, 'stores-ferry', { crew: c.id, pilot: c.pilot, aircraft: 'a0', aircraftName: 'Lucky Lady' });
  c.injury = true;
  const e = operationalEvent(s);
  assert.match(e.body, /Capt\. Maddox/);
  assert.equal(e.choices[0].disabled, true);
  assert.throws(() => resolveOperationalEvent(s, e.key, 'ferry'), /no longer available/);
  assert.equal(resolveOperationalEvent(s, e.key, 'reserve'), true);
});

test('unanswered offers expire with a staff default and no hidden cost', () => {
  const s = station(); const before = { support: s.support, suppression: s.suppression, duties: [...s.duties] };
  present(s, 'recovery-section');
  expireOperationalEvent(s); expireOperationalEvent(s);
  assert.equal(s.operations.history.length, 1);
  assert.equal(s.operations.history[0].status, 'expired');
  assert.match(s.notices.at(-1), /ordinary recovery times/);
  assert.deepEqual({ support: s.support, suppression: s.suppression, duties: s.duties }, before);
});

test('lower run and railway alternate change the specified mission mechanics', () => {
  const s = station(); const task = s.assignments[s.completed];
  task.weather = 'cloud'; task.hazard = 3;
  choose(s, 'cloud-floor', 'lower');
  assert.equal(task.weather, 'clear'); assert.equal(task.hazard, 3.75);
  const alternate = station(); const other = alternate.assignments[alternate.completed];
  other.requested = 3; other.effect = 'supplies'; other.hazard = 3;
  choose(alternate, 'rail-alternate', 'rail');
  assert.equal(other.requested, 2); assert.equal(other.effect, 'rail'); assert.equal(other.hazard, 2.5);
});

test('formation and armourer briefing credits retain the actual source and their visible costs', () => {
  const s = station();
  choose(s, 'formation-lead', 'lead', { crew: 'c0', pilot: s.crews[0].pilot });
  assert.equal(s.crews[0].fatigue, 18); assert.equal(s.briefing, true);
  assert.match(s.briefingSource, /Maddox/); assert.doesNotMatch(s.briefingSource, /photograph/);
  const armourer = station();
  choose(armourer, 'fuse-setting', 'prepare');
  assert.equal(armourer.engineeringUsed, 1); assert.equal(armourer.briefing, true);
  assert.match(armourer.briefingSource, /armourers/);
});

test('incompatible operational work cannot be presented on the same assignment', () => {
  const s = station();
  choose(s, 'formation-lead', 'lead', { crew: 'c0', pilot: s.crews[0].pilot });
  assert.equal(present(s, 'fuse-setting'), null);
  assert.equal(present(s, 'cloud-floor'), null);
});

test('fuel plan removes only the additional fuel circumstance and spends one support', () => {
  const s = station(); s.assignments[s.completed].circumstance = 'fuel';
  choose(s, 'fuel-drums', 'send');
  assert.equal(s.support, 2); assert.equal(s.assignments[s.completed].circumstance, 'ordinary');
});

test('freight duty locks actual reserve IDs for one assignment and pays once at its report', () => {
  const s = station();
  s.plan.flights = [{ aircraft: 'a0', crew: 'c0' }, { aircraft: 'a1', crew: 'c1' }];
  choose(s, 'stores-ferry', 'ferry', { crew: 'c0', pilot: s.crews[0].pilot, aircraft: 'a0', aircraftName: s.aircraft[0].name });
  assert.deepEqual(s.plan.flights, [{ aircraft: 'a1', crew: 'c1' }]);
  assert.equal(s.duties[0].crew, 'c0'); assert.equal(s.duties[0].aircraft, 'a0'); assert.equal(s.duties[0].through, 6);
  assert.equal(s.support, 3); assert.equal(s.crews[0].fatigue, 12);
  const loaded = JSON.parse(JSON.stringify(s));
  returned(s); returned(loaded);
  assert.equal(s.support, 4); assert.deepEqual(s, loaded);
  selectOperationalEvent(s, () => 0); assert.equal(s.support, 4);
});

test('radio, workshop, and patrol trades incur their advertised different costs', () => {
  const radio = station(); choose(radio, 'radio-watch', 'watch', { crew: 'c0', pilot: radio.crews[0].pilot });
  assert.equal(radio.suppression, .5); assert.equal(radio.duties.length, 1); assert.equal(radio.crews[0].fatigue, 12);
  const shop = station(); choose(shop, 'workshop-exchange', 'motors');
  assert.equal(shop.engineeringUsed, 1); assert.equal(shop.support, 3); returned(shop); assert.equal(shop.support, 4);
  const patrol = station(); patrol.suppression = 1.5; choose(patrol, 'gun-map', 'share');
  assert.equal(patrol.suppression, .75); assert.equal(patrol.support, 3); returned(patrol); assert.equal(patrol.support, 4);
});

test('escort reservation changes an assignment two slots later exactly once', () => {
  const s = station(); s.assignments[5].circumstance = 'escort'; s.assignments[7].circumstance = 'flak';
  choose(s, 'escort-debt', 'later');
  assert.equal(s.assignments[5].circumstance, 'ordinary');
  returned(s); assert.equal(s.assignments[7].circumstance, 'flak');
  returned(s); assert.equal(s.assignments[7].circumstance, 'escort');
  assert.equal(s.operations.consequences.length, 0);
  const notices = s.notices.length; selectOperationalEvent(s, () => 0); assert.equal(s.notices.length, notices);
});

test('ground instruction holds both people and credits the named novice at completion', () => {
  const s = station(); const experience = s.crews[1].experience;
  choose(s, 'instructor-detail', 'instruct', { crew: 'c1', pilot: s.crews[1].pilot, otherCrew: 'c0', otherPilot: s.crews[0].pilot });
  assert.deepEqual(s.duties.map(d => d.crew), ['c1', 'c0']);
  assert.equal(new Set(s.duties.map(d => d.id)).size, s.duties.length);
  returned(s); assert.equal(s.crews[1].experience, experience + 1); assert.equal(s.crews[1].lesson, true);
  assert.match(s.reports.at(-1).notes.at(-1), /Maddox.*Bell/);
});

test('forward recovery section advances every diversion from that assignment, no unrelated work', () => {
  const s = station(); const hour = 3_600_000;
  choose(s, 'recovery-section', 'forward'); assert.equal(s.support, 2);
  s.completed++;
  s.jobs = [
    { id: 100, kind: 'recovery', subject: 'a0', text: 'c0', at: s.now + 30 * hour },
    { id: 101, kind: 'recovery', subject: 'a1', text: 'c1', at: s.now + 30 * hour },
    { id: 102, kind: 'recovery', subject: 'a2', text: 'c2', at: s.now + 30 * hour },
  ];
  s.reports.push({ slot: s.completed, results: [{ aircraft: 'a0', outcome: 'divert' }, { aircraft: 'a1', outcome: 'divert' }], notes: [] });
  selectOperationalEvent(s, () => 0);
  assert.deepEqual(s.jobs.map(j => j.at - s.now), [6 * hour, 6 * hour, 30 * hour]);
  selectOperationalEvent(s, () => 0);
  assert.equal(s.jobs[0].at - s.now, 6 * hour);
  assert.match(s.reports.at(-1).notes.at(-1), /2 diverted aircraft/);
});

test('forward recovery section never postpones a recovery already less than one hour away', () => {
  const s = station(); const hour = 3_600_000;
  choose(s, 'recovery-section', 'forward');
  s.completed++;
  s.jobs = [{ id: 100, kind: 'recovery', subject: 'a0', text: 'c0', at: s.now + hour / 2 }];
  s.reports.push({ slot: s.completed, results: [{ aircraft: 'a0', outcome: 'divert' }], notes: [] });
  selectOperationalEvent(s, () => 0);
  assert.equal(s.jobs[0].at, s.now + hour / 2);
});
