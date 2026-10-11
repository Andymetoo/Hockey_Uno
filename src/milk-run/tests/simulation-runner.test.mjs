import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createGame } from '../state.mjs';
import { BOARD, neighbors } from '../board.mjs';
import { dispatch, legalCommands, availableActions } from '../rules.mjs';
import { startStoryThread } from '../story.mjs';
import { STORY_THREADS } from '../story-content.mjs';
import { createGameAdapter, semanticState } from '../simulation/adapter.mjs';
import { resolveScenario } from '../simulation/scenarios.mjs';
import { createPolicy } from '../simulation/policies.mjs';
import { assertInvariants, nativeTokenTotals } from '../simulation/invariants.mjs';
import { runSortie, runBatch, replayRun, stateHash } from '../simulation/runner.mjs';
import { summarize, writeReports, toCsv } from '../simulation/reporting.mjs';
import { sourceVersions } from '../simulation/versions.mjs';
import { parseArguments } from '../simulation/cli.mjs';

const quiet = { v2StoryMode: false, v2MissionEnemy: 0, v2MissionResource: 50, v2MissionTime: 10 };
const snapshot = state => ({ id: 'fixture', initialState: state });
const first = { id: 'first', version: 1, select: ({ actions }) => actions[0] };
function bombState() {
  const state = createGame(quiet, 'bomb-loop', 'v2-continuous');
  state.phase = 'bombing'; state.mission.position = state.config.v2OutboundLength;
  return dispatch(state, { type: 'bomb' }).state;
}

test('full default V2 sorties are deterministic, legal and replayable under both built-in policies', () => {
  for (const policy of ['random', 'purposeful']) {
    const args = { seed: 'pilot-0', policy };
    const run = runSortie(args), repeat = runSortie(args);
    assert.deepEqual(repeat, run);
    assert.equal(run.status, 'completed', run.reason);
    assert.equal(run.metrics.invalidOperations, 0);
    assert.equal(run.metrics.invariantChecks, run.metrics.commands + 1);
    assert.equal(replayRun(JSON.parse(JSON.stringify(run))).reproduction, 'full');
    assert.ok(run.metrics.eventCounts.MISSION_ENDED);
    assert.ok(run.metrics.progress > 0);
    assert.ok(run.trace.every(entry => entry.hash && entry.events && Number.isInteger(entry.rng)));
  }
});

test('V1 uses its real round, unavailable-slot, bombing and terminal lifecycle', () => {
  const scenario = { id: 'short-v1', ruleset: 'v1', config: { missionEnemy: 0, missionResource: 100, outboundLength: 1, returnLength: 1 } };
  const run = runSortie({ scenario, seed: 'v1-life', policy: 'purposeful' });
  assert.equal(run.status, 'completed'); assert.equal(run.metrics.outcome, 'success');
  assert.equal(run.metrics.commandCounts.startRound, 2); assert.equal(run.metrics.commandCounts.endRound, 2);
  assert.equal(run.metrics.commandCounts.bomb, 1); assert.equal(replayRun(run).reproduction, 'full');
});

test('legal command queries are read-only and every emitted target, job and assistant command dispatches', () => {
  for (const crewId of ['engineer', 'pilot', 'copilot', 'navigator', 'radio', 'ball']) {
    let state = createGame(quiet, `catalogue-${crewId}`, 'v2-continuous');
    state = dispatch(state, { type: 'activate', crewId }).state;
    // Fixture setup only: no rules, odds or defaults are altered in production.
    const open = BOARD.filter(cell => cell.structure && !state.crew.some(c => c.position.includes(cell.id)));
    state.cells[open[0].id] = 'damaged'; state.cells[open[1].id] = 'fire';
    const patient = state.crew.find(c => c.id !== crewId && ['pilot', 'copilot'].includes(c.id));
    patient.health = 'injured';
    state.engines[0].running = false;
    state.fighters = [
      { id: 'fore', type: 'BF-109', hp: 2, maxHp: 2, quadrant: 'Fore', altitude: 'High', facing: 0 },
      { id: 'aft', type: 'BF-109', hp: 2, maxHp: 2, quadrant: 'Aft', altitude: 'Low', facing: 0 },
      { id: 'port', type: 'BF-109', hp: 2, maxHp: 2, quadrant: 'Port', altitude: 'Level', facing: 90 },
    ];
    const before = structuredClone(state), commands = legalCommands(state);
    assert.deepEqual(state, before, 'listing commands cannot consume randomness or repair state');
    assert.equal(new Set(commands.map(c => JSON.stringify(c))).size, commands.length);
    for (const command of commands) assert.doesNotThrow(() => dispatch(state, command), JSON.stringify(command));
    for (const action of availableActions(state).filter(a => a.enabled)) assert.ok(commands.some(c => c.action === action.id), `${crewId}: domain for ${action.id}`);
    assert.ok(commands.some(c => c.action === 'medical'));
    assert.ok(commands.some(c => c.action === 'repair' && c.assistantId));
  }
});

test('connected multi-square jobs include every primary row and explicit assistant work positions', () => {
  let state = createGame(quiet, 'connected-domains', 'v2-continuous');
  state = dispatch(state, { type: 'activate', crewId: 'engineer' }).state;
  const open = BOARD.filter(c => c.structure && c.fuselage && !state.crew.some(person => person.position.includes(c.id)));
  const primary = open.find(cell => neighbors(cell.id).some(other => open.some(c => c.id === other.id)));
  const cells = [primary, neighbors(primary.id).find(other => open.some(c => c.id === other.id))];
  for (const cell of cells) state.cells[cell.id] = 'damaged';
  const commands = legalCommands(state).filter(c => c.action === 'repair');
  const pairs = commands.filter(c => c.cells.length === 2);
  assert.ok(pairs.length);
  assert.ok(pairs.some(c => c.cells[0] === cells[0].id)); assert.ok(pairs.some(c => c.cells[0] === cells[1].id));
  for (const command of pairs) assert.doesNotThrow(() => dispatch(state, command));
  assert.ok(commands.some(c => c.assistantId && c.assistantWorkCellId && c.workCellId));
  assert.throws(() => legalCommands(state, { maxCommands: 1 }), error => error.code === 'LEGAL_COMMAND_LIMIT');
});

test('Story decisions, Bomb Run edits/rerolls and campaign Turn Back come from dispatch', () => {
  const state = createGame({}, 'story-domain', 'v2-continuous');
  const thread = STORY_THREADS.find(t => (!t.eligible || t.eligible(state)) && t.stages[t.initial ?? 'start'].choices?.length && !t.stages[t.initial ?? 'start'].choices.some(c => c.effects?.some(e => e.type === 'work')));
  assert.ok(thread); startStoryThread(state, thread.id);
  const commands = legalCommands(state);
  assert.ok(commands.length); assert.ok(commands.every(c => c.type === 'storyChoice'));
  for (const command of commands) assert.doesNotThrow(() => dispatch(state, command));
  const bomb = bombState(), before = structuredClone(bomb), bombCommands = legalCommands(bomb);
  assert.ok(bombCommands.some(c => c.type === 'rerollBombDie' && c.source === 'free'));
  assert.ok(bombCommands.some(c => c.type === 'rerollBombDie' && c.source === 'officer'));
  assert.ok(!bombCommands.some(c => c.type === 'commitBombRun'));
  for (const command of bombCommands) assert.doesNotThrow(() => dispatch(bomb, command));
  assert.deepEqual(bomb, before);
  const campaign = createGame(quiet, 'turn-back', 'v2-continuous');
  campaign.campaign = { campaignId: 'test-campaign', sortieId: 'test-sortie' };
  assert.ok(legalCommands(campaign).some(c => c.type === 'turnBack' && c.confirmed === true));
});

test('policies cannot fabricate commands or mutate observations/catalogues', () => {
  const fabricated = runSortie({ policy: { id: 'bad', version: 1, select: ({ actions }) => ({ ...actions[0] }) } });
  assert.equal(fabricated.status, 'invalid_operation'); assert.equal(fabricated.metrics.invalidOperations, 1);
  assert.equal(fabricated.metrics.outcome, null); assert.equal(fabricated.finalStateHash, fabricated.metadata.initialStateHash);
  assert.equal(replayRun(fabricated).reproduction, 'full');
  const mutating = runSortie({ policy: { id: 'mutating', version: 1, select: ({ state, actions }) => { actions[0].crewId = 'made-up'; return actions[0]; } } });
  assert.equal(mutating.status, 'policy_error'); assert.equal(mutating.metrics.commands, 0);
  assert.equal(replayRun(mutating).reproduction, 'command-prefix-only');
  const visible = runSortie({ policy: { id: 'visible', version: 1, select: ({ state, actions }) => {
    assert.equal(state.rng, undefined); assert.equal(state.seed, undefined); assert.equal(state.story.rng, undefined);
    assert.equal(state.bags.mission.tokens, undefined); assert.equal(state.deck.cards, undefined);
    assert.ok(Object.isFrozen(state)); return actions[0];
  } }, limits: { maxCommands: 1 } });
  assert.equal(visible.status, 'runaway');
});

test('stalls from no-op and changing Bomb Run loops are explicit, reproducible and excluded from losses', () => {
  const noOp = { id: 'no-op', version: 1, select: ({ actions }) => actions.find(c => c.type === 'placeBombDie' && c.slot === 'course' && c.dieIndex === null) };
  const stalled = runSortie({ scenario: snapshot(bombState()), policy: noOp, limits: { maxUnchangedCommands: 3 } });
  assert.equal(stalled.status, 'stalled'); assert.equal(stalled.metrics.commands, 3); assert.equal(stalled.metrics.outcome, null);
  assert.equal(replayRun(stalled).reproduction, 'full');
  const changing = { id: 'changing-loop', version: 1, select: ({ state, actions }) => actions.find(c => c.type === 'placeBombDie' && c.slot === 'course' && c.dieIndex === (state.mission.bombRun.placement.course === 0 ? 1 : 0)) };
  const idle = runSortie({ scenario: snapshot(bombState()), policy: changing, limits: { maxIdleCommands: 4 } });
  assert.equal(idle.status, 'stalled'); assert.equal(idle.metrics.commands, 4); assert.equal(idle.metrics.unchangedCommands, 0);
  assert.equal(replayRun(idle).reproduction, 'full');
  const summary = summarize([stalled, idle])[0]; assert.equal(summary.lost, 0); assert.equal(summary.survivalRate, null);
});

test('command/turn bounds and absence of legal actions cannot masquerade as game losses', () => {
  for (const limits of [{ maxCommands: 2 }, { maxTurns: 1 }]) {
    const run = runSortie({ policy: first, limits });
    assert.equal(run.status, 'runaway'); assert.equal(run.metrics.aircraftSurvived, null); assert.equal(run.metrics.outcome, null);
    assert.equal(replayRun(run).reproduction, 'full');
  }
  const empty = runSortie({ adapterFactory: options => ({ ...createGameAdapter(options), legalActions: () => [] }) });
  assert.equal(empty.status, 'stalled'); assert.equal(empty.metrics.invalidOperations, 0);
});

test('initial and transition invariant failures stop execution and retain the failing trace', () => {
  const state = createGame(quiet, 'invalid-start', 'v2-continuous'); state.resources.Enlisted = -1;
  const initial = runSortie({ scenario: snapshot(state) });
  assert.equal(initial.status, 'invariant_failure'); assert.equal(initial.metrics.commands, 0);
  assert.equal(replayRun(initial).reproduction, 'full');
  const bad = runSortie({ policy: first, adapterFactory: options => {
    const real = createGameAdapter(options); let advanced = false;
    return { ...real, advance(command) { advanced = true; return real.advance(command); }, snapshot() {
      const current = real.snapshot(); if (advanced) current.resources.Officer++; return current;
    } };
  } });
  assert.equal(bad.status, 'invariant_failure'); assert.match(bad.reason, /conservation/); assert.equal(bad.trace.length, 1);
  assert.ok(bad.trace[0].hash); assert.equal(bad.metrics.outcome, null);
});

test('purposeful policy protects a sole cockpit operator and uses authoritative Bomb Run scores', () => {
  let state = createGame(quiet, 'sole-cockpit', 'v2-continuous');
  state.crew.find(c => c.id === 'copilot').health = 'dead';
  state = dispatch(state, { type: 'activate', crewId: 'pilot' }).state;
  const open = BOARD.find(cell => cell.structure && !state.crew.some(c => c.position.includes(cell.id)));
  state.cells[open.id] = 'fire';
  const actions = legalCommands(state), choice = createPolicy('purposeful').select({ state, actions });
  assert.ok(actions.includes(choice)); assert.equal(choice.action, 'wait');
  const run = runSortie({ scenario: snapshot(bombState()), policy: 'purposeful', limits: { maxCommands: 15 } });
  assert.ok(run.metrics.commandCounts.commitBombRun); assert.equal(run.metrics.invalidOperations, 0);
});

test('trace integrity, source versions and metadata guard reproduction', () => {
  const run = runSortie({ policy: first, limits: { maxCommands: 2 } });
  const altered = structuredClone(run); altered.trace[0].hash = 'different';
  assert.throws(() => replayRun(altered), /diverged/);
  const incompatible = structuredClone(run); incompatible.metadata.engineFingerprint = 'old-version';
  assert.throws(() => replayRun(incompatible), /Fingerprint differs/);
  assert.equal(replayRun(incompatible, { allowVersionDrift: true }).reproduction, 'full');
  assert.ok(run.metadata.engineFingerprint); assert.ok(run.metadata.runnerFingerprint); assert.equal(run.metadata.rulesVersion, 4);
});

test('scenario parsing fails clearly for unsupported rules/config/weather and preserves snapshot state', () => {
  assert.throws(() => resolveScenario({ weather: 'rain' }), /Unknown scenario field/);
  assert.throws(() => resolveScenario({ config: { weather: 'rain' } }), /Unknown game config/);
  assert.throws(() => resolveScenario({ ruleset: 'invented' }), /Unknown ruleset/);
  assert.throws(() => resolveScenario({ targetId: 'unknown' }), /Unknown bombing target/);
  const state = bombState(), scenario = resolveScenario(snapshot(state));
  const adapter = createGameAdapter({ scenario, seed: 'ignored' });
  assert.deepEqual(adapter.snapshot(), state); assert.equal(stateHash(adapter.snapshot()), stateHash(state));
  assert.equal(semanticState(state).startedAt, undefined);
});

test('batch ordering does not affect paired seeds and reports retain incomplete classifications and CSV escaping', async () => {
  const versions = sourceVersions(), seeds = ['paired-0', 'paired-1'], limits = { maxCommands: 2 };
  const a = runBatch({ seeds, limits, versions }), b = runBatch({ seeds: [...seeds].reverse(), policies: ['purposeful', 'random'], limits, versions });
  for (const run of a.runs) assert.deepEqual(run, b.runs.find(other => other.metadata.seed === run.metadata.seed && other.metadata.policy.id === run.metadata.policy.id));
  const directory = await mkdtemp(join(tmpdir(), 'milk-run-report-'));
  try {
    const report = await writeReports(a, directory, { validation: { pilotRuns: 4 } });
    assert.equal(report.summary.length, 2); assert.ok(report.summary.every(s => s.lost === 0 && s.incomplete === 2));
    const json = JSON.parse(await readFile(join(directory, 'results.json'), 'utf8'));
    assert.equal(json.runs.length, 4); assert.equal(json.runs[0].trace, undefined);
    const trace = JSON.parse(await readFile(join(directory, json.runs[0].tracePath), 'utf8'));
    assert.equal(replayRun(trace).reproduction, 'full');
    assert.match(await readFile(join(directory, 'comparison.html'), 'utf8'), /Incomplete/);
    assert.match(await readFile(join(directory, 'results.csv'), 'utf8'), /"runaway"/);
    assert.equal(toCsv([{ reason: 'line 1, "quoted"\nline 2', valid: true }]), '"reason","valid"\n"line 1, ""quoted""\nline 2","true"\n');
  } finally {
    assert.ok(directory.startsWith(join(tmpdir(), 'milk-run-report-')));
    await rm(directory, { recursive: true, force: true });
  }
});

test('CLI accepts batch/replay controls and rejects typos instead of silently using defaults', () => {
  assert.equal(parseArguments(['--count', '2', '--max-idle-commands', '10']).count, '2');
  assert.equal(parseArguments(['replay', 'trace.json', '--allow-version-drift']).trace, 'trace.json');
  assert.throws(() => parseArguments(['--seed']), /incomplete/); assert.throws(() => parseArguments(['--weather', 'rain']), /Unknown/);
});

test('CLI writes an incomplete pilot, exits 2 and refuses expansion; its failure trace replays with exit 0', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'milk-run-report-cli-'));
  const cli = fileURLToPath(new URL('../simulation/cli.mjs', import.meta.url));
  try {
    const processResult = spawnSync(process.execPath, [cli, '--count', '3', '--max-commands', '1', '--out', directory], { encoding: 'utf8', windowsHide: true });
    assert.equal(processResult.status, 2, processResult.stderr);
    const report = JSON.parse(await readFile(join(directory, 'results.json'), 'utf8'));
    assert.equal(report.runs.length, 4); assert.equal(report.requestedSeeds.length, 3);
    assert.equal(report.validation.expanded, false); assert.equal(report.validation.replays, 4);
    assert.ok(report.summary.every(group => group.lost === 0 && group.survivalRate === null));
    const replay = spawnSync(process.execPath, [cli, 'replay', join(directory, report.runs[0].tracePath)], { encoding: 'utf8', windowsHide: true });
    assert.equal(replay.status, 0, replay.stderr); assert.equal(JSON.parse(replay.stdout).status, 'runaway');
  } finally {
    assert.ok(directory.startsWith(join(tmpdir(), 'milk-run-report-cli-')));
    await rm(directory, { recursive: true, force: true });
  }
});
