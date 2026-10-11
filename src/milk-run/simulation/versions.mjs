import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

export const RUNNER_VERSION = '1.0.0';
export const RUN_SCHEMA_VERSION = 1;
export const TRACE_SCHEMA_VERSION = 1;
export function digest(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}
function fingerprint(directory, extra = []) {
  const files = readdirSync(directory).filter(name => name.endsWith('.mjs')).sort();
  return digest([...files, ...extra].map(name => [name, digest(readFileSync(new URL(name, directory)).toString('utf8'))]));
}
export function sourceVersions() {
  return {
    runnerVersion: RUNNER_VERSION, schemaVersion: RUN_SCHEMA_VERSION, traceVersion: TRACE_SCHEMA_VERSION,
    engineFingerprint: fingerprint(new URL('../', import.meta.url), ['data/plane-grid.csv']),
    runnerFingerprint: fingerprint(new URL('./', import.meta.url)),
  };
}
