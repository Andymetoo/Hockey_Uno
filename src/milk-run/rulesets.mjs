/** Sortie identity is independent of the saved preference for the next sortie. */
export const RULESETS = Object.freeze(['v1', 'v2-continuous']);
// Version 1 (unmarked saves) predates the separate V2 combat preferences.
export const V2_CONFIG_VERSION = 2;

export function isV2(state) {
  return state.ruleset === 'v2-continuous';
}

export function missionLengths(state) {
  // Already-aborted older saves retain their saved route; new decisions freeze the emergency length.
  if (isV2(state) && state.mission.aborted) return { outboundLength: state.mission.abortProgress, returnLength: state.mission.emergencyReturnLength ?? state.mission.abortProgress };
  return isV2(state)
    ? { outboundLength: state.config.v2OutboundLength, returnLength: state.config.v2ReturnLength }
    : { outboundLength: state.config.outboundLength, returnLength: state.config.returnLength };
}
