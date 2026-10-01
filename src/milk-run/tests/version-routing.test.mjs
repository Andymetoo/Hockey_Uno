import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { SAVE_KEY, loadSession, saveSession } from '../persistence.mjs';

function storageFor(session) {
  const entries = new Map();
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  saveSession(session, storage);
  return storage;
}

function sessionFor(state) {
  return { version: 1, state, view: structuredClone(state),
    pending: [{ type: 'CREW_SELECTION_READY', state: structuredClone(state) }], log: [] };
}

test('V1 and V2 use separate save schema versions while preserving exact snapshots', () => {
  for (const [ruleset, rulesVersion] of [['v1', 3], ['v2-continuous', 4]]) {
    const state = createGame({}, 'schema-routing', ruleset);
    assert.equal(state.rulesVersion, rulesVersion);
    const session = sessionFor(state);
    assert.deepEqual(loadSession(storageFor(session)), session);
  }
});

test('save versions cannot cross rulesets in resolved, visible, or queued snapshots', () => {
  for (const [ruleset, incompatibleVersion] of [['v1', 4], ['v2-continuous', 3]]) {
    for (const location of ['state', 'view', 'pending']) {
      const session = sessionFor(createGame({}, 'invalid-routing', ruleset));
      const snapshot = location === 'pending' ? session.pending[0].state : session[location];
      snapshot.rulesVersion = incompatibleVersion;
      assert.equal(loadSession(storageFor(session)), null, `${ruleset} ${location} cannot use schema ${incompatibleVersion}`);
    }
  }
});

test('missing ruleset identity migrates supported historical snapshots only to V1', () => {
  const session = sessionFor(createGame({ preferredRuleset: 'v2-continuous' }, 'legacy-schema', 'v1'));
  for (const snapshot of [session.state, session.view, session.pending[0].state]) delete snapshot.ruleset;
  const storage = storageFor(session);
  const original = storage.getItem(SAVE_KEY);
  const loaded = loadSession(storage);
  for (const snapshot of [loaded.state, loaded.view, loaded.pending[0].state]) {
    assert.equal(snapshot.ruleset, 'v1');
    assert.equal(snapshot.rulesVersion, 3);
  }
  assert.equal(storage.getItem(SAVE_KEY), original, 'loading does not rewrite legacy save bytes');

  const unidentifiedV2 = sessionFor(createGame({}, 'unidentified-v2', 'v2-continuous'));
  for (const snapshot of [unidentifiedV2.state, unidentifiedV2.view, unidentifiedV2.pending[0].state]) delete snapshot.ruleset;
  assert.equal(loadSession(storageFor(unidentifiedV2)), null, 'schema 4 never infers V2 from its timers');
});
