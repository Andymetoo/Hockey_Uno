import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../state.mjs';
import { dispatch } from '../rules.mjs';
import { beginBombRun, placeBombDie, commitBombRun } from '../bombing.mjs';
import { ResolutionQueue } from '../queue.mjs';
import { SAVE_KEY, loadSession } from '../persistence.mjs';
import { createCampaignStore, createCampaign, commissionAircraft, prepareCampaignSortie, finalizeCampaignSortie,
  aircraftStatus, aircraftServiceRecord, crewServiceRecord, campaignOverview, importCampaignStore, exportCampaignStore,
  loadCampaignStore, saveCampaignStore, validateCampaignStore, CAMPAIGN_STORE_KEY } from '../campaign.mjs';
import { campaignBackup, parseCampaignBackup, storeCampaignBackup } from '../campaign-session.mjs';
import { campaignMarkup } from '../campaign-view.mjs';
import { sortieResult } from '../results.mjs';

const now = Date.parse('2026-10-02T18:00:00Z');
const fresh = () => ({ ...createGame({}, 'hangar', 'v2-continuous'), startedAt: now });
function setup() {
  let next = 0; const idFactory = () => `hangar-${++next}`;
  const created = createCampaign(createCampaignStore(), { now, idFactory });
  return { ...created, idFactory, campaignId: created.campaign.id, aircraftId: created.campaign.currentAircraftId };
}
function launch(context, store = context.store, aircraftId = context.aircraftId) {
  return prepareCampaignSortie(store, context.campaignId, fresh(), { aircraftId, now, idFactory: context.idFactory });
}
function end(state, { lost = false, aborted = false, miss = false, noDrop = false, kills = 0, dead = null } = {}) {
  state = structuredClone(state);
  if (aborted) { state = dispatch(state, { type: 'turnBack', confirmed: true }).state; }
  else {
    state.phase = 'bombing'; state.mission.position = 8;
    state.mission.targetId = miss ? 'schweinfurt' : 'bremen';
    if (noDrop) state.crew.find(c => c.id === 'bombardier').health = 'dead';
    beginBombRun(state, () => {});
    if (!noDrop) {
      state.mission.bombRun.dice = miss ? [1, 6, 1, 1] : [3, 3, 4, 6];
      for (const [index, slot] of ['course', 'drift', 'release'].entries()) placeBombDie(state, slot, index, () => {});
      commitBombRun(state, () => {});
    }
  }
  state.phase = 'ended'; state.outcome = lost ? 'destroyed' : 'success'; state.endedAt = now + 1000;
  state.stats.fightersKilled = kills; state.mission.position = lost ? 9 : 11;
  if (dead) state.crew.find(c => c.id === dead).health = 'dead';
  if (lost) { state.endReason = { cause: 'structure', compromisedSections: 6 }; state.compromised = ['nose', 'cockpit', 'wing', 'tail', 'waist', 'radio']; }
  return state;
}
const memory = entries => { const values = new Map(entries); return { values, getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }; };
const legacy = () => JSON.parse(readFileSync(new URL('./fixtures/campaign-v1-backup.json', import.meta.url), 'utf8'));

test('one-aircraft Hangar requires explicit selection even when the last flown default exists', () => {
  const c = setup(); assert.equal(aircraftStatus(c.campaign, c.aircraftId), 'available');
  assert.throws(() => prepareCampaignSortie(c.store, c.campaignId, fresh()), /select an available aircraft/);
  const p = launch(c); assert.equal(aircraftStatus(p.store.campaigns[0], c.aircraftId), 'on-sortie');
  assert.deepEqual(p.state.campaign, p.store.campaigns[0].activeSortie);
});

test('commissioning a second surviving aircraft retains the first record, crew and mechanical state', () => {
  const c = setup(), first = structuredClone(c.campaign.aircraft[0]);
  const result = commissionAircraft(c.store, c.campaignId, { name: 'Lucky Penny', serial: '42-42', now, idFactory: c.idFactory });
  assert.equal(result.store.campaigns[0].aircraft.length, 2); assert.notEqual(result.aircraft.id, first.id);
  assert.deepEqual(result.store.campaigns[0].aircraft[0], first); assert.deepEqual(result.store.campaigns[0].crew, c.campaign.crew);
  assert.equal(result.aircraft.name, 'Lucky Penny'); assert.equal(result.aircraft.serial, '42-42');
  for (const aircraftId of [first.id, result.aircraft.id]) {
    const p = launch(c, result.store, aircraftId); const { campaign, ...mechanics } = p.state;
    assert.equal(campaign.aircraftId, aircraftId); assert.deepEqual(mechanics, fresh());
  }
});

test('commissioning while another aircraft is on sortie never changes its authoritative assignment', () => {
  const c = setup(), p = launch(c), commissioned = commissionAircraft(p.store, c.campaignId, { idFactory: c.idFactory });
  assert.deepEqual(commissioned.store.campaigns[0].activeSortie, p.assignment);
  assert.equal(aircraftStatus(commissioned.store.campaigns[0], commissioned.aircraft.id), 'available');
  assert.throws(() => launch(c, commissioned.store, commissioned.aircraft.id), /active campaign sortie/);
});

test('commissioning validates names, serials and unique IDs transactionally', () => {
  const c = setup(), before = structuredClone(c.store);
  for (const options of [{ name: ' ' }, { serial: 'x'.repeat(81) }, { idFactory: () => c.aircraftId }]) assert.throws(() => commissionAircraft(c.store, c.campaignId, options));
  assert.deepEqual(c.store, before);
  assert.equal(commissionAircraft(c.store, c.campaignId).aircraft.name, 'Untitled B-17 2');
});

test('A/B/A flights independently credit kills, bombing, crew losses and both service relationship directions', () => {
  const c = setup(), second = commissionAircraft(c.store, c.campaignId, { idFactory: c.idFactory });
  let store = second.store; const aircraftIds = [c.aircraftId, second.aircraft.id, c.aircraftId];
  for (const [index, aircraftId] of aircraftIds.entries()) {
    const p = launch(c, store, aircraftId), s = end(p.state, { kills: index + 1, miss: index === 1, dead: index === 2 ? 'radio' : null });
    store = finalizeCampaignSortie(p.store, s, [{ type: 'FIGHTER_DESTROYED', fighterId: `f${index}`, crewId: 'radio' }]).store;
    assert.equal(aircraftStatus(store.campaigns[0], aircraftId), 'available');
  }
  const campaign = store.campaigns[0], a = aircraftServiceRecord(campaign, c.aircraftId), b = aircraftServiceRecord(campaign, second.aircraft.id);
  assert.deepEqual(a.sorties.map(s => s.number), [1, 3]); assert.deepEqual(b.sorties.map(s => s.number), [2]);
  assert.equal(a.aircraft.fightersDestroyed, 4); assert.equal(b.aircraft.fightersDestroyed, 2);
  assert.deepEqual(a.aircraft.bombingHistory.map(b => b.outcome), ['destroyed', 'destroyed']);
  assert.deepEqual(b.aircraft.bombingHistory.map(b => b.outcome), ['miss']);
  assert.equal(a.crewLosses, 1); assert.equal(b.crewLosses, 0);
  const radio = c.campaign.roster.radio, service = crewServiceRecord(campaign, radio);
  assert.deepEqual(service.aircraft, [{ aircraftId: c.aircraftId, missions: 2, fighterKills: 2 }, { aircraftId: second.aircraft.id, missions: 1, fighterKills: 1 }]);
  assert.deepEqual(a.crew.find(c => c.crewId === radio), { crewId: radio, missions: 2, fighterKills: 2 });
  assert.equal(service.member.killedOnAircraftId, c.aircraftId);
  assert.deepEqual(service.member.history.map(h => h.aircraftId), aircraftIds);
  assert.equal(campaignOverview(campaign).aircraftReturned, 3); assert.equal(campaignOverview(campaign).objectivesAchieved, 2);
  assert.equal(campaignOverview(campaign).objectivesFailed, 1); assert.equal(campaignOverview(campaign).livingCrew, 9);
});

test('selected second aircraft and independent Hangar survive session reload and portable import exactly', () => {
  const c = setup(), second = commissionAircraft(c.store, c.campaignId, { idFactory: c.idFactory }), p = launch(c, second.store, second.aircraft.id);
  const q = new ResolutionQueue({ state: p.state, dispatch }); q.speed = 'manual'; q.send({ type: 'activate', crewId: 'radio' });
  const backup = campaignBackup(p.store, q.export()), storage = memory();
  const restored = storeCampaignBackup(JSON.stringify(backup), storage);
  assert.deepEqual(restored.store, p.store); assert.equal(loadSession(storage).state.campaign.aircraftId, second.aircraft.id);
  assert.deepEqual(loadSession(storage), restored.activeSession);
  assert.equal(restored.activeSession.pending.every(e => e.state.campaign.aircraftId === second.aircraft.id), true);
});

test('loss keeps a permanent memorial and lets a surviving aircraft launch with no forced aircraft replacement', () => {
  const c = setup(), second = commissionAircraft(c.store, c.campaignId, { idFactory: c.idFactory }), p = launch(c, second.store);
  const finished = finalizeCampaignSortie(p.store, end(p.state, { lost: true, dead: 'tail' }));
  const campaign = finished.store.campaigns[0], loss = aircraftServiceRecord(campaign, c.aircraftId);
  assert.equal(loss.status, 'lost'); assert.equal(loss.loss.reason.cause, 'structure');
  assert.equal(loss.loss.id, p.assignment.sortieId); assert.equal(loss.loss.finalCompromisedSections.length, 6);
  assert.throws(() => launch(c, finished.store), /lost aircraft/);
  const next = launch(c, finished.store, second.aircraft.id), after = next.store.campaigns[0];
  assert.equal(after.aircraft.length, 2); assert.deepEqual(after.aircraft[0], campaign.aircraft[0]);
  assert.notEqual(next.assignment.crewIds.tail, p.assignment.crewIds.tail); assert.equal(after.crew.length, 11);
  assert.equal(after.crew.find(m => m.id === next.assignment.crewIds.tail).missionsFlown, 0);
  assert.equal(after.crew.find(m => m.id === p.assignment.crewIds.tail).kia, true);
  const replacement = commissionAircraft(finished.store, c.campaignId, { idFactory: c.idFactory });
  assert.notEqual(replacement.aircraft.id, c.aircraftId); assert.equal(replacement.store.campaigns[0].aircraft.length, 3);
});

test('loss of the only plane leaves no automatic replacement and commissioning reopens flight', () => {
  const c = setup(), p = launch(c), finished = finalizeCampaignSortie(p.store, end(p.state, { lost: true }));
  assert.equal(finished.store.campaigns[0].aircraft.length, 1); assert.equal(campaignOverview(finished.store.campaigns[0]).availableAircraft, 0);
  const second = commissionAircraft(finished.store, c.campaignId, { idFactory: c.idFactory });
  assert.equal(launch(c, second.store, second.aircraft.id).assignment.aircraftId, second.aircraft.id);
});

for (const lost of [false, true]) for (const objective of ['achieved', 'miss', 'no-drop', 'aborted']) test(`${objective} + aircraft ${lost ? 'lost' : 'returned'} are independent dimensions on the selected aircraft`, () => {
  const c = setup(), second = commissionAircraft(c.store, c.campaignId, { idFactory: c.idFactory }), p = launch(c, second.store, second.aircraft.id);
  const ended = end(p.state, { lost, aborted: objective === 'aborted', miss: objective === 'miss', noDrop: objective === 'no-drop' });
  const result = finalizeCampaignSortie(p.store, ended);
  if (!lost && objective !== 'aborted') assert.equal(sortieResult(ended).reason, 'Aircraft returned safely to HOME', 'return copy does not imply an achieved objective');
  const campaign = result.store.campaigns[0], stats = campaign.stats;
  assert.equal(result.record.aircraftId, second.aircraft.id); assert.equal(result.record.aircraftSurvived, !lost);
  assert.equal(result.record.objectiveResult, objective === 'achieved' ? 'achieved' : objective === 'aborted' ? 'aborted' : 'failed');
  assert.equal(stats.objectivesAchieved, Number(objective === 'achieved')); assert.equal(stats.aircraftReturned, Number(!lost));
  assert.equal(stats.abortedMissions, Number(objective === 'aborted')); assert.equal(stats.planesLost, Number(lost));
  assert.equal(campaign.aircraft[0].missionsFlown, 0); assert.equal(campaign.aircraft[1].missionsFlown, 1);
  assert.equal(aircraftStatus(campaign, second.aircraft.id), lost ? 'lost' : 'available');
});

test('idempotent finalization cannot change aircraft ownership or duplicate losses, KIA, kills and bombing', () => {
  const c = setup(), p = launch(c), state = end(p.state, { lost: true, dead: 'tail', kills: 2 });
  const done = finalizeCampaignSortie(p.store, state), second = commissionAircraft(done.store, c.campaignId, { idFactory: c.idFactory });
  const next = launch(c, second.store, second.aircraft.id);
  const again = finalizeCampaignSortie(importCampaignStore(exportCampaignStore(next.store)), state);
  assert.equal(again.finalized, false); assert.deepEqual(again.store, next.store);
  const wrong = structuredClone(state); wrong.campaign.aircraftId = second.aircraft.id;
  assert.throws(() => finalizeCampaignSortie(next.store, wrong), /identity/);
});

test('invalid imports cannot assign a lost plane or KIA, resurrect identities or forge cross-links', () => {
  const c = setup(), p = launch(c), done = finalizeCampaignSortie(p.store, end(p.state, { lost: true, dead: 'tail' }));
  const second = commissionAircraft(done.store, c.campaignId, { idFactory: c.idFactory }), next = launch(c, second.store, second.aircraft.id);
  for (const mutate of [
    c => c.activeSortie.aircraftId = c.aircraft[0].id,
    c => c.activeSortie.crewIds.tail = p.assignment.crewIds.tail,
    c => c.aircraft[0].lost = false,
    c => c.crew.find(m => m.kia).kia = false,
    c => c.crew[0].history[0].aircraftId = second.aircraft.id,
    c => c.crew.find(m => m.kia).killedOnAircraftId = second.aircraft.id,
    c => c.sorties[0].crewIds.pilot = 'forged',
    c => c.sorties[0].objectiveResult = 'failed',
  ]) { const bad = structuredClone(next.store); mutate(bad.campaigns[0]); assert.throws(() => importCampaignStore(bad)); }
});

test('version-1 lineage migration preserves all identities, auto-created replacement, history and active linkage', () => {
  const old = legacy(), before = structuredClone(old), migrated = parseCampaignBackup(old), a = migrated.store.campaigns[0], b = old.store.campaigns[0];
  assert.equal(migrated.store.version, 2); assert.deepEqual(old, before);
  const expectedSession=structuredClone(old.activeSession);
  for(const snapshot of [expectedSession.state,expectedSession.view,...expectedSession.pending.map(event=>event.state)])snapshot.config.v2StoryMode=false;
  assert.deepEqual(a.aircraft, b.aircraft); assert.deepEqual(a.activeSortie, b.activeSortie); assert.deepEqual(migrated.activeSession, expectedSession);
  assert.equal(a.aircraft[1].replacement, true); assert.equal(aircraftStatus(a, a.aircraft[1].id), 'on-sortie');
  assert.deepEqual(a.crew.map(c => c.id), b.crew.map(c => c.id)); assert.deepEqual(a.sorties.map(s => s.id), b.sorties.map(s => s.id));
  for (const [i, oldSortie] of b.sorties.entries()) for (const key of Object.keys(oldSortie)) assert.deepEqual(a.sorties[i][key], oldSortie[key]);
  assert.equal(a.stats.completedMissions, 1, 'legacy returned-drop count preserved');
  assert.equal(a.stats.objectivesAchieved, 0, 'legacy Miss now explicitly failed');
  assert.equal(a.stats.objectivesFailed, 1); assert.equal(a.stats.abortedMissions, 1);
  assert.equal(a.crew.find(c => c.kia).killedOnAircraftId, b.aircraft[0].id);
  assert.equal(validateCampaignStore(migrated.store), true);
  assert.deepEqual(importCampaignStore(migrated.store), migrated.store);
  const ended = dispatch(migrated.activeSession.state, { type: 'turnBack', confirmed: true }).state;
  ended.phase = 'ended'; ended.outcome = 'success'; ended.mission.position = 1;
  assert.equal(finalizeCampaignSortie(migrated.store, ended).store.campaigns[0].aircraft[1].missionsFlown, 1);
});

test('legacy local storage upgrades on successful save only; invalid legacy data remains untouched', () => {
  const old = legacy().store, raw = JSON.stringify(old), storage = memory([[CAMPAIGN_STORE_KEY, raw]]);
  const migrated = loadCampaignStore(storage); assert.equal(storage.getItem(CAMPAIGN_STORE_KEY), raw);
  saveCampaignStore(migrated, storage); assert.equal(JSON.parse(storage.getItem(CAMPAIGN_STORE_KEY)).version, 2);
  old.campaigns[0].stats.totalSorties++; const bad = JSON.stringify(old); storage.setItem(CAMPAIGN_STORE_KEY, bad);
  assert.throws(() => loadCampaignStore(storage)); assert.equal(storage.getItem(CAMPAIGN_STORE_KEY), bad);
});

test('an unflown single-aircraft legacy campaign migrates without allocating any new identities', () => {
  const c = setup(), old = structuredClone(c.store); old.version = 1;
  for (const member of old.campaigns[0].crew) delete member.killedOnAircraftId;
  for (const key of ['objectivesAchieved', 'objectivesFailed', 'aircraftReturned']) delete old.campaigns[0].stats[key];
  const migrated = importCampaignStore(old);
  assert.equal(migrated.campaigns[0].aircraft.length, 1);
  assert.deepEqual(migrated.campaigns[0].aircraft, c.campaign.aircraft);
  assert.deepEqual(migrated.campaigns[0].roster, c.campaign.roster);
  assert.equal(launch(c, migrated).assignment.aircraftId, c.aircraftId);
});

test('legacy loss awaiting its former automatic replacement migrates to a Hangar needing explicit commissioning', () => {
  const old = legacy().store, campaign = old.campaigns[0];
  campaign.activeSortie = null; campaign.aircraft = [campaign.aircraft[0]];
  campaign.currentAircraftId = campaign.aircraft[0].id;
  campaign.crew = campaign.crew.filter(member => !member.replacement);
  campaign.roster.tail = campaign.crew.find(member => member.role === 'tail').id;
  const migrated = importCampaignStore(old), c = migrated.campaigns[0];
  assert.equal(campaignOverview(c).availableAircraft, 0); assert.equal(c.aircraft.length, 1);
  assert.throws(() => prepareCampaignSortie(migrated, c.id, fresh(), { aircraftId: c.currentAircraftId }), /lost aircraft/);
  const commissioned = commissionAircraft(migrated, c.id);
  const next = prepareCampaignSortie(commissioned.store, c.id, fresh(), { aircraftId: commissioned.aircraft.id });
  assert.notEqual(next.assignment.crewIds.tail, c.roster.tail);
  assert.equal(next.store.campaigns[0].aircraft.length, 2);
});

test('standalone V1/V2 endings cannot mutate a Hangar or commission replacements', () => {
  const c = setup();
  for (const ruleset of ['v1', 'v2-continuous']) {
    const state = createGame({}, 'standalone', ruleset); state.phase = 'ended'; state.outcome = 'destroyed';
    assert.equal(finalizeCampaignSortie(c.store, state).store, c.store);
  }
});

test('Hangar rendering separates memorials, escapes names, exposes service cross-links and removes lost launch controls', () => {
  const c = setup(), p = launch(c), done = finalizeCampaignSortie(p.store, end(p.state, { lost: true, dead: 'radio' }));
  const second = commissionAircraft(done.store, c.campaignId, { name: '<img src=x>', idFactory: c.idFactory });
  const markup = campaignMarkup(second.store, p.state);
  for (const expected of ['Available Aircraft', 'Lost Aircraft', 'Commission New Aircraft', 'OBJECTIVE ACHIEVED', 'Structural failure', 'Crew who served aboard', 'Aircraft served aboard']) assert.ok(markup.includes(expected));
  assert.ok(markup.includes('&lt;img src=x&gt;')); assert.ok(!markup.includes('<img src=x>'));
  assert.equal((markup.match(/name="aircraftId"/g) ?? []).length, 1);
  assert.ok(!markup.includes(`name="aircraftId" value="${c.aircraftId}"`));
  assert.ok(markup.includes(`data-service-personnel="${c.campaign.roster.radio}"`));
});
