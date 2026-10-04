/** Serializable seeded PRNG. Random choices never depend on presentation speed. */
export function freshSortieSeed() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
  const code = [...bytes].map(n => alphabet[n & 31]).join('');
  return `MR-${code.slice(0, 4)}-${code.slice(4)}`;
}

export function seedToInt(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function random(state) {
  state.rng = (state.rng + 0x6D2B79F5) >>> 0;
  let value = state.rng;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
export const die = (state, sides = 6) => Math.floor(random(state) * sides) + 1;

/** A random-index draw is equivalent to shuffling, without additional RNG calls. */
export function refillBag(bag) {
  const count = bag.discard.length;
  bag.tokens.push(...bag.discard.splice(0));
  return count;
}
export function drawBag(state, bag) {
  let refilled = false;
  if (!bag.tokens.length && bag.discard.length) {
    refillBag(bag);
    refilled = true;
  }
  if (!bag.tokens.length) return { token: null, refilled };
  const index = Math.floor(random(state) * bag.tokens.length);
  return { token: bag.tokens.splice(index, 1)[0], refilled };
}

/** Enemy cards always enter their deck discard; refill only on exhaustion. */
export function drawDeck(state, deck) {
  let refilled = false;
  if (!deck.cards.length && deck.discard.length) {
    deck.cards.push(...deck.discard.splice(0));
    refilled = true;
  }
  if (!deck.cards.length) return { card: null, refilled };
  const card = deck.cards.splice(Math.floor(random(state) * deck.cards.length), 1)[0];
  deck.discard.push(card);
  return { card, refilled };
}
