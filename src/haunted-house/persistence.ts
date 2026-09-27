import { isGameState } from './validation.ts';
import { completionIdentity, completionReport } from './completion.ts';
import type { CompletionRecord } from './completion.ts';
import type { GameState } from './types.ts';
export { isGameState } from './validation.ts';
export const SAVE_KEY = 'haunted-house.save.v4';
export const LEGACY_KEYS = ['haunted-house.save.v3', 'haunted-house.save.v2', 'haunted-house.save.v1'] as const;
export const COMPLETIONS_KEY = 'haunted-house.completions.v1';
export interface Archive { key: string; raw: string }
export type LoadResult = { kind: 'empty'; archives: Archive[] } | { kind: 'loaded'; state: GameState; archives: Archive[] } | { kind: 'error'; message: string; raw?: string; archives: Archive[] };
export interface SaveResult { ok: boolean; message: string }
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function parseSave(raw: string): LoadResult {
 try {
  if (raw.length > 12000000) throw new Error('Oversized save');
  const value: unknown = JSON.parse(raw);
  if (value && typeof value === 'object' && 'version' in value && [1, 2, 3].includes(Number(value.version))) return { kind: 'error', message: 'This is an earlier-rule save. Keep its downloadable archive; the changed combat and ingredients require a new adventure. It has not been converted or overwritten.', raw, archives: [] };
  if (!isGameState(value)) throw new Error('Incompatible or damaged save');
  return { kind: 'loaded', state: value, archives: [] };
 } catch { return { kind: 'error', message: 'This save is damaged or uses unsupported rules. Download it before replacing it. Existing bytes have not been changed.', raw, archives: [] }; }
}
export function loadGame(storage?: StoragePort): LoadResult {
 try {
  const target = storage ?? globalThis.localStorage; const raw = target.getItem(SAVE_KEY); const result = raw === null ? { kind: 'empty' as const, archives: [] } : parseSave(raw);
  for (const key of LEGACY_KEYS) { try { const raw = target.getItem(key); if (raw !== null) result.archives.push({ key, raw }); } catch { /* Optional archive access must not block a valid current run. */ } }
  return result;
 } catch { return { kind: 'error', message: 'Browser storage is unavailable. You can play and export a save, but closing the page may lose progress.', archives: [] }; }
}
export function saveGame(state: GameState, storage?: StoragePort): SaveResult {
 if (!isGameState(state)) return { ok: false, message: 'Not saved: this adventure uses unsupported rules or has damaged state. Your previous saved bytes are unchanged.' };
 try {
  const target = storage ?? globalThis.localStorage; const raw = JSON.stringify(state); target.setItem(SAVE_KEY, raw);
  if (target.getItem(SAVE_KEY) !== raw) throw new Error('Write did not persist');
  if (state.status === 'won') {
   const result = recordCompletion(state, target);
   if (!result.ok) return { ok: false, message: `Run saved, but ${result.message}` };
  }
  return { ok: true, message: `Saved · turn ${state.turns}` };
 } catch { return { ok: false, message: 'Not saved: storage unavailable or full. Export your save before closing this page.' }; }
}

export interface CompletionRecordsResult { records: CompletionRecord[]; message: string }
/** Invalid records are left untouched, just like invalid adventure saves. */
export function loadCompletedRuns(storage?: StoragePort): CompletionRecordsResult {
 try {
  const raw = (storage ?? globalThis.localStorage).getItem(COMPLETIONS_KEY);
  if (raw === null) return { records: [], message: '' };
  if (raw.length > 12000000) throw new Error('Oversized records');
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > 10000 || !value.every(validCompletion) || new Set(value.map(r => r.runId)).size !== value.length) throw new Error('Invalid records');
  return { records: value, message: '' };
 } catch { return { records: [], message: 'Completion records are unavailable or damaged. Existing records have been preserved.' }; }
}

function validCompletion(value: unknown): value is CompletionRecord {
 if (!value || typeof value !== 'object') return false;
 const r = value as CompletionRecord, p = r.report;
 const n = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1000000;
 const text = (v: unknown, max = 1000): v is string => typeof v === 'string' && v.length <= max;
 if (!text(r.runId, 200) || !r.runId || !text(r.seed, 100) || !r.seed || !n(r.variant) || !p || !p.objective || p.objective.completed !== true || !text(p.objective.title, 100) || !n(p.turns) || !text(p.explanation)) return false;
 for (const pair of [p.hauntings && [p.hauntings.defeated, p.hauntings.total], p.exploration && [p.exploration.discovered, p.exploration.total], p.treasure && [p.treasure.collected, p.treasure.total]]) if (!pair || !pair.every(n) || pair[0] > pair[1]) return false;
 const f = p.supplies?.floor, pocket = p.supplies?.pocket;
 if (!f || !pocket || ![f.food, f.candle, f.tonic, f.oil, f.recovery ?? 0, f.total, pocket.tonic, pocket.oil, pocket.total, p.supplies.total].every(n) || f.total !== f.food + f.candle + f.tonic + f.oil + (f.recovery ?? 0) || pocket.total !== pocket.tonic + pocket.oil || p.supplies.total !== f.total + pocket.total) return false;
 return Array.isArray(p.commendations) && p.commendations.length <= 10 && p.commendations.every(c => c && text(c.title, 100) && text(c.description));
}

/** One record per attempt, even when a saved ending is loaded or undone. */
export function recordCompletion(state: GameState, storage?: StoragePort): SaveResult {
 if (state.status !== 'won') return { ok: true, message: '' };
 try {
  const target = storage ?? globalThis.localStorage, current = loadCompletedRuns(target);
  if (current.message) return { ok: false, message: current.message };
  const record: CompletionRecord = { runId: completionIdentity(state), seed: state.seed, variant: state.variant, report: completionReport(state) };
  if (!validCompletion(record)) return { ok: false, message: 'completion data is inconsistent. Existing records have been preserved.' };
  const records = current.records.filter(r => r.runId !== record.runId);
  records.push(record);
  const raw = JSON.stringify(records); target.setItem(COMPLETIONS_KEY, raw);
  if (target.getItem(COMPLETIONS_KEY) !== raw) throw new Error('Write did not persist');
  return { ok: true, message: 'Completion recorded. Replaying this ending updates the same record.' };
 } catch { return { ok: false, message: 'completion records could not be saved. Export the finished adventure to preserve its report.' }; }
}
export function newSeed(): string { const a = new Uint32Array(2); if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(a); else { a[0] = Math.floor(Math.random() * 0x100000000); a[1] = Date.now() >>> 0; } return `${a[0].toString(36)}-${a[1].toString(36)}`; }
