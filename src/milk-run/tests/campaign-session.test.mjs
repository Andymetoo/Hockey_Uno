import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { dispatch } from '../rules.mjs';
import { ResolutionQueue } from '../queue.mjs';
import { SAVE_KEY } from '../persistence.mjs';
import { CAMPAIGN_STORE_KEY, createCampaignStore, createCampaign, prepareCampaignSortie, finalizeCampaignSortie } from '../campaign.mjs';
import { campaignBackup, parseCampaignBackup, storeCampaignBackup } from '../campaign-session.mjs';

function setup() {
  let next = 0; const idFactory = () => `backup-${++next}`;
  const created = createCampaign(createCampaignStore(), { idFactory });
  const prepared = prepareCampaignSortie(created.store, created.campaign.id,
    createGame({ v2MissionEnemy: 0, v2MissionResource: 0, v2MissionTime: 10 }, 'backup-test', 'v2-continuous'), { aircraftId: created.campaign.currentAircraftId, idFactory });
  const queue = new ResolutionQueue({ state: prepared.state, dispatch }); queue.speed = 'manual';
  queue.send({ type: 'activate', crewId: 'engineer' });
  return { ...prepared, queue, session: queue.export() };
}
function memory(entries = []) {
  const values = new Map(entries);
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('portable campaign backup round-trips the exact active authoritative/visible state, current beat, pending snapshots and raw log', () => {
  const { store, session } = setup(); assert.ok(session.pending.length); assert.ok(session.current); assert.ok(session.log.length);
  const backup = campaignBackup(store, session), parsed = parseCampaignBackup(JSON.stringify(backup));
  const saved = JSON.parse(JSON.stringify(session)); // Optional undefined event fields are not part of the persisted JSON.
  assert.deepEqual(parsed.store, store); assert.deepEqual(parsed.activeSession, saved);
  const resumed = new ResolutionQueue({ dispatch, saved: parsed.activeSession });
  assert.equal(resumed.paused, true); assert.deepEqual(resumed.export(), saved);
});

test('standalone session and a different campaign session are excluded from campaign backups', () => {
  const { store, session } = setup();
  const standalone = new ResolutionQueue({ state: createGame(), dispatch }).export();
  assert.equal(campaignBackup(store, standalone).activeSession, null);
  const other = structuredClone(session); other.state.campaign.campaignId = 'other-campaign';
  assert.equal(campaignBackup(store, other).activeSession, null);
});

test('malformed active snapshots, mixed crew identity, mixed visible/pending campaign and future versions are rejected', () => {
  const { store, session } = setup(), original = campaignBackup(store, session);
  const changes = [
    backup => backup.version++,
    backup => backup.activeSession.state.rulesVersion = 99,
    backup => backup.activeSession.state.campaign.crewIds.pilot = 'forged-personnel',
    backup => backup.activeSession.view.campaign.sortieId = 'wrong-sortie',
    backup => backup.activeSession.pending[0].state.campaign.campaignId = 'wrong-campaign',
    backup => delete backup.activeSession.state.campaign,
  ];
  for (const change of changes) { const bad = structuredClone(original); change(bad); assert.throws(() => parseCampaignBackup(bad)); }
  assert.throws(() => parseCampaignBackup('{broken'));
  assert.deepEqual(original, campaignBackup(store, session), 'failed imports never edit input or live session');
});

test('backup import persists both independent stores without touching preferences', () => {
  const { store, session } = setup(), storage = memory([['milk-run-dev-v1-1', 'preferences']]);
  const imported = storeCampaignBackup(campaignBackup(store, session), storage);
  assert.deepEqual(JSON.parse(storage.getItem(CAMPAIGN_STORE_KEY)), imported.store);
  assert.deepEqual(JSON.parse(storage.getItem(SAVE_KEY)), imported.activeSession);
  assert.equal(storage.getItem('milk-run-dev-v1-1'), 'preferences'); assert.equal(storage.values.size, 3);
});

for (const existing of [true, false]) test(`failed second backup write restores ${existing ? 'existing' : 'absent'} campaign/session records`, () => {
  const { store, session } = setup(), entries = existing ? [[CAMPAIGN_STORE_KEY, 'previous-history'], [SAVE_KEY, 'previous-session']] : [];
  const storage = memory(entries), set = storage.setItem; let attempts = 0;
  storage.setItem = (key, value) => { if (++attempts === 2) throw new Error('Quota exceeded'); set(key, value); };
  assert.throws(() => storeCampaignBackup(campaignBackup(store, session), storage), /Quota exceeded/);
  assert.deepEqual([...storage.values], entries);
});

test('finished history backup is compact and importing/reloading the ended sortie cannot award history twice', () => {
  const { store, state } = setup(), ended = structuredClone(state);
  ended.phase = 'ended'; ended.outcome = 'success'; ended.mission.aborted = true; ended.mission.abortProgress = 0; ended.endedAt = Date.now();
  const completed = finalizeCampaignSortie(store, ended), session = new ResolutionQueue({ state: ended, dispatch }).export();
  const backup = campaignBackup(completed.store, session);
  assert.equal(backup.activeSession, null); assert.equal(backup.store.campaigns[0].sorties[0].log, undefined);
  const imported = parseCampaignBackup(JSON.stringify(backup));
  const duplicate = finalizeCampaignSortie(imported.store, ended);
  assert.equal(duplicate.finalized, false); assert.equal(duplicate.store.campaigns[0].stats.totalSorties, 1);
  assert.deepEqual(parseCampaignBackup(JSON.stringify(completed.store)), { store: completed.store, activeSession: null });
});

test('history-only import keeps an unrelated standalone autosave untouched and validates before any write', () => {
  const { store } = setup(), storage = memory([[SAVE_KEY, 'standalone-sortie']]);
  storeCampaignBackup(store, storage); assert.equal(storage.getItem(SAVE_KEY), 'standalone-sortie');
  const before = [...storage.values], broken = structuredClone(store); broken.version = 999;
  assert.throws(() => storeCampaignBackup(broken, storage)); assert.deepEqual([...storage.values], before);
});
