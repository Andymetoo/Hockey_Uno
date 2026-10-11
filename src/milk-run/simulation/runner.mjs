import { createGameAdapter, observation, semanticState, ADAPTER_VERSION } from './adapter.mjs';
import { resolveScenario } from './scenarios.mjs';
import { createPolicy, policyRandom } from './policies.mjs';
import { assertInvariants, nativeTokenTotals } from './invariants.mjs';
import { digest, sourceVersions, TRACE_SCHEMA_VERSION } from './versions.mjs';
import { missionTurn } from '../crew-health.mjs';

export const DEFAULT_LIMITS = Object.freeze({ maxCommands: 3000, maxTurns: 1500, maxIdleCommands: 256, maxUnchangedCommands: 16, maxLegalActions: 50000 });
export function resolveLimits(input = {}) {
  for (const key of Object.keys(input)) if (!Object.hasOwn(DEFAULT_LIMITS, key)) throw new Error(`Unknown execution limit: ${key}`);
  const limits = { ...DEFAULT_LIMITS, ...input };
  for (const [key, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer.`);
  return limits;
}
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
};
const increment = (counts, key) => { counts[key] = (counts[key] ?? 0) + 1; };
export const stateHash = state => digest(semanticState(state));
const eventHash = events => digest(events.map(({ state, ...event }) => event));
const clock = state => `${missionTurn(state)}:${state.mission.position}`;
const population = state => ({
  damaged: Object.values(state.cells).filter(s => s === 'damaged').length,
  fires: Object.values(state.cells).filter(s => s === 'fire').length,
  injured: state.crew.filter(c => c.health === 'injured').length,
  dead: state.crew.filter(c => c.health === 'dead').length,
  compromised: state.compromised.length,
});

export function runSortie({ scenario: input = 'standard', seed = 'sortie-0', policy: selected = 'random', policySeed, limits: requestedLimits,
  versions = sourceVersions(), adapterFactory = createGameAdapter } = {}) {
  const scenario = resolveScenario(input), limits = resolveLimits(requestedLimits);
  const policy = typeof selected === 'string' ? createPolicy(selected) : selected;
  if (!policy?.id || !policy.version || typeof policy.select !== 'function') throw new Error('A policy needs id, version and select(context).');
  seed = String(seed);
  policySeed = String(policySeed ?? `${seed}:${policy.id}:decisions`);
  const adapter = adapterFactory({ scenario, seed, maxLegalActions: limits.maxLegalActions });
  let state = adapter.snapshot(), hash = stateHash(state), unchanged = 0, idle = 0, status, reason = null;
  const initialClock = missionTurn(state), initialProgress = state.mission.position;
  const metadata = { ...versions, adapterVersion: ADAPTER_VERSION, seed, engineSeed: state.seed, policy: { id: policy.id, version: policy.version, seed: policySeed },
    scenario, limits, ruleset: state.ruleset, rulesVersion: state.rulesVersion, boardVersion: state.boardVersion,
    crewPositionVersion: state.crewPositionVersion, v2ConfigVersion: state.v2ConfigVersion ?? null, initialStateHash: hash };
  const trace = [], commandCounts = {}, actionCounts = {}, eventCounts = {};
  const peak = population(state), minResources = { ...state.resources }, maxResources = { ...state.resources };
  let invalidOperations = 0, invariantChecks = 0, failure = null;
  const sample = snapshot => {
    const p = population(snapshot);
    for (const key of Object.keys(peak)) peak[key] = Math.max(peak[key], p[key]);
    for (const key of Object.keys(minResources)) {
      minResources[key] = Math.min(minResources[key], snapshot.resources[key]);
      maxResources[key] = Math.max(maxResources[key], snapshot.resources[key]);
    }
  };
  const fail = (type, message, stage) => { status = type; reason = message; failure = { stage, message }; };
  const totals = nativeTokenTotals(state), draw = policyRandom(policySeed);
  try { assertInvariants(state, totals); invariantChecks++; }
  catch (error) { fail('invariant_failure', error.message, 'initial-invariants'); }
  while (!status) {
    // Terminal authority takes precedence over execution bounds on the last step.
    if (adapter.outcome()) { status = 'completed'; break; }
    if (trace.length >= limits.maxCommands) { fail('runaway', `Command limit ${limits.maxCommands} reached without an outcome.`, 'limit'); break; }
    if (missionTurn(state) - initialClock >= limits.maxTurns) { fail('runaway', `Turn limit ${limits.maxTurns} reached without an outcome.`, 'limit'); break; }
    if (unchanged >= limits.maxUnchangedCommands || idle >= limits.maxIdleCommands) {
      fail('stalled', unchanged >= limits.maxUnchangedCommands ? `${unchanged} consecutive commands left game state unchanged.` : `${idle} commands without advancing the mission clock.`, 'stall'); break;
    }
    let actions, command;
    try { actions = freeze(adapter.legalActions()); }
    catch (error) { fail(error.code === 'LEGAL_COMMAND_LIMIT' ? 'enumeration_limit' : 'engine_error', error.message, 'legal-actions'); break; }
    if (!actions.length) { fail('stalled', `No legal commands in phase ${state.phase}.`, 'legal-actions'); break; }
    try { command = policy.select({ state: freeze(observation(state)), actions, random: draw }); }
    catch (error) { fail('policy_error', error.message, 'policy'); break; }
    // A plugin must select an actual supplied object; even plausible fabricated
    // commands do not enter the engine. Replay resolves saved input to the list.
    if (!actions.includes(command)) {
      invalidOperations++;
      let attempted;
      try { attempted = JSON.parse(JSON.stringify(command ?? null)); } catch { attempted = null; }
      trace.push({ command: attempted, rejected: true });
      fail('invalid_operation', 'Policy did not select an object from the legal action catalogue.', 'policy-legality'); break;
    }
    const previous = state, previousHash = hash;
    let events;
    try { events = adapter.advance(command); }
    catch (error) {
      invalidOperations++; trace.push({ command, rejected: true });
      fail('engine_error', error.message, 'advance'); break;
    }
    increment(commandCounts, command.type);
    if (command.action) increment(actionCounts, command.action);
    for (const event of events) { increment(eventCounts, event.type); if (event.state) sample(event.state); }
    state = adapter.snapshot(); hash = stateHash(state); sample(state);
    trace.push({ command, hash, rng: state.rng, storyRng: state.story?.rng ?? null, events: eventHash(events) });
    unchanged = hash === previousHash ? unchanged + 1 : 0;
    idle = clock(state) === clock(previous) ? idle + 1 : 0;
    try { assertInvariants(state, totals, previous); invariantChecks++; }
    catch (error) { fail('invariant_failure', error.message, 'transition-invariants'); }
  }
  const outcome = status === 'completed' ? adapter.outcome() : null;
  const metrics = {
    outcome: status === 'completed' ? state.outcome : null, aircraftSurvived: outcome?.aircraftSurvived ?? null,
    bombingOutcome: outcome?.bombingOutcome ?? state.mission.bombingResult ?? null, aborted: Boolean(state.mission.aborted),
    commands: Object.values(commandCounts).reduce((n, value) => n + value, 0), attempts: trace.length,
    turns: missionTurn(state) - initialClock, rounds: state.stats.rounds, progress: state.mission.position - initialProgress,
    position: state.mission.position, altitude: state.altitude,
    crewAlive: state.crew.filter(c => c.health !== 'dead').length, ...population(state), peak,
    crewInjuries: state.stats.crewInjured, crewDeaths: state.stats.crewKilled,
    deadCrewIds: state.crew.filter(c => c.health === 'dead').map(c => c.id),
    aircraftHits: state.stats.aircraftHits, firesStarted: state.stats.firesStarted, repairs: state.stats.repairs,
    resources: { final: { ...state.resources }, min: minResources, max: maxResources,
      OfficerGained: state.stats.OfficerGained, OfficerSpent: state.stats.OfficerSpent, EnlistedGained: state.stats.EnlistedGained, EnlistedSpent: state.stats.EnlistedSpent },
    opportunity: state.opportunity, opportunitySpent: state.stats.opportunitySpent,
    fightersKilled: state.stats.fightersKilled, enginesStopped: state.engines.filter(e => !e.running).length,
    stats: structuredClone(state.stats), telemetry: structuredClone(state.telemetry ?? null),
    commandCounts, actionCounts, eventCounts, invalidOperations, invariantChecks,
    idleCommands: idle, unchangedCommands: unchanged, stalled: status === 'stalled', runaway: status === 'runaway',
  };
  return { schemaVersion: TRACE_SCHEMA_VERSION, metadata, status, reason, failure, metrics, finalStateHash: hash, trace };
}

/** Paired seeds make policy comparisons independent of execution ordering. */
export function runBatch({ scenarios = ['standard'], policies = ['random', 'purposeful'], seeds = ['sortie-0', 'sortie-1'], limits, versions = sourceVersions(), onRun = () => {} } = {}) {
  if (!scenarios.length || !policies.length || !seeds.length) throw new Error('A batch needs scenarios, policies and seeds.');
  const runs = [];
  for (const scenario of scenarios) for (const seed of seeds) for (const policy of policies) {
    const run = runSortie({ scenario, seed, policy: typeof policy === 'function' ? policy() : policy, limits, versions });
    runs.push(run); onRun(run);
  }
  return { schemaVersion: 1, versions, seeds: [...seeds], runs };
}

/** Replays recorded decisions through the same catalogue, dispatcher and checks.
 * Engine/policy errors outside dispatch can only verify a command prefix;
 * that limitation is explicit instead of claiming a reproduced plugin crash.
 */
export function replayRun(record, { allowVersionDrift = false } = {}) {
  if (record.schemaVersion !== TRACE_SCHEMA_VERSION) throw new Error('Unsupported trace version.');
  const current = sourceVersions();
  for (const key of ['engineFingerprint', 'runnerFingerprint']) if (!allowVersionDrift && record.metadata[key] !== current[key]) throw new Error(`${key} differs; use --allow-version-drift for an explicit investigation.`);
  let index = 0;
  const policy = { ...record.metadata.policy, select({ actions }) {
    const entry = record.trace[index++];
    if (!entry) throw new Error('Recorded command prefix exhausted.');
    const selected = actions.find(command => JSON.stringify(command) === JSON.stringify(entry.command));
    return entry.rejected && record.failure?.stage === 'policy-legality' ? structuredClone(entry.command) : selected;
  } };
  const replay = runSortie({ scenario: record.metadata.scenario, seed: record.metadata.seed, policy,
    policySeed: record.metadata.policy.seed, limits: record.metadata.limits, versions: current });
  if (replay.metadata.initialStateHash !== record.metadata.initialStateHash) throw new Error('Initial state differs from the trace.');
  if (JSON.stringify(replay.trace) !== JSON.stringify(record.trace)) throw new Error(`Trace diverged at command ${replay.trace.findIndex((entry, i) => JSON.stringify(entry) !== JSON.stringify(record.trace[i])) + 1}.`);
  if (replay.finalStateHash !== record.finalStateHash) throw new Error('Final state differs from the trace.');
  const prefixOnly = record.failure?.stage === 'policy';
  if (!prefixOnly && (replay.status !== record.status || replay.reason !== record.reason || JSON.stringify(replay.metrics) !== JSON.stringify(record.metrics))) throw new Error('Termination or metrics differ from the trace.');
  return { verified: true, reproduction: prefixOnly ? 'command-prefix-only' : 'full', commands: replay.metrics.commands, status: record.status, finalStateHash: replay.finalStateHash };
}
