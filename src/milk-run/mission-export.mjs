export function missionExportFilename(state) {
  const clock = state.ruleset === 'v2-continuous' ? `turn-${state.stats.turns ?? 0}` : `round-${state.round}`;
  return `milk-run-${String(state.seed).replace(/[^a-z0-9_-]/gi, '_')}-${clock}.json`;
}
