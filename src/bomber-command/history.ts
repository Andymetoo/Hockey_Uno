import type { Participant, State, Thread } from './types.ts';

const terminal = new Set(['restored', 'retained', 'recovered', 'repaired', 'overhauled', 'ashore', 'led', 'rested', 'outgrown', 'lost', 'closed', 'checked', 'released']);
export function threadActive(t: Thread): boolean { return t.status ? t.status === 'active' : !terminal.has(t.stage); }
export function identifyCrew(s: State): void {
  for (const c of s.crews) {
    c.specialistId ??= `${c.id}:specialist:original`;
    if (c.replacement) c.replacementId ??= `${c.id}:specialist:replacement:${c.replacement}`;
  }
}
export function rememberParticipants(s: State, t: Thread): void {
  if (t.participants) return;
  const c = s.crews.find(c => c.id === t.subject), a = s.aircraft.find(a => a.id === t.subject);
  const participants: Participant[] = [];
  if (c) {
    participants.push({ role: 'pilot', kind: 'crew', id: c.id, name: c.pilot });
    participants.push({ role: 'original specialist', kind: 'person', id: c.specialistId ?? `${c.id}:specialist:original`, name: c.specialist });
    if (c.replacement) participants.push({ role: 'temporary specialist', kind: 'person', id: c.replacementId ?? `${c.id}:specialist:replacement:${c.replacement}`, name: c.replacement });
  }
  if (a) {
    participants.push({ role: 'aircraft', kind: 'aircraft', id: a.id, name: a.name });
    const crewId = s.jobs.find(j => j.kind === 'recovery' && j.subject === a.id)?.text;
    const crew = s.crews.find(c => c.id === crewId);
    if (crew) participants.push({ role: 'recovering crew', kind: 'crew', id: crew.id, name: crew.pilot });
  }
  t.participants = participants;
}
export function recordThread(s: State, t: Thread, stage: string, text: string, status?: Thread['status']): void {
  rememberParticipants(s, t);
  t.milestones ??= [{ slot: Math.min(s.completed, t.dueSlot), stage: t.stage, text: t.note }];
  if (!t.milestones.some(m => m.stage === stage && m.text === text)) t.milestones.push({ slot: s.completed, stage, text });
  // A later event belongs in the record, but cannot replace a completed resolution.
  if (!t.status || t.status === 'active') {
    t.stage = stage; t.note = text; t.status = status ?? (terminal.has(stage) ? stage === 'lost' || stage === 'closed' ? 'closed' : 'resolved' : 'active');
  }
}
export function snapshotThreads(s: State): void {
  identifyCrew(s);
  for (const t of s.threads) {
    rememberParticipants(s, t);
    t.milestones ??= [{ slot: Math.min(s.completed, t.dueSlot), stage: t.stage, text: t.note }];
    t.status ??= terminal.has(t.stage) ? t.stage === 'lost' || t.stage === 'closed' ? 'closed' : 'resolved' : 'active';
  }
}
