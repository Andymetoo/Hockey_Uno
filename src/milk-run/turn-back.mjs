/** Campaign strategy only. Reversal changes the route, never the combat clocks. */
import { isV2 } from './rulesets.mjs';
import { finishStory } from './story.mjs';

export function emergencyReturnDistance(state) {
  // Position counts completed physical Progress, including the TARGET space.
  return Math.max(1, Math.min(state.config.v2ReturnLength, Math.floor(state.mission.position / 2)));
}

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
  state.mission.emergencyReturnLength = emergencyReturnDistance(state);
  state.mission.bombingResult = 'aborted';
  state.phase = 'select';
  state.activeCrew = null;
  finishStory(state, 'turnBack', emit);
  emit({ type: 'MISSION_ABORTED', abortProgress: state.mission.abortProgress, emergencyReturnLength: state.mission.emergencyReturnLength,
    message: `MISSION ABORTED — RETURNING HOME. Emergency route replaces the outbound flight plan: ${state.mission.emergencyReturnLength} Progress to HOME. Current aircraft, crew, fighters, damage, fires, work and supplies remain in play.` });
}
