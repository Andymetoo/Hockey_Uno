import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, CONFIG_FIELDS, normalizeConfig } from '../config.mjs';
import { createGame } from '../state.mjs';
import { DEV_PREFERENCES_KEY, SAVE_KEY, LEGACY_SAVE_KEY, loadDevPreferences, saveDevPreferences,
  resetDevPreferences, isConfigModified, loadSession, saveSession } from '../persistence.mjs';

function memoryStorage() {
  const entries = new Map([['another-prototype', 'untouched']]);
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}
const sessionFor = state => ({ version: 1, presentationVersion: 2, state, view: structuredClone(state), pending: [], log: [], current: null, speed: 'manual', presenting: false });

test('new sortie defaults include 14/5 mission, two-round work and independent 16/4/13 combat bag', () => {
  const state = createGame({}, 'new-defaults');
  assert.equal(state.rulesVersion, 3);
  assert.equal(state.config.outboundLength, 14);
  assert.equal(state.config.returnLength, 5);
  for (const key of ['medicalDuration', 'repairDuration', 'fireDuration']) assert.equal(state.config[key], 2);
  assert.deepEqual(['Hit', 'Burst', 'Miss'].map(token => state.bags.combat.tokens.filter(item => item === token).length), [16, 4, 13]);
  assert.equal(state.bags.combat.tokens.length, 33);
  assert.equal(state.config.disruptOnHit, true);
  assert.equal(state.config.opportunityEnabled, true);
  assert.equal(state.config.opportunityOnKill, true);
  assert.equal(state.config.directFireCost, 1);
  assert.equal(state.opportunity, 1);
  assert.equal(state.stats.opportunityGained, 0);
  assert.equal(state.stats.opportunitySpent, 0);
  assert.equal(state.config.presentationSpeed, 'normal');
});

test('combat counts accept independent zero values and reject only the completely empty combat bag', () => {
  for (const [combatHit, combatBurst, combatMiss] of [[0, 4, 0], [1, 0, 0], [0, 0, 9]]) {
    const config = normalizeConfig({ combatHit, combatBurst, combatMiss });
    assert.deepEqual([config.combatHit, config.combatBurst, config.combatMiss], [combatHit, combatBurst, combatMiss]);
    assert.equal(createGame(config).bags.combat.tokens.length, combatHit + combatBurst + combatMiss);
  }
  const empty = { combatHit: 0, combatBurst: 0, combatMiss: 0 };
  assert.throws(() => normalizeConfig(empty), /at least one Hit, Burst, or Miss token/);
  assert.throws(() => createGame(empty), RangeError);
  assert.deepEqual(empty, { combatHit: 0, combatBurst: 0, combatMiss: 0 }, 'validation never silently fills a user-selected zero');
});

test('Opportunity starting amount respects enable toggle and cap without rewriting the preference', () => {
  const limited = createGame({ startingOpportunity: 5, opportunityCap: 2 });
  assert.equal(limited.opportunity, 2);
  assert.equal(limited.config.startingOpportunity, 5);
  assert.equal(createGame({ opportunityEnabled: false, startingOpportunity: 5 }).opportunity, 0);
  assert.equal(createGame({ opportunityCap: 0 }).opportunity, 0);
  assert.equal(normalizeConfig({ orderShotCost: 2 }).directFireCost, 2, 'old imported cost uses the new name');
  assert.equal('orderShotCost' in normalizeConfig({ orderShotCost: 2 }), false);
  assert.ok(CONFIG_FIELDS.some(field => field.key === 'combatBurst' && field.min === 0));
  assert.ok(CONFIG_FIELDS.find(field => field.key === 'presentationSpeed').options.some(option => option.value === 'manual'));
});

test('dev preferences persist only explicit differences and restore a fresh normalized config', () => {
  const storage = memoryStorage();
  const config = normalizeConfig({ combatHit: 0, combatBurst: 2, combatMiss: 7, presentationSpeed: 'fast', fireDuration: 3 });
  assert.equal(saveDevPreferences({ ...config, seed: 'not-a-rule', irrelevant: true }, storage), true);
  assert.deepEqual(JSON.parse(storage.getItem(DEV_PREFERENCES_KEY)), { version: 1, overrides: {
    combatHit: 0, combatBurst: 2, combatMiss: 7, fireDuration: 3, presentationSpeed: 'fast',
  } });
  assert.deepEqual(loadDevPreferences(storage), config);
  const loaded = loadDevPreferences(storage); loaded.combatHit = 99;
  assert.equal(loadDevPreferences(storage).combatHit, 0, 'editing a form cannot mutate the persisted object');
  assert.equal(storage.getItem('another-prototype'), 'untouched');
  assert.equal(isConfigModified(config), true);
  assert.equal(isConfigModified(DEFAULT_CONFIG), false);
  assert.equal(isConfigModified({}), false);
});

test('combat dev controls persist independently and reset to canonical combat defaults', () => {
  const storage = memoryStorage();
  const values = { disruptOnHit: false, opportunityEnabled: false, startingOpportunity: 2, opportunityCap: 5,
    opportunityOnKill: false, combatHit: 7, combatBurst: 0, combatMiss: 11 };
  assert.equal(saveDevPreferences(values, storage), true);
  assert.deepEqual(Object.fromEntries(Object.keys(values).map(key => [key, loadDevPreferences(storage)[key]])), values);
  assert.equal(resetDevPreferences(storage), true);
  const defaults = loadDevPreferences(storage);
  assert.equal(defaults.disruptOnHit, true); assert.equal(defaults.opportunityEnabled, true);
  assert.equal(defaults.startingOpportunity, 1); assert.equal(defaults.opportunityCap, 3);
  assert.equal(defaults.opportunityOnKill, true);
  assert.deepEqual([defaults.combatHit, defaults.combatBurst, defaults.combatMiss], [16, 4, 13]);
});

test('resetting preferences restores current defaults while preserving the active sortie and other games', () => {
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, 'active sortie stays byte-for-byte unchanged');
  storage.setItem(LEGACY_SAVE_KEY, 'old board archive');
  saveDevPreferences({ returnLength: 2, presentationSpeed: 'manual' }, storage);
  assert.equal(resetDevPreferences(storage), true);
  assert.equal(storage.getItem(DEV_PREFERENCES_KEY), null);
  assert.deepEqual(loadDevPreferences(storage), DEFAULT_CONFIG);
  assert.equal(storage.getItem(SAVE_KEY), 'active sortie stays byte-for-byte unchanged');
  assert.equal(storage.getItem(LEGACY_SAVE_KEY), 'old board archive');
  assert.equal(storage.getItem('another-prototype'), 'untouched');
});

test('invalid or unavailable preference storage is recoverable and a failed save keeps prior preferences', () => {
  const storage = memoryStorage();
  saveDevPreferences({ presentationSpeed: 'manual' }, storage);
  const before = storage.getItem(DEV_PREFERENCES_KEY);
  assert.equal(saveDevPreferences({ combatHit: 0, combatBurst: 0, combatMiss: 0 }, storage), false);
  assert.equal(storage.getItem(DEV_PREFERENCES_KEY), before);
  for (const corrupt of ['not json', 'null', '{}', '{"version":1,"overrides":[]}', '{"version":2,"overrides":{}}', '{"version":1,"overrides":{"combatHit":0,"combatBurst":0,"combatMiss":0}}']) {
    storage.setItem(DEV_PREFERENCES_KEY, corrupt);
    assert.deepEqual(loadDevPreferences(storage), DEFAULT_CONFIG);
  }
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.deepEqual(loadDevPreferences(denied), DEFAULT_CONFIG);
  assert.equal(saveDevPreferences(DEFAULT_CONFIG, denied), false);
  assert.equal(resetDevPreferences(denied), false);
});

test('preferences affect new games but are never merged into an existing current-rules sortie', () => {
  const storage = memoryStorage();
  const state = createGame({ outboundLength: 8, presentationSpeed: 'manual' }, 'live-sortie');
  state.round = 3; state.opportunity = 2; state.bags.combat.tokens = ['Burst', 'Miss'];
  const session = sessionFor(state);
  saveSession(session, storage);
  saveDevPreferences({ outboundLength: 19, combatBurst: 20, startingOpportunity: 3, presentationSpeed: 'instant' }, storage);
  assert.deepEqual(loadSession(storage), session);
  const next = createGame(loadDevPreferences(storage), 'next-sortie');
  assert.equal(next.config.outboundLength, 19);
  assert.equal(next.config.combatBurst, 20);
  assert.equal(next.opportunity, 3);
  assert.equal(next.config.presentationSpeed, 'instant');
});

test('legacy rules migration preserves live bags, timing, RNG, resources and every queued snapshot', () => {
  const storage = memoryStorage();
  const legacy = createGame({ outboundLength: 9, returnLength: 3, medicalDuration: 1, repairDuration: 3, fireDuration: 1, combatHit: 20, combatBurst: 0 });
  delete legacy.rulesVersion;
  for (const key of ['combatBurst', 'disruptOnHit', 'opportunityEnabled', 'startingOpportunity', 'opportunityCap', 'opportunityOnKill', 'directFireCost', 'presentationSpeed']) delete legacy.config[key];
  legacy.config.orderShotCost = 2;
  delete legacy.opportunity;
  delete legacy.stats.opportunityGained; delete legacy.stats.opportunitySpent;
  legacy.round = 4; legacy.rng = 123456; legacy.resources = { Officer: 9, Enlisted: 2 };
  legacy.mission.position = 4;
  legacy.bags.combat = { tokens: ['Hit', 'Miss'], discard: ['Miss', 'Hit', 'Hit'] };
  legacy.bags.mission = { tokens: ['Enemy'], discard: ['Resource', 'Enemy'] };
  legacy.jobs = [{ id: 'work-1', crewId: 'engineer', kind: 'repair', cells: ['B2-4'], completeRound: 7 }];
  legacy.crew.find(crew => crew.id === 'engineer').job = 'work-1';
  const session = sessionFor(legacy);
  session.view.resources.Officer = 8;
  session.pending = [{ type: 'RESOURCE_GAINED', rank: 'Officer', amount: 1, state: structuredClone(legacy) }];
  session.log = [{ type: 'MISSION_TOKEN_DRAWN', token: 'Resource', sequence: 1, round: 4 }];
  session.presenting = true;
  saveSession(session, storage);
  saveDevPreferences({ combatBurst: 90, repairDuration: 4, outboundLength: 20 }, storage);
  const originalBytes = storage.getItem(SAVE_KEY), migrated = loadSession(storage);
  assert.equal(storage.getItem(SAVE_KEY), originalBytes, 'load migration does not overwrite the stored sortie');
  const originalSnapshots = [session.state, session.view, session.pending[0].state];
  const migratedSnapshots = [migrated.state, migrated.view, migrated.pending[0].state];
  for (let i = 0; i < migratedSnapshots.length; i++) {
    const before = originalSnapshots[i], after = migratedSnapshots[i];
    assert.equal(after.rulesVersion, 3);
    assert.equal(after.config.combatBurst, 0);
    assert.equal(after.config.disruptOnHit, false);
    assert.equal(after.config.opportunityEnabled, false);
    assert.equal(after.opportunity, 0);
    assert.equal(after.config.directFireCost, 2);
    assert.equal(after.config.outboundLength, 9);
    assert.equal(after.config.returnLength, 3);
    assert.equal(after.config.repairDuration, 3);
    assert.equal(after.config.medicalDuration, 1);
    assert.equal(after.config.fireDuration, 1);
    assert.equal(after.config.presentationSpeed, 'manual');
    assert.equal(after.rng, before.rng);
    for (const key of ['bags', 'jobs', 'resources', 'crew', 'mission', 'cells', 'engines', 'fighters']) assert.deepEqual(after[key], before[key], `${key} must not be reinterpreted during migration`);
  }
  assert.deepEqual(migrated.log, session.log);
  assert.equal(migrated.speed, 'manual');
  assert.equal(migrated.presenting, true);
  assert.equal(migrated.state.stats.opportunityGained, 0);
  saveSession(migrated, storage);
  assert.deepEqual(loadSession(storage), migrated, 'migration is idempotent across the next autosave');
});

test('unsupported rules versions are rejected in either visible, resolved or queued snapshots', () => {
  const storage = memoryStorage();
  for (const location of ['state', 'view', 'pending']) {
    const state = createGame(), session = sessionFor(state);
    session.pending = [{ type: 'CREW_ACTIVATED', state: structuredClone(state) }];
    (location === 'pending' ? session.pending[0].state : session[location]).rulesVersion = 999;
    saveSession(session, storage);
    assert.equal(loadSession(storage), null);
  }
});
