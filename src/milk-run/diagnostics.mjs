import { BOARD } from './board.mjs';

const cellPattern = /\b[A-F][1-6]-[1-4]\b/g;
const crewNames = {
  pilot: 'Pilot', copilot: 'Copilot', navigator: 'Navigator', bombardier: 'Bombardier',
  radio: 'Radio Operator', engineer: 'Engineer', ball: 'Ball Turret Gunner',
  leftWaist: 'Left Waist Gunner', rightWaist: 'Right Waist Gunner', tail: 'Tail Gunner',
};

function cellsInMessage(message = '') {
  return [...new Set(String(message).match(cellPattern) ?? [])];
}

function cellsForEvent(event = {}) {
  if (['FIRE_SPREAD_ROLL', 'FIRE_SPREAD_BLOCKED'].includes(event.type)) return event.cells ?? [event.cellId].filter(Boolean);
  if (['WORK_COMPLETED', 'WORK_CANCELLED'].includes(event.type)) return event.cells ?? [];
  if (event.type === 'WORK_STARTED') return cellsInMessage(event.message);
  if (['CREW_INJURED', 'CREW_KILLED'].includes(event.type)) {
    const location = event.message?.match(/(?:hit at|spreading toward) ([A-F][1-6]-[1-4])\b/i)?.[1];
    return location ? [location] : [];
  }
  return event.cellId ? [event.cellId] : [];
}

function turnLabel(event = {}) {
  if (event.ruleset === 'v2-continuous') {
    const turn = event.turn ?? (Math.max(1, event.crewCycle ?? 1) - 1) * 10 + (event.cycleTurn ?? 0) + 1;
    return `Turn ${turn}`;
  }
  return event.round !== undefined ? `Round ${event.round}` : 'Sortie';
}

function crewName(id) { return crewNames[id] ?? String(id ?? 'Crew').replaceAll('_', ' '); }

function historyDescription(event, id) {
  switch (event.type) {
    case 'ENEMY_HIT_LOCATION': return `Attack location rolled here${event.source ? ` · ${event.source}` : ''}`;
    case 'ATTACK_EMPTY_SPACE': return 'Hit location landed in empty space · no aircraft damage';
    case 'AIRCRAFT_SQUARE_DAMAGED': return 'Healthy → Damaged';
    case 'AIRCRAFT_HIT_BURNING': return 'Damage struck existing Fire · condition unchanged';
    case 'FIRE_STARTED': return /another damage step starts/i.test(event.message ?? '') ? 'Damaged → Fire' : 'Fire spread here';
    case 'AIRCRAFT_SQUARE_REPAIRED': return 'Repaired to Healthy';
    case 'FIRE_EXTINGUISHED': return `Fire suppressed · leaves ${(event.message?.match(/leaving ([^.]+)/i)?.[1] ?? 'repaired structure')}`;
    case 'FIRE_SPREAD_ROLL': return `Fire Spread d${event.roll} · ${event.result === 'no spread' ? 'no spread' : event.result}`;
    case 'FIRE_SPREAD_BLOCKED': return `Fire spread blocked${event.direction ? ` · ${event.direction}` : ''}`;
    case 'FIRE_STOPPED_BY_CREW': return 'Fire spread stopped by crew here';
    case 'CREW_INJURED': return `${crewName(event.crewId)} injured here`;
    case 'CREW_KILLED': return `${crewName(event.crewId)} killed here`;
    case 'WORK_STARTED': return `${event.kind === 'fireControl' ? 'Fire Control' : event.kind === 'repair' ? 'Repair' : 'Medical'} started${event.kind === 'fireControl' ? ' · suppression begins' : ''}`;
    case 'WORK_COMPLETED': return `${event.kind === 'fireControl' ? 'Fire Control' : event.kind === 'repair' ? 'Repair' : 'Medical'} completed here`;
    case 'WORK_CANCELLED': return `${event.kind === 'fireControl' ? 'Fire Control' : event.kind === 'repair' ? 'Repair' : 'Medical'} cancelled${event.kind === 'fireControl' ? ' · suppression ends' : ''}`;
    case 'CREW_RELOCATED': return `${crewName(event.crewId)} moved here · ${event.message?.replace(/^.*? (?:relocates to|leaves the station for safe interior position) /i, '') ?? id}`;
    default: return null;
  }
}

/** A read-only timeline derived from the sortie's existing semantic events. */
export function deriveCellHistory(log = [], id) {
  const cell = BOARD.find(item => item.id === id);
  if (!cell) return { cellId: id, structure: false, entries: [] };
  const entries = log.flatMap(event => {
    if (event.presentationOnly || !cellsForEvent(event).includes(id)) return [];
    const description = historyDescription(event, id);
    return description ? [{ sequence: event.sequence, time: turnLabel(event), description, type: event.type }] : [];
  });
  return { cellId: id, structure: cell.structure, entries };
}

/** Counts only actual hit-location rolls. Attack rolls marked MISS/OFF TARGET never reach this event. */
export function hitLocationHeatMap(log = []) {
  const board = new Map(BOARD.map(cell => [cell.id, cell]));
  const structure = Object.create(null), empty = Object.create(null);
  let structureRolls = 0, emptyRolls = 0;
  for (const event of log) {
    if (event.presentationOnly || event.type !== 'ENEMY_HIT_LOCATION') continue;
    const cell = board.get(event.cellId);
    if (!cell) continue;
    const counts = cell.structure ? structure : empty;
    counts[event.cellId] = (counts[event.cellId] ?? 0) + 1;
    if (cell.structure) structureRolls++;
    else emptyRolls++;
  }
  return { structure, empty, structureRolls, emptyRolls, totalRolls: structureRolls + emptyRolls };
}
