/** Reproducible experiment, not a test assertion or a mathematical difficulty rating.
 * node src/haunted-house/tests/balance-batch.mjs --phase baseline --output .haunted-checks/baseline.json
 * node src/haunted-house/tests/balance-batch.mjs --phase expanded --output .haunted-checks/expanded.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { generateCandidate } from '../generation.ts';
import { TUNING, initialResources, xpNeeded } from '../content.ts';
import { solve, replayWitness } from '../solver.ts';
import { encounterChoices, witnessMetrics } from '../diagnostics.ts';

const args = process.argv.slice(2);
const argument = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const phase = argument('--phase', 'all'), count = Number(argument('--seeds', '16'));
if (!['all', 'baseline', 'expanded'].includes(phase) || !Number.isInteger(count) || count < 1 || count > 1000) throw new Error('Use --phase all|baseline|expanded and --seeds 1..1000.');
const cases = [
 { name: 'baseline-classic', ingredients: 'baseline', ruleset: 'classic' },
 { name: 'baseline-power-flare', ingredients: 'baseline', ruleset: 'power-flare' },
 { name: 'expanded-power-flare', ingredients: 'expanded', ruleset: 'power-flare' },
].filter(c => phase === 'all' || (phase === 'baseline' ? c.ingredients === 'baseline' : c.ingredients === 'expanded'));
const report = { seeds: Array.from({ length: count }, (_, i) => `hh-balance-${String(i).padStart(2, '0')}`),
 budget: TUNING.solverBudget, width: TUNING.solverWidth, attempts: TUNING.generationAttempts, cases: [] };
report.arithmetic = [];
// Fixed enemies, synthetic full-resource progression states: isolates arithmetic from
// different witness orders. This is deliberately NOT a claim those states are reachable.
for (const ruleset of ['classic', 'power-flare']) for (const level of [1, 3, 5, 7]) {
 const choices = report.seeds.flatMap(seed => {
  const s = generateCandidate(seed, 0, { ingredients: 'baseline', ruleset });
  const start = initialResources();
  s.resources = { ...start, level, xp: xpNeeded(level) - 1, power: start.power + TUNING.levelPower * (level - 1),
   health: start.maxHealth + TUNING.levelHealth * (level - 1), maxHealth: start.maxHealth + TUNING.levelHealth * (level - 1), light: start.maxLight };
  return s.hauntings.map(h => encounterChoices(s, h));
 });
 report.arithmetic.push({ ruleset, level, enemies: choices.length,
  meanFlareHits: +(choices.reduce((n, c) => n + c.flareHits, 0) / choices.length).toFixed(3),
  affordableFlareKills: choices.filter(c => c.flareAffordable).length,
  wardSurvivalThresholds: choices.filter(c => c.wardChangesSurvival).length,
  oilStrikeThresholds: choices.filter(c => c.oilStrikeHitsSaved > 0).length });
}
if (args.includes('--arithmetic')) cases.splice(0);
for (const configuration of cases) {
 const runs = [];
 for (const [index, seed] of report.seeds.entries()) {
  const attempts = []; let accepted;
  for (let variant = 0; variant < TUNING.generationAttempts; variant++) {
   let initial;
   try { initial = generateCandidate(seed, variant, configuration); }
   catch (error) { attempts.push({ variant, solved: false, replayed: false, reason: 'generation-error', message: error.message, visited: 0, ms: 0 }); continue; }
   const start = performance.now(); const result = solve(initial);
   const replayed = result.solved && !!replayWitness(initial, result.actions);
   attempts.push({ variant, solved: result.solved, replayed, reason: result.reason, visited: result.visited, ms: Math.round(performance.now() - start) });
   if (!replayed) continue;
   accepted = { variant, metrics: witnessMetrics(initial, result.actions), alternatives: [] };
   // A small, identical subsample checks plausible different resource preferences/orders.
   if (index < 4) for (const preference of ['health', 'light']) {
    const alternative = solve(initial, TUNING.solverBudget, preference);
    accepted.alternatives.push({ preference, solved: alternative.solved, reason: alternative.reason,
     ...(alternative.solved ? { metrics: witnessMetrics(initial, alternative.actions) } : {}) });
   }
   break;
  }
  runs.push({ seed, attempts, ...(accepted ? { accepted } : {}) });
  console.log(`${configuration.name} ${seed}: ${accepted ? `variant ${accepted.variant}` : 'FAILED'} (${attempts.length} candidates)`);
 }
 const accepted = runs.flatMap(r => r.accepted ? [r.accepted.metrics] : []);
 const total = key => accepted.reduce((n, m) => n + m[key], 0);
 const choices = accepted.flatMap(m => m.choices);
 const mean = key => choices.length ? +(choices.reduce((n, c) => n + c[key], 0) / choices.length).toFixed(3) : 0;
 const alternatives = runs.flatMap(r => r.accepted?.alternatives ?? []);
 const summary = {
  seeds: runs.length, accepted: accepted.length, failures: runs.length - accepted.length,
  rawVariantZeroWins: runs.filter(r => r.attempts[0].replayed).length,
  candidates: runs.reduce((n, r) => n + r.attempts.length, 0),
  rejectedCandidates: runs.flatMap(r => r.attempts).filter(a => !a.replayed).length,
  budgetRejections: runs.flatMap(r => r.attempts).filter(a => a.reason === 'budget').length,
  exhaustedRejections: runs.flatMap(r => r.attempts).filter(a => a.reason === 'exhausted').length,
  generationErrors: runs.flatMap(r => r.attempts).filter(a => a.reason === 'generation-error').length,
  maxAttemptMs: Math.max(...runs.flatMap(r => r.attempts).map(a => a.ms)),
  strikes: total('strikes'), flares: total('flares'), wards: total('wards'), oils: total('oils'),
  turns: total('turns'), kills: total('kills'), levelUps: total('levelUps'), lightRefunded: total('lightRefunded'),
  pureFlareKills: total('pureFlareKills'), twoFlareRefillKills: total('twoFlareRefillKills'), consecutiveTwoFlareRefills: total('consecutiveTwoFlareRefills'),
  healthRefunded: total('healthRefunded'), consecutiveRefillKills: total('consecutiveRefillKills'),
  unusedFood: total('unusedFood'), unusedCandles: total('unusedCandles'), pocketTonics: total('pocketTonics'), pocketOils: total('pocketOils'),
  inspectableEncounterSamples: choices.length, meanStrikeHits: mean('strikeHits'), meanStrikeHealthCost: mean('strikeHealthCost'),
  meanFlareHits: mean('flareHits'), meanFlareLightCost: mean('flareLightCost'),
  wardSurvivalThresholds: choices.filter(c => c.wardChangesSurvival).length,
  wardSavesAtLeastThree: choices.filter(c => c.wardSaved >= 3).length,
  oilChangesStrikeCount: choices.filter(c => c.oilStrikeHitsSaved > 0).length,
  oilChangesFlareCount: choices.filter(c => c.oilFlareHitsSaved > 0).length,
  affordableTwoFlareRefills: choices.filter(c => c.twoFlareRefill).length,
  alternativeRuns: alternatives.length, alternativeWins: alternatives.filter(a => a.solved).length,
  alternativeDifferentOrders: runs.reduce((n, r) => n + (r.accepted?.alternatives.filter(a => a.solved && JSON.stringify(a.metrics.encounterOrder) !== JSON.stringify(r.accepted.metrics.encounterOrder)).length ?? 0), 0),
 };
 report.cases.push({ ...configuration, summary, runs });
 console.log(JSON.stringify({ name: configuration.name, ...summary }));
}
const classic = report.cases.find(c => c.name === 'baseline-classic'), candidate = report.cases.find(c => c.name === 'baseline-power-flare');
if (classic && candidate) {
 const shared = classic.runs.filter(r => r.accepted?.variant === 0 && candidate.runs.find(c => c.seed === r.seed)?.accepted?.variant === 0).map(r => r.seed);
 report.matchedRawZero = { seeds: shared, cases: [classic, candidate].map(c => {
  const metrics = c.runs.filter(r => shared.includes(r.seed)).map(r => r.accepted.metrics);
  return { name: c.name, ...Object.fromEntries(['turns', 'kills', 'strikes', 'flares', 'wards', 'oils', 'twoFlareRefillKills', 'unusedFood', 'unusedCandles'].map(key => [key, metrics.reduce((n, m) => n + m[key], 0)])) };
 }) };
}
if (args.includes('--compact')) for (const c of report.cases) for (const run of c.runs) if (run.accepted) {
 delete run.accepted.metrics.choices;
 for (const alternate of run.accepted.alternatives) if (alternate.metrics) delete alternate.metrics.choices;
}
const output = argument('--output', '.haunted-checks/balance-results.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${output}`);
