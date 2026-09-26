import type { Aircraft, Crew, Report, State, StationEvent } from './types.ts';

export type StoryFamily = 'confidence' | 'interpretation' | 'neighbors' | 'relief';
export interface StoryParticipant {
  role: string; kind: 'crew' | 'aircraft'; id: string; name: string;
  specialistId?: string; specialistName?: string;
}
export interface StoryMilestone { slot: number; stage: string; text: string; }
export interface StoryArc {
  id: string; family: StoryFamily; title: string; status: 'active' | 'resolved' | 'closed';
  stage: string; opened: number; dueSlot: number; expiresSlot?: number;
  participants: StoryParticipant[]; milestones: StoryMilestone[]; note: string;
  choice?: string; finding?: 'guns' | 'tracks'; knowledge?: 'estimated' | 'confirmed';
}
export interface SupportDuty {
  id: string; arcId: string; label: string; aircraft?: string; crew?: string; through: number;
}
/** Authoring metadata is deliberately small. Every mutation is implemented below. */
export const storyDefinitions: Record<StoryFamily, {
  title: string; earliest: number; latest: number; priority: number; excludes: StoryFamily[];
}> = {
  confidence: { title: 'An easy-looking approach', earliest: 2, latest: 8, priority: 1.7, excludes: ['relief'] },
  interpretation: { title: 'Two marks on the same print', earliest: 3, latest: 8, priority: 1.7, excludes: [] },
  neighbors: { title: 'A lorry from West Fen', earliest: 3, latest: 8, priority: 1.7, excludes: [] },
  relief: { title: 'The relief list', earliest: 5, latest: 8, priority: 1.7, excludes: ['confidence'] },
};
const livingCrew = (s: State, id?: string) => s.crews.find(c => c.id === id && !c.lost);
const participant = (a: StoryArc, role = 'lead') => a.participants.find(p => p.role === role);
const crew = (s: State, a: StoryArc, role = 'lead') => livingCrew(s, participant(a, role)?.id);
const crewName = (a: StoryArc, role = 'lead') => participant(a, role)?.name ?? 'the assigned crew';
const aircraft = (s: State, a: StoryArc) => s.aircraft.find(x => x.id === participant(a, 'aircraft')?.id && !x.lost);
const addNotice = (s: State, text: string) => { s.notices = [...s.notices.slice(-11), text]; };
const cap = (n: number, max = 8) => Math.min(max, n);
export function storyDuty(s: State, kind: 'crew' | 'aircraft', id: string): SupportDuty | undefined {
  return s.duties?.find(d => d[kind] === id && d.through > s.completed);
}
function crewReady(s: State, c?: Crew): c is Crew {
  return !!c && !c.lost && !c.injury && c.leaveThrough <= s.completed && c.fatigue < 95 && !storyDuty(s, 'crew', c.id) &&
    !s.jobs.some(j => j.kind === 'training' && j.subject === c.id || j.kind === 'recovery' && j.text === c.id);
}
function aircraftReady(s: State, a?: Aircraft): a is Aircraft {
  return !!a && !a.lost && !a.away && a.condition >= 55 && !storyDuty(s, 'aircraft', a.id) &&
    !s.jobs.some(j => ['repair', 'inspection'].includes(j.kind) && j.subject === a.id);
}
function rememberCrew(c: Crew, role: string): StoryParticipant {
  const identities = c as Crew & { specialistId?: string; replacementId?: string };
  return { role, kind: 'crew', id: c.id, name: c.pilot,
    specialistId: c.replacement ? identities.replacementId ?? `${c.id}:${c.replacement}` : identities.specialistId ?? `${c.id}:${c.specialist}`,
    specialistName: c.replacement ?? c.specialist };
}
function milestone(s: State, a: StoryArc, stage: string, text: string, status?: StoryArc['status']): void {
  a.stage = stage; a.note = text;
  a.milestones.push({ slot: s.completed, stage, text });
  if (status) a.status = status;
  addNotice(s, text);
}
function duty(s: State, a: StoryArc, label: string, through: number, c?: Crew, airframe?: Aircraft): void {
  s.duties ??= [];
  s.duties.push({ id: `${a.id}-${a.stage}-${s.completed}-${c?.id ?? airframe?.id ?? 'station'}`, arcId: a.id, label, through, ...(c ? { crew: c.id } : {}), ...(airframe ? { aircraft: airframe.id } : {}) });
  s.plan.flights = s.plan.flights.filter(f => f.crew !== c?.id && f.aircraft !== airframe?.id);
}
function briefing(s: State, source: string): void {
  s.briefing = true;
  s.briefingSource = s.briefingSource && s.briefingSource !== source ? `${s.briefingSource}; ${source}` : source;
}
function activeThreadCount(s: State): number {
  const terminal = ['lost', 'repaired', 'restored', 'retained', 'ashore', 'recovered', 'overhauled', 'home', 'outgrown', 'led', 'rested'];
  return s.threads.filter(t => (t as typeof t & { status?: string }).status === 'active' ||
    !(t as typeof t & { status?: string }).status && !terminal.includes(t.stage)).length;
}
function vacantCrew(s: State): Crew | undefined {
  return s.crews.filter(c => crewReady(s, c)).sort((a, b) => Number(s.plan.flights.some(f => f.crew === a.id)) - Number(s.plan.flights.some(f => f.crew === b.id)) || a.experience - b.experience)[0];
}
function vacantAircraft(s: State): Aircraft | undefined {
  return s.aircraft.filter(a => aircraftReady(s, a)).sort((a, b) => Number(s.plan.flights.some(f => f.aircraft === a.id)) - Number(s.plan.flights.some(f => f.aircraft === b.id)) || b.condition - a.condition)[0];
}
function startCandidate(s: State, family: StoryFamily): StoryArc | undefined {
  const def = storyDefinitions[family];
  if (s.completed < def.earliest || s.completed > def.latest || s.stories?.some(a => a.family === family || a.status === 'active' && def.excludes.includes(a.family))) return;
  let lead: Crew | undefined, second: Crew | undefined, airframe: Aircraft | undefined, note = '';
  if (family === 'confidence') {
    lead = s.crews.find(c => crewReady(s, c) && s.reports.slice(-3).filter(r => r.results.some(f => f.crew === c.id && f.hit)).length >= 2);
    second = s.crews.filter(c => c.id !== lead?.id && crewReady(s, c)).sort((a, b) => a.experience - b.experience)[0];
    if (!lead || !second) return;
    note = `${lead.pilot} has put two concentrations on the photographs. ${lead.replacement ?? lead.specialist} calls the latest approach straightforward. The operations officer taps the weather map: “It was straightforward yesterday.”`;
  } else if (family === 'interpretation') {
    lead = s.crews.filter(c => crewReady(s, c) && c.strength === 'navigation').sort((a, b) => b.experience - a.experience)[0] ?? vacantCrew(s);
    if (!lead || s.support < 1 || !s.reports.some(r => r.hits > 0)) return;
    note = `${lead.replacement ?? lead.specialist} sees gun pits beside a later approach; Intelligence calls them wheel tracks. ${lead.pilot}: “We can measure the shadows. We cannot settle it by voting.” The gun report is an estimate.`;
  } else if (family === 'neighbors') {
    lead = vacantCrew(s); airframe = vacantAircraft(s);
    if (!lead || !airframe || s.crews.filter(c => crewReady(s, c)).length < 4 || s.aircraft.filter(a => aircraftReady(s, a)).length < 4) return;
    note = `West Fen needs a ferry for instrument fitters two assignments from now. Operations pencils in ${airframe.name} and ${lead.pilot}. Their adjutant says, “Give us a date we can put the men beside the runway.”`;
  } else {
    lead = s.crews.filter(c => crewReady(s, c) && c.experience >= 6 && c.sorties >= 3).sort((a, b) => b.sorties - a.sorties)[0];
    second = s.crews.filter(c => crewReady(s, c) && c.id !== lead?.id).sort((a, b) => a.experience - b.experience)[0];
    if (!lead || !second) return;
    note = `${lead.pilot}'s crew is eligible for instruction at Group after two more assignments. ${second.pilot} could use their approach notes. “Tell us which bag to pack,” says ${lead.replacement ?? lead.specialist}.`;
  }
  return { id: `story-${family}`, family, title: def.title, status: 'active', stage: 'offered', opened: s.completed,
    dueSlot: s.completed, expiresSlot: s.completed + 2, participants: [rememberCrew(lead, 'lead'), ...(second ? [rememberCrew(second, 'junior')] : []),
      ...(airframe ? [{ role: 'aircraft', kind: 'aircraft' as const, id: airframe.id, name: airframe.name }] : [])], note,
    milestones: [{ slot: s.completed, stage: 'offered', text: note }] };
}
function event(a: StoryArc, title: string, body: string, choices: StationEvent['choices']): StationEvent {
  return { key: `${a.id}-${a.stage}`, kind: 'story', subject: a.id, title, body, choices };
}
/** Pure: panel opening and reload cannot select a participant, a finding, or a choice. */
export function storyEvents(s: State): StationEvent[] {
  if (s.active || s.phase !== 'active') return [];
  const result: StationEvent[] = [];
  for (const a of s.stories ?? []) {
    if (a.status !== 'active' || s.completed < a.dueSlot) continue;
    if (a.family === 'neighbors' && a.stage === 'favor') {
      result.push(event(a, 'West Fen returns the favor', 'The fitters have reached their station. Their adjutant sends a plain note: “Your turn. A workshop lorry, or transport?” The station can claim the help regardless of the ferry crew’s present availability.', [
        { id: 'workshop', label: 'Ask for the workshop lorry', detail: 'One additional proper repair bay at the next commitment. Flying aircraft cannot use it.' },
        { id: 'transport', label: 'Take recovery transport', detail: 'Advance every currently scheduled recovery by up to six hours, never delaying an earlier arrival. If none is pending, keep one transport support, up to five.' },
      ]));
      continue;
    }
    const c = crew(s, a), junior = crew(s, a, 'junior'), airframe = aircraft(s, a);
    if (!crewReady(s, c)) continue;
    if (a.family === 'confidence') {
      if (a.stage === 'offered') result.push(event(a, 'Confidence at the briefing table', a.note, [
        { id: 'lead', label: 'Let them brief this approach', detail: `Gain seven points of bombing accuracy this assignment. ${c.pilot} takes one strain. Review their judgement after two assignments. Only one prepared briefing can be used.`, disabled: s.briefing },
        { id: 'check', label: 'Give them a day to check the method', detail: `Hold ${c.pilot} off this assignment for navigation work; no support cost. Review the work after two assignments.` },
      ]));
      if (a.stage === 'review') result.push(event(a, 'What the good runs taught them', `${a.note} ${c.pilot}: “We know where those notes stop. We should write that down as well.”`, [
        { id: 'teach', label: `Pass the method to ${crewName(a, 'junior')}`, detail: 'Hold both crews off this assignment. The junior gains one experience and a practiced bombing lesson; the senior clears one strain.', disabled: !crewReady(s, junior) },
        { id: 'lead', label: 'Keep the experienced crew on operations', detail: `${c.pilot} gains one experience and a practiced bombing lesson, with one additional strain. Keep both crews available.` },
      ]));
    } else if (a.family === 'interpretation') {
      if (a.stage === 'offered') result.push(event(a, 'A second reading of the print', a.note, [
        { id: 'compare', label: 'Obtain the survey prints', detail: `Spend one support and hold ${c.pilot} off one assignment to compare the photography. A confirmed finding will be ready in two assignments.`, disabled: s.support < 1 },
        { id: 'file', label: 'File the gun estimate with Group', detail: 'Keep the crew and support available. Group checks the estimate against later photographs; useful material may or may not result in two assignments.' },
      ]));
      if (a.stage === 'findings') {
        const useful = a.choice === 'compare' || a.finding === 'guns';
        result.push(event(a, 'The shadows have an answer', `${a.finding === 'guns' ? 'Confirmed: the marks were occupied gun positions.' : 'Confirmed: the marks were wheel tracks from a withdrawn unit.'} ${a.choice === 'compare' ? `${c.pilot}'s measurements also identify dependable approach landmarks.` : useful ? 'The filed estimate was right; Group has returned annotated photographs.' : 'The estimate was wrong. Group corrected its map, but there are no measured approach notes.'}`, [
          { id: 'local', label: useful ? 'Prepare our own approach notes' : 'Hold the crew for a proper map check', detail: useful ? 'Gain seven points of bombing accuracy on this assignment. No additional absence or support cost. Only one prepared briefing can be used.' : `Hold ${c.pilot} off this assignment; gain one experience and a practiced bombing lesson after the check.`, disabled: useful && s.briefing },
          { id: 'group', label: 'Send the finding to Group', detail: useful ? a.finding === 'guns' ? 'Reduce opposition by half a level on this assignment. Give up the local briefing benefit.' : 'The confirmed clear road releases one transport support, up to five. Give up the local briefing benefit.' : 'Correct the record and keep the crew available. There is no operational bonus for the mistaken estimate.' },
        ]));
      }
    } else if (a.family === 'neighbors') {
      if (a.stage === 'offered') result.push(event(a, 'West Fen asks for a ferry', a.note, [
        { id: 'promise', label: 'Promise the ferry in two assignments', detail: `${participant(a, 'aircraft')!.name} and ${c.pilot} remain available today. In two assignments, lend an aircraft and crew for one assignment or release the promise.` },
        { id: 'crates', label: 'Send the spare instruments instead', detail: 'Spend one support now; no aircraft or crew absence. West Fen will offer its fitters for one additional repair bay in two assignments.', disabled: s.support < 1 },
      ]));
      if (a.stage === 'ferry') result.push(event(a, 'The fitters are waiting at West Fen', `${c.pilot} has the ferry order. The work takes one assignment, and West Fen will repay it with a workshop visit or recovery transport.`, [
        { id: 'send', label: `Send ${airframe?.name ?? participant(a, 'aircraft')!.name} and ${c.pilot}`, detail: 'Hold this aircraft and crew off the bombing package for one assignment. No combat is simulated for the ferry. West Fen owes the promised help.', disabled: !aircraftReady(s, airframe) },
        { id: 'release', label: 'Release the ferry promise', detail: 'Keep the aircraft and crew for operations. West Fen uses Group transport; no favor follows and no support is deducted.' },
      ]));
    } else {
      if (a.stage === 'offered') result.push(event(a, 'A date for the relief list', a.note, [
        { id: 'promise', label: 'Put their relief date in writing', detail: `No immediate absence. Revisit the release after two assignments; ${crewName(a, 'junior')} will inherit the crew's approach work if they go.` },
        { id: 'extend', label: 'Ask them to stay for the harder work', detail: `Keep ${c.pilot} in the squadron and add one strain. In two assignments they must have an assignment off or leave for instruction.` },
      ]));
      if (a.stage === 'release') result.push(event(a, 'The relief papers are here', `${c.pilot} leaves the papers on the briefing table. “You have had the notice. Now give us an answer we can take to the crew.” ${crewName(a, 'junior')} is named to receive the old approach book.`, [
        { id: 'instruct', label: 'Release them to instruction', detail: `Hold ${c.pilot} off the remaining tour. ${crewName(a, 'junior')} gains two experience and a practiced bombing lesson after one assignment of handover.`, disabled: !crewReady(s, junior) },
        { id: 'rest', label: 'Keep them, with this assignment off', detail: 'Hold the veteran off this assignment. All their strain and fatigue clear at its report; the experienced crew then remains available for the closing operations.' },
      ]));
    }
  }
  return result;
}
export function storyPriority(s: State, e: StationEvent): number {
  const a = s.stories?.find(a => a.id === e.subject);
  return a && a.stage !== 'offered' ? 1 : a ? storyDefinitions[a.family].priority : 5;
}
/** Called only after the central decision validator accepts a currently offered choice. */
export function applyStoryChoice(s: State, e: StationEvent, choiceId: string): void {
  const a = s.stories?.find(a => a.id === e.subject && a.status === 'active');
  const shown = storyEvents(s).find(x => x.key === e.key)?.choices.find(x => x.id === choiceId);
  if (!a || !shown || shown.disabled) throw new Error('This story choice is no longer available.');
  const c = crew(s, a)!, junior = crew(s, a, 'junior');
  delete a.expiresSlot;
  if (a.family === 'confidence') {
    if (a.stage === 'offered') {
      a.choice = choiceId; a.dueSlot = s.completed + 2;
      if (choiceId === 'lead') { c.strain = cap(c.strain + 1, 3); briefing(s, `${c.pilot}'s crew-led approach briefing`); }
      else duty(s, a, 'Checking the approach method', s.completed + 1, c);
      milestone(s, a, 'testing', choiceId === 'lead' ? `${c.pilot} briefed the squadron from two successful approaches. The responsibility added one strain; a review is due after two assignments.` : `${c.pilot} was given an assignment ashore to check the method behind the good photographs. A review is due after two assignments.`);
    } else if (choiceId === 'teach') {
      duty(s, a, 'Passing on the approach method', s.completed + 1, c);
      duty(s, a, 'Learning the approach method', s.completed + 1, junior!);
      junior!.experience = cap(junior!.experience + 1); junior!.lesson = true; c.strain = Math.max(0, c.strain - 1);
      milestone(s, a, 'shared', `${c.pilot} and ${junior!.pilot} spent the assignment checking one another's plots. The junior gained a practiced lesson and experience; the senior gave up a flying place and shed one strain.`, 'resolved');
    } else {
      c.experience = cap(c.experience + 1); c.lesson = true; c.strain = cap(c.strain + 1, 3);
      milestone(s, a, 'responsible', `${c.pilot} kept the operational responsibility with a better-tested method. One experience and a practiced lesson were earned; another strain came with the place at the front.`, 'resolved');
    }
  } else if (a.family === 'interpretation') {
    if (a.stage === 'offered') {
      a.choice = choiceId; a.dueSlot = s.completed + 2;
      if (choiceId === 'compare') { s.support--; duty(s, a, 'Comparing survey photographs', s.completed + 1, c); }
      milestone(s, a, 'checking', choiceId === 'compare' ? `${c.pilot}'s crew was held off one assignment with survey prints bought from the transport allocation. The gun report remains an estimate until comparison is complete.` : `${c.pilot}'s estimated gun positions were filed with Group. Later photographs will test the reading; no crew or support was committed.`);
    } else {
      const useful = a.choice === 'compare' || a.finding === 'guns';
      if (choiceId === 'local') {
        if (useful) briefing(s, `${c.pilot}'s confirmed survey comparison`);
        else { duty(s, a, 'Correcting the approach map', s.completed + 1, c); c.experience = cap(c.experience + 1); c.lesson = true; }
        milestone(s, a, useful ? 'local-notes' : 'corrected', useful ? `${c.pilot}'s confirmed comparison became the squadron's approach notes. This assignment receives the bombing benefit.` : `${c.pilot} stayed ashore to correct the mistaken gun estimate. The crew gained experience and a practiced lesson; today's package used another crew.`, 'resolved');
      } else {
        if (useful && a.finding === 'guns') s.suppression += .5;
        if (useful && a.finding === 'tracks') s.support = cap(s.support + 1, 5);
        milestone(s, a, 'group-record', useful ? a.finding === 'guns' ? 'Group used the confirmed gun positions to divert its supporting fighters. Opposition falls half a level on this assignment.' : 'Group confirmed that the road was clear and released one transport allocation, subject to the station limit.' : 'Group corrected the estimate to wheel tracks. No guns had been found and no operational benefit was claimed.', 'resolved');
      }
    }
  } else if (a.family === 'neighbors') {
    if (a.stage === 'offered') {
      a.choice = choiceId; a.dueSlot = s.completed + 2;
      if (choiceId === 'crates') s.support--;
      milestone(s, a, 'promised', choiceId === 'promise' ? `${participant(a, 'aircraft')!.name} and ${c.pilot} were promised for West Fen's ferry two assignments from now. They remain on the roster until then.` : 'Spare instruments went to West Fen for one support. Its fitters promised a workshop visit two assignments later.');
    } else if (a.stage === 'ferry') {
      if (choiceId === 'release') milestone(s, a, 'released', 'The station released its ferry promise to meet its own operation. West Fen arranged Group transport; no reciprocal help was owed.', 'closed');
      else {
        duty(s, a, 'West Fen instrument ferry', s.completed + 1, c, aircraft(s, a)!);
        a.dueSlot = s.completed + 1;
        milestone(s, a, 'ferrying', `${aircraft(s, a)!.name} and ${c.pilot} carried West Fen's fitters for one assignment. Their bombing places were left to the reserves.`);
      }
    } else {
      if (choiceId === 'workshop') {
        s.extraBay++;
        s.extraBaySources = [...(s.extraBaySources ?? []), "West Fen's workshop lorry, earned by the completed ferry"];
      }
      else {
        const recoveries = s.jobs.filter(j => j.kind === 'recovery');
        if (recoveries.length) for (const j of recoveries) j.at = Math.min(j.at, Math.max(s.now + 3_600_000, j.at - 6 * 3_600_000));
        else s.support = cap(s.support + 1, 5);
      }
      milestone(s, a, choiceId, choiceId === 'workshop' ? 'West Fen repaid the ferry with a mobile workshop. One extra proper repair bay is available at the next commitment.' : 'West Fen repaid the ferry with transport: pending recoveries were brought forward by up to six hours, or one allocation was kept if none was due.', 'resolved');
    }
  } else if (a.stage === 'offered') {
    a.choice = choiceId; a.dueSlot = s.completed + 2;
    if (choiceId === 'extend') c.strain = cap(c.strain + 1, 3);
    milestone(s, a, 'notice', choiceId === 'promise' ? `${c.pilot}'s relief date was put in writing, two assignments ahead. The crew kept flying while its approach book was prepared for ${crewName(a, 'junior')}.` : `${c.pilot} agreed to remain for the harder work, adding one strain. A definite release or an assignment off is due in two assignments.`);
  } else if (choiceId === 'instruct') {
    duty(s, a, 'Released to Group instruction', 14, c);
    duty(s, a, 'Receiving the veteran approach book', s.completed + 1, junior!);
    junior!.experience = cap(junior!.experience + 2); junior!.lesson = true;
    milestone(s, a, 'instructors', `${c.pilot} and ${c.replacement ?? c.specialist} left the bombing roster for Group instruction. ${junior!.pilot} inherited the approach book, two experience and a practiced lesson, after an assignment of handover.`, 'resolved');
  } else {
    c.leaveThrough = s.completed + 1;
    a.dueSlot = s.completed + 1;
    milestone(s, a, 'resting', `${c.pilot} stayed with the squadron in exchange for this assignment off. The medical officer will clear the crew's fatigue and strain at its report.`);
  }
}
/** Transition once per completed report, never per panel opening or wall-clock tick. */
export function advanceStories(s: State, report: Report, draw: () => number): void {
  s.stories ??= []; s.duties ??= [];
  for (const a of s.stories) {
    const c = crew(s, a);
    // A later casualty is an additional record. A finished achievement remains finished.
    for (const p of a.participants) {
      const lost = p.kind === 'crew' ? s.crews.find(c => c.id === p.id)?.lost : s.aircraft.find(x => x.id === p.id)?.lost;
      if (lost && !a.milestones.some(m => m.stage === `later-loss-${p.id}`)) {
        const text = `${p.name} was lost on a later operation. The earlier entries in this account stand.`;
        a.milestones.push({ slot: s.completed, stage: `later-loss-${p.id}`, text });
        if (a.status !== 'active') report.notes.push(text);
      }
    }
    if (a.status !== 'active') continue;
    // Goods already sent and completed ferry work belong to the station. A later
    // absence or casualty cannot revoke West Fen's earned obligation.
    if (a.family === 'neighbors' && a.stage === 'promised' && a.choice === 'crates') {
      if (s.completed >= a.dueSlot) {
        s.extraBay++;
        s.extraBaySources = [...(s.extraBaySources ?? []), "West Fen's fitters, sent in return for the spare instruments"];
        milestone(s, a, 'workshop-arrived', 'West Fen received the spare instruments and sent its fitters as promised. One additional proper repair bay is available at this commitment.', 'resolved');
      }
      continue;
    }
    if (a.family === 'neighbors' && a.stage === 'ferrying') {
      if (s.completed >= a.dueSlot) milestone(s, a, 'favor', `${participant(a, 'aircraft')!.name} and ${crewName(a)} completed West Fen's ferry. The station has earned the promised help; subsequent roster changes do not cancel it.`);
      continue;
    }
    if (a.family === 'neighbors' && a.stage === 'favor') {
      if (s.completed >= 14) milestone(s, a, 'favor-inherited', 'West Fen’s earned offer of a workshop or transport passed to the relief squadron at the end of the tour.', 'resolved');
      continue;
    }
    if (!c) {
      const saved = participant(a)!;
      const current = s.crews.find(c => c.id === saved.id);
      const ashore = current?.replacement && (saved.specialistId === current.specialistId || saved.specialistName === current.specialist);
      milestone(s, a, 'participant-lost', `${saved.name}'s flying crew was lost before this undertaking was settled.${ashore ? ` ${saved.specialistName} remained ashore and was not aboard.` : ''} The station closed the outstanding undertaking; earlier work remains on record.`, 'closed');
      continue;
    }
    if (s.completed >= 14) {
      milestone(s, a, 'tour-closed', `${a.title}: the tour ended before the remaining arrangement could be completed. Operations released the obligation; recorded work and earned benefits remain.`, 'closed');
      continue;
    }
    if (a.stage === 'offered' && s.completed >= (a.expiresSlot ?? 99)) {
      const text = a.family === 'neighbors' ? 'No ferry or instruments were promised. West Fen used Group transport and released the request.' : a.family === 'relief' ? `${c.pilot}'s relief offer was not taken up. Group kept the crew on the squadron roster for the remaining tour.` : a.family === 'interpretation' ? 'No comparison was ordered. Intelligence marked the gun estimate unverified and filed it without changing an operation.' : `${c.pilot}'s briefing offer passed without an instruction. The crew stayed on ordinary operations; no special responsibility was claimed.`;
      milestone(s, a, 'staff-default', text, 'closed'); report.notes.push(text); continue;
    }
    if (s.completed < a.dueSlot) continue;
    if (a.stage === 'testing') {
      const began = a.milestones.find(m => m.stage === 'testing')?.slot ?? a.opened;
      const later = s.reports.filter(r => r.slot > began).flatMap(r => r.results).filter(r => r.crew === c.id);
      const evidence = later.length ? `${later.filter(r => r.hit).length} effective strikes from ${later.length} later sorties are on the record.` : 'No later sortie has yet tested the crew’s approach work.';
      milestone(s, a, 'review', `${c.pilot}'s method is ready for review. ${evidence} ${a.choice === 'lead' ? 'The crew carried the briefing responsibility.' : 'The assignment ashore exposed the limits of the old approach notes.'}`);
    }
    if (a.stage === 'checking') {
      a.knowledge = 'confirmed';
      milestone(s, a, 'findings', a.finding === 'guns' ? 'Later photographs confirm occupied gun pits. The earlier interpretation can now be judged against a known position.' : 'Later photographs confirm wheel tracks, not gun pits. The original estimate has been corrected in the station record.');
    }
    if (a.stage === 'promised') {
      a.expiresSlot = s.completed + 2; milestone(s, a, 'ferry', 'West Fen has called for the promised ferry. The aircraft and crew need one assignment clear; the request stays open for two assignments.');
    }
    if (a.stage === 'ferry' && s.completed >= (a.expiresSlot ?? 99)) {
      milestone(s, a, 'ferry-released', `West Fen could wait no longer for ${participant(a, 'aircraft')!.name} and ${c.pilot}. Its fitters used Group transport. The promise was released without taking support or aircraft.`, 'closed');
    }
    if (a.stage === 'notice') milestone(s, a, 'release', `${c.pilot}'s relief date has arrived. The crew is available for a decision once medical, recovery, or other station duties are complete.`);
    if (a.stage === 'resting') milestone(s, a, 'stayed', `${c.pilot}'s promised assignment off is complete. The experienced crew stayed for the closing work with its fatigue and strain cleared.`, 'resolved');
  }
  if (s.contentVersion !== 1 || s.completed > 8 || s.completed < 2 ||
    s.stories.filter(a => a.status === 'active').length + activeThreadCount(s) >= 3 ||
    s.stories.some(a => s.completed - a.opened < 2)) return;
  const candidates = (Object.keys(storyDefinitions) as StoryFamily[]).map(f => startCandidate(s, f)).filter((x): x is StoryArc => !!x);
  if (!candidates.length || draw() >= .7) return; // Quiet returns are intentional.
  const selected = candidates[Math.min(candidates.length - 1, Math.floor(draw() * candidates.length))];
  if (selected.family === 'interpretation') { selected.finding = draw() < .55 ? 'guns' : 'tracks'; selected.knowledge = 'estimated'; }
  s.stories.push(selected); addNotice(s, selected.note);
}
