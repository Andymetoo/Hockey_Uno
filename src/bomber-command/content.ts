import type { Assignment, Circumstance, Defect, State, StationEvent } from './types.ts';

const targets: Omit<Assignment, 'weather' | 'circumstance'>[] = [
  { title: 'The coastal yards', objective: 'Cut the railway sidings serving the coast.', why: 'A short first assignment. Disrupting these supplies will give the group room to settle in.', hazard: 1, requested: 2, effect: 'rail' },
  { title: 'Fighters on the ground', objective: 'Strike the dispersal areas at a coastal fighter field.', why: 'Aircraft destroyed here cannot meet tomorrow’s bomber stream.', hazard: 2, requested: 2, effect: 'fighters' },
  { title: 'The canal crossing', objective: 'Interrupt freight at the canal marshalling yard.', why: 'HQ needs a full section. The workshops ahead are a harder assignment.', hazard: 2, requested: 3, effect: 'supplies' },
  { title: 'Engine works', objective: 'Put the engine assembly halls out of operation.', why: 'This is the first deep penetration. Experienced crews will earn their keep.', hazard: 4, requested: 3, effect: 'fighters' },
  { title: 'A narrow window', objective: 'Strike a repair depot while rolling stock is concentrated.', why: 'A good result releases scarce transport for our own station.', hazard: 2, requested: 2, effect: 'supplies' },
  { title: 'Beyond the estuary', objective: 'Hit the railway approaches beyond the estuary.', why: 'Traffic has shifted inland. Every effective aircraft slows that movement.', hazard: 3, requested: 3, effect: 'rail' },
  { title: 'The northern airfield', objective: 'Crater the fighter field’s service and dispersal areas.', why: 'The group is gathering for a larger effort. Reduce the opposition now.', hazard: 3, requested: 2, effect: 'fighters' },
  { title: 'The long haul', objective: 'Attack the inland aircraft component works.', why: 'HQ requests the whole flight. A smaller contribution is accepted, but leaves more work to other stations.', hazard: 4, requested: 4, effect: 'supplies' },
  { title: 'A shorter run', objective: 'Cut the coastal supply line a second time.', why: 'A limited assignment offers a chance to rotate tired crews.', hazard: 1, requested: 2, effect: 'rail' },
  { title: 'Closing the net', objective: 'Attack a fighter repair and storage depot.', why: 'Successful bombing will ease interception on the next assignment.', hazard: 3, requested: 3, effect: 'fighters' },
  { title: 'The western junction', objective: 'Block the rail junction feeding the inland factories.', why: 'Three assignments will remain after this one. Preserve enough strength to finish.', hazard: 3, requested: 3, effect: 'supplies' },
  { title: 'The last push · I', objective: 'Strike the forward fighter bases.', why: 'The final three assignments are fixed. Today’s result can protect the last deep raid.', hazard: 3, requested: 3, effect: 'fighters' },
  { title: 'The last push · II', objective: 'Attack the main assembly plant.', why: 'The tour’s heaviest remaining objective. Tomorrow asks for only two aircraft.', hazard: 4, requested: 3, effect: 'supplies' },
  { title: 'Bring them home', objective: 'Make one final strike against the coastal railway.', why: 'Relief crews arrive after this assignment. Make the contribution you can sustain.', hazard: 2, requested: 2, effect: 'rail' },
];
const alternatives: Record<Assignment['effect'], { title: string; objective: string; why: string }[]> = {
  rail: [
    { title: 'Freight at first light', objective: 'Cut the departure roads at Wessel yard.', why: 'Loaded trains are held overnight here. Disrupting the yard can delay supplies to fighter stations.' },
    { title: 'The river sidings', objective: 'Strike the rail interchange on the east bank.', why: 'The main line has shifted its traffic through a smaller yard. A precise contribution can interrupt that detour.' },
    { title: 'Empty platforms', objective: 'Disable the goods sheds and tracks at Halden junction.', why: 'Rail crews are clearing yesterday’s congestion. HQ wants the line blocked before they finish.' },
  ],
  fighters: [
    { title: 'Under the trees', objective: 'Attack the concealed dispersals at Wester field.', why: 'Fighter aircraft are being spread out along the tree line. Several accurate concentrations will matter more than a single large one.' },
    { title: 'The maintenance line', objective: 'Strike the repair hangars at Lingen airfield.', why: 'Intelligence reports damaged fighters gathered for repair. Keeping them on the ground can ease the next raid.' },
    { title: 'Before the next scramble', objective: 'Attack the service area at a forward interceptor field.', why: 'Fuel bowsers and spare engines have arrived. HQ wants the station interrupted before those supplies reach the dispersals.' },
  ],
  supplies: [
    { title: 'The machine shops', objective: 'Hit the workshops supplying engine components.', why: 'This is a transport priority. An effective contribution earns the squadron a call on Group’s spare transport.' },
    { title: 'Stores by the canal', objective: 'Strike the stores buildings beside the canal basin.', why: 'Crated components are awaiting onward shipment. Group will release transport support if the objective is effectively hit.' },
    { title: 'The repair sheds', objective: 'Attack the industrial repair sheds at the edge of town.', why: 'Damaged equipment is being returned to service here. The group needs a useful concentration, not merely aircraft over the target.' },
  ],
};
export const circumstances: Record<Circumstance, { title: string; brief: string }> = {
  ordinary: { title: 'A routine approach', brief: 'No special restrictions reported. The direct route saves time; the dogleg avoids some fighter exposure.' },
  escort: { title: 'An escort rendezvous', brief: 'Fighters are assigned to the direct corridor. The dogleg misses that cover and offers only a small exposure advantage today. Pressing beyond the first pass still adds risk.' },
  window: { title: 'A short opening', brief: 'The weather officer expects a brief opening over the target. The direct approach improves the bombing chance; the later dogleg is likely to miss part of the opening.' },
  dispersed: { title: 'Separated aiming points', brief: 'The objective is spread out. A second pass has more value than usual, but keeps the formation exposed and adds strain.' },
  fuel: { title: 'Headwinds over the crossing', brief: 'The longer dogleg adds another eight fatigue and more risk of diverting for fuel. Navigation crews can mitigate the diversion risk.' },
  flak: { title: 'Guns along the approach', brief: 'Reconnaissance has identified a belt of guns on the direct corridor. The dogleg avoids more exposure than usual, at the normal cost in fuel and fatigue.' },
};
export const defectText: Record<Defect, { name: string; cost: string }> = {
  oil: { name: 'Oil-pressure fault', cost: 'Higher chance of mechanical trouble. A field patch does not remove the fault.' },
  controls: { name: 'Stiff control runs', cost: 'More mechanical trouble and greater combat exposure while maneuvering.' },
  sight: { name: 'Bombsight vibration', cost: 'Reduced bombing accuracy, with a smaller increase in mechanical trouble.' },
};
export function makeAssignments(random: () => number): Assignment[] {
  return targets.map((target, i) => {
    const variation = i >= 3 && i <= 10 && random() < .7 ? alternatives[target.effect][Math.floor(random() * 3)] : {};
    const choices: Circumstance[] = ['escort', 'window', 'dispersed', 'fuel', 'flak', 'ordinary'];
    return { ...target, ...variation,
    requested: [5, 6, 9, 10].includes(i) ? (random() < .35 ? 2 : 3) : target.requested,
    circumstance: i < 2 ? 'ordinary' : choices[Math.floor(random() * choices.length)],
    hazard: Math.max(1, Math.min(4, target.hazard + (i > 3 && i < 11 && random() < .25 ? -1 : 0))),
    weather: i === 0 ? 'clear' : random() < .3 ? 'cloud' : random() < .3 ? 'crosswind' : 'clear',
  }; });
}
export const traitText = {
  rugged: 'Reinforced airframe · less battle damage, heavier fuel load',
  accurate: 'Steady bomb platform · better accuracy, delicate systems',
  economical: 'Reliable engines · fewer mechanical aborts',
  swift: 'Clean airframe · less fighter exposure',
};
export const strengthText = {
  navigation: 'Navigation · handles cloud and long approaches',
  bombing: 'Bombing · a better chance of an effective strike',
  engineering: 'Flight engineering · catches mechanical trouble early',
  formation: 'Formation discipline · less combat exposure',
};
export function stationEvents(s: State): StationEvent[] {
  if (s.phase !== 'active' || s.active) return [];
  if (s.decisions.filter(d => d.slot === s.completed).length >= 2) return [];
  const events: StationEvent[] = [];
  const available = (key: string, cooldown = 99) => !s.decisions.some(d => d.key === key && s.completed - d.slot < cooldown);
  const onStation = (id: string) => !s.jobs.some(j => (j.kind === 'recovery' && j.text === id) || (j.kind === 'training' && j.subject === id));
  const bayFree = s.engineeringUsed < 1 + s.extraBay && !s.jobs.some(j => j.kind === 'repair' || j.kind === 'inspection');
  for (const c of s.crews.filter(c => !c.lost)) {
    if (c.returned && c.replacement && onStation(c.id) && available(`return-${c.id}-${c.sorties}`)) events.push({
      key: `return-${c.id}-${c.sorties}`, kind: 'returning', subject: c.id,
      title: `${c.specialist} is back`, body: `The medical officer has cleared ${c.specialist}. ${c.replacement} has flown ${c.replacementSorties} sorties with ${c.pilot}. The original remains on light station duty until you decide.`,
      choices: [ { id: 'restore', label: 'Welcome the original back', detail: 'Restore crew familiarity: gain one experience. The temporary specialist returns to the pool: recover one support.' }, { id: 'retain', label: 'Keep the new arrangement', detail: 'The original transfers to training. Remove one level of operational strain and 20 fatigue; the temporary specialist stays permanently.' } ],
    });
    if (c.injury && !c.replacement && available(`injury-${c.id}-${c.sorties}`)) events.push({
      key: `injury-${c.id}-${c.sorties}`, kind: 'replacement', subject: c.id,
      title: `A place in ${c.pilot}’s crew`, body: `${c.specialist} is in the station hospital. The rest of the crew can fly with a temporary specialist, or wait for their own to return.`,
      choices: [ { id: 'assign', label: 'Request a temporary specialist', detail: 'Costs one support. Fills the injured specialist’s seat; fatigue and absence restrictions still apply. Familiarity improves over three sorties together.', disabled: s.support < 1 }, { id: 'wait', label: 'Keep the crew together', detail: 'No support spent. Crew remains unavailable until medical clearance.' } ],
    });
    if (c.strain >= 2 && !c.injury && c.leaveThrough <= s.completed && onStation(c.id) && available(`strain-${c.id}`, 3)) events.push({
      key: `strain-${c.id}`, kind: 'strain', subject: c.id, title: `${c.pilot} needs more than a night’s sleep`,
      body: `The medical officer records ${c.strain} levels of operational strain. Ordinary sleep cannot take this crew below ${c.strain * 12} fatigue. A full assignment off flying removes one level automatically.`,
      choices: [
        { id: 'leave', label: 'Promise them this assignment off', detail: 'Hold the crew off the next commitment. At its report, clear all strain and fatigue. Costs no support, but another crew must carry the work.' },
        { id: 'debrief', label: 'Arrange a supported debrief', detail: 'Costs one support. Remove one strain level and twelve fatigue now; keep the crew available subject to medical and fatigue restrictions.', disabled: s.support < 1 },
        { id: 'duty', label: 'Keep the current roster', detail: 'No relief authorized. Their strain remains until an assignment off flying; more pressing may make it worse.' },
      ],
    });
  }
  for (const a of s.aircraft.filter(a => !a.lost)) {
    if (a.away && available(`recover-${a.id}-${a.sorties}`)) events.push({
      key: `recover-${a.id}-${a.sorties}`, kind: 'recovery', subject: a.id,
      title: `${a.name} at a forward field`, body: `The aircraft and crew are accounted for. A recovery party is arranged. ${s.jobs.find(j => j.kind === 'recovery' && j.subject === a.id) ? 'Local workshops can release the aircraft sooner with transport, or do more lasting work if we accept a delay.' : 'Operations is checking the recovery arrangements.'}`,
      choices: [ { id: 'expedite', label: 'Send our transport', detail: 'Costs one support. Bring recovery forward by 18 hours, never earlier than one hour from now. Field checks still need signing off at home.', disabled: s.support < 1 || !s.jobs.some(j => j.kind === 'recovery' && j.subject === a.id && j.at > s.now + 3_600_000) }, { id: 'overhaul', label: 'Let the field workshop finish', detail: 'Costs one support and delays return six hours. Restore up to 30 condition, clear defects and complete a certified inspection before recovery.', disabled: s.support < 1 }, { id: 'wait', label: 'Use the scheduled recovery', detail: 'No support spent. Recovery proceeds on schedule; the aircraft returns with only field checks completed.' } ],
    });
    if (a.condition < 55 && !a.defect && !a.away && bayFree && available(`rush-${a.id}`, 3)) events.push({
      key: `rush-${a.id}`, kind: 'rush', subject: a.id,
      title: `Put ${a.name} on the line?`, body: 'Finch can make the aircraft flyable for this assignment. He cannot certify a lasting repair in the time available.',
      choices: [ { id: 'rush', label: 'Authorize the field patch', detail: 'Raise condition to 68 now. A persistent defect increases abort risk. Uses this assignment’s engineering bay; no proper repair until a later commitment.' }, { id: 'proper', label: 'Reserve it for proper work', detail: 'Make this aircraft the repair priority. Keep it off this operation to restore 38 condition and remove defects in six hours.' } ],
    });
    if ((a.defect || a.recovered) && !a.away && !s.jobs.some(j => j.subject === a.id && ['repair', 'inspection'].includes(j.kind)) && available(`inspect-${a.id}`, 3)) events.push({
      key: `inspect-${a.id}`, kind: 'inspection', subject: a.id,
      title: `${a.name}: ${a.defect ? defectText[a.defectType ?? 'oil'].name.toLowerCase() : 'back from the forward field'}`,
      body: a.defect ? `Finch’s finding: ${defectText[a.defectType ?? 'oil'].cost} The fault will persist until specialist or proper work is complete.` : 'The recovery party has brought the aircraft home. Field checks allowed the ferry flight; an unverified repair adds mechanical risk until Finch signs it off.',
      choices: [
        { id: 'bench', label: 'Bring in a specialist now', detail: 'Costs one support and this assignment’s engineering allocation. Aircraft unavailable for three hours; restore up to 12 condition, clear faults, and certify the next two flights.', disabled: s.support < 1 || !bayFree },
        { id: 'queue', label: 'Use the normal repair bay', detail: 'Reserve the aircraft for proper work at commitment. No support spent; keep it off this package. Six hours of work restores up to 38 condition and clears faults.' },
        { id: 'carry', label: 'Keep it available with the finding', detail: 'No work authorized. The known mechanical or bombing penalty remains on every flight until repaired.' },
      ],
    });
  }
  if (s.aircraft.filter(a => !a.lost).length < 4 && s.aircraft.some(a => a.lost) && available('reinforcement', 4) && !s.jobs.some(j => j.kind === 'reinforcement')) events.push({
    key: 'reinforcement', kind: 'reinforcement', subject: s.aircraft.find(a => a.lost)!.id,
    title: 'A ferry aircraft is available', body: 'Group can send a replacement B-17 and a new crew. It will not bring back the people already lost.',
    choices: [ { id: 'request', label: 'Call in the replacement', detail: 'Costs two support. A sound aircraft and novice crew arrive in twelve hours.', disabled: s.support < 2 }, { id: 'wait', label: 'Carry on with the squadron', detail: 'Keep support for medical or recovery needs. Another request is possible after four assignments.' } ],
  });
  if (s.opportunity && s.opportunity.slot === s.completed && available(`opportunity-${s.completed}`)) events.push({
    key: `opportunity-${s.completed}`, kind: 'opportunity', subject: '',
    title: s.opportunity.kind === 'photos' ? 'Something useful in the photographs' : 'Group offers a transport allocation',
    body: `Earned by the effective strike on ${s.opportunity.source}. ${s.opportunity.kind === 'photos' ? 'The photographs include clear approach landmarks and fighter dispersals. There is time to prepare one set of material before this assignment.' : 'Finch can take a mobile engineering team, or you can keep the allocation for personnel and recovery.'}`,
    choices: s.opportunity.kind === 'photos' ? [
      { id: 'brief', label: 'Prepare the crews’ approach notes', detail: 'Improve this assignment’s bombing chance by seven percentage points. Consumed by the next commitment; no extra attendance needed.' },
      { id: 'share', label: 'Send the dispersal photographs to Group', detail: 'Reduce opposition on this assignment by another half level. Forego the local accuracy benefit.' },
    ] : [
      { id: 'bay', label: 'Take the mobile engineering team', detail: 'One additional proper repair at the next commitment. A flying aircraft still cannot occupy a repair bay.' },
      { id: 'support', label: 'Keep the transport allocation', detail: 'Add one support for specialists and recovery, up to the station limit of five.', disabled: s.support >= 5 },
    ],
  });
  const novice = s.crews.find(c => !c.lost && !c.injury && !c.lesson && c.leaveThrough <= s.completed && onStation(c.id) && c.experience < 5 && c.fatigue < 35);
  const veteran = s.crews.find(c => !c.lost && !c.injury && c.leaveThrough <= s.completed && onStation(c.id) && c.experience >= 6 && c.fatigue < 50);
  if (s.completed >= 2 && novice && veteran && available('mentor', 4)) events.push({
    key: 'mentor', kind: 'mentor', subject: novice.id, title: 'An afternoon at the plotting table',
    body: `${veteran.pilot} offers to work through the approaches with ${novice.pilot}. Both crews would be held off the next operation for training.`,
    choices: [ { id: 'train', label: 'Give them the afternoon', detail: 'Costs one support. Gain two experience and an eight-point bombing advantage on the next flight. Both crews are unavailable for six hours; others must cover an immediate dispatch.', disabled: s.support < 1 }, { id: 'fly', label: 'Keep both crews available', detail: 'No training gain. Preserve support and both crews for today’s assignment.' } ],
  });
  // Do not bury an earned, expiring opportunity behind several similar repair findings.
  const opportunity = events.find(e => e.kind === 'opportunity');
  return opportunity ? [events.find(e => e !== opportunity), opportunity].filter((e): e is StationEvent => !!e) : events.slice(0, 2);
}
