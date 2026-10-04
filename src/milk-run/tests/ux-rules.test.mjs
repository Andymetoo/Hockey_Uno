import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, QUADRANTS, ALTITUDES, STATIONS, CREW_DEFS, getCell } from '../board.mjs';
import { inwardHeading, fighterHeading, turnHeadingToward, turnHeadingAway } from '../spatial.mjs';
import { dispatch, postAttackPosition, operatingArc, gunArcLegal, eligibleCrisisTargets, crisisTargetCap, connectedTargetSelection, legalWorkPositions, availableActions } from '../rules.mjs';
import { fresh, activated, fighter, collect } from './fixtures.mjs';

const normalize = value => (value + 720) % 360;
const action = (state, name, extra = {}) => {
  const result = dispatch(state, { type: 'action', action: name, ...extra });
  if (result.state.phase !== 'opportunity') return result;
  const continued = dispatch(result.state, { type: 'continueEnemyPhase' });
  return { state: continued.state, events: [...result.events, ...continued.events] };
};

test('absolute headings use north/east/south/west and old fighters have a deterministic fallback', () => {
  assert.deepEqual(QUADRANTS.map(inwardHeading), [180, 270, 0, 90]);
  for (const quadrant of QUADRANTS) for (const facing of [0, 90, 180]) {
    const item = fighter('old', { quadrant, facing });
    assert.equal(fighterHeading(item), normalize(inwardHeading(quadrant) + facing));
    assert.equal(Object.hasOwn(item, 'heading'), false, 'rendering fallback does not mutate saved state');
    assert.equal(fighterHeading({ ...item, heading: 180 }), 180, 'stored absolute heading wins over relative facing');
  }
});

test('all 16 quadrant flybys preserve absolute heading and the existing relative-facing rules without RNG', () => {
  for (const origin of QUADRANTS) for (const quadrant of QUADRANTS) {
    const state = fresh();
    state.fighters = [fighter('f1', { quadrant: origin, heading: inwardHeading(origin) })];
    const rng = state.rng;
    const { emit, events } = collect();
    postAttackPosition(state, 'f1', emit, { quadrant, altitude: 'Low' });
    const target = state.fighters[0];
    const distance = Math.abs(QUADRANTS.indexOf(origin) - QUADRANTS.indexOf(quadrant));
    assert.equal(target.heading, inwardHeading(origin), `${origin} → ${quadrant} retains flight direction`);
    assert.equal(target.facing, Math.min(distance, 4 - distance) * 90);
    assert.equal(target.altitude, 'Low');
    assert.equal(state.rng, rng);
    assert.equal(events.find(event => event.type === 'FIGHTER_MOVED').heading, target.heading);
  }
});

test('fighters rotate the nearest quarter-turn toward the bomber, with deterministic opposite-heading ties', () => {
  for (const quadrant of QUADRANTS) for (const offset of [90, -90, 180]) {
    const state = activated('pilot');
    const heading = normalize(inwardHeading(quadrant) + offset);
    const facing = Math.abs(offset);
    state.fighters = [fighter('f1', { quadrant, heading, facing })];
    const result = action(state, 'wait');
    const target = result.state.fighters[0];
    assert.equal(target.facing, facing - 90);
    assert.equal(target.heading, offset === 180 ? normalize(heading + 90) : inwardHeading(quadrant));
    assert.equal(result.state.stats.enemyAttacks, 0);
    assert.equal(result.state.rng, state.rng, 'turning adds no random draws');
    assert.equal(turnHeadingToward({ ...target, heading: inwardHeading(quadrant) }), inwardHeading(quadrant));
  }
});

test('Navigator quarter-turns away update headings, then the normal enemy rotation resolves separately', () => {
  for (const quadrant of QUADRANTS) for (const offset of [0, 90, -90]) {
    const state = activated('navigator');
    const heading = normalize(inwardHeading(quadrant) + offset);
    state.fighters = [fighter('f1', { quadrant, heading, facing: Math.abs(offset) })];
    const result = action(state, 'rotateFighter', { targetId: 'f1' });
    const rotations = result.events.filter(event => event.type === 'FIGHTER_ROTATED');
    assert.equal(rotations.length, 2);
    assert.equal(rotations[0].heading, normalize(heading + (offset === -90 ? -90 : 90)));
    assert.equal(rotations[0].facing, Math.abs(offset) + 90);
    assert.equal(result.state.stats.enemyAttacks, 0);
    assert.equal(turnHeadingAway({ quadrant, heading: normalize(inwardHeading(quadrant) + 180) }), normalize(inwardHeading(quadrant) + 180));
  }
});

test('spawned fighters store absolute headings and old autosaves normalize lazily without changing randomness', () => {
  for (const spawnFacing of [0, 90]) {
    const ready = dispatch(fresh({ spawnFacing }), { type: 'startRound' }).state;
    ready.bags.mission = { tokens: ['Enemy'], discard: [] };
    ready.deck = { cards: ['BF-109'], discard: [] };
    const result = dispatch(ready, { type: 'activate', crewId: 'pilot' });
    const target = result.state.fighters[0];
    assert.equal(target.heading, normalize(inwardHeading(target.quadrant) + spawnFacing));
    assert.equal(result.events.find(event => event.type === 'FIGHTER_SPAWNED').state.fighters[0].heading, target.heading);
  }
  const legacy = activated('pilot');
  legacy.fighters = [fighter('old', { facing: 180 })];
  const result = action(legacy, 'wait');
  assert.equal(result.state.fighters[0].heading, 90);
  assert.equal(result.state.rng, legacy.rng);
  assert.equal(Object.hasOwn(legacy.fighters[0], 'heading'), false, 'dispatch preserves its input');
});

test('all gun previews match the authoritative sectors without consuming an activation', () => {
  const expected = {
    pilot: [], copilot: [], navigator: ['Fore/High', 'Fore/Level', 'Fore/Low'], bombardier: ['Fore/High', 'Fore/Level', 'Fore/Low'],
    radio: ['Aft/High', 'Aft/Level'], engineer: ['Fore','Starboard','Aft','Port'].flatMap(q => [`${q}/High`, `${q}/Level`]),
    ball: QUADRANTS.flatMap(q => [`${q}/Level`, `${q}/Low`]),
    leftWaist: ALTITUDES.map(a => `Port/${a}`), rightWaist: ALTITUDES.map(a => `Starboard/${a}`),
    tail: ALTITUDES.map(a => `Aft/${a}`),
  };
  const state = fresh();
  state.fighters = QUADRANTS.flatMap(quadrant => ALTITUDES.map(altitude => fighter(`${quadrant}/${altitude}`, { quadrant, altitude })));
  const before = structuredClone(state);
  for (const crew of CREW_DEFS) {
    const legal = state.fighters.filter(target => gunArcLegal(state, crew.id, target.id)).map(target => target.id);
    assert.deepEqual(legal, expected[crew.id]);
    assert.equal(Boolean(operatingArc(state, crew.id)), expected[crew.id].length > 0);
  }
  assert.deepEqual(state, before);
  const member = state.crew.find(crew => crew.id === 'engineer');
  member.used = true;
  assert.ok(operatingArc(state, member.id), 'used crew retain an arc for ordered shots');
  member.position = [STATIONS.engineer.cells[0]];
  assert.equal(operatingArc(state, member.id), null, 'displacement removes station preview');
  member.position = [...STATIONS.engineer.cells];
  member.health = 'injured';
  assert.equal(operatingArc(state, member.id), null);
});

test('crisis target selection shares eligible cells, adjacency and crew-specific capacities with rules', () => {
  const state = activated('engineer');
  for (const id of ['B2-4', 'B3-2', 'A3-1']) state.cells[id] = 'damaged';
  state.cells['C2-1'] = 'fire';
  state.jobs = [{ id: 'other', kind: 'repair', cells: ['A3-1'] }];
  assert.deepEqual(eligibleCrisisTargets(state, 'repair').map(cell => cell.id), ['B2-4', 'B3-2']);
  assert.deepEqual(eligibleCrisisTargets(state, 'fireControl').map(cell => cell.id), ['C2-1']);
  assert.deepEqual(eligibleCrisisTargets(state, 'medical'), []);
  assert.equal(connectedTargetSelection(state, 'repair', ['B2-4', 'B3-2']), true);
  assert.equal(connectedTargetSelection(state, 'repair', ['B2-4', 'B2-4']), false);
  assert.equal(connectedTargetSelection(state, 'repair', ['B2-4', 'A3-1']), false);
  assert.equal(connectedTargetSelection(state, 'repair', []), false);
  assert.equal(crisisTargetCap(state, 'engineer', 'repair'), state.config.repairCap + state.config.engineerBonus);
  assert.equal(crisisTargetCap(state, 'radio', 'repair'), state.config.repairCap);
  assert.equal(crisisTargetCap(state, 'radio', 'fireControl'), state.config.fireCap);
});

test('work positions are safe central interior on the primary main row, including shared crew footprints', () => {
  const state = activated('radio');
  for (const target of BOARD.filter(cell => cell.structure)) {
    const positions = legalWorkPositions(state, 'radio', [target.id]);
    assert.ok(positions.length, `${target.id} has interior work space`);
    assert.ok(positions.every(cell => cell.fuselage && [5, 6].includes(cell.x) && Math.floor(cell.y / 2) === Math.floor(target.y / 2)));
  }
  const positions = legalWorkPositions(state, 'radio', ['B2-4', 'B3-2']);
  assert.ok(positions.some(cell => state.crew.some(crew => crew.position.includes(cell.id))), 'normal crew occupancy does not block shared workspace');
  assert.ok(positions.every(cell => cell.id.startsWith('C2-') || cell.id.startsWith('D2-')));
  state.cells[positions[0].id] = 'fire';
  assert.ok(!legalWorkPositions(state, 'radio', ['B2-4']).some(cell => cell.id === positions[0].id));
  assert.deepEqual(legalWorkPositions(state, 'missing', ['B2-4']), []);
  assert.deepEqual(legalWorkPositions(state, 'radio', ['invalid']), []);
});

test('wing repair preserves actual targets while honoring an explicit occupied interior work position', () => {
  const state = activated('radio');
  const cells = ['B2-4', 'B3-2'];
  cells.forEach(id => { state.cells[id] = 'damaged'; });
  const workCellId = STATIONS.pilot.cells[0];
  const result = action(state, 'repair', { cells, workCellId });
  assert.deepEqual(result.state.jobs[0].cells, cells);
  assert.deepEqual(result.state.jobs[0].workPosition, [workCellId]);
  assert.deepEqual(result.state.crew.find(crew => crew.id === 'radio').position, [workCellId]);
  assert.deepEqual(result.state.crew.find(crew => crew.id === 'pilot').position, [workCellId]);
  assert.ok(cells.every(id => result.state.cells[id] === 'damaged'), 'queuing work does not prematurely repair targets');
});

test('wing/fire work rejects wing, different-row and burning positions before spending the action', () => {
  const state = activated('radio');
  state.cells['B2-4'] = 'fire';
  state.cells[STATIONS.pilot.cells[0]] = 'fire';
  state.crew.find(c=>c.id==='pilot').health='dead';
  const before = structuredClone(state);
  for (const workCellId of ['B2-4', 'C4-2', STATIONS.pilot.cells[0]]) {
    assert.throws(() => action(state, 'fireControl', { cells: ['B2-4'], workCellId }), /interior work position/i);
    assert.deepEqual(state, before);
  }
  const valid = legalWorkPositions(state, 'radio', ['B2-4'])[0].id;
  const worked = action(state, 'fireControl', { cells: ['B2-4'], workCellId: valid });
  assert.deepEqual(worked.state.jobs[0].cells, ['B2-4']);
  assert.deepEqual(worked.state.jobs[0].workPosition, [valid]);
});

test('crisis work refuses a fully burning interior row and legacy commands choose a deterministic legal position', () => {
  const state = activated('radio');
  state.cells['B2-4'] = 'damaged';
  const legal = legalWorkPositions(state, 'radio', ['B2-4']);
  const worked = action(state, 'repair', { cells: ['B2-4'] });
  assert.deepEqual(worked.state.jobs[0].workPosition, [legal[0].id]);
  assert.equal(worked.state.rng, state.rng, 'choosing work space does not consume RNG');
  for (const cell of legal) state.cells[cell.id] = 'fire';
  assert.equal(availableActions(state, 'radio').find(item => item.id === 'repair').enabled, false);
  assert.throws(() => action(state, 'repair', { cells: ['B2-4'] }), /interior work position/i);
});

test('Medical permits sharing the patient interior footprint without changing treatment timing', () => {
  const state = activated('radio');
  const patient = state.crew.find(crew => crew.id === 'leftWaist');
  patient.health = 'injured';
  const workCellId = patient.position[0];
  assert.ok(getCell(workCellId).fuselage);
  const worked = action(state, 'medical', { targetId: patient.id, workCellId });
  assert.deepEqual(worked.state.jobs[0].workPosition, [workCellId]);
  assert.equal(worked.state.jobs[0].completeRound, state.round + state.config.medicalDuration);
  assert.equal(worked.state.crew.find(crew => crew.id === patient.id).health, 'injured');
});
