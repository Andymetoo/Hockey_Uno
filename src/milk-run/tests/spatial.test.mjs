import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, ENGINE_CELLS, STATIONS, SECTIONS, getCell } from '../board.mjs';
import { dispatch, damageSquare, resolveAttack, recalculateConditions, gunArcLegal, postAttackPosition, resolveAltitude } from '../rules.mjs';
import { fresh, fighter, collect, rngForDice } from './fixtures.mjs';

test('normal hits progress healthy → damaged → fire; later burning hits add no damage step', () => {
  const state = fresh();
  const cell = BOARD.find(c => c.structure && !c.station && !c.engine);
  const { events, emit } = collect();
  damageSquare(state, cell.id, 1, emit);
  assert.equal(state.cells[cell.id], 'damaged');
  damageSquare(state, cell.id, 1, emit);
  assert.equal(state.cells[cell.id], 'fire');
  damageSquare(state, cell.id, 1, emit);
  assert.equal(state.cells[cell.id], 'fire');
  assert.equal(events.filter(e => e.type === 'AIRCRAFT_SQUARE_DAMAGED').length, 1);
  assert.equal(events.filter(e => e.type === 'FIRE_STARTED').length, 1);
});

test('a direct critical applies two structural and crew damage steps, killing healthy occupants', () => {
  const state = fresh();
  const id = STATIONS.pilot.cells[0];
  const { events, emit } = collect();
  resolveAttack(state, emit, { source: 'BF-109', roll: 6, cellId: id });
  assert.equal(state.cells[id], 'fire');
  assert.equal(state.crew.find(c => c.id === 'pilot').health, 'dead');
  assert.equal(events.filter(e => e.type === 'CREW_INJURED').length, 1);
  assert.equal(events.filter(e => e.type === 'CREW_KILLED').length, 1);
  assert.equal(state.stats.enemyCrits, 1);
  assert.ok(events.findIndex(e => e.type === 'ENEMY_ATTACK_ROLL') < events.findIndex(e => e.type === 'AIRCRAFT_SQUARE_DAMAGED'));
  resolveAttack(state, emit, { source: 'BF-109', roll: 2, cellId: id });
  assert.equal(state.crew.find(c => c.id === 'pilot').health, 'dead');
  assert.equal(state.stats.crewKilled, 1);
});

test('either square of every straddling crew footprint can injure, then kill the same crew member', () => {
  const dualStations = Object.entries(STATIONS).filter(([, station]) => station.cells.length === 2);
  assert.equal(dualStations.length, 6);
  for (const [crewId, station] of dualStations) for (const cells of [station.cells, [...station.cells].reverse()]) {
    const state = fresh();
    const { events, emit } = collect();
    resolveAttack(state, emit, { source: 'BF-109', roll: 2, cellId: cells[0] });
    assert.equal(state.crew.find(c => c.id === crewId).health, 'injured', `${crewId} normal hit at ${cells[0]} injures once`);
    assert.equal(events.filter(e => e.type === 'CREW_INJURED').length, 1);
    resolveAttack(state, emit, { source: 'BF-109', roll: 2, cellId: cells[1] });
    assert.equal(state.crew.find(c => c.id === crewId).health, 'dead', `${crewId} hit at other footprint ${cells[1]}`);
    assert.equal(events.filter(e => e.type === 'CREW_KILLED').length, 1);
  }
});

test('misses never generate aircraft location damage and empty coordinates pass through', () => {
  const state = fresh();
  const { events, emit } = collect();
  const before = structuredClone(state.cells);
  resolveAttack(state, emit, { source: 'Flak', roll: 1, cellId: STATIONS.pilot.cells[0] });
  assert.deepEqual(state.cells, before);
  assert.equal(state.stats.aircraftHits, 0);
  assert.ok(events.every(e => e.type !== 'AIRCRAFT_SQUARE_DAMAGED'));
  resolveAttack(state, emit, { source: 'Flak', roll: 3, cellId: BOARD.find(c => !c.structure).id });
  assert.deepEqual(state.cells, before);
  assert.equal(state.stats.aircraftHits, 0);
});

test('all empty sub-squares, including engine indicators and corrected C4-3, pass through without damage', () => {
  for (const cell of BOARD.filter(c => !c.structure)) {
    const state = fresh();
    const before = structuredClone({ cells: state.cells, crew: state.crew, engines: state.engines, compromised: state.compromised });
    const { events, emit } = collect();
    resolveAttack(state, emit, { source: 'Flak', roll: 6, cellId: cell.id });
    assert.deepEqual({ cells: state.cells, crew: state.crew, engines: state.engines, compromised: state.compromised }, before, cell.id);
    assert.equal(state.stats.aircraftHits, 0, cell.id);
    assert.ok(events.every(e => !['AIRCRAFT_SQUARE_DAMAGED', 'FIRE_STARTED', 'CREW_INJURED', 'ENGINE_DISABLED', 'SECTION_COMPROMISED'].includes(e.type)), cell.id);
  }
});

test('exact quarter lookup preserves overlapping engine, crew-worksite, and section consequences', () => {
  const state = fresh();
  const target = getCell('B3-2');
  assert.equal(target.engine, 'E1');
  assert.equal(target.section, 'PortWing_Front');
  assert.equal(target.station, null, 'canonical engine footprint has no permanent crew station');
  // Crisis workers may relocate onto an engine square; occupancy is independent of its section and engine.
  const worker = state.crew.find(c => c.id === 'engineer');
  worker.position = [target.id];
  state.cells['B2-4'] = 'damaged';
  const sectionCells = BOARD.filter(c => c.section === target.section && c.id !== target.id);
  for (const cell of sectionCells.slice(0, 3)) state.cells[cell.id] = 'damaged';
  const { events, emit } = collect();
  recalculateConditions(state, emit);
  assert.equal(state.engines.find(e => e.id === 'E1').running, true);
  assert.equal(state.compromised.includes(target.section), false);
  const before = structuredClone(state.cells);
  resolveAttack(state, emit, { source: 'BF-109', roll: 2, cellId: target.id });
  assert.deepEqual(Object.keys(state.cells).filter(id => state.cells[id] !== before[id]), [target.id], 'no other quarter of B3 is damaged');
  assert.equal(state.cells[target.id], 'damaged');
  assert.equal(worker.health, 'injured');
  assert.equal(state.engines.find(e => e.id === 'E1').running, false);
  assert.equal(state.compromised.includes(target.section), true);
  for (const type of ['AIRCRAFT_SQUARE_DAMAGED', 'CREW_INJURED', 'ENGINE_DISABLED', 'SECTION_COMPROMISED']) assert.equal(events.filter(e => e.type === type).length, 1, type);
});

test('structural compromise is strictly more than half and repairs remove it dynamically', () => {
  for (const section of Object.keys(SECTIONS)) {
    const state = fresh();
    const { emit } = collect();
    const cells = BOARD.filter(c => c.section === section);
    assert.equal(cells.length % 2, 0);
    for (const cell of cells.slice(0, cells.length / 2)) state.cells[cell.id] = 'damaged';
    recalculateConditions(state, emit);
    assert.equal(state.compromised.includes(section), false, `${section}: exactly half is safe`);
    state.cells[cells.at(-1).id] = 'fire';
    recalculateConditions(state, emit);
    assert.equal(state.compromised.includes(section), true, `${section}: more than half compromises`);
    state.cells[cells.at(-1).id] = 'healthy';
    recalculateConditions(state, emit);
    assert.equal(state.compromised.includes(section), false, `${section}: repair restores section`);
  }
});

test('an engine stops only when both engine squares are damaged, and repairing does not restart it', () => {
  const state = fresh();
  const { events, emit } = collect();
  const [a, b] = ENGINE_CELLS.E1;
  state.cells[a] = 'damaged';
  recalculateConditions(state, emit);
  assert.equal(state.engines.find(e => e.id === 'E1').running, true);
  state.cells[b] = 'fire';
  recalculateConditions(state, emit);
  assert.equal(state.engines.find(e => e.id === 'E1').running, false);
  assert.equal(events.filter(e => e.type === 'ENGINE_DISABLED').length, 1);
  state.cells[a] = state.cells[b] = 'healthy';
  recalculateConditions(state, emit);
  assert.equal(state.engines.find(e => e.id === 'E1').running, false);
  assert.equal(state.stats.enginesDisabled, 1);
});

test('every gun enforces its published quadrant and altitude coverage', () => {
  const expected = {
    pilot: [], copilot: [],
    navigator: ['Fore/High', 'Fore/Level', 'Fore/Low'], bombardier: ['Fore/High', 'Fore/Level', 'Fore/Low'],
    radio: ['Aft/High', 'Aft/Level'],
    engineer: ['Fore/High','Fore/Level','Starboard/High','Starboard/Level','Aft/High','Aft/Level','Port/High','Port/Level'],
    ball: ['Fore/Low','Fore/Level','Starboard/Low','Starboard/Level','Aft/Low','Aft/Level','Port/Low','Port/Level'],
    leftWaist: ['Port/High','Port/Level','Port/Low'], rightWaist: ['Starboard/High','Starboard/Level','Starboard/Low'],
    tail: ['Aft/High','Aft/Level','Aft/Low'],
  };
  const state = fresh();
  state.fighters = [fighter()];
  for (const [crewId, permitted] of Object.entries(expected)) {
    for (const quadrant of ['Fore','Starboard','Aft','Port']) for (const altitude of ['High','Level','Low']) {
      Object.assign(state.fighters[0], { quadrant, altitude });
      assert.equal(gunArcLegal(state, crewId, 'f1'), permitted.includes(`${quadrant}/${altitude}`), `${crewId}: ${quadrant}/${altitude}`);
    }
  }
});

test('a damaged gun station still works; fire or displacement makes it unusable', () => {
  const state = fresh();
  state.fighters = [fighter()];
  const cell = STATIONS.engineer.cells[0];
  state.cells[cell] = 'damaged';
  assert.equal(gunArcLegal(state, 'engineer', 'f1'), true);
  state.cells[cell] = 'fire';
  assert.equal(gunArcLegal(state, 'engineer', 'f1'), false);
  state.cells[cell] = 'healthy';
  state.crew.find(c => c.id === 'engineer').position = [...STATIONS.radio.cells];
  assert.equal(gunArcLegal(state, 'engineer', 'f1'), false);
});

test('flyby facing depends on same, adjacent or opposite quadrant independently of altitude', () => {
  for (const [quadrant, facing] of [['Fore',0],['Starboard',90],['Aft',180],['Port',90]]) {
    const state = fresh();
    state.fighters = [fighter()];
    const { emit } = collect();
    postAttackPosition(state, 'f1', emit, { quadrant, altitude: 'Low' });
    assert.equal(state.fighters[0].quadrant, quadrant);
    assert.equal(state.fighters[0].altitude, 'Low');
    assert.equal(state.fighters[0].facing, facing);
  }
});

test('control, structure, and engine altitude losses are independent and stack', () => {
  const state = fresh({ startingAltitude: 5 });
  state.crew.filter(c => ['pilot','copilot'].includes(c.id)).forEach(c => { c.health = 'dead'; });
  for (const cell of BOARD.filter(c => ['Fuselage','Tail'].includes(c.section))) state.cells[cell.id] = 'damaged';
  state.engines.forEach(e => { e.running = false; });
  const { events, emit } = collect();
  recalculateConditions(state, emit);
  state.rng = rngForDice([1]);
  resolveAltitude(state, emit);
  assert.equal(state.altitude, 2);
  assert.deepEqual(state.stats.altitudeLostByCause, { control: 1, structure: 1, engines: 1 });
  assert.equal(events.filter(e => e.type === 'ALTITUDE_LOST').length, 3);
});

test('six compromised sections destroy the aircraft regardless of intact engines and trained pilots', () => {
  const state = fresh();
  const selected = Object.keys(SECTIONS).filter(id => !['NosePort','NoseStarboard'].includes(id));
  for (const cell of BOARD.filter(c => selected.includes(c.section))) state.cells[cell.id] = 'damaged';
  const { emit } = collect();
  recalculateConditions(state, emit);
  state.phase = 'roundEnd';
  const result = dispatch(state, { type: 'endRound' });
  assert.equal(result.state.phase, 'ended');
  assert.equal(result.state.outcome, 'destroyed');
  assert.ok(result.state.engines.every(e => e.running));
});
