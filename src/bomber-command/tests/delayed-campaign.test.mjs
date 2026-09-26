import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignChoiceDetail, campaignObjective, campaignToday, createCampaignState, finishCampaignOperation, recordCampaignChoice } from '../campaign.ts';

const fresh = (seed = 42) => ({
  contentVersion: 1, campaign: createCampaignState(seed), seed, rng: 119003, completed: 0, now: 1_800_000_000_000,
  assignments: Array.from({ length: 14 }, (_, i) => ({ title: `Objective ${i + 1}`, objective: 'Block supplies.', why: 'Group requests a strike.', requested: 3, hazard: 4, weather: 'cloud', circumstance: 'ordinary', effect: 'supplies' })),
  branches: [], jobs: [], aircraft: [{ id: 'a0', name: 'Lucky Lady' }], crews: [{ id: 'c0', pilot: 'Capt. Maddox' }],
});
const report = (slot, hits = 3) => ({ slot, hits, requested: 3, stoodDown: false, notes: [], results: [] });
const decide = (s, slot, choice) => { s.branches.push({ slot, choice, promise: '', fulfilled: null }); recordCampaignChoice(s, slot, choice); };
const returned = (s, slot, hits = 3) => { s.completed = slot; const r = report(slot, hits); finishCampaignOperation(s, r); return r; };

test('the engine works cause two delayed changes, once each, after a real result', () => {
  const s = fresh(); decide(s, 2, 'main'); const c = s.campaign.commitments[0];
  assert.equal(c.state, 'pending');
  returned(s, 3); assert.equal(c.state, 'pending');
  returned(s, 4); assert.equal(c.state, 'ready');
  returned(s, 5); assert.equal(s.assignments[6].hazard, 4);
  const sixth = returned(s, 6); assert.equal(s.assignments[6].hazard, 3); assert.equal(c.state, 'active');
  const unchanged = structuredClone(s); finishCampaignOperation(s, sixth); assert.deepEqual(s, unchanged);
  returned(s, 7); assert.equal(s.assignments[7].hazard, 3); assert.equal(c.state, 'fulfilled');
  assert.deepEqual(c.effectsApplied, [6, 7]);
  assert.match(c.milestones.map(m => m.text).join(' '), /reason for accepting the heavier raid/);
  assert.equal(s.rng, 119003);
});

test('failed objectives close commitments without manufacturing future help', () => {
  for (const [slot, choice] of [[2, 'mobile'], [2, 'main'], [2, 'escort'], [6, 'relief'], [6, 'main'], [9, 'junction']]) {
    const s = fresh(); decide(s, slot, choice); returned(s, slot + 2, 0);
    const c = s.campaign.commitments[0]; assert.equal(c.state, 'missed');
    const future = structuredClone(s.assignments);
    for (let n = slot + 3; n <= 14; n++) returned(s, n);
    assert.deepEqual(s.assignments, future); assert.equal(c.milestones.length, 2);
  }
});

test('the inland works earn a strategic alternative to the easier crossing', () => {
  const s = fresh(); decide(s, 6, 'main'); returned(s, 8); returned(s, 9);
  assert.equal(s.assignments[10].hazard, 4);
  returned(s, 10); assert.equal(s.assignments[10].hazard, 3);
  returned(s, 11); assert.equal(s.assignments[12].requested, 3);
  returned(s, 12); assert.equal(s.assignments[12].requested, 2); assert.equal(s.assignments[12].hazard, 3);
  assert.equal(s.campaign.commitments[0].state, 'fulfilled');
  assert.match(s.assignments[12].followup, /component works never made good/);
});

test('the crossing promise respects its opening, closes after one actual recovery, and keeps participant names', () => {
  const s = fresh(); decide(s, 6, 'relief'); returned(s, 8);
  s.jobs = [{ id: 1, kind: 'recovery', subject: 'a0', text: 'c0', at: s.now + 30 * 3_600_000 }];
  const early = report(9); early.results = [{ outcome: 'divert', aircraft: 'a0', crew: 'c0' }]; s.completed = 9;
  finishCampaignOperation(s, early); assert.equal(s.jobs[0].at, s.now + 30 * 3_600_000);
  assert.match(campaignToday(s).join(' '), /through assignment 13/);
  const right = report(10); right.results = early.results; s.completed = 10; finishCampaignOperation(s, right);
  assert.equal(s.jobs[0].at, s.now + 18 * 3_600_000);
  assert.match(right.notes.join(' '), /Capt. Maddox.*Lucky Lady/);
  finishCampaignOperation(s, right); assert.equal(s.jobs[0].at, s.now + 18 * 3_600_000);
  assert.equal(s.campaign.commitments[0].state, 'fulfilled');
  const unused = fresh(); decide(unused, 6, 'relief'); returned(unused, 8); returned(unused, 9); returned(unused, 13);
  assert.equal(unused.campaign.commitments[0].state, 'expired');
  assert.match(unused.campaign.commitments[0].milestones.at(-1).text, /relief raid remains recorded as completed/);
  const imminent = fresh(); decide(imminent, 6, 'relief'); returned(imminent, 8); returned(imminent, 9);
  imminent.jobs = [{ id: 1, kind: 'recovery', subject: 'a0', text: 'c0', at: imminent.now + 1_800_000 }];
  const imminentReport = report(10); imminentReport.results = early.results; imminent.completed = 10;
  finishCampaignOperation(imminent, imminentReport);
  assert.equal(imminent.jobs[0].at, imminent.now + 1_800_000, 'an existing earlier recovery must never be delayed');
  assert.match(imminentReport.notes.join(' '), /already imminent/);
});

test('the third branch changes the final deep operation two assignments later', () => {
  const s = fresh(); decide(s, 9, 'junction'); returned(s, 11);
  assert.equal(s.assignments[12].circumstance, 'ordinary');
  returned(s, 12); assert.equal(s.assignments[12].circumstance, 'escort'); assert.equal(s.assignments[12].hazard, 3);
  const s2 = structuredClone(s); returned(s2, 13); assert.deepEqual(s2.assignments, s.assignments);
});

test('stores intelligence is estimated, persisted, discoverable, and changes the actual outcome', () => {
  const seeds = new Map();
  for (let seed = 1; seed < 10000 && seeds.size < 2; seed++) seeds.set(createCampaignState(seed).intelligence[0].truth, seed);
  assert.equal(seeds.size, 2);
  for (const [truth, seed] of seeds) {
    const original = fresh(seed); decide(original, 9, 'main');
    assert.equal(original.campaign.intelligence[0].knowledge, 'estimated');
    const loaded = JSON.parse(JSON.stringify(original));
    for (let n = 0; n < 20; n++) { campaignToday(loaded); campaignChoiceDetail(9, 'main'); }
    assert.deepEqual(loaded, original);
    const r = report(11); const outcome = campaignObjective(loaded, r);
    assert.equal(outcome.effective, truth === 'occupied'); assert.equal(r.hits, 3);
    returned(loaded, 11); assert.equal(loaded.campaign.intelligence[0].knowledge, 'confirmed');
    returned(loaded, 12); assert.equal(loaded.assignments[12].requested, truth === 'occupied' ? 2 : 3);
    if (truth === 'empty') assert.match(outcome.assessment, /emptied before the raid/);
    assert.equal(loaded.rng, original.rng);
    const verified = fresh(seed); decide(verified, 9, 'verify');
    assert.equal(verified.campaign.intelligence[0].knowledge, 'confirmed');
    assert.equal(verified.assignments[10].effect, truth === 'occupied' ? 'supplies' : 'rail');
    assert.equal(campaignObjective(verified, r).effective, true);
    assert.match(verified.assignments[10].why, /Confirmed reconnaissance/);
    assert.doesNotMatch(verified.assignments[10].followup, /reconnaissance confirmed the junction/);
  }
});

test('route reconnaissance discovers clear and defended routes without rerolling', () => {
  const encountered = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const s = fresh(seed); const before = JSON.stringify(s.campaign.intelligence); decide(s, 6, 'recon');
    const finding = s.campaign.intelligence.find(i => i.id === 'inland-route'); encountered.add(finding.truth);
    assert.equal(finding.knowledge, 'confirmed');
    assert.equal(s.assignments[7].circumstance, finding.truth === 'clear' ? 'window' : 'flak');
    assert.equal(s.assignments[7].hazard, finding.truth === 'clear' ? 2 : 3);
    assert.notEqual(JSON.stringify(s.campaign.intelligence), before);
    const settled = structuredClone(s); recordCampaignChoice(s, 6, 'recon'); assert.deepEqual(s, settled);
  }
  assert.equal(encountered.size, 2);
});

test('stores retain a distinct final-coast consequence when inland components already reduced the deep raid', () => {
  const s = fresh(); s.campaign.intelligence[0].truth = 'occupied';
  decide(s, 6, 'main'); returned(s, 8); decide(s, 9, 'main'); returned(s, 10); returned(s, 11); returned(s, 12);
  assert.equal(s.assignments[12].requested, 2);
  assert.equal(s.campaign.commitments.find(c => c.kind === 'stores-shortage').state, 'active');
  const priorHazard = s.assignments[13].hazard;
  returned(s, 13);
  assert.equal(s.assignments[13].hazard, priorHazard - 1);
  assert.equal(s.assignments[13].weather, 'clear'); assert.equal(s.assignments[13].circumstance, 'window');
  assert.equal(s.campaign.commitments.find(c => c.kind === 'stores-shortage').state, 'fulfilled');
  const settled = structuredClone(s); returned(s, 13); assert.deepEqual(s, settled);
});

test('continuing tours gain no invented commitments or facts', () => {
  const s = fresh(); s.contentVersion = 0; s.campaign = null;
  const before = structuredClone(s);
  recordCampaignChoice(s, 2, 'main'); finishCampaignOperation(s, report(4));
  assert.deepEqual(s, before); assert.deepEqual(campaignToday(s), []);
});

test('all nine choices describe their later assignment, cost, and distinct tradeoff', () => {
  for (const [slot, choices] of [[2, ['mobile', 'main', 'escort']], [6, ['relief', 'main', 'recon']], [9, ['junction', 'main', 'verify']]]) {
    for (const choice of choices) {
      const text = campaignChoiceDetail(slot, choice);
      assert.ok(text?.length > 100); assert.match(text, /Next:/); assert.doesNotMatch(text, /undefined|placeholder|TODO/);
    }
  }
});

test('the integrated branch survives a committed reload and changes the real future forecast', async () => {
  const { advance, applyBranch, commit, createCampaign, forecast, prepareMorning, proposePlan } = await import('../game.ts');
  const { decode } = await import('../persistence.ts');
  const s = createCampaign(2654435761, 1_800_000_000_000);
  const standDown = () => { prepareMorning(s); commit(s, proposePlan(s), true); advance(s, s.active.returnsAt); };
  standDown(); standDown(); prepareMorning(s);
  applyBranch(s, 'main'); standDown(); prepareMorning(s);
  const before = s.assignments[6].hazard;
  commit(s, proposePlan(s));
  // Deterministic fixture: the already committed target result meets the stated prerequisite.
  for (const r of s.active.report.results) { r.hit = true; r.outcome = 'home'; r.injury = false; r.damage = 0; r.newDefect = null; }
  s.active.report.hits = s.active.report.results.length;
  const reloaded = decode(JSON.stringify(s));
  assert.deepEqual(reloaded.active, s.active); assert.equal(reloaded.rng, s.rng); assert.deepEqual(reloaded.jobs, s.jobs);
  advance(s, s.active.returnsAt); advance(reloaded, reloaded.active.returnsAt); assert.deepEqual(s, reloaded);
  standDown(); standDown(); prepareMorning(s);
  assert.equal(s.completed, 6); assert.equal(s.assignments[6].hazard, Math.max(1, before - 1));
  const p = proposePlan(s), a = s.aircraft.find(a => a.id === p.flights[0].aircraft), c = s.crews.find(c => c.id === p.flights[0].crew);
  const helped = forecast(s, a, c, p).exposure;
  const without = structuredClone(s); without.assignments[6].hazard = before;
  assert.ok(helped <= forecast(without, a, c, p).exposure);
  assert.deepEqual(decode(JSON.stringify(s)).campaign, s.campaign);
});

test('the integrated empty-stores gamble keeps hit records but earns no support or fulfilled objective', async () => {
  const { advance, applyBranch, commit, createCampaign, prepareMorning, proposePlan, tourEvaluation } = await import('../game.ts');
  let seed = 1;
  while (createCampaignState(seed).intelligence[0].truth !== 'empty') seed++;
  const s = createCampaign(seed, 1_800_000_000_000);
  const standDown = () => { prepareMorning(s); commit(s, proposePlan(s), true); advance(s, s.active.returnsAt); };
  for (let slot = 0; slot < 9; slot++) standDown();
  prepareMorning(s); applyBranch(s, 'main'); standDown(); prepareMorning(s);
  const priorSupport = s.support;
  commit(s, proposePlan(s));
  for (const r of s.active.report.results) { r.hit = true; r.outcome = 'home'; r.injury = false; r.damage = 0; r.newDefect = null; }
  s.active.report.hits = s.active.report.results.length;
  advance(s, s.active.returnsAt);
  const r = s.reports.at(-1);
  assert.equal(r.hits, 3); assert.equal(r.objectiveEffective, false); assert.equal(s.support, priorSupport);
  assert.equal(s.branches.find(b => b.slot === 9).fulfilled, false);
  assert.equal(tourEvaluation(s).objectives, 0);
  assert.equal(s.opportunity, null); assert.match(r.debrief.assessment, /emptied before the raid/);
  assert.match(r.summary, /no objective was disrupted/);
  assert.equal(s.campaign.intelligence[0].knowledge, 'confirmed');
});
