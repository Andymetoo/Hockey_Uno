import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, CONFIG_FIELDS, ENEMY_DEFS, normalizeConfig, configScope, modifiedConfigScopes } from '../config.mjs';
import { createGame } from '../state.mjs';
import { missionLengths } from '../rulesets.mjs';
import { DEV_PREFERENCES_KEY, DEV_PREFERENCE_KEYS, SAVE_KEY, loadDevPreferences, saveDevPreferences,
  resetDevPreferencesScope, resetDevPreferences, loadSession, saveSession } from '../persistence.mjs';

function memoryStorage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}
const document = overrides => JSON.stringify({ version: 1, overrides });
const readScope = (storage, scope) => JSON.parse(storage.getItem(DEV_PREFERENCE_KEYS[scope]));

test('configuration fields identify their exact ruleset scope and fixed Cycle reason', () => {
  const v1 = ['missionEnemy', 'missionResource', 'clearFighters', 'medicalDuration', 'repairDuration', 'fireDuration', 'outboundLength', 'returnLength'];
  for (const field of CONFIG_FIELDS) {
    assert.equal(field.scope, configScope(field.key));
    assert.equal(field.scope, field.key === 'preferredRuleset' ? 'preferences' : field.key.startsWith('v2') ? 'v2' : v1.includes(field.key) ? 'v1' : 'common');
  }
  const cycle = CONFIG_FIELDS.find(field => field.key === 'v2CrewCycleTurns');
  assert.equal(cycle.min, 10); assert.equal(cycle.max, 10);
  assert.match(cycle.fixedReason, /ten crew.*one Turn/);
});

test('modified scope reporting excludes inactive rules and chooser preferences from the active sortie', () => {
  const config = normalizeConfig({ preferredRuleset: 'v2-continuous', v2RepairTime: 9 });
  assert.deepEqual(modifiedConfigScopes(config), ['v2', 'preferences']);
  assert.deepEqual(modifiedConfigScopes(config, 'v1'), []);
  assert.deepEqual(modifiedConfigScopes(config, 'v2-continuous'), ['v2']);
  config.outboundLength = 7; config.combatHit = 9;
  assert.deepEqual(modifiedConfigScopes(config, 'v1'), ['common', 'v1']);
  assert.deepEqual(modifiedConfigScopes(config, 'v2-continuous'), ['common', 'v2']);
});

test('new HP and Progress refill preferences preserve defaults and are independently editable', () => {
  assert.deepEqual(['bf109Hp', 'bf110Hp', 'fw190Hp', 'me262Hp'].map(key => DEFAULT_CONFIG[key]), [2, 2, 3, 4]);
  for (const enemy of Object.values(ENEMY_DEFS)) assert.equal(DEFAULT_CONFIG[enemy.hpKey], enemy.hp);
  const config = normalizeConfig({ bf109Hp: 6, bf110Hp: 7, fw190Hp: 8, me262Hp: 9, v2RefillAtProgress: false });
  assert.deepEqual(['bf109Hp', 'bf110Hp', 'fw190Hp', 'me262Hp'].map(key => config[key]), [6, 7, 8, 9]);
  assert.equal(DEFAULT_CONFIG.v2RefillAtProgress, true);
  assert.equal(config.v2RefillAtProgress, false);
  assert.equal(configScope('bf109Hp'), 'common');
  assert.equal(configScope('v2RefillAtProgress'), 'v2');
});

test('Common, V1, V2 and chooser preferences have independent localStorage records', () => {
  const storage = memoryStorage();
  const config = normalizeConfig({ combatHit: 9, outboundLength: 8, v2RepairTime: 9, preferredRuleset: 'v2-continuous' });
  assert.equal(saveDevPreferences(config, storage), true);
  assert.deepEqual(readScope(storage, 'common').overrides, { combatHit: 9 });
  assert.deepEqual(readScope(storage, 'v1').overrides, { outboundLength: 8 });
  assert.deepEqual(readScope(storage, 'v2').overrides, { v2RepairTime: 9 });
  assert.deepEqual(readScope(storage, 'preferences').overrides, { preferredRuleset: 'v2-continuous' });
  assert.equal(storage.getItem(DEV_PREFERENCES_KEY), null);
  assert.deepEqual(loadDevPreferences(storage), config);
});

test('a corrupt Common scope does not discard valid V1, V2 or chooser preferences', () => {
  const storage = memoryStorage();
  storage.setItem(DEV_PREFERENCE_KEYS.common, document({ combatHit: 0, combatBurst: 0, combatMiss: 0 }));
  storage.setItem(DEV_PREFERENCE_KEYS.v1, document({ outboundLength: 9 }));
  storage.setItem(DEV_PREFERENCE_KEYS.v2, document({ v2RepairTime: 8 }));
  storage.setItem(DEV_PREFERENCE_KEYS.preferences, document({ preferredRuleset: 'v2-continuous' }));
  const loaded = loadDevPreferences(storage);
  assert.deepEqual([loaded.combatHit, loaded.combatBurst, loaded.combatMiss], [16, 4, 13]);
  assert.equal(loaded.outboundLength, 9); assert.equal(loaded.v2RepairTime, 8);
  assert.equal(loaded.preferredRuleset, 'v2-continuous');
});

test('V1-only overrides do not affect V2 sortie setup or its active config projection', () => {
  const base = createGame({}, 'scope-isolation', 'v2-continuous');
  const changed = createGame({ missionEnemy: 1, missionResource: 2, clearFighters: false,
    medicalDuration: 0, repairDuration: 0, fireDuration: 0, outboundLength: 2, returnLength: 1 }, 'scope-isolation', 'v2-continuous');
  const activeConfig = state => Object.fromEntries(Object.entries(state.config).filter(([key]) => ['common', 'v2'].includes(configScope(key))));
  assert.deepEqual(activeConfig(changed), activeConfig(base));
  for (const key of ['bags', 'mission', 'crew', 'phase', 'resources', 'opportunity', 'fighters', 'crewCycle', 'time', 'timeTokens', 'pendingProgress']) assert.deepEqual(changed[key], base[key], key);
  assert.deepEqual(missionLengths(changed), { outboundLength: 8, returnLength: 3 });
});

test('V2-only overrides do not affect V1 sortie setup or its active config projection', () => {
  const base = createGame({}, 'scope-isolation', 'v1');
  const changed = createGame({ v2MissionEnemy: 0, v2MissionResource: 2, v2MissionTime: 4, v2TimePerProgress: 2,
    v2OutboundLength: 2, v2ReturnLength: 1, v2RepairTime: 3, v2FireTime: 4, v2MedicalTime: 5,
    v2AssistedRepairTime: 1, v2AssistedFireTime: 2, v2AssistedMedicalTime: 3, v2RefillAtProgress: false,
    v2Bf109Engagement: 2, v2Bf110Engagement: 3, v2Fw190Engagement: 4, v2Me262Engagement: 6,
    v2EngagementMode: 'attack-pass-only' }, 'scope-isolation', 'v1');
  const activeConfig = state => Object.fromEntries(Object.entries(state.config).filter(([key]) => ['common', 'v1'].includes(configScope(key))));
  assert.deepEqual(activeConfig(changed), activeConfig(base));
  for (const key of ['bags', 'mission', 'crew', 'phase', 'resources', 'opportunity', 'fighters']) assert.deepEqual(changed[key], base[key], key);
  assert.deepEqual(missionLengths(changed), { outboundLength: 14, returnLength: 5 });
  for (const key of ['crewCycle', 'time', 'timeTokens', 'pendingProgress']) assert.equal(key in changed, false);
});

test('legacy preferences migrate on save without altering their archive or newer unknown fields', () => {
  const storage = memoryStorage();
  const legacy = document({ combatHit: 9, outboundLength: 8, v2RepairTime: 9, preferredRuleset: 'v2-continuous', futureCommon: { enabled: true }, v2FutureClock: 17 });
  storage.setItem(DEV_PREFERENCES_KEY, legacy);
  const loaded = loadDevPreferences(storage);
  assert.equal(loaded.combatHit, 9); assert.equal(loaded.outboundLength, 8); assert.equal(loaded.v2RepairTime, 9);
  assert.equal(storage.getItem(DEV_PREFERENCE_KEYS.common), null, 'reading legacy data alone is non-mutating');
  assert.equal(saveDevPreferences(loaded, storage), true);
  assert.equal(storage.getItem(DEV_PREFERENCES_KEY), legacy);
  assert.deepEqual(readScope(storage, 'common').overrides.futureCommon, { enabled: true });
  assert.equal(readScope(storage, 'v2').overrides.v2FutureClock, 17);
  storage.setItem(DEV_PREFERENCE_KEYS.v1, JSON.stringify({ version: 1, futureMetadata: { revision: 7 }, overrides: { outboundLength: 8, futureV1Rule: 42 } }));
  assert.equal(saveDevPreferences(loadDevPreferences(storage), storage), true);
  assert.deepEqual(readScope(storage, 'v1').futureMetadata, { revision: 7 });
  assert.equal(readScope(storage, 'v1').overrides.futureV1Rule, 42);
});

test('scope resets preserve all other records and suppress legacy values without resurrection', () => {
  const storage = memoryStorage();
  const legacy = document({ combatHit: 9, outboundLength: 8, v2RepairTime: 9, preferredRuleset: 'v2-continuous' });
  storage.setItem(DEV_PREFERENCES_KEY, legacy);
  storage.setItem(SAVE_KEY, 'active sortie stays exact');
  assert.equal(resetDevPreferencesScope('v1', storage), true);
  let loaded = loadDevPreferences(storage);
  assert.equal(loaded.outboundLength, 14); assert.equal(loaded.v2RepairTime, 9); assert.equal(loaded.combatHit, 9);
  assert.equal(loaded.preferredRuleset, 'v2-continuous');
  assert.equal(storage.getItem(DEV_PREFERENCES_KEY), legacy);
  saveDevPreferences(loaded, storage);
  const common = storage.getItem(DEV_PREFERENCE_KEYS.common), v1 = storage.getItem(DEV_PREFERENCE_KEYS.v1), chooser = storage.getItem(DEV_PREFERENCE_KEYS.preferences);
  assert.equal(resetDevPreferencesScope('v2', storage), true);
  loaded = loadDevPreferences(storage);
  assert.equal(loaded.v2RepairTime, 6);
  assert.equal(storage.getItem(DEV_PREFERENCE_KEYS.common), common);
  assert.equal(storage.getItem(DEV_PREFERENCE_KEYS.v1), v1);
  assert.equal(storage.getItem(DEV_PREFERENCE_KEYS.preferences), chooser);
  assert.equal(storage.getItem(SAVE_KEY), 'active sortie stays exact');
});

test('reset all removes scoped and legacy preferences but keeps active saves and other apps', () => {
  const storage = memoryStorage();
  storage.setItem(DEV_PREFERENCES_KEY, document({ outboundLength: 8, v2RepairTime: 9 }));
  saveDevPreferences(loadDevPreferences(storage), storage);
  storage.setItem(SAVE_KEY, 'active'); storage.setItem('another-app', 'untouched');
  assert.equal(resetDevPreferences(storage), true);
  for (const key of [DEV_PREFERENCES_KEY, ...Object.values(DEV_PREFERENCE_KEYS)]) assert.equal(storage.getItem(key), null);
  assert.deepEqual(loadDevPreferences(storage), DEFAULT_CONFIG);
  assert.equal(storage.getItem(SAVE_KEY), 'active'); assert.equal(storage.getItem('another-app'), 'untouched');
});

test('newer preference documents are not overwritten and a failed scoped write rolls back prior writes', () => {
  const storage = memoryStorage();
  const future = JSON.stringify({ version: 2, overrides: { v2NewRule: 7 } });
  storage.setItem(DEV_PREFERENCE_KEYS.v2, future);
  assert.equal(saveDevPreferences(DEFAULT_CONFIG, storage), false);
  assert.equal(resetDevPreferencesScope('v2', storage), false);
  assert.equal(storage.getItem(DEV_PREFERENCE_KEYS.v2), future);
  assert.equal(storage.getItem(DEV_PREFERENCE_KEYS.common), null);
  storage.removeItem(DEV_PREFERENCE_KEYS.v2);
  saveDevPreferences({ combatHit: 10 }, storage);
  const before = Object.fromEntries(Object.values(DEV_PREFERENCE_KEYS).map(key => [key, storage.getItem(key)]));
  const failing = { ...storage, setItem(key, value) { if (key === DEV_PREFERENCE_KEYS.v2) throw new Error('quota'); storage.setItem(key, value); } };
  assert.equal(saveDevPreferences({ combatHit: 8, outboundLength: 7, v2RepairTime: 8 }, failing), false);
  for (const [key, value] of Object.entries(before)) assert.equal(storage.getItem(key), value);
});

test('V2 saves without the newly added refill preference restore exact snapshots without inserting config', () => {
  const storage = memoryStorage();
  const state = createGame({}, 'existing-v2', 'v2-continuous');
  delete state.config.v2RefillAtProgress;
  for (const key of ['bf109Hp', 'bf110Hp', 'fw190Hp', 'me262Hp']) delete state.config[key];
  state.time = 2; state.timeTokens = ['Time', 'Time'];
  const session = { version: 1, state, view: structuredClone(state), pending: [{ type: 'TIME_GAINED', state: structuredClone(state) }], log: [] };
  saveSession(session, storage);
  assert.deepEqual(loadSession(storage), session);
  assert.equal('v2RefillAtProgress' in loadSession(storage).state.config, false);
});
