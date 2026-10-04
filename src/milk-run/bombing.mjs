// V1 keeps its provisional one-die bombing attempt. V2 uses the independent
// four-die Bomb Run below; both resolve without DOM or presentation timers.
import { die } from './random.mjs';
import { CREW_DEFS } from './board.mjs';
import { specialistOperator } from './crew-position.mjs';
import { isV2 } from './rulesets.mjs';
import { storyConditions, storyFlag, addStoryFact, reconcileStory } from './story-effects.mjs';
import { BOMBRUN_SLOTS, DEFAULT_BOMBING_TARGET, getBombingTarget, validBombingTarget,
  scoreBombDie, targetOutcome, bombingOutcomeLabel } from './bombing-targets.mjs';

export { BOMBRUN_SLOTS, DEFAULT_BOMBING_TARGET, BOMBING_TARGETS, getBombingTarget,
  rangeDistance, scoreBombDie, targetOutcome, bombingOutcomeLabel } from './bombing-targets.mjs';

export function resolveBombing(state, emit) {
  emit({ type: 'BOMBING_STARTED', message: 'Target reached. Begin the provisional bombing run.' });
  const roll = die(state, 6);
  emit({ type: 'BOMBING_ROLL', roll, message: `Bombing roll: ${roll}. ${state.config.bombingMin}+ hits the target.` });
  const success = roll >= state.config.bombingMin;
  state.mission.bombed = true;
  state.mission.bombingResult = success ? 'hit' : 'miss';
  emit({ type: 'BOMBING_RESOLVED', message: success ? 'Bombs on target. Begin the return journey.' : 'Bombs missed. The bombing attempt is complete; return home.' });
}

export const BOMB_RUN_VERSION = 1;
const requireRule = (condition, message) => { if (!condition) throw new Error(message); };
const record = (emit, type, message, extra = {}) => emit({ type, message, ...extra });
const emptyPlacement = () => Object.fromEntries(BOMBRUN_SLOTS.map(slot => [slot, null]));
export const bombardierOperator = state => specialistOperator(state, 'bombardier');
const usedDice = run => BOMBRUN_SLOTS.map(slot => run.placement[slot]).filter(index => index !== null);
const unusedDie = run => usedDice(run).length === 3 ? [0, 1, 2, 3].find(index => !usedDice(run).includes(index)) : null;

export function bombRunTargetWarning(state) {
  return isV2(state) && !state.mission.bombed && !state.mission.aborted &&
    state.mission.position === state.config.v2OutboundLength - 1 && !bombardierOperator(state)
    ? 'BOMBARDIER STATION UNMANNED — NO DROP POSSIBLE AT TARGET' : '';
}

/** Start once, using the operator and target at arrival. Neither rolling nor
 * placing spends a crew action. The saved dice are never regenerated on load.
 */
export function beginBombRun(state, emit, targetId = state.mission.targetId ?? DEFAULT_BOMBING_TARGET) {
  requireRule(isV2(state) && state.phase === 'bombing' && !state.mission.bombed && !state.mission.aborted,
    'A V2 Bomb Run is available only over the outbound target before a drop or abort.');
  requireRule(!state.mission.bombRun, 'This Bomb Run has already begun.');
  const target = structuredClone(getBombingTarget(targetId));
  for (const condition of storyConditions(state)) for (const [slot, amount] of Object.entries(condition.modifiers?.bombRange ?? {})) {
    if (target.ranges[slot]) target.ranges[slot] = [Math.max(1, target.ranges[slot][0] - amount), Math.min(6, target.ranges[slot][1] + amount)];
  }
  const operator = bombardierOperator(state);
  const noDropReason = operator ? null : 'Bombardier station is not operationally manned by the healthy Bombardier or an Officer substitute.';
  state.mission.targetId = target.id;
  state.mission.bombRun = {
    version: BOMB_RUN_VERSION, target, status: operator ? 'placing' : 'no-drop',
    dice: operator ? Array.from({ length: 4 }, () => die(state, 6)) : [],
    placement: emptyPlacement(), unusedDie: null, operatorId: operator?.id ?? null,
    freeRerollAvailable: operator?.id === 'bombardier', freeRerollUsed: false,
    officerRerollsSpent: 0, slotScores: null, committedScore: null,
    outcome: operator ? null : 'no-drop', noDropReason,
    ...(storyConditions(state).length ? { storyOfficerBlocked: storyFlag(state, 'bombOfficerBlocked') } : {}),
  };
  if (!operator) {
    state.mission.bombed = true;
    state.mission.bombingResult = 'no-drop';
    state.phase = 'select';
    record(emit, 'BOMBING_NO_DROP', `NO DROP — ${noDropReason} Turning for HOME.`, { targetId: target.id, outcome: 'no-drop', reason: noDropReason });
    if (state.story) addStoryFact(state, 'target', `${target.name}: NO DROP — ${noDropReason}`, 'bombing');
    reconcileStory(state, emit);
  } else {
    record(emit, 'BOMBING_STARTED', `${target.name} — BOMB RUN. Place three of four dice into Course, Drift and Release.`, { targetId: target.id, operatorId: operator.id });
    record(emit, 'BOMB_RUN_ROLLED', `4d6: ${state.mission.bombRun.dice.join(' · ')}. ${operator.id === 'bombardier' ? 'Bombardier: one free die reroll.' : 'Officer substitute: no free reroll.'}`, {
      targetId: target.id, dice: [...state.mission.bombRun.dice], operatorId: operator.id,
    });
  }
  return state.mission.bombRun;
}

function activeBombRun(state) {
  requireRule(isV2(state) && state.phase === 'bombing' && !state.mission.bombed && !state.mission.aborted &&
    state.mission.bombRun?.status === 'placing', 'Choose dice only during an uncommitted V2 Bomb Run.');
  return state.mission.bombRun;
}

/** Selecting an already placed die swaps the two slots, leaving all three
 * occupied when possible. null clears a slot. Die indices are stable identities.
 */
export function placeBombDie(state, slot, dieIndex, emit) {
  const run = activeBombRun(state);
  requireRule(BOMBRUN_SLOTS.includes(slot), 'Choose Course, Drift or Release.');
  requireRule(dieIndex === null || Number.isInteger(dieIndex) && dieIndex >= 0 && dieIndex < 4, 'Choose one of the four Bomb Run dice.');
  const otherSlot = dieIndex === null ? null : BOMBRUN_SLOTS.find(key => key !== slot && run.placement[key] === dieIndex);
  if (otherSlot) run.placement[otherSlot] = run.placement[slot];
  run.placement[slot] = dieIndex;
  run.unusedDie = unusedDie(run);
  record(emit, 'BOMB_DIE_PLACED', dieIndex === null ? `${slot.toUpperCase()} cleared.` : `${slot.toUpperCase()}: die ${dieIndex + 1} (${run.dice[dieIndex]}). Placement remains provisional.`, { slot, dieIndex });
  return bombRunPreview(state);
}

export function rerollBombDie(state, dieIndex, source = 'auto', emit) {
  const run = activeBombRun(state);
  requireRule(Number.isInteger(dieIndex) && dieIndex >= 0 && dieIndex < 4, 'Choose one of the four Bomb Run dice.');
  requireRule(['auto', 'free', 'officer'].includes(source), 'Choose the free Bombardier reroll or one Officer resource.');
  const free = source === 'free' || source === 'auto' && run.freeRerollAvailable;
  requireRule(!free || run.freeRerollAvailable, 'The free Bombardier reroll is unavailable.');
  requireRule(free || !run.storyOfficerBlocked, 'Current target conditions prevent Officer-resource rerolls.');
  requireRule(free || state.resources.Officer >= 1, 'A die reroll needs 1 Officer resource.');
  const before = run.dice[dieIndex];
  if (free) {
    run.freeRerollAvailable = false;
    run.freeRerollUsed = true;
  } else {
    state.resources.Officer--;
    state.bags.mission.discard.push('Resource');
    state.stats.OfficerSpent = (state.stats.OfficerSpent || 0) + 1;
    run.officerRerollsSpent++;
    record(emit, 'RESOURCE_SPENT', 'Bomb Run: spent 1 Officer. Its physical Resource token enters mission discard.', { rank: 'Officer', amount: 1, purpose: 'bomb-reroll' });
  }
  run.dice[dieIndex] = die(state, 6);
  record(emit, 'BOMB_DIE_REROLLED', `${free ? 'Free Bombardier' : 'Officer resource'} reroll: die ${dieIndex + 1}, ${before} → ${run.dice[dieIndex]}. Rearrange before Commit.`,
    { dieIndex, before, roll: run.dice[dieIndex], source: free ? 'free' : 'officer' });
  return run.dice[dieIndex];
}

export function bombRunPreview(state) {
  const run = state.mission.bombRun;
  if (!run || !run.dice.length) return null;
  const slotScores = Object.fromEntries(BOMBRUN_SLOTS.map(slot => [slot,
    run.placement[slot] === null ? null : scoreBombDie(run.dice[run.placement[slot]], run.target.ranges[slot])]));
  const complete = BOMBRUN_SLOTS.every(slot => slotScores[slot] !== null);
  const total = complete ? Object.values(slotScores).reduce((sum, score) => sum + score, 0) : null;
  return { slotScores, complete, total, unusedDie: unusedDie(run), outcome: complete ? targetOutcome(total, run.target) : null };
}

export function commitBombRun(state, emit) {
  const run = activeBombRun(state);
  const preview = bombRunPreview(state);
  requireRule(preview.complete, 'Place three different dice into Course, Drift and Release before Commit.');
  run.status = 'committed';
  run.unusedDie = preview.unusedDie;
  run.slotScores = preview.slotScores;
  run.committedScore = preview.total;
  run.outcome = preview.outcome;
  state.mission.bombed = true;
  state.mission.bombingResult = run.outcome;
  state.phase = 'select';
  if (state.story) addStoryFact(state, 'target', `${run.target.name} ${state.story.conditions.some(c => c.id === 'cloud_target') ? 'bombed through the earlier cloud' : 'Bomb Run completed'} — ${bombingOutcomeLabel(run.outcome)} (${run.committedScore}/9).`, 'bombing');
  record(emit, 'BOMBING_RESOLVED', `${BOMBRUN_SLOTS.map(slot => `${slot.toUpperCase()} ${run.slotScores[slot]}/3`).join(' · ')} — TOTAL ${run.committedScore}/9 — ${bombingOutcomeLabel(run.outcome)}. Turning for HOME.`, {
    targetId: run.target.id, operatorId: run.operatorId, dice: [...run.dice], placement: { ...run.placement },
    unusedDie: run.unusedDie, slotScores: { ...run.slotScores }, score: run.committedScore, outcome: run.outcome,
  });
  reconcileStory(state, emit);
  return { ...preview };
}

/** Validation is read-only, including legacy sorties without a Bomb Run.
 * Used for authoritative, visible and queued snapshots; no migration rolls dice.
 */
export function validateBombRunSnapshot(state) {
  const run = state.mission?.bombRun;
  if (run === undefined || run === null) return true;
  if (!isV2(state) || run.version !== BOMB_RUN_VERSION || !validBombingTarget(run.target) ||
      state.mission.targetId !== run.target.id || !['placing', 'committed', 'no-drop'].includes(run.status) ||
      !Array.isArray(run.dice) || !run.placement || typeof run.freeRerollAvailable !== 'boolean' ||
      typeof run.freeRerollUsed !== 'boolean' || (run.storyOfficerBlocked !== undefined && typeof run.storyOfficerBlocked !== 'boolean') ||
      !Number.isSafeInteger(run.officerRerollsSpent) || run.officerRerollsSpent < 0) return false;
  if (!BOMBRUN_SLOTS.every(slot => run.placement[slot] === null || Number.isInteger(run.placement[slot]) && run.placement[slot] >= 0 && run.placement[slot] < 4)) return false;
  const placed = usedDice(run);
  if (new Set(placed).size !== placed.length || run.unusedDie !== unusedDie(run)) return false;
  if (run.status === 'no-drop') return run.dice.length === 0 && placed.length === 0 && run.operatorId === null &&
    !run.freeRerollAvailable && !run.freeRerollUsed && run.officerRerollsSpent === 0 && run.slotScores === null &&
    run.committedScore === null && run.outcome === 'no-drop' && typeof run.noDropReason === 'string' && !!run.noDropReason;
  if (run.dice.length !== 4 || !run.dice.every(value => Number.isInteger(value) && value >= 1 && value <= 6) ||
      !state.crew?.some(crew => crew.id === run.operatorId) ||
      !CREW_DEFS.some(crew => crew.id === run.operatorId && (crew.id === 'bombardier' || crew.rank === 'Officer')) || run.noDropReason !== null ||
      (run.operatorId === 'bombardier' ? run.freeRerollAvailable === run.freeRerollUsed : run.freeRerollAvailable || run.freeRerollUsed)) return false;
  if (run.status === 'placing') return run.slotScores === null && run.committedScore === null && run.outcome === null;
  const preview = bombRunPreview(state);
  return preview.complete && run.committedScore === preview.total && run.outcome === preview.outcome &&
    BOMBRUN_SLOTS.every(slot => run.slotScores?.[slot] === preview.slotScores[slot]);
}
