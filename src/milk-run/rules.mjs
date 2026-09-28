/** Milk Run v3 rules. Mutations are transactional; semantic events carry snapshots.
 * UI choices occur only in select/action/bombing phases. No timers or DOM here.
 */
import { BOARD, CREW_DEFS, STATIONS, SECTIONS, QUADRANTS, ALTITUDES, getCell, neighbors } from './board.mjs';
import { ENEMY_DEFS, RESOURCE_BY_RANK } from './config.mjs';
import { die, drawBag, refillBag, drawDeck } from './random.mjs';
import { resolveBombing } from './bombing.mjs';

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

export function isAtStation(state, crew) {
  const expected = stationCells(crew.station);
  return expected.length > 0 && crew.health === 'healthy' && !crew.job &&
    expected.every(id => crew.position.includes(id) && isSafe(state, id)) &&
    crew.position.length === expected.length;
}

export function availableCrew(state) {
  return state.crew.filter(crew => crew.health === 'healthy' && !crew.used && !crew.job);
}

export function gunArcLegal(state, crewId, fighterId) {
  const crew = person(state, crewId);
  const target = fighter(state, fighterId);
  if (!crew || !target || !isAtStation(state, crew)) return false;
  const arc = def(crew.station)?.arc;
  return Boolean(arc && arc.quadrants.includes(target.quadrant) && arc.altitudes.includes(target.altitude));
}

export function legalTargets(state, crewId) {
  return state.fighters.filter(target => gunArcLegal(state, crewId, target.id));
}

function stationEmpty(state, stationId, exceptId) {
  const cells = stationCells(stationId);
  return cells.length && cells.every(id => isSafe(state, id)) && !state.crew.some(crew =>
    crew.id !== exceptId && crew.health !== 'dead' && crew.position.some(id => cells.includes(id)));
}

function cockpitSeat(state, crew) {
  return ['pilot', 'copilot'].includes(crew.station) && isAtStation(state, crew);
}

export function availableActions(state, crewId = state.activeCrew) {
  const crew = person(state, crewId);
  if (!crew || crew.health !== 'healthy' || crew.job) return [];
  const rank = rankOf(crew);
  const affordable = (pool, amount) => state.resources[pool] >= amount;
  const jobsCells = new Set(state.jobs.flatMap(job => job.cells || []));
  const actions = [];
  const add = (id, label, enabled = true, reason = '', cost) => actions.push({ id, label, enabled, ...(enabled ? {} : { reason }), ...(cost ? { cost } : {}) });
  const targets = legalTargets(state, crewId);
  if (def(crew.id).arc) {
    add('basicFire', 'Basic Fire', targets.length > 0, 'No fighter in an operating gun arc.');
    add('advancedFire', 'Advanced Fire', targets.length > 0 && affordable('Enlisted', 1), targets.length ? 'Needs 1 Enlisted resource.' : 'No fighter in an operating gun arc.', '1 Enlisted');
  }
  for (const [id, label, targetStatus, cost] of [
    ['repair', 'Repair', 'damaged', state.config.repairCost],
    ['fireControl', 'Fire Control', 'fire', state.config.fireCost],
  ]) {
    const any = BOARD.some(cell => cell.structure && status(state, cell.id) === targetStatus && !jobsCells.has(cell.id));
    add(id, label, any && affordable(rank, cost), !any ? `No available ${targetStatus} squares.` : `Needs ${cost} ${rank} resource.`, cost ? `${cost} ${rank}` : undefined);
  }
  const injured = state.crew.some(target => target.health === 'injured' && !state.jobs.some(job => job.kind === 'medical' && job.targetId === target.id));
  add('medical', 'Medical', injured && affordable(rank, state.config.medicalCost), !injured ? 'No untreated injured crew.' : `Needs ${state.config.medicalCost} ${rank} resource.`, state.config.medicalCost ? `${state.config.medicalCost} ${rank}` : undefined);
  add('relocate', 'Relocate', BOARD.some(cell => cell.fuselage && isSafe(state, cell.id) &&
    !(crew.position.length === 1 && crew.position[0] === cell.id) &&
    !state.crew.some(other => other.id !== crew.id && other.health !== 'dead' && other.position.includes(cell.id))), 'No other safe, unoccupied fuselage position.');
  const seats = ['pilot', 'copilot'].some(id => stationEmpty(state, id, crew.id) && !(crew.station === id && isAtStation(state, crew)));
  add('manCockpit', 'Man Cockpit', seats, 'No empty, safe cockpit seat.');
  if (cockpitSeat(state, crew)) {
    const ready = state.engines.some(engine => !engine.running && engineSquares(engine.id).every(cell => status(state, cell.id) === 'healthy'));
    add('restartEngine', 'Restart Engine', ready, 'No stopped engine has both squares repaired.');
  }
  if (hasAbility(crew, 'orderShot')) {
    const eligible = state.crew.some(gunner => gunner.used && gunner.id !== crew.id && legalTargets(state, gunner.id).length);
    add('orderShot', 'Order Basic Shot', eligible && affordable('Officer', state.config.orderShotCost), !eligible ? 'No already-used gunner has a legal target.' : 'Needs Officer resources.', `${state.config.orderShotCost} Officer`);
  }
  if (hasAbility(crew, 'convert')) add('convert', 'Convert Resources', Math.max(state.resources.Officer, state.resources.Enlisted) >= state.config.conversionRate, `Needs ${state.config.conversionRate} of one resource.`, `${state.config.conversionRate}:1`);
  if (hasAbility(crew, 'rotateFighter')) add('rotateFighter', 'Distract Fighter', state.fighters.some(item => item.facing < 180), 'No fighter can turn farther away.');
  if (hasAbility(crew, 'escort')) add('escort', 'Summon Escort', affordable('Enlisted', state.config.escortCost), 'Needs Enlisted resources.', `${state.config.escortCost} Enlisted`);
  add('wait', 'Hold Position');
  return actions;
}

function spend(state, rank, amount, emit) {
  requireRule(state.resources[rank] >= amount, `Not enough ${rank} resources.`);
  state.resources[rank] -= amount;
  state.bags.mission.discard.push(...Array(amount).fill('Resource'));
  bump(state, `${rank}Spent`, amount);
  record(emit, 'RESOURCE_SPENT', `Spent ${amount} ${rank}. ${amount} resource token${amount === 1 ? '' : 's'} will return on refill.`, { rank, amount });
}

function cancelJob(state, crew, emit) {
  if (!crew.job) return;
  state.jobs = state.jobs.filter(job => job.id !== crew.job);
  crew.job = null;
  record(emit, 'WORK_CANCELLED', `${nameOf(crew.id)} can no longer continue crisis work.`, { crewId: crew.id });
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
  if (injureCrew) for (const crew of state.crew.filter(item => item.health !== 'dead' && item.position.includes(cellId))) injure(state, crew, emit, `the hit at ${cellId}`);
  recalculateConditions(state, emit);
}

export function resolveAttack(state, emit, { source = 'Enemy', fighterId, roll, cellId } = {}) {
  bump(state, 'enemyAttacks');
  record(emit, 'ENEMY_ATTACK', `${source} attacks.`, { fighterId });
  const result = roll ?? die(state, 6);
  record(emit, 'ENEMY_ATTACK_ROLL', `${source} rolls ${result}: ${result === 1 ? 'MISS' : result === 6 ? 'CRITICAL HIT' : 'HIT'}.`, { fighterId, roll: result, result: result === 1 ? 'miss' : result === 6 ? 'critical' : 'hit' });
  if (result === 1) return;
  bump(state, 'enemyHits');
  if (result === 6) bump(state, 'enemyCrits');
  const location = cellId ?? `${'ABCDEF'[die(state, 6) - 1]}${die(state, 6)}-${die(state, 4)}`;
  record(emit, 'ENEMY_HIT_LOCATION', `Hit location: ${location}.`, { cellId: location, fighterId });
  damageSquare(state, location, result === 6 ? 2 : 1, emit);
}

function killFighter(state, target, emit, cause) {
  const index = state.fighters.findIndex(item => item.id === target.id);
  if (index < 0) return;
  state.fighters.splice(index, 1);
  bump(state, 'fightersKilled');
  record(emit, 'FIGHTER_DESTROYED', `${target.type} is destroyed by ${cause}. Remaining fighters move forward in queue order.`, { fighterId: target.id });
}

function damageFighter(state, target, amount, emit, cause) {
  target.hp = Math.max(0, target.hp - amount);
  record(emit, 'FIGHTER_DAMAGED', `${cause}: ${target.type} loses ${amount} HP (${target.hp}/${target.maxHp}).`, { fighterId: target.id, amount });
  if (!target.hp) killFighter(state, target, emit, cause);
}

export function postAttackPosition(state, fighterId, emit, sector) {
  const target = fighter(state, fighterId);
  if (!target) return;
  const origin = target.quadrant;
  const destination = sector || { quadrant: QUADRANTS[die(state, 4) - 1], altitude: ALTITUDES[die(state, 3) - 1] };
  target.quadrant = destination.quadrant;
  target.altitude = destination.altitude;
  record(emit, 'FIGHTER_MOVED', `${target.type} flies to ${target.quadrant} / ${target.altitude}.`, { fighterId });
  const delta = Math.abs(QUADRANTS.indexOf(origin) - QUADRANTS.indexOf(target.quadrant));
  target.facing = Math.min(delta, 4 - delta) * 90;
  record(emit, 'FIGHTER_ROTATED', `${target.type} now faces ${target.facing === 0 ? 'the B-17' : `${target.facing}° away from the B-17`}.`, { fighterId, facing: target.facing });
  for (const escort of state.escorts.filter(item => item.quadrant === target.quadrant)) {
    if (!fighter(state, fighterId)) break;
    record(emit, 'ESCORT_INTERCEPT', `Escort in ${escort.quadrant} catches the passing ${target.type}.`, { fighterId, escortId: escort.id });
    damageFighter(state, target, 1, emit, 'Escort');
  }
}

function enemyPhase(state, emit) {
  record(emit, 'ENEMY_PHASE_STARTED', state.fighters.length ? 'Enemy phase: resolve fighters in visible queue order.' : 'Enemy phase: no active fighters.');
  for (const id of state.fighters.map(item => item.id)) {
    const target = fighter(state, id);
    if (!target) continue;
    if (target.facing > 0) {
      target.facing = Math.max(0, target.facing - 90);
      record(emit, 'FIGHTER_ROTATED', `${target.type} rotates 90° toward the B-17; ${target.facing === 0 ? 'now facing in, ready for its next enemy phase' : `${target.facing}° remains`}.`, { fighterId: id, facing: target.facing });
    } else {
      resolveAttack(state, emit, { source: target.type, fighterId: id });
      postAttackPosition(state, id, emit);
    }
  }
}

function flak(state, emit, reason) {
  bump(state, 'flakAttacks');
  record(emit, 'FLAK_STARTED', `${reason} Flak fires ${state.config.flakShots} consecutive shot${state.config.flakShots === 1 ? '' : 's'}.`);
  for (let shot = 0; shot < state.config.flakShots; shot++) resolveAttack(state, emit, { source: `Flak ${shot + 1}/${state.config.flakShots}` });
  record(emit, 'FLAK_ENDED', 'Flak salvo complete.');
}

function missionDraw(state, crew, emit, { unavailable = false, intercept = false } = {}) {
  const draw = drawBag(state, state.bags.mission);
  if (draw.refilled) record(emit, 'MISSION_BAG_REFILLED', 'The mission bag was empty. Emergency refill from its discard pool.');
  const token = draw.token;
  if (!token) {
    record(emit, 'MISSION_BAG_EMPTY', 'The mission bag and discard are empty; no mission token is available.');
    return;
  }
  bump(state, 'missionDraws');
  record(emit, 'MISSION_TOKEN_DRAWN', `${nameOf(crew.id)}${unavailable ? ' unavailable slot' : ''} draws ${token}.`, { crewId: crew.id, token });
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
  state.bags.mission.discard.push(token);
  if (intercept) return flak(state, emit, 'Radio Intercept turns the Enemy draw into Flak.');
  if (state.fighters.length >= state.config.maxFighters) return flak(state, emit, 'The fighter queue is full; no enemy card is drawn.');
  const deckDraw = drawDeck(state, state.deck);
  const card = typeof deckDraw === 'string' ? deckDraw : deckDraw.card ?? deckDraw.token;
  if (deckDraw?.refilled) record(emit, 'ENEMY_DECK_SHUFFLED', 'The enemy deck is exhausted; reshuffle its discard.');
  if (!card) { record(emit, 'ENEMY_DECK_EMPTY', 'No enemy card is available.'); return; }
  record(emit, 'ENEMY_CARD_DRAWN', `Enemy card: ${card}.`, { enemyType: card });
  if (card === 'Flak') return flak(state, emit, 'A Flak card was drawn.');
  const enemyDef = ENEMY_DEFS[card];
  const spawned = { id: `fighter-${state.nextId++}`, type: card, hp: enemyDef.hp, maxHp: enemyDef.hp, quadrant: QUADRANTS[die(state, 4) - 1], altitude: ALTITUDES[die(state, 3) - 1], facing: state.config.spawnFacing };
  state.fighters.push(spawned);
  bump(state, 'fightersSpawned');
  record(emit, 'FIGHTER_SPAWNED', `${card} joins queue slot ${state.fighters.length} at ${spawned.quadrant} / ${spawned.altitude}, ${spawned.facing === 0 ? 'facing the B-17' : '90° off-angle'}.`, { fighterId: spawned.id });
}

function combatPull(state, emit, crewId) {
  const result = drawBag(state, state.bags.combat);
  if (result.refilled) record(emit, 'COMBAT_BAG_REFILLED', 'The combat bag was empty. Emergency refill from its discard pool.');
  if (!result.token) {
    record(emit, 'COMBAT_BAG_EMPTY', 'No combat tokens are available; the shot misses.');
    return 'Miss';
  }
  state.bags.combat.discard.push(result.token);
  record(emit, 'GUNNER_SHOT_ROLL', `${nameOf(crewId)} pulls ${result.token.toUpperCase()}.`, { crewId, token: result.token });
  return result.token;
}

function shoot(state, crew, targetId, emit, advanced = false) {
  let pulls = 0;
  let firstMissRetry = false;
  record(emit, 'GUNNER_FIRE_STARTED', `${nameOf(crew.id)} uses ${advanced ? 'Advanced' : 'Basic'} Fire against ${fighter(state, targetId).type}.`, { crewId: crew.id, fighterId: targetId });
  while (fighter(state, targetId)) {
    const token = combatPull(state, emit, crew.id);
    pulls++;
    if (token === 'Hit') damageFighter(state, fighter(state, targetId), 1, emit, nameOf(crew.id));
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

function workPosition(state, crew, targetIds) {
  const origin = getCell(targetIds[0]);
  const candidates = BOARD.filter(cell => cell.structure && isSafe(state, cell.id) && !state.crew.some(other => other.id !== crew.id && other.health !== 'dead' && other.position.includes(cell.id)));
  candidates.sort((a, b) => (Math.abs(a.x - origin.x) + Math.abs(a.y - origin.y)) - (Math.abs(b.x - origin.x) + Math.abs(b.y - origin.y)) || Number(b.fuselage) - Number(a.fuselage));
  requireRule(candidates.length, 'No safe work position is available.');
  return [candidates[0].id];
}

function returnWorker(state, crew, emit) {
  if (crew.health === 'dead') return;
  if (stationEmpty(state, crew.station, crew.id)) {
    crew.position = [...stationCells(crew.station)];
    record(emit, 'CREW_RETURNED', `${nameOf(crew.id)} returns to ${STATIONS[crew.station].name}.`, { crewId: crew.id });
  } else record(emit, 'CREW_DISPLACED', `${nameOf(crew.id)} stays at the work position because the assigned station is burning or occupied. General actions remain available.`, { crewId: crew.id });
}

function finishJob(state, job, emit) {
  const crew = person(state, job.crewId);
  record(emit, 'WORK_COMPLETING', `${nameOf(job.crewId)} completes ${job.kind === 'fireControl' ? 'Fire Control' : job.kind}.`, { crewId: job.crewId });
  if (job.kind === 'medical') {
    const target = person(state, job.targetId);
    if (target?.health === 'injured') {
      target.health = 'healthy';
      record(emit, 'CREW_HEALED', `${nameOf(target.id)} is healthy again.`, { crewId: target.id });
    } else record(emit, 'MEDICAL_NO_EFFECT', `${nameOf(job.targetId)} no longer has a treatable injury.`, { crewId: job.targetId });
  } else for (const id of job.cells) {
    if (job.kind === 'repair' && status(state, id) === 'damaged') {
      state.cells[id] = 'healthy';
      bump(state, 'repairs');
      record(emit, 'AIRCRAFT_SQUARE_REPAIRED', `${id}: damaged structure is repaired to healthy.`, { cellId: id, crewId: job.crewId });
    } else if (job.kind === 'fireControl' && status(state, id) === 'fire') {
      state.cells[id] = state.config.extinguishLeavesDamage ? 'damaged' : 'healthy';
      record(emit, 'FIRE_EXTINGUISHED', `${id}: fire is extinguished, leaving ${state.cells[id]} structure.`, { cellId: id, crewId: job.crewId });
    } else record(emit, 'WORK_TARGET_CHANGED', `${id}: its condition changed; this part of the job has no effect.`, { cellId: id });
  }
  state.jobs = state.jobs.filter(item => item.id !== job.id);
  if (crew) { crew.job = null; returnWorker(state, crew, emit); }
  recalculateConditions(state, emit);
}

function startJob(state, crew, command, emit) {
  const kind = command.action;
  const targetCells = kind === 'medical' ? person(state, command.targetId).position : command.cells;
  const location = workPosition(state, crew, targetCells);
  const durationKey = kind === 'fireControl' ? 'fireDuration' : `${kind}Duration`;
  const duration = state.config[durationKey];
  const costKey = kind === 'fireControl' ? 'fireCost' : `${kind}Cost`;
  if (state.config[costKey]) spend(state, rankOf(crew), state.config[costKey], emit);
  crew.position = location;
  record(emit, 'CREW_RELOCATED', `${nameOf(crew.id)} moves to safe work position ${location.join(', ')}.`, { crewId: crew.id, cellId: location[0] });
  const job = { id: `job-${state.nextId++}`, kind, crewId: crew.id, targetId: command.targetId || null, cells: kind === 'medical' ? [] : [...command.cells], completeRound: state.round + duration, workPosition: location };
  crew.job = job.id;
  state.jobs.push(job);
  record(emit, 'WORK_STARTED', `${nameOf(crew.id)} starts ${kind === 'fireControl' ? 'Fire Control' : kind}${kind === 'medical' ? ` on ${nameOf(command.targetId)}` : ` at ${command.cells.join(', ')}`}. ${duration === 0 ? 'Completes now.' : `Completes at Round ${job.completeRound} Start.`}${kind === 'fireControl' ? ' Selected fires are suppressed while this job remains active.' : ''}`, { crewId: crew.id, jobId: job.id });
  if (duration === 0) finishJob(state, job, emit);
}

export function resolveFireSpread(state, emit) {
  const suppressed = new Set(state.jobs.filter(job => job.kind === 'fireControl').flatMap(job => job.cells));
  const remaining = new Set(BOARD.filter(cell => cell.structure && status(state, cell.id) === 'fire' && !suppressed.has(cell.id)).map(cell => cell.id));
  const groups = [];
  while (remaining.size) {
    const first = remaining.values().next().value;
    remaining.delete(first);
    const group = [first];
    for (let index = 0; index < group.length; index++) for (const adjacent of neighbors(group[index], false)) if (remaining.delete(adjacent.id)) group.push(adjacent.id);
    groups.push(group);
  }
  record(emit, 'FIRE_PHASE_STARTED', `Fire phase: ${groups.length} unsuppressed fire group${groups.length === 1 ? '' : 's'}; ${suppressed.size} square${suppressed.size === 1 ? '' : 's'} under suppression.`);
  const directions = { 3: [0, -1, 'fore'], 4: [1, 0, 'starboard'], 5: [0, 1, 'aft'], 6: [-1, 0, 'port'] };
  const spreadThisPhase = new Set();
  // A straddling crew member is struck once by a spread phase. Both occupied
  // subcells stop this first spread; another round can kill the injured member.
  const healthyAtStart = new Set(state.crew.filter(crew => crew.health === 'healthy').map(crew => crew.id));
  const affectedCrew = new Set();
  for (const group of groups) {
    const roll = die(state, 6);
    const direction = directions[roll];
    record(emit, 'FIRE_SPREAD_ROLL', `Fire group at ${group[0]} rolls ${roll}: ${direction ? `spread ${direction[2]}` : 'no spread'}.`, { roll, cellId: group[0] });
    if (!direction) continue;
    const destinations = new Set();
    for (const id of group) {
      const source = getCell(id);
      const destination = BOARD.find(cell => cell.x === source.x + direction[0] && cell.y === source.y + direction[1]);
      if (destination?.structure && status(state, destination.id) !== 'fire' && !suppressed.has(destination.id) && !spreadThisPhase.has(destination.id)) destinations.add(destination.id);
    }
    if (!destinations.size) record(emit, 'FIRE_SPREAD_BLOCKED', 'This fire has no new aircraft square in that direction.');
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
}

function validateAction(state, crew, command) {
  const allowed = availableActions(state, crew.id).find(item => item.id === command.action);
  requireRule(allowed, 'That action is not available to this crew member.');
  requireRule(allowed.enabled, allowed.reason || 'That action is not available now.');
  switch (command.action) {
    case 'basicFire': case 'advancedFire': requireRule(gunArcLegal(state, crew.id, command.targetId), 'Choose a fighter inside the operating gun arc.'); break;
    case 'repair': case 'fireControl': {
      const cells = command.cells || [];
      const cap = command.action === 'repair' ? state.config.repairCap + (hasAbility(crew, 'enhancedRepair') ? state.config.engineerBonus : 0) : state.config.fireCap;
      const desired = command.action === 'repair' ? 'damaged' : 'fire';
      requireRule(cells.length > 0 && cells.length <= cap, `Choose 1–${cap} connected ${desired} squares.`);
      requireRule(new Set(cells).size === cells.length, 'Choose each work square only once.');
      requireRule(cells.every(id => getCell(id)?.structure && status(state, id) === desired), `All selected squares must contain ${desired} aircraft structure.`);
      requireRule(!state.jobs.some(job => (job.cells || []).some(id => cells.includes(id))), 'A selected square already has active work.');
      requireRule(connected(cells, state.config.eightWayWork), 'Work squares must be connected.');
      workPosition(state, crew, cells);
      break;
    }
    case 'medical': {
      const target = person(state, command.targetId);
      requireRule(target?.health === 'injured', 'Choose an injured crew member.');
      requireRule(!state.jobs.some(job => job.kind === 'medical' && job.targetId === target.id), 'Medical treatment is already in progress.');
      workPosition(state, crew, target.position);
      break;
    }
    case 'relocate': requireRule(getCell(command.targetId)?.fuselage && isSafe(state, command.targetId) && !(crew.position.length === 1 && crew.position[0] === command.targetId) && !state.crew.some(other => other.id !== crew.id && other.health !== 'dead' && other.position.includes(command.targetId)), 'Choose another unoccupied, non-burning fuselage square.'); break;
    case 'manCockpit': requireRule(['pilot', 'copilot'].includes(command.stationId) && stationEmpty(state, command.stationId, crew.id) && !(crew.station === command.stationId && isAtStation(state, crew)), 'Choose an empty, non-burning cockpit seat.'); break;
    case 'restartEngine': {
      const engine = state.engines.find(item => item.id === command.targetId);
      requireRule(engine && !engine.running && engineSquares(engine.id).every(cell => status(state, cell.id) === 'healthy'), 'Choose a stopped engine with both squares repaired.');
      break;
    }
    case 'orderShot': requireRule(command.gunnerId !== crew.id && person(state, command.gunnerId)?.used && gunArcLegal(state, command.gunnerId, command.targetId), 'Choose an already-used, available gunner and a fighter in their arc.'); break;
    case 'convert': requireRule(['Officer', 'Enlisted'].includes(command.to) && state.resources[command.to === 'Officer' ? 'Enlisted' : 'Officer'] >= state.config.conversionRate, 'Choose a pool to receive; the other pool must afford conversion.'); break;
    case 'rotateFighter': requireRule(fighter(state, command.targetId)?.facing < 180, 'Choose an active fighter less than 180° away.'); break;
  }
}

function resolveAction(state, crew, command, emit) {
  const action = command.action;
  record(emit, 'CREW_ACTION', `${nameOf(crew.id)}: ${availableActions(state, crew.id).find(item => item.id === action).label}.`, { crewId: crew.id, action });
  switch (action) {
    case 'basicFire': shoot(state, crew, command.targetId, emit); break;
    case 'advancedFire': spend(state, 'Enlisted', 1, emit); shoot(state, crew, command.targetId, emit, true); break;
    case 'repair': case 'fireControl': case 'medical': startJob(state, crew, command, emit); break;
    case 'relocate': crew.position = [command.targetId]; record(emit, 'CREW_RELOCATED', `${nameOf(crew.id)} relocates to ${command.targetId}.`, { crewId: crew.id, cellId: command.targetId }); break;
    case 'manCockpit': crew.station = command.stationId; crew.position = [...stationCells(command.stationId)]; record(emit, 'COCKPIT_MANNED', `${nameOf(crew.id)} occupies the ${STATIONS[command.stationId].name}.`, { crewId: crew.id }); break;
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
    case 'orderShot': spend(state, 'Officer', state.config.orderShotCost, emit); shoot(state, person(state, command.gunnerId), command.targetId, emit); break;
    case 'convert': {
      const from = command.to === 'Officer' ? 'Enlisted' : 'Officer';
      // One of the surrendered physical tokens changes rank; only the surplus
      // returns to discard, preserving resource-token conservation.
      state.resources[from] -= state.config.conversionRate;
      state.resources[command.to]++;
      state.bags.mission.discard.push(...Array(state.config.conversionRate - 1).fill('Resource'));
      bump(state, `${from}Spent`, state.config.conversionRate);
      bump(state, `${command.to}Gained`);
      record(emit, 'RESOURCES_CONVERTED', `Copilot converts ${state.config.conversionRate} ${from} to 1 ${command.to}. ${state.config.conversionRate - 1} surplus token(s) enter discard.`, { from, to: command.to });
      break;
    }
    case 'rotateFighter': {
      const target = fighter(state, command.targetId);
      target.facing += 90;
      record(emit, 'FIGHTER_ROTATED', `Navigator turns ${target.type} 90° away; now ${target.facing}° off the B-17.`, { fighterId: target.id, facing: target.facing });
      break;
    }
    case 'escort': {
      spend(state, 'Enlisted', state.config.escortCost, emit);
      const quadrant = QUADRANTS[die(state, 4) - 1];
      state.escorts.push({ id: `escort-${state.nextId++}`, quadrant, round: state.round });
      record(emit, 'ESCORT_SUMMONED', `Escort arrives in ${quadrant} for the rest of Round ${state.round}.`, { quadrant });
      break;
    }
    case 'wait': record(emit, 'CREW_HELD_POSITION', `${nameOf(crew.id)} holds position.`, { crewId: crew.id }); break;
  }
}

function endActivation(state, emit) {
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
  for (const job of [...state.jobs]) if (job.completeRound <= state.round) finishJob(state, job, emit);
  for (const crew of state.crew) crew.used = false;
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
  record(emit, 'ALTITUDE_CHECK', `${cause[0].toUpperCase() + cause.slice(1)} check: ${explanation}`, { cause });
  if (minimum === 0) { record(emit, 'ALTITUDE_MAINTAINED', `${cause}: altitude maintained without a roll.`, { cause }); return; }
  if (minimum === 7) { loseAltitude(state, cause, emit); return; }
  const roll = die(state, 6);
  record(emit, 'ALTITUDE_ROLL', `${cause}: rolled ${roll}; ${minimum}+ maintains altitude.`, { cause, roll });
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
    record(emit, 'AIRCRAFT_DESTROYED', 'Structural failure destroys the aircraft.', { cause: 'structure' });
  } else altitudeCheck(state, 'structure', count <= config.structureSafe ? 0 : count <= config.structureMid ? config.structureMidMin : config.structureHighMin, emit, `${count} compromised section${count === 1 ? '' : 's'}.`);
  const stopped = state.engines.filter(engine => !engine.running).length;
  altitudeCheck(state, 'engines', stopped <= config.enginesSafe ? 0 : stopped >= config.enginesAuto ? 7 : stopped <= config.enginesMid ? config.enginesMidMin : config.enginesHighMin, emit, `${stopped} engines stopped.`);
  if (state.altitude <= 0 && !state.outcome) {
    state.outcome = 'destroyed';
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
    record(emit, 'MISSION_ENDED', 'The sortie ends with the loss of the aircraft.');
    return;
  }
  state.mission.position++;
  const home = state.config.outboundLength + state.config.returnLength;
  record(emit, 'MISSION_ADVANCED', `The B-17 advances to mission space ${state.mission.position}/${home}.`);
  if (state.mission.position >= home && state.mission.bombed) {
    state.phase = 'ended';
    state.outcome = 'success';
    state.endedAt = Date.now();
    record(emit, 'MISSION_ENDED', 'HOME. The B-17 completes its sortie.', { outcome: 'success' });
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
  const state = copy(original);
  const events = [];
  const emit = event => events.push({ ...event, state: copy(state) });
  requireRule(state.phase !== 'ended', 'This sortie has ended. Start a new sortie to continue.');
  switch (command.type) {
    case 'startRound': requireRule(state.phase === 'ready', 'A round can start only from the ready phase.'); startRound(state, emit); break;
    case 'activate': {
      requireRule(state.phase === 'select', 'Choose crew only during the crew selection phase.');
      const crew = availableCrew(state).find(item => item.id === command.crewId);
      requireRule(crew, 'That crew member is not available.');
      requireRule(!command.intercept || hasAbility(crew, 'intercept') && isAtStation(state, crew), 'Intercept requires Radio at an operating station and must be declared before drawing.');
      crew.used = true;
      state.slot++;
      state.activeCrew = crew.id;
      record(emit, 'CREW_ACTIVATED', `Time slot ${state.slot}/${CREW_DEFS.length}: activate ${nameOf(crew.id)}.`, { crewId: crew.id });
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
      requireRule(crew?.health === 'healthy' && !crew.job, 'The active crew member cannot act.');
      validateAction(state, crew, command);
      resolveAction(state, crew, command, emit);
      enemyPhase(state, emit);
      endActivation(state, emit);
      break;
    }
    case 'endRound': requireRule(state.phase === 'roundEnd', 'Complete all crew slots before ending the round.'); endRound(state, emit); break;
    case 'bomb': requireRule(state.phase === 'bombing', 'Bombing is available only at the target.'); resolveBombing(state, emit); state.phase = 'ready'; record(emit, 'NEXT_ROUND_READY', 'Bombing complete. Start the next round for the return journey.'); break;
    default: throw new Error(`Unknown command: ${command.type}`);
  }
  return { state, events };
}
