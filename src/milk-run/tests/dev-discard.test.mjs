import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../state.mjs';
import { dispatch } from '../rules.mjs';
import { ResolutionQueue } from '../queue.mjs';
import { SAVE_KEY, loadSession } from '../persistence.mjs';
import { createCampaignStore, createCampaign, prepareCampaignSortie, finalizeCampaignSortie,
  discardCampaignSortie, aircraftStatus, CAMPAIGN_STORE_KEY, exportCampaignStore, importCampaignStore } from '../campaign.mjs';
import { campaignBackup, parseCampaignBackup, discardActiveCampaignSession } from '../campaign-session.mjs';
import { campaignMarkup } from '../campaign-view.mjs';

const fresh = () => createGame({}, 'discard', 'v2-continuous');
function memory(entries = []) {
  const values = new Map(entries);
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function setup() {
  const created = createCampaign(createCampaignStore());
  const flight = prepareCampaignSortie(created.store, created.campaign.id, fresh(), { aircraftId: created.campaign.currentAircraftId });
  const session = new ResolutionQueue({ state: flight.state, dispatch }).export();
  const storage = memory([[CAMPAIGN_STORE_KEY, JSON.stringify(flight.store)], [SAVE_KEY, JSON.stringify(session)], ['preferences', 'unchanged']]);
  const discard = (confirmed = true) => discardActiveCampaignSession(flight.store, flight.assignment.campaignId, flight.assignment.sortieId, confirmed, storage);
  return { ...flight, created, session, storage, discard };
}

test('DEV discard removes only the unfinished reservation and matching autosave; aircraft and crew are available', () => {
  const f = setup(), before = structuredClone(f.store), result = f.discard(), campaign = result.store.campaigns[0];
  assert.equal(result.discarded, true); assert.equal(result.removedAutosave, true);
  assert.equal(f.storage.getItem(SAVE_KEY), null); assert.equal(loadSession(f.storage), null);
  assert.equal(campaign.activeSortie, null); assert.equal(aircraftStatus(campaign, f.assignment.aircraftId), 'available');
  assert.deepEqual(campaign.roster, f.created.campaign.roster); assert.deepEqual(campaign.crew, f.created.campaign.crew);
  assert.deepEqual(result.store, f.created.store); assert.deepEqual(f.store, before);
  assert.equal(f.storage.getItem('preferences'), 'unchanged');
  const html = campaignMarkup(result.store, fresh());
  assert.match(html, /Available/); assert.match(html, /campaign-launch-form/); assert.doesNotMatch(html, /Currently on sortie/);
});

test('discard ignores live kills, wounds, KIA, bombing, damage and abort; creates no histories or replacements', () => {
  const f = setup();
  Object.assign(f.session.state.mission, { bombed: true, bombingResult: 'destroyed', aborted: true, abortProgress: 7 });
  f.session.state.crew[0].health = 'dead'; f.session.state.crew[1].health = 'injured';
  f.session.state.stats.fightersKilled = 9; f.session.state.cells['D3-1'] = 'fire';
  f.session.log = [{ type: 'FIGHTER_DESTROYED', crewId: 'pilot' }, { type: 'CREW_KILLED', crewId: 'bombardier' }];
  f.storage.setItem(SAVE_KEY, JSON.stringify(f.session));
  const result = f.discard();
  assert.deepEqual(result.store, f.created.store, 'every career stat, identity and history remains exactly pre-flight');
});

test('discarded campaign round-trips history/portable export and can launch immediately with the same aircraft and crew', () => {
  const f = setup(), result = f.discard();
  assert.deepEqual(importCampaignStore(exportCampaignStore(result.store)), result.store);
  assert.deepEqual(parseCampaignBackup(campaignBackup(result.store, f.session)), { store: result.store, activeSession: null });
  const next = prepareCampaignSortie(result.store, f.assignment.campaignId, fresh(), { aircraftId: f.assignment.aircraftId });
  assert.notEqual(next.assignment.sortieId, f.assignment.sortieId); assert.equal(next.assignment.sortieNumber, 1);
  assert.deepEqual(next.assignment.crewIds, f.assignment.crewIds);
  assert.equal(aircraftStatus(next.store.campaigns[0], f.assignment.aircraftId), 'on-sortie');
  assert.throws(() => finalizeCampaignSortie(next.store, { ...f.state, phase: 'ended', outcome: 'success' }), /identity/);
  assert.deepEqual(parseCampaignBackup(campaignBackup(next.store, new ResolutionQueue({ state: next.state, dispatch }).export())).store, next.store);
});

test('discard requires literal confirmation, and a wrong active identity leaves all storage untouched', () => {
  const f = setup(), before = [...f.storage.values];
  for (const value of [false, undefined, 'true']) assert.throws(() => f.discard(value === undefined ? null : value), /confirm/);
  assert.throws(() => discardActiveCampaignSession(f.store, f.assignment.campaignId, 'wrong', true, f.storage), /current active/);
  assert.deepEqual([...f.storage.values], before);
});

test('no active campaign sortie is a harmless no-op without storage writes', () => {
  const f = setup(), before = [...f.storage.values];
  const result = discardActiveCampaignSession(f.created.store, f.assignment.campaignId, null, false, f.storage);
  assert.equal(result.discarded, false); assert.deepEqual([...f.storage.values], before);
});

test('finalized sorties cannot be rolled back or double finalized by discard', () => {
  const f = setup(), ended = { ...f.state, phase: 'ended', outcome: 'destroyed' };
  const finished = finalizeCampaignSortie(f.store, ended).store, before = structuredClone(finished);
  assert.throws(() => discardCampaignSortie(finished, f.assignment.campaignId, f.assignment.sortieId, true), /finalized/);
  assert.deepEqual(finished, before); assert.equal(finalizeCampaignSortie(finished, ended).finalized, false);
});

test('ended but not yet finalized autosaves cannot be discarded', () => {
  const f = setup(); f.session.state.phase = 'ended'; f.session.state.outcome = 'destroyed';
  f.storage.setItem(SAVE_KEY, JSON.stringify(f.session)); const before = [...f.storage.values];
  assert.throws(() => f.discard(), /ended sortie/); assert.deepEqual([...f.storage.values], before);
});

test('legacy active reservation can be released without resurrecting earlier losses or KIA and preserves prior history', () => {
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/campaign-v1-backup.json', import.meta.url), 'utf8'));
  const { store, activeSession } = parseCampaignBackup(legacy), campaign = store.campaigns[0], a = campaign.activeSortie;
  const storage = memory([[CAMPAIGN_STORE_KEY, JSON.stringify(legacy.store)], [SAVE_KEY, JSON.stringify(activeSession)]]);
  const result = discardActiveCampaignSession(store, a.campaignId, a.sortieId, true, storage);
  const expected = structuredClone(store); expected.campaigns[0].activeSortie = null;
  assert.deepEqual(result.store, expected); assert.equal(storage.getItem(SAVE_KEY), null);
  assert.ok(result.store.campaigns[0].crew.some(c => c.kia)); assert.ok(result.store.campaigns[0].aircraft.some(a => a.lost));
  const next = prepareCampaignSortie(result.store, a.campaignId, fresh(), { aircraftId: a.aircraftId });
  assert.deepEqual(next.assignment.crewIds, a.crewIds); assert.equal(next.store.campaigns[0].crew.length, campaign.crew.length);
  assert.deepEqual(next.store.campaigns[0].sorties, campaign.sorties);
});

test('history-only orphan reservation is safely released without an autosave', () => {
  const f = setup(); f.storage.removeItem(SAVE_KEY);
  const result = f.discard(); assert.equal(result.discarded, true); assert.equal(result.removedAutosave, false);
});

test('unrelated standalone autosave is preserved when discarding an orphan campaign reservation', () => {
  const f = setup(), raw = JSON.stringify(new ResolutionQueue({ state: fresh(), dispatch }).export());
  f.storage.setItem(SAVE_KEY, raw); assert.equal(f.discard().removedAutosave, false); assert.equal(f.storage.getItem(SAVE_KEY), raw);
});

for (const kind of ['unreadable', 'mixed-identity', 'changed-history']) test(`unsafe ${kind} discard fails without writes`, () => {
  const f = setup();
  if (kind === 'unreadable') f.storage.setItem(SAVE_KEY, '{broken');
  if (kind === 'mixed-identity') { f.session.view = structuredClone(f.state); f.session.view.campaign.crewIds.pilot = 'wrong'; f.storage.setItem(SAVE_KEY, JSON.stringify(f.session)); }
  if (kind === 'changed-history') f.storage.setItem(CAMPAIGN_STORE_KEY, JSON.stringify(f.created.store));
  const before = [...f.storage.values]; assert.throws(() => f.discard()); assert.deepEqual([...f.storage.values], before);
});

for (const key of [CAMPAIGN_STORE_KEY, SAVE_KEY]) test(`failed discard write to ${key} restores both records`, () => {
  const f = setup(), before = [...f.storage.values], method = key === SAVE_KEY ? 'removeItem' : 'setItem', original = f.storage[method];
  let failed = false;
  f.storage[method] = (...args) => { if (args[0] === key && !failed) { failed = true; throw new Error('Storage denied'); } return original(...args); };
  assert.throws(() => f.discard(), /Storage denied/); assert.deepEqual([...f.storage.values], before);
});
