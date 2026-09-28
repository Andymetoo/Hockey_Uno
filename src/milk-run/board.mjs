/** All geometry is derived from data/plane-grid.csv; artwork is presentation only. */
import { parsePlaneGrid, SECTION_DEFINITIONS } from './plane-grid.mjs';
export { parsePlaneGrid, validatePlaneGrid, cellId } from './plane-grid.mjs';
export const BOARD_VERSION = 'plane-grid-v1';
export const QUADRANTS = ['Fore', 'Starboard', 'Aft', 'Port'];
export const ALTITUDES = ['High', 'Level', 'Low'];
export const SECTIONS = SECTION_DEFINITIONS;

const sourceUrl = new URL('./data/plane-grid.csv', import.meta.url);
async function loadPlaneGrid() {
  if (sourceUrl.protocol === 'file:' && typeof process !== 'undefined' && process.versions?.node) {
    return (await import('node:fs/promises')).readFile(sourceUrl, 'utf8');
  }
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Unable to load Milk Run PlaneGrid CSV (${response.status}).`);
  return response.text();
}
const grid = parsePlaneGrid(await loadPlaneGrid());
export const BOARD = grid.board;
export const STATIONS = grid.stations;
export const ENGINE_CELLS = grid.engineCells;
export const ENGINE_INDICATORS = grid.engineIndicators;

const arc = (quadrants, altitudes) => ({ quadrants, altitudes });
export const CREW_DEFS = [
  { id: 'pilot', number: 3, name: 'Pilot', role: 'Aircraft commander', rank: 'Officer', tags: ['Officer', 'Pilot'], abilities: ['orderShot'], station: 'pilot' },
  { id: 'copilot', number: 4, name: 'Copilot', role: 'Resource conversion', rank: 'Officer', tags: ['Officer', 'Pilot', 'Copilot'], abilities: ['convert'], station: 'copilot' },
  { id: 'navigator', number: 2, name: 'Navigator', role: 'Nose gun / evasion', rank: 'Officer', tags: ['Officer', 'Gunner', 'Navigator'], abilities: ['rotateFighter'], station: 'navigator', arc: arc(['Fore'], ['Level', 'High']) },
  { id: 'bombardier', number: 1, name: 'Bombardier', role: 'Nose gun / target', rank: 'Officer', tags: ['Officer', 'Gunner', 'Bombardier'], abilities: [], station: 'bombardier', arc: arc(['Fore'], ['Level', 'High']) },
  { id: 'radio', number: 6, name: 'Radio Operator', role: 'Dorsal gun / intercept', rank: 'Enlisted', tags: ['Enlisted', 'Gunner', 'Radio'], abilities: ['intercept', 'escort'], station: 'radio', arc: arc(['Aft'], ['High']) },
  { id: 'engineer', number: 5, name: 'Engineer', role: 'Top turret / enhanced repair', rank: 'Enlisted', tags: ['Enlisted', 'Gunner', 'Engineer'], abilities: ['enhancedRepair'], station: 'engineer', arc: arc([...QUADRANTS], ['Level', 'High']) },
  { id: 'ball', number: 7, name: 'Ball Turret', role: 'Lower gun', rank: 'Enlisted', tags: ['Enlisted', 'Gunner'], abilities: [], station: 'ball', arc: arc([...QUADRANTS], ['Low', 'Level']) },
  { id: 'leftWaist', number: 8, name: 'Left Waist', role: 'Port gun', rank: 'Enlisted', tags: ['Enlisted', 'Gunner'], abilities: [], station: 'leftWaist', arc: arc(['Port'], [...ALTITUDES]) },
  { id: 'rightWaist', number: 9, name: 'Right Waist', role: 'Starboard gun', rank: 'Enlisted', tags: ['Enlisted', 'Gunner'], abilities: [], station: 'rightWaist', arc: arc(['Starboard'], [...ALTITUDES]) },
  { id: 'tail', number: 10, name: 'Tail Gunner', role: 'Aft gun', rank: 'Enlisted', tags: ['Enlisted', 'Gunner'], abilities: [], station: 'tail', arc: arc(['Aft'], [...ALTITUDES]) },
];

const CELL_BY_ID = new Map(BOARD.map((cell) => [cell.id, cell]));
export const getCell = (id) => CELL_BY_ID.get(id);
export function neighbors(id, eightWay = false) {
  const cell = getCell(id);
  if (!cell) return [];
  return BOARD.filter((candidate) => {
    const dx = Math.abs(cell.x - candidate.x);
    const dy = Math.abs(cell.y - candidate.y);
    return eightWay ? Math.max(dx, dy) === 1 : dx + dy === 1;
  });
}
