import { SAVE_VERSION } from './game.ts';
import type { State } from './types.ts';

export const SAVE_KEY = 'bomber-command-desk-v20';
export const LEGACY_KEY = 'bomber-command-save-v1';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const strings = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === 'string');
function records(v: unknown, check: (o: Record<string, unknown>) => boolean): boolean {
  return Array.isArray(v) && v.every(x => object(x) && check(x));
}
const fields = (o: Record<string, unknown>, names: string[], check: (v: unknown) => boolean) => names.every(k => check(o[k]));
const text = (v: unknown) => typeof v === 'string';
const bool = (v: unknown) => typeof v === 'boolean';
function validPlan(p: unknown): boolean {
  return object(p) && ['direct', 'dogleg'].includes(String(p.route)) && ['preserve', 'press'].includes(String(p.orders)) && text(p.priority) && records(p.flights, f => text(f.aircraft) && text(f.crew));
}
function validReport(r: unknown): boolean {
  return object(r) && fields(r, ['slot', 'requested', 'sent', 'hits', 'at'], number) && fields(r, ['title', 'summary'], text) && bool(r.stoodDown) && strings(r.notes) && records(r.results, f => fields(f, ['aircraft', 'crew', 'note'], text) && fields(f, ['damage', 'fatigue'], number) && fields(f, ['injury', 'hit'], bool) && ['home', 'abort', 'divert', 'lost'].includes(String(f.outcome)));
}
export function decode(raw: string): State {
  const v: unknown = JSON.parse(raw);
  if (!object(v) || (v.version !== SAVE_VERSION && v.version !== 20)) throw new Error('This file belongs to a different edition of Bomber Command.');
  if (!fields(v, ['seed', 'rng', 'now', 'offset', 'nextId', 'completed', 'contribution', 'requested', 'support', 'suppression', 'engineeringUsed'], number) || !fields(v, ['station', 'circumstance'], text) || !['active', 'closing', 'ended'].includes(String(v.phase)) || ![null, 'tour', 'losses'].includes(v.ending as null) || !strings(v.notices) || !validPlan(v.plan)) throw new Error('The saved station record is incomplete.');
  if (!records(v.aircraft, a => fields(a, ['id', 'name'], text) && fields(a, ['condition', 'sorties'], number) && fields(a, ['defect', 'lost', 'away'], bool) && strings(a.history) && ['rugged', 'accurate', 'economical', 'swift'].includes(String(a.trait))) || !records(v.crews, c => fields(c, ['id', 'pilot', 'specialist'], text) && fields(c, ['experience', 'fatigue', 'sorties'], number) && fields(c, ['lost', 'injury', 'returned'], bool) && (c.replacement === null || text(c.replacement)) && strings(c.history) && ['navigation', 'bombing', 'engineering', 'formation'].includes(String(c.strength)))) throw new Error('The saved squadron record is incomplete.');
  if (!records(v.assignments, a => fields(a, ['title', 'objective', 'why'], text) && fields(a, ['hazard', 'requested'], number) && ['clear', 'cloud', 'crosswind'].includes(String(a.weather)) && ['fighters', 'supplies', 'rail'].includes(String(a.effect))) || !records(v.jobs, j => fields(j, ['id', 'at'], number) && text(j.subject) && (j.text === undefined || text(j.text)) && (j.overhaul === undefined || bool(j.overhaul)) && ['signal', 'return', 'repair', 'inspection', 'service', 'rest', 'medical', 'recovery', 'reinforcement', 'training'].includes(String(j.kind))) || !records(v.decisions, d => text(d.key) && text(d.text) && number(d.slot)) || !Array.isArray(v.reports) || !v.reports.every(validReport)) throw new Error('The saved operations record is incomplete.');
  if (v.active !== null && (!object(v.active) || !fields(v.active, ['slot', 'startedAt', 'returnsAt'], number) || !validPlan(v.active.plan) || !validReport(v.active.report) || !strings(v.active.messages) || !bool(v.active.stoodDown))) throw new Error('The committed operation could not be read.');
  const s = v as unknown as State;
  if (s.assignments.length !== 14 || !Number.isInteger(s.completed) || s.completed < 0 || s.completed > 14 || !s.aircraft.length || !s.crews.length || s.jobs.some(j => j.at < s.now) || new Set(s.jobs.map(j => j.id)).size !== s.jobs.length || s.jobs.some(j => j.id >= s.nextId) || s.reports.length !== s.completed || (s.active !== null && s.jobs.filter(j => j.kind === 'return').length !== 1)) throw new Error('The saved tour contains inconsistent accounting.');
  for (const r of [...s.reports, ...(s.active ? [s.active.report] : [])]) if (r.results.some(f => !s.aircraft.some(a => a.id === f.aircraft) || !s.crews.some(c => c.id === f.crew))) throw new Error('A saved flight has no matching aircraft or crew.');
  if (v.version === 20) {
    // Do not redraw the assignment deck, alter the queue, or rewrite committed outcomes.
    s.version = SAVE_VERSION; s.briefing = false; s.extraBay = 0; s.opportunity = null; s.planEdited = true;
    for (const a of s.aircraft) { a.defectType = a.defect ? 'oil' : null; a.certified = 0; a.recovered = false; }
    for (const c of s.crews) { c.strain = 0; c.leaveThrough = 0; c.lesson = false; c.replacementSorties = 0; }
    for (const a of s.assignments) a.circumstance = 'ordinary';
  }
  const integer = (n: unknown, low: number, high: number) => typeof n === 'number' && Number.isInteger(n) && n >= low && n <= high;
  if (!bool(s.briefing) || !bool(s.planEdited) || !integer(s.extraBay, 0, 1) || !s.aircraft.every(a => [null, 'oil', 'controls', 'sight'].includes(a.defectType) && integer(a.certified, 0, 2) && bool(a.recovered)) || !s.crews.every(c => integer(c.strain, 0, 3) && integer(c.leaveThrough, 0, 14) && bool(c.lesson) && integer(c.replacementSorties, 0, 14)) || !s.assignments.every(a => ['ordinary', 'escort', 'window', 'dispersed', 'fuel', 'flak'].includes(a.circumstance)) || (s.opportunity !== null && (!object(s.opportunity) || !['photos', 'transport'].includes(s.opportunity.kind) || !text(s.opportunity.source) || !integer(s.opportunity.slot, 0, 13)))) throw new Error('The saved readiness record is incomplete.');
  for (const r of [...s.reports, ...(s.active ? [s.active.report] : [])]) if (r.results.some(f => (f.details !== undefined && !strings(f.details)) || (f.credits !== undefined && (!Array.isArray(f.credits) || !f.credits.every(x => ['training', 'repair', 'briefing', 'orders', 'restraint'].includes(x)))) || (f.newDefect !== undefined && ![null, 'oil', 'sight', 'controls'].includes(f.newDefect)) || (f.strain !== undefined && !integer(f.strain, 0, 2)))) throw new Error('The saved flight findings are incomplete.');
  return s;
}
export function createStorage(storage: StoragePort) {
  let expected = storage.getItem(SAVE_KEY);
  const archive = (raw: string, label: string) => {
    let key = `${SAVE_KEY}-archive-${label}-${Date.now()}`;
    while (storage.getItem(key) !== null) key += '-copy';
    storage.setItem(key, raw);
    return key;
  };
  return {
    load(): { state: State | null; message: string; blocked: boolean } {
      if (expected) {
        try {
          const state = decode(expected);
          const migrating = JSON.parse(expected).version === 20;
          if (migrating) archive(expected, 'before-content-pass');
          return { state, message: migrating ? 'Your tour continues. The earlier station book was backed up before this update; committed flights and their reports are unchanged. New readiness rules apply to future commitments.' : '', blocked: false };
        }
        catch { return { state: null, message: 'Your existing save cannot be opened by this edition. It remains untouched. Download a copy, or begin a new tour; a backup will be kept first.', blocked: true }; }
      }
      const legacy = storage.getItem(LEGACY_KEY);
      if (legacy && !storage.getItem(`${LEGACY_KEY}-before-desk`)) storage.setItem(`${LEGACY_KEY}-before-desk`, legacy);
      return { state: null, message: legacy ? 'A new posting: this edition starts a fresh fourteen-assignment tour. Your earlier campaign is preserved in its original save and a separate backup; its rules do not transfer to this edition.' : '', blocked: false };
    },
    save(s: State) {
      if (storage.getItem(SAVE_KEY) !== expected) throw new Error('This tour changed in another tab. Reload this page before issuing orders.');
      const raw = JSON.stringify(s); storage.setItem(SAVE_KEY, raw); expected = raw;
    },
    replace(s: State) {
      if (storage.getItem(SAVE_KEY) !== expected) throw new Error('This tour changed in another tab. Reload this page first.');
      if (expected) archive(expected, 'previous-tour');
      const raw = JSON.stringify(s); storage.setItem(SAVE_KEY, raw); expected = raw;
    },
    raw: () => expected ?? storage.getItem(LEGACY_KEY) ?? '',
  };
}
