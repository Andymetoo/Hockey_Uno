import test from 'node:test';
import assert from 'node:assert/strict';
import { act, previewAttack } from '../game.ts';
import { afterAction, attackMode, combatBars, currentFlareDamage, emptyInteraction, resourceBar, selectedEnemy, tapEnemy, toggleFlare } from '../interaction.ts';
import { baseFixture, addHaunting, addConnection, addSupply, position } from './fixtures.mjs';

test('first enemy tap selects freely, second requests exactly one standard Strike', () => {
 const game = baseFixture(), enemy = addHaunting(game), original = structuredClone(game);
 const first = tapEnemy(game, emptyInteraction(), enemy.id, 'hall');
 assert.equal(first.action, undefined); assert.equal(first.ui.selectedEnemyId, enemy.id); assert.equal(attackMode(first.ui), 'strike');
 const second = tapEnemy(game, first.ui, enemy.id, 'hall');
 assert.deepEqual(second.action, { type: 'attack', hauntingId: enemy.id, mode: 'strike' });
 assert.deepEqual(game, original);
 const result = act(game, second.action);
 assert.equal(result.state.turns, game.turns + 1); assert.equal(result.state.hauntings[0].hp, 11);
 assert.deepEqual(afterAction(result.state, second.ui, second.action, result.committed, 'hall'), { selectedEnemyId: enemy.id, flareQueued: false });
});

test('changing targets selects without attacking, including while Flare is queued', () => {
 const game = baseFixture(), first = addHaunting(game), other = addHaunting(game, { position: position(5, 3) });
 const initial = tapEnemy(game, emptyInteraction(), first.id).ui;
 for (const ui of [initial, toggleFlare(game, initial).ui]) {
  const changed = tapEnemy(game, ui, other.id);
  assert.equal(changed.action, undefined); assert.equal(changed.ui.selectedEnemyId, other.id); assert.equal(changed.ui.flareQueued, ui.flareQueued);
  assert.equal(game.turns, 0); assert.equal(game.resources.light, 8);
 }
});

test('Flare queues with or without a target, cancels free, casts once then returns to Strike', () => {
 const game = baseFixture(), enemy = addHaunting(game), original = structuredClone(game);
 const queue = toggleFlare(game, emptyInteraction());
 assert.equal(queue.action, undefined); assert.equal(queue.ui.flareQueued, true);
 const selected = tapEnemy(game, queue.ui, enemy.id); assert.equal(selected.action, undefined);
 const cancelled = toggleFlare(game, selected.ui); assert.equal(cancelled.ui.flareQueued, false); assert.equal(cancelled.ui.selectedEnemyId, enemy.id);
 assert.deepEqual(game, original);
 const cast = tapEnemy(game, selected.ui, enemy.id);
 assert.equal(cast.action.mode, 'flare');
 const result = act(game, cast.action), next = afterAction(result.state, cast.ui, cast.action, result.committed, 'hall');
 assert.equal(result.state.turns, 1); assert.equal(result.state.resources.light, 4); assert.equal(result.state.resources.health, 22);
 assert.equal(next.flareQueued, false); assert.equal(next.selectedEnemyId, enemy.id);
 assert.equal(tapEnemy(result.state, next, enemy.id).action.mode, 'strike');
});

test('unavailable Flare explains its cost and cannot silently fall back to Strike', () => {
 const game = baseFixture(), enemy = addHaunting(game); game.resources.light = 3;
 const selected = tapEnemy(game, emptyInteraction(), enemy.id).ui;
 const unavailable = toggleFlare(game, selected);
 assert.equal(unavailable.ui, selected); assert.match(unavailable.reason, /4 light.*3/);
 const staleQueue = { ...selected, flareQueued: true }, attempt = tapEnemy(game, staleQueue, enemy.id);
 assert.equal(attempt.action, undefined); assert.match(attempt.reason, /4 light.*3/);
 assert.equal(toggleFlare(game, staleQueue).ui.flareQueued, false); assert.equal(game.turns, 0);
});

test('successful movement, travel and undo clear both target and queue', () => {
 const game = baseFixture(), enemy = addHaunting(game), passage = addConnection(game);
 const ui = { selectedEnemyId: enemy.id, flareQueued: true };
 for (const action of [{ type: 'move', to: position(1, 2) }, { type: 'travel', connectionId: passage.id, from: passage.a }]) {
  const result = act(game, action); assert.equal(result.committed, true);
  assert.deepEqual(afterAction(result.state, ui, action, true, result.state.player.roomId), emptyInteraction());
  const undo = act(result.state, { type: 'undo' });
  assert.deepEqual(afterAction(undo.state, ui, { type: 'undo' }, undo.committed, 'hall'), emptyInteraction());
 }
});

test('other committed actions cancel queue, preserve valid target, and keep established costs', () => {
 for (const type of ['ward', 'oil', 'tonic', 'use']) {
  const game = baseFixture(), enemy = addHaunting(game); game.resources.health = 10;
  const supply = addSupply(game), ui = { selectedEnemyId: enemy.id, flareQueued: true };
  const action = type === 'use' ? { type, supplyId: supply.id } : { type };
  const result = act(game, action); assert.equal(result.committed, true); assert.equal(result.state.turns, 1);
  assert.deepEqual(afterAction(result.state, ui, action, true, 'hall'), { selectedEnemyId: enemy.id, flareQueued: false });
  if (type === 'ward') { assert.equal(result.state.resources.light, 5); assert.equal(result.state.resources.ward, true); }
  if (type === 'oil') { assert.equal(result.state.resources.oils, 0); assert.equal(result.state.resources.empowered, true); }
  if (type === 'tonic') { assert.equal(result.state.resources.tonics, 0); assert.equal(result.state.resources.health, 21); }
 }
});

test('rejected moves or unavailable item actions retain the queue without spending turns', () => {
 const game = baseFixture(), enemy = addHaunting(game), ui = { selectedEnemyId: enemy.id, flareQueued: true };
 for (const action of [{ type: 'move', to: game.player }, { type: 'tonic' }]) {
  const result = act(game, action);
  assert.equal(result.committed, false); assert.equal(afterAction(result.state, ui, action, false, 'hall'), ui);
  assert.equal(result.state, game); assert.equal(result.state.turns, 0);
 }
});

test('lethal killing Strike still requires confirmation and cancellation changes no game or input state', () => {
 const game = baseFixture(), enemy = addHaunting(game, { hp: 6, maxHp: 6, attack: 5, xp: 3 }); game.resources.health = 5;
 const ui = tapEnemy(game, emptyInteraction(), enemy.id).ui, before = structuredClone(game);
 const requested = tapEnemy(game, ui, enemy.id), result = act(game, requested.action);
 assert.equal(result.lethal, true); assert.equal(result.committed, false); assert.deepEqual(game, before);
 assert.equal(afterAction(result.state, ui, requested.action, result.committed), ui);
 const bars = combatBars(game, ui);
 assert.equal(bars.preview.lethal, true); assert.equal(bars.preview.kills, true); assert.equal(bars.preview.levelsGained, 0);
 assert.equal(bars.playerHealth.projected, 0); assert.equal(bars.enemyHealth.projected, 0);
 const confirmed = act(game, { ...requested.action, acceptDeath: true });
 assert.equal(confirmed.state.status, 'dead'); assert.equal(confirmed.state.resources.level, 1);
 assert.deepEqual(afterAction(confirmed.state, ui, requested.action, confirmed.committed), emptyInteraction());
});

test('dead, unknown, wrong-room or ended targets cannot become actionable stale selections', () => {
 const game = baseFixture(), enemy = addHaunting(game, { hp: 6, maxHp: 6 });
 const ui = tapEnemy(game, emptyInteraction(), enemy.id).ui, requested = tapEnemy(game, ui, enemy.id), result = act(game, requested.action);
 const next = afterAction(result.state, ui, requested.action, true, 'hall');
 assert.deepEqual(next, emptyInteraction()); assert.equal(selectedEnemy(result.state, ui), undefined);
 assert.equal(tapEnemy(result.state, ui, enemy.id).action, undefined);
 assert.equal(tapEnemy(game, ui, enemy.id, 'study').action, undefined);
 game.rooms[0].discovered[enemy.position.y * 7 + enemy.position.x] = false;
 assert.equal(tapEnemy(game, ui, enemy.id).action, undefined);
 game.rooms[0].discovered.fill(true); game.status = 'won';
 assert.equal(tapEnemy(game, ui, enemy.id).action, undefined); assert.equal(toggleFlare(game, ui).ui.flareQueued, false);
});

test('neutral bars preserve dimensions and labels; untargeted Flare uses the combat engine', () => {
 const game = baseFixture(), ui = emptyInteraction(), before = structuredClone(game), bars = combatBars(game, ui);
 assert.equal(bars.enemyHealth, undefined); assert.equal(bars.preview, undefined); assert.equal(bars.playerHealth.current, 22);
 assert.equal(bars.playerHealth.maximum, 22); assert.equal(bars.playerHealth.loss, 0); assert.equal(bars.playerLight.loss, 0);
 const queued = combatBars(game, { flareQueued: true });
 assert.equal(queued.playerLight.loss, 4); assert.equal(queued.playerHealth.loss, 0); assert.equal(queued.enemyHealth, undefined); assert.equal(queued.preview, undefined);
 assert.equal(bars.flareDamage, 6); game.resources.empowered = true; assert.equal(currentFlareDamage(game), 10);
 game.ruleset = 'classic'; assert.equal(currentFlareDamage(game), 14);
 game.ruleset = before.ruleset; game.resources.empowered = false; assert.deepEqual(game, before);
 assert.deepEqual(resourceBar(5, 10, -4), { current: 5, maximum: 10, projected: 0, loss: 5, currentPercent: 50, remainingPercent: 0, lossPercent: 50 });
 assert.equal(resourceBar(0, 0).currentPercent, 0);
});

test('damage segments show immediate costs separately from surviving level-up recovery', () => {
 const game = baseFixture(), enemy = addHaunting(game, { hp: 6, maxHp: 12, xp: 3, attack: 4 });
 game.resources.health = 5; game.resources.light = 4;
 const ui = { selectedEnemyId: enemy.id, flareQueued: false }, bars = combatBars(game, ui);
 assert.equal(bars.playerHealth.current, 5); assert.equal(bars.playerHealth.projected, 1); assert.equal(bars.playerHealth.loss, 4);
 assert.equal(bars.enemyHealth.current, 6); assert.equal(bars.enemyHealth.loss, 6);
 assert.equal(bars.preview.levelsGained, 1); assert.equal(bars.preview.finalHealth, 25); assert.equal(bars.preview.finalLight, 10);
 const flare = combatBars(game, { ...ui, flareQueued: true });
 assert.equal(flare.playerLight.current, 4); assert.equal(flare.playerLight.projected, 0); assert.equal(flare.playerLight.loss, 4);
 assert.equal(flare.preview.finalLight, 10); assert.equal(flare.playerHealth.loss, 0);
});

test('visual data and execution agree for armour, traits, Oil, Ward, level-ups and lethal attacks', () => {
 for (const kind of ['shade', 'armour']) for (const trait of [undefined, 'brittle', 'smouldering']) for (const flareQueued of [false, true])
 for (const empowered of [false, true]) for (const ward of [false, true]) for (const health of [1, 6, 22]) {
  const game = baseFixture(); Object.assign(game.resources, { health, empowered, ward, xp: 2 });
  const enemy = addHaunting(game, { kind, trait, hp: 7, maxHp: 12, attack: 5, xp: 8 });
  const ui = { selectedEnemyId: enemy.id, flareQueued }, original = structuredClone(game);
  const bars = combatBars(game, ui, 'hall'), p = previewAttack(game, enemy, attackMode(ui));
  assert.deepEqual(game, original); assert.deepEqual(bars.preview, p);
  assert.equal(bars.playerHealth.projected, p.healthAfter); assert.equal(bars.enemyHealth.projected, p.enemyAfter);
  assert.equal(bars.playerLight.projected, p.lightAfter);
  assert.equal(bars.playerHealth.loss, Math.min(health, p.incoming)); assert.equal(bars.enemyHealth.loss, Math.min(enemy.hp, p.damage));
  assert.equal(bars.playerLight.loss, p.lightCost);
  const requested = tapEnemy(game, ui, enemy.id, 'hall');
  const result = act(game, { ...requested.action, acceptDeath: true });
  assert.equal(result.state.resources.health, p.finalHealth); assert.equal(result.state.resources.light, p.finalLight);
  assert.equal(result.state.hauntings[0].hp, bars.enemyHealth.projected); assert.equal(result.state.turns, 1);
  assert.equal(result.state.status === 'dead', p.lethal); assert.equal(result.state.resources.level - game.resources.level, p.levelsGained);
 }
});

test('room switch/load/restart begin with an empty interaction rather than persisting a queue', () => {
 const game = baseFixture(), enemy = addHaunting(game), ui = { selectedEnemyId: enemy.id, flareQueued: true };
 assert.equal(selectedEnemy(game, ui, 'study'), undefined); assert.equal(combatBars(game, ui, 'study').preview, undefined);
 assert.deepEqual(emptyInteraction(), { flareQueued: false });
 assert.equal(JSON.stringify(game).includes('flareQueued'), false); assert.equal(JSON.stringify(game).includes('selectedEnemyId'), false);
});
