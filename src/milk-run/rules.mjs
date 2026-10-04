/** Milk Run v3 rules. Mutations are transactional; semantic events carry snapshots.
 * UI choices include an explicit post-action Opportunity window. No timers or DOM here.
 */
import { BOARD, CREW_DEFS, STATIONS, SECTIONS, QUADRANTS, ALTITUDES, getCell, neighbors } from './board.mjs';
import { ENEMY_DEFS, RESOURCE_BY_RANK } from './config.mjs';
import { die, drawBag, refillBag, drawDeck } from './random.mjs';
import { resolveBombing, beginBombRun, placeBombDie, rerollBombDie, commitBombRun } from './bombing.mjs';
import { turnBack } from './turn-back.mjs';
import { fighterHeading, turnHeadingToward, turnHeadingAway } from './spatial.mjs';
import { isV2 } from './rulesets.mjs';
import { breakOffFighter } from './continuous.mjs';
import { engagementFor, spendEngagement, gainTime, gainBonusTime, gainFighterKillTime, completeContinuousTurn, continueCycle, completeBetweenTurnProgress, refreshTimeRequirement } from './continuous.mjs';
import { observe, ensureV2Telemetry } from './telemetry.mjs';
import { homeStationId, currentStationId, leaveStation, migrateCrewPositions } from './crew-position.mjs';
import { recordSortieEnd } from './results.mjs';
import { evaluateStoryBoundary, chooseStory, reconcileStory } from './story.mjs';
import { storyEnabled, storyToken, storyModifier, storyFlag, storyJobTime, storyActionCost, consumeStoryAction } from './story-effects.mjs';

const copy = value => structuredClone(value);
const def = id => CREW_DEFS.find(item => item.id === id);
const person = (state, id) => state.crew.find(item => item.id === id);
const fighter = (state, id) => state.fighters.find(item => item.id === id);
const requireRule = (condition, message) => { if (!condition) throw new Error(message); };
const nameOf = id => def(id)?.name || id;
const isSafe = (state, id) => Boolean(getCell(id)?.structure && state.cells[id] !== 'fire');
const stationCells = id => STATIONS[id]?.cells || [];
const rankOf = crew => def(crew.id).rank;
const hasTag = (crew, tag) => def(crew.id)?.tags.includes(tag);
const hasAbility = (crew, ability) => def(crew.id)?.abilities?.includes(ability) || false;
const bump = (state, key, amount = 1) => { state.stats[key] = (state.stats[key] || 0) + amount; };
const record = (emit, type, message, extra = {}) => emit({ type, message, ...extra });
const status = (state, id) => state.cells[id] || 'healthy';
const underTreatment = (state, crewId) => state.jobs.some(job => job.kind === 'medical' && job.targetId === crewId);

export function isAtStation(state, crew) {
  const expected = stationCells(crew.station);
  return currentStationId(crew) !== null && expected.length > 0 && crew.health === 'healthy' && !crew.job && !underTreatment(state, crew.id) &&
    expected.every(id => crew.position.includes(id) && isSafe(state, id)) &&
    crew.position.length === expected.length;
}

export function availableCrew(state) {
  return state.crew.filter(crew => crew.health === 'healthy' && !(isV2(state) ? crew.cycleSlotConsumed : crew.used) && !crew.job && !underTreatment(state, crew.id));
}

export function eligibleAssistants(state, crewId = state.activeCrew) {
  return isV2(state) ? state.crew.filter(crew => crew.id !== crewId && crew.health === 'healthy' && !crew.job && !underTreatment(state, crew.id)) : [];
}

export function assistWorkTargets(state, job) {
  return job.kind === 'medical' ? person(state, job.targetId)?.position ?? [] : job.cells;
}

export function eligibleAssistJobs(state, crewId = state.activeCrew) {
  const crew = person(state, crewId);
  if (!isV2(state) || !crew || crew.health !== 'healthy' || crew.job || underTreatment(state, crewId) ||
    (crew.cycleSlotConsumed && !(state.phase === 'action' && state.activeCrew === crewId))) return [];
  return state.jobs.filter(job => !job.assistantId && job.crewId !== crewId &&
    ['repair', 'fireControl', 'medical'].includes(job.kind) && job.remainingTime > 0 &&
    legalWorkPositions(state, crewId, assistWorkTargets(state, job)).length > 0);
}

/** Selecting a used gunner may still preview their operating arc. */
export function operatingArc(state, crewId) {
  const crew = person(state, crewId);
  return crew && isAtStation(state, crew) ? def(crew.station)?.arc || null : null;
}

export function gunArcLegal(state, crewId, fighterId) {
  const target = fighter(state, fighterId);
  const arc = operatingArc(state, crewId);
  return Boolean(target && arc && arc.quadrants.includes(target.quadrant) && arc.altitudes.includes(target.altitude));
}

export function legalTargets(state, crewId) {
  return state.fighters.filter(target => gunArcLegal(state, crewId, target.id));
}

export function directFireGunners(state) {
  return state.crew.filter(crew => operatingArc(state, crew.id) && legalTargets(state, crew.id).length);
}

/** Both conversions conserve physical Resource tokens, including held tokens. */
export function conversionOptions(state) {
  const ratio = state.config.conversionRate;
  const resourcesInBag = state.bags.mission.tokens.filter(token => token === 'Resource').length;
  return [
    { from: 'Enlisted', to: 'Officer', cost: ratio, gain: 1, bagNeeded: 0 },
    { from: 'Officer', to: 'Enlisted', cost: 1, gain: ratio, bagNeeded: ratio - 1 },
  ].map(option => {
    const reason = state.resources[option.from] < option.cost ? `Needs ${option.cost} ${option.from} resource${option.cost === 1 ? '' : 's'}.`
      : resourcesInBag < option.bagNeeded ? `Needs ${option.bagNeeded} Resource token${option.bagNeeded === 1 ? '' : 's'} currently in the mission bag; discard cannot be used.` : '';
    return { ...option, enabled: !reason, reason, label: `${option.cost} ${option.from} → ${option.gain} ${option.to}` };
  });
}

function completedOpportunityGunners(state) {
  return state.crew.filter(crew => crew.used && crew.activationCompleted && operatingArc(state, crew.id));
}

export function opportunityGunners(state) {
  return completedOpportunityGunners(state).filter(crew => legalTargets(state, crew.id).length);
}

export function opportunityAvailability(state) {
  const completed = completedOpportunityGunners(state);
  const gunners = opportunityGunners(state);
  const reason = !state.config.opportunityEnabled ? 'Opportunity is disabled for this sortie.'
    : !['select','opportunity', ...(isV2(state) ? ['betweenOpportunity'] : [])].includes(state.phase) ? 'Opportunity Shots are available between crew activations or after an action before the enemy phase.'
    : !state.fighters.length ? 'No active fighters to target.'
    : !completed.length ? 'No healthy gunner has completed their normal activation at a usable gun station.'
    : !gunners.length ? 'No fighter is inside any completed gunner’s operating arc.'
    : !(state.opportunity > 0) ? 'No Opportunity tokens available.' : '';
  return { enabled: !reason, reason, gunners };
}

function stationEmpty(state, stationId, exceptId) {
  const cells = stationCells(stationId);
  return cells.length && cells.every(id => isSafe(state, id)) && !state.crew.some(crew =>
    crew.id !== exceptId && crew.health === 'healthy' && crew.position.some(id => cells.includes(id)));
}

export function eligibleStations(state, crewId) {
  const crew = person(state, crewId);
  if (!crew || crew.health !== 'healthy' || crew.job || underTreatment(state, crewId)) return [];
  return Object.keys(STATIONS).filter(id => (def(id)?.arc || ['pilot', 'copilot'].includes(id)) &&
    currentStationId(crew) !== id && stationEmpty(state, id, crewId));
}

// Leaving a station is one abstract move to the nearest safe interior space.
// Prefer clear space; shared space is a fallback, never a station assignment.
export function stationExitPosition(state, crewId) {
  const crew = person(state, crewId), current = crew && currentStationId(crew);
  if (!current) return null;
  const origin = getCell(crew.position[0]);
  const occupied = id => state.crew.some(c => c.id !== crewId && c.health !== 'dead' && c.position.includes(id));
  return BOARD.filter(c => c.fuselage && isSafe(state, c.id) && !stationCells(current).includes(c.id))
    .sort((a, b) => Number(occupied(a.id)) - Number(occupied(b.id)) ||
      (Math.abs(a.x-origin.x)+Math.abs(a.y-origin.y)) - (Math.abs(b.x-origin.x)+Math.abs(b.y-origin.y)) || a.y-b.y || a.x-b.x)[0]?.id ?? null;
}

function occupyStation(state, crew, stationId, emit, type = 'STATION_MANNED') {
  // Incapacitated former occupants keep their physical footprint, but relinquish
  // the assignment permanently. Healing cannot reclaim or evict this operator.
  for (const other of state.crew) if (other.id !== crew.id && other.station === stationId) leaveStation(other);
  crew.station = stationId; crew.displaced = false;
  crew.position = [...stationCells(stationId)];
  record(emit, type, `${nameOf(crew.id)} occupies ${STATIONS[stationId].name}. Home station: ${STATIONS[homeStationId(crew)].name}.`, { crewId: crew.id, stationId });
}

function cockpitSeat(state, crew) {
  return ['pilot', 'copilot'].includes(crew.station) && isAtStation(state, crew);
}

export function availableActions(state, crewId = state.activeCrew) {
  const crew = person(state, crewId);
  if (!crew || crew.health !== 'healthy' || crew.job || underTreatment(state, crew.id)) return [];
  const rank = rankOf(crew);
  const affordable = (pool, amount) => state.resources[pool] >= amount;
  const actions = [];
  const add = (id, label, enabled = true, reason = '', cost) => actions.push({ id, label, enabled, ...(enabled ? {} : { reason }), ...(cost ? { cost } : {}) });
  const targets = legalTargets(state, crewId);
  if (operatingArc(state, crew.id) || def(crew.id).arc) {
    add('basicFire', 'Basic Fire', targets.length > 0, 'No fighter in an operating gun arc.');
    const cost = storyActionCost(state, 'advancedFire', 1);
    add('advancedFire', 'Advanced Fire', targets.length > 0 && affordable('Enlisted', cost), targets.length ? `Needs ${cost} Enlisted resource.` : 'No fighter in an operating gun arc.', `${cost} Enlisted`);
  }
  for (const [id, label, targetStatus, cost] of [
    ['repair', 'Repair', 'damaged', storyActionCost(state, 'repair', state.config.repairCost)],
    ['fireControl', 'Fire Control', 'fire', storyActionCost(state, 'fireControl', state.config.fireCost)],
  ]) {
    const targets = eligibleCrisisTargets(state, id);
    const hasWorkPosition = targets.some(cell => legalWorkPositions(state, crewId, [cell.id]).length);
    add(id, label, hasWorkPosition && affordable(rank, cost), !targets.length ? `No available ${targetStatus} squares.` : !hasWorkPosition ? 'No non-burning interior work position on a target row.' : `Needs ${cost} ${rank} resource.`, cost ? `${cost} ${rank}` : undefined);
  }
  const injured = state.crew.some(target => target.health === 'injured' && !underTreatment(state, target.id));
  const medicalTargets = eligibleMedicalTargets(state, crewId);
  const medicalCost = storyActionCost(state, 'medical', state.config.medicalCost);
  add('medical', 'Medical', medicalTargets.length > 0 && affordable(rank, medicalCost), !injured ? 'No untreated injured crew.' : !medicalTargets.length ? 'No safe interior work position on an injured crewmate’s row.' : `Needs ${medicalCost} ${rank} resource.`, `${medicalCost} ${rank}`);
  if (isV2(state)) add('assistWork', 'Assist Work', eligibleAssistJobs(state, crewId).length > 0, 'No active unassisted job has a safe work position.');
  add('relocate', 'Relocate', BOARD.some(cell => cell.fuselage && isSafe(state, cell.id) &&
    !(crew.position.length === 1 && crew.position[0] === cell.id) &&
    !state.crew.some(other => other.id !== crew.id && other.health !== 'dead' && other.position.includes(cell.id))), 'No other safe, unoccupied fuselage position.');
  const seats = ['pilot', 'copilot'].some(id => stationEmpty(state, id, crew.id) && !(crew.station === id && isAtStation(state, crew)));
  add('manCockpit', 'Man Cockpit', seats, 'No empty, safe cockpit seat.');
  add('manStation', 'Man Station', eligibleStations(state, crewId).length > 0, 'No vacant, non-burning station is available.');
  add('returnHome', 'Return Home', eligibleStations(state, crewId).includes(homeStationId(crew)), 'Home station is occupied, burning, or already assigned to this crew member.');
  add('leaveStation', 'Leave Station', Boolean(stationExitPosition(state, crewId)), 'No occupied station or safe interior space to leave for.');
  if (cockpitSeat(state, crew)) {
    const ready = state.engines.some(engine => !engine.running && engineSquares(engine.id).every(cell => status(state, cell.id) === 'healthy'));
    add('restartEngine', 'Restart Engine', ready, 'No stopped engine has both squares repaired.');
  }
  if (hasAbility(crew, 'directFire')) {
    const cost = state.config.directFireCost ?? 1;
    const reason = !directFireGunners(state).length ? 'No healthy crew member is operating a gun with a legal fighter target.' : !affordable('Officer', cost) ? `Needs ${cost} Officer resource${cost === 1 ? '' : 's'}.` : '';
    add('directFire', 'Direct Fire', !reason, reason, `${cost} Officer`);
  }
  if (hasAbility(crew, 'convert')) {
    const options = conversionOptions(state);
    add('convert', 'Convert Resources', options.some(option => option.enabled), options.map(option => `${option.label}: ${option.reason}`).join(' '), `${state.config.conversionRate}E ↔ 1O`);
  }
  if (hasAbility(crew, 'rotateFighter')) add('rotateFighter', 'Distract Fighter', state.fighters.some(item => item.facing < 180), 'No fighter can turn farther away.');
  if (hasAbility(crew, 'escort')) {
    const atCap = isV2(state) && state.config.v2MaxEscorts !== null && state.escorts.length >= state.config.v2MaxEscorts;
    const cost = storyActionCost(state, 'escort', state.config.escortCost), blocked = storyFlag(state, 'radioBlocked');
    add('escort', 'Summon Escort', !blocked && !atCap && affordable('Enlisted', cost), blocked ? 'Radio contact is lost. Inspect Current Conditions.' : atCap ? `Maximum ${state.config.v2MaxEscorts} simultaneous Escort${state.config.v2MaxEscorts === 1 ? '' : 's'} already active.` : 'Needs Enlisted resources.', `${cost} Enlisted`);
  }
  add('wait', 'No Action');
  return actions;
}

function spend(state, rank, amount, emit) {
  requireRule(state.resources[rank] >= amount, `Not enough ${rank} resources.`);
  state.resources[rank] -= amount;
  state.bags.mission.discard.push(...Array(amount).fill('Resource'));
  bump(state, `${rank}Spent`, amount);
  record(emit, 'RESOURCE_SPENT', `Spent ${amount} ${rank}. ${amount} resource token${amount === 1 ? '' : 's'} will return on refill.`, { rank, amount });
}

function gainOpportunity(state, amount, emit, cause, extra = {}) {
  if (!state.config.opportunityEnabled) return;
  const gained = Math.min(amount, Math.max(0, state.config.opportunityCap - (state.opportunity || 0)));
  if (!gained) {
    record(emit, 'OPPORTUNITY_CAPPED', `${cause}: the Opportunity pool is already at its ${state.config.opportunityCap}-token cap.`, { cause, amount: 0, ...extra });
    return;
  }
  state.opportunity = (state.opportunity || 0) + gained;
  bump(state, 'opportunityGained', gained);
  record(emit, 'OPPORTUNITY_GAINED', `${cause}: gain ${gained} Opportunity (${state.opportunity}/${state.config.opportunityCap}).`, { cause, amount: gained, ...extra });
}

export function canAbortWork(state, jobId) {
  return isV2(state) && !state.outcome && state.phase === 'select' && !state.activeCrew && !state.pendingProgress &&
    state.jobs.some(job => job.id === jobId);
}

function cancelWork(state, job, emit, reason, returnAfterHazard = false) {
  const workers = jobWorkers(state, job);
  state.jobs = state.jobs.filter(item => item.id !== job.id);
  for (const worker of workers) { worker.job = null; leaveStation(worker); }
  record(emit, 'WORK_CANCELLED', `${job.kind === 'fireControl' ? 'Fire Control' : job.kind} cancelled: ${reason}${job.kind === 'fireControl' ? ' Fire suppression ends.' : ''} ${returnAfterHazard ? 'Workers return after hazard resolution when safe.' : 'Workers remain at their work positions.'}`, {
    crewId: job.crewId, jobId: job.id, kind: job.kind, cells: [...(job.cells ?? [])], targetId: job.targetId,
    workers: workers.map(worker => worker.id),
  });
}

function cancelMedical(state, job, emit, reason) {
  state.medicalReturnPending = [...new Set([...(state.medicalReturnPending ?? []), ...jobWorkers(state, job).map(c => c.id)])];
  cancelWork(state, job, emit, reason, true);
}

function returnCancelledMedical(state, emit) {
  if (!state.medicalReturnPending?.length) return;
  const workers = state.medicalReturnPending.map(id => person(state, id)).filter(c => c && !c.job);
  delete state.medicalReturnPending;
  returnWorkers(state, workers, emit);
}

function medicalValid(state, job) {
  const target = person(state, job.targetId);
  const workers = jobWorkers(state, job);
  return target?.health === 'injured' && target.position.length > 0 && target.position.every(id => isSafe(state, id)) &&
    workers.length === (job.assistantId ? 2 : 1) && workers.every(c => c.health === 'healthy' && c.job === job.id && c.position.length > 0 && c.position.every(id => isSafe(state, id)));
}

function cancelInvalidMedical(state, emit) {
  for (const job of [...state.jobs]) if (job.kind === 'medical' && !medicalValid(state, job)) {
    cancelMedical(state, job, emit, 'the patient or caregiver is no longer eligible, or their position is burning.');
  }
}

function cancelJob(state, crew, emit) {
  if (!crew.job) return;
  const job = state.jobs.find(item => item.id === crew.job);
  if (job) cancelWork(state, job, emit, `${nameOf(crew.id)} is ${crew.health}.`);
  else crew.job = null;
}

function injure(state, crew, emit, cause) {
  if (crew.health === 'dead') return;
  if (crew.health === 'healthy') {
    crew.health = 'injured';
    bump(state, 'crewInjured');
    record(emit, 'CREW_INJURED', `${nameOf(crew.id)} is injured by ${cause}.`, { crewId: crew.id });
  } else {
    crew.health = 'dead';
    bump(state, 'crewKilled');
    record(emit, 'CREW_KILLED', `${nameOf(crew.id)} is killed by ${cause}.`, { crewId: crew.id });
  }
  cancelJob(state, crew, emit);
  if (crew.health === 'dead') for (const job of [...state.jobs]) {
    if (job.kind === 'medical' && job.targetId === crew.id) cancelMedical(state, job, emit, `${nameOf(crew.id)} is dead.`);
  }
  if (isV2(state)) refreshTimeRequirement(state);
}

export function getSectionStatus(state) {
  return Object.keys(SECTIONS).map(id => {
    const cells = BOARD.filter(cell => cell.structure && cell.section === id);
    const affected = cells.filter(cell => status(state, cell.id) !== 'healthy').length;
    return { id, total: cells.length, affected, compromised: cells.length > 0 && affected > cells.length / 2 };
  });
}

const engineSquares = id => BOARD.filter(cell => cell.engine === id);

export function recalculateConditions(state, emit) {
  for (const engine of state.engines) {
    const squares = engineSquares(engine.id);
    if (squares.length && squares.every(cell => status(state, cell.id) !== 'healthy') && engine.running) {
      engine.running = false;
      engine.repairReady = false;
      bump(state, 'enginesDisabled');
      record(emit, 'ENGINE_DISABLED', `${engine.id} stops: both engine squares are damaged or burning.`, { engineId: engine.id });
    }
    const ready = !engine.running && squares.length > 0 && squares.every(cell => status(state, cell.id) === 'healthy');
    if (ready && !engine.repairReady) {
      engine.repairReady = true;
      record(emit, 'ENGINE_REPAIR_READY', `${engine.id} is repaired but stopped. A seated cockpit crew member must restart it.`, { engineId: engine.id });
    } else if (!ready) engine.repairReady = false;
  }
  for (const section of getSectionStatus(state)) {
    const was = state.compromised.includes(section.id);
    if (section.compromised && !was) {
      state.compromised.push(section.id);
      bump(state, 'compromisedSections');
      record(emit, 'SECTION_COMPROMISED', `${SECTIONS[section.id].name} is compromised (${section.affected}/${section.total} squares affected).`, { sectionId: section.id });
    } else if (!section.compromised && was) {
      state.compromised = state.compromised.filter(id => id !== section.id);
      record(emit, 'SECTION_RESTORED', `${SECTIONS[section.id].name} is no longer compromised.`, { sectionId: section.id });
    }
  }
}

export function damageSquare(state, cellId, steps, emit, { injureCrew = true } = {}) {
  const cell = getCell(cellId);
  if (!cell?.structure) {
    record(emit, 'ATTACK_EMPTY_SPACE', `${cellId}: the shot passes through empty space.`, { cellId });
    return;
  }
  bump(state, 'aircraftHits');
  for (let step = 0; step < steps; step++) {
    if (status(state, cellId) === 'healthy') {
      state.cells[cellId] = 'damaged';
      record(emit, 'AIRCRAFT_SQUARE_DAMAGED', `${cellId}: healthy structure becomes damaged.`, { cellId });
    } else if (status(state, cellId) === 'damaged') {
      state.cells[cellId] = 'fire';
      bump(state, 'firesStarted');
      record(emit, 'FIRE_STARTED', `${cellId}: another damage step starts a fire.`, { cellId });
    } else record(emit, 'AIRCRAFT_HIT_BURNING', `${cellId} is already burning; this damage step has no additional effect.`, { cellId });
  }
  if (injureCrew) for (const crew of state.crew.filter(item => item.health !== 'dead' && item.position.includes(cellId))) {
    for (let step = 0; step < steps; step++) injure(state, crew, emit, `the hit at ${cellId}`);
  }
  cancelInvalidMedical(state, emit);
  returnCancelledMedical(state, emit);
  recalculateConditions(state, emit);
}

export function resolveAttack(state, emit, { source = 'Enemy', fighterId, roll, resultOverride, cellId } = {}) {
  bump(state, 'enemyAttacks');
  record(emit, 'ENEMY_ATTACK', `${source} attacks.`, { fighterId, source });
  const result = roll ?? die(state, 6);
  const hitMinimum = Math.max(2, Math.min(6, 2 + storyModifier(state, 'enemyHit')));
  const outcome = resultOverride ?? (result < hitMinimum ? 'miss' : result === 6 ? 'critical' : 'hit');
  const experimental = isV2(state) && state.config.v2AircraftSpecificCrits && ENEMY_DEFS[fighter(state, fighterId)?.type ?? source];
  const damageSteps = outcome === 'critical' ? experimental?.critSteps ?? 2 : 1;
  record(emit, 'ENEMY_ATTACK_ROLL', `${source} rolls ${result}: ${outcome === 'off-target' ? 'OFF TARGET' : outcome === 'miss' ? 'MISS' : outcome === 'critical' ? 'CRITICAL HIT' : 'HIT'}.${experimental && outcome === 'critical' ? ` ${damageSteps} aircraft and crew damage step${damageSteps === 1 ? '' : 's'} (aircraft profile).` : ''}`, { fighterId, source, roll: result, result: outcome, ...(experimental && outcome === 'critical' ? { damageSteps } : {}) });
  if (outcome === 'off-target' || outcome === 'miss') return;
  bump(state, 'enemyHits');
  if (outcome === 'critical') bump(state, 'enemyCrits');
  const location = cellId ?? `${'ABCDEF'[die(state, 6) - 1]}${die(state, 6)}-${die(state, 4)}`;
  record(emit, 'ENEMY_HIT_LOCATION', `Hit location: ${location}.`, { cellId: location, fighterId });
  damageSquare(state, location, damageSteps, emit);
}

function killFighter(state, target, emit, cause, gunfire = false, crewId = null) {
  const index = state.fighters.findIndex(item => item.id === target.id);
  if (index < 0) return;
  state.fighters.splice(index, 1);
  bump(state, 'fightersKilled');
  if (isV2(state)) observe(state, 'fightersDestroyed');
  record(emit, 'FIGHTER_DESTROYED', `${target.type} is destroyed by ${cause}. Remaining fighters move forward in queue order.`, { fighterId: target.id, enemyType: target.type, fighterType: target.type, crewId, cause, gunfire });
  if (gunfire && state.config.opportunityOnKill) gainOpportunity(state, 1, emit, `${target.type} destroyed by B-17 gunfire`, { fighterId: target.id });
  if (isV2(state) && gunfire && state.config.v2FighterKillGrantsTime) gainFighterKillTime(state, emit, jobs => completeJobs(state, jobs, emit));
}

function damageFighter(state, target, amount, emit, cause, gunfire = false, crewId = null) {
  const aboveThreshold = target.hp > target.maxHp / 2;
  target.hp = Math.max(0, target.hp - amount);
  record(emit, 'FIGHTER_DAMAGED', `${cause}: ${target.type} loses ${amount} HP (${target.hp}/${target.maxHp}).`, { fighterId: target.id, amount });
  if (!target.hp) killFighter(state, target, emit, cause, gunfire, crewId);
  else if (gunfire && amount > 0 && (isV2(state) ? state.config.v2DisruptEnabled : state.config.disruptOnHit) && !target.disrupted) {
    target.disrupted = true;
    record(emit, 'FIGHTER_DISRUPTED', `${target.type} is Disrupted until its next enemy action.`, {
      fighterId: target.id, cause, ...(isV2(state) ? { disruptEffect: state.config.v2DisruptEffect } : {}),
    });
  }
  if (target.hp > 0 && amount > 0 && isV2(state) && state.config.v2BadlyDamagedBreakoff &&
      !target.badlyDamagedTriggered && (aboveThreshold || target.badlyDamagedTriggered === false) && target.hp <= target.maxHp / 2) {
    target.badlyDamagedTriggered = true;
    target.engagementRemaining = Math.max(0, target.engagementRemaining - 1);
    record(emit, 'FIGHTER_BADLY_DAMAGED', `BADLY DAMAGED — ${target.type} BREAKING OFF SOONER: ${target.engagementRemaining} Engagement remaining.`, { fighterId: target.id, enemyType: target.type, engagementRemaining: target.engagementRemaining });
    breakOffFighter(state, target, emit, 'after damage forces an early breakoff');
  }
}

export function postAttackPosition(state, fighterId, emit, sector) {
  const target = fighter(state, fighterId);
  if (!target) return;
  const origin = target.quadrant;
  // A flyby keeps its flight direction even when its new sector changes the
  // relative angle to the bomber. Never derive this heading from destination.
  target.heading = fighterHeading(target);
  const destination = sector || { quadrant: QUADRANTS[die(state, 4) - 1], altitude: ALTITUDES[die(state, 3) - 1] };
  target.quadrant = destination.quadrant;
  target.altitude = destination.altitude;
  record(emit, 'FIGHTER_MOVED', `${target.type} flies to ${target.quadrant} / ${target.altitude}.`, { fighterId, origin, heading: target.heading });
  const delta = Math.abs(QUADRANTS.indexOf(origin) - QUADRANTS.indexOf(target.quadrant));
  target.facing = Math.min(delta, 4 - delta) * 90;
  record(emit, 'FIGHTER_ROTATED', `${target.type} now faces ${target.facing === 0 ? 'the B-17' : `${target.facing}° away from the B-17`}.`, { fighterId, facing: target.facing, heading: target.heading });
  for (const escort of state.escorts.filter(item => item.quadrant === target.quadrant)) {
    if (!fighter(state, fighterId)) break;
    record(emit, 'ESCORT_INTERCEPT', `Escort in ${escort.quadrant} catches the passing ${target.type}.`, { fighterId, escortId: escort.id });
    damageFighter(state, target, 1, emit, 'Escort', false);
  }
}

function enemyPhase(state, emit) {
  if (isV2(state)) observe(state, 'enemyPhases');
  record(emit, 'ENEMY_PHASE_STARTED', state.fighters.length ? 'Enemy phase: resolve fighters in visible queue order.' : 'Enemy phase: no active fighters.');
  for (const id of state.fighters.map(item => item.id)) {
    const target = fighter(state, id);
    if (!target) continue;
    const attackPass = target.facing === 0;
    if (target.facing > 0) {
      target.heading = turnHeadingToward(target);
      target.facing = Math.max(0, target.facing - 90);
      record(emit, 'FIGHTER_ROTATED', `${target.type} rotates 90° toward the B-17; ${target.facing === 0 ? 'now facing in, ready for its next enemy phase' : `${target.facing}° remains`}.`, { fighterId: id, facing: target.facing, heading: target.heading });
      if (target.disrupted) {
        target.disrupted = false;
        record(emit, 'DISRUPT_CLEARED', `${target.type}'s Disruption clears after its enemy action.`, { fighterId: id });
      }
    } else {
      const disrupted = target.disrupted;
      if (disrupted && isV2(state) && state.config.v2DisruptEffect === 'accuracy-penalty') {
        const roll = die(state, 6);
        const minimum = Math.max(2, Math.min(6, 4 + storyModifier(state, 'enemyHit') + storyModifier(state, 'disruptedHit')));
        const outcome = roll < minimum ? 'off-target' : roll <= 5 ? 'hit' : 'critical';
        resolveAttack(state, emit, { source: target.type, fighterId: id, roll, resultOverride: outcome });
        record(emit, 'DISRUPT_ACCURACY_RESOLVED', `${target.type}'s Disrupt accuracy roll resolves as ${outcome === 'off-target' ? 'Off Target' : outcome === 'critical' ? 'Critical' : 'Hit'}.`, { fighterId: id, roll, result: outcome });
      } else if (disrupted && !isV2(state)) {
        target.disrupted = false;
        record(emit, 'ATTACK_DISRUPTED', `ATTACK DISRUPTED: ${target.type}'s attack is cancelled. The fighter still makes its normal flyby.`, { fighterId: id, source: target.type });
      } else if (disrupted) {
        record(emit, 'ATTACK_DISRUPTED', `ATTACK DISRUPTED: ${target.type}'s attack is an automatic miss. The fighter still makes its normal flyby.`, { fighterId: id, source: target.type, disruptEffect: 'auto-miss' });
      } else resolveAttack(state, emit, { source: target.type, fighterId: id });
      postAttackPosition(state, id, emit);
      if (disrupted && isV2(state)) {
        target.disrupted = false;
        record(emit, 'DISRUPT_CLEARED', `${target.type}'s Disruption clears after its enemy action.`, { fighterId: id });
      }
    }
    if (isV2(state)) {
      observe(state, 'fighterActionsCompleted');
      spendEngagement(state, target, attackPass, emit);
    }
  }
}

function flak(state, emit, reason) {
  bump(state, 'flakAttacks');
  const shots = Math.max(0, state.config.flakShots + storyModifier(state, 'flakShots'));
  record(emit, 'FLAK_STARTED', `${reason} Flak fires ${shots} consecutive shot${shots === 1 ? '' : 's'}.`);
  for (let shot = 0; shot < shots; shot++) resolveAttack(state, emit, { source: `Flak ${shot + 1}/${shots}` });
  record(emit, 'FLAK_ENDED', 'Flak salvo complete.');
}

function missionDraw(state, crew, emit, { unavailable = false, intercept = false } = {}) {
  const draw = drawBag(state, state.bags.mission);
  if (draw.refilled) record(emit, 'MISSION_BAG_REFILLED', 'The mission bag was empty. Emergency refill from its discard pool.');
  const token = storyToken(draw.token);
  if (!token) {
    record(emit, 'MISSION_BAG_EMPTY', 'The mission bag and discard are empty; no mission token is available.');
    return;
  }
  bump(state, 'missionDraws');
  record(emit, 'MISSION_TOKEN_DRAWN', `${nameOf(crew.id)}${unavailable ? ' unavailable slot' : ''} draws ${token}.`, { crewId: crew.id, token });
  if (isV2(state) && token === 'Time') {
    gainTime(state, emit, jobs => completeJobs(state, jobs, emit));
    return;
  }
  if (token === 'Resource') {
    if (unavailable) {
      state.bags.mission.discard.push(token);
      record(emit, 'RESOURCE_WASTED', `${nameOf(crew.id)} cannot collect this resource. It enters the discard pool.`, { crewId: crew.id });
    } else {
      const rank = RESOURCE_BY_RANK[rankOf(crew)];
      state.resources[rank]++;
      bump(state, `${rank}Gained`);
      record(emit, 'RESOURCE_GAINED', `Gain 1 ${rank} resource. Held resources stay outside the mission bag.`, { crewId: crew.id, rank, amount: 1 });
    }
    return;
  }
  state.bags.mission.discard.push(draw.token);
  if (intercept) return flak(state, emit, 'Radio Intercept turns the Enemy draw into Flak.');
  if (state.fighters.length >= state.config.maxFighters) return flak(state, emit, 'The fighter queue is full; no enemy card is drawn.');
  const deckDraw = drawDeck(state, state.deck);
  const card = typeof deckDraw === 'string' ? deckDraw : deckDraw.card ?? deckDraw.token;
  if (deckDraw?.refilled) record(emit, 'ENEMY_DECK_SHUFFLED', 'The enemy deck is exhausted; reshuffle its discard.');
  if (!card) { record(emit, 'ENEMY_DECK_EMPTY', 'No enemy card is available.'); return; }
  record(emit, 'ENEMY_CARD_DRAWN', `Enemy card: ${card}.`, { enemyType: card });
  if (card === 'Flak') return flak(state, emit, 'A Flak card was drawn.');
  const enemyDef = ENEMY_DEFS[card];
  const hp = state.config[enemyDef.hpKey] ?? enemyDef.hp;
  const spawned = { id: `fighter-${state.nextId++}`, type: card, hp, maxHp: hp, quadrant: QUADRANTS[die(state, 4) - 1], altitude: ALTITUDES[die(state, 3) - 1], facing: state.config.spawnFacing, disrupted: false };
  spawned.heading = fighterHeading(spawned);
  if (isV2(state)) { spawned.engagementRemaining = engagementFor(state, card); spawned.badlyDamagedTriggered = false; }
  state.fighters.push(spawned);
  bump(state, 'fightersSpawned');
  if (isV2(state)) observe(state, 'fightersSpawned');
  record(emit, 'FIGHTER_SPAWNED', `${card} joins queue slot ${state.fighters.length} at ${spawned.quadrant} / ${spawned.altitude}, ${spawned.facing === 0 ? 'facing the B-17' : '90° off-angle'}.`, { fighterId: spawned.id });
}

function combatPull(state, emit, crewId, fighterId) {
  const result = drawBag(state, state.bags.combat);
  if (result.refilled) record(emit, 'COMBAT_BAG_REFILLED', 'The combat bag was empty. Emergency refill from its discard pool.');
  if (!result.token) {
    record(emit, 'COMBAT_BAG_EMPTY', 'No combat tokens are available; the shot misses.');
    return 'Miss';
  }
  state.bags.combat.discard.push(result.token);
  const token = storyToken(result.token);
  record(emit, 'GUNNER_SHOT_ROLL', `${nameOf(crewId)} pulls ${token.toUpperCase()}.`, { crewId, fighterId, token });
  return token;
}

function shoot(state, crew, targetId, emit, advanced = false) {
  let pulls = 0;
  let firstMissRetry = false;
  record(emit, 'GUNNER_FIRE_STARTED', `${nameOf(crew.id)} uses ${advanced ? 'Advanced' : 'Basic'} Fire against ${fighter(state, targetId).type}.`, { crewId: crew.id, fighterId: targetId });
  while (fighter(state, targetId)) {
    const token = combatPull(state, emit, crew.id, targetId);
    pulls++;
    if (token === 'Hit' || token === 'Burst') damageFighter(state, fighter(state, targetId), token === 'Burst' ? 2 : 1, emit, nameOf(crew.id), true, crew.id);
    if (!advanced || firstMissRetry || !fighter(state, targetId)) break;
    if (token === 'Miss') {
      if (pulls === 1) {
        firstMissRetry = true;
        record(emit, 'ADVANCED_FIRE_RETRY', 'The first pull missed: exactly one free extra pull, then stop.', { crewId: crew.id, fighterId: targetId });
      } else break;
    }
  }
  record(emit, 'GUNNER_FIRE_ENDED', `${nameOf(crew.id)} finishes firing.`, { crewId: crew.id });
}

function connected(ids, eightWay) {
  if (!ids.length) return false;
  const selected = new Set(ids);
  const seen = new Set([ids[0]]);
  const pending = [ids[0]];
  while (pending.length) for (const cell of neighbors(pending.pop(), eightWay)) if (selected.has(cell.id) && !seen.has(cell.id)) { seen.add(cell.id); pending.push(cell.id); }
  return seen.size === ids.length;
}

export function eligibleCrisisTargets(state, action) {
  const desired = action === 'repair' ? 'damaged' : action === 'fireControl' ? 'fire' : null;
  if (!desired) return [];
  const busy = new Set(state.jobs.flatMap(job => job.cells || []));
  return BOARD.filter(cell => cell.structure && status(state, cell.id) === desired && !busy.has(cell.id));
}

export function crisisTargetCap(state, crewId, action) {
  const crew = person(state, crewId);
  if (action === 'repair') return state.config.repairCap + (crew && hasAbility(crew, 'enhancedRepair') ? state.config.engineerBonus : 0);
  return action === 'fireControl' ? state.config.fireCap : 0;
}

/** Used by board targeting and rule validation; the cap depends on the worker. */
export function connectedTargetSelection(state, action, ids) {
  const eligible = new Set(eligibleCrisisTargets(state, action).map(cell => cell.id));
  return ids.length > 0 && new Set(ids).size === ids.length &&
    ids.every(id => eligible.has(id)) && connected(ids, state.config.eightWayWork);
}

/** Work prefers the central C/D interior on the PRIMARY target's main row.
 * Fuselage work can use an immediately adjacent main row when its row burns.
 * A multi-row connected repair/fire group uses its first selected square's row.
 * Footprints may share interior work space; rendering offsets overlapping crew.
 */
export function legalWorkPositions(state, crewId, targetIds) {
  if (!person(state, crewId)) return [];
  const origin = getCell(targetIds?.[0]);
  if (!origin) return [];
  const row = Math.floor(origin.y / 2);
  const sameRow = BOARD.filter(cell => cell.fuselage && Math.floor(cell.y / 2) === row && isSafe(state, cell.id));
  const candidates = sameRow.length || !(origin.fuselage || origin.section === 'Fuselage') ? sameRow
    : BOARD.filter(cell => cell.fuselage && Math.abs(Math.floor(cell.y / 2) - row) === 1 && isSafe(state, cell.id));
  return candidates
    .sort((a, b) => (Math.abs(a.x - origin.x) + Math.abs(a.y - origin.y)) - (Math.abs(b.x - origin.x) + Math.abs(b.y - origin.y)) || a.y - b.y || a.x - b.x);
}

export function eligibleMedicalTargets(state, crewId) {
  return state.crew.filter(target => target.health === 'injured' && target.position.every(id => isSafe(state,id)) && !underTreatment(state, target.id) &&
    legalWorkPositions(state, crewId, target.position).length > 0);
}

function workPosition(state, crew, targetIds, selectedId) {
  const candidates = legalWorkPositions(state, crew.id, targetIds);
  requireRule(candidates.length, 'No safe interior work position is available in the target row or permitted adjacent rows.');
  requireRule(!selectedId || candidates.some(cell => cell.id === selectedId), 'Choose a highlighted, non-burning interior work position.');
  return [selectedId || candidates[0].id];
}

function returnWorkers(state, workers, emit) {
  const living = workers.filter(crew => crew.health !== 'dead');
  // Plan all returns before moving anyone. A returner releases their temporary
  // footprint; a worker unable to return remains a real occupancy blocker.
  const returning = new Set(living.filter(crew => stationCells(homeStationId(crew)).length &&
    stationCells(homeStationId(crew)).every(id => isSafe(state, id))).map(crew => crew.id));
  let changed;
  do {
    changed = false;
    const reserved = new Set();
    for (const crew of living) {
      if (!returning.has(crew.id)) continue;
      const home = stationCells(homeStationId(crew));
      const blocked = home.some(id => reserved.has(id)) || state.crew.some(other =>
        other.id !== crew.id && other.health !== 'dead' && !returning.has(other.id) &&
        other.position.some(id => home.includes(id)));
      if (blocked) { returning.delete(crew.id); changed = true; }
      else home.forEach(id => reserved.add(id));
    }
  } while (changed);
  // Present individual returns sequentially, using the coherent batch plan.
  for (const crew of living) {
    if (returning.has(crew.id)) {
      crew.station = homeStationId(crew); crew.displaced = false;
      crew.position = [...stationCells(crew.station)];
      record(emit, 'CREW_RETURNED', `${nameOf(crew.id)} returns to ${STATIONS[crew.station].name}.`, { crewId: crew.id });
    } else {
      leaveStation(crew);
      record(emit, 'CREW_DISPLACED', `${nameOf(crew.id)} stays at the work position because the home station is burning or occupied. General actions remain available.`, { crewId: crew.id });
    }
  }
}

function jobWorkers(state, job) {
  return job ? [job.crewId, job.assistantId].filter(Boolean).map(id => person(state, id)).filter(Boolean) : [];
}

function completeJobs(state, jobs, emit) {
  const workers = jobs.flatMap(job => jobWorkers(state, job));
  for (const job of jobs) finishJob(state, job, emit, true);
  if (state.medicalReturnPending) {
    for (const id of state.medicalReturnPending) if (!workers.some(c => c.id === id)) workers.push(person(state, id));
    delete state.medicalReturnPending;
  }
  returnWorkers(state, workers, emit);
}

function finishJob(state, job, emit, deferReturn = false) {
  if (!state.jobs.some(active => active.id === job.id)) return;
  if (job.kind === 'medical' && !medicalValid(state, job)) {
    cancelMedical(state, job, emit, 'the patient or caregiver is no longer eligible, or their position is burning.');
    if (!deferReturn) returnCancelledMedical(state, emit);
    return;
  }
  record(emit, 'WORK_COMPLETING', `${nameOf(job.crewId)} completes ${job.kind === 'fireControl' ? 'Fire Control' : job.kind}.`, { crewId: job.crewId });
  const completedCells = [];
  let medicalComplete = false;
  if (job.kind === 'medical') {
    const target = person(state, job.targetId);
    if (target?.health === 'injured') {
      target.health = 'healthy';
      medicalComplete = true;
      record(emit, 'CREW_HEALED', `${nameOf(target.id)} is healthy again.`, { crewId: target.id });
    } else record(emit, 'MEDICAL_NO_EFFECT', `${nameOf(job.targetId)} no longer has a treatable injury.`, { crewId: job.targetId });
  } else for (const id of job.cells) {
    if (job.kind === 'repair' && status(state, id) === 'damaged') {
      state.cells[id] = 'healthy';
      bump(state, 'repairs');
      completedCells.push(id);
      record(emit, 'AIRCRAFT_SQUARE_REPAIRED', `${id}: damaged structure is repaired to healthy.`, { cellId: id, crewId: job.crewId });
    } else if (job.kind === 'fireControl' && status(state, id) === 'fire') {
      state.cells[id] = state.config.extinguishLeavesDamage ? 'damaged' : 'healthy';
      completedCells.push(id);
      record(emit, 'FIRE_EXTINGUISHED', `${id}: fire is extinguished, leaving ${state.cells[id]} structure.`, { cellId: id, crewId: job.crewId });
    } else record(emit, 'WORK_TARGET_CHANGED', `${id}: its condition changed; this part of the job has no effect.`, { cellId: id });
  }
  state.jobs = state.jobs.filter(item => item.id !== job.id);
  const workName = job.kind === 'fireControl' ? 'Fire Control' : job.kind === 'medical' ? 'Medical' : 'Repair';
  const summary = job.kind === 'medical' ? `${workName} completed${medicalComplete ? `: ${nameOf(job.targetId)} treated.` : ': no treatment was needed.'}`
    : `${workName} completed: ${completedCells.length ? `${completedCells.join(', ')} ${job.kind === 'fireControl' ? 'extinguished' : 'repaired'}.` : 'no selected cells changed.'}`;
  record(emit, 'WORK_COMPLETED', summary, { crewId: job.crewId, assistantId: job.assistantId ?? null, jobId: job.id, kind: job.kind, cells: completedCells, targetId: job.targetId });
  if (isV2(state)) observe(state, 'jobsCompleted');
  const workers = jobWorkers(state, job);
  for (const worker of workers) worker.job = null;
  if (!deferReturn) returnWorkers(state, workers, emit);
  recalculateConditions(state, emit);
  reconcileStory(state, emit);
}

function startJob(state, crew, command, emit, storyWork = null) {
  const kind = command.action;
  const targetCells = kind === 'medical' ? person(state, command.targetId).position : command.cells;
  const location = workPosition(state, crew, targetCells, command.workCellId);
  const durationKey = kind === 'fireControl' ? 'fireDuration' : `${kind}Duration`;
  const assistant = isV2(state) && command.assistantId ? person(state, command.assistantId) : null;
  const timeKind = kind === 'fireControl' ? 'Fire' : kind === 'medical' ? 'Medical' : 'Repair';
  const duration = storyWork?.time ?? (isV2(state) ? Math.max(0, state.config[`v2${assistant ? 'Assisted' : ''}${timeKind}Time`] + storyJobTime(state, kind)) : state.config[durationKey]);
  const costKey = kind === 'fireControl' ? 'fireCost' : `${kind}Cost`;
  const cost = storyWork ? 0 : storyActionCost(state, kind, state.config[costKey]);
  if (cost) spend(state, rankOf(crew), cost, emit);
  if (!storyWork) consumeStoryAction(state, kind, emit);
  crew.position = location;
  leaveStation(crew);
  record(emit, 'CREW_RELOCATED', `${nameOf(crew.id)} moves to safe work position ${location.join(', ')}.`, { crewId: crew.id, cellId: location[0] });
  const job = { id: `job-${state.nextId++}`, kind, crewId: crew.id, targetId: command.targetId || null, cells: kind === 'medical' ? [] : [...command.cells], ...(isV2(state) ? { remainingTime: duration, ...(assistant ? { assistantId: assistant.id } : {}) } : { completeRound: state.round + duration }), workPosition: location };
  if (storyWork) job.storyThreadId = storyWork.threadId;
  crew.job = job.id;
  if (assistant) {
    assistant.job = job.id;
    assistant.position = workPosition(state, assistant, targetCells, command.assistantWorkCellId || location[0]);
    leaveStation(assistant);
    record(emit, 'CREW_RELOCATED', `${nameOf(assistant.id)} assists at ${assistant.position.join(', ')}. Their Crew Cycle slot remains ${assistant.cycleSlotConsumed ? 'consumed' : 'unconsumed'}.`, { crewId: assistant.id, cellId: assistant.position[0] });
  }
  state.jobs.push(job);
  if (isV2(state)) {
    observe(state, 'jobsBegun');
    if (assistant) observe(state, 'assistedJobs');
  }
  record(emit, 'WORK_STARTED', `${nameOf(crew.id)} starts ${kind === 'fireControl' ? 'Fire Control' : kind}${kind === 'medical' ? ` on ${nameOf(command.targetId)}` : ` at ${command.cells.join(', ')}`}. ${duration === 0 ? 'Completes now.' : isV2(state) ? `${duration} future Time${assistant ? ` with ${nameOf(assistant.id)} assisting` : ''}.` : `Completes at Round ${job.completeRound} Start.`}${kind === 'fireControl' ? ' Selected fires are suppressed while this job remains active.' : ''}`, { crewId: crew.id, jobId: job.id, kind, cells: [...job.cells], targetId: job.targetId });
  if (duration === 0) finishJob(state, job, emit);
}

function assistJob(state, crew, command, emit) {
  const job = state.jobs.find(item => item.id === command.jobId);
  const position = workPosition(state, crew, assistWorkTargets(state, job), command.workCellId);
  const timeKind = job.kind === 'fireControl' ? 'Fire' : job.kind === 'medical' ? 'Medical' : 'Repair';
  const previousTime = job.remainingTime;
  job.remainingTime = Math.min(previousTime, Math.max(0, state.config[`v2Assisted${timeKind}Time`] + storyJobTime(state, job.kind)));
  job.assistantId = crew.id;
  crew.position = position;
  crew.job = job.id;
  leaveStation(crew);
  observe(state, 'assistedJobs');
  record(emit, 'CREW_RELOCATED', `${nameOf(crew.id)} moves to safe work position ${position.join(', ')}.`, { crewId: crew.id, cellId: position[0] });
  record(emit, 'WORK_ASSISTED', `${nameOf(crew.id)} assists ${nameOf(job.crewId)}: ${previousTime} → ${job.remainingTime} Time remaining. Their normal crew action is consumed; no resources are spent.`, { crewId: crew.id, assistantId: crew.id, primaryCrewId: job.crewId, jobId: job.id, kind: job.kind, previousTime, remainingTime: job.remainingTime });
  if (job.remainingTime === 0) completeJobs(state, [job], emit);
}

export function resolveFireSpread(state, emit) {
  const spreadCandidates = new Set(BOARD.filter(cell => cell.structure && status(state, cell.id) === 'fire').map(cell => cell.id));
  const suppressedAtStart = new Set(state.jobs.filter(job => job.kind === 'fireControl').flatMap(job => job.cells));
  const initialSources = new Set([...spreadCandidates].filter(id => !suppressedAtStart.has(id)));
  const initialGroups = [];
  const initialRemaining = new Set(initialSources);
  while (initialRemaining.size) {
    const first = initialRemaining.values().next().value;
    initialRemaining.delete(first);
    const group = [first];
    for (let index = 0; index < group.length; index++) for (const adjacent of neighbors(group[index], false)) if (initialRemaining.delete(adjacent.id)) group.push(adjacent.id);
    initialGroups.push(group);
  }
  record(emit, 'FIRE_PHASE_STARTED', `Fire phase: ${initialGroups.length} unsuppressed fire group${initialGroups.length === 1 ? '' : 's'}; ${suppressedAtStart.size} square${suppressedAtStart.size === 1 ? '' : 's'} under suppression.`);
  const directions = { 3: [0, -1, 'fore'], 4: [1, 0, 'starboard'], 5: [0, 1, 'aft'], 6: [-1, 0, 'port'] };
  const spreadThisPhase = new Set();
  // A straddling crew member is struck once by a spread phase. Both occupied
  // subcells stop this first spread; another round can kill the injured member.
  const healthyAtStart = new Set(state.crew.filter(crew => crew.health === 'healthy').map(crew => crew.id));
  const affectedCrew = new Set();
  // The phase's source groups and protection are fixed at its start. Injury
  // removes the job immediately, but cannot add a retroactive roll this phase.
  for (const group of initialGroups) {
    const roll = die(state, 6);
    const direction = directions[roll];
    record(emit, 'FIRE_SPREAD_ROLL', `Fire group at ${group[0]} rolls ${roll}: ${direction ? `spread ${direction[2]}` : 'no spread'}.`, { roll, cellId: group[0], cells: [...group], result: direction?.[2] ?? 'no spread' });
    if (!direction) continue;
    const destinations = new Set();
    for (const id of group) {
      const source = getCell(id);
      const destination = BOARD.find(cell => cell.x === source.x + direction[0] && cell.y === source.y + direction[1]);
      if (destination?.structure && status(state, destination.id) !== 'fire' && !suppressedAtStart.has(destination.id) && !spreadThisPhase.has(destination.id)) destinations.add(destination.id);
    }
    if (!destinations.size) record(emit, 'FIRE_SPREAD_BLOCKED', `Fire from ${group.join(', ')} is blocked; no new aircraft square can catch fire in that direction.`, { cellId: group[0], cells: [...group], direction: direction[2] });
    for (const id of destinations) {
      spreadThisPhase.add(id);
      const occupants = state.crew.filter(crew => crew.health !== 'dead' && crew.position.includes(id));
      const blocked = state.config.crewBlocksFirstFire && occupants.some(crew => healthyAtStart.has(crew.id));
      record(emit, 'FIRE_SPREAD_TARGET', `Fire spreads toward ${id}.`, { cellId: id });
      for (const occupant of occupants) if (!affectedCrew.has(occupant.id)) {
        affectedCrew.add(occupant.id);
        injure(state, occupant, emit, `fire spreading toward ${id}`);
      }
      if (blocked) {
        record(emit, 'FIRE_STOPPED_BY_CREW', `${id}: the first spread injures its healthy occupant and stops here.`, { cellId: id });
      } else {
        state.cells[id] = 'fire';
        bump(state, 'firesStarted');
        record(emit, 'FIRE_STARTED', `${id} catches fire.`, { cellId: id });
        recalculateConditions(state, emit);
      }
    }
  }
  // Keep physical occupancy fixed throughout all frozen fire groups.
  cancelInvalidMedical(state, emit);
  returnCancelledMedical(state, emit);
}

function validateAction(state, crew, command) {
  const allowed = availableActions(state, crew.id).find(item => item.id === command.action);
  requireRule(allowed, 'That action is not available to this crew member.');
  requireRule(allowed.enabled, allowed.reason || 'That action is not available now.');
  if (command.assistantId) {
    requireRule(isV2(state) && ['repair', 'fireControl', 'medical'].includes(command.action), 'Assist is available for V2 crisis work only.');
    requireRule(eligibleAssistants(state, crew.id).some(item => item.id === command.assistantId), 'Choose a healthy, available second worker.');
    const targetCells = command.action === 'medical' ? person(state, command.targetId)?.position : command.cells;
    workPosition(state, person(state, command.assistantId), targetCells, command.assistantWorkCellId || command.workCellId);
  }
  switch (command.action) {
    case 'assistWork': {
      const job = eligibleAssistJobs(state, crew.id).find(item => item.id === command.jobId);
      requireRule(job, 'Choose an active job that this crew member can assist.');
      workPosition(state, crew, assistWorkTargets(state, job), command.workCellId);
      break;
    }
    case 'basicFire': case 'advancedFire': requireRule(gunArcLegal(state, crew.id, command.targetId), 'Choose a fighter inside the operating gun arc.'); break;
    case 'directFire': requireRule(directFireGunners(state).some(gunner => gunner.id === command.gunnerId) && gunArcLegal(state, command.gunnerId, command.targetId), 'Choose an operating gunner and a fighter in that gun arc.'); break;
    case 'repair': case 'fireControl': {
      const cells = command.cells || [];
      const cap = crisisTargetCap(state, crew.id, command.action);
      const desired = command.action === 'repair' ? 'damaged' : 'fire';
      requireRule(cells.length > 0 && cells.length <= cap, `Choose 1–${cap} connected ${desired} squares.`);
      requireRule(new Set(cells).size === cells.length, 'Choose each work square only once.');
      requireRule(cells.every(id => getCell(id)?.structure && status(state, id) === desired), `All selected squares must contain ${desired} aircraft structure.`);
      requireRule(!state.jobs.some(job => (job.cells || []).some(id => cells.includes(id))), 'A selected square already has active work.');
      requireRule(connected(cells, state.config.eightWayWork), 'Work squares must be connected.');
      workPosition(state, crew, cells, command.workCellId);
      break;
    }
    case 'medical': {
      const target = person(state, command.targetId);
      requireRule(target?.health === 'injured', 'Choose an injured crew member.');
      requireRule(target.position.length > 0 && target.position.every(id => isSafe(state, id)), 'Medical cannot treat a patient standing on Fire.');
      requireRule(!state.jobs.some(job => job.kind === 'medical' && job.targetId === target.id), 'Medical treatment is already in progress.');
      workPosition(state, crew, target.position, command.workCellId);
      break;
    }
    case 'relocate': requireRule(getCell(command.targetId)?.fuselage && isSafe(state, command.targetId) && !(crew.position.length === 1 && crew.position[0] === command.targetId) && !state.crew.some(other => other.id !== crew.id && other.health !== 'dead' && other.position.includes(command.targetId)), 'Choose another unoccupied, non-burning fuselage square.'); break;
    case 'manCockpit': requireRule(['pilot', 'copilot'].includes(command.stationId) && stationEmpty(state, command.stationId, crew.id) && !(crew.station === command.stationId && isAtStation(state, crew)), 'Choose an empty, non-burning cockpit seat.'); break;
    case 'manStation': requireRule(eligibleStations(state, crew.id).includes(command.stationId), 'Choose a vacant, non-burning station.'); break;
    case 'returnHome': requireRule(eligibleStations(state, crew.id).includes(homeStationId(crew)), 'Home station is not vacant and safe.'); break;
    case 'leaveStation': requireRule(stationExitPosition(state, crew.id), 'No safe interior space is available to leave for.'); break;
    case 'restartEngine': {
      const engine = state.engines.find(item => item.id === command.targetId);
      requireRule(engine && !engine.running && engineSquares(engine.id).every(cell => status(state, cell.id) === 'healthy'), 'Choose a stopped engine with both squares repaired.');
      break;
    }
    case 'convert': {
      const option = conversionOptions(state).find(item => item.to === command.to);
      requireRule(option, 'Choose Officer or Enlisted as the receiving pool.');
      requireRule(option.enabled, option.reason);
      break;
    }
    case 'rotateFighter': requireRule(fighter(state, command.targetId)?.facing < 180, 'Choose an active fighter less than 180° away.'); break;
  }
}

function resolveAction(state, crew, command, emit) {
  const action = command.action;
  record(emit, 'CREW_ACTION', `${nameOf(crew.id)}: ${availableActions(state, crew.id).find(item => item.id === action).label}.`, { crewId: crew.id, action });
  switch (action) {
    case 'basicFire': shoot(state, crew, command.targetId, emit); break;
    case 'advancedFire': spend(state, 'Enlisted', storyActionCost(state, 'advancedFire', 1), emit); consumeStoryAction(state, 'advancedFire', emit); shoot(state, crew, command.targetId, emit, true); break;
    case 'repair': case 'fireControl': case 'medical': startJob(state, crew, command, emit); break;
    case 'assistWork': assistJob(state, crew, command, emit); break;
    case 'relocate': crew.position = [command.targetId]; leaveStation(crew); record(emit, 'CREW_RELOCATED', `${nameOf(crew.id)} relocates to ${command.targetId}.`, { crewId: crew.id, cellId: command.targetId }); break;
    case 'manCockpit': occupyStation(state, crew, command.stationId, emit, 'COCKPIT_MANNED'); break;
    case 'manStation': occupyStation(state, crew, command.stationId, emit); break;
    case 'returnHome': occupyStation(state, crew, homeStationId(crew), emit, 'STATION_MANNED'); break;
    case 'leaveStation': {
      const cellId = stationExitPosition(state, crew.id);
      crew.position = [cellId]; leaveStation(crew);
      record(emit, 'CREW_RELOCATED', `${nameOf(crew.id)} leaves the station for safe interior position ${cellId}.`, { crewId: crew.id, cellId });
      break;
    }
    case 'restartEngine': {
      const roll = die(state, 6);
      record(emit, 'ENGINE_RESTART_ROLL', `${nameOf(crew.id)} rolls ${roll} to restart ${command.targetId}; 1–${state.config.restartMax} succeeds.`, { roll, engineId: command.targetId });
      if (roll <= state.config.restartMax) {
        const engine = state.engines.find(item => item.id === command.targetId);
        engine.running = true;
        engine.repairReady = false;
        bump(state, 'enginesRestarted');
        record(emit, 'ENGINE_RESTARTED', `${command.targetId} restarts.`, { engineId: command.targetId });
      } else record(emit, 'ENGINE_RESTART_FAILED', `${command.targetId} remains stopped.`, { engineId: command.targetId });
      break;
    }
    case 'directFire': {
      spend(state, 'Officer', state.config.directFireCost ?? 1, emit);
      const gunner = person(state, command.gunnerId);
      record(emit, 'PILOT_DIRECT_FIRE', `Pilot orders ${nameOf(gunner.id)} to make one Basic Fire shot.`, { crewId: crew.id, gunnerId: gunner.id, fighterId: command.targetId });
      shoot(state, gunner, command.targetId, emit);
      break;
    }
    case 'convert': {
      const option = conversionOptions(state).find(item => item.to === command.to);
      state.resources[option.from] -= option.cost;
      state.resources[option.to] += option.gain;
      const discarded = Math.max(0, option.cost - option.gain);
      if (discarded) state.bags.mission.discard.push(...Array(discarded).fill('Resource'));
      // Expansion takes already-present safe tokens, never an emergency refill.
      for (let index = 0; index < option.bagNeeded; index++) state.bags.mission.tokens.splice(state.bags.mission.tokens.indexOf('Resource'), 1);
      bump(state, `${option.from}Spent`, option.cost);
      bump(state, `${option.to}Gained`, option.gain);
      record(emit, 'RESOURCES_CONVERTED', `Copilot converts ${option.label}. ${discarded ? `${discarded} surplus Resource token(s) enter discard.` : `${option.bagNeeded} additional Resource token(s) leave the mission bag.`}`, { from: option.from, to: option.to, cost: option.cost, gain: option.gain, bagTaken: option.bagNeeded, discarded });
      break;
    }
    case 'rotateFighter': {
      const target = fighter(state, command.targetId);
      target.heading = turnHeadingAway(target);
      target.facing += 90;
      record(emit, 'FIGHTER_ROTATED', `Navigator turns ${target.type} 90° away; now ${target.facing}° off the B-17.`, { fighterId: target.id, facing: target.facing, heading: target.heading });
      break;
    }
    case 'escort': {
      spend(state, 'Enlisted', storyActionCost(state, 'escort', state.config.escortCost), emit);
      consumeStoryAction(state, 'escort', emit);
      const quadrant = QUADRANTS[die(state, 4) - 1];
      state.escorts.push({ id: `escort-${state.nextId++}`, quadrant, ...(isV2(state) ? { progress: state.mission.position } : { round: state.round }) });
      record(emit, 'ESCORT_SUMMONED', isV2(state) ? `Escort arrives in ${quadrant} until the next Progress checkpoint.` : `Escort arrives in ${quadrant} for the rest of Round ${state.round}.`, { quadrant });
      break;
    }
    case 'wait': record(emit, 'CREW_HELD_POSITION', `${nameOf(crew.id)} finishes their turn without taking an action.`, { crewId: crew.id }); break;
  }
}

function endActivation(state, emit) {
  if (isV2(state)) return completeContinuousTurn(state, emit, continuousSystems(state, emit));
  state.activeCrew = null;
  if (availableCrew(state).length && state.slot < CREW_DEFS.length) {
    state.phase = 'select';
    record(emit, 'CREW_SELECTION_READY', 'Choose the next available crew member.');
    return;
  }
  for (const crew of state.crew.filter(item => !item.used)) {
    if (state.slot >= CREW_DEFS.length) break;
    crew.used = true;
    state.slot++;
    record(emit, 'UNAVAILABLE_CREW_SLOT', `Time slot ${state.slot}/${CREW_DEFS.length}: ${nameOf(crew.id)} is ${crew.health === 'healthy' ? 'busy' : crew.health}; no crew action.`, { crewId: crew.id });
    if (state.config.unavailableDraws) missionDraw(state, crew, emit, { unavailable: true });
    else record(emit, 'UNAVAILABLE_DRAW_SKIPPED', 'Developer rule: unavailable crew skip the mission draw.');
    enemyPhase(state, emit);
  }
  state.phase = 'roundEnd';
  record(emit, 'ROUND_ACTIONS_COMPLETE', `All ${state.slot} crew time slots are complete. Resolve the end of round.`);
}

function continuousSystems(state, emit) {
  return { availableCrew, nameOf, missionDraw, enemyPhase, resolveFireSpread, recalculateConditions, resolveAltitude,
    completeJobs: jobs => completeJobs(state, jobs, emit) };
}

function storyServices(state, emit) {
  const workerFor = effect => {
    const cells = effect.kind === 'medical' ? person(state, effect.targetId)?.position : [effect.cellId];
    if (!cells?.length || (effect.kind === 'repair' && status(state, effect.cellId) !== 'damaged') || state.jobs.some(job => job.cells?.includes(effect.cellId))) return null;
    return state.crew.filter(crew => crew.health === 'healthy' && !crew.job && !underTreatment(state, crew.id) && legalWorkPositions(state, crew.id, cells).length)
      .sort((a, b) => Number(b.id === 'engineer') - Number(a.id === 'engineer'))[0] ?? null;
  };
  return {
    canWork: effect => Boolean(workerFor(effect)),
    startWork: (effect, thread) => {
      const worker = workerFor(effect);
      requireRule(worker, 'No healthy free worker can reach the Story work.');
      startJob(state, worker, { action: effect.kind, cells: [effect.cellId], targetId: effect.targetId }, emit, { time: effect.time, threadId: thread.id });
    },
    damage: (cellId, steps) => damageSquare(state, cellId, steps, emit, { injureCrew: false }),
    recalculate: () => recalculateConditions(state, emit),
    gainTime: () => gainBonusTime(state, emit, jobs => completeJobs(state, jobs, emit), 'story'),
  };
}

function startRound(state, emit) {
  state.round++;
  state.slot = 0;
  state.activeCrew = null;
  state.stats.rounds = state.round;
  record(emit, 'ROUND_STARTED', `Round ${state.round} begins.`);
  for (const name of ['mission', 'combat']) {
    const count = state.bags[name].discard.length;
    refillBag(state.bags[name]);
    record(emit, name === 'mission' ? 'MISSION_BAG_REFILLED' : 'COMBAT_BAG_REFILLED', `${name === 'mission' ? 'Mission' : 'Combat'} bag receives ${count} discarded tokens. Held resources remain outside the bag.`);
  }
  const completing = state.jobs.filter(job => job.completeRound <= state.round);
  completeJobs(state, completing, emit);
  for (const crew of state.crew) { crew.used = false; crew.activationCompleted = false; crew.lastAction = null; }
  record(emit, 'CREW_READIED', 'Healthy crew without crisis jobs are ready.');
  if (state.escorts.length) { state.escorts = []; record(emit, 'ESCORTS_EXPIRED', 'Previous-round escorts depart.'); }
  resolveFireSpread(state, emit);
  state.phase = 'select';
  if (!availableCrew(state).length) endActivation(state, emit);
  else record(emit, 'CREW_SELECTION_READY', 'Choose an available crew member. Radio may declare Intercept before drawing.');
}

function loseAltitude(state, cause, emit) {
  state.altitude = Math.max(0, state.altitude - 1);
  state.stats.altitudeLostByCause ||= { control: 0, structure: 0, engines: 0 };
  state.stats.altitudeLostByCause[cause]++;
  record(emit, 'ALTITUDE_LOST', `${cause[0].toUpperCase() + cause.slice(1)} failure: lose 1 altitude. Altitude is now ${state.altitude}.`, { cause });
}

function altitudeCheck(state, cause, minimum, emit, explanation) {
  record(emit, 'ALTITUDE_CHECK', `${cause[0].toUpperCase() + cause.slice(1)} check: ${explanation}`, { cause, minimum });
  if (minimum === 0) { record(emit, 'ALTITUDE_MAINTAINED', `${cause}: altitude maintained without a roll.`, { cause }); return; }
  if (minimum === 7) { loseAltitude(state, cause, emit); return; }
  const roll = die(state, 6);
  record(emit, 'ALTITUDE_ROLL', `${cause}: rolled ${roll}; ${minimum}+ maintains altitude.`, { cause, roll, minimum });
  if (roll < minimum) loseAltitude(state, cause, emit);
  else record(emit, 'ALTITUDE_MAINTAINED', `${cause}: altitude maintained.`, { cause });
}

export function resolveAltitude(state, emit) {
  const config = state.config;
  const cockpit = state.crew.filter(crew => cockpitSeat(state, crew));
  const trained = cockpit.some(crew => hasTag(crew, 'Pilot'));
  const officer = cockpit.some(crew => rankOf(crew) === 'Officer');
  altitudeCheck(state, 'control', trained ? 0 : officer ? config.controlOfficerMin : cockpit.length ? config.controlEnlistedMin : 7, emit, trained ? 'A trained pilot is correctly seated.' : officer ? 'An Officer substitute is seated.' : cockpit.length ? 'An Enlisted substitute is seated.' : 'Nobody can control the aircraft.');
  const count = state.compromised.length;
  if (count >= config.structureFatal) {
    record(emit, 'ALTITUDE_CHECK', `Structure check: ${count} compromised sections meet the ${config.structureFatal}-section destruction threshold.`, { cause: 'structure' });
    state.outcome = 'destroyed';
    state.endReason = { cause: 'structure', compromisedSections: count };
    record(emit, 'AIRCRAFT_DESTROYED', 'Structural failure destroys the aircraft.', { cause: 'structure' });
  } else altitudeCheck(state, 'structure', count <= config.structureSafe ? 0 : count <= config.structureMid ? config.structureMidMin : config.structureHighMin, emit, `${count} compromised section${count === 1 ? '' : 's'}.`);
  const stopped = state.engines.filter(engine => !engine.running).length;
  altitudeCheck(state, 'engines', stopped <= config.enginesSafe ? 0 : stopped >= config.enginesAuto ? 7 : stopped <= config.enginesMid ? config.enginesMidMin : config.enginesHighMin, emit, `${stopped} engines stopped.`);
  if (state.altitude <= 0 && !state.outcome) {
    state.outcome = 'destroyed';
    state.endReason = { cause: 'altitude', altitude: state.altitude };
    record(emit, 'AIRCRAFT_DESTROYED', 'The B-17 reaches the ground.', { cause: 'altitude' });
  }
}

function endRound(state, emit) {
  record(emit, 'ROUND_END_STARTED', `Round ${state.round} ends. Independent control, structure and engine checks follow.`);
  if (state.config.clearFighters && state.fighters.length) {
    const count = state.fighters.length;
    state.fighters = [];
    record(emit, 'FIGHTERS_CLEARED', `${count} surviving fighter${count === 1 ? '' : 's'} leave at round end.`);
  }
  if (state.escorts.length) { state.escorts = []; record(emit, 'ESCORTS_EXPIRED', 'Current-round escorts depart.'); }
  recalculateConditions(state, emit);
  resolveAltitude(state, emit);
  if (state.outcome) {
    state.phase = 'ended';
    state.endedAt = Date.now();
    recordSortieEnd(state, emit);
    return;
  }
  state.mission.position++;
  const home = state.config.outboundLength + state.config.returnLength;
  record(emit, 'MISSION_ADVANCED', `The B-17 advances to mission space ${state.mission.position}/${home}.`);
  if (state.mission.position >= home && state.mission.bombed) {
    state.phase = 'ended';
    state.outcome = 'success';
    state.endReason = { cause: 'home' };
    state.endedAt = Date.now();
    recordSortieEnd(state, emit);
  } else if (state.mission.position >= state.config.outboundLength && !state.mission.bombed) {
    state.phase = 'bombing';
    record(emit, 'BOMBING_READY', 'TARGET reached. Resolve the provisional bombing step.');
  } else {
    state.phase = 'ready';
    record(emit, 'NEXT_ROUND_READY', `Ready for Round ${state.round + 1}.`);
  }
}

export function dispatch(original, command) {
  requireRule(original && command, 'State and command are required.');
  const state = migrateCrewPositions(copy(original));
  if (state.ruleset === undefined) state.ruleset = 'v1';
  requireRule(['v1', 'v2-continuous'].includes(state.ruleset), 'Unknown sortie ruleset.');
  requireRule(command.ruleset === undefined || command.ruleset === state.ruleset, 'Ruleset changes apply only to a new sortie.');
  ensureV2Telemetry(state);
  if (isV2(state)) state.overflowTimeTokens ??= [];
  // Old autosaves/snapshots can resume without a version reset or RNG changes.
  for (const target of state.fighters) target.heading = fighterHeading(target);
  const events = [];
  const emit = event => events.push({ ...event, state: copy(state) });
  cancelInvalidMedical(state, emit);
  returnCancelledMedical(state, emit);
  requireRule(state.phase !== 'ended', 'This sortie has ended. Start a new sortie to continue.');
  requireRule(state.phase !== 'story' || command.type === 'storyChoice', 'Resolve the current Story situation before continuing tactical play.');
  switch (command.type) {
    case 'storyChoice': chooseStory(state, command.choiceId, emit, storyServices(state, emit)); break;
    case 'turnBack': turnBack(state, emit, command.confirmed); break;
    case 'placeBombDie': placeBombDie(state, command.slot, command.dieIndex, emit); break;
    case 'rerollBombDie': rerollBombDie(state, command.dieIndex, command.source, emit); break;
    case 'commitBombRun':
      commitBombRun(state, emit);
      continueCycle(state, emit, continuousSystems(state, emit));
      break;
    case 'abortWork': {
      requireRule(canAbortWork(state, command.jobId), 'Abort Work requires an active job during normal V2 crew selection, with no pending Progress or action.');
      const job = state.jobs.find(item => item.id === command.jobId);
      requireRule(job, 'That work is no longer active.');
      cancelWork(state, job, emit, 'the crew aborts the assignment.');
      break;
    }
    case 'startRound': requireRule(!isV2(state) && state.phase === 'ready', 'A round can start only from the V1 ready phase.'); startRound(state, emit); break;
    case 'advanceUnavailable': {
      requireRule(isV2(state) && state.phase === 'select' && !state.pendingProgress && !availableCrew(state).length, 'Continue unavailable Turns only when no V2 crew can act and no Progress is pending.');
      continueCycle(state, emit, continuousSystems(state, emit));
      break;
    }
    case 'activate': {
      requireRule(state.phase === 'select', 'Choose crew only during the crew selection phase.');
      requireRule(!isV2(state) || !state.pendingProgress, 'Close the Opportunity window and resolve pending Progress before activating crew.');
      const crew = availableCrew(state).find(item => item.id === command.crewId);
      requireRule(crew, 'That crew member is not available.');
      requireRule(!command.intercept || hasAbility(crew, 'intercept') && isAtStation(state, crew), 'Intercept requires Radio at an operating station and must be declared before drawing.');
      crew.used = true;
      if (isV2(state)) crew.cycleSlotConsumed = true;
      crew.activationCompleted = false;
      state.slot++;
      state.activeCrew = crew.id;
      record(emit, 'CREW_ACTIVATED', isV2(state) ? `Turn ${state.crewCycle.turn + 1}, Crew Cycle ${state.crewCycle.number}: activate ${nameOf(crew.id)}.` : `Time slot ${state.slot}/${CREW_DEFS.length}: activate ${nameOf(crew.id)}.`, { crewId: crew.id });
      if (command.intercept) record(emit, 'INTERCEPT_DECLARED', 'Radio declares Intercept before the mission draw.', { crewId: crew.id });
      missionDraw(state, crew, emit, { intercept: Boolean(command.intercept) });
      if (crew.health !== 'healthy' || crew.job) {
        record(emit, 'CREW_ACTION_LOST', `${nameOf(crew.id)} can no longer perform an action after the mission draw.`, { crewId: crew.id });
        enemyPhase(state, emit);
        endActivation(state, emit);
      } else {
        state.phase = 'action';
        record(emit, 'CREW_ACTION_READY', `${nameOf(crew.id)} may take exactly one action.`, { crewId: crew.id });
      }
      break;
    }
    case 'action': {
      requireRule(state.phase === 'action', 'Choose an action only after activating crew and resolving its draw.');
      const crew = person(state, state.activeCrew);
      requireRule(crew?.health === 'healthy' && !crew.job && !underTreatment(state, crew.id), 'The active crew member cannot act.');
      validateAction(state, crew, command);
      crew.lastAction = command.action;
      resolveAction(state, crew, command, emit);
      if (isV2(state)) refreshTimeRequirement(state);
      crew.activationCompleted = true;
      record(emit, 'ACTIVATION_COMPLETED', `${nameOf(crew.id)} has completed their normal action.`, { crewId: crew.id });
      state.phase = 'opportunity';
      if (opportunityAvailability(state).enabled) {
        record(emit, 'OPPORTUNITY_WINDOW_OPENED', 'Opportunity window: take Basic Shots with eligible crew, or Continue to the enemy phase.', { crewId: crew.id });
      } else {
        if (state.config.opportunityEnabled && state.opportunity > 0) {
          const chance = opportunityAvailability(state);
          record(emit, 'OPPORTUNITY_UNAVAILABLE', `No Opportunity Shot: ${chance.reason}`, { crewId: crew.id, reason: chance.reason });
        }
        enemyPhase(state, emit);
        endActivation(state, emit);
      }
      break;
    }
    case 'continueEnemyPhase': {
      requireRule(state.phase === 'opportunity', 'Continue only from the Opportunity window.');
      enemyPhase(state, emit);
      endActivation(state, emit);
      break;
    }
    case 'continueBetweenOpportunity': {
      requireRule(isV2(state) && state.config.v2OpportunityProvokesEnemyPhase && state.phase === 'betweenOpportunity' && !state.pendingProgress,
        'Continue to the enemy phase only after an experimental between-turn Opportunity sequence.');
      record(emit, 'OPPORTUNITY_WINDOW_CLOSED', 'Between-turn Opportunity sequence closed; resolve one enemy phase before the next crew activation.');
      enemyPhase(state, emit);
      state.activeCrew = null;
      state.phase = 'select';
      record(emit, 'CREW_SELECTION_READY', 'Enemy phase complete. Choose the next available crew member.');
      break;
    }
    case 'continueProgress': {
      requireRule(isV2(state) && ['select', 'betweenOpportunity'].includes(state.phase) && !state.activeCrew && state.pendingProgress,
        'Continue to Progress only after a between-turn Opportunity chain fills Time.');
      completeBetweenTurnProgress(state, emit, continuousSystems(state, emit));
      break;
    }
    case 'opportunityShot': {
      const availability = opportunityAvailability(state);
      requireRule(availability.enabled, availability.reason);
      const gunner = availability.gunners.find(crew => crew.id === command.gunnerId);
      requireRule(gunner && gunArcLegal(state, gunner.id, command.targetId), 'Choose a healthy gunner with a completed activation, an operating gun and a fighter in its arc.');
      state.opportunity--;
      bump(state, 'opportunitySpent');
      record(emit, 'OPPORTUNITY_SPENT', `Spend 1 Opportunity: ${nameOf(gunner.id)} makes exactly one Basic Shot. No activation, mission draw or enemy phase.`, { crewId: gunner.id, fighterId: command.targetId, amount: 1 });
      shoot(state, gunner, command.targetId, emit);
      if (isV2(state) && state.phase === 'select' && state.pendingProgress) {
        state.phase = 'betweenOpportunity';
        record(emit, 'OPPORTUNITY_WINDOW_OPENED', 'Finish any Opportunity Shots, then Continue to Progress before activating crew. No enemy phase is due.');
      } else if (isV2(state) && state.phase === 'select' && state.config.v2OpportunityProvokesEnemyPhase) {
        state.phase = 'betweenOpportunity';
        record(emit, 'OPPORTUNITY_WINDOW_OPENED', 'Between-turn Opportunity window: chain any remaining shots, then continue to the enemy phase before activating crew.');
      }
      break;
    }
    case 'endRound': requireRule(!isV2(state) && state.phase === 'roundEnd', 'Complete all V1 crew slots before ending the round.'); endRound(state, emit); break;
    case 'bomb':
      requireRule(state.phase === 'bombing', 'Bombing is available only at the target.');
      if (isV2(state)) {
        beginBombRun(state, emit);
        if (state.phase === 'select') continueCycle(state, emit, continuousSystems(state, emit));
      } else {
        resolveBombing(state, emit);
        state.phase = 'ready'; record(emit, 'NEXT_ROUND_READY', 'Bombing complete. Start the next round for the return journey.');
      }
      break;
    default: throw new Error(`Unknown command: ${command.type}`);
  }
  reconcileStory(state, emit);
  if (state.storyBoundaryReady) {
    delete state.storyBoundaryReady;
    evaluateStoryBoundary(state, emit, storyServices(state, emit));
  }
  // Story owns the target boundary before any Bomb Run dice are rolled.
  if (storyEnabled(state) && state.phase === 'bombing' && !state.mission.bombRun && !state.outcome) {
    beginBombRun(state, emit);
    reconcileStory(state, emit);
  }
  if (storyEnabled(state) && !state.outcome) refreshTimeRequirement(state);
  return { state, events };
}
