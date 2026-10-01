/** V2 clocks and lifecycle. Shared combat, work and aircraft rules are supplied
 * by the command engine; this module never runs for a V1 sortie. */
import { refillBag } from './random.mjs';
import { missionLengths } from './rulesets.mjs';
import { observe } from './telemetry.mjs';

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

export function gainTime(state, emit, completeJobs) {
  state.timeTokens.push('Time');
  state.time++;
  observe(state, 'timeTokensDrawn');
  observe(state, state.mission.bombed ? 'returnTime' : 'outboundTime');
  record(emit, 'TIME_GAINED', `TIME ${state.time}/${state.config.v2TimePerProgress}. Active work advances by one Time.`, { token: 'Time' });
  for (const job of state.jobs) {
    job.remainingTime = Math.max(0, job.remainingTime - 1);
    record(emit, 'WORK_TIME_ADVANCED', `${job.kind === 'fireControl' ? 'Fire Control' : job.kind}: ${job.remainingTime} Time remaining.`, { jobId: job.id, crewId: job.crewId, ...(job.assistantId ? { assistantId: job.assistantId } : {}), kind: job.kind, remainingTime: job.remainingTime });
  }
  completeJobs(state.jobs.filter(job => job.remainingTime === 0));
  if (state.time >= state.config.v2TimePerProgress) {
    state.pendingProgress = true;
    record(emit, 'PROGRESS_PENDING', `TIME ${state.time}/${state.config.v2TimePerProgress} — PROGRESS CHECKPOINT AFTER THIS TURN`);
  }
}

/** Fighter kills can claim a real Time token already in the mission bag. */
export function gainFighterKillTime(state, emit, completeJobs) {
  if (state.pendingProgress || state.time >= state.config.v2TimePerProgress) {
    record(emit, 'FIGHTER_KILL_TIME_FULL', 'Time track already full; no additional Time gained.');
    return false;
  }
  const index = state.bags.mission.tokens.indexOf('Time');
  if (index < 0) {
    record(emit, 'FIGHTER_KILL_TIME_UNAVAILABLE', 'B-17 gunfire destroyed a fighter, but no Time token remains in the mission bag.');
    return false;
  }
  state.bags.mission.tokens.splice(index, 1);
  record(emit, 'FIGHTER_KILL_TIME_TAKEN', 'B-17 gunfire pulls 1 Time token from the mission bag.');
  gainTime(state, emit, completeJobs);
  return true;
}

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
    record(emit, 'MISSION_ENDED', 'The sortie ends with the loss of the aircraft.');
  } else {
    const { outboundLength, returnLength } = missionLengths(state);
    const home = outboundLength + returnLength;
    state.mission.position++;
    record(emit, 'MISSION_ADVANCED', `The B-17 advances one Progress to mission space ${state.mission.position}/${home}.`);
    if (state.mission.position >= home && state.mission.bombed) {
      state.phase = 'ended';
      state.outcome = 'success';
      state.endedAt = Date.now();
      record(emit, 'MISSION_ENDED', 'HOME. The B-17 completes its sortie.', { outcome: 'success' });
    } else if (state.mission.position >= outboundLength && !state.mission.bombed) {
      state.phase = 'bombing';
      record(emit, 'BOMBING_READY', 'TARGET reached. Resolve the provisional bombing step.');
    }
  }
  state.time = 0;
  state.pendingProgress = false;
  const returnedTime = state.timeTokens.length;
  state.bags.mission.tokens.push(...state.timeTokens.splice(0));
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
    }
    record(emit, 'CREW_CYCLE_REFRESHED', `Crew Cycle ${state.crewCycle.number}: crew slots refreshed.`);
  }
}

/** Re-evaluate availability after EVERY unavailable Turn: a Time draw can
 * release an unconsumed worker, who must get their decision before more draws. */
export function continueCycle(state, emit, shared) {
  const startingCycle = state.crewCycle.number;
  while (state.phase === 'select' && !shared.availableCrew(state).length) {
    const crew = state.crew.find(item => !item.cycleSlotConsumed);
    if (!crew) throw new Error('A V2 Crew Cycle must refresh after its ten completed slots.');
    crew.cycleSlotConsumed = true;
    crew.used = true;
    crew.activationCompleted = false;
    state.slot++;
    record(emit, 'UNAVAILABLE_CREW_SLOT', `Crew Cycle slot ${state.slot}/${state.crew.length}: ${shared.nameOf(crew.id)} is unavailable; no crew action.`, { crewId: crew.id });
    if (state.config.unavailableDraws) shared.missionDraw(state, crew, emit, { unavailable: true });
    else record(emit, 'UNAVAILABLE_DRAW_SKIPPED', 'Developer rule: unavailable crew skip the mission draw.');
    shared.enemyPhase(state, emit);
    finishTurn(state, emit, shared);
    if (state.crewCycle.number !== startingCycle) break;
  }
  if (state.phase === 'select') record(emit, 'CREW_SELECTION_READY', shared.availableCrew(state).length ? 'Choose the next available crew member.' : 'No crew can act. Continue unavailable crew Turns.');
}

export function completeContinuousTurn(state, emit, shared) {
  const previousCycle = state.crewCycle.number;
  finishTurn(state, emit, shared);
  if (previousCycle === state.crewCycle.number || shared.availableCrew(state).length) continueCycle(state, emit, shared);
}
