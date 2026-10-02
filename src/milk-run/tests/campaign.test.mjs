import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { CAMPAIGN_STORE_KEY, createCampaignStore, createCampaign, commissionAircraft, selectCampaign, renameCampaign, renameAircraft, renameCrew,
  prepareCampaignSortie, finalizeCampaignSortie, validateCampaignStore, loadCampaignStore, saveCampaignStore, exportCampaignStore, importCampaignStore } from '../campaign.mjs';

const now = Date.parse('2026-10-02T18:00:00Z');
const ids = () => { let next = 0; return () => `identity-${++next}`; };
const fresh = () => createGame({}, 'history-regression', 'v2-continuous');
function setup() {
  const idFactory = ids();
  const created = createCampaign(createCampaignStore(), { name: '303rd Test Group', now, idFactory });
  const prepared = prepareCampaignSortie(created.store, created.campaign.id, fresh(), { aircraftId: created.campaign.currentAircraftId, now, idFactory });
  return { ...prepared, campaignId: created.campaign.id, idFactory };
}
function ended(state, changes = {}) {
  const result = structuredClone(state);
  Object.assign(result, { phase: 'ended', outcome: 'success', endedAt: now + 1000, ...changes });
  result.mission.position = 11;
  result.mission.bombRun = { version: 1, target: { id: 'bremen', name: 'Bremen', ranges: {}, thresholds: {} }, status: 'committed',
    dice: [3, 4, 5, 1], placement: { course: 0, drift: 1, release: 2 }, unusedDie: 3, committedScore: 9,
    slotScores: { course: 3, drift: 3, release: 3 }, outcome: 'destroyed', officerRerollsSpent: 1, freeRerollUsed: true };
  result.mission.bombed = true;
  return result;
}
const memory = () => {
  const map = new Map();
  return { map, getItem: key => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
};

test('campaign creation supplies one stable aircraft and ten editable personnel identities without beginning a sortie', () => {
  const original = createCampaignStore(), result = createCampaign(original, { now, idFactory: ids() });
  assert.equal(original.campaigns.length, 0);
  assert.equal(result.store.activeCampaignId, result.campaign.id);
  assert.equal(result.campaign.aircraft.length, 1); assert.equal(result.campaign.crew.length, 10);
  assert.equal(new Set([result.campaign.id, ...result.campaign.aircraft.map(item => item.id), ...result.campaign.crew.map(item => item.id)]).size, 12);
  assert.equal(result.campaign.stats.totalSorties, 0);
  assert.ok(result.campaign.crew.every(member => !member.replacement && member.missionsFlown === 0));
  assert.equal(validateCampaignStore(result.store), true);
});

test('aircraft, serial, campaign and crew names are editable while persistent IDs and prior stores remain unchanged', () => {
  const { store, campaignId } = setup(), c = store.campaigns[0], plane = c.aircraft[0], member = c.crew[0];
  let renamed = renameCampaign(store, campaignId, 'Cloud Nine');
  renamed = renameAircraft(renamed, campaignId, plane.id, 'Lucky Penny', '42-12345');
  renamed = renameCrew(renamed, campaignId, member.id, 'A. Rivers');
  assert.equal(renamed.campaigns[0].name, 'Cloud Nine');
  assert.equal(renamed.campaigns[0].aircraft[0].name, 'Lucky Penny'); assert.equal(renamed.campaigns[0].aircraft[0].serial, '42-12345');
  assert.equal(renamed.campaigns[0].crew[0].name, 'A. Rivers');
  assert.equal(renamed.campaigns[0].crew[0].id, member.id); assert.equal(plane.name, 'Milk Run');
  assert.throws(() => renameCrew(store, campaignId, member.id, '  '));
  assert.throws(() => renameAircraft(store, campaignId, plane.id, 'x'.repeat(81)));
  assert.throws(() => selectCampaign(store, 'unknown'));
});

test('campaign assignment attaches only metadata to fresh V2 mechanics and reserves the stable sortie ID', () => {
  const idFactory = ids(), created = createCampaign(createCampaignStore(), { now, idFactory }), state = fresh();
  const prepared = prepareCampaignSortie(created.store, created.campaign.id, state, { aircraftId: created.campaign.currentAircraftId, now, idFactory });
  const { campaign, ...mechanics } = prepared.state;
  assert.deepEqual(mechanics, state); assert.equal(state.campaign, undefined);
  assert.deepEqual(prepared.store.campaigns[0].activeSortie, campaign);
  assert.equal(campaign.sortieNumber, 1); assert.equal(Object.keys(campaign.crewIds).length, 10);
  assert.throws(() => prepareCampaignSortie(created.store, created.campaign.id, createGame(), { now, idFactory }), /V2/);
  assert.throws(() => prepareCampaignSortie(prepared.store, created.campaign.id, state), /active campaign sortie/);
  assert.throws(() => prepareCampaignSortie(created.store, created.campaign.id, { ...state, stats: { ...state.stats, turns: 1 } }), /fresh sortie/);
});

test('finalization stores compact authoritative bombing, condition, config and personnel snapshots with structured stat credit', () => {
  const context = setup(), state = ended(context.state);
  state.stats.fightersKilled = 3; state.stats.aircraftHits = 4; state.crew.find(member => member.id === 'radio').health = 'injured';
  state.compromised = ['tail']; state.engines[0].running = false;
  const events = [
    { sequence: 1, type: 'FIGHTER_DESTROYED', fighterId: 'f1', fighterType: 'BF-109', crewId: 'engineer', message: 'misleading text credits Pilot' },
    { sequence: 2, type: 'FIGHTER_DESTROYED', fighterId: 'f2', fighterType: 'Me-262', crewId: 'engineer' },
    { sequence: 3, type: 'FIGHTER_DESTROYED', fighterId: 'f3', fighterType: 'FW-190', source: 'escort' },
    { sequence: 4, type: 'CREW_INJURED', crewId: 'radio' },
    { sequence: 5, type: 'WORK_COMPLETED', jobId: 'j1', kind: 'repair', crewId: 'engineer', assistantId: 'navigator' },
    { sequence: 6, type: 'WORK_COMPLETED', jobId: 'j2', kind: 'fireControl', crewId: 'pilot' },
    { sequence: 7, type: 'WORK_COMPLETED', jobId: 'j3', kind: 'medical', crewId: 'bombardier' },
  ];
  const result = finalizeCampaignSortie(context.store, state, [...events, events[0]]), c = result.store.campaigns[0];
  assert.equal(result.finalized, true); assert.equal(c.activeSortie, null);
  assert.equal(c.stats.totalSorties, 1); assert.equal(c.stats.completedMissions, 1); assert.equal(c.stats.fightersDestroyed, 3);
  assert.equal(c.stats.cumulativeBombingScore, 9); assert.deepEqual(c.stats.bombingOutcomes, { destroyed: 1 });
  assert.equal(c.crew.find(member => member.role === 'engineer').fighterKills, 2);
  assert.equal(c.crew.find(member => member.role === 'pilot').fighterKills, 0);
  assert.equal(c.crew.find(member => member.role === 'navigator').jobsCompleted.repair, 1);
  assert.equal(c.crew.find(member => member.role === 'radio').woundsSuffered, 1);
  assert.equal(c.aircraft[0].missionsSurvived, 1); assert.equal(c.aircraft[0].timesDamaged, 4);
  assert.equal(result.record.enginesLost, 1); assert.deepEqual(result.record.finalCompromisedSections, ['tail']);
  assert.deepEqual(result.record.bombing.dice, [3, 4, 5, 1]); assert.equal(result.record.bombing.unusedDie, 3);
  assert.deepEqual(result.record.config, state.config); assert.equal(result.record.events, undefined);
  assert.equal(result.record.log, undefined); assert.equal(context.store.campaigns[0].stats.totalSorties, 0);
});

test('reload, export/import and duplicate end-state finalization never double-count a sortie', () => {
  const context = setup(), state = ended(context.state), result = finalizeCampaignSortie(context.store, state);
  for (let i = 0; i < 3; i++) {
    const restored = importCampaignStore(exportCampaignStore(result.store));
    const again = finalizeCampaignSortie(restored, structuredClone(state));
    assert.equal(again.finalized, false); assert.deepEqual(again.store, result.store); assert.deepEqual(again.record, result.record);
  }
  const changed = structuredClone(state); changed.stats.fightersKilled = 1000;
  assert.equal(finalizeCampaignSortie(result.store, changed).store.campaigns[0].stats.fightersDestroyed, 0);
});

test('KIA stays in personnel history; empty roles receive new marked identities and survivors stay mechanically healthy', () => {
  const context = setup(), state = ended(context.state);
  state.crew.find(member => member.id === 'tail').health = 'dead'; state.crew.find(member => member.id === 'radio').health = 'injured';
  const finished = finalizeCampaignSortie(context.store, state, [{ type: 'CREW_INJURED', crewId: 'radio' }]);
  const before = finished.store.campaigns[0], oldTail = before.roster.tail;
  assert.equal(before.stats.crewKIA, 1); assert.equal(before.crew.find(member => member.id === oldTail).killedOnMission, 1);
  const nextState = fresh(), next = prepareCampaignSortie(finished.store, context.campaignId, nextState, { aircraftId: before.currentAircraftId, now: now + 2000, idFactory: context.idFactory });
  const after = next.store.campaigns[0];
  assert.notEqual(after.roster.tail, oldTail); assert.equal(after.crew.length, 11);
  assert.equal(after.crew.find(member => member.id === after.roster.tail).replacement, true);
  assert.equal(after.crew.find(member => member.id === oldTail).kia, true);
  assert.equal(after.roster.radio, before.roster.radio); assert.equal(after.currentAircraftId, before.currentAircraftId);
  assert.ok(next.state.crew.every(member => member.health === 'healthy'));
  const { campaign, ...mechanics } = next.state; assert.deepEqual(mechanics, nextState);
  assert.equal(campaign.sortieNumber, 2);
});

test('lost aircraft requires explicit commissioning; surviving crew retain identities and no combat advantages', () => {
  const context = setup(), state = ended(context.state, { outcome: 'destroyed', altitude: 0, endReason: 'Altitude — aircraft crashed' });
  const finished = finalizeCampaignSortie(context.store, state), before = finished.store.campaigns[0];
  assert.equal(before.aircraft[0].lost, true); assert.equal(before.aircraft[0].lostOnMission, 1); assert.equal(before.stats.planesLost, 1);
  assert.equal(finished.record.result, 'AIRCRAFT LOST'); assert.match(finished.record.reason, /Altitude/);
  assert.throws(() => prepareCampaignSortie(finished.store, context.campaignId, fresh(), { aircraftId: before.currentAircraftId }), /lost aircraft/);
  const commissioned = commissionAircraft(finished.store, context.campaignId, { now, idFactory: context.idFactory });
  const nextState = fresh(), next = prepareCampaignSortie(commissioned.store, context.campaignId, nextState, { aircraftId: commissioned.aircraft.id, now, idFactory: context.idFactory });
  const after = next.store.campaigns[0]; assert.notEqual(after.currentAircraftId, before.currentAircraftId);
  assert.deepEqual(after.roster, before.roster); assert.equal(after.aircraft[1].replacement, false);
  const { campaign, ...mechanics } = next.state; assert.deepEqual(mechanics, nextState);
});

test('two sorties accumulate totals once and retain a bomber service record across missions', () => {
  const context = setup(), first = ended(context.state); first.stats.fightersKilled = 2;
  const one = finalizeCampaignSortie(context.store, first, [{ type: 'FIGHTER_DESTROYED', fighterId: 'a', crewId: 'radio' }]);
  const prepared = prepareCampaignSortie(one.store, context.campaignId, fresh(), { aircraftId: context.assignment.aircraftId, now, idFactory: context.idFactory });
  const second = ended(prepared.state); second.stats.fightersKilled = 1; second.mission.bombRun.committedScore = 6; second.mission.bombRun.outcome = 'heavy';
  const two = finalizeCampaignSortie(prepared.store, second, [{ type: 'FIGHTER_DESTROYED', fighterId: 'b', crewId: 'radio' }]);
  const c = two.store.campaigns[0]; assert.equal(c.stats.totalSorties, 2); assert.equal(c.stats.fightersDestroyed, 3);
  assert.equal(c.stats.cumulativeBombingScore, 15); assert.deepEqual(c.stats.bombingOutcomes, { destroyed: 1, heavy: 1 });
  assert.equal(c.aircraft[0].missionsFlown, 2); assert.equal(c.aircraft[0].bombingHistory.length, 2);
  assert.equal(c.crew.find(member => member.role === 'radio').fighterKills, 2);
});

for (const outcome of ['success', 'destroyed']) test(`campaign abort ${outcome} keeps wounds/kills but earns no bombing or completed-mission credit`, () => {
  const context = setup(), state = ended(context.state, { outcome }); state.mission.aborted = true;
  state.stats.fightersKilled = 2; state.mission.abortProgress = 5; state.mission.position = outcome === 'success' ? 10 : 7;
  const result = finalizeCampaignSortie(context.store, state, [{ type: 'CREW_INJURED', crewId: 'pilot' }]), c = result.store.campaigns[0];
  assert.equal(c.stats.abortedMissions, 1); assert.equal(c.stats.completedMissions, 0); assert.equal(c.stats.fightersDestroyed, 2);
  assert.equal(c.stats.cumulativeBombingScore, 0); assert.deepEqual(c.stats.bombingOutcomes, {});
  assert.equal(c.aircraft[0].bombingHistory.length, 0); assert.equal(c.aircraft[0].missionsAborted, 1);
  assert.equal(result.record.result, outcome === 'success' ? 'ABORTED — AIRCRAFT RETURNED' : 'ABORTED — AIRCRAFT LOST');
  assert.equal(result.record.missionLength, 10); assert.equal(result.record.bombing.score, null); assert.equal(result.record.bombing.outcome, null);
});

test('NO DROP is remembered independently of a successful return and earns no bombing score', () => {
  const context = setup(), state = ended(context.state);
  Object.assign(state.mission.bombRun, { status: 'no-drop', dice: [], committedScore: null, slotScores: null, outcome: 'no-drop' });
  const finished = finalizeCampaignSortie(context.store, state), c = finished.store.campaigns[0];
  assert.equal(c.stats.completedMissions, 0); assert.equal(c.stats.cumulativeBombingScore, 0);
  assert.deepEqual(c.stats.bombingOutcomes, { 'no-drop': 1 }); assert.equal(c.aircraft[0].missionsSurvived, 1);
});

test('standalone ended sorties do not mutate any campaign and active sorties cannot finalize', () => {
  const context = setup(), standalone = ended(fresh());
  const result = finalizeCampaignSortie(context.store, standalone);
  assert.equal(result.store, context.store); assert.equal(result.finalized, false); assert.equal(result.record, null);
  assert.throws(() => finalizeCampaignSortie(context.store, context.state), /ended V2/);
  const forged = ended(context.state); forged.campaign.crewIds.pilot = forged.campaign.crewIds.copilot;
  assert.throws(() => finalizeCampaignSortie(context.store, forged), /identity/);
});

test('versioned storage and export/import round-trip histories and active identities using a separate key', () => {
  const storage = memory(), context = setup();
  storage.setItem('milk-run-v3-session-2', 'active save'); storage.setItem('milk-run-dev-v1-1', 'V1'); storage.setItem('milk-run-dev-v2-1', 'V2');
  assert.deepEqual(loadCampaignStore(storage), createCampaignStore());
  assert.equal(saveCampaignStore(context.store, storage), true); assert.deepEqual(loadCampaignStore(storage), context.store);
  assert.equal(storage.map.size, 4); assert.equal(storage.getItem('milk-run-v3-session-2'), 'active save');
  assert.equal(storage.getItem('milk-run-dev-v1-1'), 'V1'); assert.equal(storage.getItem('milk-run-dev-v2-1'), 'V2');
  assert.deepEqual(importCampaignStore(exportCampaignStore(context.store)), context.store);
  assert.ok(storage.getItem(CAMPAIGN_STORE_KEY));
});

test('malformed, inconsistent and future imports are rejected without modifying stored history', () => {
  const storage = memory(), context = setup(), final = finalizeCampaignSortie(context.store, ended(context.state)).store;
  saveCampaignStore(final, storage); const before = storage.getItem(CAMPAIGN_STORE_KEY);
  const mutations = [store => store.version++, store => store.campaigns[0].stats.totalSorties++,
    store => store.campaigns[0].crew[1].id = store.campaigns[0].crew[0].id,
    store => store.campaigns[0].roster.pilot = 'missing', store => store.campaigns[0].sorties[0].bombing.score = 10,
    store => store.campaigns[0].sorties.push(structuredClone(store.campaigns[0].sorties[0])),
    store => store.campaigns[0].crew[0].kia = true];
  for (const mutation of mutations) {
    const bad = structuredClone(final); mutation(bad);
    assert.throws(() => importCampaignStore(JSON.stringify(bad)));
    assert.throws(() => saveCampaignStore(bad, storage)); assert.equal(storage.getItem(CAMPAIGN_STORE_KEY), before);
  }
  assert.throws(() => importCampaignStore('{broken'));
  storage.setItem(CAMPAIGN_STORE_KEY, '{broken'); assert.throws(() => loadCampaignStore(storage)); assert.throws(() => saveCampaignStore(final, storage));
  assert.equal(storage.getItem(CAMPAIGN_STORE_KEY), '{broken', 'corrupt original remains available for recovery');
});

test('storage denial is surfaced and does not pretend that history was saved', () => {
  assert.throws(() => loadCampaignStore({ getItem: () => { throw new Error('Denied'); } }), /Denied/);
  assert.throws(() => saveCampaignStore(createCampaignStore(), { getItem: () => null, setItem: () => { throw new Error('Quota'); } }), /Quota/);
});
