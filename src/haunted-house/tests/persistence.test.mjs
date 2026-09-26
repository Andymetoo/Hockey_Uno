import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, saveGame, parseSave, SAVE_KEY, LEGACY_KEYS } from '../persistence.ts';
import { act } from '../game.ts';
import { baseFixture, addHaunting, position } from './fixtures.mjs';
const memory = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }; };
test('save resumes exact resources, fog, wounded enemies and full undo', () => {
 let s = baseFixture(); const h = addHaunting(s); s = act(s, { type: 'attack', hauntingId: h.id, mode: 'strike' }).state;
 s = act(s, { type: 'move', to: position(1, 2) }).state; const store = memory(); assert.equal(saveGame(s, store).ok, true);
 const loaded = loadGame(store); assert.equal(loaded.kind, 'loaded'); assert.deepEqual(loaded.state, s);
 assert.deepEqual(act(loaded.state, { type: 'undo' }), act(s, { type: 'undo' }));
});
test('dead and resource-exhausted saves remain loadable', () => {
 const s = baseFixture(); s.resources.health = 1; const h = addHaunting(s); const dead = act(s, { type: 'attack', hauntingId: h.id, mode: 'strike', acceptDeath: true }).state;
 assert.equal(parseSave(JSON.stringify(dead)).kind, 'loaded'); s.resources.light = 0; s.resources.tonics = 0; assert.equal(parseSave(JSON.stringify(s)).kind, 'loaded');
});
test('v1 and v2 archives survive new saves and remain separately downloadable', () => {
 const store = memory(); LEGACY_KEYS.forEach((k, i) => store.setItem(k, `archive-${i}`)); const s = baseFixture(); saveGame(s, store);
 const r = loadGame(store); assert.equal(r.kind, 'loaded'); assert.equal(r.archives.length, 2); LEGACY_KEYS.forEach((k, i) => assert.equal(store.getItem(k), `archive-${i}`));
});
test('bad saves are preserved and storage failures are reported', () => {
 const store = memory(); store.setItem(SAVE_KEY, '{bad'); const r = loadGame(store); assert.equal(r.kind, 'error'); assert.equal(r.raw, '{bad'); assert.equal(store.getItem(SAVE_KEY), '{bad');
 assert.equal(saveGame(baseFixture(), { setItem() { throw new Error(); } }).ok, false);
 assert.equal(loadGame({ getItem() { throw new Error(); } }).kind, 'error');
});
test('malformed current and historical state, invalid references, oversized files are rejected', () => {
 const s = baseFixture(); const valid = act(s, { type: 'move', to: position(1, 2) }).state;
 const changes = [x => x.resources.health = -1, x => x.player.x = 99, x => x.rooms[0].discovered.pop(), x => x.undo[0].hp.push(4), x => x.undo[0].resources.power = 'six', x => x.inventory.push('fake-key'), x => x.rooms[0].tiles[10] = { kind: 'door', connectionId: 'missing' }];
 for (const change of changes) { const x = structuredClone(valid); change(x); assert.equal(parseSave(JSON.stringify(x)).kind, 'error'); }
 assert.equal(parseSave('x'.repeat(12000001)).kind, 'error');
});
