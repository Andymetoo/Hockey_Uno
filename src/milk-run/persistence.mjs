import { BOARD_VERSION, STATIONS } from './board.mjs';
import { DEFAULT_CONFIG, normalizeConfig, configScope } from './config.mjs';
import { RULESETS, isV2, V2_CONFIG_VERSION } from './rulesets.mjs';
import { CREW_POSITION_VERSION, migrateCrewPositions } from './crew-position.mjs';
import { validateBombRunSnapshot } from './bombing.mjs';

// Old geometry cannot safely reinterpret damage, crew positions or pending hits.
// Keep that sortie untouched rather than mixing two board definitions.
export const LEGACY_SAVE_KEY = 'milk-run-v3-session-1';
export const SAVE_KEY = 'milk-run-v3-session-2';
export const DEV_PREFERENCES_KEY = 'milk-run-v3-dev-preferences-1';
export const DEV_PREFERENCE_KEYS = Object.freeze({
  common: 'milk-run-dev-common-1', v1: 'milk-run-dev-v1-1',
  v2: 'milk-run-dev-v2-1', preferences: 'milk-run-dev-chooser-1',
});

const preferenceScopes = Object.keys(DEV_PREFERENCE_KEYS);
const knownConfigKeys = new Set(Object.keys(DEFAULT_CONFIG));
const COMPAT_V2_CONFIG_KEYS = ['v2FighterKillGrantsTime', 'v2DisruptEnabled', 'v2DisruptEffect', 'v2MaxEscorts'];
const PLAYTEST_V2_CONFIG_KEYS = ['v2NavigatorUnmannedTimePenalty', 'v2CrewCycleRefreshGrantsTime', 'v2UnavailableCrewPressure'];
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

function readPreferenceDocument(storage, key) {
  const raw = storage.getItem(key);
  let data;
  try { data = JSON.parse(raw ?? 'null'); } catch { data = null; }
  return { raw, data: isObject(data) && data.version === 1 && isObject(data.overrides) ? data : null,
    newer: isObject(data) && Number.isFinite(data.version) && data.version > 1 };
}

function readPreferenceScopes(storage) {
  const legacy = readPreferenceDocument(storage, DEV_PREFERENCES_KEY);
  return Object.fromEntries(preferenceScopes.map(scope => {
    const document = readPreferenceDocument(storage, DEV_PREFERENCE_KEYS[scope]);
    // An explicit empty scoped document is a reset, and must shadow old values.
    const source = document.raw === null ? legacy.data?.overrides ?? {} : document.data?.overrides ?? {};
    const overrides = Object.fromEntries(Object.entries(source).filter(([key]) =>
      document.raw === null ? configScope(key) === scope : !knownConfigKeys.has(key) || configScope(key) === scope));
    return [scope, { ...document, overrides }];
  }));
}

function updatePreferenceStorage(storage, changes) {
  const previous = changes.map(([key]) => [key, storage.getItem(key)]);
  try {
    for (const [key, value] of changes) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
  } catch (error) {
    // Avoid leaving a partially saved collection when one write fails.
    for (const [key, value] of previous.reverse()) {
      try {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      } catch { /* A denied store may also deny rollback. */ }
    }
    throw error;
  }
}

// Preferences describe the next sortie. They never modify an existing save.
export function loadDevPreferences(storage) {
  try {
    const scopes = readPreferenceScopes(storage ?? globalThis.localStorage);
    const config = { ...DEFAULT_CONFIG };
    for (const scope of preferenceScopes) {
      // One corrupted scope must not erase independently saved rules elsewhere.
      // Normalize with defaults first, then copy only this scope's known fields.
      let normalized;
      try { normalized = normalizeConfig(scopes[scope].overrides); }
      catch { normalized = DEFAULT_CONFIG; }
      for (const key of knownConfigKeys) if (configScope(key) === scope) config[key] = normalized[key];
    }
    return config;
  } catch { return { ...DEFAULT_CONFIG }; }
}

export function saveDevPreferences(config, storage) {
  try {
    const normalized = normalizeConfig(config);
    const target = storage ?? globalThis.localStorage;
    const scopes = readPreferenceScopes(target);
    if (preferenceScopes.some(scope => scopes[scope].newer)) return false;
    const changes = preferenceScopes.map(scope => {
      const unknown = Object.fromEntries(Object.entries(scopes[scope].overrides).filter(([key]) => !knownConfigKeys.has(key)));
      const overrides = { ...unknown, ...Object.fromEntries(Object.entries(normalized).filter(([key, value]) => configScope(key) === scope && value !== DEFAULT_CONFIG[key])) };
      return [DEV_PREFERENCE_KEYS[scope], JSON.stringify({ ...scopes[scope].data, version: 1, overrides })];
    });
    // The old document remains an untouched archive. Subsequent loads use the
    // independent scoped records; their presence also prevents reset resurrection.
    updatePreferenceStorage(target, changes);
    return true;
  } catch { return false; }
}

export function resetDevPreferencesScope(scope, storage) {
  if (scope === 'all') return resetDevPreferences(storage);
  if (scope === 'v2-continuous') scope = 'v2';
  if (!preferenceScopes.includes(scope)) return false;
  try {
    const target = storage ?? globalThis.localStorage;
    const document = readPreferenceScopes(target)[scope];
    if (document.newer) return false;
    const overrides = Object.fromEntries(Object.entries(document.overrides).filter(([key]) => !knownConfigKeys.has(key)));
    updatePreferenceStorage(target, [[DEV_PREFERENCE_KEYS[scope], JSON.stringify({ ...document.data, version: 1, overrides })]]);
    return true;
  } catch { return false; }
}

export function resetDevPreferences(storage) {
  try {
    updatePreferenceStorage(storage ?? globalThis.localStorage, [DEV_PREFERENCES_KEY, ...Object.values(DEV_PREFERENCE_KEYS)].map(key => [key, null]));
    return true;
  }
  catch { return false; }
}

export function isConfigModified(config) {
  try {
    const normalized = normalizeConfig(config);
    return Object.keys(DEFAULT_CONFIG).some(key => normalized[key] !== DEFAULT_CONFIG[key]);
  } catch { return true; }
}

// Earlier sorties retain their bag population, work schedule and mission length.
// Filling metadata must never draw a token, reseed, restart work or grant currency.
const OLD_RULE_DEFAULTS = {
  ...DEFAULT_CONFIG, combatHit: 20, combatBurst: 0, combatMiss: 13,
  medicalDuration: 1, repairDuration: 1, fireDuration: 1,
  outboundLength: 6, returnLength: 4,
  disruptOnHit: false, opportunityEnabled: false, startingOpportunity: 0,
};
function migrateSnapshot(snapshot, speed) {
  // Rules identity is a separate axis from historical V1 schema versions.
  // A missing identity always means V1, irrespective of next-sortie preferences.
  if (snapshot.ruleset === undefined) snapshot = { ...snapshot, ruleset: 'v1' };
  if (isV2(snapshot)) return snapshot;
  if (snapshot.rulesVersion === 3) return snapshot;
  if (snapshot.rulesVersion === 2) return migrateActivationCompletion(snapshot);
  const prior = snapshot.config;
  const config = {
    ...OLD_RULE_DEFAULTS, ...prior,
    combatBurst: prior.combatBurst ?? 0,
    disruptOnHit: false, opportunityEnabled: false,
    directFireCost: prior.directFireCost ?? prior.orderShotCost ?? DEFAULT_CONFIG.directFireCost,
    presentationSpeed: prior.presentationSpeed ?? (speed === 'step' ? 'manual' : speed) ?? (prior.animationMs === 0 ? 'instant' : 'normal'),
  };
  delete config.orderShotCost;
  return migrateActivationCompletion({ ...snapshot, rulesVersion: 2, config, opportunity: 0,
    stats: { ...snapshot.stats, opportunityGained: snapshot.stats?.opportunityGained ?? 0, opportunitySpent: snapshot.stats?.opportunitySpent ?? 0 } });
}

function migrateActivationCompletion(snapshot) {
  // Old saves already resolved their enemy phase. Never replay it or insert a
  // new decision into that stored sequence. The current actor is conservatively
  // incomplete until an actual new action is committed; earlier used crew qualify.
  return { ...snapshot, rulesVersion: 3, crew: snapshot.crew.map(crew => ({ ...crew,
    activationCompleted: Boolean(crew.used && crew.id !== snapshot.activeCrew),
  })) };
}

export function saveSession(session, storage) {
  try { (storage ?? globalThis.localStorage).setItem(SAVE_KEY, JSON.stringify(session)); return true; }
  catch { return false; }
}

const whole = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
function validContinuousSnapshot(snapshot) {
  // Presentation snapshots may show a timer at zero just before completion or
  // departure. Validate stored clocks, but never reconstruct or advance them.
  return snapshot.rulesVersion === 4 &&
    (snapshot.mission?.emergencyReturnLength === undefined || snapshot.mission.aborted === true && whole(snapshot.mission.abortProgress) && whole(snapshot.mission.emergencyReturnLength, 1)) &&
    validateBombRunSnapshot(snapshot) &&
    [1, V2_CONFIG_VERSION].includes(snapshot.v2ConfigVersion ?? 1) &&
    snapshot.config.v2CrewCycleTurns === 10 &&
    whole(snapshot.crewCycle?.number, 1) && whole(snapshot.crewCycle?.turn) &&
    whole(snapshot.time) && typeof snapshot.pendingProgress === 'boolean' &&
    Array.isArray(snapshot.timeTokens) && snapshot.timeTokens.every(token => token === 'Time') &&
    (snapshot.overflowTimeTokens === undefined || Array.isArray(snapshot.overflowTimeTokens) && snapshot.overflowTimeTokens.length <= 1 && snapshot.overflowTimeTokens.every(token => token === 'Time')) &&
    Array.isArray(snapshot.crew) && snapshot.crew.every(crew => typeof crew.cycleSlotConsumed === 'boolean') &&
    Array.isArray(snapshot.jobs) && snapshot.jobs.every(job => whole(job.remainingTime)) &&
    Array.isArray(snapshot.fighters) && snapshot.fighters.every(fighter => whole(fighter.engagementRemaining)) &&
    Object.keys(DEFAULT_CONFIG).filter(key => key.startsWith('v2')).every(key => {
      if (PLAYTEST_V2_CONFIG_KEYS.includes(key) && snapshot.config[key] === undefined) return true;
      if (key === 'v2NavigatorUnmannedTimePenalty') return whole(snapshot.config[key]);
      if (key === 'v2CrewCycleRefreshGrantsTime') return typeof snapshot.config[key] === 'boolean';
      if (key === 'v2UnavailableCrewPressure') return ['full', 'draw-only', 'compressed'].includes(snapshot.config[key]);
      if (COMPAT_V2_CONFIG_KEYS.includes(key) && snapshot.config[key] === undefined) return (snapshot.v2ConfigVersion ?? 1) === 1;
      if (key === 'v2RefillAtProgress') return snapshot.config[key] === undefined || typeof snapshot.config[key] === 'boolean';
      if (key === 'v2OpportunityProvokesEnemyPhase') return snapshot.config[key] === undefined || typeof snapshot.config[key] === 'boolean';
      if (key === 'v2FighterKillGrantsTime' || key === 'v2DisruptEnabled') return typeof snapshot.config[key] === 'boolean';
      if (key === 'v2MaxEscorts' && snapshot.config[key] === null) return true; // Legacy unlimited Escorts.
      if (key === 'v2EngagementMode') return ['any-action', 'attack-pass-only'].includes(snapshot.config[key]);
      if (key === 'v2DisruptEffect') return ['auto-miss', 'accuracy-penalty'].includes(snapshot.config[key]);
      return whole(snapshot.config[key], ['v2MissionEnemy', 'v2MissionResource', 'v2MaxEscorts'].includes(key) ? 0 : 1);
    });
}

function migrateV2Config(snapshot) {
  if (!isV2(snapshot)) return snapshot;
  // Schema 1's missing fields mean the rules that existed when it was saved,
  // never today's new-sortie defaults. Preserve any explicitly saved additions.
  const config = { ...snapshot.config };
  const legacy = { v2FighterKillGrantsTime: false, v2DisruptEnabled: config.disruptOnHit === true,
    v2DisruptEffect: 'auto-miss', v2MaxEscorts: null };
  for (const key of COMPAT_V2_CONFIG_KEYS) if (config[key] === undefined) config[key] = legacy[key];
  // An absent cycle reward predates its ON default; retain that flight's OFF rule.
  const playtestLegacy = { v2NavigatorUnmannedTimePenalty: 0, v2CrewCycleRefreshGrantsTime: false, v2UnavailableCrewPressure: 'full' };
  for (const key of PLAYTEST_V2_CONFIG_KEYS) if (config[key] === undefined) config[key] = playtestLegacy[key];
  return { ...snapshot, config, overflowTimeTokens: snapshot.overflowTimeTokens ?? [], v2ConfigVersion: V2_CONFIG_VERSION };
}

export function loadSession(storage) {
  try {
    const data = JSON.parse((storage ?? globalThis.localStorage).getItem(SAVE_KEY) ?? 'null');
    if (!data || data.version !== 1 || data.state?.version !== 1 || !data.view ||
      !Array.isArray(data.pending) || !Array.isArray(data.log) ||
      !Array.isArray(data.state.crew) || !data.state.config || !data.state.bags ||
      !data.state.cells || !Number.isFinite(data.state.rng) ||
      data.state.boardVersion !== BOARD_VERSION || data.view.boardVersion !== BOARD_VERSION ||
      data.pending.some(event => event.state?.boardVersion !== BOARD_VERSION)) return null;
    const snapshots = [data.state, data.view, ...data.pending.map(event => event.state)];
    if (snapshots.some(snapshot => snapshot.crewPositionVersion !== undefined && snapshot.crewPositionVersion !== CREW_POSITION_VERSION)) return null;
    if (snapshots.some(snapshot => snapshot.crewPositionVersion === CREW_POSITION_VERSION &&
      (!Array.isArray(snapshot.crew) || snapshot.crew.some(crew => !STATIONS[crew.homeStation] ||
        (crew.station !== null && !STATIONS[crew.station]) || typeof crew.displaced !== 'boolean')))) return null;
    // V2 uses a distinct schema version so older V1-only clients reject its
    // snapshots rather than applying a round lifecycle after a deployment rollback.
    if (snapshots.some(snapshot => !snapshot.config || typeof snapshot.config !== 'object' || Array.isArray(snapshot.config) ||
      (isV2(snapshot) ? snapshot.rulesVersion !== 4 :
        snapshot.rulesVersion !== undefined && ![1, 2, 3].includes(snapshot.rulesVersion)))) return null;
    const identity = snapshot => snapshot.ruleset === undefined ? 'v1' : snapshot.ruleset;
    const ruleset = identity(data.state);
    if (!RULESETS.includes(ruleset) || snapshots.some(snapshot =>
      identity(snapshot) !== ruleset ||
      isV2(snapshot) && !validContinuousSnapshot(snapshot))) return null;
    data.state = migrateCrewPositions(migrateV2Config(migrateSnapshot(data.state, data.speed)));
    data.view = migrateCrewPositions(migrateV2Config(migrateSnapshot(data.view, data.speed)));
    data.pending = data.pending.map(event => ({ ...event, state: migrateCrewPositions(migrateV2Config(migrateSnapshot(event.state, data.speed))) }));
    // Older event records omitted the mode; each sortie's stored rules are fixed.
    // Once migrated the event carries its own mode through every queue/recorder.
    if (isV2(data.state)) {
      const migrateEvent = event => event && ['FIGHTER_DISRUPTED', 'ATTACK_DISRUPTED'].includes(event.type) && !event.disruptEffect
        ? { ...event, disruptEffect: event.state?.config.v2DisruptEffect ?? data.state.config.v2DisruptEffect } : event;
      data.pending = data.pending.map(migrateEvent);
      data.log = data.log.map(migrateEvent);
      if ('current' in data) data.current = migrateEvent(data.current);
    }
    return data;
  } catch { return null; }
}

export function hasLegacyBoardSave(storage) {
  try { return Boolean((storage ?? globalThis.localStorage).getItem(LEGACY_SAVE_KEY)); }
  catch { return false; }
}
