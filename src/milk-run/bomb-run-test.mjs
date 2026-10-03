/** Disposable production Bomb Run. This boundary accepts no live sortie,
 * campaign, preferences, queue, or storage references. Every nested object and
 * the PRNG belong to a fresh state; only production commands implement rules.
 */
import { createGame } from './state.mjs';
import { dispatch } from './rules.mjs';
import { BOMBING_TARGETS } from './bombing.mjs';
import { random, seedToInt } from './random.mjs';

export class BombRunTest {
  constructor(seed = globalThis.crypto.randomUUID()) {
    this.seed = String(seed);
    this.targetRng = { rng: seedToInt(`${this.seed}:targets`) };
    this.number = 0;
    this.start('random');
  }
  start(targetId = 'random') {
    const targets = Object.keys(BOMBING_TARGETS);
    if (targetId !== 'random' && !targets.includes(targetId)) throw new Error('Choose a production Bomb Run target.');
    if (targetId === 'random') targetId = targets[Math.floor(random(this.targetRng) * targets.length)];
    const state = createGame({ startingOfficer: 3, startingEnlisted: 0 }, `${this.seed}:run:${++this.number}`, 'v2-continuous');
    state.phase = 'bombing';
    state.mission.position = state.config.v2OutboundLength;
    state.mission.targetId = targetId;
    const result = dispatch(state, { type: 'bomb' });
    this.state = result.state;
    this.events = result.events;
  }
  again() { this.start(this.state.mission.targetId); }
  send(command) {
    if (!['placeBombDie', 'rerollBombDie', 'commitBombRun'].includes(command.type)) throw new Error('Only Bomb Run commands belong in this tester.');
    const result = dispatch(this.state, command);
    this.state = result.state;
    this.events.push(...result.events);
  }
}
