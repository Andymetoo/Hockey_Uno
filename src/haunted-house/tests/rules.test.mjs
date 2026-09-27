import test from 'node:test';
import assert from 'node:assert/strict';
import { act, previewAttack, supplyPreview } from '../game.ts';
import { baseFixture, addHaunting, addSupply, addConnection, position } from './fixtures.mjs';

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
 assert.equal(r.hauntings[0].hp, 11); assert.equal(r.resources.health, 22); assert.equal(r.resources.light, 4);
 r.resources.light = 3; assert.equal(act(r, { type: 'attack', hauntingId: h.id, mode: 'flare' }).committed, false);
});
test('ward and oil cost preparation turns, trigger regeneration, and consume only on their stated attacks', () => {
 let s = baseFixture(); const h = addHaunting(s, { hp: 10, maxHp: 30, attack: 5 });
 s = act(s, { type: 'ward' }).state; assert.equal(s.resources.light, 5); assert.equal(s.hauntings[0].hp, 12);
 s = act(s, { type: 'oil' }).state; assert.equal(s.hauntings[0].hp, 14); assert.equal(s.resources.oils, 0);
 s = act(s, { type: 'attack', hauntingId: h.id, mode: 'flare' }).state;
 assert.equal(s.resources.ward, true); assert.equal(s.resources.empowered, false); assert.equal(s.hauntings[0].hp, 4);
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

test('preview and execution agree across rules, armour, traits, buffs and level-up boundaries', () => {
 for (const ruleset of ['classic', 'power-flare']) for (const kind of ['shade', 'armour']) for (const trait of [undefined, 'brittle', 'smouldering']) for (const mode of ['strike', 'flare']) for (const ward of [false, true]) for (const empowered of [false, true]) for (const health of [1, 6, 22]) {
  const s = baseFixture(); s.ruleset = ruleset; Object.assign(s.resources, { ward, empowered, health, xp: 2 });
  const h = addHaunting(s, { kind, trait, hp: 7, maxHp: 7, attack: 5, xp: 8 });
  const p = previewAttack(s, h, mode), result = act(s, { type: 'attack', hauntingId: h.id, mode, acceptDeath: true });
  assert.equal(result.committed, true); assert.equal(result.state.hauntings[0].hp, p.enemyAfter);
  assert.equal(result.state.resources.health, p.finalHealth); assert.equal(result.state.resources.light, p.finalLight);
  assert.equal(result.state.resources.power, p.finalPower); assert.equal(result.state.resources.maxHealth, p.finalMaxHealth);
  assert.equal(result.state.resources.level - s.resources.level, p.levelsGained);
  assert.equal(result.state.status === 'dead', p.lethal);
  assert.equal(p.damage, Math.max(1, p.powerDamage + p.oilDamage + p.flareBonus + p.traitDamage - p.armourReduction));
  if (p.lethal) assert.equal(p.levelsGained, 0);
 }
});

test('candidate Flare changes a two-Flare threshold while Oil preserves useful finishes', () => {
 const s = baseFixture(), h = addHaunting(s, { hp: 20, maxHp: 20, xp: 3 });
 s.ruleset = 'classic'; assert.equal(Math.ceil(h.hp / previewAttack(s, h, 'flare').damage), 2);
 s.ruleset = 'power-flare'; assert.equal(Math.ceil(h.hp / previewAttack(s, h, 'flare').damage), 4);
 s.resources.empowered = true; assert.equal(previewAttack(s, h, 'flare').damage, 10);
 h.hp = 10; const p = previewAttack(s, h, 'flare'); assert.equal(p.kills, true); assert.equal(p.levelsGained, 1);
 assert.equal(p.lightAfter, 4); assert.equal(p.finalLight, 10); assert.equal(p.finalHealth, 25);
});

test('traits change distinct hit thresholds and vitality preserves missing-health arithmetic', () => {
 const s = baseFixture(), h = addHaunting(s, { hp: 8, maxHp: 8, trait: 'brittle' });
 assert.equal(previewAttack(s, h, 'strike').kills, true); assert.equal(previewAttack(s, h, 'flare').kills, false);
 h.trait = 'smouldering'; assert.equal(previewAttack(s, h, 'strike').kills, false); assert.equal(previewAttack(s, h, 'flare').kills, true);
 s.resources.health = 10; const charm = addSupply(s, 'vitality', { amount: 4 });
 const result = act(s, { type: 'use', supplyId: charm.id }); assert.equal(result.state.resources.health, 14); assert.equal(result.state.resources.maxHealth, 26);
 assert.deepEqual(act(result.state, { type: 'undo' }).state, s);
});

test('informational annotation spends a turn and reveals without rewarding stats or objective progress', () => {
 const s = baseFixture({ known: false }), note = addSupply(s, 'note', { text: 'A rule hint.' });
 s.rooms[0].discovered[note.position.y * 7 + note.position.x] = true;
 const before = structuredClone(s.resources), result = act(s, { type: 'use', supplyId: note.id });
 assert.equal(result.committed, true); assert.equal(result.state.turns, 1); assert.deepEqual(result.state.resources, before);
 assert.equal(result.state.supplies[0].used, true); assert.deepEqual(result.state.player, note.position);
 assert.equal(result.state.rooms[0].discovered.filter(Boolean).length, 9); assert.match(result.message, /Informational note only/);
 assert.equal(result.state.objective.completed, false);
});

test('regeneration follows committed turns across rooms and does not depend on food healing amount', () => {
 const s = baseFixture(); addConnection(s); addHaunting(s, { position: position(3, 3, 'study'), hp: 7, maxHp: 20, regen: 3 });
 const food = addSupply(s); s.resources.health = s.resources.maxHealth;
 const result = act(s, { type: 'use', supplyId: food.id });
 assert.equal(result.state.hauntings[0].hp, 10); assert.equal(result.state.resources.health, s.resources.health);
 assert.deepEqual(act(result.state, { type: 'undo' }).state, s);
});
