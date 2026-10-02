/** Playtest observations only. None of these counters determine game rules. */
import { isV2 } from './rulesets.mjs';

export function createV2Telemetry() {
  return {
    version: 1, completeHistory: true, sinceTurn: 0, existingFighters: 0,
    timeTokensDrawn: 0, outboundTime: 0, returnTime: 0,
    progressCheckpoints: 0, fighterActionsCompleted: 0, engagementActionsSpent: 0,
    fightersSpawned: 0, fightersDestroyed: 0, fightersDisengaged: 0,
    jobsBegun: 0, jobsCompleted: 0, assistedJobs: 0,
    enemyPhases: 0,
  };
}

export function totalTurns(state) {
  return state.stats.turns ?? ((state.crewCycle.number - 1) * 10 + state.crewCycle.turn);
}

/** Older V2 saves remain exact on load. Observation starts on the next command;
 * never invent historical job or fighter lifetimes from remaining timers. */
export function ensureV2Telemetry(state) {
  if (!isV2(state)) return null;
  return state.telemetry ??= {
    ...createV2Telemetry(), completeHistory: false,
    sinceTurn: totalTurns(state), existingFighters: state.fighters.length,
  };
}

export function observe(state, key, amount = 1) {
  const telemetry = ensureV2Telemetry(state);
  if (telemetry) telemetry[key] = (telemetry[key] ?? 0) + amount;
}

export function v2TelemetryRows(state) {
  if (!isV2(state)) return [];
  const t = state.telemetry;
  const average = (value, denominator) => denominator ? (value / denominator).toFixed(2) : '—';
  const value = key => t?.[key] ?? 'Not recorded';
  const rows = [
    { label: 'Total Turns', value: totalTurns(state) },
    { label: 'Unavailable Crew Pressure', value: ({ full: 'Full Pressure', 'draw-only': 'Draw Only', compressed: 'Compressed Pressure' })[state.config.v2UnavailableCrewPressure ?? 'full'] },
    { label: 'Enemy phases', value: value('enemyPhases') },
    { label: 'Crew Cycles completed', value: state.crewCycle.number - 1 },
    { label: 'Time tokens drawn', value: value('timeTokensDrawn') },
    { label: 'Progress checkpoints', value: value('progressCheckpoints') },
    { label: 'Average Turns per Progress', value: average(totalTurns(state), state.mission.position) },
    { label: 'Fighters spawned', value: state.stats.fightersSpawned },
    { label: 'Average fighter actions completed', value: t ? average(t.fighterActionsCompleted, t.fightersSpawned + t.existingFighters) : 'Not recorded' },
    { label: 'Average Engagement countdown spent', value: t ? average(t.engagementActionsSpent, t.fightersSpawned + t.existingFighters) : 'Not recorded' },
    { label: 'Fighters destroyed', value: state.stats.fightersKilled },
    { label: 'Fighters disengaged naturally', value: value('fightersDisengaged') },
    { label: 'Jobs begun', value: value('jobsBegun') },
    { label: 'Jobs completed', value: value('jobsCompleted') },
    { label: 'Assisted jobs', value: value('assistedJobs') },
    { label: 'Altitude lost', value: Object.values(state.stats.altitudeLostByCause ?? {}).reduce((sum, n) => sum + n, 0) },
    { label: 'Outbound Time tokens', value: value('outboundTime') },
    { label: 'Return Time tokens', value: value('returnTime') },
  ];
  if (!t?.completeHistory) rows.unshift({ label: 'Telemetry coverage', value: t ? `New counters observed since Turn ${t.sinceTurn}; earlier history unavailable` : 'New counters unavailable for this older save' });
  return rows;
}
