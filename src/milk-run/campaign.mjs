/** Local service histories only. No campaign record changes combat rules or RNG. */
import { CREW_DEFS } from './board.mjs';
import { missionLengths } from './rulesets.mjs';

export const CAMPAIGN_STORE_VERSION = 2;
export const CAMPAIGN_STORE_KEY = 'milk-run-campaigns-1';
const STORE_KIND = 'milk-run-campaign-store';
const roles = CREW_DEFS.map(member => member.id);
const jobKinds = ['repair', 'fireControl', 'medical'];
const clone = value => structuredClone(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(`Campaign: ${message}`); };
const check = (value, message) => { if (!value) fail(message); };
const text = (value, max = 120) => typeof value === 'string' && value.length > 0 && value.length <= max;
const count = value => Number.isSafeInteger(value) && value >= 0;
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const iso = now => new Date(now ?? Date.now()).toISOString();
const id = () => globalThis.crypto?.randomUUID?.() ?? `milk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const jobs = () => ({ repair: 0, fireControl: 0, medical: 0 });
const totals = (version = CAMPAIGN_STORE_VERSION) => ({ totalSorties: 0, completedMissions: 0, abortedMissions: 0, planesLost: 0,
  crewKIA: 0, fightersDestroyed: 0, cumulativeBombingScore: 0, bombingOutcomes: {},
  ...(version >= 2 ? { objectivesAchieved: 0, objectivesFailed: 0, aircraftReturned: 0 } : {}) });

// Return, objective and abort are independent dimensions. Any scored damage
// achieves the objective; Miss/No Drop (including loss before target) does not.
export const objectiveResult = sortie => sortie.aborted ? 'aborted'
  : sortie.bombing.status === 'committed' && ['destroyed', 'heavy', 'partial', 'minimal'].includes(sortie.bombing.outcome) ? 'achieved' : 'failed';

/** Status is derived from the one reservation, so stale status flags cannot resurrect a loss. */
export function aircraftStatus(campaign, aircraftId) {
  const aircraft = campaign.aircraft.find(item => item.id === aircraftId);
  check(aircraft, 'aircraft was not found.');
  return aircraft.lost ? 'lost' : campaign.activeSortie?.aircraftId === aircraftId ? 'on-sortie' : 'available';
}

export function campaignOverview(campaign) {
  return { ...campaign.stats, totalAircraft: campaign.aircraft.length,
    availableAircraft: campaign.aircraft.filter(item => aircraftStatus(campaign, item.id) === 'available').length,
    aircraftOnSortie: campaign.activeSortie ? 1 : 0, totalCrew: campaign.crew.length,
    livingCrew: campaign.crew.filter(member => !member.kia).length };
}

/** Service relationships are joins over authoritative sorties, never copies of identities. */
export function aircraftServiceRecord(campaign, aircraftId) {
  const aircraft = campaign.aircraft.find(item => item.id === aircraftId);
  check(aircraft, 'aircraft was not found.');
  const sorties = campaign.sorties.filter(sortie => sortie.aircraftId === aircraftId);
  const crew = campaign.crew.flatMap(member => {
    const outcomes = sorties.flatMap(sortie => sortie.crewOutcomes.filter(outcome => outcome.id === member.id));
    return outcomes.length ? [{ crewId: member.id, missions: outcomes.length,
      fighterKills: outcomes.reduce((sum, outcome) => sum + outcome.fighterKills, 0) }] : [];
  });
  return { aircraft, status: aircraftStatus(campaign, aircraftId), sorties, crew,
    crewLosses: sorties.reduce((sum, sortie) => sum + sortie.crewOutcomes.filter(outcome => outcome.health === 'dead').length, 0),
    loss: sorties.find(sortie => !sortie.aircraftSurvived) ?? null, lastSortie: sorties.at(-1) ?? null };
}

export function crewServiceRecord(campaign, crewId) {
  const member = campaign.crew.find(item => item.id === crewId);
  check(member, 'crew member was not found.');
  const sorties = campaign.sorties.filter(sortie => sortie.crewOutcomes.some(outcome => outcome.id === crewId));
  return { member, sorties, aircraft: campaign.aircraft.flatMap(aircraft => {
    const flights = sorties.filter(sortie => sortie.aircraftId === aircraft.id);
    return flights.length ? [{ aircraftId: aircraft.id, missions: flights.length,
      fighterKills: flights.reduce((sum, sortie) => sum + sortie.crewOutcomes.find(outcome => outcome.id === crewId).fighterKills, 0) }] : [];
  }) };
}

export function createCampaignStore() {
  return { kind: STORE_KIND, version: CAMPAIGN_STORE_VERSION, activeCampaignId: null, campaigns: [] };
}

function safeName(value, fallback) {
  const result = String(value ?? fallback).trim();
  check(text(result, 80), 'names must contain 1–80 characters.');
  return result;
}

function makeAircraft(campaign, nextId, createdAt) {
  const ordinal = campaign.aircraft.length + 1;
  return { id: nextId(), name: ordinal === 1 ? 'Milk Run' : `Untitled B-17 ${ordinal}`, serial: '', createdAt,
    replacement: false, missionsFlown: 0, missionsSurvived: 0, missionsAborted: 0,
    fightersDestroyed: 0, bombingHistory: [], timesDamaged: 0, finalState: null,
    lost: false, lostOnSortieId: null, lostOnMission: null };
}

function makeCrew(campaign, role, nextId, createdAt) {
  const definition = CREW_DEFS.find(member => member.id === role);
  const ordinal = campaign.crew.filter(member => member.role === role).length + 1;
  return { id: nextId(), name: `${definition.name} ${ordinal}`, role, homeStation: definition.station,
    createdAt, replacement: ordinal > 1, missionsFlown: 0, fighterKills: 0, woundsSuffered: 0,
    jobsCompleted: jobs(), kia: false, killedOnSortieId: null, killedOnMission: null, killedOnAircraftId: null, history: [] };
}

/** All mutation helpers return a new store; failed validation never partially edits one. */
export function createCampaign(store, { name = 'Milk Run Campaign', now, idFactory = id } = {}) {
  validateCampaignStore(store);
  const updated = clone(store), createdAt = iso(now);
  const campaign = { id: idFactory(), name: safeName(name), createdAt, stats: totals(),
    currentAircraftId: null, roster: {}, aircraft: [], crew: [], sorties: [], activeSortie: null };
  const aircraft = makeAircraft(campaign, idFactory, createdAt);
  campaign.aircraft.push(aircraft); campaign.currentAircraftId = aircraft.id;
  for (const role of roles) {
    const member = makeCrew(campaign, role, idFactory, createdAt);
    campaign.crew.push(member); campaign.roster[role] = member.id;
  }
  updated.campaigns.push(campaign); updated.activeCampaignId = campaign.id;
  validateCampaignStore(updated);
  return { store: updated, campaign };
}

function findCampaign(store, campaignId) {
  const campaign = store.campaigns.find(item => item.id === campaignId);
  check(campaign, 'campaign was not found.');
  return campaign;
}

export function selectCampaign(store, campaignId) {
  validateCampaignStore(store); findCampaign(store, campaignId);
  return { ...clone(store), activeCampaignId: campaignId };
}

export function renameCampaign(store, campaignId, name) {
  validateCampaignStore(store); const updated = clone(store);
  findCampaign(updated, campaignId).name = safeName(name);
  return updated;
}

export function renameAircraft(store, campaignId, aircraftId, name, serial) {
  validateCampaignStore(store); const updated = clone(store);
  const aircraft = findCampaign(updated, campaignId).aircraft.find(item => item.id === aircraftId);
  check(aircraft, 'aircraft was not found.'); aircraft.name = safeName(name);
  if (serial !== undefined) { check(typeof serial === 'string' && serial.trim().length <= 80, 'serial must be at most 80 characters.'); aircraft.serial = serial.trim(); }
  return updated;
}

export function renameCrew(store, campaignId, crewId, name) {
  validateCampaignStore(store); const updated = clone(store);
  const member = findCampaign(updated, campaignId).crew.find(item => item.id === crewId);
  check(member, 'crew member was not found.'); member.name = safeName(name);
  return updated;
}

export function commissionAircraft(store, campaignId, { name, serial = '', now, idFactory = id } = {}) {
  validateCampaignStore(store);
  const updated = clone(store), campaign = findCampaign(updated, campaignId);
  const aircraft = makeAircraft(campaign, idFactory, iso(now));
  aircraft.name = safeName(name, aircraft.name);
  check(typeof serial === 'string' && serial.trim().length <= 80, 'serial must be at most 80 characters.');
  aircraft.serial = serial.trim();
  campaign.aircraft.push(aircraft);
  validateCampaignStore(updated);
  return { store: updated, aircraft };
}

/** Call with createGame(..., 'v2-continuous'). Mechanics are copied without alteration. */
export function prepareCampaignSortie(store, campaignId, freshState, { aircraftId, now, idFactory = id } = {}) {
  validateCampaignStore(store);
  check(freshState?.ruleset === 'v2-continuous', 'campaign sorties require V2.');
  check(!freshState.campaign && !freshState.outcome && freshState.phase === 'select' && freshState.mission.position === 0 &&
    freshState.stats.turns === 0 && freshState.stats.missionDraws === 0, 'attach history only to a fresh sortie.');
  check(freshState.crew.length === roles.length && roles.every(role => freshState.crew.some(member => member.id === role && member.health === 'healthy')),
    'fresh sortie must have ten healthy crew.');
  const updated = clone(store), campaign = findCampaign(updated, campaignId), createdAt = iso(now);
  check(!campaign.activeSortie, 'finish the active campaign sortie before launching another.');
  check(text(aircraftId), 'select an available aircraft before launching.');
  const aircraft = campaign.aircraft.find(item => item.id === aircraftId);
  check(aircraft && aircraftStatus(campaign, aircraftId) === 'available', 'select an available aircraft; lost aircraft cannot fly again.');
  campaign.currentAircraftId = aircraft.id; // Last flown default only; never an implicit launch assignment.
  for (const role of roles) {
    const current = campaign.crew.find(item => item.id === campaign.roster[role]);
    if (!current || current.kia) {
      const replacement = makeCrew(campaign, role, idFactory, createdAt);
      campaign.crew.push(replacement); campaign.roster[role] = replacement.id;
    }
  }
  const assignment = { campaignId: campaign.id, sortieId: idFactory(), sortieNumber: campaign.sorties.length + 1,
    aircraftId: aircraft.id, crewIds: { ...campaign.roster }, startedAt: createdAt };
  campaign.activeSortie = clone(assignment); updated.activeCampaignId = campaign.id;
  const state = { ...clone(freshState), campaign: clone(assignment) };
  validateCampaignStore(updated);
  return { store: updated, state, assignment: clone(assignment) };
}

function uniqueEvents(events) {
  const seen = new Set();
  return events.filter(event => {
    if (!object(event)) return false;
    const key = event.sequence !== undefined ? `sequence:${event.sequence}`
      : event.type === 'FIGHTER_DESTROYED' && event.fighterId ? `fighter:${event.fighterId}`
        : event.type === 'WORK_COMPLETED' && event.jobId ? `job:${event.jobId}` : null;
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });
}

function bombingSnapshot(state, aborted) {
  const run = state.mission.bombRun;
  if (!run) return { target: state.mission.targetId ?? null, status: aborted ? 'aborted' : 'not-dropped',
    dice: [], placement: null, unusedDie: null, score: null, slotScores: null, outcome: null, officerRerollsSpent: 0, freeRerollUsed: false };
  const committed = !aborted && run.status === 'committed';
  return { target: clone(run.target), status: aborted ? 'aborted' : run.status,
    dice: [...run.dice], placement: clone(run.placement), unusedDie: run.unusedDie,
    score: committed ? run.committedScore : null, slotScores: committed ? clone(run.slotScores) : null,
    outcome: aborted ? null : run.outcome, officerRerollsSpent: run.officerRerollsSpent, freeRerollUsed: run.freeRerollUsed,
    noDropReason: run.noDropReason ?? null };
}

function recordStats(campaign, version = CAMPAIGN_STORE_VERSION) {
  const result = totals(version), outcomes = new Map();
  for (const sortie of campaign.sorties) {
    result.totalSorties++;
    if (sortie.completed) result.completedMissions++;
    if (sortie.aborted) result.abortedMissions++;
    if (version >= 2) {
      if (sortie.objectiveResult === 'achieved') result.objectivesAchieved++;
      if (sortie.objectiveResult === 'failed') result.objectivesFailed++;
      if (sortie.aircraftSurvived) result.aircraftReturned++;
    }
    if (!sortie.aircraftSurvived) result.planesLost++;
    result.crewKIA += sortie.crewOutcomes.filter(member => member.health === 'dead').length;
    result.fightersDestroyed += sortie.fightersDestroyed;
    if (sortie.bombing.status === 'committed') result.cumulativeBombingScore += sortie.bombing.score;
    if (sortie.bombing.outcome) outcomes.set(sortie.bombing.outcome, (outcomes.get(sortie.bombing.outcome) ?? 0) + 1);
  }
  result.bombingOutcomes = Object.fromEntries(outcomes);
  return result;
}

/** Finalize from the ended authoritative state and structured Flight Recorder events. */
export function finalizeCampaignSortie(store, state, events = []) {
  validateCampaignStore(store);
  if (!state?.campaign) return { store, record: null, finalized: false };
  const assignment = state.campaign, original = findCampaign(store, assignment.campaignId);
  const existing = original.sorties.find(item => item.id === assignment.sortieId);
  if (existing) {
    check(existing.campaignId === assignment.campaignId && existing.aircraftId === assignment.aircraftId &&
      existing.number === assignment.sortieNumber && existing.startedAt === assignment.startedAt &&
      roles.every(role => existing.crewIds[role] === assignment.crewIds?.[role]), 'finalized sortie identity does not match its service record.');
    return { store, record: clone(existing), finalized: false };
  }
  check(state.ruleset === 'v2-continuous' && state.phase === 'ended' && ['success', 'destroyed'].includes(state.outcome), 'only ended V2 sorties may be finalized.');
  check(original.activeSortie?.sortieId === assignment.sortieId &&
    ['campaignId', 'sortieId', 'sortieNumber', 'aircraftId', 'startedAt'].every(key => original.activeSortie[key] === assignment[key]) &&
    roles.every(role => original.activeSortie.crewIds[role] === assignment.crewIds[role]),
    'sortie identity does not match the reserved campaign assignment.');
  const updated = clone(store), campaign = findCampaign(updated, assignment.campaignId);
  const recorded = uniqueEvents(events), aborted = state.mission.aborted === true, aircraftSurvived = state.outcome === 'success';
  const bombing = bombingSnapshot(state, aborted);
  const crewOutcomes = roles.map(role => {
    const live = state.crew.find(member => member.id === role), completed = jobs();
    check(live && ['healthy', 'injured', 'dead'].includes(live.health), `invalid crew outcome for ${role}.`);
    for (const event of recorded.filter(event => event.type === 'WORK_COMPLETED' && (event.crewId === role || event.assistantId === role || event.workerIds?.includes(role)))) {
      if (jobKinds.includes(event.kind)) completed[event.kind]++;
    }
    return { id: assignment.crewIds[role], role, health: live.health,
      fighterKills: recorded.filter(event => event.type === 'FIGHTER_DESTROYED' && event.crewId === role).length,
      wounds: recorded.filter(event => event.type === 'CREW_INJURED' && event.crewId === role).length, jobsCompleted: completed };
  });
  const result = aborted ? `ABORTED — AIRCRAFT ${aircraftSurvived ? 'RETURNED' : 'LOST'}` : aircraftSurvived ? 'RETURNED HOME' : 'AIRCRAFT LOST';
  const record = { id: assignment.sortieId, number: assignment.sortieNumber, date: iso(state.endedAt ?? Date.now()),
    startedAt: assignment.startedAt, seed: String(state.seed), target: clone(bombing.target), result,
    reason: clone(state.endReason ?? state.lossReason ?? state.outcomeReason ?? (aircraftSurvived ? 'HOME' : 'Aircraft destroyed')),
    outcome: state.outcome, completed: !aborted && aircraftSurvived && bombing.status === 'committed', aborted, aircraftId: assignment.aircraftId,
    campaignId: campaign.id, crewIds: { ...assignment.crewIds }, objectiveResult: objectiveResult({ aborted, bombing }),
    aircraftSurvived, crewOutcomes, fightersDestroyed: state.stats.fightersKilled,
    enemyTypesDestroyed: Object.fromEntries(recorded.filter(event => event.type === 'FIGHTER_DESTROYED' && event.fighterType)
      .reduce((counts, event) => counts.set(event.fighterType, (counts.get(event.fighterType) ?? 0) + 1), new Map())),
    bombing, progressReached: state.mission.position, missionLength: missionLengths(state).outboundLength + missionLengths(state).returnLength,
    turns: state.stats.turns, finalAltitude: state.altitude, finalCompromisedSections: [...state.compromised],
    enginesLost: state.engines.filter(engine => !engine.running).length, aircraftHits: state.stats.aircraftHits,
    config: clone(state.config), telemetry: clone(state.telemetry ?? null) };
  const aircraft = campaign.aircraft.find(item => item.id === assignment.aircraftId);
  aircraft.missionsFlown++; if (aircraftSurvived) aircraft.missionsSurvived++; if (aborted) aircraft.missionsAborted++;
  aircraft.fightersDestroyed += record.fightersDestroyed; aircraft.timesDamaged += record.aircraftHits;
  aircraft.finalState = { sortieId: record.id, altitude: record.finalAltitude, compromisedSections: record.finalCompromisedSections,
    enginesLost: record.enginesLost, survived: aircraftSurvived };
  if (bombing.status === 'committed' || bombing.status === 'no-drop') aircraft.bombingHistory.push({ sortieId: record.id, number: record.number, date: record.date, ...clone(bombing) });
  if (!aircraftSurvived) { aircraft.lost = true; aircraft.lostOnSortieId = record.id; aircraft.lostOnMission = record.number; }
  for (const outcome of crewOutcomes) {
    const member = campaign.crew.find(item => item.id === outcome.id);
    member.missionsFlown++; member.fighterKills += outcome.fighterKills; member.woundsSuffered += outcome.wounds;
    for (const kind of jobKinds) member.jobsCompleted[kind] += outcome.jobsCompleted[kind];
    member.history.push({ sortieId: record.id, aircraftId: aircraft.id, number: record.number, date: record.date, result, ...clone(outcome) });
    if (outcome.health === 'dead') { member.kia = true; member.killedOnSortieId = record.id; member.killedOnMission = record.number; member.killedOnAircraftId = aircraft.id; }
  }
  campaign.sorties.push(record); campaign.activeSortie = null; campaign.stats = recordStats(campaign);
  validateCampaignStore(updated);
  return { store: updated, record: clone(record), finalized: true };
}

function validateJobs(value) { check(object(value) && jobKinds.every(kind => count(value[kind])), 'invalid job history.'); }
function validateAssignment(value, campaign) {
  check(object(value) && value.campaignId === campaign.id && text(value.sortieId) && count(value.sortieNumber) && value.sortieNumber > 0 &&
    campaign.aircraft.some(item => item.id === value.aircraftId && !item.lost) && date(value.startedAt) && object(value.crewIds), 'invalid sortie assignment: aircraft must be available, never lost.');
  check(Object.keys(value.crewIds).length === roles.length && roles.every(role =>
    campaign.crew.some(member => member.id === value.crewIds[role] && member.role === role && !member.kia)), 'invalid assigned crew: KIA personnel cannot fly.');
}

/** Reject unknown versions, malformed identity links and inconsistent totals before replacing storage. */
export function validateCampaignStore(store) {
  return validateStore(store, CAMPAIGN_STORE_VERSION);
}

function validateStore(store, version) {
  check(object(store) && store.kind === STORE_KIND && store.version === version && Array.isArray(store.campaigns), 'unsupported or malformed history store.');
  const allIds = new Set();
  const identity = value => { check(text(value) && !allIds.has(value), 'missing or duplicate persistent identity.'); allIds.add(value); };
  for (const campaign of store.campaigns) {
    check(object(campaign) && text(campaign.name, 80) && date(campaign.createdAt) && Array.isArray(campaign.aircraft) &&
      Array.isArray(campaign.crew) && Array.isArray(campaign.sorties) && object(campaign.roster), 'invalid campaign record.');
    identity(campaign.id);
    for (const aircraft of campaign.aircraft) {
      check(object(aircraft) && text(aircraft.name, 80) && typeof aircraft.serial === 'string' && aircraft.serial.length <= 80 && date(aircraft.createdAt) &&
        typeof aircraft.lost === 'boolean' && typeof aircraft.replacement === 'boolean' && Array.isArray(aircraft.bombingHistory) &&
        ['missionsFlown', 'missionsSurvived', 'missionsAborted', 'fightersDestroyed', 'timesDamaged'].every(key => count(aircraft[key])), 'invalid aircraft record.');
      identity(aircraft.id);
    }
    for (const member of campaign.crew) {
      check(object(member) && text(member.name, 80) && roles.includes(member.role) && member.homeStation === CREW_DEFS.find(item => item.id === member.role).station &&
        date(member.createdAt) && typeof member.kia === 'boolean' && typeof member.replacement === 'boolean' && Array.isArray(member.history) &&
        ['missionsFlown', 'fighterKills', 'woundsSuffered'].every(key => count(member[key])), 'invalid personnel record.');
      identity(member.id); validateJobs(member.jobsCompleted);
    }
    check(campaign.aircraft.some(item => item.id === campaign.currentAircraftId) &&
      roles.every(role => campaign.crew.some(member => member.id === campaign.roster[role] && member.role === role)), 'invalid current aircraft or roster.');
    for (const [index, sortie] of campaign.sorties.entries()) {
      check(object(sortie) && sortie.number === index + 1 && date(sortie.date) && date(sortie.startedAt) && typeof sortie.seed === 'string' && text(sortie.result) &&
        ['success', 'destroyed'].includes(sortie.outcome) && typeof sortie.aborted === 'boolean' && typeof sortie.completed === 'boolean' && typeof sortie.aircraftSurvived === 'boolean' &&
        sortie.aircraftSurvived === (sortie.outcome === 'success') && campaign.aircraft.some(item => item.id === sortie.aircraftId) &&
        Array.isArray(sortie.crewOutcomes) && sortie.crewOutcomes.length === roles.length && object(sortie.config) && object(sortie.bombing) &&
        Array.isArray(sortie.finalCompromisedSections) && ['fightersDestroyed', 'progressReached', 'missionLength', 'turns', 'enginesLost', 'aircraftHits'].every(key => count(sortie[key])) &&
        Number.isFinite(sortie.finalAltitude), 'invalid sortie record.');
      identity(sortie.id);
      const outcomeRoles = new Set();
      for (const outcome of sortie.crewOutcomes) {
        check(object(outcome) && !outcomeRoles.has(outcome.role) && campaign.crew.some(member => member.id === outcome.id && member.role === outcome.role) &&
          ['healthy', 'injured', 'dead'].includes(outcome.health) && count(outcome.fighterKills) && count(outcome.wounds), 'invalid crew sortie outcome.');
        outcomeRoles.add(outcome.role); validateJobs(outcome.jobsCompleted);
      }
      const bomb = sortie.bombing;
      check(['committed', 'no-drop', 'not-dropped', 'aborted', 'placing'].includes(bomb.status) && Array.isArray(bomb.dice) &&
        bomb.dice.every(value => Number.isInteger(value) && value >= 1 && value <= 6) && (bomb.dice.length === 0 || bomb.dice.length === 4) &&
        (bomb.status === 'committed' ? count(bomb.score) && bomb.score <= 9 && ['destroyed', 'heavy', 'partial', 'minimal', 'miss'].includes(bomb.outcome) : bomb.score === null) &&
        (bomb.outcome === null || ['destroyed', 'heavy', 'partial', 'minimal', 'miss', 'no-drop'].includes(bomb.outcome)) &&
        (!sortie.aborted || bomb.score === null && bomb.outcome === null), 'invalid bombing history.');
      if (version >= 2) {
        check(sortie.campaignId === campaign.id && object(sortie.crewIds) && Object.keys(sortie.crewIds).length === roles.length &&
          sortie.crewOutcomes.every(outcome => sortie.crewIds[outcome.role] === outcome.id), 'invalid finalized sortie identity.');
        check(sortie.objectiveResult === objectiveResult(sortie), 'objective result does not match bombing/abort history.');
      }
    }
    const stats = recordStats(campaign, version);
    check(object(campaign.stats) && Object.keys(stats).every(key => key === 'bombingOutcomes'
      ? object(campaign.stats[key]) && Object.keys(campaign.stats[key]).length === Object.keys(stats[key]).length &&
        Object.entries(stats[key]).every(([outcome, total]) => campaign.stats[key][outcome] === total)
      : campaign.stats[key] === stats[key]), 'campaign totals do not match finalized sorties.');
    if (campaign.activeSortie !== null) {
      validateAssignment(campaign.activeSortie, campaign);
      check(campaign.activeSortie.sortieNumber === campaign.sorties.length + 1, 'invalid next sortie number.');
      identity(campaign.activeSortie.sortieId);
    }
    for (const member of campaign.crew) {
      const flights = campaign.sorties.filter(sortie => sortie.crewOutcomes.some(outcome => outcome.id === member.id));
      const outcomes = flights.map(sortie => sortie.crewOutcomes.find(outcome => outcome.id === member.id));
      check(member.history.length === member.missionsFlown && member.missionsFlown === flights.length &&
        member.history.every((entry, index) => entry.sortieId === flights[index].id && entry.number === flights[index].number &&
          (version < 2 || entry.aircraftId === flights[index].aircraftId) &&
          entry.health === outcomes[index].health && entry.fighterKills === outcomes[index].fighterKills && entry.wounds === outcomes[index].wounds &&
          jobKinds.every(kind => entry.jobsCompleted?.[kind] === outcomes[index].jobsCompleted[kind])), 'personnel log does not match sorties.');
      check(member.fighterKills === outcomes.reduce((sum, outcome) => sum + outcome.fighterKills, 0) &&
        member.woundsSuffered === outcomes.reduce((sum, outcome) => sum + outcome.wounds, 0) &&
        jobKinds.every(kind => member.jobsCompleted[kind] === outcomes.reduce((sum, outcome) => sum + outcome.jobsCompleted[kind], 0)), 'personnel totals do not match sorties.');
      const death = outcomes.findIndex(outcome => outcome.health === 'dead');
      check(member.kia === (death >= 0) && (death < 0 || death === outcomes.length - 1), 'KIA crew cannot fly another mission.');
      check(!member.kia || campaign.sorties.some(sortie => sortie.id === member.killedOnSortieId && sortie.number === member.killedOnMission &&
        sortie.crewOutcomes.some(outcome => outcome.id === member.id && outcome.health === 'dead')), 'missing KIA mission.');
      if (version >= 2) check(member.killedOnAircraftId === (member.kia ? flights[death].aircraftId : null), 'invalid KIA aircraft.');
    }
    for (const aircraft of campaign.aircraft) {
      const flights = campaign.sorties.filter(sortie => sortie.aircraftId === aircraft.id);
      const drops = flights.filter(sortie => ['committed', 'no-drop'].includes(sortie.bombing.status));
      check(aircraft.missionsFlown === flights.length && aircraft.missionsSurvived === flights.filter(sortie => sortie.aircraftSurvived).length &&
        aircraft.missionsAborted === flights.filter(sortie => sortie.aborted).length && aircraft.fightersDestroyed === flights.reduce((sum, sortie) => sum + sortie.fightersDestroyed, 0) &&
        aircraft.timesDamaged === flights.reduce((sum, sortie) => sum + sortie.aircraftHits, 0), 'aircraft totals do not match sorties.');
      check(aircraft.bombingHistory.length === drops.length && aircraft.bombingHistory.every((entry, index) => entry.sortieId === drops[index].id &&
        entry.score === drops[index].bombing.score && entry.outcome === drops[index].bombing.outcome), 'aircraft bombing log does not match sorties.');
      const loss = flights.findIndex(sortie => !sortie.aircraftSurvived);
      check(aircraft.lost === (loss >= 0) && (loss < 0 || loss === flights.length - 1), 'lost aircraft cannot fly another mission.');
      check(!aircraft.lost || campaign.sorties.some(sortie => sortie.id === aircraft.lostOnSortieId && sortie.number === aircraft.lostOnMission &&
        sortie.aircraftId === aircraft.id && !sortie.aircraftSurvived), 'missing aircraft loss mission.');
    }
  }
  check(store.activeCampaignId === null || store.campaigns.some(campaign => campaign.id === store.activeCampaignId), 'active campaign is missing.');
  return true;
}

export function exportCampaignStore(store) { validateCampaignStore(store); return JSON.stringify(store, null, 2); }
export function importCampaignStore(json) {
  let parsed;
  try { parsed = typeof json === 'string' ? JSON.parse(json) : clone(json); }
  catch { fail('import is not valid JSON.'); }
  if (parsed?.version === 1) {
    // Validate legacy totals before deriving new fields. Migration is read-only
    // to storage until the next successful save, and never generates identities.
    validateStore(parsed, 1);
    for (const campaign of parsed.campaigns) {
      for (const sortie of campaign.sorties) {
        sortie.campaignId = campaign.id;
        sortie.crewIds = Object.fromEntries(sortie.crewOutcomes.map(outcome => [outcome.role, outcome.id]));
        sortie.objectiveResult = objectiveResult(sortie);
      }
      for (const member of campaign.crew) {
        for (const entry of member.history) entry.aircraftId = campaign.sorties.find(sortie => sortie.id === entry.sortieId).aircraftId;
        member.killedOnAircraftId = member.kia ? campaign.sorties.find(sortie => sortie.id === member.killedOnSortieId).aircraftId : null;
      }
      campaign.stats = recordStats(campaign);
    }
    parsed.version = CAMPAIGN_STORE_VERSION;
  }
  validateCampaignStore(parsed);
  return clone(parsed);
}

/** Corruption/newer versions throw and remain untouched; callers can surface the error. */
export function loadCampaignStore(storage = globalThis.localStorage) {
  const raw = storage.getItem(CAMPAIGN_STORE_KEY);
  return raw === null ? createCampaignStore() : importCampaignStore(raw);
}

export function saveCampaignStore(store, storage = globalThis.localStorage) {
  const encoded = exportCampaignStore(store), previous = storage.getItem(CAMPAIGN_STORE_KEY);
  // Do not overwrite a document this client cannot safely understand.
  if (previous !== null) importCampaignStore(previous);
  storage.setItem(CAMPAIGN_STORE_KEY, encoded);
  return true;
}
