import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { die, random } from '../random.mjs';
import { dispatch } from '../rules.mjs';

export function fresh(overrides = {}, seed = 'rules-regression') {
  return createGame({ missionEnemy: 0, missionResource: 100, ...overrides }, seed);
}
export function apply(state, command) { return dispatch(state, command); }
export function activated(crewId = 'engineer', overrides = {}) {
  let state = dispatch(fresh(overrides), { type: 'startRound' }).state;
  state = dispatch(state, { type: 'activate', crewId }).state;
  assert.equal(state.phase, 'action');
  return state;
}
export function fighter(id = 'f1', overrides = {}) {
  return { id, type: 'BF-109', hp: 2, maxHp: 2, quadrant: 'Fore', altitude: 'High', facing: 0, ...overrides };
}
export function collect() {
  const events = [];
  const emit = (...args) => events.push(typeof args[0] === 'object' ? args[0] : { type: args[0], message: args[1], ...args[2] });
  return { events, emit };
}
export function rngForDice(values) {
  for (let initial = 0; initial < 100000; initial++) {
    const state = { rng: initial };
    if (values.every(value => die(state) === value)) return initial;
  }
  throw new Error(`No short RNG witness for dice ${values}`);
}
export function rngForIndexes(lengths, indexes) {
  for (let initial = 0; initial < 100000; initial++) {
    const state = { rng: initial };
    if (lengths.every((length, index) => Math.floor(random(state) * length) === indexes[index])) return initial;
  }
  throw new Error('No short RNG witness for bag indexes');
}
