/** Campaign strategy only. Reversal changes the route, never the combat clocks. */
import { isV2 } from './rulesets.mjs';

export function canTurnBack(state) {
  return isV2(state) && Boolean(state.campaign?.campaignId && state.campaign?.sortieId) &&
    !state.outcome && !state.mission.aborted && !state.mission.bombed &&
    state.mission.position <= state.config.v2OutboundLength &&
    (state.phase === 'bombing' || state.phase === 'select' && !state.activeCrew && !state.pendingProgress);
}

export function turnBack(state, emit, confirmed = false) {
  if (!canTurnBack(state)) throw new Error('Turn Back is available only in an outbound campaign sortie, between turns or before the bomb drop.');
  if (confirmed !== true) throw new Error('Confirm Turn Back before abandoning the mission objective.');
  state.mission.aborted = true;
  state.mission.abortProgress = state.mission.position;
  state.mission.bombingResult = 'aborted';
  state.phase = 'select';
  state.activeCrew = null;
  emit({ type: 'MISSION_ABORTED', abortProgress: state.mission.abortProgress,
    message: `MISSION ABORTED — RETURNING HOME. ${state.mission.abortProgress} Progress required to HOME. Fighters, work and supplies remain in play.` });
  if (state.mission.abortProgress === 0) {
    state.phase = 'ended';
    state.outcome = 'success';
    state.endReason = { cause: 'home', detail: 'Mission aborted at HOME before outbound travel.' };
    state.endedAt = Date.now();
    emit({ type: 'MISSION_ENDED', outcome: 'success', title: 'ABORTED — AIRCRAFT RETURNED',
      message: 'ABORTED — AIRCRAFT RETURNED. Mission aborted at HOME before outbound travel.' });
  }
}
