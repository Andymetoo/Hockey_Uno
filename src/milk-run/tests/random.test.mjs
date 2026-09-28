import test from 'node:test';
import assert from 'node:assert/strict';
import { seedToInt, random, die, drawBag, refillBag, drawDeck } from '../random.mjs';

const rng = seed => ({ rng: seedToInt(seed) });

test('a seed reproduces random values and dice without sharing mutable state', () => {
  const a = rng('MILK-RUN-test'), b = rng('MILK-RUN-test'), other = rng('different');
  const values = Array.from({ length: 80 }, () => random(a));
  assert.deepEqual(Array.from({ length: 80 }, () => random(b)), values);
  assert.notDeepEqual(Array.from({ length: 80 }, () => random(other)), values);
  assert.ok(values.every(n => n >= 0 && n < 1));
  assert.ok(Array.from({ length: 600 }, () => die(a, 6)).every(n => Number.isInteger(n) && n >= 1 && n <= 6));
});

test('mission draw removes a token until round refill, without an automatic discard', () => {
  const bag = { tokens: ['Resource', 'Resource'], discard: ['Enemy'] };
  const first = drawBag(rng('mission'), bag);
  assert.equal(first.token, 'Resource');
  assert.equal(first.refilled, false);
  assert.equal(bag.tokens.length, 1);
  assert.deepEqual(bag.discard, ['Enemy']);
  drawBag(rng('mission'), bag);
  assert.equal(bag.tokens.length, 0);
  assert.deepEqual(bag.discard, ['Enemy']);
  const emergency = drawBag(rng('mission'), bag);
  assert.equal(emergency.refilled, true);
  assert.equal(emergency.token, 'Enemy');
  assert.equal(bag.discard.length, 0);
});

test('round refill returns only discarded resources, preserving resources held outside bag', () => {
  const bag = { tokens: ['Enemy'], discard: ['Resource', 'Resource'] };
  refillBag(bag);
  assert.deepEqual(bag.tokens.sort(), ['Enemy', 'Resource', 'Resource']);
  assert.deepEqual(bag.discard, []);
  refillBag(bag);
  assert.equal(bag.tokens.length, 3, 'a second refill cannot duplicate tokens');
});

test('combat pulls deplete the bag and emergency refill recycles spent pulls', () => {
  const bag = { tokens: ['Hit', 'Miss'], discard: [] };
  const state = rng('combat');
  const pulls = [];
  for (let i = 0; i < 2; i++) {
    const result = drawBag(state, bag);
    assert.equal(result.refilled, false);
    pulls.push(result.token);
    bag.discard.push(result.token);
  }
  assert.deepEqual(pulls.sort(), ['Hit', 'Miss']);
  assert.equal(bag.tokens.length, 0);
  const result = drawBag(state, bag);
  assert.equal(result.refilled, true);
  assert.ok(['Hit', 'Miss'].includes(result.token));
  assert.equal(bag.tokens.length, 1);
  assert.equal(bag.discard.length, 0);
});

test('enemy deck holds discard until exhausted, then reshuffles exactly those cards', () => {
  const state = rng('deck');
  const deck = { cards: ['BF-109'], discard: ['Me-262', 'Flak'] };
  assert.deepEqual(drawDeck(state, deck), { card: 'BF-109', refilled: false });
  assert.equal(deck.cards.length, 0);
  assert.deepEqual(deck.discard.sort(), ['BF-109', 'Flak', 'Me-262']);
  const result = drawDeck(state, deck);
  assert.equal(result.refilled, true);
  assert.equal(deck.cards.length, 2);
  assert.equal(deck.discard.length, 1);
  assert.equal(deck.discard[0], result.card);
  assert.deepEqual([...deck.cards, ...deck.discard].sort(), ['BF-109', 'Flak', 'Me-262']);
});
