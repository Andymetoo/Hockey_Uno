import { DEFAULT_CONFIG, normalizeConfig } from '../config.mjs';
import { RULESETS } from '../rulesets.mjs';
import { DEFAULT_BOMBING_TARGET, getBombingTarget } from '../bombing-targets.mjs';

export const SCENARIO_VERSION = 1;
export const SCENARIOS = Object.freeze({
  standard: { id: 'standard', ruleset: 'v2-continuous', config: {} },
  'v2-tactical': { id: 'v2-tactical', ruleset: 'v2-continuous', config: { v2StoryMode: false } },
  'v1-standard': { id: 'v1-standard', ruleset: 'v1', config: {} },
});

/** Configuration only: no replacement hazards, transitions or weather rules. */
export function resolveScenario(input = SCENARIOS.standard) {
  if (typeof input === 'string') {
    if (!SCENARIOS[input]) throw new Error(`Unknown scenario: ${input}`);
    input = SCENARIOS[input];
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Scenario must be an object.');
  for (const key of Object.keys(input)) if (!['version', 'id', 'ruleset', 'config', 'targetId', 'initialState', 'tags'].includes(key)) throw new Error(`Unknown scenario field: ${key}`);
  if (input.version !== undefined && input.version !== SCENARIO_VERSION) throw new Error('Unsupported scenario version.');
  if (input.initialState) {
    if (input.config || input.targetId || input.ruleset && input.ruleset !== input.initialState.ruleset) throw new Error('A snapshot scenario preserves its saved ruleset, config and target.');
    return { version: SCENARIO_VERSION, id: input.id ?? 'snapshot', initialState: structuredClone(input.initialState), tags: input.tags ?? [] };
  }
  const ruleset = input.ruleset ?? 'v2-continuous';
  if (!RULESETS.includes(ruleset)) throw new Error(`Unknown ruleset: ${ruleset}`);
  for (const key of Object.keys(input.config ?? {})) if (!Object.hasOwn(DEFAULT_CONFIG, key)) throw new Error(`Unknown game config field: ${key}`);
  const targetId = input.targetId ?? DEFAULT_BOMBING_TARGET;
  getBombingTarget(targetId);
  return { version: SCENARIO_VERSION, id: input.id ?? 'custom', ruleset, config: normalizeConfig(input.config), targetId, tags: input.tags ?? [] };
}
