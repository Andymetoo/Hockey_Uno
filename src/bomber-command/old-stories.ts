import type { Crew, Report, State, StationEvent, Thread } from './types.ts';
import { recordThread, threadActive } from './history.ts';
import { storyDuty } from './stories.ts';

const hour = 3_600_000;
const sourceCrew = (s: State, t: Thread) => s.crews.find(c => c.id === t.participants?.find(p => p.role === 'recovering crew')?.id);
const ready = (s: State, c?: Crew) => !!c && !c.lost && !c.injury && c.leaveThrough <= s.completed && !storyDuty(s, 'crew', c.id) &&
  !s.jobs.some(j => j.kind === 'training' && j.subject === c.id || j.kind === 'recovery' && j.text === c.id);
const engineeringFree = (s: State) => s.engineeringUsed < 1 + s.extraBay && !s.jobs.some(j => j.kind === 'repair' || j.kind === 'inspection');
const notify = (s: State, text: string) => { s.notices = [...s.notices.slice(-11), text]; };

/** Continuing decisions for the original aircraft stories. Rendering never changes a thread. */
export function oldStoryEvents(s: State): StationEvent[] {
  if (s.contentVersion !== 1 || s.active || s.phase !== 'active') return [];
  const result: StationEvent[] = [];
  for (const t of s.threads.filter(threadActive)) {
    const a = s.aircraft.find(a => a.id === t.subject);
    if (!a || a.lost || a.away || storyDuty(s, 'aircraft', a.id)) continue;
    if (t.family === 'fault' && t.stage === 'carry' && a.defect &&
      s.completed >= ([...(t.milestones ?? [])].reverse().find(m => m.stage === 'carry')?.slot ?? t.dueSlot) + 2) {
      result.push({ key: `thread-fault-${a.id}`, kind: 'thread', subject: a.id,
        title: `Finch returns to ${a.name}'s finding`,
        body: `The finding has survived two more assignments on the board. Finch lays out the log: “The finding is still in the book. Another clean run-up won't remove it.” Group can use this airframe's assemblies, or Finch can finally have the bay time.`,
        choices: [
          { id: 'repair', label: 'Give Finch the bay', detail: 'Hold this aircraft for six hours of proper repair. Use one engineering allocation, restore 38 condition, clear the fault and certify two flights. No support cost.', disabled: !engineeringFree(s) || s.jobs.some(j => j.subject === a.id && ['repair', 'inspection'].includes(j.kind)) },
          { id: 'parts', label: 'Release the airframe for assemblies', detail: `Withdraw ${a.name} from flying for the rest of this tour. Group releases two support, up to five, for its usable assemblies. This is a retirement, not a loss.` },
        ] });
    }
    if (t.family === 'diversion' && t.stage === 'home' && s.completed >= t.dueSlot) {
      const c = sourceCrew(s, t), original = t.participants?.find(p => p.role === 'recovering crew');
      result.push({ key: `thread-diversion-${a.id}`, kind: 'thread', subject: a.id,
        title: `${a.name}: the route back`,
        body: `${original?.name ?? 'The ferry crew'} brought back field addresses, fuel figures and the name of a workshop that kept its word. ${c?.lost ? 'The surviving papers can still be filed, though that flying crew has since been lost.' : 'Finch wants the details while the crew still remembers which telephone was answered.'} ${a.recovered ? 'The aircraft still needs its own field checks certified.' : 'The aircraft has already been certified at home.'}`,
        choices: [
          { id: 'notes', label: 'Have the crew prepare recovery notes', detail: s.completed > 12 ? 'Too few assignments remain to prepare and circulate the notes before relief takes over.' : `Hold ${original?.name ?? 'the ferry crew'} off one assignment. After two assignments Group can use the notes to advance any pending recovery six hours, or release one support if none is pending. Aircraft checks still need ordinary repair.`, disabled: s.completed > 12 || !ready(s, c) },
          { id: 'release', label: 'Keep the crew on the flying roster', detail: 'Close the ferry account and keep the crew available subject to its existing restrictions. No recovery credit is earned; any unresolved aircraft checks still need proper work.' },
        ] });
    }
  }
  return result;
}

export function applyOldStoryChoice(s: State, event: StationEvent, choiceId: string): void {
  const offered = oldStoryEvents(s).find(e => e.key === event.key);
  const choice = offered?.choices.find(c => c.id === choiceId);
  if (!choice || choice.disabled) throw new Error('This engineering story choice is no longer available.');
  const t = s.threads.find(t => t.subject === event.subject && threadActive(t) && event.key.includes(t.family))!;
  const a = s.aircraft.find(a => a.id === t.subject)!;
  if (t.family === 'fault') {
    if (choiceId === 'parts') {
      s.duties ??= [];
      s.duties.push({ id: `parts-${a.id}`, arcId: `thread-fault-${a.id}`, label: 'Released for reusable assemblies', aircraft: a.id, through: 14 });
      s.support = Math.min(5, s.support + 2);
      s.jobs = s.jobs.filter(j => j.subject !== a.id || !['service', 'repair', 'inspection'].includes(j.kind));
      s.plan.flights = s.plan.flights.filter(f => f.aircraft !== a.id);
      const text = `${a.name} was withdrawn from the flying roster for usable assemblies. Group released two transport support, subject to the station limit; the aircraft was retired, not lost.`;
      recordThread(s, t, 'retired', text, 'resolved'); a.history.push(text); notify(s, text);
    } else {
      s.engineeringUsed++;
      s.jobs = s.jobs.filter(j => !(j.subject === a.id && j.kind === 'service'));
      s.jobs.push({ id: s.nextId++, kind: 'repair', subject: a.id, at: s.now + 6 * hour });
      s.plan.flights = s.plan.flights.filter(f => f.aircraft !== a.id);
      const text = `Finch finally received ${a.name} for a six-hour strip and repair. The disputed finding will be closed by completed work, not another run-up.`;
      recordThread(s, t, 'strip', text); a.history.push(text); notify(s, text);
    }
  } else if (choiceId === 'notes') {
    const c = sourceCrew(s, t)!;
    s.duties ??= [];
    s.duties.push({ id: `ferry-notes-${a.id}`, arcId: `thread-diversion-${a.id}`, label: 'Writing forward-field recovery notes', crew: c.id, through: s.completed + 1 });
    s.plan.flights = s.plan.flights.filter(f => f.crew !== c.id);
    t.dueSlot = s.completed + 2;
    const text = `${c.pilot} was assigned one station day to prepare ${a.name}'s forward-field recovery notes. Group will circulate the addresses and fuel figures after two assignments; the aircraft's own checks remain a separate job.`;
    recordThread(s, t, 'logbook', text); c.history.push(text); notify(s, text);
  } else {
    const text = `${a.name}'s ferry account was closed and its crew retained for operations. No recovery notes were promised. ${a.recovered ? 'The aircraft still requires certification of its field checks.' : 'Its field checks have already been certified.'}`;
    recordThread(s, t, 'released', text, 'resolved'); notify(s, text);
  }
}

/** A completed ferry log remains useful even if its aircraft is subsequently lost. */
export function advanceOldStories(s: State, report: Report): void {
  for (const t of s.threads) {
    if (t.family !== 'diversion' || !t.milestones?.some(m => m.stage === 'logbook') ||
      t.milestones.some(m => m.stage === 'recovery-credit') || s.completed < t.dueSlot) continue;
    const recoveries = s.jobs.filter(j => j.kind === 'recovery');
    if (recoveries.length) for (const j of recoveries) j.at = Math.min(j.at, Math.max(s.now + hour, j.at - 6 * hour));
    else s.support = Math.min(5, s.support + 1);
    const name = t.participants?.find(p => p.role === 'aircraft')?.name ?? 'The diverted aircraft';
    const text = `${name}'s recorded ferry route reached Group. ${recoveries.length ? 'The field addresses brought pending recovery parties forward by up to six hours; an earlier arrival was kept.' : 'No recovery party was pending, so Group released one transport support, subject to the station limit.'} The credit belongs to the returning crew's written account.`;
    recordThread(s, t, 'recovery-credit', text, 'resolved'); report.notes.push(text); notify(s, text);
  }
}
