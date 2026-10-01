import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, getCell } from '../board.mjs';
import { deriveCellHistory, hitLocationHeatMap } from '../diagnostics.mjs';
import { groupEvents } from '../presentation.mjs';

test('cell history distinguishes rolled location, actual damage, Fire, injury, suppression, and repair', () => {
  const log = [
    { sequence: 1, ruleset: 'v2-continuous', crewCycle: 4, cycleTurn: 7, type: 'ENEMY_HIT_LOCATION', cellId: 'D2-3' },
    { sequence: 2, ruleset: 'v2-continuous', crewCycle: 4, cycleTurn: 7, type: 'AIRCRAFT_SQUARE_DAMAGED', cellId: 'D2-3' },
    { sequence: 3, ruleset: 'v2-continuous', crewCycle: 4, cycleTurn: 7, type: 'CREW_INJURED', crewId: 'engineer', message: 'Engineer is injured by the hit at D2-3.' },
    { sequence: 4, ruleset: 'v2-continuous', crewCycle: 8, cycleTurn: 3, type: 'FIRE_STARTED', cellId: 'D2-3', message: 'D2-3: another damage step starts a fire.' },
    { sequence: 5, ruleset: 'v2-continuous', crewCycle: 8, cycleTurn: 3, type: 'WORK_STARTED', kind: 'fireControl', cells: ['D2-3'], message: 'Fire Control starts at D2-3. Selected fires are suppressed while this job remains active.' },
    { sequence: 6, ruleset: 'v2-continuous', crewCycle: 8, cycleTurn: 3, type: 'FIRE_EXTINGUISHED', cellId: 'D2-3', message: 'D2-3: fire is extinguished, leaving damaged structure.' },
    { sequence: 7, ruleset: 'v2-continuous', crewCycle: 8, cycleTurn: 3, type: 'WORK_COMPLETED', kind: 'fireControl', cells: ['D2-3'], message: 'Fire Control completed: D2-3 extinguished.' },
    { sequence: 8, ruleset: 'v2-continuous', crewCycle: 12, cycleTurn: 2, turn: 113, type: 'AIRCRAFT_SQUARE_REPAIRED', cellId: 'D2-3' },
  ];
  const history = deriveCellHistory(log, 'D2-3');
  assert.equal(history.structure, getCell('D2-3').structure);
  assert.deepEqual(history.entries.map(entry => entry.description), [
    'Attack location rolled here', 'Healthy → Damaged', 'Engineer injured here', 'Damaged → Fire',
    'Fire Control started · suppression begins', 'Fire suppressed · leaves damaged structure',
    'Fire Control completed here', 'Repaired to Healthy',
  ]);
  assert.equal(history.entries[0].time, 'Turn 38');
  assert.equal(history.entries.at(-1).time, 'Turn 113');
  assert.deepEqual(deriveCellHistory([], 'D2-3').entries, []);
});

test('empty-space and aircraft hit-location counts exclude failed attack rolls', () => {
  const structure = BOARD.find(cell => cell.structure).id;
  const empty = BOARD.find(cell => !cell.structure && !cell.engineIndicator).id;
  const counts = hitLocationHeatMap([
    { type: 'ENEMY_ATTACK_ROLL', result: 'off-target', roll: 2 },
    { type: 'ENEMY_ATTACK_ROLL', result: 'miss', roll: 1 },
    { type: 'ENEMY_HIT_LOCATION', cellId: structure },
    { type: 'ENEMY_HIT_LOCATION', cellId: structure },
    { type: 'ENEMY_HIT_LOCATION', cellId: empty },
    { type: 'ENEMY_LOCATION_FOCUS', presentationOnly: true, cellId: empty },
  ]);
  assert.equal(counts.structureRolls, 2);
  assert.equal(counts.emptyRolls, 1);
  assert.equal(counts.totalRolls, 3);
  assert.equal(counts.structure[structure], 2);
  assert.equal(counts.empty[empty], 1);
  assert.equal(counts.emptyRolls + counts.structureRolls, counts.totalRolls);
});

test('recorder summaries surface fire spread, completed work, medical, cancellation, and station outcomes', () => {
  const groups = groupEvents([
    { sequence: 1, round: 1, type: 'FIRE_PHASE_STARTED', message: 'Fire phase: 1 unsuppressed fire group.' },
    { sequence: 2, round: 1, type: 'FIRE_SPREAD_ROLL', cellId: 'D2-3', roll: 3, result: 'fore', message: 'Fire group at D2-3 rolls 3: spread fore.' },
    { sequence: 3, round: 1, type: 'FIRE_SPREAD_BLOCKED', cellId: 'D2-3', cells: ['D2-3'], direction: 'fore', message: 'Fire from D2-3 is blocked.' },
    { sequence: 4, round: 1, type: 'WORK_COMPLETING', message: 'Engineer completes Repair.' },
    { sequence: 5, round: 1, type: 'AIRCRAFT_SQUARE_REPAIRED', cellId: 'D2-3' },
    { sequence: 6, round: 1, type: 'WORK_COMPLETED', kind: 'repair', cells: ['D2-3', 'D2-4'], message: 'Repair completed: D2-3, D2-4 repaired.' },
    { sequence: 7, round: 1, type: 'CREW_ACTION', action: 'returnHome', crewId: 'engineer' },
    { sequence: 8, round: 1, type: 'STATION_MANNED', crewId: 'engineer', stationId: 'engineer' },
    { sequence: 9, round: 1, type: 'WORK_CANCELLED', kind: 'fireControl', message: 'Fire Control cancelled: Engineer is injured. Fire suppression ends.' },
    { sequence: 10, round: 1, type: 'WORK_COMPLETING', message: 'Radio Operator completes Medical.' },
    { sequence: 11, round: 1, type: 'CREW_HEALED', crewId: 'pilot' },
    { sequence: 12, round: 1, type: 'WORK_COMPLETED', kind: 'medical', targetId: 'pilot', message: 'Medical completed: Pilot treated.' },
    { sequence: 13, round: 1, type: 'WORK_COMPLETING', message: 'Radio Operator completes Fire Control.' },
    { sequence: 14, round: 1, type: 'FIRE_EXTINGUISHED', cellId: 'C1-1', message: 'C1-1: fire is extinguished, leaving damaged structure.' },
    { sequence: 15, round: 1, type: 'WORK_COMPLETED', kind: 'fireControl', cells: ['C1-1', 'C1-2'], message: 'Fire Control completed: C1-1, C1-2 extinguished.' },
    { sequence: 16, round: 1, type: 'UNAVAILABLE_CREW_SLOT', crewId: 'engineer', message: 'Crew Cycle slot 4/10: Engineer is unavailable; no crew action.' },
    { sequence: 17, round: 1, type: 'MISSION_TOKEN_DRAWN', token: 'Time', message: 'Engineer draws Time.' },
    { sequence: 18, round: 1, type: 'TIME_GAINED', message: 'TIME 2/4. Active work advances by one Time.', token: 'Time' },
    { sequence: 19, round: 1, type: 'ENEMY_PHASE_STARTED', message: 'Enemy phase: resolve fighters in visible queue order.' },
    { sequence: 20, round: 1, type: 'FIRE_PHASE_STARTED', message: 'Fire phase: 1 unsuppressed fire group.' },
    { sequence: 21, round: 1, type: 'FIRE_SPREAD_ROLL', cellId: 'E2-1', roll: 2, result: 'no spread', message: 'Fire group at E2-1 rolls 2: no spread.' },
  ]);
  assert.match(groups[0].summary, /Fire Spread · D2-3 d3 fore/);
  assert.match(groups[0].summary, /blocked fore/);
  assert.match(groups[1].title, /Repair completed · D2-3, D2-4 repaired/);
  assert.match(groups[2].title, /Return Home · Engineer → Engineer \/ top turret/);
  assert.match(groups[3].title, /Fire Control cancelled: Engineer is injured/);
  assert.match(groups[4].title, /Medical completed · Pilot treated/);
  assert.match(groups.find(group => group.events.some(event => event.type === 'WORK_COMPLETED' && event.kind === 'fireControl')).title, /Fire Control completed · C1-1, C1-2 extinguished/);
  assert.match(groups.find(group => group.events.some(event => event.type === 'UNAVAILABLE_CREW_SLOT')).title, /Unavailable crew slot · Engineer · Time draw · \+1 Time · 2\/4/);
  assert.match(groups.find(group => group.events.some(event => event.type === 'FIRE_SPREAD_ROLL' && event.result === 'no spread')).title, /d2 no spread/);
});
