import type { Aircraft, Crew, FlightResult, JobKind, Plan, State } from './types.ts';
import { defectText, makeAssignments, stationEvents } from './content.ts';

export const HOUR = 3_600_000;
export const TOUR_LENGTH = 14;
export const SAVE_VERSION = 21;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
export function random(s: { rng: number }): number {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}
function schedule(s: State, kind: JobKind, at: number, subject = '', text?: string): void {
  s.jobs.push({ id: s.nextId++, kind, at, subject, ...(text ? { text } : {}) });
}
function note(s: State, text: string): void { s.notices = [...s.notices.slice(-11), text]; }
function resting(s: State, c: Crew): void {
  if (!c.lost && c.fatigue > c.strain * 12 && !s.jobs.some(j => j.kind === 'rest' && j.subject === c.id)) schedule(s, 'rest', s.now + 6 * HOUR, c.id);
}
export function createCampaign(seed: number, now: number): State {
  const s: State = {
    version: SAVE_VERSION, seed: seed >>> 0, rng: seed >>> 0, now, offset: 0, nextId: 1,
    station: '', circumstance: '', aircraft: [], crews: [], assignments: [], completed: 0,
    contribution: 0, requested: 0, support: 3, suppression: 0, engineeringUsed: 0,
    active: null, jobs: [], reports: [], decisions: [], notices: [], phase: 'active', ending: null,
    briefing: false, extraBay: 0, opportunity: null, planEdited: false,
    tutorial: { seen: [], disabled: false },
    plan: { flights: [], route: 'direct', orders: 'preserve', priority: '' },
  };
  const setting = Math.floor(random(s) * 3);
  s.station = ['Station 121 · Ashwell', 'Station 146 · Merefield', 'Station 108 · East Fen'][setting];
  s.circumstance = [
    'A recently arrived squadron. The aircraft are sound, but Bell’s crew is still learning the formation.',
    'A veteran flight with tired hands. A transport allocation gives Finch a little room to work.',
    'A wet dispersal and a dependable engineering section. Sunday Punch needs attention before the heavier requests.',
  ][setting];
  const names = ['Lucky Lady', 'Sunday Punch', 'Skylark', 'Old Sinner'];
  const pilots = ['Capt. Maddox', 'Lt. Bell', 'Lt. Rivera', 'Capt. Price'];
  const specialists = ['Sgt. Ellis', 'Sgt. Turner', 'Sgt. Doyle', 'Sgt. Morgan'];
  const traits: Aircraft['trait'][] = ['rugged', 'accurate', 'economical', 'swift'];
  const strengths: Crew['strength'][] = ['formation', 'bombing', 'engineering', 'navigation'];
  for (let i = 0; i < 4; i++) {
    s.aircraft.push({ id: `a${i}`, name: names[i], trait: traits[i], condition: i === 1 ? (setting === 2 ? 58 : 72) : 88 + Math.floor(random(s) * 10), defect: false, defectType: null, certified: 0, recovered: false, lost: false, away: false, sorties: 0, history: ['Accepted by the station engineering officer.'] });
    const portraits = ['Maddox counts the returning aircraft before he goes to the mess. Ellis keeps his crew’s letters in a biscuit tin.', 'Bell is new to the station. Turner has drawn the coast on the back of their card-playing board.', 'Rivera listens to the engines during run-up. Doyle always brings an extra pencil for the navigation table.', 'Price has flown enough crossings to distrust an easy forecast. Morgan keeps their old approach notes.'];
    const crew: Crew = { id: `c${i}`, pilot: pilots[i], specialist: specialists[i], strength: strengths[i], experience: [6, 1, 3, 5][i], fatigue: setting === 1 && i === 0 ? 48 : i === 3 ? 24 : 0, lost: false, injury: false, replacement: null, returned: false, sorties: 0, strain: 0, leaveThrough: 0, lesson: false, replacementSorties: 0, history: [portraits[i], 'Reported for the fourteen-assignment tour.'] };
    s.crews.push(crew); resting(s, crew);
  }
  if (setting === 1) s.support = 4;
  s.assignments = makeAssignments(() => random(s));
  s.plan = proposePlan(s);
  return s;
}
export function aircraftIssue(s: State, a: Aircraft): string {
  if (a.lost) return 'Lost on operations';
  if (a.away) return 'At a forward field';
  if (s.active?.plan.flights.some(f => f.aircraft === a.id)) return 'On operations';
  if (s.jobs.some(j => j.subject === a.id && ['repair', 'inspection'].includes(j.kind))) return 'In the repair bay';
  if (a.condition < 55) return 'Grounded · proper repair or field patch needed';
  if (a.defect) return `${defectText[a.defectType ?? 'oil'].name} · proper work needed`;
  if (a.recovered) return 'Recovered · field checks not yet certified';
  if (a.certified) return `Ready · certified work protects ${a.certified} more flights`;
  if (a.condition < 75) return 'Serviceable · worn systems';
  return 'Ready for assignment';
}
export function aircraftAvailable(s: State, a: Aircraft): boolean {
  return !a.lost && !a.away && a.condition >= 55 && !s.jobs.some(j => j.subject === a.id && ['repair', 'inspection'].includes(j.kind)) && !s.active?.plan.flights.some(f => f.aircraft === a.id);
}
export function crewIssue(s: State, c: Crew): string {
  if (c.lost) return 'Crew lost';
  if (c.leaveThrough > s.completed) return 'Promised this assignment off · returns after its report';
  if (s.active?.plan.flights.some(f => f.crew === c.id)) return 'On operations';
  if (s.jobs.some(j => j.kind === 'training' && j.subject === c.id)) return 'At the plotting table';
  if (s.jobs.some(j => j.kind === 'recovery' && j.text === c.id)) return 'With the diverted aircraft';
  if (c.injury && !c.replacement) return `${c.specialist} in hospital`;
  if (c.fatigue >= 95) return 'Exhausted · medical officer requires rest';
  if (c.replacement) return `${c.replacement} filling in${c.returned ? ' · original specialist returned' : ''}`;
  return c.fatigue >= 65 ? 'Very tired · extra exposure and strain' : c.strain > 0 ? `Operational strain ${c.strain}/3 · sleep alone will not clear it` : c.fatigue >= 35 ? 'Tired · fit with reservations' : 'Rested and fit';
}
export function crewAvailable(s: State, c: Crew): boolean {
  return !c.lost && c.leaveThrough <= s.completed && (!c.injury || !!c.replacement) && c.fatigue < 95 &&
    !s.active?.plan.flights.some(f => f.crew === c.id) &&
    !s.jobs.some(j => (j.kind === 'training' && j.subject === c.id) || (j.kind === 'recovery' && j.text === c.id));
}
export function proposePlan(s: State): Plan {
  const assignment = s.assignments[Math.min(s.completed, 13)];
  const aircraft = s.aircraft.filter(a => aircraftAvailable(s, a)).sort((a, b) => (b.condition - (b.defect ? 25 : 0)) - (a.condition - (a.defect ? 25 : 0)));
  const crews = s.crews.filter(c => crewAvailable(s, c)).sort((a, b) => (b.experience * 3 - b.fatigue) - (a.experience * 3 - a.fatigue));
  const flights = aircraft.slice(0, Math.min(assignment.requested, crews.length)).map((a, i) => ({ aircraft: a.id, crew: crews[i].id }));
  return { flights, route: s.plan.route, orders: s.plan.orders, priority: s.aircraft.filter(a => !a.lost && !a.away).sort((a, b) => (a.condition - (a.defect ? 35 : 0)) - (b.condition - (b.defect ? 35 : 0)))[0]?.id ?? '' };
}
export function planErrors(s: State, plan: Plan): string[] {
  const errors: string[] = [];
  if (s.phase !== 'active' || s.active) errors.push('The station cannot issue another assignment yet.');
  if (!['direct', 'dogleg'].includes(plan.route) || !['preserve', 'press'].includes(plan.orders)) errors.push('Choose valid standing orders.');
  if (!plan.flights.length) errors.push('Select at least one aircraft, or deliberately stand down.');
  if (new Set(plan.flights.map(f => f.aircraft)).size !== plan.flights.length || new Set(plan.flights.map(f => f.crew)).size !== plan.flights.length) errors.push('Each aircraft and crew may fly only once in a package.');
  for (const f of plan.flights) {
    const a = s.aircraft.find(a => a.id === f.aircraft), c = s.crews.find(c => c.id === f.crew);
    if (!a || !aircraftAvailable(s, a)) errors.push(`${a?.name ?? 'Aircraft'} is unavailable.`);
    if (!c || !crewAvailable(s, c)) errors.push(`${c?.pilot ?? 'Crew'} is unavailable.`);
  }
  return errors;
}
export function duration(plan: Plan): number { return (plan.route === 'direct' ? 4 : 6) * HOUR; }
export function forecast(s: State, a: Aircraft, c: Crew, p: Plan): { mechanical: number; exposure: number; accuracy: number } {
  const task = s.assignments[s.completed];
  const hazard = Math.max(0, task.hazard - s.suppression);
  const circumstance = task.circumstance;
  const defect = a.defect ? a.defectType ?? 'oil' : null;
  return {
    mechanical: clamp(.025 + (100 - a.condition) * .0025 + (defect === 'sight' ? .05 : defect ? .20 : 0) + (a.recovered ? .06 : 0) - (a.certified ? .06 : 0) - (a.trait === 'economical' ? .035 : 0) - (c.strength === 'engineering' ? .04 : 0) + (a.trait === 'accurate' ? .025 : 0), .01, .7),
    exposure: clamp(.045 + hazard * .045 + c.fatigue * .0013 + (defect === 'controls' ? .06 : 0) - c.experience * .006 - (circumstance === 'escort' ? .045 : 0) - (p.route === 'dogleg' ? circumstance === 'escort' ? .02 : circumstance === 'flak' ? .11 : .065 : 0) + (p.orders === 'press' ? .075 : -.02) - (a.trait === 'swift' ? .035 : 0) - (c.strength === 'formation' ? .03 : 0), .015, .6),
    accuracy: clamp(.65 + c.experience * .025 - c.fatigue * .0018 + (a.trait === 'accurate' ? .10 : 0) + (c.strength === 'bombing' ? .10 : 0) - (task.weather === 'cloud' ? (c.strength === 'navigation' ? .05 : .20) : 0) - (c.replacement ? Math.max(0, .12 - c.replacementSorties * .04) : 0) - (defect === 'sight' ? .16 : 0) + (c.lesson ? .08 : 0) + (s.briefing ? .07 : 0) + (circumstance === 'window' ? p.route === 'direct' ? .06 : -.08 : 0) + (p.orders === 'press' ? circumstance === 'dispersed' ? .22 : .12 : 0), .15, .97),
  };
}
export function flightFatigue(s: State, a: Aircraft, p: Plan): number {
  return (p.route === 'dogleg' ? 48 : 34) + (a.trait === 'rugged' ? 4 : 0) + (p.orders === 'press' ? 8 : 0) + (p.route === 'dogleg' && s.assignments[s.completed].circumstance === 'fuel' ? 8 : 0);
}
function flightOutcome(s: State, a: Aircraft, c: Crew, p: Plan): FlightResult {
  const f = forecast(s, a, c, p);
  // A fixed draw bundle per aircraft is persisted as a result at commitment.
  const [mechanical, combat, fatal, diversion, injury, aim, wear] = Array.from({ length: 7 }, () => random(s));
  const trouble = mechanical < f.mechanical;
  const struck = combat < f.exposure;
  const lost = struck && fatal < (p.orders === 'press' ? .09 : .04);
  const abort = trouble && (p.orders === 'preserve' || mechanical < f.mechanical * .35);
  const fuelPressure = p.route === 'dogleg' && s.assignments[s.completed].circumstance === 'fuel';
  const divert = !lost && !abort && (struck || trouble || fuelPressure || s.assignments[s.completed].weather === 'crosswind') && diversion < (p.route === 'dogleg' ? .26 : .12) + (a.trait === 'rugged' ? .06 : 0) + (fuelPressure ? .1 : 0) - (c.strength === 'navigation' ? .06 : 0);
  const outcome = lost ? 'lost' : abort ? 'abort' : divert ? 'divert' : 'home';
  const damage = Math.round(5 + wear * 8 + (struck ? 16 : 0) + (trouble ? 9 : 0) - (a.trait === 'rugged' && struck ? 8 : 0));
  const hurt = !lost && struck && injury < .3 && !c.injury && !c.replacement;
  const hit = !lost && !abort && aim < f.accuracy;
  const fatigue = flightFatigue(s, a, p);
  const newDefect = !lost && !a.defect && ((struck && wear > .65) || (a.condition < 70 && wear > .8)) ? struck ? 'controls' : a.trait === 'accurate' ? 'sight' : 'oil' : null;
  const strain = lost || abort ? 0 : (p.orders === 'press' ? 1 : 0) + (c.fatigue >= 65 || struck ? 1 : 0);
  // Status, injury and policy are independent facts; no branch may swallow another fact.
  const facts = [lost ? `Group confirms ${a.name} was lost with the crew aboard.` : abort ? `${c.pilot} brought ${a.name} back before the target after mechanical trouble${p.orders === 'press' ? ' exceeded the limits for pressing on' : ', following the return order'}.` : divert ? `${c.pilot} landed ${a.name} at a forward field; the crew aboard is accounted for.` : `${a.name} and the crew aboard returned to base.`];
  if (!lost) {
    if (struck) facts.push('The airframe took battle damage.');
    if (hurt) facts.push(`${c.specialist} was wounded and admitted to hospital.`);
    if (trouble && !abort) facts.push('The crew continued with manageable mechanical trouble under the pressing order.');
    if (!abort) facts.push(hit ? 'Photographs confirm an effective concentration.' : s.assignments[s.completed].weather === 'cloud' ? 'Cloud complicated the approach; photographs show no effective concentration.' : 'The bombing fell outside the required concentration.');
  } else if (c.replacement) facts.push(`${c.replacement} was aboard; ${c.specialist} remained ashore.`);
  const details: string[] = [], credits: NonNullable<FlightResult['credits']> = [];
  if (!lost && hit && c.lesson && aim >= forecast(s, a, { ...c, lesson: false }, p).accuracy) { credits.push('training'); details.push(`${c.pilot} used the practiced approach. The training made the difference to the bombing concentration.`); }
  if (!lost && hit && s.briefing && aim >= forecast({ ...s, briefing: false }, a, c, p).accuracy) { credits.push('briefing'); details.push('The landmarks from the earlier strike photographs made the difference to this concentration.'); }
  if (!lost && !trouble && a.certified && mechanical < forecast(s, { ...a, certified: 0 }, c, p).mechanical) { credits.push('repair'); details.push(`Finch’s certified work on ${a.name} prevented a mechanical interruption on this flight.`); }
  if (hit && p.orders === 'press' && (trouble || aim >= forecast(s, a, c, { ...p, orders: 'preserve' }).accuracy)) { credits.push('orders'); details.push('The additional commitment under the pressing order secured this effective strike.'); }
  if (!lost && !abort && p.orders === 'preserve' && !struck && combat < forecast(s, a, c, { ...p, orders: 'press' }).exposure) { credits.push('restraint'); details.push('Leaving after the first pass kept this aircraft clear of the additional combat exposure.'); }
  if (newDefect) details.push(`Finch’s inspection found ${defectText[newDefect].name.toLowerCase()}. ${defectText[newDefect].cost}`);
  if (c.lesson && !credits.includes('training') && !lost) details.push(`${c.pilot} flew with the practiced approach notes; ${hit ? 'the crew placed an effective concentration' : 'the preparation could not secure an effective strike this time'}.`);
  if (strain && !lost) details.push(`The flight added ${Math.min(3 - c.strain, strain)} operational strain. Sleep helps fatigue; an assignment off flying is needed to clear strain.`);
  if (outcome === 'home' && !struck && !trouble && hit && !details.length && !a.defect && a.condition - damage >= 75) details.push([`${c.replacement ?? c.specialist} logged the homeward fixes. Nothing required the station’s intervention.`, `${c.pilot} signed the aircraft over to Finch. Routine servicing is all that separates this return from the next assignment.`, 'The crew ate together after debrief. No exceptional action is needed for this return.'][Math.min(2, Math.floor(wear * 3))]);
  return { aircraft: a.id, crew: c.id, outcome, damage, injury: hurt, hit, fatigue, note: facts.join(' '), details, newDefect, strain, credits };
}
export function repairCandidates(s: State, p: Plan, standDown = false): Aircraft[] {
  const flying = new Set(standDown ? [] : p.flights.map(f => f.aircraft));
  const bays = Math.max(0, (standDown ? 2 : 1) + s.extraBay - s.engineeringUsed - s.jobs.filter(j => j.kind === 'repair' || (j.kind === 'inspection' && s.engineeringUsed === 0)).length);
  return s.aircraft.filter(a => !a.lost && !a.away && !flying.has(a.id) && (a.condition < 90 || a.defect || a.recovered) && !s.jobs.some(j => j.subject === a.id && ['repair', 'inspection'].includes(j.kind)))
    .sort((a, b) => (a.id === p.priority ? -1 : b.id === p.priority ? 1 : (a.condition - (a.defect ? 35 : 0)) - (b.condition - (b.defect ? 35 : 0)))).slice(0, bays);
}
export function commit(s: State, p: Plan, standDown = false): void {
  if (s.phase !== 'active' || s.active) throw new Error('There is already work on the board.');
  if (!standDown) { const errors = planErrors(s, p); if (errors.length) throw new Error(errors.join(' ')); }
  const plan = structuredClone(p);
  if (standDown) plan.flights = [];
  const task = s.assignments[s.completed];
  const results = plan.flights.map(f => flightOutcome(s, s.aircraft.find(a => a.id === f.aircraft)!, s.crews.find(c => c.id === f.crew)! , plan));
  const repairs = repairCandidates(s, plan, standDown);
  for (const a of repairs) {
    s.jobs = s.jobs.filter(j => !(j.subject === a.id && j.kind === 'service'));
    schedule(s, 'repair', s.now + 6 * HOUR, a.id);
  }
  for (const a of s.aircraft) {
    if (!a.lost && !a.away && !plan.flights.some(f => f.aircraft === a.id) && !s.jobs.some(j => j.subject === a.id && ['service', 'repair', 'inspection'].includes(j.kind))) schedule(s, 'service', s.now + 4 * HOUR, a.id);
  }
  for (const f of plan.flights) {
    // A crew cannot rest in flight; the next rest interval starts at landing.
    s.jobs = s.jobs.filter(j => !(j.subject === f.crew && j.kind === 'rest') && !(j.subject === f.aircraft && j.kind === 'service'));
    s.crews.find(c => c.id === f.crew)!.lesson = false;
    const a = s.aircraft.find(a => a.id === f.aircraft)!; a.certified = Math.max(0, a.certified - 1);
  }
  const returnsAt = s.now + (standDown ? 12 * HOUR : duration(plan));
  const hits = results.filter(r => r.hit).length;
  const summary = standDown ? 'The squadron stood down. The assignment passed to other stations; no operational contribution was made.' : `${hits} effective ${hits === 1 ? 'strike' : 'strikes'} from ${results.length} dispatched. HQ requested ${task.requested}.`;
  s.active = { slot: s.completed + 1, startedAt: s.now, returnsAt, plan, stoodDown: standDown, messages: [standDown ? 'Flying cancelled. Engineering and crew rest are under way.' : 'The package is airborne. Standing orders are in force.'],
    report: { slot: s.completed + 1, title: task.title, summary, requested: task.requested, sent: results.length, hits, results, notes: repairs.map(a => `${a.name} was allocated proper repair.`), at: returnsAt, stoodDown: standDown } };
  if (!standDown) schedule(s, 'signal', s.now + duration(plan) / 2, '', 'Group reports the formation approaching the objective. A full accounting will follow at return.');
  schedule(s, 'return', returnsAt);
  if (s.briefing) s.active.report.notes.push('The crews carried approach notes prepared from the earlier strike photographs.');
  if (s.extraBay) s.active.report.notes.push(`Group’s mobile team was available; ${repairs.length} aircraft were assigned proper work.`);
  s.briefing = false; s.extraBay = 0; s.opportunity = null;
  s.plan = structuredClone(plan);
}
function branchNextAssignment(s: State, effective: boolean): string | null {
  const next = s.assignments[s.completed + 1];
  if (!next) return null;
  if (s.completed === 5) {
    if (effective) {
      Object.assign(next, { title: 'Dispersals on the move', objective: 'Strike fighter aircraft relocated after the rail disruption.', why: 'The earlier rail strike forced a hurried move. The crews have a brief chance to catch the aircraft at temporary dispersals.', circumstance: 'window' as const, followup: 'The rail strike changed the fighter objective. A short opening favors the direct approach.' });
    } else {
      Object.assign(next, { title: 'The northern airfield', objective: 'Crater the fighter field’s service and dispersal areas.', why: 'Rail traffic continued to supply the field. Reconnaissance now marks a gun belt on the direct corridor.', circumstance: 'flak' as const, followup: 'The rail objective stayed in service. The fighter field remains supplied, and a gun belt now shapes the approach.' });
    }
    return next.followup!;
  }
  if (s.completed === 9) {
    if (effective) {
      Object.assign(next, { title: 'The western junction: open corridor', objective: 'Block the rail junction feeding the inland factories.', why: 'The fighter repair raid has opened a brief chance to strike before defenses regroup.', circumstance: 'window' as const, followup: 'The fighter raid opened a short bombing window at the western junction. The direct route reaches it sooner.' });
    } else {
      Object.assign(next, { title: 'The western junction: under escort', objective: 'Block the rail junction feeding the inland factories.', why: 'Fighter repairs continued. Group has assigned escorts to the direct corridor.', circumstance: 'escort' as const, followup: 'The fighter repair objective stayed in service. Escorts will cover the direct corridor at the western junction.' });
    }
    return next.followup!;
  }
  return null;
}
function finishOperation(s: State): void {
  const op = s.active;
  if (!op) return;
  const report = op.report;
  for (const r of report.results) {
    const a = s.aircraft.find(a => a.id === r.aircraft)!, c = s.crews.find(c => c.id === r.crew)!;
    a.sorties++; c.sorties++;
    a.history.push(`Assignment ${op.slot}: ${r.note}`); c.history.push(`Assignment ${op.slot}, ${a.name}: ${r.note}`);
    if (r.outcome === 'lost') {
      a.lost = true; c.lost = true; c.returned = false;
      // A substitute aboard does not make the original specialist ashore a casualty.
      s.jobs = s.jobs.filter(j => j.subject !== a.id && (j.subject !== c.id || (j.kind === 'medical' && !!c.replacement)));
      continue;
    }
    a.condition = clamp(a.condition - r.damage);
    if (r.newDefect) { a.defect = true; a.defectType = r.newDefect; a.history.push(`Assignment ${op.slot}: ${defectText[r.newDefect].name} found after return.`); }
    c.strain = Math.min(3, c.strain + (r.strain ?? 0));
    c.fatigue = clamp(c.fatigue + r.fatigue);
    const oldExperience = c.experience;
    if (r.outcome !== 'abort') c.experience = Math.min(8, c.experience + .5);
    if (oldExperience < 6 && c.experience >= 6) { const news = `${c.pilot}’s crew is now rated veteran. Their completed assignments have earned that place in the roster.`; report.notes.push(news); c.history.push(news); }
    if (c.replacement) {
      c.replacementSorties++;
      if (c.replacementSorties === 3) { const news = `${c.replacement} has flown three sorties with ${c.pilot}; the temporary arrangement no longer carries a bombing penalty.`; report.notes.push(news); c.history.push(news); }
    }
    if (r.hit && !s.reports.some(old => old.results.some(f => f.crew === c.id && f.hit))) report.notes.push(`${c.pilot}’s first confirmed concentration of this tour is entered in the station book.`);
    if (r.injury && !c.injury && !c.replacement) {
      c.injury = true; schedule(s, 'medical', s.now + 36 * HOUR, c.id);
    }
    if (r.outcome === 'divert') { a.away = true; schedule(s, 'recovery', s.now + 30 * HOUR, a.id, c.id); }
    resting(s, c);
  }
  for (const c of s.crews.filter(c => !c.lost && !op.plan.flights.some(f => f.crew === c.id))) {
    if (c.leaveThrough === op.slot) {
      c.strain = 0; c.fatigue = 0;
      const news = `${c.pilot}’s promised assignment off is complete. The medical officer records no remaining operational strain.`;
      c.history.push(news); report.notes.push(news); note(s, news);
    } else if (c.strain > 0) {
      c.strain--; c.fatigue = Math.max(c.strain * 12, c.fatigue - 12);
      report.notes.push(`${c.pilot} sat this assignment out; one level of strain has cleared.`);
    }
    resting(s, c);
  }
  s.suppression = 0;
  const task = s.assignments[s.completed];
  const hasNext = s.completed < TOUR_LENGTH - 1;
  let supportGained = 0;
  if (report.hits >= Math.ceil(task.requested * .65)) {
    if (task.effect === 'fighters' || task.effect === 'rail') {
      s.suppression = hasNext ? task.effect === 'fighters' ? 1.5 : .75 : 0;
      report.notes.push(hasNext ? task.effect === 'fighters' ? 'Fighter dispersals hit. Less interception expected on the next assignment.' : 'Rail traffic interrupted. The next assignment faces reduced opposition.' : 'Rail traffic interrupted on the final assignment.');
      if (task.effect === 'rail' && s.completed < 13) s.opportunity = { kind: 'photos', source: task.title, slot: s.completed + 1 };
    } else {
      supportGained = Math.min(1, 5 - s.support); s.support += supportGained;
      report.notes.push(`Transport released by HQ: ${supportGained} support added for specialists and recovery.`);
      if (s.completed < 13) s.opportunity = { kind: 'transport', source: task.title, slot: s.completed + 1 };
    }
  } else if (!op.stoodDown) report.notes.push('The objective remains in service. No relief in opposition or additional support is expected.');
  if (s.opportunity) report.notes.push(s.opportunity.kind === 'photos' ? `Intelligence has useful approach and dispersal photographs from ${task.title}. Their use is on the next station agenda.` : 'Group offers a mobile workshop or a further transport allocation for the next commitment.');
  if (report.sent < report.requested && !op.stoodDown) report.notes.push(`The reduced package left ${report.requested - report.sent} requested aircraft unfilled. HQ records the contribution actually made.`);
  const needed = Math.ceil(task.requested * .65);
  const effective = !op.stoodDown && report.hits >= needed;
  const targetName = task.title[0].toLowerCase() + task.title.slice(1);
  const assessment = op.stoodDown ? 'No strike photographs were taken. The objective remains in service.'
    : !effective ? `Photographs of ${targetName} show ${report.hits} confirmed concentration${report.hits === 1 ? '' : 's'}; ${needed} were needed to disrupt the objective. It remains in service.`
    : task.effect === 'fighters' ? `Photographs show enough concentrations at ${targetName} to disrupt fighter operations. Less interception is expected on the next assignment.`
    : task.effect === 'rail' ? hasNext ? `Photographs show confirmed hits at ${targetName}. Rail traffic is disrupted; the next assignment faces less opposition.` : `Photographs show confirmed hits at ${targetName}. Rail traffic is disrupted on the final assignment.`
    : `Photographs show confirmed hits at ${targetName}. Supply traffic is disrupted, and Group has released transport support.`;
  const next: string[] = [];
  if (effective && task.effect !== 'supplies' && hasNext) next.push('Reduced opposition applies to the next assignment only.');
  if (effective && task.effect === 'supplies') next.push(supportGained ? 'One support was added for station decisions.' : 'Support is already at the station limit of five.');
  if (s.opportunity) next.push(s.opportunity.kind === 'photos' ? 'Decide how to use the photographs before the next commitment.' : 'Choose the mobile repair team or extra support before the next commitment.');
  const diverted = report.results.filter(r => r.outcome === 'divert').map(r => s.aircraft.find(a => a.id === r.aircraft)!.name);
  const grounded = report.results.filter(r => r.outcome !== 'lost').map(r => s.aircraft.find(a => a.id === r.aircraft)!).filter(a => !a.away && a.condition < 55).map(a => a.name);
  const faulted = report.results.filter(r => r.outcome !== 'lost').map(r => s.aircraft.find(a => a.id === r.aircraft)!).filter(a => !a.away && a.condition >= 55 && a.defect).map(a => a.name);
  const injured = report.results.filter(r => r.injury).map(r => s.crews.find(c => c.id === r.crew)!.specialist);
  const strained = report.results.filter(r => r.outcome !== 'lost').map(r => s.crews.find(c => c.id === r.crew)!).filter(c => c.strain >= 2 || c.fatigue >= 65).map(c => c.pilot);
  const losses = report.results.filter(r => r.outcome === 'lost').map(r => s.aircraft.find(a => a.id === r.aircraft)!.name);
  if (diverted.length) next.push(`${diverted.join(', ')} ${diverted.length === 1 ? 'is' : 'are'} at a forward field; recovery is scheduled.`);
  if (grounded.length) next.push(`${grounded.join(', ')} ${grounded.length === 1 ? 'needs' : 'need'} repair before flying again.`);
  if (faulted.length) next.push(`${faulted.join(', ')} ${faulted.length === 1 ? 'has' : 'have'} a persistent fault; consider proper work before another flight.`);
  if (injured.length) next.push(`${injured.join(', ')} ${injured.length === 1 ? 'is' : 'are'} in hospital; check the station decisions for crew options.`);
  if (strained.length) next.push(`${strained.join(', ')} ${strained.length === 1 ? 'is' : 'are'} tired or strained; consider rotating the next crew package.`);
  if (losses.length) next.push(`${losses.join(', ')} ${losses.length === 1 ? 'was' : 'were'} lost; check whether Group can provide a replacement.`);
  const changedBrief = branchNextAssignment(s, effective);
  if (changedBrief) next.push(changedBrief);
  if (!hasNext) next.push('Outstanding recovery, repairs, and medical care will finish before the tour closes.');
  if (!next.length) next.push('No exceptional station action is required. Review the next briefing and the crew roster.');
  report.debrief = { assessment, next };
  s.contribution += report.hits; s.requested += report.requested;
  s.completed++; s.engineeringUsed = 0; s.reports.push(report); s.active = null;
  if (s.completed === TOUR_LENGTH) { s.phase = 'closing'; s.ending = 'tour'; }
  s.plan = proposePlan(s);
  s.planEdited = false;
}
function certify(a: Aircraft, amount: number): void { a.condition = clamp(a.condition + amount); a.defect = false; a.defectType = null; a.recovered = false; a.certified = 2; }
function applyJob(s: State, j: State['jobs'][number]): void {
  const a = s.aircraft.find(a => a.id === j.subject), c = s.crews.find(c => c.id === j.subject);
  switch (j.kind) {
    case 'signal': if (s.active) s.active.messages.push(j.text!); break;
    case 'return': finishOperation(s); break;
    case 'repair': case 'inspection': if (a && !a.lost) {
      const finding = a.defect ? defectText[a.defectType ?? 'oil'].name.toLowerCase() : a.recovered ? 'unverified field work' : 'worn systems';
      certify(a, j.kind === 'repair' ? 38 : 12);
      const news = `${a.name}: ${j.kind === 'repair' ? 'proper repair' : 'specialist inspection'} complete. Finch signed off the ${finding}; condition ${a.condition}. Certified work protects the next two flights.`;
      a.history.push(news); note(s, news);
    } break;
    case 'service': if (a && !a.lost && !a.away) a.condition = Math.max(a.condition, Math.min(90, a.condition + 4)); break;
    case 'rest': if (c && !c.lost) { c.fatigue = Math.max(c.strain * 12, c.fatigue - 12); resting(s, c); } break;
    case 'medical': if (c) {
      c.injury = false; c.returned = !c.lost && !!c.replacement;
      const news = c.lost ? `${c.specialist} is cleared by the medical officer. The original specialist survived ashore when ${c.pilot}’s flying crew was lost, and is now available for reassignment by Group.` : `${c.specialist} is cleared for duty at the station${c.replacement ? `; ${c.replacement} still holds the flying place with ${c.pilot}` : ''}.`;
      c.history.push(news); note(s, news);
    } break;
    case 'recovery': if (a && !a.lost) {
      a.away = false; a.recovered = !j.overhaul; if (j.overhaul) certify(a, 30);
      const crew = s.crews.find(c => c.id === j.text);
      const news = `${a.name}${crew ? ` and ${crew.pilot}’s crew` : ''} returned from the forward field. ${j.overhaul ? 'The extra workshop time restored the aircraft and cleared its faults.' : 'Field checks are complete; Finch has not yet certified the work.'}`;
      a.history.push(news); note(s, news);
    } break;
    case 'training': if (c && !c.lost) { c.experience = Math.min(8, c.experience + Number(j.text)); if (Number(j.text) > 0) c.lesson = true; const news = `${c.pilot}: ${Number(j.text) > 0 ? 'approach training complete; practiced notes are ready for the next flight' : 'instruction complete; the crew is released back to operations'}.`; c.history.push(news); note(s, news); } break;
    case 'reinforcement': {
      const n = s.aircraft.length;
      s.aircraft.push({ id: `a${n}`, name: `Second Wind ${n - 3}`, trait: 'economical', condition: 90, defect: false, defectType: null, certified: 0, recovered: false, lost: false, away: false, sorties: 0, history: ['Ferried in as a replacement.'] });
      s.crews.push({ id: `c${s.crews.length}`, pilot: `Lt. ${['Harris', 'Walker', 'Brooks', 'Adams'][n % 4]}`, specialist: ['Sgt. Foster', 'Sgt. Carter', 'Sgt. Hayes', 'Sgt. Phelps'][n % 4], strength: 'engineering', experience: 1, fatigue: 0, lost: false, injury: false, replacement: null, returned: false, sorties: 0, strain: 0, leaveThrough: 0, lesson: false, replacementSorties: 0, history: ['Arrived with the replacement aircraft.'] });
      note(s, 'The ferry aircraft and its new crew have arrived.'); break;
    }
  }
}
function checkEnding(s: State): void {
  // Repair, fatigue, injury and diversion never constitute permanent collapse.
  if (s.phase === 'active' && !s.active && s.aircraft.every(a => a.lost) && s.support < 2 && !s.jobs.some(j => j.kind === 'reinforcement')) { s.phase = 'closing'; s.ending = 'losses'; }
  if (s.phase === 'closing' && !s.jobs.length && !s.active) {
    for (const c of s.crews) if (c.returned && c.replacement) { c.replacement = null; c.returned = false; }
    s.phase = 'ended';
  }
}
export function advance(s: State, to: number): void {
  if (!Number.isFinite(to) || to < s.now) return;
  // Drain a durable priority queue. Work created by an event begins at that event's time.
  while (true) {
    s.jobs.sort((a, b) => a.at - b.at || a.id - b.id);
    if (!s.jobs.length || s.jobs[0].at > to) break;
    const job = s.jobs.shift()!;
    s.now = job.at;
    applyJob(s, job);
    checkEnding(s);
  }
  s.now = to;
  checkEnding(s);
  if (!s.active && s.phase === 'active' && !s.planEdited) s.plan = proposePlan(s);
}
export function nextMilestone(s: State): number | null {
  return s.jobs.length ? Math.min(...s.jobs.map(j => j.at)) : null;
}
export function choose(s: State, key: string, choiceId: string): void {
  const event = stationEvents(s).find(e => e.key === key);
  const choice = event?.choices.find(c => c.id === choiceId);
  if (!event || !choice || choice.disabled) throw new Error('That station decision is no longer available.');
  s.planEdited = true;
  const a = s.aircraft.find(a => a.id === event.subject), c = s.crews.find(c => c.id === event.subject);
  switch (event.kind) {
    case 'rush': if (choiceId === 'rush') { a!.condition = 68; a!.defect = true; a!.defectType = 'oil'; a!.certified = 0; s.engineeringUsed++; a!.history.push(`Before assignment ${s.completed + 1}: field patch authorized; an oil-pressure fault remains until proper repair.`); } else { s.plan.priority = a!.id; s.plan.flights = s.plan.flights.filter(f => f.aircraft !== a!.id); } break;
    case 'replacement': if (choiceId === 'assign') { s.support--; const names = ['Sgt. Walsh', 'Sgt. Reed', 'Sgt. Hughes', 'Sgt. Grant', 'Sgt. Nolan', 'Sgt. Burke', 'Sgt. Webb', 'Sgt. Hale']; c!.replacement = names.find(name => !s.crews.some(crew => crew.specialist === name || crew.replacement === name)) ?? `Sgt. Lane`; c!.replacementSorties = 0; c!.history.push(`${c!.replacement} temporarily replaced ${c!.specialist}.`); } break;
    case 'returning': if (choiceId === 'restore') { s.support = Math.min(5, s.support + 1); c!.experience = Math.min(8, c!.experience + 1); c!.history.push(`${c!.specialist} reclaimed the flying place; ${c!.replacement} returned to Group’s pool.`); } else { c!.history.push(`${c!.specialist} transferred to training; ${c!.replacement} stayed with the crew.`); c!.specialist = c!.replacement!; c!.strain = Math.max(0, c!.strain - 1); c!.fatigue = Math.max(c!.strain * 12, c!.fatigue - 20); } c!.replacement = null; c!.returned = false; c!.replacementSorties = 0; break;
    case 'recovery': {
      const job = s.jobs.find(j => j.kind === 'recovery' && j.subject === a!.id);
      if (job && choiceId === 'expedite') { s.support--; job.at = Math.max(s.now + HOUR, job.at - 18 * HOUR); }
      if (job && choiceId === 'overhaul') { s.support--; job.at += 6 * HOUR; job.overhaul = true; }
    } break;
    case 'inspection':
      if (choiceId === 'bench') {
        s.support--; s.engineeringUsed++; schedule(s, 'inspection', s.now + 3 * HOUR, a!.id);
        s.jobs = s.jobs.filter(j => !(j.kind === 'service' && j.subject === a!.id));
        s.plan.flights = s.plan.flights.filter(f => f.aircraft !== a!.id);
      } else if (choiceId === 'queue') { s.plan.priority = a!.id; s.plan.flights = s.plan.flights.filter(f => f.aircraft !== a!.id); }
      break;
    case 'strain':
      if (choiceId === 'leave') { c!.leaveThrough = s.completed + 1; s.plan.flights = s.plan.flights.filter(f => f.crew !== c!.id); }
      if (choiceId === 'debrief') { s.support--; c!.strain--; c!.fatigue = Math.max(c!.strain * 12, c!.fatigue - 12); }
      break;
    case 'opportunity':
      if (choiceId === 'brief') s.briefing = true;
      if (choiceId === 'share') s.suppression += .5;
      if (choiceId === 'bay') s.extraBay++;
      if (choiceId === 'support') s.support = Math.min(5, s.support + 1);
      s.opportunity = null;
      break;
    case 'reinforcement': if (choiceId === 'request') { s.support -= 2; schedule(s, 'reinforcement', s.now + 12 * HOUR); } break;
    case 'mentor': if (choiceId === 'train') {
      s.support--;
      const veteran = s.crews.find(c => crewAvailable(s, c) && !c.injury && c.experience >= 6 && c.fatigue < 50)!;
      schedule(s, 'training', s.now + 6 * HOUR, c!.id, '2'); schedule(s, 'training', s.now + 6 * HOUR, veteran.id, '0');
      s.plan.flights = s.plan.flights.filter(f => f.crew !== c!.id && f.crew !== veteran.id);
    } break;
  }
  const text = `${event.title} — ${choice.label}.`;
  s.decisions.push({ key, slot: s.completed, text }); note(s, text);
  if (c) c.history.push(`Before assignment ${s.completed + 1}: ${text}`);
  if (a) a.history.push(`Before assignment ${s.completed + 1}: ${text}`);
}
export function endingText(s: State): string {
  const fraction = s.contribution / Math.max(1, s.requested);
  return s.ending === 'losses' ? 'The squadron is withdrawn. No aircraft remain and Group has no further support to offer.' : fraction >= .65 ? 'A tour well carried. Your squadron made a substantial contribution, and the relief crews inherit its hard-won experience.' : fraction >= .4 ? 'The squadron held its place. There were gaps in the contribution, but the work you completed mattered.' : 'A difficult tour. Much of the requested work fell to other stations. The people brought home still have a future beyond this airfield.';
}
export function tourMemories(s: State): string[] {
  const lines: string[] = [];
  const surviving = s.crews.filter(c => !c.lost).sort((a, b) => b.sorties - a.sorties);
  for (const c of s.crews.filter(c => c.lost && c.replacement)) lines.push(`${c.specialist} survived ashore${c.injury ? ' and remains in medical care' : ''}. ${c.replacement} was flying with ${c.pilot} when that crew was lost.`);
  if (surviving[0]?.sorties) lines.push(`${surviving[0].pilot} brings ${surviving[0].sorties} sorties home. ${surviving[0].specialist} is on the surviving crew roll${surviving[0].replacement ? `, with ${surviving[0].replacement} still filling the flying place` : ''}.`);
  const trained = s.reports.flatMap(r => r.results).filter(r => r.credits?.includes('training'));
  if (trained.length) lines.push(`The plotting-table sessions changed ${trained.length} bombing ${trained.length === 1 ? 'result' : 'results'}. ${s.crews.find(c => c.id === trained[0].crew)?.pilot} flew the first of those approaches.`);
  const repairs = s.reports.flatMap(r => r.results).filter(r => r.credits?.includes('repair'));
  if (repairs.length) lines.push(`Finch’s certified work prevented ${repairs.length} mechanical interruptions. ${s.aircraft.find(a => a.id === repairs[0].aircraft)?.name} was the first aircraft to benefit.`);
  const diversions = s.reports.flatMap(r => r.results).filter(r => r.outcome === 'divert');
  if (diversions.length) lines.push(`${diversions.length} flights landed away from base. ${s.jobs.some(j => j.kind === 'recovery') ? 'A recovery party is still outstanding.' : 'All of those aircraft were recovered; their later operations remain in the station record.'}`);
  const leave = s.crews.filter(c => c.history.some(line => line.includes('promised assignment off is complete')));
  if (leave.length) lines.push(`${leave.map(c => c.pilot).join(', ')} received the assignment off that you promised. Those decisions belong alongside the flying record.`);
  const patch = s.decisions.filter(d => d.key.startsWith('rush-') && d.text.includes('field patch'));
  if (patch.length) lines.push(`${patch.length} field ${patch.length === 1 ? 'patch was' : 'patches were'} authorized. ${s.aircraft.filter(a => !a.lost && a.defect).length} surviving aircraft still carry unresolved faults.`);
  const restraint = s.reports.flatMap(r => r.results).filter(r => r.credits?.includes('restraint')).length;
  if (restraint) lines.push(`The order to leave after one pass avoided additional combat exposure on ${restraint} flights.`);
  if (!s.contribution) lines.push('No effective strikes were recorded. Preservation alone did not meet the station’s assignment.');
  return lines;
}
