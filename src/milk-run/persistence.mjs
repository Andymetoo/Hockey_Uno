import { BOARD_VERSION } from './board.mjs';

// Old geometry cannot safely reinterpret damage, crew positions or pending hits.
// Keep that sortie untouched rather than mixing two board definitions.
export const LEGACY_SAVE_KEY = 'milk-run-v3-session-1';
export const SAVE_KEY = 'milk-run-v3-session-2';
export function saveSession(session, storage) {
  try { (storage ?? globalThis.localStorage).setItem(SAVE_KEY, JSON.stringify(session)); return true; }
  catch { return false; }
}
export function loadSession(storage) {
  try {
    const data = JSON.parse((storage ?? globalThis.localStorage).getItem(SAVE_KEY) ?? 'null');
    if (!data || data.version !== 1 || data.state?.version !== 1 || !data.view ||
      !Array.isArray(data.pending) || !Array.isArray(data.log) ||
      !Array.isArray(data.state.crew) || !data.state.config || !data.state.bags ||
      !data.state.cells || !Number.isFinite(data.state.rng) ||
      data.state.boardVersion !== BOARD_VERSION || data.view.boardVersion !== BOARD_VERSION ||
      data.pending.some(event => event.state?.boardVersion !== BOARD_VERSION)) return null;
    return data;
  } catch { return null; }
}

export function hasLegacyBoardSave(storage) {
  try { return Boolean((storage ?? globalThis.localStorage).getItem(LEGACY_SAVE_KEY)); }
  catch { return false; }
}
