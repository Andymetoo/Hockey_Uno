import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BOARD, CREW_DEFS, ENGINE_CELLS, STATIONS, SECTIONS, getCell, neighbors, parsePlaneGrid } from '../board.mjs';
import { createGame } from '../state.mjs';
import { DEFAULT_CONFIG, CONFIG_FIELDS, normalizeConfig } from '../config.mjs';

const canonicalCsv = await readFile(new URL('../data/plane-grid.csv', import.meta.url), 'utf8');

test('runtime board, engine footprints, and crew footprints load from the corrected canonical CSV', () => {
  assert.match(canonicalCsv, /^C4-2,Fuselage,,Left Waist 1\r?$/m);
  assert.match(canonicalCsv, /^C4-3,Empty,,\r?$/m);
  const parsed = parsePlaneGrid(canonicalCsv);
  assert.deepEqual(parsed.board, BOARD);
  assert.deepEqual(parsed.stations, STATIONS);
  assert.deepEqual(parsed.engineCells, ENGINE_CELLS);
});

test('canonical data validation rejects duplicate, missing, malformed and invalid occupancy records', () => {
  assert.throws(() => parsePlaneGrid(canonicalCsv.replace('A1-2,Empty,,', 'A1-1,Empty,,')), /144 unique/);
  assert.throws(() => parsePlaneGrid(canonicalCsv.replace(/A1-1,Empty,,\r?\n/, '')), /144 unique/);
  assert.throws(() => parsePlaneGrid(canonicalCsv.replace('A1-1,Empty,,', 'A1-5,Empty,,')), /address/);
  assert.throws(() => parsePlaneGrid(canonicalCsv.replace('A1-1,Empty,,', 'A1-1,ImaginarySection,,')), /section/);
  assert.throws(() => parsePlaneGrid(canonicalCsv.replace('C4-2,Fuselage,,Left Waist 1', 'C4-2,Empty,,Left Waist 1').replace('C4-3,Empty,,', 'C4-3,Fuselage,,')), /crew footprint/);
});

test('board explicitly covers A–F / 1–6 / four quarters with eight sections and four two-square engines', () => {
  assert.equal(BOARD.length, 144);
  assert.equal(new Set(BOARD.map(c => c.id)).size, 144);
  for (const column of 'ABCDEF') for (let row = 1; row <= 6; row++) for (let quarter = 1; quarter <= 4; quarter++) {
    assert.ok(getCell(`${column}${row}-${quarter}`));
  }
  assert.equal(Object.keys(SECTIONS).length, 8);
  assert.equal(new Set(BOARD.filter(c => c.structure).map(c => c.section)).size, 8);
  assert.equal(Object.keys(ENGINE_CELLS).length, 4);
  for (const [id, cells] of Object.entries(ENGINE_CELLS)) {
    assert.equal(cells.length, 2);
    assert.ok(cells.every(cell => getCell(cell).structure && getCell(cell).engine === id));
  }
  assert.equal(CREW_DEFS.length, 10);
  assert.ok(CREW_DEFS.every(c => STATIONS[c.station].cells.every(id => getCell(id).structure)));
});

test('authoritative sub-squares retain their exact quarter geometry and corrected waist structure', () => {
  for (const column of 'ABCDEF') for (let row = 1; row <= 6; row++) for (let quarter = 1; quarter <= 4; quarter++) {
    const cell = getCell(`${column}${row}-${quarter}`);
    assert.equal(cell.x, 'ABCDEF'.indexOf(column) * 2 + (quarter - 1) % 2);
    assert.equal(cell.y, (row - 1) * 2 + Math.floor((quarter - 1) / 2));
  }
  assert.equal(getCell('C4-2').structure, true);
  assert.equal(getCell('C4-2').section, 'Fuselage');
  assert.equal(getCell('C4-3').structure, false);
  assert.equal(getCell('C4-3').section, null);
  assert.equal(getCell('A3-1').section, 'PortWing_Rear');
  assert.equal(getCell('A3-2').section, 'PortWing_Front', 'section edge cuts through a main grid coordinate');
});

test('section counts use only the 52 authoritative aircraft sub-squares', () => {
  const expected = { NosePort: 6, NoseStarboard: 6, PortWing_Front: 6, PortWing_Rear: 6,
    StarboardWing_Front: 6, StarboardWing_Rear: 6, Fuselage: 8, Tail: 8 };
  assert.deepEqual(Object.fromEntries(Object.keys(SECTIONS).map(id => [id, BOARD.filter(c => c.structure && c.section === id).length])), expected);
  assert.equal(BOARD.filter(c => c.structure).length, 52);
  assert.ok(BOARD.filter(c => !c.structure).every(c => c.section === null && c.engine === null));
});

test('engine footprint squares are distinct from four visual-only running indicators', () => {
  const expected = { E1: ['B2-4', 'B3-2'], E2: ['C2-1', 'C2-3'], E3: ['D2-2', 'D2-4'], E4: ['E2-3', 'E3-1'] };
  assert.deepEqual(ENGINE_CELLS, expected);
  const indicatorCells = BOARD.filter(c => c.engineIndicator);
  assert.equal(indicatorCells.length, 4);
  assert.deepEqual(new Set(indicatorCells.map(c => c.id)), new Set(['B2-2', 'C1-3', 'D1-4', 'E2-1']));
  assert.deepEqual(new Set(indicatorCells.map(c => c.engineIndicator)), new Set(Object.keys(expected)));
  assert.ok(indicatorCells.every(c => !c.structure && !c.section && !c.engine && !c.station));
});

test('CSV footprint parts produce exactly ten numbered crew and preserve every vulnerable square', () => {
  const expected = {
    bombardier: [1, ['C1-4']], navigator: [2, ['D1-3']], pilot: [3, ['C2-2']], copilot: [4, ['D2-1']],
    engineer: [5, ['C2-4', 'D2-3']], radio: [6, ['C3-2', 'D3-1']], ball: [7, ['C3-4', 'D3-3']],
    leftWaist: [8, ['C4-2', 'C4-4']], rightWaist: [9, ['D4-1', 'D4-3']], tail: [10, ['C6-2', 'D6-1']],
  };
  assert.equal(new Set(BOARD.filter(c => c.station).map(c => c.station)).size, 10);
  assert.equal(CREW_DEFS.length, 10);
  assert.equal(Object.keys(STATIONS).length, 10);
  for (const [crewId, [number, cells]] of Object.entries(expected)) {
    assert.equal(CREW_DEFS.find(c => c.id === crewId).number, number, crewId);
    assert.deepEqual(STATIONS[crewId].cells, cells, crewId);
    assert.deepEqual(BOARD.filter(c => c.station === crewId).map(c => c.id).sort(), [...cells].sort(), crewId);
  }
});

test('work adjacency can be diagonal while fire has an orthogonal geometry available', () => {
  const cell = BOARD.find(c => c.x === 5 && c.y === 5);
  assert.equal(neighbors(cell.id).length, 4);
  assert.equal(neighbors(cell.id, true).length, 8);
  assert.ok(neighbors(cell.id).every(other => Math.abs(other.x - cell.x) + Math.abs(other.y - cell.y) === 1));
});

test('new games isolate mutable state and keep starting resources outside mission bag', () => {
  const a = createGame({}, 'state'), b = createGame({}, 'state');
  assert.deepEqual(a.resources, { Officer: 3, Enlisted: 5 });
  assert.equal(a.bags.mission.tokens.filter(t => t === 'Enemy').length, 15);
  assert.equal(a.bags.mission.tokens.filter(t => t === 'Resource').length, 20);
  assert.equal(a.bags.combat.tokens.length, 33);
  a.crew[0].position.pop();
  a.bags.mission.tokens.pop();
  assert.notDeepEqual(a.crew[0], b.crew[0]);
  assert.equal(b.bags.mission.tokens.length, 35);
  assert.equal(a.rng, b.rng);
});

test('all provisional defaults can be configured, with range validation and safe nonempty token systems', () => {
  assert.deepEqual(new Set(CONFIG_FIELDS.map(f => f.key)), new Set(Object.keys(DEFAULT_CONFIG)));
  const config = normalizeConfig({ missionEnemy: 0, missionResource: 0, combatHit: 0, combatMiss: 0, maxFighters: 99, restartMax: -5, spawnFacing: '90', unavailableDraws: 'false', startingOfficer: '9', unrecognized: 123 });
  assert.equal(config.missionResource, 1);
  assert.equal(config.combatMiss, 1);
  assert.equal(config.maxFighters, 3);
  assert.equal(config.restartMax, 1);
  assert.equal(config.spawnFacing, 90);
  assert.equal(config.unavailableDraws, false);
  assert.equal(config.startingOfficer, 9);
  assert.equal('unrecognized' in config, false);
});
