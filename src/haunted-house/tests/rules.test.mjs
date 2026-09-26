import test from 'node:test';
import assert from 'node:assert/strict';
import { act, candle, illuminated, objectiveReady, turnsUntilSpirit } from '../game.ts';
import { SAVE_VERSION, TUNING } from '../content.ts';

const copy = value => structuredClone(value);
const position = (x, y, roomId = 'hall') => ({ roomId, x, y });
const equalPosition = (a, b) => a.roomId === b.roomId && a.x === b.x && a.y === b.y;
const tile = (state, p) => {
  const room = state.rooms.find(candidate => candidate.id === p.roomId);
  return room?.tiles[p.y * room.width + p.x];
};

function room(id = 'hall', floor = 0) {
  const width = 7, height = 7;
  return {
    id, name: id, floor, width, height,
    tiles: Array.from({ length: width * height }, (_, index) => ({
      kind: index % width === 0 || index % width === width - 1 || index < width || index >= width * (height - 1) ? 'wall' : 'floor',
    })),
    containers: [], discovered: Array(width * height).fill(false), visited: false,
  };
}

function fixture() {
  const hall = room();
  hall.tiles[5 * hall.width + 1] = { kind: 'exit' };
  return {
    version: SAVE_VERSION, seed: 'rule-fixture', rng: 741,
    rooms: [hall], connections: [],
    player: position(2, 2), spirit: position(4, 4), entrance: position(1, 5),
    turn: 0, spiritMoves: 0, inventory: [], matches: TUNING.startingMatches,
    charm: true, treasure: 0,
    objective: { kind: 'escape', title: 'Escape', description: 'Find the key.', completed: false },
    evidence: [], log: [], status: 'active',
  };
}

function connect(state, kind = 'door', gate) {
  const second = room('study', kind === 'stairs' ? 1 : 0);
  state.rooms.push(second);
  const connection = { id: 'passage', a: position(5, 3), b: position(1, 3, second.id), kind, opened: !gate, ...(gate ? { gate } : {}) };
  state.connections.push(connection);
  for (const endpoint of [connection.a, connection.b]) {
    const target = state.rooms.find(candidate => candidate.id === endpoint.roomId);
    target.tiles[endpoint.y * target.width + endpoint.x] = { kind, connectionId: connection.id };
  }
  return connection;
}

function commit(state, action) {
  const before = copy(state);
  const result = act(state, action);
  assert.deepEqual(state, before, 'actions must not mutate their input');
  assert.equal(result.committed, true, result.message);
  return result;
}

test('only committed actions advance the spirit clock, and movement happens every fourth turn', () => {
  let state = fixture();
  const initialSpirit = copy(state.spirit);
  assert.equal(turnsUntilSpirit(state), 4);
  for (let turn = 1; turn <= 12; turn++) {
    const before = state;
    const result = commit(state, { type: 'wait' });
    state = result.state;
    assert.equal(state.turn, turn);
    assert.equal(state.spiritMoves, Math.floor(turn / 4));
    assert.equal(result.spiritMoved, turn % 4 === 0);
    assert.equal(turnsUntilSpirit(state), 4 - turn % 4);
    if (turn < 4) assert.deepEqual(state.spirit, initialSpirit);
    if (turn % 4 !== 0) assert.deepEqual(state.spirit, before.spirit);
    assert.ok(!equalPosition(state.player, state.spirit));
  }
});

test('walls, unknown targets, unavailable interactions, and empty match supplies spend no turn', () => {
  const state = fixture();
  state.player = position(1, 1);
  state.matches = 0;
  for (const action of [
    { type: 'move', direction: 'north' },
    { type: 'move', direction: 'west' },
    { type: 'search', containerId: 'missing' },
    { type: 'unlock', connectionId: 'missing' },
    { type: 'travel', connectionId: 'missing' },
    { type: 'match', direction: 'east' },
    { type: 'settle' },
    { type: 'leave' },
  ]) {
    const before = copy(state);
    const result = act(state, action);
    assert.equal(result.committed, false, JSON.stringify(action));
    assert.deepEqual(result.state, before);
    assert.deepEqual(state, before);
  }
});

test('the candle means exactly one orthogonally adjacent spirit, excluding diagonals and other rooms', () => {
  const state = fixture();
  state.player = position(3, 3);
  for (let y = 1; y <= 5; y++) {
    for (let x = 1; x <= 5; x++) {
      state.spirit = position(x, y);
      assert.equal(candle(state), Math.abs(x - 3) + Math.abs(y - 3) === 1, `${x},${y}`);
    }
  }
  state.spirit = position(3, 2, 'another-room');
  assert.equal(candle(state), false);
});

test('initial illumination follows the configurable orthogonal radius and keeps map memory', () => {
  const state = fixture();
  state.player = position(3, 3);
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      assert.equal(illuminated(state, x, y), Math.abs(x - 3) + Math.abs(y - 3) <= TUNING.lightRadius);
    }
  }
  state.rooms[0].discovered[1 * 7 + 1] = true;
  const next = commit(state, { type: 'move', direction: 'east' }).state;
  assert.equal(next.rooms[0].discovered[1 * 7 + 1], true);
  assert.equal(illuminated(next, 1, 1), false);
  assert.equal(next.rooms[0].discovered[3 * 7 + 4], true);
});

test('contact resolves before a scheduled spirit step; the charm bounces the player back once', () => {
  const state = fixture();
  state.turn = 3;
  state.spirit = position(3, 2);
  const protectedResult = commit(state, { type: 'move', direction: 'east' });
  assert.equal(protectedResult.state.charm, false);
  assert.equal(protectedResult.state.status, 'active');
  assert.deepEqual(protectedResult.state.player, state.player);
  assert.equal(protectedResult.state.turn, 4);
  assert.equal(protectedResult.state.spiritMoves, 1);

  const unprotected = copy(state);
  unprotected.charm = false;
  const defeat = commit(unprotected, { type: 'move', direction: 'east' });
  assert.equal(defeat.state.status, 'lost');
  assert.equal(defeat.state.turn, 3, 'a dead player does not advance the clock');
  assert.equal(defeat.state.spiritMoves, 0);
  assert.deepEqual(defeat.state.spirit, unprotected.spirit);
  assert.equal(defeat.spiritMoved, false);
  const ended = act(defeat.state, { type: 'wait' });
  assert.equal(ended.committed, false);
  assert.deepEqual(ended.state, defeat.state);
});

test('matches report the tile after the checking turn, then expire at the next spirit movement', () => {
  const state = fixture();
  state.turn = 3;
  state.spirit = position(3, 2);
  const checked = commit(state, { type: 'match', direction: 'east' });
  let current = checked.state;
  assert.equal(current.matches, state.matches - 1);
  assert.equal(current.spiritMoves, 1);
  assert.equal(current.evidence.length, 1);
  assert.deepEqual(current.evidence[0].position, position(3, 2));
  assert.equal(current.evidence[0].haunted, false, 'the spirit must leave its old tile before the result is recorded');
  assert.equal(current.evidence[0].epoch, current.spiritMoves);
  const evidence = copy(current.evidence);
  for (let count = 0; count < 3; count++) current = commit(current, { type: 'wait' }).state;
  assert.deepEqual(current.evidence, evidence);
  const remembered = copy(current.rooms[0].discovered);
  current = commit(current, { type: 'wait' }).state;
  assert.equal(current.evidence.length, 0);
  remembered.forEach((known, index) => { if (known) assert.equal(current.rooms[0].discovered[index], true); });
});

test('a spirit follows legal single steps and connections, never the player, walls, or locked passages', () => {
  let crossed = false;
  for (const locked of [false, true]) {
    for (let seed = 1; seed <= 50; seed++) {
      let state = fixture();
      state.rng = seed;
      const connection = connect(state, 'stairs', locked ? 'moth-key' : undefined);
      state.spirit = copy(connection.a);
      const repeat = copy(state);
      for (let count = 0; count < 80; count++) {
        const before = state;
        const result = commit(state, { type: 'wait' });
        state = result.state;
        if (!result.spiritMoved) continue;
        assert.ok(!equalPosition(state.player, state.spirit));
        assert.ok(['floor', 'door', 'stairs', 'exit'].includes(tile(state, state.spirit)?.kind));
        if (before.spirit.roomId === state.spirit.roomId) {
          assert.equal(Math.abs(before.spirit.x - state.spirit.x) + Math.abs(before.spirit.y - state.spirit.y), 1);
        } else {
          assert.equal(locked, false, 'closed stairs may not be crossed');
          assert.ok((equalPosition(before.spirit, connection.a) && equalPosition(state.spirit, connection.b)) ||
            (equalPosition(before.spirit, connection.b) && equalPosition(state.spirit, connection.a)));
          crossed = true;
        }
      }
      let repeated = repeat;
      for (let count = 0; count < 80; count++) repeated = act(repeated, { type: 'wait' }).state;
      assert.deepEqual(state, repeated, 'random spirit outcomes must be seed deterministic');
    }
  }
  assert.equal(crossed, true, 'the fixture must exercise cross-room spirit movement');
});

test('a disturbed remote threshold refuses travel without charging a blind lethal turn', () => {
  let state = fixture();
  const connection = connect(state);
  state.player = copy(connection.a);
  state.spirit = copy(connection.b);
  const blocked = act(state, { type: 'travel', connectionId: connection.id });
  assert.equal(blocked.committed, false);
  assert.deepEqual(blocked.state, state);
  for (let count = 0; count < 4; count++) state = commit(state, { type: 'wait' }).state;
  assert.ok(!equalPosition(state.spirit, connection.b), 'waiting must clear the destination');
  const crossed = commit(state, { type: 'travel', connectionId: connection.id }).state;
  assert.deepEqual(crossed.player, connection.b);
  assert.equal(crossed.charm, true);
});

test('waiting clears every guttering direction without consuming a charm or match', () => {
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    for (let phase = 0; phase < TUNING.spiritEveryTurns; phase++) {
      for (let seed = 1; seed <= 20; seed++) {
        let state = fixture();
        state.rng = seed;
        state.turn = phase;
        state.player = position(3, 3);
        state.spirit = position(3 + dx, 3 + dy);
        assert.equal(candle(state), true);
        const waits = turnsUntilSpirit(state);
        for (let count = 0; count < waits; count++) state = act(state, { type: 'wait' }).state;
        assert.equal(candle(state), false, `direction ${dx},${dy}, phase ${phase}, seed ${seed}`);
        assert.equal(state.status, 'active');
        assert.equal(state.charm, true);
        assert.equal(state.matches, TUNING.startingMatches);
      }
    }
  }
});

test('closed passages require their own reusable tool and a nearby player', () => {
  for (const gate of ['moth-key', 'thorn-key', 'crowbar']) {
    let state = fixture();
    const connection = connect(state, 'door', gate);
    state.player = copy(connection.a);
    for (const action of [
      { type: 'unlock', connectionId: connection.id },
      { type: 'travel', connectionId: connection.id },
    ]) {
      const result = act(state, action);
      assert.equal(result.committed, false);
      assert.deepEqual(result.state, state);
    }
    state.inventory = ['moth-key', 'thorn-key', 'crowbar'].filter(item => item !== gate);
    assert.equal(act(state, { type: 'unlock', connectionId: connection.id }).committed, false);
    state.inventory.push(gate);
    state.player = position(1, 1);
    assert.equal(act(state, { type: 'unlock', connectionId: connection.id }).committed, false);
    state.player = copy(connection.a);
    state = commit(state, { type: 'unlock', connectionId: connection.id }).state;
    assert.equal(state.connections[0].opened, true);
    assert.ok(state.inventory.includes(gate));
    assert.equal(act(state, { type: 'unlock', connectionId: connection.id }).committed, false);
  }
});

test('searches, reusable keys, opened doors, and discoveries persist through a room round trip', () => {
  let state = fixture();
  const connection = connect(state, 'door', 'moth-key');
  const chest = { id: 'desk', label: 'Desk', x: 2, y: 3, opened: false, item: 'moth-key', matches: 2, treasure: 3 };
  state.rooms[0].containers.push(chest);
  state.rooms[0].tiles[3 * 7 + 2] = { kind: 'container', containerId: chest.id };
  state = commit(state, { type: 'search', containerId: chest.id }).state;
  assert.ok(state.inventory.includes('moth-key'));
  assert.equal(state.matches, TUNING.startingMatches + 2);
  assert.equal(state.treasure, 3);
  assert.equal(state.rooms[0].containers[0].opened, true);
  assert.equal(act(state, { type: 'search', containerId: chest.id }).committed, false);
  state.player = copy(connection.a);
  state.spirit = position(4, 5);
  state = commit(state, { type: 'unlock', connectionId: connection.id }).state;
  assert.equal(state.connections[0].opened, true);
  assert.ok(state.inventory.includes('moth-key'));
  const remembered = copy(state.rooms[0]);
  state = commit(state, { type: 'travel', connectionId: connection.id }).state;
  state = commit(state, { type: 'travel', connectionId: connection.id }).state;
  assert.deepEqual(state.player, connection.a);
  assert.deepEqual(state.rooms[0].containers, remembered.containers);
  assert.deepEqual(state.rooms[0].tiles, remembered.tiles);
  remembered.discovered.forEach((known, index) => { if (known) assert.equal(state.rooms[0].discovered[index], true); });
  assert.equal(state.connections[0].opened, true);
});

test('every objective requires its own completion and a return to the entrance', () => {
  for (const kind of ['escape', 'diary', 'keepsake']) {
    let state = fixture();
    state.player = copy(state.entrance);
    state.objective.kind = kind;
    assert.equal(objectiveReady(state), false);
    assert.equal(act(state, { type: 'leave' }).committed, false);
    state.inventory.push(kind === 'escape' ? 'exit-key' : kind);
    if (kind === 'keepsake') {
      state.objective.altar = position(3, 3);
      state.rooms[0].tiles[3 * 7 + 3] = { kind: 'altar' };
      assert.equal(objectiveReady(state), false);
      state.player = position(3, 2);
      state = commit(state, { type: 'settle' }).state;
      assert.equal(state.objective.completed, true);
    }
    assert.equal(objectiveReady(state), true);
    state.player = position(2, 2);
    assert.equal(act(state, { type: 'leave' }).committed, false);
    state.player = copy(state.entrance);
    state = commit(state, { type: 'leave' }).state;
    assert.equal(state.status, 'won');
    assert.equal(act(state, { type: 'wait' }).committed, false);
  }
});
