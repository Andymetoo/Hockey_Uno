import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from '../game.ts';
import { refreshExploration, known } from '../world.ts';
import { planRoute } from '../movement.ts';
import { baseFixture, addHaunting, addSupply, addConnection, markTile, position } from './fixtures.mjs';

test('any known empty destination is one turn across walls and living enemies', () => {
 const s = baseFixture(); addHaunting(s); markTile(s, position(3, 2), { kind: 'wall' });
 const route = planRoute(s, position(5, 1)); assert.equal(route.length, 1);
 const r = act(s, route[0]); assert.equal(r.state.turns, 1); assert.deepEqual(r.state.player, position(5, 1)); assert.equal(s.turns, 0);
});
test('hidden tiles, walls, food and spirits cannot be occupied', () => {
 const s = baseFixture(); addHaunting(s); addSupply(s); s.rooms[0].discovered[5 * 7 + 5] = false;
 for (const p of [position(0, 0), position(4, 3), position(2, 3), position(5, 5)]) { assert.equal(planRoute(s, p), null); assert.equal(act(s, { type: 'move', to: p }).committed, false); }
});
test('reveal is exactly 3 by 3 including diagonals around walls, with no recursion', () => {
 const s = baseFixture({ known: false }); markTile(s, position(3, 2), { kind: 'wall' }); refreshExploration(s);
 assert.equal(s.rooms[0].discovered.filter(Boolean).length, 9); assert.equal(known(s, position(4, 2)), true); assert.equal(known(s, position(5, 3)), false);
});
test('narrow corridor enemy blocks discovery, not a revealed destination beyond it', () => {
 const s = baseFixture({ known: false, solid: true });
 for (let x = 1; x <= 5; x++) markTile(s, position(x, 3), { kind: 'floor' });
 addHaunting(s, { position: position(2, 3) }); refreshExploration(s);
 assert.equal(known(s, position(1, 3)), false);
 assert.equal(act(s, { type: 'move', to: position(2, 3) }).committed, false);
 s.rooms[0].discovered[3 * 7 + 1] = true;
 assert.equal(act(s, { type: 'move', to: position(1, 3) }).committed, true);
});
test('diagonal destination behind a spirit is discovered and can be selected', () => {
 const s = baseFixture({ known: false }); addHaunting(s); markTile(s, position(3, 2), { kind: 'wall' }); refreshExploration(s);
 const r = act(s, { type: 'move', to: position(4, 2) }); assert.equal(r.committed, true); assert.equal(known(r.state, position(5, 1)), true);
});
test('food tile frees only on explicit use, including full-health waste', () => {
 const s = baseFixture({ known: false }); const food = addSupply(s, 'food', { position: position(2, 3) }); refreshExploration(s);
 assert.equal(known(s, position(1, 3)), false);
 const r = act(s, { type: 'use', supplyId: food.id }); assert.match(r.message, /14 wasted/); assert.equal(r.state.resources.health, 22); assert.equal(known(r.state, position(1, 3)), true);
});
test('rooms and floors retain discovery and allow remembered destination movement', () => {
 const s = baseFixture(); const c = addConnection(s, { kind: 'stairs' }); s.rooms[1].floor = 1;
 let r = act(s, { type: 'travel', connectionId: c.id, from: c.a }); assert.equal(r.state.turns, 1); assert.equal(r.state.player.roomId, 'study');
 r = act(r.state, { type: 'move', to: position(1, 2) }); assert.equal(r.committed, true); assert.equal(r.state.turns, 2);
 r = act(r.state, { type: 'move', to: position(2, 2, 'study') }); assert.equal(r.committed, true);
});
test('locked door does not reveal other endpoint; tool is reusable and unlock and travel each take one turn', () => {
 const s = baseFixture(); const c = addConnection(s, { opened: false, gate: 'moth-key' });
 assert.equal(act(s, { type: 'travel', connectionId: c.id, from: c.a }).committed, false);
 assert.equal(act(s, { type: 'unlock', connectionId: c.id }).committed, false);
 s.inventory.push('moth-key'); const a = act(s, { type: 'unlock', connectionId: c.id }); assert.equal(a.state.turns, 1); assert.equal(known(a.state, c.b), false); assert.deepEqual(a.state.inventory, ['moth-key']);
 const b = act(a.state, { type: 'travel', connectionId: c.id, from: c.a }); assert.equal(b.state.turns, 2); assert.equal(known(b.state, c.b), true);
});
