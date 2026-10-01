/** Sortie identity is independent of the saved preference for the next sortie. */
export const RULESETS = Object.freeze(['v1', 'v2-continuous']);

export function isV2(state) {
  return state.ruleset === 'v2-continuous';
}

export function missionLengths(state) {
  return isV2(state)
    ? { outboundLength: state.config.v2OutboundLength, returnLength: state.config.v2ReturnLength }
    : { outboundLength: state.config.outboundLength, returnLength: state.config.returnLength };
}
