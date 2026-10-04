import assert from 'node:assert/strict';
import { openBrowser } from './browser-harness.mjs';
import { createGame as createGameBase } from '../state.mjs';
// Exercise the retained legacy interaction; compact ON has its own touch suite.
const createGame=(config={},...args)=>createGameBase({...(args[1]==='v2-continuous'?{v2CompactCrewFlow:false}:{}),...config},...args);
import { BOARD } from '../board.mjs';

const b = await openBrowser({ port: 9350, artifactFolder: 'diagnostics' });
const { evaluate, click, touch, viewport, inject, screenshot } = b;
const structure = BOARD.find(cell => cell.id === 'D2-3' && cell.structure) ?? BOARD.find(cell => cell.structure);
const empty = BOARD.find(cell => !cell.structure && !cell.engineIndicator);
const quietEmpty = BOARD.find(cell => !cell.structure && !cell.engineIndicator && cell.id !== empty.id);
const v2 = createGame({ opportunityEnabled: false }, 'inspection-test', 'v2-continuous');
v2.cells[structure.id] = 'damaged';
const log = [
  { sequence: 1, ruleset: 'v2-continuous', crewCycle: 4, cycleTurn: 7, type: 'ENEMY_ATTACK_ROLL', roll: 2, result: 'off-target', message: 'Off Target.' },
  { sequence: 2, ruleset: 'v2-continuous', crewCycle: 4, cycleTurn: 7, type: 'ENEMY_HIT_LOCATION', cellId: structure.id, message: `Hit location: ${structure.id}.` },
  { sequence: 3, ruleset: 'v2-continuous', crewCycle: 4, cycleTurn: 7, type: 'AIRCRAFT_SQUARE_DAMAGED', cellId: structure.id, message: `${structure.id}: healthy structure becomes damaged.` },
  { sequence: 4, ruleset: 'v2-continuous', crewCycle: 4, cycleTurn: 7, type: 'CREW_INJURED', crewId: 'engineer', message: `Engineer is injured by the hit at ${structure.id}.` },
  { sequence: 5, ruleset: 'v2-continuous', crewCycle: 8, cycleTurn: 3, type: 'FIRE_STARTED', cellId: structure.id, message: `${structure.id}: another damage step starts a fire.` },
  { sequence: 6, ruleset: 'v2-continuous', crewCycle: 12, cycleTurn: 2, type: 'AIRCRAFT_SQUARE_REPAIRED', cellId: structure.id, message: `${structure.id}: repaired to healthy.` },
  { sequence: 7, ruleset: 'v2-continuous', crewCycle: 6, cycleTurn: 1, type: 'ENEMY_HIT_LOCATION', cellId: empty.id, message: `Hit location: ${empty.id}.` },
  { sequence: 8, ruleset: 'v2-continuous', crewCycle: 6, cycleTurn: 1, type: 'ATTACK_EMPTY_SPACE', cellId: empty.id, message: `${empty.id}: the shot passes through empty space.` },
  { sequence: 9, ruleset: 'v2-continuous', crewCycle: 6, cycleTurn: 1, type: 'CREW_ACTION', action: 'manStation', crewId: 'engineer', message: 'Engineer: Man Station.' },
  { sequence: 10, ruleset: 'v2-continuous', crewCycle: 6, cycleTurn: 1, type: 'STATION_MANNED', crewId: 'engineer', stationId: 'radio', message: 'Engineer occupies Radio / dorsal gun.' },
  { sequence: 11, ruleset: 'v2-continuous', crewCycle: 7, cycleTurn: 2, type: 'CREW_ACTION', action: 'leaveStation', crewId: 'engineer', message: 'Engineer: Leave Station.' },
  { sequence: 12, ruleset: 'v2-continuous', crewCycle: 7, cycleTurn: 2, type: 'CREW_RELOCATED', crewId: 'engineer', cellId: 'D3-1', message: 'Engineer leaves the station for safe interior position D3-1.' },
  { sequence: 13, ruleset: 'v2-continuous', crewCycle: 8, cycleTurn: 3, type: 'CREW_ACTION', action: 'returnHome', crewId: 'engineer', message: 'Engineer: Return Home.' },
  { sequence: 14, ruleset: 'v2-continuous', crewCycle: 8, cycleTurn: 3, type: 'STATION_MANNED', crewId: 'engineer', stationId: 'engineer', message: 'Engineer occupies Engineer / top turret.' },
];

try {
  await viewport(1440, 1000);
  await inject(v2, { log });
  assert.equal(await evaluate("document.querySelector('[data-ui=hit-map-toggle]').getAttribute('aria-pressed')"), 'false');
  assert.equal(await evaluate("document.querySelectorAll('#board [data-hit-map-cell]').length"), 0, 'overlay starts off');

  await click('[data-ui=hit-map-toggle]');
  assert.equal(await evaluate("document.querySelectorAll('#board [data-hit-map-kind=aircraft]').length"), 1);
  assert.equal(await evaluate("document.querySelectorAll('#board [data-hit-map-kind=empty-space]').length"), 1);
  assert.equal(await evaluate(`document.querySelector('#board [data-hit-map-cell="${structure.id}"]').dataset.hitMapRolls`), '1');
  await evaluate("document.querySelector('#hit-map-structure').click()");
  assert.equal(await evaluate("document.querySelectorAll('#board [data-hit-map-kind=aircraft]').length"), 0, 'aircraft roll layer can be hidden separately');
  assert.equal(await evaluate("document.querySelectorAll('#board [data-hit-map-kind=empty-space]').length"), 1);
  await evaluate("document.querySelector('#hit-map-structure').click()");

  await click('#board [data-cell="' + structure.id + '"]');
  assert.equal(await evaluate("document.querySelector('#info-dialog').open"), true);
  assert.match(await evaluate("document.querySelector('#info-title').textContent"), /Cell History/);
  const history = await evaluate("document.querySelector('#info-content').textContent");
  assert.match(history, /Turn 38/);
  assert.match(history, /Attack location rolled here/);
  assert.match(history, /Healthy → Damaged/);
  assert.match(history, /Engineer injured here/);
  assert.match(history, /Damaged → Fire/);
  assert.match(history, /Repaired to Healthy/);
  await click('#info-dialog [data-ui=close]');
  assert.equal(await evaluate("document.querySelector('#info-dialog').open"), false);

  await click('#log-details > summary');
  const recorder = await evaluate("document.querySelector('#event-log').textContent");
  assert.match(recorder, /Man Station · Engineer → Radio \/ dorsal gun/);
  assert.match(recorder, /Leave Station · Engineer → D3-1/);
  assert.match(recorder, /Return Home · Engineer → Engineer \/ top turret/);
  await click('#log-details > summary');

  await viewport(320, 740);
  await touch(`#board [data-cell="${structure.id}"]`);
  assert.equal(await evaluate("document.querySelector('#info-dialog').open"), true, 'touch opens the cell inspection');
  await touch('#info-dialog [data-ui=close]');
  assert.equal(await evaluate("document.querySelector('#info-dialog').open"), false, 'touch closes the cell inspection');
  await touch(`#board [data-cell="${quietEmpty.id}"]`);
  assert.match(await evaluate("document.querySelector('#info-content').textContent"), /No recorded events at this square yet/);
  await touch('#info-dialog [data-ui=close]');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
  await screenshot('cell-history-touch-320');

  await click('[data-ui=dev]');
  await click('[data-ui=reset-v2]');
  assert.equal(await evaluate("document.querySelector('#dev-form [name=v2OpportunityProvokesEnemyPhase]').checked"), false);
  assert.equal(await evaluate("document.querySelector('#dev-form [name=v2OpportunityProvokesEnemyPhase]').closest('[data-config-scope]').dataset.configScope"), 'v2');
  console.log('PASS: default-off hit map, separate aircraft/empty layers, desktop and touch cell history, empty square message, station recorder summaries, V2 Dev toggle OFF');
  await b.writeResults({ passed: true, checks: 7, viewport: [1440, 320], exceptions: b.exceptions, badResponses: b.badResponses });
  assert.deepEqual(b.exceptions, []);
  assert.deepEqual(b.badResponses, []);
} finally { await b.close(); }
