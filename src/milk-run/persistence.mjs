import { BOARD_VERSION } from './board.mjs';
import { DEFAULT_CONFIG, normalizeConfig } from './config.mjs';

// Old geometry cannot safely reinterpret damage, crew positions or pending hits.
// Keep that sortie untouched rather than mixing two board definitions.
export const LEGACY_SAVE_KEY = 'milk-run-v3-session-1';
export const SAVE_KEY = 'milk-run-v3-session-2';
export const DEV_PREFERENCES_KEY = 'milk-run-v3-dev-preferences-1';

// Preferences describe the next sortie. They never modify an existing save.
export function loadDevPreferences(storage) {
  try {
    const data = JSON.parse((storage ?? globalThis.localStorage).getItem(DEV_PREFERENCES_KEY) ?? 'null');
    if (!data || data.version !== 1 || !data.overrides || typeof data.overrides !== 'object' || Array.isArray(data.overrides)) return { ...DEFAULT_CONFIG };
    return normalizeConfig(data.overrides);
  } catch { return { ...DEFAULT_CONFIG }; }
}

export function saveDevPreferences(config, storage) {
  try {
    const normalized = normalizeConfig(config);
    const overrides = Object.fromEntries(Object.entries(normalized).filter(([key, value]) => value !== DEFAULT_CONFIG[key]));
    (storage ?? globalThis.localStorage).setItem(DEV_PREFERENCES_KEY, JSON.stringify({ version: 1, overrides }));
    return true;
  } catch { return false; }
}

export function resetDevPreferences(storage) {
  try { (storage ?? globalThis.localStorage).removeItem(DEV_PREFERENCES_KEY); return true; }
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
    if (snapshots.some(snapshot => !snapshot.config || typeof snapshot.config !== 'object' || Array.isArray(snapshot.config) ||
      snapshot.rulesVersion !== undefined && ![1, 2, 3].includes(snapshot.rulesVersion))) return null;
    data.state = migrateSnapshot(data.state, data.speed);
    data.view = migrateSnapshot(data.view, data.speed);
    data.pending = data.pending.map(event => ({ ...event, state: migrateSnapshot(event.state, data.speed) }));
    return data;
  } catch { return null; }
}

export function hasLegacyBoardSave(storage) {
  try { return Boolean((storage ?? globalThis.localStorage).getItem(LEGACY_SAVE_KEY)); }
  catch { return false; }
}
