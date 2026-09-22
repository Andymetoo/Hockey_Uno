import type { Aircraft, Crew, Plan, Report, State } from './types.ts';
import { advance, aircraftAvailable, aircraftIssue, choose, commit, createCampaign, crewAvailable, crewIssue, duration, endingText, flightFatigue, forecast, HOUR, nextMilestone, planErrors, proposePlan, repairCandidates, tourMemories } from './game.ts';
import { circumstances, defectText, stationEvents, strengthText, traitText } from './content.ts';
import { createStorage, decode } from './persistence.ts';

const esc = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const hours = (ms: number) => ms <= 0 ? 'due now' : ms < HOUR ? `${Math.ceil(ms / 60_000)} min` : `${Math.ceil(ms / HOUR)} hr`;
const percent = (n: number) => `${Math.round(n * 100)}%`;
const experience = (c: Crew) => c.experience >= 6 ? 'Veteran' : c.experience >= 3 ? 'Seasoned' : 'Novice';
const badge = (text: string, tone = '') => `<span class="badge ${tone}">${esc(text)}</span>`;
const button = (action: string, label: string, cls = '', attrs = '') => `<button type="button" data-action="${action}" class="${cls}" ${attrs}>${label}</button>`;

export function mountBomberCommand(root: HTMLElement): void {
  let store: ReturnType<typeof createStorage>;
  let s: State;
  let message = '', error = '', blocked = false;
  let tab: 'today' | 'squadron' | 'tour' = 'today';
  let modal: 'dispatch' | 'standdown' | 'new' | null = null;
  let returnFocus = '';
  const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
  try {
    store = createStorage(localStorage);
    const loaded = store.load(); message = loaded.message; blocked = loaded.blocked;
    s = loaded.state ?? createCampaign(seed(), Date.now());
    if (!blocked) { advance(s, Date.now() + s.offset); store.save(s); }
  } catch (e) {
    root.innerHTML = `<main class="paper"><p class="eyebrow">Station records unavailable</p><h1>We couldn’t open the safe.</h1><p>${esc(e instanceof Error ? e.message : e)}</p><p>Allow this site to use browser storage, then reload. Your existing records have not been deliberately removed.</p>${button('reload', 'Reload page')}</main>`;
    root.querySelector('button')?.addEventListener('click', () => location.reload()); return;
  }
  function transact(action: (draft: State) => void): boolean {
    if (blocked) return false;
    const draft = structuredClone(s);
    try { advance(draft, Math.max(draft.now, Date.now() + draft.offset)); action(draft); store.save(draft); s = draft; error = ''; return true; }
    catch (e) { error = e instanceof Error ? e.message : 'The order could not be saved.'; return false; }
  }
  function jobText(subject: string): string {
    return s.jobs.filter(j => j.subject === subject && j.kind !== 'rest' && j.kind !== 'service').map(j => `${({ repair: 'Proper repair', inspection: 'Specialist inspection', medical: 'Medical clearance', recovery: 'Recovery', training: 'Training' } as Record<string, string>)[j.kind] ?? 'Station work'}: ${hours(j.at - s.now)}`).join(' · ');
  }
  function crewOptions(current: string): string {
    return s.crews.filter(c => !c.lost).map(c => `<option value="${c.id}" ${c.id === current ? 'selected' : ''} ${!crewAvailable(s, c) ? 'disabled' : ''}>${esc(c.pilot)} · ${experience(c)} · ${c.fatigue} fatigue${!crewAvailable(s, c) ? ' · unavailable' : ''}</option>`).join('');
  }
  function aircraftCard(a: Aircraft, selectable = false): string {
    const flight = s.plan.flights.find(f => f.aircraft === a.id);
    const c = s.crews.find(c => c.id === flight?.crew);
    const available = aircraftAvailable(s, a);
    return `<article class="aircraft ${flight && selectable ? 'selected' : ''} ${a.lost ? 'lost' : ''}">
      <div class="aircraft-heading"><div><span class="eyebrow">B-17 Flying Fortress</span><h3>${esc(a.name)}</h3></div>${selectable ? `<input aria-label="Assign ${esc(a.name)}" type="checkbox" data-aircraft="${a.id}" ${flight ? 'checked' : ''} ${!available ? 'disabled' : ''}>` : badge(a.lost ? 'Lost' : a.away ? 'Away' : `${a.sorties} sorties`)}</div>
      <p class="issue ${a.defect || a.condition < 55 ? 'caution' : ''}">${esc(aircraftIssue(s, a))}</p>
      ${a.defect ? `<p class="small">${defectText[a.defectType ?? 'oil'].cost}</p>` : ''}
      <div class="condition"><span>Condition ${a.condition}</span><meter aria-label="${esc(a.name)} condition" min="0" max="100" low="55" high="75" optimum="100" value="${a.condition}">${a.condition}</meter></div>
      <p class="small">${traitText[a.trait]}</p>${jobText(a.id) ? `<p class="work-note">${esc(jobText(a.id))}</p>` : ''}
      ${selectable && flight ? `<label class="crew-select">Assigned crew<select data-crew="${a.id}" aria-label="Crew for ${esc(a.name)}">${crewOptions(flight.crew)}</select></label>${c ? `<p class="small">${esc(strengthText[c.strength])}</p><p class="issue ${c.fatigue >= 65 ? 'caution' : ''}">${esc(crewIssue(s, c))}</p>` : ''}` : ''}
      ${!selectable ? `<details data-detail="aircraft-${a.id}"><summary>Aircraft record</summary><ol class="history">${a.history.map(t => `<li>${esc(t)}</li>`).join('')}</ol></details>` : ''}
    </article>`;
  }
  function crewCard(c: Crew): string {
    return `<article class="aircraft ${c.lost ? 'lost' : ''}"><div class="aircraft-heading"><h3>${esc(c.pilot)}’s crew</h3>${badge(experience(c))}</div><p class="issue">${esc(crewIssue(s, c))}</p><p>${esc(strengthText[c.strength])}</p><p class="small">Fatigue ${c.fatigue}/100 · Strain ${c.strain}/3 · ${c.sorties} sorties · Experience ${c.experience}/8${c.lesson ? " · Approach notes ready for the next flight" : ""}</p>${jobText(c.id) ? `<p class="work-note">${esc(jobText(c.id))}</p>` : ''}<details data-detail="crew-${c.id}"><summary>Crew record &amp; personnel</summary><p>The ten seats are filled automatically. ${esc(c.specialist)} is the crew’s radio operator${c.replacement ? `; ${esc(c.replacement)} is filling that seat` : ''}.</p><ol class="history">${c.history.map(t => `<li>${esc(t)}</li>`).join('')}</ol></details></article>`;
  }
  function report(r: Report, compact = false): string {
    const home = r.results.filter(f => f.outcome === 'home' || f.outcome === 'abort').length;
    const away = r.results.filter(f => f.outcome === 'divert').length;
    const lost = r.results.filter(f => f.outcome === 'lost').length;
    const resultRows = r.results.map((f, i) => `<li><strong>${esc(s.aircraft.find(a => a.id === f.aircraft)?.name)}</strong><span>${esc(s.crews.find(c => c.id === f.crew)?.pilot)} · ${esc(f.note)}</span>${f.outcome !== 'lost' ? `<small>${f.hit ? 'Effective strike' : 'No effective strike'} · ${f.damage} condition lost · ${f.fatigue} fatigue added${f.injury ? " · specialist injured" : ""}</small>` : ''}${f.details?.length ? `<details data-detail="flight-${r.slot}-${i}"><summary>Crew debrief &amp; consequences</summary>${f.details.map(line => `<p>${esc(line)}</p>`).join('')}</details>` : ''}</li>`).join('');
    const body = `<p class="report-summary">${esc(r.summary)}</p>${r.sent ? `<div class="accounting"><span><b>${home}</b> returned to base</span><span><b>${away}</b> landed elsewhere</span><span class="${lost ? 'caution' : ''}"><b>${lost}</b> aircraft &amp; crews lost</span></div>` : ''}<ul class="flight-results">${resultRows}</ul>${r.notes.map(n => `<p class="report-note">${esc(n)}</p>`).join('')}`;
    return compact ? `<details class="record" data-detail="report-${r.slot}"><summary><span>Assignment ${String(r.slot).padStart(2, '0')} · ${esc(r.title)}</span><span>${r.stoodDown ? 'Stood down' : `${r.hits}/${r.requested} effective`}</span></summary>${body}</details>` : `<section class="paper report"><p class="eyebrow">Return report · Assignment ${r.slot}</p><h2>${esc(r.title)}</h2>${body}</section>`;
  }
  function workList(): string {
    const jobs = s.jobs.filter(j => !['signal', 'return', 'rest', 'service'].includes(j.kind)).sort((a, b) => a.at - b.at || a.id - b.id);
    return jobs.length ? `<ul class="work-list">${jobs.map(j => `<li><span>${esc(s.aircraft.find(a => a.id === j.subject)?.name ?? s.crews.find(c => c.id === j.subject)?.pilot ?? 'Group transport')} · ${esc(({ repair: 'proper repair', inspection: 'specialist inspection', medical: 'medical clearance', recovery: 'recovery party', reinforcement: 'replacement delivery', training: 'approach training' } as Record<string, string>)[j.kind])}</span><b>${hours(j.at - s.now)}</b></li>`).join('')}</ul>` : '<p class="small">No specialist work outstanding. Off-duty crews rest automatically.</p>';
  }
  function activeView(): string {
    const op = s.active!;
    return `<section class="paper underway"><p class="eyebrow">${op.stoodDown ? 'Station stand-down' : 'Operation in progress'} · Assignment ${op.slot} of 14</p><h1>${esc(op.report.title)}</h1><div class="dispatch-stamp">${op.stoodDown ? 'STOOD DOWN' : 'DISPATCHED'}</div><p class="lead">${op.stoodDown ? 'The station is at work.' : `${op.plan.flights.length} aircraft away. The crews have their orders.`}</p><ol class="signals">${op.messages.map(m => `<li>${esc(m)}</li>`).join('')}</ol><div class="safe"><strong>Your orders are saved. It is safe to leave.</strong><p>The ${op.stoodDown ? 'station report' : 'return report'} is due in <span data-countdown="${op.returnsAt}">${hours(op.returnsAt - s.now)}</span>. No airborne decisions need your attendance. The next assignment waits for you.</p></div><div class="actions">${button('skip-return', op.stoodDown ? 'Advance to station report' : 'Advance to return report', 'primary')}<span class="small">Accelerated play · the same operation, resolved sooner</span></div><details data-detail="committed"><summary>Committed package &amp; standing orders</summary><p>${op.plan.route === 'direct' ? 'Direct approach' : 'Coastal dogleg'} · ${op.plan.orders === 'preserve' ? 'Bring the aircraft home' : 'Press the attack'}</p><ul>${op.plan.flights.map(f => `<li>${esc(s.aircraft.find(a => a.id === f.aircraft)?.name)} · ${esc(s.crews.find(c => c.id === f.crew)?.pilot)}</li>`).join('')}</ul></details></section><section class="paper"><p class="eyebrow">Meanwhile, on the station</p><h2>Work continues</h2>${workList()}</section>`;
  }
  function policies(): string {
    return `<details class="orders" data-detail="orders" ${s.completed === 0 ? 'open' : ''}><summary>Standing orders · ${s.plan.route === 'direct' ? 'Direct approach' : 'Coastal dogleg'} · ${s.plan.orders === 'preserve' ? 'Bring the aircraft home' : 'Press the attack'}</summary><div class="policy-grid"><fieldset><legend>Approach</legend>${[
      ['direct', 'Direct · 4 hours', 'Shorter flight, less fatigue. More exposure to fighters.'],
      ['dogleg', 'Coastal dogleg · 6 hours', 'Less fighter exposure. Adds 14 fatigue and increases diversion risk through fuel pressure.'],
    ].map(([id, title, detail]) => `<label class="policy"><input type="radio" name="route" value="${id}" ${s.plan.route === id ? 'checked' : ''}><span><strong>${title}</strong><small>${detail}</small></span></label>`).join('')}</fieldset><fieldset><legend>Standing orders</legend>${[
      ['preserve', 'Bring the aircraft home', 'Turn back with mechanical trouble. One bombing pass; less combat exposure.'],
      ['press', 'Press the attack', 'Continue with manageable faults and make another pass if needed. Better strike chance; more damage, losses and fatigue.'],
    ].map(([id, title, detail]) => `<label class="policy"><input type="radio" name="orders" value="${id}" ${s.plan.orders === id ? 'checked' : ''}><span><strong>${title}</strong><small>${detail}</small></span></label>`).join('')}</fieldset></div></details>`;
  }
  function repairSummary(p: Plan, standDown = false): string {
    const repairs = repairCandidates(s, p, standDown);
    return repairs.length ? `Proper repair: ${repairs.map(a => a.name).join(', ')}. Work starts at commitment and finishes in six hours, restoring up to 38 condition, clearing faults and certifying the next two flights.` : s.engineeringUsed ? 'Engineering work already authorized uses this assignment’s available allocation. No further proper repair is included in this package.' : 'No proper repair allocated to this package. Aircraft on operations cannot use the repair bay.';
  }
  function planningView(): string {
    const task = s.assignments[s.completed];
    const upcoming = s.assignments[s.completed + 1];
    const events = stationEvents(s);
    const errors = planErrors(s, s.plan);
    const last = s.reports.at(-1);
    return `${last ? report(last) : `<section class="welcome"><p class="eyebrow">Your posting</p><p>${esc(s.circumstance)}</p><p>Four aircraft. Fourteen assignments. Your job is to make the contribution and bring the squadron through.</p></section>`}
      <section class="paper assignment"><div class="section-head"><p class="eyebrow">Headquarters · Assignment ${s.completed + 1} of 14</p>${badge(s.completed >= 11 ? 'Final stretch' : s.completed < 3 ? 'Opening operations' : 'The continuing effort')}</div><h1>${esc(task.title)}</h1><p class="lead">${esc(task.objective)}</p><div class="brief-facts">${badge(`${task.requested} aircraft requested`)}${badge(['', 'Light opposition', 'Moderate opposition', 'Heavy opposition', 'Very heavy opposition'][task.hazard], task.hazard >= 3 ? 'warning' : '')}${badge(task.weather === 'cloud' ? 'Cloud over target' : task.weather === 'crosswind' ? 'Crosswinds on return' : 'Clear conditions')}</div><p>${esc(task.why)}</p><aside class="mission-circumstance"><strong>${circumstances[task.circumstance].title}</strong><p>${circumstances[task.circumstance].brief}</p></aside>${s.briefing ? `<p class="good">Approach notes from the earlier photographs are ready for this package.</p>` : ""}${s.extraBay ? `<p class="good">Group’s mobile engineering team adds one repair at this commitment.</p>` : ""}${s.suppression ? `<p class="good">Earlier operational work is reducing opposition on this assignment.</p>` : ''}${task.weather !== 'clear' ? `<p class="small">${task.weather === 'cloud' ? 'Cloud makes an effective strike less likely. Navigation experience and an extra pass can help.' : 'Crosswinds increase the chance of landing at another field, particularly after the longer approach.'}</p>` : ''}${upcoming ? `<aside class="next-demand"><strong>Looking ahead</strong> ${esc(upcoming.title)} · ${upcoming.requested} aircraft requested · ${upcoming.hazard >= 3 ? 'heavy' : 'lighter'} opposition. ${circumstances[upcoming.circumstance].title}.</aside>` : '<aside class="next-demand">This is the final assignment. Outstanding repairs, medical care and recovery will finish before the tour closes.</aside>'}</section>
      <section class="station-decisions"><div class="section-head"><h2>On the station</h2><span class="small">${s.support} support available</span></div>${s.notices.length ? `<details class="station-updates" data-detail="today-updates"><summary>Latest station entry: ${esc(s.notices.at(-1))}</summary><ul class="history">${s.notices.slice(-4).map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}${events.length ? events.map(e => `<article class="decision"><p class="eyebrow">${['rush', 'inspection'].includes(e.kind) ? 'Engineering officer' : ['recovery', 'opportunity'].includes(e.kind) ? 'Operations officer' : 'Personnel officer'}</p><h3>${esc(e.title)}</h3><p>${esc(e.body)}</p><div class="choices">${e.choices.map(c => `<button type="button" data-decision="${e.key}" data-choice="${c.id}" ${c.disabled ? 'disabled' : ''}><strong>${esc(c.label)}</strong><small>${esc(c.detail)}</small></button>`).join('')}</div></article>`).join('') : `<p class="quiet">${s.decisions.filter(d => d.slot === s.completed).length >= 2 ? "Today’s two station decisions are entered. Remaining optional matters can wait for another assignment." : "No exceptional decisions today. Finch will handle routine service; off-duty crews will rest."}</p>`}<p class="small">You may leave these with the staff: no patch or support is authorized by default, and scheduled recovery continues.</p></section>
      <section class="paper"><div class="section-head"><div><p class="eyebrow">Operations officer’s proposal</p><h2>Today’s package</h2></div>${button('propose', 'Use staff proposal', 'text-button')}</div><p>Choose the aircraft and crews to commit. Staff favors sound aircraft and rested crews; a smaller package leaves part of HQ’s request unfilled.</p><div class="aircraft-grid">${s.aircraft.filter(a => !a.lost).map(a => aircraftCard(a, true)).join('')}</div>${policies()}<details class="engineering" data-detail="engineering"><summary>Engineering priority · ${s.engineeringUsed ? 'allocation already committed' : `${1 + s.extraBay} proper repair allocation${s.extraBay ? "s" : ""} available`}</summary><label>First call on the bay<select data-priority aria-label="Engineering priority">${s.aircraft.filter(a => !a.lost && !a.away).map(a => `<option value="${a.id}" ${s.plan.priority === a.id ? 'selected' : ''}>${esc(a.name)} · condition ${a.condition}${a.defect ? ' · persistent defect' : ''}</option>`).join('')}</select></label><p>Routine service adds four condition to idle aircraft, up to 90; it cannot remove a persistent defect. Engineering work is allocated once per commitment, not once per day away.</p></details><p class="work-note">${esc(repairSummary(s.plan))}</p><div class="commit-summary"><div><strong>${s.plan.flights.length} of ${task.requested} requested aircraft</strong><p>${s.plan.flights.length < task.requested ? 'A reduced contribution; more strength kept at home.' : 'The requested package is covered if the aircraft reach the objective.'} Report in ${duration(s.plan) / HOUR} hours.</p></div>${button('review', 'Review &amp; dispatch →', 'primary', errors.length ? 'disabled' : '')}</div>${errors.length ? `<p class="caution" role="status">${esc(errors.join(' '))}</p>` : ''}<div class="standdown"><span>Need to recover? A stand-down uses this assignment and contributes nothing, but allows two proper repairs and clears one strain level from each off-duty crew.</span>${button('standdown', 'Review stand-down', 'text-button')}</div></section>`;
  }
  function conclusion(): string {
    const lost = s.aircraft.filter(a => a.lost).length;
    return `<section class="paper ending"><p class="eyebrow">${s.phase === 'closing' ? 'Relief is on its way' : 'Tour concluded'}</p><h1>${s.ending === 'losses' ? 'The empty dispersal' : 'The names on the board'}</h1><p class="lead">${endingText(s)}</p>${tourMemories(s).length ? `<details class="tour-memories" data-detail="tour-memories" open><summary>What this squadron will remember</summary>${tourMemories(s).map(line => `<p>${esc(line)}</p>`).join('')}</details>` : ""}<div class="accounting"><span><b>${s.contribution}/${s.requested}</b> effective / requested strikes</span><span><b>${s.crews.filter(c => !c.lost).length}</b> crews preserved</span><span><b>${lost}</b> aircraft &amp; crews lost</span></div><p>${s.completed} assignments resolved · ${s.reports.filter(r => r.stoodDown).length} deliberate stand-downs · ${s.aircraft.filter(a => !a.lost).length} aircraft preserved.</p>${s.crews.filter(c => !c.lost).map(c => `<p class="roll-call"><strong>${esc(c.pilot)}</strong> ${c.sorties} sorties · ${experience(c)}${c.injury ? ' · recovering in hospital' : ''}</p>`).join('')}${lost ? `<p class="caution">Remembered: ${s.crews.filter(c => c.lost).map(c => esc(c.pilot) + ' and the flying crew').join('; ')}.</p>` : '<p class="good">Every crew accounted for. That belongs in the record too.</p>'}${s.phase === 'closing' ? `<p>All remaining committed work will finish. It is safe to leave; no further assignments will be issued.</p>${workList()}${button('skip-all', 'Advance until everyone is accounted for', 'primary')}` : `<p>The station record is complete. You can review the Tour or begin another posting.</p>${button('new', 'Begin another tour', 'primary')}`}</section>`;
  }
  function today(): string { return s.active ? activeView() : s.phase !== 'active' ? `${s.reports.at(-1) ? report(s.reports.at(-1)!, true) : ""}${conclusion()}` : planningView(); }
  function squadron(): string {
    return `<section class="page-intro"><p class="eyebrow">The dispersal</p><h1>Aircraft &amp; their people</h1><p>Sleep reduces fatigue by twelve every six hours, down to a floor of twelve per strain level. Pressing, battle damage and exhausted flying build strain. An assignment off flying removes one level; promised leave clears all of it at that report. At 95 fatigue the medical officer grounds a crew. Injuries and diversions have their own return times.</p></section><div class="aircraft-grid">${s.aircraft.map(a => aircraftCard(a)).join('')}</div><section class="paper"><h2>The crews</h2><p>A crew can be assigned to any serviceable aircraft. Routine seat filling is automatic; specialists become your concern when their absence matters.</p><div class="aircraft-grid">${s.crews.map(crewCard).join('')}</div></section><section class="paper"><h2>Engineering &amp; recovery</h2><p>${s.support} support available. Support pays for temporary specialists, recovery transport and replacement aircraft. Effective strikes on supply objectives earn more.</p>${workList()}${s.notices.length ? `<details data-detail="station-log"><summary>Recent station entries</summary><ul class="history">${s.notices.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}</section>`;
  }
  function tour(): string {
    return `<section class="paper"><p class="eyebrow">The fourteen-assignment tour</p><h1>A record of this posting</h1><p>${s.completed} resolved · ${s.contribution} effective strikes against ${s.requested} requested so far.</p><p>A dispatch or deliberate stand-down uses one assignment when its report arrives. There are no missed-day penalties: time away finishes only work already begun. A damaged or temporarily absent squadron can recover.</p><div class="tour-track">${s.assignments.map((a, i) => `<div class="tour-slot ${i < s.completed ? 'complete' : i === s.completed ? 'current' : ''}"><b>${String(i + 1).padStart(2, '0')}</b><span>${i < s.completed ? s.reports[i].stoodDown ? 'Rest' : `${s.reports[i].hits} hits` : i === s.completed ? 'Today' : i >= 11 ? 'Final' : 'Ahead'}</span></div>`).join('')}</div>${s.phase !== 'active' ? `<p class="lead">${endingText(s)}</p>` : `<h2>Known demands</h2>${s.assignments.slice(s.completed, Math.max(s.completed + 2, 0)).map((a, i) => `<p><strong>${s.completed + i + 1}. ${esc(a.title)}</strong> · ${a.requested} aircraft · ${a.hazard >= 3 ? 'heavy' : 'lighter'} opposition</p>`).join('')}<p class="small">Final stretch: assignments 12 and 13 request three aircraft; assignment 14 requests two. Relief follows the final report and outstanding station work.</p>`}</section><section class="paper"><h2>Operational record</h2>${s.reports.length ? [...s.reports].reverse().map(r => report(r, true)).join('') : '<p>The record is open. Your first assignment is waiting on Today.</p>'}${s.decisions.length ? `<details data-detail="decisions"><summary>Decisions entered in the station book</summary><ol class="history">${s.decisions.map(d => `<li>Before assignment ${d.slot + 1}: ${esc(d.text)}</li>`).join('')}</ol></details>` : ''}</section><section class="paper"><h2>Station records</h2><p>Saved automatically in this browser. A new tour archives this one first. Keep a downloaded copy if you plan to clear browser data.</p><div class="actions">${button('export', 'Download save copy')}${button('new', 'Start a new tour', 'text-button')}</div><p class="small">Posting number ${s.seed}. Bomber Command is a fictional squadron campaign inspired by B-17 operations.</p></section>`;
  }
  function dialog(): string {
    if (!modal) return '';
    if (modal === 'new') return `<dialog aria-labelledby="dialog-title"><h2 id="dialog-title">Accept a new posting?</h2><p>The current tour will be archived in this browser before a fresh squadron is created. Its orders will no longer be the active tour.</p><div class="actions">${button('cancel', 'Keep this tour')}${button('confirm-new', 'Archive &amp; begin', 'primary')}</div></dialog>`;
    const down = modal === 'standdown', p = s.plan;
    const warnings = p.flights.map(f => {
      const a = s.aircraft.find(a => a.id === f.aircraft)!, c = s.crews.find(c => c.id === f.crew)!;
      const odds = forecast(s, a, c, p);
      return `<li><strong>${esc(a.name)} · ${esc(c.pilot)}</strong><span>${a.condition} condition · ${c.fatigue} fatigue · ${c.strain} strain${a.defect ? ' · persistent defect' : ''} · ${flightFatigue(s, a, p)} flight fatigue expected</span><small>Estimated mechanical trouble ${percent(odds.mechanical)} · combat damage exposure ${percent(odds.exposure)} · effective bombing if reaching target ${percent(odds.accuracy)}</small></li>`;
    }).join('');
    return `<dialog aria-labelledby="dialog-title"><p class="eyebrow">Final commitment · Assignment ${s.completed + 1}</p><h2 id="dialog-title">${down ? 'Give the station a day to recover' : 'Sign the flying order'}</h2><p>${down ? 'No aircraft will fly. This assignment counts toward the fourteen and makes no contribution to HQ’s request.' : `${p.flights.length} aircraft against ${s.assignments[s.completed].requested} requested. ${p.route === 'direct' ? 'Direct approach' : 'Coastal dogleg'}; ${p.orders === 'preserve' ? 'bring the aircraft home' : 'press the attack'}.`}</p>${down ? '' : `<ul class="flight-results">${warnings}</ul>`}<p class="work-note">${esc(repairSummary(p, down))}</p><p>${down ? 'Station report in twelve hours.' : `Return report in ${duration(p) / HOUR} hours. The per-crew fatigue costs are listed above. ${p.orders === "press" ? "Pressing adds one operational strain on flights that reach the target; battle damage or high starting fatigue can add another." : "Battle damage or high starting fatigue can add operational strain."}`} Off-duty crews rest. Once saved, these orders stand; reloading will not change the operation.</p><p class="safe">You can leave after signing. No midflight attendance is needed.</p><div class="actions">${button('cancel', 'Back to the desk')}${button('confirm-dispatch', down ? 'Sign stand-down order' : 'Dispatch the package', 'primary')}</div></dialog>`;
  }
  function render(): void {
    const opened = new Set(Array.from(root.querySelectorAll<HTMLDetailsElement>('details[open]')).map(d => d.dataset.detail));
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active?.dataset.action ? `[data-action="${active.dataset.action}"]` : active?.dataset.aircraft ? `[data-aircraft="${active.dataset.aircraft}"]` : active?.dataset.crew ? `[data-crew="${active.dataset.crew}"]` : active?.dataset.priority !== undefined ? '[data-priority]' : active?.getAttribute('name') ? `[name="${active.getAttribute('name')}"][value="${(active as HTMLInputElement).value}"]` : null;
    root.innerHTML = `<div class="desk"><header class="masthead"><a href="./bomber_command.html" class="brand" aria-label="Bomber Command home"><span class="roundel" aria-hidden="true">✦</span><span><span class="eyebrow">Eighth Air Force · Operations desk</span><strong>Bomber Command</strong></span></a><div class="posting"><span>${esc(s.station)}</span><b>${s.phase === 'ended' ? 'Tour complete' : s.active ? 'Orders in force' : `${14 - s.completed} assignments remaining`}</b></div></header><nav aria-label="Primary">${(['today', 'squadron', 'tour'] as const).map(t => `<button type="button" data-tab="${t}" ${tab === t ? 'aria-current="page"' : ''}>${t === 'today' ? 'Today' : t === 'squadron' ? 'Squadron' : 'Tour'}${t === 'today' && s.active ? '<span class="live-dot" aria-hidden="true"></span>' : ''}</button>`).join('')}<span class="saved">${error ? 'Save needs attention' : blocked ? 'Earlier save held safely' : 'Orders saved locally'}</span></nav>${message ? `<aside class="notice">${esc(message)} ${!blocked ? button('dismiss', 'Understood', 'text-button') : ''}</aside>` : ''}${error ? `<aside class="error" role="alert">${esc(error)} ${button('reload', 'Reload', 'text-button')}</aside>` : ''}<main id="main-content">${blocked ? `<section class="paper"><h1>A new edition of the station book</h1><p>Your saved record is held safely. Start a new tour only when you are ready to archive it.</p><div class="actions">${button('export', 'Download existing save')}${button('new', 'Begin a new tour', 'primary')}</div></section>` : tab === 'today' ? today() : tab === 'squadron' ? squadron() : tour()}</main><footer><span>A squadron. Fourteen assignments. The people you bring home.</span>${!blocked && s.jobs.length && !s.active && s.phase !== 'ended' ? button('skip-next', 'Advance to next station milestone →', 'text-button') : ''}<details data-detail="how-time"><summary>How time &amp; saves work</summary><p>Operations take four or six real hours; a stand-down takes twelve. Accelerated play moves the same clock to the selected milestone. All work keeps its original start time. The tour waits for your next commitment, however long you are away. Use one browser tab for your tour.</p></details></footer></div>${dialog()}`;
    root.querySelector('[data-action="export"]')?.insertAdjacentHTML('afterend', `${button('import', 'Restore a saved tour')}<input type="file" data-save-file accept=".json,application/json" hidden aria-label="Saved tour file">`);
    root.querySelectorAll<HTMLDetailsElement>('details').forEach(d => { if (opened.has(d.dataset.detail)) d.open = true; });
    if (modal) { const d = root.querySelector('dialog')!; d.showModal(); d.addEventListener('cancel', e => { e.preventDefault(); modal = null; render(); restoreFocus(); }); }
    else if (focusKey) root.querySelector<HTMLElement>(focusKey)?.focus({ preventScroll: true });
  }
  function restoreFocus(): void { if (returnFocus) root.querySelector<HTMLElement>(`[data-action="${returnFocus}"]`)?.focus(); }
  root.addEventListener('click', e => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!target || target.disabled) return;
    if (target.dataset.tab) { tab = target.dataset.tab as typeof tab; render(); root.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.focus(); window.scrollTo(0, 0); return; }
    if (target.dataset.decision) { transact(d => choose(d, target.dataset.decision!, target.dataset.choice!)); render(); root.querySelector<HTMLElement>('[data-decision]:not(:disabled), [data-action="propose"]')?.focus({ preventScroll: true }); return; }
    const action = target.dataset.action;
    if (action === 'review' || action === 'standdown' || action === 'new') { returnFocus = action; modal = action === 'review' ? 'dispatch' : action === 'standdown' ? 'standdown' : 'new'; }
    if (action === 'cancel') modal = null;
    if (action === 'confirm-dispatch') { const down = modal === 'standdown'; modal = null; transact(d => commit(d, d.plan, down)); }
    if (action === 'propose') transact(d => { d.plan = proposePlan(d); d.planEdited = false; });
    if (action === 'dismiss') message = '';
    if (action === 'reload') { location.reload(); return; }
    if (action === 'import') { root.querySelector<HTMLInputElement>('[data-save-file]')?.click(); return; }
    if (action === 'skip-return' || action === 'skip-next' || action === 'skip-all') transact(d => {
      let at = action === 'skip-return' ? d.active?.returnsAt : action === 'skip-all' ? Math.max(d.now, ...d.jobs.map(j => j.at)) : nextMilestone(d);
      if (at != null) {
        advance(d, at);
        if (action === 'skip-all') while (d.jobs.length) advance(d, Math.max(...d.jobs.map(j => j.at)));
        d.offset = Math.max(d.offset, d.now - Date.now());
      }
    });
    if (action === 'confirm-new') {
      try { const fresh = createCampaign(seed(), Date.now()); store.replace(fresh); s = fresh; blocked = false; message = 'The previous station record has been archived in this browser.'; error = ''; tab = 'today'; modal = null; }
      catch (e) { error = String(e); modal = null; }
    }
    if (action === 'export') { const blob = new Blob([store.raw()], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `bomber-command-${s.seed}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return; }
    render(); if (action === 'cancel') restoreFocus();
    if (['confirm-dispatch', 'skip-return', 'skip-all', 'confirm-new'].includes(action ?? '')) {
      const main = root.querySelector<HTMLElement>('main')!; main.tabIndex = -1; main.focus({ preventScroll: true }); window.scrollTo(0, 0);
    }
  });
  root.addEventListener('change', async e => {
    const input = e.target as HTMLInputElement;
    if (input.dataset.saveFile !== undefined) {
      const file = input.files?.[0]; if (!file) return;
      try {
        if (file.size > 2_000_000) throw new Error('That file is too large to be a station record.');
        const restored = decode(await file.text());
        advance(restored, Math.max(restored.now, Date.now() + restored.offset));
        store.replace(restored); s = restored; blocked = false; error = ''; tab = 'today';
        message = 'Your saved tour has been restored. The previous active record was archived first.';
      } catch (e) { error = `The file was not restored. ${e instanceof Error ? e.message : String(e)}`; }
      render(); return;
    }
    transact(d => {
      if (input.dataset.aircraft || input.dataset.crew || input.dataset.priority !== undefined) d.planEdited = true;
      if (input.dataset.aircraft) {
        const id = input.dataset.aircraft;
        if (!input.checked) d.plan.flights = d.plan.flights.filter(f => f.aircraft !== id);
        else { const c = d.crews.find(c => crewAvailable(d, c) && !d.plan.flights.some(f => f.crew === c.id)); if (!c) throw new Error('No unassigned crew is fit to fly. Rest a crew or change the package.'); d.plan.flights.push({ aircraft: id, crew: c.id }); }
      }
      if (input.dataset.crew) { const f = d.plan.flights.find(f => f.aircraft === input.dataset.crew)!; const other = d.plan.flights.find(x => x.crew === input.value); if (other) other.crew = f.crew; f.crew = input.value; }
      if (input.dataset.priority !== undefined) d.plan.priority = input.value;
      if (input.name === 'route') d.plan.route = input.value as Plan['route'];
      if (input.name === 'orders') d.plan.orders = input.value as Plan['orders'];
    }); render();
  });
  window.addEventListener('storage', e => { if (e.key?.startsWith('bomber-command-desk-v20') && !e.key.includes('archive')) { error = 'This tour changed in another tab. Reload before issuing orders.'; render(); } });
  setInterval(() => {
    if (blocked || modal || error) return;
    const now = Date.now() + s.offset;
    if ((nextMilestone(s) ?? Infinity) <= now) { transact(() => {}); render(); }
    else root.querySelectorAll<HTMLElement>('[data-countdown]').forEach(el => { el.textContent = hours(Number(el.dataset.countdown) - now); });
  }, 10_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !blocked && !modal && !error) { transact(() => {}); render(); } });
  render();
}
