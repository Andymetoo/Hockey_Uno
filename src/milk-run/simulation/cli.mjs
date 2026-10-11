import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { runBatch, runSortie, replayRun, resolveLimits } from './runner.mjs';
import { writeReports } from './reporting.mjs';
import { resolveScenario } from './scenarios.mjs';
import { sourceVersions } from './versions.mjs';

const HELP = `Headless B-17 sorties (Node 18+)
  node src/milk-run/simulation/cli.mjs [--count 2] [--seed sortie] [--policies random,purposeful]
    [--scenarios standard,v2-tactical,v1-standard] [--scenario-file path.json]
    [--policy-module path.mjs] [--out src/milk-run/.checks/simulation]
    [--max-commands 3000] [--max-turns 1500] [--max-idle-commands 256]
    [--max-unchanged-commands 16] [--max-legal-actions 50000]
  node src/milk-run/simulation/cli.mjs replay path/to/traces/0001.json [--allow-version-drift]
Every batch validates up to two paired seeds with exact reruns and trace replay before expanding.
Custom modules export createPolicy(), returning { id, version, select({state,actions,random}) }.
Select an object from actions. Scenarios use existing rules/config/targets or an exact initialState.
Exit 0: validated complete batch / full replay; 2: incomplete or prefix-only; 1: configuration or reproduction failure.
`;
export function parseArguments(args) {
  const options = { command: args[0] === 'replay' ? args.shift() : 'run' };
  if (options.command === 'replay') options.trace = args.shift();
  const names = new Set(['count', 'seed', 'policies', 'scenarios', 'scenario-file', 'policy-module', 'out', 'max-commands', 'max-turns', 'max-idle-commands', 'max-unchanged-commands', 'max-legal-actions']);
  while (args.length) {
    const arg = args.shift();
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg === '--allow-version-drift') { options.allowVersionDrift = true; continue; }
    const name = arg.replace(/^--/, '');
    if (!arg.startsWith('--') || !names.has(name) || !args.length || args[0].startsWith('--')) throw new Error(`Unknown or incomplete argument: ${arg}`);
    options[name] = args.shift();
  }
  return options;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments([...args]);
  if (options.help) { console.log(HELP); return; }
  if (options.command === 'replay') {
    if (!options.trace) throw new Error('Supply a trace file to replay.');
    const result = replayRun(JSON.parse(await readFile(resolve(options.trace), 'utf8')), { allowVersionDrift: options.allowVersionDrift });
    console.log(JSON.stringify(result, null, 2));
    if (result.reproduction !== 'full') process.exitCode = 2;
    return result;
  }
  const count = Number(options.count ?? 2);
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error('--count must be a positive integer.');
  const scenarios = options['scenario-file'] ? [resolveScenario(JSON.parse(await readFile(resolve(options['scenario-file']), 'utf8')))]
    : (options.scenarios ?? 'standard').split(',').map(resolveScenario);
  const policies = (options.policies ?? 'random,purposeful').split(',');
  if (options['policy-module']) {
    const module = await import(pathToFileURL(resolve(options['policy-module'])).href);
    if (typeof module.createPolicy !== 'function') throw new Error('Custom module must export createPolicy().');
    policies.push(module.createPolicy);
  }
  const requested = {};
  for (const [flag, key] of Object.entries({ 'max-commands': 'maxCommands', 'max-turns': 'maxTurns', 'max-idle-commands': 'maxIdleCommands', 'max-unchanged-commands': 'maxUnchangedCommands', 'max-legal-actions': 'maxLegalActions' })) if (options[flag]) requested[key] = Number(options[flag]);
  const limits = resolveLimits(requested), versions = sourceVersions();
  const seeds = Array.from({ length: count }, (_, i) => `${options.seed ?? 'sortie'}-${i}`);
  const onRun = run => console.log(`${run.metadata.scenario.id} / ${run.metadata.seed} / ${run.metadata.policy.id}: ${run.status} ${run.metrics.outcome ?? ''} (${run.metrics.commands} commands)${run.reason ? ': ' + run.reason : ''}`);
  const batch = runBatch({ scenarios, policies, seeds: seeds.slice(0, 2), limits, versions, onRun });
  const validation = { pilotRuns: batch.runs.length, deterministicReruns: 0, replays: 0, expanded: false, errors: [] };
  for (const run of batch.runs) {
    try {
      const factory = policies.find(p => typeof p === 'function' ? p().id === run.metadata.policy.id : p === run.metadata.policy.id);
      const rerun = runSortie({ scenario: run.metadata.scenario, seed: run.metadata.seed, policy: typeof factory === 'function' ? factory() : factory, limits, versions });
      if (JSON.stringify(rerun) !== JSON.stringify(run)) throw new Error('Deterministic rerun differs.');
      validation.deterministicReruns++;
      const replay = replayRun(run);
      if (replay.reproduction !== 'full') throw new Error('Only the command prefix could be replayed.');
      validation.replays++;
    } catch (error) { validation.errors.push({ seed: run.metadata.seed, policy: run.metadata.policy.id, error: error.message }); }
  }
  if (!validation.errors.length && batch.runs.every(run => run.status === 'completed') && count > 2) {
    console.log('Pilot reruns and replays passed; expanding the paired batch.');
    batch.runs.push(...runBatch({ scenarios, policies, seeds: seeds.slice(2), limits, versions, onRun }).runs);
    validation.expanded = true;
  }
  batch.seeds = seeds.slice(0, batch.runs.length ? Math.max(...batch.runs.map(run => seeds.indexOf(run.metadata.seed))) + 1 : 0);
  const report = await writeReports(batch, options.out ?? 'src/milk-run/.checks/simulation', { validation, runtime: { node: process.version, platform: process.platform }, requestedSeeds: seeds });
  console.log(JSON.stringify({ ...report, validation }, null, 2));
  if (validation.errors.length) process.exitCode = 1;
  else if (batch.runs.some(run => run.status !== 'completed')) process.exitCode = 2;
  return { batch, validation, report };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
