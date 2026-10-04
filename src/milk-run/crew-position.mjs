import { BOARD_VERSION, CREW_DEFS, STATIONS, getCell } from './board.mjs';
import { storyModifier } from './story-effects.mjs';

export const CREW_POSITION_VERSION = 2;
export const homeStationId = crew => crew.homeStation ?? crew.station ?? CREW_DEFS.find(c => c.id === crew.id)?.station;
export function currentStationId(crew) {
  const cells = STATIONS[crew.station]?.cells ?? [];
  return Array.isArray(crew.position) && !crew.displaced && !crew.job && cells.length === crew.position.length && cells.length > 0 &&
    cells.every(id => crew.position.includes(id)) ? crew.station : null;
}

/** Add positioning metadata without moving a person, advancing work or drawing RNG.
 * Historical cockpit assignments become that save's home, preserving old returns.
 */
export function migrateCrewPositions(snapshot) {
  if (snapshot.crewPositionVersion === CREW_POSITION_VERSION) return snapshot;
  return { ...snapshot, boardVersion: BOARD_VERSION, crewPositionVersion: CREW_POSITION_VERSION, crew: snapshot.crew.map(crew => {
    const station = currentStationId(crew);
    return { ...crew, homeStation: homeStationId(crew), station, displaced: station === null };
  }) };
}

export function leaveStation(crew) {
  crew.homeStation ??= homeStationId(crew);
  crew.station = null;
  crew.displaced = true;
}

/** Stable-state diagnostics. Messy stacks are legal; missing people, dangling
 * jobs and two healthy operators of the same station are not. No mutation. */
export function crewStateProblems(state) {
  const problems = [], operators = new Map(), workers = new Map();
  for (const definition of CREW_DEFS) if (state.crew.filter(c => c.id === definition.id).length !== 1) problems.push(`Crew identity ${definition.id} must occur exactly once.`);
  for (const crew of state.crew) {
    if (!Array.isArray(crew.position) || !crew.position.length || new Set(crew.position).size !== crew.position.length || crew.position.some(id => !getCell(id)?.structure)) problems.push(`${crew.id}: invalid physical footprint.`);
    if (crew.health !== 'dead' && crew.position?.some(id => state.cells[id] === 'fire')) problems.push(`${crew.id}: living occupant on Fire.`);
    if (crew.job && !state.jobs.some(j => j.id === crew.job && [j.crewId,j.assistantId].includes(crew.id))) problems.push(`${crew.id}: orphan worker assignment.`);
    if (crew.station && !crew.displaced && !crew.job && currentStationId(crew) === null) problems.push(`${crew.id}: station assignment does not match physical footprint.`);
    const station = currentStationId(crew);
    if (station && crew.health === 'healthy' && !state.jobs.some(j => j.kind === 'medical' && j.targetId === crew.id)) {
      if (operators.has(station)) problems.push(`${station}: multiple operational operators.`);
      operators.set(station,crew.id);
    }
  }
  for (const job of state.jobs) {
    for (const id of [job.crewId,job.assistantId].filter(Boolean)) {
      const crew=state.crew.find(c=>c.id===id);
      if (!crew || crew.job!==job.id || crew.health!=='healthy' || currentStationId(crew)!==null) problems.push(`${job.id}: invalid worker ${id}.`);
      if (workers.has(id)) problems.push(`${id}: multiple active jobs.`);
      workers.set(id,job.id);
    }
    if (job.kind==='medical' && !state.crew.some(c=>c.id===job.targetId&&c.health==='injured'&&!c.job)) problems.push(`${job.id}: invalid Medical patient.`);
  }
  return problems;
}

export function assertCrewTransition(before, after) {
  // Legacy development states remain inspectable and may be improved. Reject
  // newly introduced violations transactionally, never relocate to hide one.
  const existing = new Set(crewStateProblems(before));
  const introduced = crewStateProblems(after).filter(problem => !existing.has(problem));
  if (introduced.length) throw new Error(`Crew/station invariant: ${introduced.join(' ')}`);
}

/** Specialist functions depend on the qualified person actually seated there.
 * Readiness is deliberately irrelevant: a tapped Officer still mans a station.
 */
export function specialistOperator(state, stationId) {
  if (!['navigator', 'bombardier'].includes(stationId)) return null;
  return state.crew.find(crew => currentStationId(crew) === stationId &&
    crew.health === 'healthy' && !crew.job &&
    !state.jobs.some(job => job.kind === 'medical' && job.targetId === crew.id) &&
    crew.position.every(id => state.cells[id] !== 'fire') &&
    (crew.id === stationId || CREW_DEFS.find(def => def.id === crew.id)?.rank === 'Officer')) ?? null;
}

export function specialistStatus(state, stationId) {
  const operator = specialistOperator(state, stationId);
  const seated = state.crew.find(c => currentStationId(c) === stationId && c.health === 'healthy' && !c.job);
  const physical = state.crew.filter(c => c.position.some(id => STATIONS[stationId].cells.includes(id)));
  const name = crew => CREW_DEFS.find(d => d.id === crew.id)?.name ?? crew.id;
  if (operator) return { kind: operator.id === stationId ? 'actual' : 'officer', operator, physical,
    reason: `${name(operator)} operates the ${stationId === 'bombardier' ? 'bombsight' : 'navigation station'}${operator.id === stationId ? '.' : ' as a qualified Officer substitute.'}` };
  if (seated && CREW_DEFS.find(d => d.id === seated.id)?.rank !== 'Officer') return { kind: 'unqualified', operator: null, physical,
    reason: `${name(seated)} is manning the ${stationId === 'bombardier' ? 'Bombardier' : 'Navigator'} station, but Enlisted substitutes cannot ${stationId === 'bombardier' ? 'operate the bombsight' : 'perform navigation'}.` };
  return { kind: 'unmanned', operator: null, physical,
    reason: `${stationId === 'bombardier' ? 'Bombardier' : 'Navigator'} station has no healthy, available qualified operator.${physical.length ? ` Physical occupants: ${physical.map(c => `${name(c)} (${c.health}${c.job ? ', working' : c.displaced ? ', displaced' : ''})`).join(', ')}.` : ''}` };
}

export function effectiveTimeThreshold(state) {
  const base = state.config.v2TimePerProgress + (specialistOperator(state, 'navigator') ? 0 : state.config.v2NavigatorUnmannedTimePenalty ?? 0);
  const modifier = storyModifier(state, 'nextProgress');
  // A detour can never require more physical Time than this sortie owns.
  return modifier ? Math.max(1, Math.min(state.config.v2MissionTime, base + modifier)) : base;
}
