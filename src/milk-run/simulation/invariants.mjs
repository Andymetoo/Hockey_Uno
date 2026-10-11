import { crewStateProblems } from '../crew-position.mjs';
import { assertFireOccupancy, missionTurn } from '../crew-health.mjs';
import { validateBombRunSnapshot } from '../bombing.mjs';
import { validateStorySnapshot } from '../story.mjs';
import { isV2 } from '../rulesets.mjs';

const count = (tokens, type) => tokens.filter(token => token === type).length;
export function nativeTokenTotals(state) {
  const mission = [...state.bags.mission.tokens, ...state.bags.mission.discard];
  return {
    Resource: count(mission, 'Resource') + state.resources.Officer + state.resources.Enlisted,
    Enemy: count(mission, 'Enemy'),
    Time: count(mission, 'Time') + (state.timeTokens?.length ?? 0) + (state.overflowTimeTokens?.length ?? 0),
    combat: [...state.bags.combat.tokens, ...state.bags.combat.discard].filter(token => !String(token).startsWith('Story:')).sort(),
    deck: [...state.deck.cards, ...state.deck.discard].sort(),
  };
}

/** Diagnostics only. A failed check stops the run; it never repairs the state. */
export function assertInvariants(state, initialTotals, previous) {
  assertFireOccupancy(state);
  const problems = crewStateProblems(state);
  if (problems.length) throw new Error(problems.join(' '));
  validateBombRunSnapshot(state); validateStorySnapshot(state);
  for (const [label, value] of Object.entries({ ...state.resources, opportunity: state.opportunity, position: state.mission.position, turn: missionTurn(state) })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative integer.`);
  }
  if (!Number.isFinite(state.altitude)) throw new Error('Altitude must be finite.');
  if (state.outcome && !['success', 'destroyed'].includes(state.outcome)) throw new Error(`Unknown outcome: ${state.outcome}`);
  if (Boolean(state.outcome) !== (state.phase === 'ended')) throw new Error('Outcome and ended phase disagree.');
  if (isV2(state) && (!Number.isSafeInteger(state.time) || state.time < 0 || state.time !== state.timeTokens.length)) throw new Error('V2 Time must match held physical tokens.');
  if (new Set(state.fighters.map(f => f.id)).size !== state.fighters.length || state.fighters.some(f => !Number.isInteger(f.hp) || f.hp <= 0 || f.hp > f.maxHp)) throw new Error('Invalid active fighters.');
  if (Object.values(state.cells).some(value => !['healthy', 'damaged', 'fire'].includes(value))) throw new Error('Unknown cell damage state.');
  if (initialTotals && JSON.stringify(nativeTokenTotals(state)) !== JSON.stringify(initialTotals)) throw new Error('Native physical token conservation failed.');
  if (previous && (missionTurn(state) < missionTurn(previous) || state.mission.position < previous.mission.position)) throw new Error('Mission clock moved backwards.');
  return true;
}
