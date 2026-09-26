import test from 'node:test';
import assert from 'node:assert/strict';
import { act, banishCost, refillPreview, illuminated, interactions, objectiveReady } from '../game.ts';
import { TUNING } from '../content.ts';
import { refreshExploration } from '../world.ts';
import { addCandle, addContainer, addHaunting, baseFixture, cheapestFirstFixture, clone, connectRooms, markTile, orderingFixture, position } from './fixtures.mjs';

function perform(state, action, consequential = action.type !== 'undo') {
  const before = clone(state);
  const result = act(state, action);
  assert.deepEqual(state, before, 'actions never mutate their input');
  assert.equal(result.committed, true, `${JSON.stringify(action)}: ${result.message}`);
  assert.equal(result.consequential, consequential, JSON.stringify(action));
  return result.state;
}

function refused(state, action, reason) {
  const before = clone(state);
  const result = act(state, action);
  assert.equal(result.committed, false, JSON.stringify(action));
  assert.deepEqual(result.state, before, 'refused actions spend and change nothing');
  assert.deepEqual(state, before);
  if (reason) assert.match(result.message, reason);
  return result;
}

test('banishment charges the displayed resistance-minus-power cost once and grants the defined reward', () => {
  let state = baseFixture();
  const spirit = addHaunting(state, 'ritual-teacher', position(4, 3), 3, { power: 1, treasure: 2, item: 'moth-key' });
  assert.equal(banishCost(state, spirit), 2);
  const detail = interactions(state).find(interaction => interaction.action.type === 'banish');
  assert.ok(detail?.available);
  assert.match(`${detail.label} ${detail.detail}`, /2/);
  state = perform(state, { type: 'banish', hauntingId: spirit.id });
  assert.equal(state.light, 2);
  assert.equal(state.ritualPower, 2);
  assert.equal(state.treasure, 2);
  assert.deepEqual(state.inventory, ['moth-key']);
  assert.equal(state.hauntings[0].banished, true);
  assert.equal(state.decisions, 1);
  assert.equal(state.undo.length, 1);
  refused(state, { type: 'banish', hauntingId: spirit.id });
  state.ritualPower = 20;
  assert.equal(banishCost(state, spirit), 1);
});

test('banishment requires discovery, orthogonal physical adjacency, its specific item, and sufficient light', () => {
  const state = baseFixture();
  const spirit = addHaunting(state, 'bound-spirit', position(4, 3), 8, {}, { requires: 'keepsake' });
  refused(state, { type: 'banish', hauntingId: spirit.id });
  state.inventory.push('keepsake');
  refused(state, { type: 'banish', hauntingId: spirit.id }, /light|need|cost/i);
  spirit.resistance = 3;
  state.player = position(3, 2);
  refused(state, { type: 'banish', hauntingId: spirit.id }, /near|adjacent|beside|reach|next/i);
  state.player = position(3, 3);
  state.rooms[0].discovered[3 * 7 + 4] = false;
  refused(state, { type: 'banish', hauntingId: spirit.id });
  state.rooms[0].discovered[3 * 7 + 4] = true;
  assert.equal(perform(state, { type: 'banish', hauntingId: spirit.id }).light, 2);
});

test('walking and discovery leave stationary hauntings and resources unchanged, with no automatic contact attack', () => {
  let state = baseFixture();
  addHaunting(state, 'sentinel', position(4, 3), 3, { power: 1 });
  const spirit = clone(state.hauntings[0]);
  refused(state, { type: 'move', direction: 'east' });
  for (const direction of ['north', 'west', 'south', 'east', 'south', 'north']) {
    state = perform(state, { type: 'move', direction }, false);
    assert.deepEqual(state.hauntings[0], spirit);
    assert.equal(state.light, 4);
    assert.equal(state.status, 'active');
    assert.equal(state.undo.length, 0);
  }
  assert.equal(state.decisions, 0);
  assert.equal(state.steps, 6);
});

test('candle use is deliberate, capped, previewed for waste, and possible only once from an adjacent tile', () => {
  let state = baseFixture();
  const candle = addCandle(state, 'wax-stub', position(4, 3), 3);
  assert.deepEqual(refillPreview(state, candle), { received: 1, wasted: 2, total: 5 });
  state = perform(state, { type: 'move', direction: 'north' }, false);
  assert.equal(state.candles[0].used, false);
  assert.equal(state.light, 4);
  refused(state, { type: 'refill', candleId: candle.id });
  state = perform(state, { type: 'move', direction: 'south' }, false);
  refused(state, { type: 'move', direction: 'east' });
  state = perform(state, { type: 'refill', candleId: candle.id });
  assert.equal(state.light, 5);
  assert.equal(state.candles[0].used, true);
  refused(state, { type: 'refill', candleId: candle.id });
});

test('zero light remains playable and does not reduce exploration visibility or regenerate through movement', () => {
  let state = baseFixture();
  state.light = 0;
  state.rooms[0].discovered.fill(false);
  addCandle(state, 'last-candle', position(4, 3), 3);
  refreshExploration(state);
  assert.equal(illuminated(state, 4, 3), true);
  const remembered = clone(state.rooms[0].discovered);
  for (const direction of ['north', 'west', 'south', 'east']) state = perform(state, { type: 'move', direction }, false);
  assert.equal(state.light, 0);
  assert.equal(state.status, 'active');
  remembered.forEach((known, index) => { if (known) assert.equal(state.rooms[0].discovered[index], true); });
  assert.equal(perform(state, { type: 'refill', candleId: 'last-candle' }).light, 3);
});

test('the exact ordering fixture requires lesser spirit, candle, then stronger spirit', () => {
  let state = orderingFixture();
  assert.equal(banishCost(state, state.hauntings[0]), 2);
  assert.equal(banishCost(state, state.hauntings[1]), 6);
  refused(state, { type: 'banish', hauntingId: 'stronger' });
  state = perform(state, { type: 'banish', hauntingId: 'lesser' });
  assert.equal(state.light, 2);
  assert.equal(state.ritualPower, 2);
  state = perform(state, { type: 'refill', candleId: 'three-light-candle' });
  assert.equal(state.light, 5);
  state = perform(state, { type: 'banish', hauntingId: 'stronger' });
  assert.equal(state.light, 0);
  assert.equal(state.ritualPower, 2);
  assert.equal(objectiveReady(state), true);
  let wrong = orderingFixture();
  wrong = perform(wrong, { type: 'refill', candleId: 'three-light-candle' });
  wrong = perform(wrong, { type: 'banish', hauntingId: 'lesser' });
  assert.equal(wrong.light, 3);
  refused(wrong, { type: 'banish', hauntingId: 'stronger' }, /light|need|cost/i);
  assert.equal(wrong.status, 'active');
});

test('taking the cheapest encounter first prevents the necessary refill route paying for the objective', () => {
  const opening = cheapestFirstFixture();
  assert.equal(banishCost(opening, opening.hauntings[0]), 1);
  assert.equal(banishCost(opening, opening.hauntings[1]), 3);
  refused(opening, { type: 'move', direction: 'east' });
  refused(opening, { type: 'refill', candleId: 'guarded-candle' });
  for (const takeTreasure of [false, true]) {
    let state = clone(opening);
    if (takeTreasure) state = perform(state, { type: 'banish', hauntingId: 'treasure' });
    state = perform(state, { type: 'banish', hauntingId: 'candle-keeper' });
    state = perform(state, { type: 'move', direction: 'east' }, false);
    state = perform(state, { type: 'refill', candleId: 'guarded-candle' });
    assert.equal(state.light, takeTreasure ? 4 : 5);
    assert.equal(banishCost(state, state.hauntings[2]), 5);
    if (takeTreasure) refused(state, { type: 'banish', hauntingId: 'last-guardian' });
    else {
      state = perform(state, { type: 'banish', hauntingId: 'last-guardian' });
      assert.equal(objectiveReady(state), true);
      assert.equal(state.hauntings[0].banished, false);
    }
  }
});

test('local fixtures expose relevant costs, rewards, and candles before commitment', () => {
  for (const state of [orderingFixture(), cheapestFirstFixture()]) {
    const exposed = interactions(state);
    for (const haunting of state.hauntings) {
      const entry = exposed.find(item => item.action.type === 'banish' && item.action.hauntingId === haunting.id);
      assert.ok(entry, `${state.seed}: ${haunting.id} must be inspectable from the opening`);
      assert.match(`${entry.label} ${entry.detail}`, new RegExp(String(banishCost(state, haunting))));
      assert.ok(entry.name.includes(haunting.name));
    }
    for (const candle of state.candles) assert.ok(exposed.some(item => item.action.type === 'refill' && item.action.candleId === candle.id));
    assert.equal(state.decisions, 0);
    assert.equal(state.undo.length, 0);
  }
});

test('discovered spirits and candles remain inspectable from remembered scenery for free', () => {
  let state = orderingFixture();
  state = perform(state, { type: 'move', direction: 'south' }, false);
  state = perform(state, { type: 'move', direction: 'south' }, false);
  const before = clone(state);
  const entries = interactions(state);
  assert.ok(entries.some(item => item.action.type === 'banish' && item.action.hauntingId === 'stronger' && !item.adjacent));
  assert.ok(entries.some(item => item.action.type === 'refill' && !item.adjacent));
  assert.deepEqual(state, before);
});

test('searches grant fixed rewards once; key and crowbar gates are explicit and keep reusable items', () => {
  for (const gate of ['moth-key', 'thorn-key', 'crowbar']) {
    let state = baseFixture();
    const connection = connectRooms(state, { gate });
    addContainer(state, 'tool-cupboard', position(3, 2), { item: gate, power: 1 });
    state = perform(state, { type: 'search', containerId: 'tool-cupboard' });
    assert.equal(state.ritualPower, 2);
    refused(state, { type: 'search', containerId: 'tool-cupboard' });
    refused(state, { type: 'unlock', connectionId: connection.id });
    state = perform(state, { type: 'move', direction: 'east' }, false);
    refused(state, { type: 'move', direction: 'east' });
    state = perform(state, { type: 'unlock', connectionId: connection.id });
    assert.ok(state.inventory.includes(gate));
    assert.equal(state.connections[0].opened, true);
    state = perform(state, { type: 'move', direction: 'east' }, false);
    assert.deepEqual(state.player, connection.b, 'open passage movement travels automatically');
    state = perform(state, { type: 'travel', connectionId: connection.id }, false);
    assert.deepEqual(state.player, connection.a);
    assert.ok(state.inventory.includes(gate));
    assert.equal(state.rooms[0].containers[0].opened, true);
  }
});

test('undo restores the complete pre-decision snapshot including dependent rewards, exploration, and position', () => {
  const opening = orderingFixture();
  let state = perform(opening, { type: 'banish', hauntingId: 'lesser' });
  const afterLesser = clone(state);
  state = perform(state, { type: 'refill', candleId: 'three-light-candle' });
  state = perform(state, { type: 'banish', hauntingId: 'stronger' });
  state = perform(state, { type: 'move', direction: 'east' }, false);
  state = perform(state, { type: 'move', direction: 'south' }, false);
  state = perform(state, { type: 'undo' });
  assert.deepEqual(state.player, opening.player);
  assert.equal(state.hauntings[1].banished, false);
  assert.equal(state.inventory.includes('exit-key'), false);
  assert.equal(state.light, 5);
  state = perform(state, { type: 'undo' });
  assert.deepEqual(state, afterLesser);
  state = perform(state, { type: 'undo' });
  assert.deepEqual(state, opening);
  refused(state, { type: 'undo' });
  state = perform(state, { type: 'banish', hauntingId: 'lesser' });
  assert.equal(state.ritualPower, 2);
});

test('undo history is bounded, has no nested history, and ignores ordinary walking', () => {
  let state = baseFixture({ width: 21, height: 7 });
  state.player = position(1, 3);
  for (let x = 1; x <= TUNING.undoLimit + 3; x++) addContainer(state, `shelf-${x}`, position(x, 2), { treasure: 1 });
  for (let x = 1; x <= TUNING.undoLimit + 3; x++) {
    if (x > 1) state = perform(state, { type: 'move', direction: 'east' }, false);
    state = perform(state, { type: 'search', containerId: `shelf-${x}` });
  }
  assert.equal(state.undo.length, TUNING.undoLimit);
  assert.ok(state.undo.every(snapshot => !Object.hasOwn(snapshot, 'undo')));
  for (let count = 0; count < TUNING.undoLimit; count++) state = perform(state, { type: 'undo' });
  assert.equal(state.treasure, 3);
  refused(state, { type: 'undo' });
});

test('undo reverses dependent container rewards and an opened gate without duplicating the tool', () => {
  let state = baseFixture();
  const connection = connectRooms(state, { gate: 'crowbar' });
  addContainer(state, 'crowbar-case', position(3, 2), { item: 'crowbar' });
  addContainer(state, 'study-ledger', position(2, 3, 'study'), { power: 1, treasure: 3 });
  const opening = clone(state);
  state = perform(state, { type: 'search', containerId: 'crowbar-case' });
  state = perform(state, { type: 'move', direction: 'east' }, false);
  state = perform(state, { type: 'unlock', connectionId: connection.id });
  state = perform(state, { type: 'move', direction: 'east' }, false);
  state = perform(state, { type: 'search', containerId: 'study-ledger' });
  assert.equal(state.treasure, 3);
  state = perform(state, { type: 'undo' });
  assert.equal(state.treasure, 0);
  assert.equal(state.ritualPower, 1);
  assert.equal(state.rooms[1].containers[0].opened, false);
  state = perform(state, { type: 'undo' });
  assert.equal(state.connections[0].opened, false);
  assert.deepEqual(state.player, position(4, 3));
  assert.deepEqual(state.inventory, ['crowbar']);
  state = perform(state, { type: 'undo' });
  assert.deepEqual(state, opening);
  state = perform(state, { type: 'search', containerId: 'crowbar-case' });
  assert.deepEqual(state.inventory, ['crowbar']);
});

test('objectives require their item and return; settling the keepsake resolves its associated haunting', () => {
  for (const kind of ['escape', 'diary', 'keepsake']) {
    let state = baseFixture();
    state.objective.kind = kind;
    assert.equal(objectiveReady(state), false);
    state.player = clone(state.entrance);
    refused(state, { type: 'leave' });
    state.inventory.push(kind === 'escape' ? 'exit-key' : kind);
    if (kind === 'keepsake') {
      state.objective.altar = position(3, 2);
      state.objective.hauntingId = 'owner';
      state.objective.ritualCost = 1;
      markTile(state, state.objective.altar, { kind: 'altar' });
      addHaunting(state, 'owner', position(4, 2), 99, {}, { resolution: 'keepsake' });
      state.player = position(3, 3);
      assert.equal(objectiveReady(state), false);
      state = perform(state, { type: 'settle' });
      assert.equal(state.light, 3);
      assert.equal(state.objective.completed, true);
      assert.equal(state.hauntings[0].banished, true);
      const reverted = perform(state, { type: 'undo' });
      assert.equal(reverted.objective.completed, false);
      assert.equal(reverted.hauntings[0].banished, false);
    }
    assert.equal(objectiveReady(state), true);
    state.player = position(3, 3);
    refused(state, { type: 'leave' });
    state.player = clone(state.entrance);
    state = perform(state, { type: 'leave' });
    assert.equal(state.status, 'won');
    assert.equal(state.objective.completed, true);
    refused(state, { type: 'move', direction: 'north' });
    assert.equal(perform(state, { type: 'undo' }).status, 'active');
  }
});
