import type { Aircraft, Crew, State, StationEvent } from './types.ts';

/** A station offer is selected once at a return, never while a panel is rendered. */
export type OperationalId = 'cloud-floor' | 'formation-lead' | 'fuel-drums' | 'rail-alternate' | 'stores-ferry' | 'radio-watch' | 'workshop-exchange' | 'escort-debt' | 'gun-map' | 'instructor-detail' | 'fuse-setting' | 'recovery-section';
export interface OperationalOffer {
  id: OperationalId; slot: number; aircraft?: string; crew?: string; otherCrew?: string;
  aircraftName?: string; pilot?: string; otherPilot?: string;
}
export interface OperationalHistory { id: OperationalId; slot: number; status: 'resolved' | 'expired'; choice?: string; text: string; }
export interface OperationalConsequence {
  id: string; dueSlot: number; kind: 'support' | 'escort' | 'instruction' | 'recovery';
  source: string; crew?: string; amount?: number;
}
export interface OperationalState {
  checkedSlot: number; lastSelected: number; selected: OperationalOffer | null;
  history: OperationalHistory[]; consequences: OperationalConsequence[];
}
interface OperationalDefinition {
  id: OperationalId; title: string; priority: number; excludes: OperationalId[];
  eligible(s: State): Omit<OperationalOffer, 'id' | 'slot'> | null;
  event(s: State, offer: OperationalOffer): Pick<StationEvent, 'body' | 'choices'>;
  defaultText: string;
}
const current = (s: State) => s.assignments[s.completed];
const freeCrew = (s: State, c: Crew) => !c.lost && !c.injury && c.leaveThrough <= s.completed && c.fatigue < 65 &&
  !s.jobs.some(j => j.kind === 'training' && j.subject === c.id || j.kind === 'recovery' && j.text === c.id) &&
  !s.duties?.some(d => d.crew === c.id && d.through > s.completed);
const freeAircraft = (s: State, a: Aircraft) => !a.lost && !a.away && !a.defect && a.condition >= 70 &&
  !s.jobs.some(j => ['repair', 'inspection'].includes(j.kind) && j.subject === a.id) &&
  !s.duties?.some(d => d.aircraft === a.id && d.through > s.completed);
const bayFree = (s: State) => s.engineeringUsed < 1 + s.extraBay && !s.jobs.some(j => ['repair', 'inspection'].includes(j.kind));
const assignedCrew = (s: State, o: OperationalOffer) => s.crews.find(c => c.id === o.crew);
const participantFree = (s: State, o: OperationalOffer) => (!o.crew || !!s.crews.find(c => c.id === o.crew && freeCrew(s, c))) &&
  (!o.otherCrew || !!s.crews.find(c => c.id === o.otherCrew && freeCrew(s, c))) &&
  (!o.aircraft || !!s.aircraft.find(a => a.id === o.aircraft && freeAircraft(s, a)));
const spareCrew = (s: State) => {
  const crews = s.crews.filter(c => freeCrew(s, c));
  return crews.length > current(s).requested ? crews.sort((a, b) => a.experience - b.experience)[0] : undefined;
};
const spareAircraft = (s: State) => {
  const aircraft = s.aircraft.filter(a => freeAircraft(s, a));
  return aircraft.length > current(s).requested ? aircraft.sort((a, b) => a.condition - b.condition)[0] : undefined;
};
const crewRef = (c: Crew) => ({ crew: c.id, pilot: c.pilot });
const plain = (condition: boolean) => condition ? {} : null;

/** These are twelve different operational trades, not twelve rolls of a repair prompt. */
export const operationalDefinitions: readonly OperationalDefinition[] = [
  {
    id: 'cloud-floor', title: 'Under the cloud base', priority: 3, excludes: ['fuse-setting', 'formation-lead'],
    eligible: s => plain(current(s).weather === 'cloud' && current(s).hazard <= 3),
    event: () => ({ body: 'The weather officer marks the cloud base on the board. “We can see the aiming point from below it. So can the guns.” Operations can authorize a lower bombing height for this assignment.', choices: [
      { id: 'lower', label: 'Authorize the lower run', detail: 'Remove the cloud accuracy penalty on this assignment; opposition rises by three quarters of a level. Other risks remain.' },
      { id: 'height', label: 'Keep the planned height', detail: 'Keep the cloud penalty and the existing opposition. Navigation crews cope better with cloud.' },
    ] }), defaultText: 'Operations retained the planned height; the cloud penalty remained.',
  },
  {
    id: 'formation-lead', title: 'A steady aircraft at the front', priority: 2, excludes: ['cloud-floor', 'fuse-setting'],
    eligible: s => { const c = s.crews.find(c => freeCrew(s, c) && c.experience >= 6 && c.fatigue <= 35); return current(s).requested >= 3 && !s.briefing && c ? crewRef(c) : null; },
    event: (s, o) => ({ body: `${o.pilot} offers to rehearse the assembly and brief every crew. “Let them find the formation here, before they have to find it over the coast.” The preparation will cost the crew some rest.`, choices: [
      { id: 'lead', label: 'Have the veteran prepare the formation', detail: `${o.pilot}'s crew gains 18 fatigue now. All dispatched crews gain seven percentage points of bombing accuracy for this assignment; the veteran remains available.`, disabled: !participantFree(s, o) || s.briefing },
      { id: 'routine', label: 'Use the normal assembly briefing', detail: 'No extra accuracy or fatigue. Preserve the veteran’s rest for the flight.' },
    ] }), defaultText: 'The duty officer used the normal assembly briefing and preserved the veteran’s rest.',
  },
  {
    id: 'fuel-drums', title: 'Fuel at the forward strip', priority: 3, excludes: ['recovery-section'],
    eligible: s => plain(current(s).circumstance === 'fuel' && s.support >= 1),
    event: s => ({ body: 'The dogleg forecast still shows a headwind. Finch can send drums and a bowser crew to the forward strip. “It gives them a proper fuel plan. It does not make the crossing shorter.”', choices: [
      { id: 'send', label: 'Pre-position the fuel', detail: 'Spend one support. Remove this assignment’s extra headwind fatigue and fuel diversion risk; the usual dogleg fatigue and risks remain.', disabled: s.support < 1 },
      { id: 'keep', label: 'Keep the transport on station', detail: 'No support spent. The direct route avoids the dogleg’s additional fuel penalty.' },
    ] }), defaultText: 'Transport remained on station; the published headwind restrictions stayed in force.',
  },
  {
    id: 'rail-alternate', title: 'The loading roads beside the works', priority: 4, excludes: ['cloud-floor', 'fuse-setting'],
    eligible: s => plain(current(s).effect === 'supplies' && current(s).requested >= 3 && current(s).hazard >= 3 && !current(s).followup),
    event: () => ({ body: 'Operations has a second aiming point beside the works: the loading roads. “We would delay the traffic, not close the shops. Group will keep its transport if we change the request.”', choices: [
      { id: 'rail', label: 'Block the loading roads', detail: 'Change today to a rail objective: one fewer aircraft requested and half a level less opposition. Success reduces next assignment’s opposition by three quarters of a level, instead of earning supply support.' },
      { id: 'works', label: 'Keep the workshops', detail: 'Keep the larger industrial request and its opposition. A successful supply strike earns support and a transport opportunity.' },
    ] }), defaultText: 'The industrial aiming point remained on the board; the loading roads were not substituted.',
  },
  {
    id: 'stores-ferry', title: 'A short freight flight', priority: 4, excludes: ['radio-watch', 'instructor-detail'],
    eligible: s => { const c = spareCrew(s), a = spareAircraft(s); return s.support < 4 && c && a ? { ...crewRef(c), aircraft: a.id, aircraftName: a.name } : null; },
    event: (s, o) => ({ body: `Group has station stores waiting at a coastal depot. ${o.pilot} can take ${o.aircraftName} over by the home route while the bombing formation is away. “We can bring the crates. We cannot be in both places.”`, choices: [
      { id: 'ferry', label: 'Assign the reserve to the freight flight', detail: `Hold ${o.aircraftName} and ${o.pilot}'s crew off this bombing assignment. Add 12 fatigue to the crew now; gain one support at the return report, up to five.`, disabled: !participantFree(s, o) },
      { id: 'reserve', label: 'Keep the reserve at readiness', detail: 'Keep both available for the bombing package. Group will use another station; no support earned.' },
    ] }), defaultText: 'The reserve stayed at readiness; Group assigned the freight flight elsewhere.',
  },
  {
    id: 'radio-watch', title: 'A listening watch on the coast', priority: 4, excludes: ['stores-ferry', 'instructor-detail'],
    eligible: s => { const c = spareCrew(s); return current(s).hazard >= 3 && current(s).circumstance !== 'escort' && c ? crewRef(c) : null; },
    event: (s, o) => ({ body: `Signals needs ${o.pilot}'s reserve crew at the coastal direction-finding hut. The set is working; there are too few trained hands to keep a continuous watch. Bearings will help the formation avoid the main patrols.`, choices: [
      { id: 'watch', label: 'Send the reserve crew to Signals', detail: `Hold ${o.pilot}'s crew off this assignment and add 12 fatigue now. Reduce this assignment’s opposition by half a level. No aircraft is tied up.`, disabled: !participantFree(s, o) },
      { id: 'available', label: 'Keep the crew available to fly', detail: 'No extra bearings or fatigue. Preserve the full flying roster.' },
    ] }), defaultText: 'Signals used its normal watch; the reserve crew remained available to fly.',
  },
  {
    id: 'workshop-exchange', title: 'Finch’s benches or Group’s lorry', priority: 4, excludes: ['fuse-setting'],
    eligible: s => plain(bayFree(s) && s.support <= 3 && s.aircraft.some(a => !a.lost && !a.away && a.condition < 85)),
    event: s => ({ body: 'Group needs a batch of starter motors checked. Finch can do it in the normal bay and claim a transport allocation. “They get the bench this time. Our own repair has to wait.”', choices: [
      { id: 'motors', label: 'Use one bay for Group’s starter motors', detail: 'Use one engineering allocation on this assignment. Gain one support at its report, up to five. That bay cannot repair a squadron aircraft today.', disabled: !bayFree(s) },
      { id: 'ours', label: 'Keep the bay for squadron repairs', detail: 'Preserve the normal engineering allocation. No transport credit is earned.' },
    ] }), defaultText: 'Finch retained his engineering allocation for squadron aircraft.',
  },
  {
    id: 'escort-debt', title: 'Group can cover one of two runs', priority: 2, excludes: ['radio-watch', 'gun-map'],
    eligible: s => plain(current(s).circumstance === 'escort' && s.completed <= 10 && s.assignments[s.completed + 2]?.hazard >= 3 && s.assignments[s.completed + 2]?.circumstance !== 'escort'),
    event: s => ({ body: `Group’s fighter controller can keep today’s cover, or reserve it for assignment ${s.completed + 3}, when the squadron goes farther inland. “I can put your name against one rendezvous. Not both.”`, choices: [
      { id: 'later', label: 'Reserve cover for the later raid', detail: `Remove today’s escort circumstance. Escort cover will replace the approach circumstance on assignment ${s.completed + 3}; its weather, objective, and request stay the same.` },
      { id: 'today', label: 'Keep today’s rendezvous', detail: 'Keep today’s escort arrangement. The later assignment retains its original approach.' },
    ] }), defaultText: 'Group kept today’s escort rendezvous; no later reservation was made.',
  },
  {
    id: 'gun-map', title: 'Who gets the patrol warning?', priority: 4, excludes: ['escort-debt', 'radio-watch'],
    eligible: s => plain(s.suppression >= .75 && s.support < 4 && current(s).hazard >= 2),
    event: () => ({ body: 'The last raid has driven patrols away from our approach. A neighboring formation could use that corridor too. Operations can give them the first passage in exchange for their next transport allocation.', choices: [
      { id: 'share', label: 'Give the other formation first passage', detail: 'Give up three quarters of a level of today’s earned opposition reduction. Gain one support at the return report, up to five.' },
      { id: 'keep', label: 'Use the opening for our own formation', detail: 'Keep all today’s earned reduction in opposition. No transport is promised.' },
    ] }), defaultText: 'The squadron kept its first passage through the quieter corridor.',
  },
  {
    id: 'instructor-detail', title: 'An instructor for the new arrival', priority: 3, excludes: ['stores-ferry', 'radio-watch'],
    eligible: s => { const crews = s.crews.filter(c => freeCrew(s, c)); const novice = crews.find(c => c.experience <= 2 && c.sorties <= 2); const veteran = crews.find(c => c.experience >= 6); return s.completed >= 5 && crews.length >= current(s).requested + 2 && novice && veteran ? { ...crewRef(novice), otherCrew: veteran.id, otherPilot: veteran.pilot } : null; },
    event: (s, o) => ({ body: `${o.otherPilot} has kept the instrument procedure cards. ${o.pilot} is still new enough to use them. “Give us one assignment on the ground. We will work through every missed turn.”`, choices: [
      { id: 'instruct', label: 'Hold both crews for ground instruction', detail: `Keep both crews off this assignment. At its report ${o.pilot}'s crew gains one experience and a practiced approach bonus for its next flight. No support cost.`, disabled: !participantFree(s, o) },
      { id: 'fly', label: 'Keep both on the flying roster', detail: 'No ground training is arranged. The new crew can gain experience from flying.' },
    ] }), defaultText: 'Both crews remained on the roster; the ground instruction was not arranged.',
  },
  {
    id: 'fuse-setting', title: 'The armourers want the bench', priority: 3, excludes: ['workshop-exchange', 'cloud-floor', 'formation-lead'],
    eligible: s => plain(current(s).circumstance === 'dispersed' && !s.briefing && bayFree(s)),
    event: s => ({ body: 'The dispersed aiming points need different release intervals. The armourers can mark and rehearse the sequence with the crews, using Finch’s test bench. Finch taps his repair list. “One bench. Choose the work.”', choices: [
      { id: 'prepare', label: 'Give the armourers one engineering allocation', detail: 'Use one repair allocation today. Prepared release notes add seven percentage points to this assignment’s bombing accuracy; no aircraft condition is restored.', disabled: !bayFree(s) || s.briefing },
      { id: 'repair', label: 'Keep the bench with Finch', detail: 'Keep the engineering allocation for aircraft repairs. Crews use the normal release sequence.' },
    ] }), defaultText: 'The test bench stayed with Finch; crews used the normal release sequence.',
  },
  {
    id: 'recovery-section', title: 'Transport at the landing ground', priority: 3, excludes: ['fuel-drums'],
    eligible: s => plain(s.support >= 1 && (current(s).weather === 'crosswind' || current(s).circumstance === 'fuel')),
    event: s => ({ body: 'The forecast makes a landing away from base more likely. The recovery section can wait at the forward strip with tools and transport. Finch says, “They may have nothing to do. That would suit me.”', choices: [
      { id: 'forward', label: 'Position the recovery section ahead', detail: 'Spend one support now. Any aircraft diverted on this assignment will recover 24 hours sooner, no earlier than one hour after landing. Covers the whole package; unused transport is not refunded.', disabled: s.support < 1 },
      { id: 'station', label: 'Keep recovery transport on station', detail: 'No support spent now. Any diversion uses the normal recovery timetable; later assistance remains a separate decision.' },
    ] }), defaultText: 'Recovery transport remained on station; ordinary recovery times apply.',
  },
];

function log(s: State, text: string): void { s.notices = [...s.notices.slice(-11), text]; }
function setup(s: State): OperationalState {
  return s.operations ??= { checkedSlot: -1, lastSelected: -3, selected: null, history: [], consequences: [] };
}
function duty(s: State, o: OperationalOffer, label: string, aircraft?: string, crew?: string): void {
  (s.duties ??= []).push({ id: `op-${o.id}-${crew ?? aircraft}`, arcId: `op-${o.id}`, label, aircraft, crew, through: s.completed + 1 });
  s.plan.flights = s.plan.flights.filter(f => f.aircraft !== aircraft && f.crew !== crew);
}
function later(s: State, o: OperationalOffer, kind: OperationalConsequence['kind'], source: string, delay = 1, crew?: string): void {
  setup(s).consequences.push({ id: `op-${o.id}`, dueSlot: s.completed + delay, kind, source, crew, amount: 1 });
}
function settleConsequences(s: State): void {
  const state = setup(s);
  for (const due of state.consequences.filter(d => d.dueSlot <= s.completed)) {
    let text = '';
    if (due.kind === 'support') {
      const gain = Math.min(due.amount ?? 1, 5 - s.support); s.support += gain;
      text = `${due.source} ${gain ? `Group delivered ${gain} support.` : 'The allocation arrived, but the station already holds its limit of five support.'}`;
    } else if (due.kind === 'escort') {
      if (s.phase === 'active' && current(s)) { current(s).circumstance = 'escort'; text = `${due.source} Group has confirmed the reserved escort for this assignment.`; current(s).followup = [current(s).followup, text].filter(Boolean).join(' '); }
      else text = `${due.source} The tour ended before the reserved escort could be used; Group released it to another formation.`;
    } else if (due.kind === 'instruction') {
      const c = s.crews.find(c => c.id === due.crew);
      if (c && !c.lost) { c.experience = Math.min(8, c.experience + 1); c.lesson = true; text = `${due.source} ${c.pilot} completed the ground instruction: one experience gained and practiced notes ready for the next flight.`; c.history.push(text); }
      else text = `${due.source} The receiving crew is no longer on the surviving roster; the prepared notes went to Group’s training section.`;
    } else {
      const report = s.reports.find(r => r.slot === due.dueSlot);
      const diverted = new Set(report?.results.filter(r => r.outcome === 'divert').map(r => r.aircraft) ?? []);
      const jobs = s.jobs.filter(j => j.kind === 'recovery' && diverted.has(j.subject));
      for (const j of jobs) j.at = Math.min(j.at, Math.max(s.now + 3_600_000, j.at - 24 * 3_600_000));
      text = jobs.length ? `The recovery section sent ahead met ${jobs.length} diverted aircraft. The section shortened each remaining wait by up to 24 hours; field checks still need signing off.` : 'The recovery section sent ahead had no diverted aircraft to meet. Its transport allocation was used, and the section returned to station.';
      if (report) report.notes.push(text);
    }
    log(s, text);
    if (due.kind !== 'recovery') s.reports.at(-1)?.notes.push(text);
  }
  state.consequences = state.consequences.filter(d => d.dueSlot > s.completed);
}

export function operationalCandidates(s: State): OperationalOffer[] {
  if (s.contentVersion !== 1 || s.legacyTour || s.active || s.phase !== 'active' || s.completed < 3 || s.completed >= 14) return [];
  const state = s.operations;
  const used = new Set(state?.history.map(h => h.id) ?? []);
  return operationalDefinitions.filter(d => !used.has(d.id)).flatMap(d => {
    const participants = d.eligible(s);
    return participants ? [{ id: d.id, slot: s.completed, ...participants }] : [];
  });
}

/** Call after completed increments and normal report rewards have been applied. */
export function selectOperationalEvent(s: State, random: () => number): void {
  if (s.contentVersion !== 1) return;
  const state = setup(s);
  settleConsequences(s);
  if (state.checkedSlot === s.completed || state.selected) return;
  state.checkedSlot = s.completed;
  if (s.completed - state.lastSelected < 2 || [4, 11].includes(s.completed)) return;
  const candidates = operationalCandidates(s);
  if (!candidates.length || random() < .28) return;
  // Lowest number is most urgent. Seeded tie choice; a quiet visit stays quiet on reload.
  const priority = (o: OperationalOffer) => operationalDefinitions.find(d => d.id === o.id)!.priority;
  const best = Math.min(...candidates.map(priority));
  const pool = candidates.filter(c => priority(c) === best);
  state.selected = pool[Math.floor(random() * pool.length)];
  state.lastSelected = s.completed;
}

export function operationalEvent(s: State): StationEvent | null {
  const o = s.operations?.selected;
  if (!o || o.slot !== s.completed || s.active || s.phase !== 'active') return null;
  const definition = operationalDefinitions.find(d => d.id === o.id)!;
  // Mutual exclusions also apply to another station system's already chosen effect.
  if (s.operations!.history.some(h => h.slot === o.slot && definition.excludes.includes(h.id))) return null;
  return { key: `operation-${o.id}-${o.slot}`, kind: 'operational', subject: o.crew ?? o.aircraft ?? '', title: definition.title, ...definition.event(s, o) };
}

/** Root choose records the usual DecisionRecord and notice after a true return. */
export function resolveOperationalEvent(s: State, key: string, choice: string): boolean {
  const event = operationalEvent(s);
  if (!event || event.key !== key) return false;
  const option = event.choices.find(c => c.id === choice);
  if (!option || option.disabled) throw new Error('That operational decision is no longer available.');
  const o = s.operations!.selected!, task = current(s), c = assignedCrew(s, o);
  switch (o.id) {
    case 'cloud-floor': if (choice === 'lower') { task.weather = 'clear'; task.hazard += .75; task.followup = 'You authorized a lower run beneath the cloud. The aiming point is visible; the guns have a better view too.'; } break;
    case 'formation-lead': if (choice === 'lead') { c!.fatigue = Math.min(100, c!.fatigue + 18); s.briefing = true; s.briefingSource = `${o.pilot}'s rehearsed formation and approach briefing`; } break;
    case 'fuel-drums': if (choice === 'send') { s.support--; task.circumstance = 'ordinary'; task.followup = 'The fuel and bowser crew you sent ahead removed the extra headwind restriction. The normal dogleg costs remain.'; } break;
    case 'rail-alternate': if (choice === 'rail') { task.title = 'Loading roads beside the works'; task.objective = 'Block the loading roads serving the industrial workshops.'; task.why = 'The works will keep running, but disrupted rail traffic can ease the next assignment. Group keeps the industrial transport allocation.'; task.effect = 'rail'; task.requested--; task.hazard -= .5; task.followup = 'You substituted the smaller railway aiming point for the defended workshops.'; } break;
    case 'stores-ferry': if (choice === 'ferry') { duty(s, o, 'Freight flight; returns with this assignment', o.aircraft, o.crew); c!.fatigue += 12; later(s, o, 'support', `${o.pilot} brought the station stores home in ${o.aircraftName}.`); } break;
    case 'radio-watch': if (choice === 'watch') { duty(s, o, 'Coastal listening watch; released at this report', undefined, o.crew); c!.fatigue += 12; s.suppression += .5; task.followup = `${o.pilot}'s reserve crew is keeping the coastal radio watch. Their bearings reduce today's opposition by half a level.`; } break;
    case 'workshop-exchange': if (choice === 'motors') { s.engineeringUsed++; later(s, o, 'support', 'Finch completed the batch of starter motors promised to Group.'); } break;
    case 'escort-debt': if (choice === 'later') { task.circumstance = 'ordinary'; later(s, o, 'escort', `You gave up the escort on assignment ${s.completed + 1}.`, 2); task.followup = `You reserved today's escort for assignment ${s.completed + 3}. This formation flies without that arrangement.`; } break;
    case 'gun-map': if (choice === 'share') { s.suppression = Math.max(0, s.suppression - .75); later(s, o, 'support', 'The neighboring formation used the first passage you gave them.'); } break;
    case 'instructor-detail': if (choice === 'instruct') { duty(s, o, 'Ground instruction; released at this report', undefined, o.crew); duty(s, o, 'Giving ground instruction; released at this report', undefined, o.otherCrew); later(s, o, 'instruction', `${o.otherPilot} kept the instrument procedure cards for ${o.pilot}.`, 1, o.crew); } break;
    case 'fuse-setting': if (choice === 'prepare') { s.engineeringUsed++; s.briefing = true; s.briefingSource = 'the armourers’ rehearsed release sequence for the dispersed aiming points'; } break;
    case 'recovery-section': if (choice === 'forward') { s.support--; later(s, o, 'recovery', 'Recovery transport was positioned at the forward strip.'); } break;
  }
  const text = `${event.title}: ${option.label}. ${option.detail}`;
  s.operations!.history.push({ id: o.id, slot: o.slot, status: 'resolved', choice, text });
  s.operations!.selected = null;
  return true;
}

/** Offers concern this dispatch only. Ignoring one never reserves people or spends support. */
export function expireOperationalEvent(s: State): void {
  const o = s.operations?.selected;
  if (!o) return;
  const definition = operationalDefinitions.find(d => d.id === o.id)!;
  const text = `${definition.title}: ${definition.defaultText}`;
  s.operations!.history.push({ id: o.id, slot: o.slot, status: 'expired', text });
  s.operations!.selected = null;
  log(s, text);
}
