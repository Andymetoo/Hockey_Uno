import { random, seedToInt } from '../random.mjs';
import { scoreBombDie, BOMBRUN_SLOTS } from '../bombing-targets.mjs';
import { CREW_DEFS, getCell } from '../board.mjs';
import { legalTargets, isAtStation } from '../rules.mjs';

export const POLICY_IDS = Object.freeze(['random', 'purposeful']);
export function policyRandom(seed) {
  const stream = { rng: seedToInt(seed) };
  return () => random(stream);
}

function bombPlan(run) {
  let best;
  for (let c = 0; c < 4; c++) for (let d = 0; d < 4; d++) for (let r = 0; r < 4; r++) {
    if (new Set([c, d, r]).size !== 3) continue;
    const indices = [c, d, r];
    const score = BOMBRUN_SLOTS.reduce((sum, slot, i) => sum + scoreBombDie(run.dice[indices[i]], run.target.ranges[slot]), 0);
    if (!best || score > best.score) best = { score, placement: Object.fromEntries(BOMBRUN_SLOTS.map((slot, i) => [slot, indices[i]])) };
  }
  return best;
}
const threat = fighter => fighter ? (fighter.facing === 0 && !fighter.disrupted ? 35 : 0) + 30 / fighter.hp : 0;
const definition = id => CREW_DEFS.find(crew => crew.id === id);

/** Simple visible-state priorities. Scores are player preferences, not rules.
 * Every branch returns an object from the supplied authoritative catalogue.
 */
export function createPolicy(id = 'random') {
  if (id === 'random') return { id, version: 1, select: ({ actions, random: draw }) => actions[Math.floor(draw() * actions.length)] };
  if (id !== 'purposeful') throw new Error(`Unknown policy: ${id}`);
  return { id, version: 1, select({ state, actions }) {
    if (state.phase === 'bombing' && state.mission.bombRun?.dice.length) {
      const run = state.mission.bombRun, plan = bombPlan(run);
      if (plan.score < 8 && run.freeRerollAvailable) {
        const unused = [0, 1, 2, 3].find(index => !Object.values(plan.placement).includes(index));
        const reroll = actions.find(a => a.type === 'rerollBombDie' && a.source === 'free' && a.dieIndex === unused);
        if (reroll) return reroll;
      }
      const slot = BOMBRUN_SLOTS.find(slot => run.placement[slot] !== plan.placement[slot]);
      const choice = slot ? actions.find(a => a.type === 'placeBombDie' && a.slot === slot && a.dieIndex === plan.placement[slot])
        : actions.find(a => a.type === 'commitBombRun');
      if (choice) return choice;
    }
    const cockpit = state.crew.filter(c => c.health === 'healthy' && ['pilot', 'copilot'].includes(c.station) && isAtStation(state, c));
    const active = state.crew.find(c => c.id === state.activeCrew);
    function score(command) {
      const target = state.fighters.find(f => f.id === command.targetId);
      if (command.type === 'opportunityShot') return 120 + threat(target);
      if (command.type === 'activate') {
        const crew = state.crew.find(c => c.id === command.crewId);
        const targets = legalTargets(state, crew.id);
        return targets.length ? 60 + Math.max(...targets.map(threat)) : crew.displaced ? 40 : 10;
      }
      if (command.type === 'abortWork' || command.type === 'turnBack') return -1000;
      if (command.type !== 'action') return 0;
      const solePilot = cockpit.length === 1 && cockpit[0].id === active?.id;
      const startsWork = ['repair', 'fireControl', 'medical', 'assistWork'].includes(command.action);
      if (startsWork && (solePilot || command.assistantId === cockpit[0]?.id && cockpit.length === 1)) return -900;
      const costOfAssistant = command.assistantId ? 12 : 0;
      switch (command.action) {
        case 'manCockpit': return cockpit.length ? -100 : definition(active.id).rank === 'Officer' ? 200 : 160;
        case 'manStation': return ['pilot', 'copilot'].includes(command.stationId) ? cockpit.length ? -100 : 180 : -80;
        case 'fireControl': return 105 + command.cells.length * 8 - costOfAssistant;
        case 'medical': return 85 + (['pilot', 'copilot', 'bombardier'].includes(command.targetId) ? 30 : 0) - costOfAssistant;
        case 'restartEngine': return 100;
        case 'basicFire': return 60 + threat(target);
        case 'advancedFire': return 63 + threat(target) + (target.hp > 1 ? 10 : -10);
        case 'directFire': return 50 + threat(target);
        case 'repair': return 25 + command.cells.reduce((n, id) => n + 6 + (state.compromised.includes(getCell(id).section) ? 15 : 0) + (getCell(id).engine ? 10 : 0), 0) - costOfAssistant;
        case 'assistWork': return state.jobs.length > 1 ? 45 : 20;
        case 'escort': return state.fighters.length ? 100 : 30;
        case 'convert': return command.to === 'Enlisted' && state.resources.Enlisted < 3 ? 80 : -10;
        case 'rotateFighter': return 35 + threat(target);
        case 'returnHome': case 'reclaimHome': return 55;
        case 'wait': return 0;
        case 'relocate': case 'leaveStation': return -100;
        default: return -20;
      }
    }
    let best = actions[0], bestScore = -Infinity;
    for (const action of actions) { const value = score(action); if (value > bestScore) { best = action; bestScore = value; } }
    return best;
  } };
}
