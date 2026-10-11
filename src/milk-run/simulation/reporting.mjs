import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const average = (runs, key) => runs.length ? runs.reduce((sum, run) => sum + run.metrics[key], 0) / runs.length : null;
export function summarize(runs) {
  const groups = new Map();
  for (const run of runs) {
    const key = JSON.stringify([run.metadata.scenario.id, run.metadata.policy.id, run.metadata.ruleset]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }
  return [...groups.values()].map(group => {
    const completed = group.filter(run => run.status === 'completed');
    const returned = completed.filter(run => run.metrics.aircraftSurvived).length;
    const statuses = {};
    for (const run of group) statuses[run.status] = (statuses[run.status] ?? 0) + 1;
    return {
      scenario: group[0].metadata.scenario.id, policy: group[0].metadata.policy.id, ruleset: group[0].metadata.ruleset,
      runs: group.length, completed: completed.length, incomplete: group.length - completed.length,
      returned, lost: completed.length - returned, survivalRate: completed.length ? returned / completed.length : null,
      averageTurns: average(completed, 'turns'), averageCommands: average(completed, 'commands'),
      averageDead: average(completed, 'dead'), averageInjured: average(completed, 'injured'), averageDamage: average(completed, 'damaged'),
      averageFires: average(completed, 'fires'), statuses,
      invalidOperations: group.reduce((n, run) => n + run.metrics.invalidOperations, 0),
      invariantChecks: group.reduce((n, run) => n + run.metrics.invariantChecks, 0),
      actionCounts: group.reduce((counts, run) => { for (const [key, value] of Object.entries(run.metrics.actionCounts)) counts[key] = (counts[key] ?? 0) + value; return counts; }, {}),
    };
  });
}

export function resultRow(run, tracePath) {
  const m = run.metrics, meta = run.metadata;
  return {
    scenario: meta.scenario.id, seed: meta.seed, engineSeed: meta.engineSeed, policy: meta.policy.id, policyVersion: meta.policy.version, policySeed: meta.policy.seed,
    ruleset: meta.ruleset, rulesVersion: meta.rulesVersion, runnerVersion: meta.runnerVersion, engineFingerprint: meta.engineFingerprint,
    runnerFingerprint: meta.runnerFingerprint, status: run.status, reason: run.reason, outcome: m.outcome, aircraftSurvived: m.aircraftSurvived,
    bombingOutcome: m.bombingOutcome, aborted: m.aborted, commands: m.commands, turns: m.turns, rounds: m.rounds, progress: m.progress,
    altitude: m.altitude, crewAlive: m.crewAlive, dead: m.dead, injured: m.injured, crewDeaths: m.crewDeaths, crewInjuries: m.crewInjuries,
    damaged: m.damaged, fires: m.fires, peakDamage: m.peak.damaged, peakFires: m.peak.fires, firesStarted: m.firesStarted,
    aircraftHits: m.aircraftHits, repairs: m.repairs, enginesStopped: m.enginesStopped, fightersKilled: m.fightersKilled,
    officerFinal: m.resources.final.Officer, enlistedFinal: m.resources.final.Enlisted,
    officerSpent: m.resources.OfficerSpent, enlistedSpent: m.resources.EnlistedSpent,
    officerGained: m.resources.OfficerGained, enlistedGained: m.resources.EnlistedGained,
    invalidOperations: m.invalidOperations, stalled: m.stalled, runaway: m.runaway, invariantChecks: m.invariantChecks,
    actionCounts: m.actionCounts, commandCounts: m.commandCounts, config: meta.scenario.config ?? meta.scenario.initialState.config,
    limits: meta.limits, finalStateHash: run.finalStateHash, trace: tracePath,
  };
}
export function toCsv(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const quote = value => `"${String(value && typeof value === 'object' ? JSON.stringify(value) : value ?? '').replaceAll('"', '""')}"`;
  return [keys.map(quote).join(','), ...rows.map(row => keys.map(key => quote(row[key])).join(','))].join('\n') + '\n';
}

export function comparisonHtml(summary, rows) {
  const number = value => value === null ? '—' : value.toFixed(1);
  const summaries = summary.map(s => `<tr><td>${escapeHtml(s.scenario)}</td><td>${escapeHtml(s.policy)}</td><td>${s.runs}</td><td>${s.returned}</td><td>${s.lost}</td><td>${s.incomplete}</td><td>${s.survivalRate === null ? '—' : (s.survivalRate * 100).toFixed(1) + '%'}</td><td>${number(s.averageTurns)}</td><td>${number(s.averageDead)}</td><td>${s.invalidOperations}</td></tr>`).join('');
  const details = rows.map(r => `<tr><td>${escapeHtml(r.scenario)}</td><td>${escapeHtml(r.seed)}</td><td>${escapeHtml(r.policy)}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.outcome)}</td><td>${r.turns}</td><td>${r.dead}</td><td>${r.damaged}</td><td>${r.fires}</td><td>${escapeHtml(r.reason)}</td><td><a href="${escapeHtml(r.trace)}">JSON trace</a></td></tr>`).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>B-17 sortie comparison</title>
<style>body{font:16px system-ui;background:#f5f6f8;color:#182334;margin:2rem;max-width:1400px}h1{font-size:1.7rem}table{border-collapse:collapse;background:white;width:100%}th,td{padding:.65rem;text-align:left;border-bottom:1px solid #dce2e8;white-space:nowrap}th{background:#e9eef4}section{overflow:auto;margin:1.5rem 0}p{max-width:850px}a{color:#1857a4}</style>
<h1>B-17 automated sortie comparison</h1><p>Survival and averages use completed sorties only. Incomplete runs include stalls, execution limits and errors. These small samples validate the runner and do not establish game balance. Policy seeds are paired; decisions can lead to different engine draws.</p>
<section><table><caption>Policy comparison</caption><thead><tr><th>Scenario</th><th>Policy</th><th>Runs</th><th>Returned</th><th>Lost</th><th>Incomplete</th><th>Survival</th><th>Avg turns</th><th>Avg dead</th><th>Invalid</th></tr></thead><tbody>${summaries}</tbody></table></section>
<p><a href="results.csv">CSV results</a> · <a href="results.json">Full JSON results</a></p>
<section><table><caption>Individual sorties</caption><thead><tr><th>Scenario</th><th>Seed</th><th>Policy</th><th>Status</th><th>Outcome</th><th>Turns</th><th>Dead</th><th>Damage</th><th>Fires</th><th>Reason</th><th>Reproduction</th></tr></thead><tbody>${details}</tbody></table></section></html>\n`;
}

export async function writeReports(batch, outputDirectory, extra = {}) {
  const directory = resolve(outputDirectory), traceDirectory = join(directory, 'traces');
  await mkdir(traceDirectory, { recursive: true });
  const rows = [];
  for (const [index, run] of batch.runs.entries()) {
    const tracePath = `traces/${String(index + 1).padStart(4, '0')}.json`;
    await writeFile(join(directory, tracePath), JSON.stringify(run) + '\n');
    rows.push(resultRow(run, tracePath));
  }
  const summary = summarize(batch.runs);
  const records = batch.runs.map(({ trace, ...run }, index) => ({ ...run, tracePath: rows[index].trace }));
  await writeFile(join(directory, 'results.json'), JSON.stringify({ schemaVersion: batch.schemaVersion, versions: batch.versions, seeds: batch.seeds, ...extra, summary, runs: records }, null, 2) + '\n');
  await writeFile(join(directory, 'results.csv'), toCsv(rows));
  await writeFile(join(directory, 'comparison.html'), comparisonHtml(summary, rows));
  return { directory, summary };
}
