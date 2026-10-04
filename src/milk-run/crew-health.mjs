/** Health history uses the mission clock, never a cycle-local slot. */
export const missionTurn = state => state.ruleset === 'v2-continuous'
  ? Math.max(state.stats.turns ?? 0, ((state.crewCycle?.number ?? 1) - 1) * 10 + (state.slot ?? 0))
  : Math.max(0, (state.round - 1) * 10 + state.slot);
export function recordHealth(state, crew, cause, source = {}) {
  crew.healthSince = { health: crew.health, turn: missionTurn(state), cause, ...source };
}
export function healthProvenance(state, crew) {
  const since = crew.healthSince;
  if (!since || since.health !== crew.health) return 'Health history unavailable for this saved state.';
  const ago = Math.max(0, missionTurn(state) - since.turn);
  return `Turn ${since.turn} · ${ago} turn${ago === 1 ? '' : 's'} ago · ${since.cause}`;
}
export function assertFireOccupancy(state) {
  const overlap = state.crew.find(c => c.health !== 'dead' && c.position.some(id => state.cells[id] === 'fire'));
  if (overlap) throw new Error(`Fire/crew invariant: living ${overlap.id} occupies active Fire (${overlap.position.join(', ')}).`);
}
