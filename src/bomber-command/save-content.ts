import type { State } from './types.ts';
import { operationalDefinitions } from './operations.ts';
import { commitmentDefinitions } from './campaign.ts';
import { storyDefinitions } from './stories.ts';

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const slot = (v: unknown) => num(v) && Number.isInteger(v) && v >= 0 && v <= 14;
const list = (v: unknown, f: (v: Record<string, unknown>) => boolean): boolean => Array.isArray(v) && v.every(x => object(x) && f(x));
const unique = (a: {id: string}[]) => new Set(a.map(x => x.id)).size === a.length;
const milestones = (v: unknown) => list(v, m => slot(m.slot) && text(m.stage) && text(m.text));

/** Validate serialized content without creating events, rewriting outcomes, or using RNG. */
export function validateCampaignContent(s: State): void {
  const fail = () => { throw new Error('The saved campaign content is incomplete or inconsistent.'); };
  if (![0, 1].includes(s.contentVersion ?? -1) || (s.briefingSource !== undefined && !text(s.briefingSource)) || (s.extraBaySources !== undefined && (!Array.isArray(s.extraBaySources) || !s.extraBaySources.every(text)))) fail();
  const hasCrew = (id: unknown) => text(id) && s.crews.some(c => c.id === id);
  const hasAircraft = (id: unknown) => text(id) && s.aircraft.some(a => a.id === id);
  for (const t of s.threads) {
    if (t.status !== undefined && !['active', 'resolved', 'closed'].includes(t.status)) fail();
    if (t.milestones !== undefined && !milestones(t.milestones)) fail();
    if (t.participants !== undefined && !list(t.participants, p => text(p.id) && text(p.name) && text(p.role) && (p.kind === 'person' || p.kind === 'crew' && hasCrew(p.id) || p.kind === 'aircraft' && hasAircraft(p.id)))) fail();
  }
  if (!Array.isArray(s.stories) || !list(s.stories, a => text(a.id) && text(a.family) && a.family in storyDefinitions && text(a.title) && text(a.note) && text(a.stage) && ['active','resolved','closed'].includes(String(a.status)) && slot(a.opened) && slot(a.dueSlot) && (a.expiresSlot === undefined || slot(a.expiresSlot)) && milestones(a.milestones) && list(a.participants, p => text(p.name) && text(p.role) && (p.kind === 'crew' && hasCrew(p.id) || p.kind === 'aircraft' && hasAircraft(p.id)) && (p.specialistId === undefined || text(p.specialistId)) && (p.specialistName === undefined || text(p.specialistName))) && (a.choice === undefined || text(a.choice)) && (a.finding === undefined || ['guns','tracks'].includes(String(a.finding))) && (a.knowledge === undefined || ['estimated','confirmed'].includes(String(a.knowledge))))) fail();
  if (!unique(s.stories!) || new Set(s.stories!.map(a => a.family)).size !== s.stories!.length) fail();
  if (!Array.isArray(s.duties) || !list(s.duties, d => text(d.id) && text(d.arcId) && text(d.label) && slot(d.through) && (d.crew === undefined || hasCrew(d.crew)) && (d.aircraft === undefined || hasAircraft(d.aircraft)) && (d.crew !== undefined || d.aircraft !== undefined)) || !unique(s.duties!)) fail();
  if (s.campaign !== null) {
    const c = s.campaign;
    if (!object(c) || !list(c.intelligence, i => (i.id === 'stores' && ['occupied','empty'].includes(String(i.truth)) || i.id === 'inland-route' && ['clear','guns'].includes(String(i.truth))) && ['estimated','confirmed'].includes(String(i.knowledge)) && (i.confirmedAt === null || slot(i.confirmedAt))) || !list(c.commitments, x => text(x.id) && text(x.kind) && x.kind in commitmentDefinitions && text(x.title) && slot(x.choiceSlot) && slot(x.targetSlot) && slot(x.dueSlot) && slot(x.expiresSlot) && ['pending','ready','active','fulfilled','missed','expired'].includes(String(x.state)) && Array.isArray(x.effectsApplied) && x.effectsApplied.every(slot) && list(x.milestones, m => slot(m.assignment) && text(m.text)))) fail();
    if (!c || c.intelligence.length !== 2 || !unique(c.intelligence) || !unique(c.commitments)) fail();
  }
  const o = s.operations;
  const operationalId = (v: unknown) => operationalDefinitions.some(d => d.id === v);
  if (o !== undefined) {
    if (!object(o) || !slot(o.checkedSlot) || !num(o.lastSelected) || o.lastSelected < -3 || o.lastSelected > 14 || !list(o.history, h => operationalId(h.id) && slot(h.slot) && ['resolved','expired'].includes(String(h.status)) && text(h.text) && (h.choice === undefined || text(h.choice))) || !list(o.consequences, c => text(c.id) && slot(c.dueSlot) && ['support','escort','instruction','recovery'].includes(String(c.kind)) && text(c.source) && (c.crew === undefined || hasCrew(c.crew)) && (c.amount === undefined || num(c.amount)))) fail();
    if (o.selected !== null && (!object(o.selected) || !operationalId(o.selected.id) || !slot(o.selected.slot) || (o.selected.crew !== undefined && !hasCrew(o.selected.crew)) || (o.selected.otherCrew !== undefined && !hasCrew(o.selected.otherCrew)) || (o.selected.aircraft !== undefined && !hasAircraft(o.selected.aircraft)))) fail();
  }
  for (const c of s.crews) if ((c.specialistId !== undefined && !text(c.specialistId)) || (c.replacementId !== undefined && c.replacementId !== null && !text(c.replacementId))) fail();
  for (const r of [...s.reports, ...(s.active ? [s.active.report] : [])]) {
    if (r.objectiveEffective !== undefined && typeof r.objectiveEffective !== 'boolean') fail();
    for (const f of r.results) for (const key of ['aircraftName','pilotName','specialistName','specialistId'] as const) if (f[key] !== undefined && !text(f[key])) fail();
  }
}
