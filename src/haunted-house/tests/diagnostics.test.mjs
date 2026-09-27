import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from '../game.ts';
import { encounterChoices, witnessMetrics } from '../diagnostics.ts';
import { generateCandidate } from '../generation.ts';
import { baseFixture, addHaunting } from './fixtures.mjs';

test('encounter diagnostics agree with uninterrupted legal strikes and include Oil and Ward thresholds', () => {
 const s = baseFixture(); s.resources.health = s.resources.maxHealth = 30;
 const h = addHaunting(s, { hp: 13, maxHp: 13, attack: 10 });
 const choice = encounterChoices(s, h);
 assert.equal(choice.strikeHits, 3); assert.equal(choice.strikeHealthCost, 30);
 assert.equal(choice.strikeSurvives, false); assert.equal(choice.wardSaved, 5);
 assert.equal(choice.wardChangesSurvival, true); assert.equal(choice.oilStrikeHitsSaved, 1);
 let prepared = act(s, { type: 'ward' }, false).state;
 for (let i = 0; i < choice.strikeHits; i++) {
  const result = act(prepared, { type: 'attack', hauntingId: h.id, mode: 'strike' }, false);
  assert.equal(result.committed, true); prepared = result.state;
 }
 assert.equal(prepared.resources.health, 5); assert.equal(prepared.hauntings[0].hp, 0);
});

test('diagnostics account for preparation regeneration and classic versus candidate Flare', () => {
 const s = baseFixture(); const h = addHaunting(s, { hp: 6, maxHp: 20, regen: 8 });
 const before = encounterChoices(s, h);
 assert.equal(before.strikeHits, 1); assert.ok(before.oilStrikeHitsSaved < 0);
 assert.ok(before.wardSaved < 0, 'preparing can give back more health than the Ward saves');
 h.hp = h.maxHp;
 assert.equal(encounterChoices(s, h).flareHits, 4);
 s.ruleset = 'classic'; assert.equal(encounterChoices(s, h).flareHits, 2);
});

test('witness measurements use real actions and measure surviving level-up refunds', () => {
 const s = baseFixture(); s.resources.xp = 2;
 const h = addHaunting(s, { hp: 6, maxHp: 6, xp: 1 });
 const m = witnessMetrics(s, [{ type: 'attack', hauntingId: h.id, mode: 'flare' }]);
 assert.equal(m.flares, 1); assert.equal(m.kills, 1); assert.equal(m.levelUps, 1);
 assert.equal(m.lightRefunded, 6); assert.equal(m.finalLight, 10);
 assert.throws(() => witnessMetrics(s, [{ type: 'attack', hauntingId: 'missing', mode: 'strike' }]));
});

test('expanded ingredients retain baseline food/light budgets, include all rewards and traits, and permit quiet branches', () => {
 const rewards = new Set(), traits = new Set(); let quiet = 0, noFood = 0, laterRewards = 0;
 for (let i = 0; i < 40; i++) {
  const seed = `ingredients-${i}`, old = generateCandidate(seed, 0, { ingredients: 'baseline' }), s = generateCandidate(seed, 0, { ingredients: 'expanded' });
  for (const kind of ['food', 'candle']) assert.equal(s.supplies.filter(x => x.kind === kind).length, old.supplies.filter(x => x.kind === kind).length, `${seed} ${kind}`);
  const reward = s.supplies.find(x => ['Ritual primer', 'Heartwood charm', "Alchemist's case"].includes(x.name));
  assert.ok(reward); rewards.add(reward.kind);
  if (Number(reward.position.roomId.slice(1)) >= Math.ceil(s.rooms.length / 2)) laterRewards++;
  for (const h of s.hauntings) if (h.trait) traits.add(h.trait);
  quiet += s.rooms.filter(r => !s.hauntings.some(h => h.position.roomId === r.id) && !s.supplies.some(x => x.position.roomId === r.id) && s.objective.altar?.roomId !== r.id).length;
  noFood += s.rooms.filter(r => !s.supplies.some(x => x.kind === 'food' && x.position.roomId === r.id)).length;
  assert.ok(s.supplies.some(x => x.kind === 'food' && x.position.roomId === 'r0'));
  assert.ok(s.supplies.some(x => x.kind === 'candle' && x.position.roomId === 'r0'));
 }
 assert.deepEqual([...rewards].sort(), ['oil', 'power', 'vitality']);
 assert.deepEqual([...traits].sort(), ['brittle', 'smouldering']);
 assert.ok(quiet > 0); assert.ok(noFood > 30); assert.ok(laterRewards > 0);
});

test('all generated key prerequisites can be obtained before their own gates and objectives remain on accessible branches', () => {
 for (let i = 0; i < 40; i++) {
  const s = generateCandidate(`prerequisites-${i}`), reachable = new Set(['r0']), tools = new Set();
  for (let pass = 0; pass < s.rooms.length * 2; pass++) {
   for (const x of s.supplies) if (x.item && reachable.has(x.position.roomId)) tools.add(x.item);
   for (const c of s.connections) if (!c.gate || tools.has(c.gate)) {
    if (reachable.has(c.a.roomId)) reachable.add(c.b.roomId);
    if (reachable.has(c.b.roomId)) reachable.add(c.a.roomId);
   }
  }
  assert.equal(reachable.size, s.rooms.length);
  assert.ok(reachable.has(s.hauntings.find(h => h.boss).position.roomId));
  if (s.objective.altar) assert.ok(reachable.has(s.objective.altar.roomId));
 }
 // Room prerequisites alone do not establish discovery/resource reachability;
 // generation.test.mjs separately replays every real action of accepted witnesses.
});
