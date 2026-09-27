import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCandidate, createGame, verifyCandidate } from '../generation.ts';
import { discoveryClosure, roomDistances, validateDependencies } from '../dependencies.ts';
import { positionKey } from '../world.ts';
import { replayWitness } from '../solver.ts';
import { ITEMS } from '../content.ts';
import { carveRoom } from '../room-patterns.ts';
import { baseFixture, markTile, addConnection, addSupply, position } from './fixtures.mjs';

test('discovery closure follows 3x3 revelation through walls, including diagonals, without pathfinding', () => {
 const s = baseFixture({ solid: true, known: false });
 // Diagonal floors have no orthogonal walking path, but are valid discovered clicks.
 for (let i = 1; i < 6; i++) markTile(s, position(i, i), { kind: 'floor' });
 const result = discoveryClosure(s);
 assert.ok(result.seen.has(positionKey(position(5, 5))));
 assert.ok(!result.seen.has(positionKey(position(5, 1))));
});

test('closed endpoints cannot reveal beyond themselves; a tool behind its own gate is rejected', () => {
 const s = baseFixture({ solid: true, known: false });
 const gate = addConnection(s, { a: position(2, 1), gate: 'moth-key', opened: false });
 addSupply(s, 'cache', { position: position(3, 1, 'study'), item: 'moth-key' });
 const result = discoveryClosure(s);
 assert.ok(result.seen.has(positionKey(gate.a)));
 assert.ok(!result.seen.has(positionKey(position(3, 1))));
 assert.ok(!result.seen.has(positionKey(gate.b)));
 assert.equal(validateDependencies(s).valid, false);
 s.supplies[0].position = position(1, 2); markTile(s, position(1, 2), { kind: 'floor' });
 assert.equal(validateDependencies(s).valid, true);
 assert.ok(discoveryClosure(s).seen.has(positionKey(gate.b)));
});

test('adventures have acyclic discovery prerequisites, unbypassed seals, accurate clues and optional rewards', () => {
 const structures = new Set(), identities = new Set(); let quiet = 0, shortcuts = 0, chains = 0;
 for (let i = 0; i < 80; i++) {
  const s = generateCandidate(`dependency-${i}`), report = validateDependencies(s);
  assert.equal(report.valid, true, JSON.stringify(report));
  structures.add(s.objective.structure);
  assert.ok(report.requiredGates.length >= 1 && report.requiredGates.length <= 2);
  assert.equal(report.optionalGates.length, 1);
  for (const room of s.rooms) { identities.add(room.identity); assert.ok(room.accent && room.flavor); }
  const boss = s.hauntings.find(h => h.boss);
  for (const id of report.requiredGates) {
   const c = s.connections.find(c => c.id === id), tool = s.supplies.find(x => x.item === c.gate);
   assert.ok(!discoveryClosure(s, undefined, id).seen.has(positionKey(boss.position)));
   assert.ok(discoveryClosure(s, c.gate).seen.has(positionKey(tool.position)));
   assert.ok(roomDistances(s, c.a.roomId).get(tool.position.roomId) <= 2);
   const clue = s.journal.find(line => line.startsWith(ITEMS[c.gate].name));
   for (const roomId of [tool.position.roomId, c.a.roomId, c.b.roomId]) assert.ok(clue.includes(s.rooms.find(r => r.id === roomId).name));
   if (report.prerequisites[id].length) chains++;
  }
  const optional = s.connections.find(c => c.id === report.optionalGates[0]);
  const note = s.supplies.find(x => x.noteType === 'clue');
  const tool = s.supplies.find(x => x.item === optional.gate);
  assert.equal(note.position.roomId, tool.position.roomId);
  assert.ok(note.text.includes(ITEMS[optional.gate].name));
  assert.ok(note.text.includes(s.rooms.find(r => r.id === optional.b.roomId).name));
  assert.ok(!s.journal.some(line => line.includes(ITEMS[optional.gate].name)));
  const prize = s.supplies.find(x => x.position.roomId === optional.b.roomId && note.text.includes(x.name));
  assert.ok(prize && note.text.includes(prize.name));
  quiet += s.rooms.filter(r => !s.hauntings.some(h => h.position.roomId === r.id)).length;
  shortcuts += +s.connections.some(c => c.id === 'shortcut');
 }
 assert.ok(structures.size >= 8); assert.ok(identities.has('pantry') && identities.has('chapel'));
 assert.ok(quiet > 0 && shortcuts > 0 && chains > 0);
});

test('room identities alter generated footprints under the same seed, without authored layouts', () => {
 const footprints = ['hall', 'library', 'gallery', 'study'].map(identity => carveRoom('r', 'Label', 0, { rng: 12345 }, identity).tiles);
 assert.equal(new Set(footprints.map(x => JSON.stringify(x))).size, 4);
});

test('a shortcut across a mandatory prerequisite region is rejected', () => {
 const s = generateCandidate('bypass-proof');
 const free = roomId => {
  const r = s.rooms.find(r => r.id === roomId);
  const i = r.tiles.findIndex((t, n) => t.kind === 'floor' && !s.supplies.some(x => x.position.roomId === roomId && x.position.x === n % r.width && x.position.y === Math.floor(n / r.width)));
  return { roomId, x: i % r.width, y: Math.floor(i / r.width) };
 };
 addConnection(s, { id: 'bad-shortcut', a: free('r0'), b: free(s.hauntings.find(h => h.boss).position.roomId) });
 const report = validateDependencies(s);
 assert.equal(report.valid, false);
 assert.ok(report.errors.some(e => e.includes('bypassed')));
});

test('accepted adventure has a real winning witness which skips its locked reward branch', { timeout: 180000 }, () => {
 const s = createGame('optional-proof'), before = structuredClone(s);
 const result = verifyCandidate(s);
 assert.equal(result.solved, true);
 assert.deepEqual(s, before, 'verification must not mutate the playable house');
 const won = replayWitness(s, result.actions); assert.ok(won);
 const optional = validateDependencies(s).optionalGates;
 for (const id of optional) {
  const c = won.connections.find(c => c.id === id);
  assert.equal(c.opened, false);
  assert.equal(won.rooms.find(r => r.id === c.b.roomId).visited, false);
  assert.ok(won.supplies.filter(x => x.position.roomId === c.b.roomId).every(x => !x.used));
 }
});
