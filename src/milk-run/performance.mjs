// Opt-in diagnostics only; never part of a saved sortie or its RNG.
export const performanceSamples = [];
export function measure(label, operation) {
  if (!globalThis.MILK_RUN_PROFILE) return operation();
  const start = performance.now();
  try { return operation(); }
  finally { performanceSamples.push({ label, ms: performance.now() - start }); }
}
