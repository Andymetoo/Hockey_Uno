import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, commit, createCampaign, proposePlan } from '../game.ts';
import { decode } from '../persistence.ts';
import { autoTutorial, nextTutorial, tutorialSteps } from '../tutorial.ts';

const fresh = () => { const s = createCampaign(2026, 1_800_000_000_000); s.legacyTour = true; s.threads = []; return s; };
const finish = s => advance(s, s.active.returnsAt);
const standDowns = (s, count) => { for (let i = 0; i < count; i++) { commit(s, proposePlan(s), true); finish(s); } };

test('tutorial prompts follow mission stages and progress survives a saved tour', () => {
  const s = fresh();
  assert.equal(autoTutorial(s, 'today'), 'intro');
  assert.equal(autoTutorial(s, 'tour'), null);
  assert.equal(new Set(tutorialSteps.map(step => step.id)).size, tutorialSteps.length);
  s.tutorial.seen.push('intro', 'planning', 'dispatch');
  commit(s, s.plan);
  assert.equal(autoTutorial(s, 'today'), 'underway');
  s.tutorial.seen.push('underway'); finish(s);
  assert.equal(autoTutorial(s, 'today'), 'return');
  s.tutorial.seen.push('return');
  assert.equal(autoTutorial(decode(JSON.stringify(s)), 'today'), null);
  s.tutorial.disabled = true;
  assert.equal(autoTutorial(s, 'today'), null);
});

test('context prompts do not stack on one station decision', () => {
  const s = fresh();
  assert.equal(nextTutorial(s, 'decision', { eventKind: 'inspection' }), 'station');
  s.tutorial.seen.push('station'); s.tutorial.stationAt = s.completed;
  assert.equal(nextTutorial(s, 'decision', { eventKind: 'inspection' }), null);
  s.completed = 1;
  assert.equal(nextTutorial(s, 'decision', { eventKind: 'inspection' }), 'problem');
});

test('older tours gain tutorial defaults without rewriting committed results', () => {
  const s = fresh(); commit(s, s.plan); finish(s);
  const original = structuredClone(s.reports[0]);
  delete s.tutorial;
  delete s.reports[0].debrief;
  const loaded = decode(JSON.stringify(s));
  assert.equal(loaded.tutorial.disabled, false);
  assert.equal(autoTutorial(loaded, 'today'), null);
  assert.deepEqual(loaded.reports[0].results, original.results);
  assert.equal(loaded.reports[0].debrief, undefined);
});

test('return report states confirmed outcome, immediate needs, and the changed next brief', () => {
  const success = fresh(); standDowns(success, 5);
  commit(success, proposePlan(success));
  for (const result of success.active.report.results) { result.hit = true; result.outcome = 'home'; }
  success.active.report.hits = success.active.report.results.length;
  finish(success);
  assert.match(success.reports[5].debrief.assessment, /Rail traffic is disrupted/);
  assert.match(success.reports[5].debrief.next.join(' '), /short opening/);
  assert.equal(success.assignments[6].circumstance, 'window');
  assert.match(success.assignments[6].followup, /rail strike/);

  const failure = fresh(); standDowns(failure, 6);
  assert.equal(failure.assignments[6].circumstance, 'flak');
  assert.match(failure.reports[5].debrief.next.join(' '), /gun belt/);
  assert.match(failure.reports[5].debrief.assessment, /remains in service/);
  assert.deepEqual(decode(JSON.stringify(success)).assignments[6], success.assignments[6]);
});
