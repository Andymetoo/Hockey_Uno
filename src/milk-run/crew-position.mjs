import { CREW_DEFS, STATIONS } from './board.mjs';

export const CREW_POSITION_VERSION = 1;
export const homeStationId = crew => crew.homeStation ?? crew.station ?? CREW_DEFS.find(c => c.id === crew.id)?.station;
export function currentStationId(crew) {
  const cells = STATIONS[crew.station]?.cells ?? [];
  return !crew.displaced && !crew.job && cells.length === crew.position.length && cells.length > 0 &&
    cells.every(id => crew.position.includes(id)) ? crew.station : null;
}

/** Add positioning metadata without moving a person, advancing work or drawing RNG.
 * Historical cockpit assignments become that save's home, preserving old returns.
 */
export function migrateCrewPositions(snapshot) {
  if (snapshot.crewPositionVersion === CREW_POSITION_VERSION) return snapshot;
  return { ...snapshot, crewPositionVersion: CREW_POSITION_VERSION, crew: snapshot.crew.map(crew => {
    const station = currentStationId(crew);
    return { ...crew, homeStation: homeStationId(crew), station, displaced: station === null };
  }) };
}

export function leaveStation(crew) {
  crew.homeStation ??= homeStationId(crew);
  crew.station = null;
  crew.displaced = true;
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

export function effectiveTimeThreshold(state) {
  return state.config.v2TimePerProgress + (specialistOperator(state, 'navigator') ? 0 : state.config.v2NavigatorUnmannedTimePenalty ?? 0);
}
