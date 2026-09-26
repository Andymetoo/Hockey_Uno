import { SAVE_VERSION } from './content.ts';
import { isGameState } from './validation.ts';
import type { GameState } from './types.ts';
export { isGameState } from './validation.ts';

export const SAVE_KEY = 'haunted-house.save.v2';
export const LEGACY_KEY = 'haunted-house.save.v1';
export type LoadResult = { kind: 'empty' } | { kind: 'loaded'; state: GameState; legacyRaw?: string } | { kind: 'legacy'; message: string; raw: string } | { kind: 'error'; message: string; raw?: string };
export interface SaveResult { ok: boolean; message: string }
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function parseSave(raw: string): LoadResult {
  try {
    if (raw.length > 6000000) throw new Error('oversized');
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object' && 'version' in value && value.version !== SAVE_VERSION) return { kind: 'error', message: 'This save belongs to different Haunted House rules. It has been kept untouched.', raw };
    if (!isGameState(value)) throw new Error('invalid structure');
    return { kind: 'loaded', state: value };
  } catch { return { kind: 'error', message: 'This Haunted House save could not be read. It has been kept untouched. Download a copy before replacing it.', raw }; }
}
export function loadGame(storage?: StoragePort): LoadResult {
  try {
    const target = storage ?? globalThis.localStorage;
    const raw = target.getItem(SAVE_KEY);
    if (raw !== null) {
      const loaded = parseSave(raw);
      if (loaded.kind === 'loaded') {
        // Earlier rules remain exportable after the new adventure is saved and reloaded.
        // A failure reading optional archival data must not prevent valid v2 continuation.
        try {
          const legacy = target.getItem(LEGACY_KEY);
          if (legacy !== null) loaded.legacyRaw = legacy;
        } catch { /* The current adventure has already been read successfully. */ }
      }
      return loaded;
    }
    const legacy = target.getItem(LEGACY_KEY);
    return legacy === null ? { kind: 'empty' } : { kind: 'legacy', message: 'Your saved house belongs to the earlier rules. Start a new house for this adventure; your earlier save will remain intact.', raw: legacy };
  } catch { return { kind: 'error', message: 'Browser storage is unavailable. You can play, but progress will not be saved after closing this page.' }; }
}
export function saveGame(state: GameState, storage?: StoragePort): SaveResult {
  try {
    const target = storage ?? globalThis.localStorage;
    const raw = JSON.stringify(state);
    target.setItem(SAVE_KEY, raw);
    if (target.getItem(SAVE_KEY) !== raw) throw new Error('write did not persist');
    return { ok: true, message: `Saved · ${state.decisions} decisions` };
  } catch { return { ok: false, message: 'Not saved · browser storage is unavailable or full. Keep this page open to continue.' }; }
}
export function newSeed(): string {
  const entropy = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(entropy);
  else { entropy[0] = Math.floor(Math.random() * 0x100000000); entropy[1] = Date.now() >>> 0; }
  return `${entropy[0].toString(36)}-${entropy[1].toString(36)}`;
}
