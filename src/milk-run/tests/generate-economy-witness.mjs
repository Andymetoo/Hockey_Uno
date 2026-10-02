/** Bounded deterministic witness search. This is a legal greedy player, not a balance test.
 * Run: node src/milk-run/tests/generate-economy-witness.mjs [firstSeed=0] [attempts=100]
 * No RNG peeking, rule overrides or state mutations: all changes use dispatch.
 */
import { writeFile } from 'node:fs/promises';
import { createGame } from '../state.mjs';
import { DEFAULT_CONFIG } from '../config.mjs';
import { BOARD, CREW_DEFS, STATIONS, neighbors } from '../board.mjs';
import { dispatch, availableCrew, availableActions, legalTargets, isAtStation, eligibleCrisisTargets,
  crisisTargetCap, legalWorkPositions, opportunityAvailability, conversionOptions } from '../rules.mjs';

const definition = id => CREW_DEFS.find(crew => crew.id === id);
const priority = fighter => (fighter.facing === 0 && !fighter.disrupted ? 40 : 0) + (fighter.hp === 1 ? 35 : 10 / fighter.hp);
const rankedTargets = (state, crewId) => legalTargets(state, crewId).sort((a, b) => priority(b) - priority(a));
const controlling = state => state.crew.filter(crew => ['pilot', 'copilot'].includes(crew.station) && isAtStation(state, crew));

function workChoice(state, crewId, action) {
  const eligible = eligibleCrisisTargets(state, action), ids = new Set(eligible.map(cell => cell.id));
  const cap = crisisTargetCap(state, crewId, action);
  const choices = [];
  for (const primary of eligible) {
    const positions = legalWorkPositions(state, crewId, [primary.id]);
    if (!positions.length) continue;
    const cells = [primary.id];
    for (let index = 0; index < cells.length && cells.length < cap; index++) {
      for (const neighbor of neighbors(cells[index], state.config.eightWayWork)) {
        if (ids.has(neighbor.id) && !cells.includes(neighbor.id) && cells.length < cap) cells.push(neighbor.id);
      }
    }
    const extra = cells.reduce((score, id) => {
      const cell = BOARD.find(cell => cell.id === id);
      return score + (state.compromised.includes(cell.section) ? 9 : 0) + (cell.engine && !state.engines.find(engine => engine.id === cell.engine).running ? 6 : 0)
        + (state.crew.some(crew => crew.health !== 'dead' && STATIONS[crew.station]?.cells.includes(id)) ? 3 : 0);
    }, 0);
    // Prefer sharing a healthy interior space over a damaged position that could burn.
    positions.sort((a, b) => Number(state.cells[a.id] !== 'healthy') - Number(state.cells[b.id] !== 'healthy'));
    choices.push({ command: { type: 'action', action, cells, workCellId: positions[0].id }, score: (action === 'fireControl' ? 58 : 18) + cells.length * 7 + extra });
  }
  return choices.sort((a, b) => b.score - a.score)[0];
}

function actionChoice(state, crewId) {
  const crew = state.crew.find(crew => crew.id === crewId), choices = [];
  const allowed = new Set(availableActions(state, crewId).filter(action => action.enabled).map(action => action.id));
  const add = (action, score, extra = {}) => allowed.has(action) && choices.push({ command: { type: 'action', action, ...extra }, score });
  const target = rankedTargets(state, crewId)[0];
  if (target) {
    add('basicFire', 52 + priority(target), { targetId: target.id });
    add('advancedFire', 56 + priority(target) + (target.hp > 1 ? 12 : -8), { targetId: target.id });
  }
  const seats = controlling(state), solePilot = seats.length === 1 && seats[0].id === crewId;
  if (!solePilot) {
    for (const action of ['fireControl', 'repair']) {
      if (!allowed.has(action)) continue;
      const choice = workChoice(state, crewId, action);
      if (choice) {
        if (['engineer', 'ball', 'radio'].includes(crewId)) choice.score -= 20;
        if (state.jobs.length >= 3) choice.score -= 35;
        choices.push(choice);
      }
    }
    if (allowed.has('medical')) for (const target of state.crew.filter(crew => crew.health === 'injured' && !state.jobs.some(job => job.targetId === crew.id))) {
      const positions = legalWorkPositions(state, crewId, target.position);
      if (!positions.length) continue;
      const score = ({ engineer: 91, ball: 87, radio: 65, pilot: 75, copilot: 75 })[target.id] ?? 57;
      add('medical', score - (state.jobs.length >= 3 ? 30 : 0), { targetId: target.id, workCellId: positions[0].id });
    }
  }
  if (allowed.has('manCockpit') && !seats.length) for (const stationId of ['pilot', 'copilot']) {
    if (STATIONS[stationId].cells.every(id => state.cells[id] !== 'fire') && !state.crew.some(other => other.id !== crewId && other.health !== 'dead' && other.position.some(id => STATIONS[stationId].cells.includes(id)))) {
      add('manCockpit', definition(crewId).rank === 'Officer' ? 150 : 110, { stationId });
    }
  }
  const stopped = state.engines.filter(engine => !engine.running);
  const engine = stopped.find(engine => BOARD.filter(cell => cell.engine === engine.id).every(cell => state.cells[cell.id] === 'healthy'));
  if (engine) add('restartEngine', stopped.length >= 2 ? 120 : 55, { targetId: engine.id });
  add('escort', state.slot <= 3 ? 97 : state.slot <= 6 ? 55 : 10);
  if (allowed.has('directFire')) {
    const candidate = state.crew.flatMap(gunner => rankedTargets(state, gunner.id).map(target => ({ gunner, target })))
      .find(pair => pair.gunner.id !== crewId);
    if (candidate) add('directFire', state.opportunity === 0 ? 70 : 40, { gunnerId: candidate.gunner.id, targetId: candidate.target.id });
  }
  const exchange = conversionOptions(state).find(option => option.to === 'Enlisted' && option.enabled);
  if (exchange) add('convert', state.resources.Enlisted < 3 ? 105 : state.resources.Enlisted < 6 ? 62 : 8, { to: 'Enlisted' });
  const threat = state.fighters.filter(fighter => fighter.facing < 180 && !fighter.disrupted).sort((a, b) => priority(b) - priority(a))[0];
  if (threat) add('rotateFighter', 25 + priority(threat), { targetId: threat.id });
  add('wait', 0);
  return choices.sort((a, b) => b.score - a.score)[0];
}

function opportunityChoice(state) {
  const opportunity = opportunityAvailability(state);
  if (!opportunity.enabled) return null;
  const choices = opportunity.gunners.flatMap(crew => rankedTargets(state, crew.id).map(target => ({ gunnerId: crew.id, target, score: priority(target) })));
  const best = choices.sort((a, b) => b.score - a.score)[0];
  if (!best || best.score < 20 && state.opportunity < state.config.opportunityCap) return null;
  return { type: 'opportunityShot', gunnerId: best.gunnerId, targetId: best.target.id };
}

function commandFor(state) {
  if (state.phase === 'ready') return { type: 'startRound' };
  if (state.phase === 'bombing') return { type: 'bomb' };
  const shot = opportunityChoice(state); if (shot) return shot;
  if (state.phase === 'opportunity') return { type: 'continueEnemyPhase' };
  if (state.phase === 'roundEnd') return { type: 'endRound' };
  if (state.phase === 'action') return actionChoice(state, state.activeCrew).command;
  if (state.phase === 'select') {
    const choice = availableCrew(state).map(crew => {
      const proposed = actionChoice(state, crew.id);
      // Complete broad turrets early so later Opportunity windows can use them.
      const readyBonus = !state.fighters.length ? ({ engineer: 36, ball: 30, radio: 16 })[crew.id] ?? 0 : 0;
      return { id: crew.id, score: proposed.score + readyBonus };
    }).sort((a, b) => b.score - a.score)[0];
    return { type: 'activate', crewId: choice.id };
  }
  throw new Error(`Unexpected phase ${state.phase}`);
}

const first = Number(process.argv[2] || 0), attempts = Number(process.argv[3] || 100);
let best = 0;
for (let index = first; index < first + attempts; index++) {
  const seed = `combat-economy-${index}`;
  let state = createGame({}, seed);
  const commands = [], events = {}, combatPulls = { Hit: 0, Burst: 0, Miss: 0 };
  while (state.phase !== 'ended' && commands.length < 1400) {
    const command = commandFor(state), result = dispatch(state, command);
    commands.push(command);
    for (const event of result.events) {
      events[event.type] = (events[event.type] || 0) + 1;
      if (event.type === 'GUNNER_SHOT_ROLL') combatPulls[event.token]++;
    }
    state = result.state;
  }
  best = Math.max(best, state.mission.position);
  const witnessedActions = new Set(commands.map(command => command.action).filter(Boolean));
  const requiredActions = ['directFire', 'advancedFire', 'convert', 'repair', 'fireControl', 'medical', 'restartEngine'];
  // A HOME result alone is insufficient: the regression fixture promises all
  // these combat/economy/crisis interactions under the current damage rules.
  if (state.outcome === 'success' && requiredActions.every(action => witnessedActions.has(action))) {
    const witness = { seed, note: 'Successful deterministic legal-command witness under exact current defaults; not a balance or win-rate claim.', config: { ...DEFAULT_CONFIG }, commands,
      metrics: { outcome: state.outcome, round: state.round, position: state.mission.position, altitude: state.altitude, bombingResult: state.mission.bombingResult, rng: state.rng, opportunity: state.opportunity, livingCrew: state.crew.filter(crew => crew.health !== 'dead').length, stats: state.stats, combatPulls, eventCounts: events } };
    const destination = new URL('./fixtures/combat-economy-home-witness.json', import.meta.url);
    await writeFile(destination, `${JSON.stringify(witness, null, 2)}\n`);
    console.log(JSON.stringify({ found: seed, commands: commands.length, metrics: witness.metrics }));
    process.exit(0);
  }
  if ((index - first + 1) % 10 === 0) console.log(JSON.stringify({ attempted: index - first + 1, bestPosition: best, lastPosition: state.mission.position, lastSeed: seed }));
}
console.log(JSON.stringify({ found: false, attempts, bestPosition: best }));
process.exitCode = 1;
