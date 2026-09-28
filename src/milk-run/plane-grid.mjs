/** Pure parsing and validation for the canonical PlaneGrid CSV. No artwork or DOM inputs. */
export const SECTION_DEFINITIONS = {
  NosePort: { name: 'Nose · port', color: '#dfd999' },
  NoseStarboard: { name: 'Nose · starboard', color: '#cba6c1' },
  PortWing_Front: { name: 'Port wing · front', color: '#a3a392' },
  PortWing_Rear: { name: 'Port wing · rear', color: '#82a17d' },
  StarboardWing_Front: { name: 'Starboard wing · front', color: '#77aaa6' },
  StarboardWing_Rear: { name: 'Starboard wing · rear', color: '#a27ca7' },
  Fuselage: { name: 'Fuselage', color: '#cf8b82' },
  Tail: { name: 'Tail', color: '#d7ce75' },
};

const STATION_DEFINITIONS = {
  pilot: { name: 'Pilot seat', source: 'pilot', size: 1 },
  copilot: { name: 'Copilot seat', source: 'copilot', size: 1 },
  navigator: { name: 'Navigator / nose gun', source: 'navigator', size: 1 },
  bombardier: { name: 'Bombardier / nose gun', source: 'bombardier', size: 1 },
  radio: { name: 'Radio / dorsal gun', source: 'radio op', size: 2 },
  engineer: { name: 'Engineer / top turret', source: 'top turret', size: 2 },
  ball: { name: 'Ball turret', source: 'ball turret', size: 2 },
  leftWaist: { name: 'Port waist gun', source: 'left waist', size: 2 },
  rightWaist: { name: 'Starboard waist gun', source: 'right waist', size: 2 },
  tail: { name: 'Tail gun', source: 'tail gunner', size: 2 },
};
const CREW_SOURCE_IDS = new Map(Object.entries(STATION_DEFINITIONS).map(([id, value]) => [value.source, id]));
const VISUAL_ENGINE_PLANE = 'Empty (Engine Running Token - Visual only)';

export const cellId = (x, y) => `${'ABCDEF'[Math.floor(x / 2)]}${Math.floor(y / 2) + 1}-${(y % 2) * 2 + (x % 2) + 1}`;

function readCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const input = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && (character === ',' || character === '\n')) {
      row.push(field.trim()); field = '';
      if (character === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
    } else field += character;
  }
  if (quoted) throw new Error('PlaneGrid CSV has an unterminated quoted field.');
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeCrew(value) {
  if (!value) return null;
  // Suffixes identify parts of one footprint, never additional crew members.
  const source = value.toLowerCase().replace(/-/g, ' ').replace(/\s+\d+$/, '').replace(/\s+/g, ' ').trim();
  const id = CREW_SOURCE_IDS.get(source);
  if (!id) throw new Error(`Unknown PlaneGrid crew name: ${value}`);
  return id;
}

/** Returns the board and derived footprints; addresses occur only in the CSV. */
export function parsePlaneGrid(text) {
  const [headers, ...rows] = readCsv(text);
  if (headers?.join(',') !== 'Cell,Plane,Engine,Crew') throw new Error('PlaneGrid CSV must have Cell,Plane,Engine,Crew columns.');
  const board = rows.map((row) => {
    if (row.length !== 4) throw new Error(`PlaneGrid row must have four fields: ${row.join(',')}`);
    const [id, plane, engineSource, crewSource] = row;
    const match = /^([A-F])([1-6])-([1-4])$/.exec(id);
    if (!match) throw new Error(`Invalid PlaneGrid address: ${id}`);
    const quarter = Number(match[3]) - 1;
    const x = 'ABCDEF'.indexOf(match[1]) * 2 + quarter % 2;
    const y = (Number(match[2]) - 1) * 2 + Math.floor(quarter / 2);
    const structure = Object.hasOwn(SECTION_DEFINITIONS, plane);
    if (!structure && plane !== 'Empty' && plane !== VISUAL_ENGINE_PLANE) throw new Error(`Unknown PlaneGrid section: ${plane}`);
    const engineMatch = engineSource ? /^Engine ([1-4]) (Front|Back)$/.exec(engineSource) : null;
    if (engineSource && !engineMatch) throw new Error(`Unknown PlaneGrid engine: ${engineSource}`);
    return {
      id, x, y, plane, structure, section: structure ? plane : null,
      engine: engineMatch ? `E${engineMatch[1]}` : null,
      station: normalizeCrew(crewSource), engineIndicator: null,
      // Existing relocation rules allow safe central interior across sections.
      fuselage: structure && (x === 5 || x === 6),
    };
  }).sort((a, b) => a.y - b.y || a.x - b.x);

  const stations = Object.fromEntries(Object.entries(STATION_DEFINITIONS).map(([id, value]) => [id, {
    name: value.name, cells: board.filter((cell) => cell.station === id).map((cell) => cell.id),
  }]));
  const engineCells = Object.fromEntries([1, 2, 3, 4].map((number) => {
    const id = `E${number}`;
    return [id, board.filter((cell) => cell.engine === id).map((cell) => cell.id)];
  }));
  const engineIndicators = {};
  for (const indicator of board.filter((cell) => cell.plane === VISUAL_ENGINE_PLANE)) {
    // The CSV's visual-only token is directly ahead of its engine footprint.
    const front = board.find((cell) => cell.engine && cell.x === indicator.x && cell.y === indicator.y + 1);
    if (!front || engineIndicators[front.engine]) throw new Error(`Ambiguous engine indicator at ${indicator.id}`);
    indicator.engineIndicator = front.engine;
    engineIndicators[front.engine] = indicator.id;
  }
  validatePlaneGrid({ board, stations, engineCells, engineIndicators });
  return { board, stations, engineCells, engineIndicators };
}

/** Fail loudly if editing the canonical data loses board geometry or footprints. */
export function validatePlaneGrid({ board, stations, engineCells, engineIndicators }) {
  const byId = new Map(board.map((cell) => [cell.id, cell]));
  if (board.length !== 144 || byId.size !== 144) throw new Error('PlaneGrid must contain exactly 144 unique addresses.');
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    if (!byId.has(cellId(x, y))) throw new Error(`PlaneGrid is missing ${cellId(x, y)}.`);
  }
  for (const section of Object.keys(SECTION_DEFINITIONS)) {
    const expected = section === 'Fuselage' || section === 'Tail' ? 8 : 6;
    const count = board.filter((cell) => cell.structure && cell.section === section).length;
    if (count !== expected) throw new Error(`PlaneGrid ${section} requires ${expected} structural squares, found ${count}.`);
  }
  for (const [engine, cells] of Object.entries(engineCells)) {
    if (cells.length !== 2 || cells.some((id) => !byId.get(id)?.structure)) throw new Error(`PlaneGrid ${engine} requires two damageable engine squares.`);
    if (!engineIndicators[engine]) throw new Error(`PlaneGrid ${engine} is missing its visual running indicator.`);
  }
  if (new Set(board.filter((cell) => cell.station).map((cell) => cell.station)).size !== 10) throw new Error('PlaneGrid must represent exactly ten crew members.');
  for (const [station, definition] of Object.entries(STATION_DEFINITIONS)) {
    const cells = stations[station].cells.map((id) => byId.get(id));
    if (cells.length !== definition.size || cells.some((cell) => !cell?.structure)) throw new Error(`PlaneGrid ${station} has an invalid crew footprint.`);
    if (cells.length === 2 && Math.abs(cells[0].x - cells[1].x) + Math.abs(cells[0].y - cells[1].y) !== 1) throw new Error(`PlaneGrid ${station} footprint must be adjacent.`);
  }
  return true;
}
