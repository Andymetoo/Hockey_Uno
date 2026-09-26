import { isGameState } from './validation.ts';
import type { GameState } from './types.ts';
export { isGameState } from './validation.ts';
export const SAVE_KEY = 'haunted-house.save.v3';
export const LEGACY_KEYS = ['haunted-house.save.v2', 'haunted-house.save.v1'] as const;
export interface Archive { key: string; raw: string }
export type LoadResult = { kind: 'empty'; archives: Archive[] } | { kind: 'loaded'; state: GameState; archives: Archive[] } | { kind: 'error'; message: string; raw?: string; archives: Archive[] };
export interface SaveResult { ok: boolean; message: string }
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function parseSave(raw: string): LoadResult {
 try {
  if (raw.length > 12000000) throw new Error('Oversized save');
  const value: unknown = JSON.parse(raw); if (!isGameState(value)) throw new Error('Incompatible or damaged save');
  return { kind: 'loaded', state: value, archives: [] };
 } catch { return { kind: 'error', message: 'This save is damaged or uses earlier rules. Download it before replacing it. Earlier-rule saves cannot be converted into a combat run.', raw, archives: [] }; }
}
export function loadGame(storage?: StoragePort): LoadResult {
 try {
  const target = storage ?? globalThis.localStorage; const raw = target.getItem(SAVE_KEY); const result = raw === null ? { kind: 'empty' as const, archives: [] } : parseSave(raw);
  for (const key of LEGACY_KEYS) { try { const raw = target.getItem(key); if (raw !== null) result.archives.push({ key, raw }); } catch { /* Optional archive access must not block a valid current run. */ } }
  return result;
 } catch { return { kind: 'error', message: 'Browser storage is unavailable. You can play and export a save, but closing the page may lose progress.', archives: [] }; }
}
export function saveGame(state: GameState, storage?: StoragePort): SaveResult {
 try {
  const target = storage ?? globalThis.localStorage; const raw = JSON.stringify(state); target.setItem(SAVE_KEY, raw);
  if (target.getItem(SAVE_KEY) !== raw) throw new Error('Write did not persist');
  return { ok: true, message: `Saved · turn ${state.turns}` };
 } catch { return { ok: false, message: 'Not saved: storage unavailable or full. Export your save before closing this page.' }; }
}
export function newSeed(): string { const a = new Uint32Array(2); if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(a); else { a[0] = Math.floor(Math.random() * 0x100000000); a[1] = Date.now() >>> 0; } return `${a[0].toString(36)}-${a[1].toString(36)}`; }
