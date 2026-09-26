import test from 'node:test';
import assert from 'node:assert/strict';
import { act, previewAttack, supplyPreview } from '../game.ts';
import { baseFixture, addHaunting, addSupply, position } from './fixtures.mjs';

test('deterministic simultaneous attacks match preview, including killing blow', () => {
 const s = baseFixture(); const h = addHaunting(s, { hp: 6, maxHp: 6 }); const p = previewAttack(s, h, 'strike');
 const r = act(s, { type: 'attack', hauntingId: h.id, mode: 'strike' });
 assert.equal(r.state.resources.health, p.healthAfter); assert.equal(r.state.hauntings[0].hp, 0); assert.equal(r.state.resources.health, 18); assert.equal(r.state.resources.xp, 1); assert.deepEqual(r.state.player, h.position);
});
test('lethal confirmation is atomic; cancelled attack does not change fog, time, or history', () => {
 const s = baseFixture(); s.resources.health = 4; const h = addHaunting(s, { hp: 6, maxHp: 6, xp: 3 }); const copy = structuredClone(s);
 const a = { type: 'attack', hauntingId: h.id, mode: 'strike' }; const r = act(s, a);
 assert.equal(r.lethal, true); assert.equal(r.committed, false); assert.deepEqual(s, copy);
 const fatal = act(s, { ...a, acceptDeath: true }); assert.equal(fatal.state.status, 'dead'); assert.equal(fatal.state.resources.level, 1); assert.equal(fatal.state.resources.health, 0); assert.deepEqual(act(fatal.state, { type: 'undo' }).state, s);
});
test('level-up follows surviving kill, grows stats, carries excess XP, restores both resources', () => {
 const s = baseFixture(); s.resources.health = 5; s.resources.light = 0; const h = addHaunting(s, { hp: 6, xp: 4 });
 const r = act(s, { type: 'attack', hauntingId: h.id, mode: 'strike' }).state;
 assert.equal(r.resources.level, 2); assert.equal(r.resources.xp, 1); assert.equal(r.resources.power, 8); assert.equal(r.resources.health, 25); assert.equal(r.resources.light, 10);
});
test('attacked spirit does not regenerate; every other wounded spirit does', () => {
 const s = baseFixture(); const h = addHaunting(s); addHaunting(s, { id: 'other', position: position(5, 5), hp: 10, maxHp: 20 });
 const r = act(s, { type: 'attack', hauntingId: h.id, mode: 'strike' }).state;
 assert.equal(r.hauntings[0].hp, 11); assert.equal(r.hauntings[1].hp, 12);
 const move = act(r, { type: 'move', to: position(1, 2) }).state; assert.equal(move.hauntings[0].hp, 13); assert.equal(move.hauntings[1].hp, 14);
});
test('food takes exactly one recovery turn for wounded spirits, independent of distance', () => {
 const s = baseFixture(); const h = addHaunting(s, { hp: 2, maxHp: 64 }); const x = addSupply(s); s.resources.health = 3;
 const r = act(s, { type: 'use', supplyId: x.id }).state; assert.equal(r.turns, 1); assert.equal(r.hauntings[0].hp, 4); assert.equal(r.resources.health, 17);
});
test('no passive player recovery, defeated spirits stay defeated, invalid actions do nothing', () => {
 const s = baseFixture(); s.resources.health = 7; addHaunting(s, { hp: 0 });
 const r = act(s, { type: 'move', to: position(1, 2) }).state; assert.equal(r.resources.health, 7); assert.equal(r.hauntings[0].hp, 0);
 assert.equal(act(r, { type: 'move', to: r.player }).state, r);
});
test('flare ignores armour and retaliation but spends light; insufficient light is rejected', () => {
 const s = baseFixture(); const h = addHaunting(s, { kind: 'armour' });
 assert.equal(previewAttack(s, h, 'strike').damage, 4);
 const r = act(s, { type: 'attack', hauntingId: h.id, mode: 'flare' }).state;
 assert.equal(r.hauntings[0].hp, 7); assert.equal(r.resources.health, 22); assert.equal(r.resources.light, 4);
 r.resources.light = 3; assert.equal(act(r, { type: 'attack', hauntingId: h.id, mode: 'flare' }).committed, false);
});
test('ward and oil cost preparation turns, trigger regeneration, and consume only on their stated attacks', () => {
 let s = baseFixture(); const h = addHaunting(s, { hp: 10, maxHp: 30, attack: 5 });
 s = act(s, { type: 'ward' }).state; assert.equal(s.resources.light, 5); assert.equal(s.hauntings[0].hp, 12);
 s = act(s, { type: 'oil' }).state; assert.equal(s.hauntings[0].hp, 14); assert.equal(s.resources.oils, 0);
 s = act(s, { type: 'attack', hauntingId: h.id, mode: 'flare' }).state;
 assert.equal(s.resources.ward, true); assert.equal(s.resources.empowered, false); assert.equal(s.hauntings[0].hp, 0);
 const h2 = addHaunting(s, { id: 'h2', position: position(5, 5), attack: 5 });
 s = act(s, { type: 'attack', hauntingId: h2.id, mode: 'strike' }).state; assert.equal(s.resources.health, 19); assert.equal(s.resources.ward, false);
});
test('supply preview caps restoration; eating frees tile, collection stores bottles', () => {
 const s = baseFixture(); const f = addSupply(s); s.resources.health = 20;
 assert.deepEqual(supplyPreview(s, f), { received: 2, wasted: 12, total: 22 });
 const c = addSupply(s, 'candle', { position: position(1, 2) }); assert.deepEqual(supplyPreview(s, c), { received: 2, wasted: 6, total: 10 });
 const t = addSupply(s, 'tonic', { position: position(2, 2) }); const r = act(s, { type: 'use', supplyId: t.id }).state; assert.equal(r.resources.tonics, 2); assert.equal(r.resources.health, 20);
});
test('full history survives over twelve decisions and restores exact starting fog/resources', () => {
 const s = baseFixture(); let current = s;
 for (let i = 0; i < 30; i++) current = act(current, { type: 'move', to: i % 2 ? position(3, 3) : position(1, 2) }).state;
 assert.equal(current.undo.length, 30);
 while (current.undo.length) current = act(current, { type: 'undo' }).state;
 assert.deepEqual(current, s);
});
test('objective requires the right item and return, and locket also needs memorial', () => {
 let s = baseFixture(); s.player = { ...s.entrance };
 assert.equal(act(s, { type: 'leave' }).committed, false); s.inventory.push('exit-key'); assert.equal(act(s, { type: 'leave' }).state.status, 'won');
 s.objective.kind = 'keepsake'; s.objective.altar = position(5, 5); s.inventory = ['keepsake'];
 assert.equal(act(s, { type: 'leave' }).committed, false); s = act(s, { type: 'settle' }).state; assert.equal(act(s, { type: 'leave' }).state.status, 'won');
});
