/** V2 clocks and lifecycle. Shared combat, work and aircraft rules are supplied
 * by the command engine; this module never runs for a V1 sortie. */
import { refillBag } from './random.mjs';
import { missionLengths } from './rulesets.mjs';
import { observe } from './telemetry.mjs';
import { effectiveTimeThreshold } from './crew-position.mjs';
import { recordSortieEnd } from './results.mjs';
import { beginBombRun, bombRunTargetWarning } from './bombing.mjs';

const record = (emit, type, message, extra = {}) => emit({ type, message, ...extra });

export function engagementFor(state, type) {
  return state.config[{
    'BF-109': 'v2Bf109Engagement', 'BF-110': 'v2Bf110Engagement',
    'FW-190': 'v2Fw190Engagement', 'Me-262': 'v2Me262Engagement',
  }[type]];
}

export function spendEngagement(state, target, attackPass, emit) {
  if (!state.fighters.includes(target) || (!attackPass && state.config.v2EngagementMode === 'attack-pass-only')) return;
  target.engagementRemaining = Math.max(0, target.engagementRemaining - 1);
  observe(state, 'engagementActionsSpent');
  record(emit, 'ENGAGEMENT_SPENT', `${target.type}: ${target.engagementRemaining} Engagement remaining.`, { fighterId: target.id, attackPass });
  if (target.engagementRemaining === 0) {
    record(emit, 'FIGHTER_BREAKING_OFF', `${target.type} BREAKS OFF`, { fighterId: target.id, enemyType: target.type });
    state.fighters = state.fighters.filter(item => item.id !== target.id);
    observe(state, 'fightersDisengaged');
    record(emit, 'FIGHTER_DISENGAGED', `${target.type} disengages after completing its enemy action.`, { fighterId: target.id });
  }
}

export function refreshTimeRequirement(state) {
  const reached = state.time >= effectiveTimeThreshold(state);
  state.pendingProgress = state.config.v2NavigatorUnmannedTimePenalty ? reached : state.pendingProgress || reached;
}

export function gainTime(state, emit, completeJobs, { overflow = false, source = null } = {}) {
  state.overflowTimeTokens ??= [];
  if (overflow) state.overflowTimeTokens.push('Time');
  else { state.timeTokens.push('Time'); state.time++; }
  if (source) {
    const prefix = source === 'crew-cycle' ? 'CREW_CYCLE_TIME' : 'FIGHTER_KILL_TIME';
    record(emit, `${prefix}_TAKEN`, `${source === 'crew-cycle' ? 'Crew Cycle refresh' : 'B-17 gunfire'} pulls 1 Time token from the mission bag.`, { source, token: 'Time', overflow });
  }
  observe(state, 'timeTokensDrawn');
  observe(state, state.mission.bombed || state.mission.aborted ? 'returnTime' : 'outboundTime');
  const threshold = effectiveTimeThreshold(state);
  record(emit, overflow ? 'BONUS_TIME_BANKED' : 'TIME_GAINED', overflow ? 'BONUS TIME BANKED — carries into next Progress. Active work advances now.' : `TIME ${Math.min(state.time, threshold)}/${threshold}. Active work advances by one Time.`, { token: 'Time', overflow });
  for (const job of state.jobs) {
    job.remainingTime = Math.max(0, job.remainingTime - 1);
    record(emit, 'WORK_TIME_ADVANCED', `${job.kind === 'fireControl' ? 'Fire Control' : job.kind}: ${job.remainingTime} Time remaining.`, { jobId: job.id, crewId: job.crewId, ...(job.assistantId ? { assistantId: job.assistantId } : {}), kind: job.kind, remainingTime: job.remainingTime });
  }
  completeJobs(state.jobs.filter(job => job.remainingTime === 0));
  refreshTimeRequirement(state);
  if (state.pendingProgress) {
    record(emit, 'PROGRESS_PENDING', `TIME ${Math.min(state.time, effectiveTimeThreshold(state))}/${effectiveTimeThreshold(state)} — PROGRESS CHECKPOINT AFTER THIS TURN`);
  }
}

/** Fighter kills can claim a real Time token already in the mission bag. */
export function gainBonusTime(state, emit, completeJobs, source = 'fighter-kill') {
  const prefix = source === 'crew-cycle' ? 'CREW_CYCLE_TIME' : 'FIGHTER_KILL_TIME';
  const overflow = state.pendingProgress || state.time >= effectiveTimeThreshold(state);
  if (overflow && state.overflowTimeTokens?.length) {
    record(emit, `${prefix}_FULL`, 'Bonus Time is already banked; no additional Time gained.', { source });
    return false;
  }
  const index = state.bags.mission.tokens.indexOf('Time');
  if (index < 0) {
    record(emit, `${prefix}_UNAVAILABLE`, 'No Time token remains in the mission bag; no bonus Time is created.', { source });
    return false;
  }
  state.bags.mission.tokens.splice(index, 1);
  gainTime(state, emit, completeJobs, { overflow, source });
  return true;
}

export const gainFighterKillTime = (state, emit, completeJobs) => gainBonusTime(state, emit, completeJobs, 'fighter-kill');

function progressCheckpoint(state, emit, shared) {
  observe(state, 'progressCheckpoints');
  record(emit, 'PROGRESS_STARTED', 'Progress checkpoint: complete work, spread fire, then check altitude.');
  shared.completeJobs(state.jobs.filter(job => job.remainingTime === 0));
  record(emit, 'CHECKPOINT_JOBS_COMPLETED', 'All jobs reaching zero Time have completed and their workers have been released. Remaining jobs keep their Time counters.');
  shared.resolveFireSpread(state, emit);
  shared.recalculateConditions(state, emit);
  record(emit, 'AIRCRAFT_CONDITION_CHECKED', `${state.compromised.length} compromised sections; ${state.engines.filter(engine => !engine.running).length} stopped engines. Cockpit control, Structure and Engines are checked independently next.`);
  shared.resolveAltitude(state, emit);
  if (state.outcome) {
    state.phase = 'ended';
    state.endedAt = Date.now();
    recordSortieEnd(state, emit);
  } else {
    const { outboundLength, returnLength } = missionLengths(state);
    const home = outboundLength + returnLength;
    state.mission.position++;
    record(emit, 'MISSION_ADVANCED', `The B-17 advances one Progress to mission space ${state.mission.position}/${home}.`);
    if (state.mission.position >= home && (state.mission.bombed || state.mission.aborted)) {
      state.phase = 'ended';
      state.outcome = 'success';
      state.endReason = { cause: 'home' };
      state.endedAt = Date.now();
      recordSortieEnd(state, emit);
    } else if (state.mission.position >= outboundLength && !state.mission.bombed && !state.mission.aborted) {
      state.phase = 'bombing';
      record(emit, 'BOMBING_READY', 'TARGET reached. Begin the four-die Bomb Run.');
      beginBombRun(state, emit);
    }
    const warning = bombRunTargetWarning(state);
    if (warning) record(emit, 'BOMBARDIER_TARGET_WARNING', warning);
  }
  state.time = 0;
  state.pendingProgress = false;
  const returnedTime = state.timeTokens.length;
  state.bags.mission.tokens.push(...state.timeTokens.splice(0));
  // This token advanced jobs at acquisition. Transferring it never does so again.
  if (state.overflowTimeTokens?.length) {
    state.timeTokens.push(...state.overflowTimeTokens.splice(0));
    state.time = state.timeTokens.length;
    refreshTimeRequirement(state);
    record(emit, 'BONUS_TIME_CARRIED', `Banked Time carries into the next Progress: TIME ${state.time}/${effectiveTimeThreshold(state)}.`, { token: 'Time' });
  }
  const refilled = { mission: 0, combat: 0 };
  for (const name of state.config.v2RefillAtProgress === false ? [] : ['mission', 'combat']) {
    const count = refillBag(state.bags[name]);
    refilled[name] = count;
    record(emit, name === 'mission' ? 'MISSION_BAG_REFILLED' : 'COMBAT_BAG_REFILLED', `Progress checkpoint: ${name} bag receives ${count} discarded tokens. Held resources remain outside the bag.`);
  }
  record(emit, 'PROGRESS_BAGS_REFILLED', `${returnedTime} Time tokens returned. ${state.config.v2RefillAtProgress === false ? 'Normal discard refill is OFF; discards wait for emergency refill.' : `Mission discard: ${refilled.mission}; combat discard: ${refilled.combat}. Held resources remain outside the bag.`}`, { returnedTime, refilled, normalRefill: state.config.v2RefillAtProgress !== false });
  // V1's temporary escort has no round in V2: its lifetime is one checkpoint.
  if (state.escorts.length) {
    state.escorts = [];
    record(emit, 'ESCORTS_EXPIRED', 'Escorts depart at the Progress checkpoint.');
  }
  record(emit, 'PROGRESS_COMPLETED', `Progress checkpoint complete. Time reset; accumulated Time tokens returned${state.config.v2RefillAtProgress === false ? '; discards retained for emergency refill' : ' and discards refilled'}.`);
}

/** Close a between-turn shot chain without spending a Turn or an enemy phase. */
export function completeBetweenTurnProgress(state, emit, shared) {
  state.phase = 'select';
  progressCheckpoint(state, emit, shared);
  if (state.phase === 'select') record(emit, 'CREW_SELECTION_READY', 'Choose the next available crew member.');
}

function finishTurn(state, emit, shared) {
  state.activeCrew = null;
  state.phase = 'select';
  refreshTimeRequirement(state);
  const cycleCompleted = state.crew.every(crew => crew.cycleSlotConsumed) && state.crewCycle.turn + 1 >= state.config.v2CrewCycleTurns;
  if (cycleCompleted && state.config.v2CrewCycleRefreshGrantsTime && !state.outcome) gainBonusTime(state, emit, shared.completeJobs, 'crew-cycle');
  if (state.pendingProgress) progressCheckpoint(state, emit, shared);
  state.crewCycle.turn++;
  state.stats.turns = (state.stats.turns || 0) + 1;
  record(emit, 'TURN_COMPLETE', `Turn ${state.stats.turns} complete.`, { turn: state.stats.turns });
  if (state.crew.every(crew => crew.cycleSlotConsumed) && state.crewCycle.turn >= state.config.v2CrewCycleTurns) {
    state.crewCycle.number++;
    state.crewCycle.turn = 0;
    state.slot = 0;
    for (const crew of state.crew) {
      crew.cycleSlotConsumed = false;
      crew.used = false;
      crew.activationCompleted = false;
      crew.lastAction = null;
    }
    record(emit, 'CREW_CYCLE_REFRESHED', `Crew Cycle ${state.crewCycle.number}: crew slots refreshed.`);
  }
}

/** Re-evaluate availability after EVERY unavailable Turn: a Time draw can
 * release an unconsumed worker, who must get their decision before more draws. */
export function continueCycle(state, emit, shared) {
  const startingCycle = state.crewCycle.number;
  const mode = state.config.v2UnavailableCrewPressure ?? 'full';
  let deferredSlots = 0;
  while (state.phase === 'select' && !state.pendingProgress && !shared.availableCrew(state).length) {
    const crew = state.crew.find(item => !item.cycleSlotConsumed);
    if (!crew) throw new Error('A V2 Crew Cycle must refresh after its ten completed slots.');
    crew.cycleSlotConsumed = true;
    crew.used = true;
    crew.activationCompleted = false;
    state.slot++;
    record(emit, 'UNAVAILABLE_CREW_SLOT', `Crew Cycle slot ${state.slot}/${state.crew.length}: ${shared.nameOf(crew.id)} is unavailable; no crew action.`, { crewId: crew.id, pressureMode: mode });
    if (state.config.unavailableDraws) shared.missionDraw(state, crew, emit, { unavailable: true });
    else record(emit, 'UNAVAILABLE_DRAW_SKIPPED', 'Developer rule: unavailable crew skip the mission draw.');
    if (mode === 'full') shared.enemyPhase(state, emit);
    else if (mode === 'compressed') deferredSlots++;
    else record(emit, 'UNAVAILABLE_ENEMY_PHASE_SKIPPED', 'Draw Only: no ordinary fighter enemy phase for this unavailable slot.', { pressureMode: mode, crewId: crew.id });
    finishTurn(state, emit, shared);
    if (state.crewCycle.number !== startingCycle) break;
  }
  if (deferredSlots && !state.outcome) {
    record(emit, 'UNAVAILABLE_PRESSURE_COMBINED', `${deferredSlots} consecutive unavailable slots: resolve one combined fighter enemy phase.`, { pressureMode: mode, slots: deferredSlots });
    shared.enemyPhase(state, emit);
  }
  if (state.phase === 'select') record(emit, 'CREW_SELECTION_READY', shared.availableCrew(state).length ? 'Choose the next available crew member.' : 'No crew can act. Continue unavailable crew Turns.');
}

export function completeContinuousTurn(state, emit, shared) {
  const previousCycle = state.crewCycle.number;
  finishTurn(state, emit, shared);
  if (previousCycle === state.crewCycle.number || shared.availableCrew(state).length) continueCycle(state, emit, shared);
}
