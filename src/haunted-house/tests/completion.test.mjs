import test from 'node:test';
import assert from 'node:assert/strict';
import { beginRun, completionReport, explorationTargets } from '../completion.ts';
import { COMPLETIONS_KEY, loadCompletedRuns, loadGame, saveGame, parseSave } from '../persistence.ts';
import { act } from '../game.ts';
import { refreshExploration } from '../world.ts';
import { baseFixture, addHaunting, addSupply, addConnection, markTile, position } from './fixtures.mjs';
const memory = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }; };

test('exploration excludes walls and inaccessible decorative floor, includes visible memorials', () => {
 const s = baseFixture({ width: 11, height: 7, solid: true, known: false });
 for (const p of [position(1, 1), position(2, 1), position(3, 2)]) markTile(s, p, { kind: 'floor' });
 markTile(s, position(4, 2), { kind: 'altar' });
 markTile(s, position(9, 5), { kind: 'floor' });
 s.player = { ...s.entrance }; refreshExploration(s);
 const targets = explorationTargets(s); assert.equal(targets[0].filter(Boolean).length, 4);
 assert.equal(targets[0][5 * 11 + 9], false);
 assert.equal(completionReport(s).exploration.discovered, 2);
 let current = act(s, { type: 'move', to: position(2, 1) }).state;
 current = act(current, { type: 'move', to: position(3, 2) }).state;
 assert.deepEqual(completionReport(current).exploration, { discovered: 4, total: 4 });
 assert.equal(current.rooms[0].discovered[2 * 11 + 4], true);
});

test('exploration denominator follows passage discovery across rooms and remains stable after clearing occupants', () => {
 const s = baseFixture({ known: false }); s.player = { ...s.entrance }; refreshExploration(s);
 addConnection(s, { kind: 'stairs', opened: false, gate: 'crowbar' });
 addHaunting(s); const supply = addSupply(s, 'food');
 const before = completionReport(s).exploration.total; assert.equal(before, 50);
 s.connections[0].opened = true; s.hauntings[0].hp = 0; supply.used = true;
 assert.equal(completionReport(s).exploration.total, before);
});

test('an impassable memorial does not create imaginary viewing positions beyond a chokepoint', () => {
 const s = baseFixture({ width: 9, solid: true, known: false }); s.player = { ...s.entrance };
 markTile(s, position(2, 1), { kind: 'altar' });
 markTile(s, position(3, 1), { kind: 'floor' }); markTile(s, position(4, 1), { kind: 'floor' });
 refreshExploration(s);
 assert.deepEqual(completionReport(s).exploration, { discovered: 2, total: 2 });
 assert.equal(act(s, { type: 'move', to: position(2, 1) }).committed, false);
 assert.equal(act(s, { type: 'move', to: position(3, 1) }).committed, false);
});

test('completion counts floor supply uses and pocket consumables without counting rewards or notes', () => {
 const s = baseFixture(); s.status = 'won';
 addSupply(s, 'food', { position: position(1, 2) });
 addSupply(s, 'candle', { position: position(2, 2), amount: 8 });
 addSupply(s, 'oil', { position: position(3, 2), amount: 3 });
 addSupply(s, 'tonic', { position: position(4, 2), amount: 2 });
 addSupply(s, 'treasure', { position: position(5, 2), amount: 3, used: true }); s.resources.treasure = 3;
 addSupply(s, 'vitality', { position: position(1, 3), amount: 4 });
 addSupply(s, 'note', { position: position(2, 3) });
 addHaunting(s, { hp: 0 }); addHaunting(s, { position: position(5, 3) });
 const r = completionReport(s);
 assert.equal(r.objective.completed, true); assert.deepEqual(r.hauntings, { defeated: 1, total: 2 });
 assert.deepEqual(r.treasure, { collected: 3, total: 3 });
 assert.deepEqual(r.supplies.floor, { food: 1, candle: 1, tonic: 2, oil: 3, total: 7 });
 assert.deepEqual(r.supplies.pocket, { tonic: 1, oil: 1, total: 2 }); assert.equal(r.supplies.total, 9);
 assert.ok(r.commendations.some(c => c.title === 'Into the morning'));
 assert.ok(r.commendations.some(c => c.title === 'Curious explorer'));
 assert.ok(r.commendations.some(c => c.title === 'Treasure finder'));
 assert.ok(r.commendations.some(c => c.title === 'Well provisioned'));
 assert.ok(!r.commendations.some(c => c.title === 'Peacebringer'));
 s.supplies.forEach(x => x.used = true); s.resources.tonics = 0; s.resources.oils = 0;
 const spent = completionReport(s); assert.equal(spent.supplies.total, 0);
 assert.ok(spent.commendations.some(c => c.title === 'Into the morning')); assert.match(spent.explanation, /as valid as supplies saved/);
});

test('completed run records are unique after reload, import, undo and a revised ending', () => {
 const store = memory(); let s = beginRun(baseFixture()); const firstId = s.runId;
 s.inventory.push('exit-key'); s = act(s, { type: 'move', to: s.entrance }).state;
 s = act(s, { type: 'leave' }).state; assert.equal(saveGame(s, store).ok, true);
 assert.equal(loadCompletedRuns(store).records.length, 1);
 const loaded = loadGame(store); assert.equal(loaded.kind, 'loaded'); assert.equal(saveGame(loaded.state, store).ok, true);
 const imported = parseSave(JSON.stringify(s)); assert.equal(imported.kind, 'loaded'); saveGame(imported.state, store);
 assert.equal(loadCompletedRuns(store).records.length, 1);
 s = act(s, { type: 'undo' }).state; assert.equal(s.runId, firstId); saveGame(s, store);
 s = act(s, { type: 'move', to: position(2, 1) }).state; s = act(s, { type: 'move', to: s.entrance }).state;
 s = act(s, { type: 'leave' }).state; saveGame(s, store);
 const records = loadCompletedRuns(store).records; assert.equal(records.length, 1); assert.equal(records[0].report.turns, s.turns);
 const another = beginRun(s); assert.notEqual(another.runId, firstId); saveGame(another, store);
 assert.equal(loadCompletedRuns(store).records.length, 2);
});

test('damaged completion records stay untouched and a finished save remains exportable', () => {
 const store = memory(); store.setItem(COMPLETIONS_KEY, '{damaged');
 let s = beginRun(baseFixture()); s.inventory.push('exit-key'); s.player = { ...s.entrance }; s = act(s, { type: 'leave' }).state;
 const result = saveGame(s, store); assert.equal(result.ok, false); assert.match(result.message, /Run saved/);
 assert.equal(store.getItem(COMPLETIONS_KEY), '{damaged'); assert.equal(loadGame(store).kind, 'loaded');
 assert.match(loadCompletedRuns(store).message, /preserved/);
 assert.equal(parseSave(JSON.stringify(s)).kind, 'loaded');
});
