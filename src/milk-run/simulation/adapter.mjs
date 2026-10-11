import { createGame } from '../state.mjs';
import { dispatch, legalCommands } from '../rules.mjs';
import { sortieResult } from '../results.mjs';

export const ADAPTER_VERSION = 1;
export function createGameAdapter({ scenario, seed, maxLegalActions = 50000 }) {
  let state = scenario.initialState ? structuredClone(scenario.initialState) : createGame(scenario.config, seed, scenario.ruleset);
  if (!scenario.initialState) state.mission.targetId = scenario.targetId;
  return {
    snapshot: () => structuredClone(state),
    legalActions: () => legalCommands(state, { maxCommands: maxLegalActions }),
    advance(command) {
      const result = dispatch(state, command);
      state = result.state;
      return result.events;
    },
    outcome: () => sortieResult(state),
  };
}

/** Operational timestamps do not participate in game rules or reproduction. */
export function semanticState(state) {
  const { startedAt, endedAt, ...rest } = state;
  return rest;
}

/** Policies receive visible state, never future RNG or concealed bag contents. */
export function observation(state) {
  const result = structuredClone(semanticState(state));
  delete result.rng; delete result.seed;
  if (result.story) delete result.story.rng;
  result.bags = Object.fromEntries(Object.entries(result.bags).map(([key, bag]) => [key, { remaining: bag.tokens.length, discard: [...bag.discard] }]));
  result.deck = { remaining: result.deck.cards.length, discard: [...result.deck.discard] };
  return result;
}
