import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, generateCandidate } from '../generation.ts';
import { solve, replayWitness } from '../solver.ts';
import { act } from '../game.ts';
import { parseSave, isGameState } from '../persistence.ts';

test('generation is seeded, procedural, and has varied geometry, room trees and objectives', () => {
 const layouts = new Set(), trees = new Set(), goals = new Set();
 for (let i = 0; i < 30; i++) { const s = generateCandidate(`variety-${i}`); assert.ok(isGameState(s)); layouts.add(JSON.stringify(s.rooms.map(r => r.tiles))); trees.add(JSON.stringify(s.connections.map(c => [c.a.roomId, c.b.roomId, c.gate]))); goals.add(s.objective.kind); assert.equal(s.rooms.some(r => r.floor === 1), true); }
 assert.equal(layouts.size, 30); assert.ok(trees.size > 15); assert.equal(goals.size, 3); assert.deepEqual(generateCandidate('same'), generateCandidate('same'));
});
test('accepted houses have real winning witnesses; every turn can save/reload, and full undo reaches the initial state', { timeout: 180000 }, () => {
 for (const seed of ['first-light', 'moth-window', 'silent-stairs', 'bread-and-ghosts', 'winter-ink', 'brass-lock']) {
  const initial = createGame(seed); const result = solve(initial); assert.equal(result.solved, true, seed); assert.ok(replayWitness(initial, result.actions), seed);
  let s = initial;
  for (const a of result.actions) { const r = act(s, a); assert.equal(r.committed, true, `${seed}: ${JSON.stringify(a)}`); const saved = parseSave(JSON.stringify(r.state)); assert.equal(saved.kind, 'loaded', seed); s = saved.state; }
  assert.equal(s.status, 'won', seed);
  while (s.undo.length) s = act(s, { type: 'undo' }).state;
  assert.deepEqual(s, initial, seed);
 }
});
test('bounded search failure means unverified, and invalid seeds are rejected', () => {
 const s = generateCandidate('budget'); const r = solve(s, 0); assert.equal(r.solved, false); assert.equal(r.reason, 'budget');
 assert.throws(() => createGame('')); assert.throws(() => createGame('a'.repeat(101)));
});
