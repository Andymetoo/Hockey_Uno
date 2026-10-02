import { isV2, missionLengths } from './rulesets.mjs';

/** Stable, semantic end-state description shared by the HUD and recorder. */
export function sortieResult(state) {
  if (!state.outcome) return null;
  const lengths = missionLengths(state);
  const home = state.mission.homePosition ?? (lengths.outboundLength + lengths.returnLength);
  const distance = Math.max(0, home - state.mission.position);
  const aborted = Boolean(state.mission.aborted);
  const lost = state.outcome === 'destroyed';
  const cause = state.endReason?.cause ?? (lost ? (state.altitude <= 0 ? 'altitude' : 'other') : 'home');
  const reason = cause === 'structure' ? `Structural failure — ${state.endReason?.compromisedSections ?? state.compromised.length} compromised sections`
    : cause === 'altitude' ? 'Altitude lost — aircraft reached the ground'
    : lost ? state.endReason?.detail ?? 'Aircraft destroyed'
    : aborted ? 'Mission aborted — aircraft returned safely' : state.campaign ? 'Aircraft returned safely to HOME' : 'Mission completed';
  return {
    title: aborted ? `ABORTED — AIRCRAFT ${lost ? 'LOST' : 'RETURNED'}` : lost ? 'AIRCRAFT LOST' : 'RETURNED HOME',
    reason, cause, distance, distanceLabel: `${distance} ${isV2(state) ? 'Progress' : 'mission spaces'} from HOME`,
    bombingOutcome: state.mission.aborted ? 'aborted' : state.mission.bombRun?.outcome ?? state.mission.bombingResult,
    noDropReason: state.mission.bombRun?.noDropReason ?? null,
    aborted, aircraftSurvived: !lost,
  };
}

export function recordSortieEnd(state, emit) {
  const result = sortieResult(state);
  emit({ type: 'MISSION_ENDED', message: `${result.title}. ${result.reason}.${result.aircraftSurvived ? '' : ` ${result.distanceLabel}.`}${result.bombingOutcome ? ` Bombing: ${String(result.bombingOutcome).toUpperCase()}.` : ''}${result.noDropReason ? ` ${result.noDropReason}` : ''}`, outcome: state.outcome, ...result });
}
