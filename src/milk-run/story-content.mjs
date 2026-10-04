/** Authored situations, not a draw deck. The director owns timing and randomness;
 * these definitions only describe eligibility, decisions and their consequences.
 * All bindings are captured when a thread begins so later beats remember the
 * actual engine, damage or wounded crewmate that prompted the story. */
import { BOARD, CREW_DEFS, ENGINE_CELLS, STATIONS } from './board.mjs';
import { specialistOperator } from './crew-position.mjs';
import { missionLengths } from './rulesets.mjs';

const outbound = s => !s.mission.bombed && !s.mission.aborted;
const returning = s => !outbound(s);
const distanceToTarget = s => missionLengths(s).outboundLength - s.mission.position;
const condition = (s, id) => (s.story?.conditions ?? []).some(c => c.id === id);
const healthyRadio = s => s.crew.some(c => c.id === 'radio' && c.health === 'healthy' && !c.job);
const freeWorker = s => s.crew.some(c => c.health === 'healthy' && !c.job &&
  !s.jobs.some(j => j.kind === 'medical' && j.targetId === c.id));
const damagedCell = (s, test = () => true) => BOARD.find(c => c.structure && s.cells[c.id] === 'damaged' &&
  !s.jobs.some(j => j.cells?.includes(c.id)) && test(c));
const engineTrouble = s => s.engines.find(e => e.running && (ENGINE_CELLS[e.id] ?? []).some(id =>
  s.cells[id] === 'damaged' && !s.jobs.some(j => j.cells?.includes(id))));
const engineBindings = s => {
  const engine = engineTrouble(s);
  return { engineId: engine.id, cellId: ENGINE_CELLS[engine.id].find(id => s.cells[id] === 'damaged' && !s.jobs.some(j => j.cells?.includes(id))) };
};
const injured = s => s.crew.find(c => c.health === 'injured');
const crewBindings = s => {
  const crew = injured(s);
  return crew ? { crewId: crew.id, crewName: CREW_DEFS.find(d => d.id === crew.id).name } : {};
};
const resolve = (id, reason) => ({ type: 'resolve', id, reason });
const delay = (stage, after = 1) => ({ after, stage });
const detour = (id, description) => ({ type: 'condition', id, title: ({ weather_detour: 'FOLLOWING THE COAST', navigation_fix: 'CHECKING THE BEARING', wrong_valley_delay: 'BACK FROM THE WRONG VALLEY', flak_detour: 'AROUND THE RAILWAY BATTERY', friendly_guidance: 'GUIDING A DAMAGED BOMBER' })[id] ?? 'LONG WAY ROUND', description,
  effectText: 'The next Progress requires 1 extra Time, subject to the physical Time supply.',
  resolveText: 'Ends at the next Progress checkpoint.', expireText: 'The revised route rejoins the flight plan.', modifiers: { nextProgress: 1 }, duration: 1 });
const boon = (id, title, action, description, effectText) => ({ type: 'condition', id, title, description,
  effectText, resolveText: 'Used by the next matching action; otherwise expires at HOME.',
  tone: 'positive', modifiers: { nextFree: action } });
const inspection = { type: 'work', kind: 'repair', cellId: '{cellId}', time: 2 };
const canInspect = (s, b) => freeWorker(s) && s.cells[b.cellId] === 'damaged' && !s.jobs.some(j => j.cells?.includes(b.cellId));

export const STORY_THREADS = [
  {
    id: 'weather_front', weight: 4, initial: 'front',
    eligible: s => outbound(s) && distanceToTarget(s) >= 2,
    stages: {
      front: { title: 'THE COAST DISAPPEARS', body: 'A bank of cloud swallows the coastline ahead. The bomber ahead vanishes wingtip first. Inside, the fighters will have the same trouble seeing you that your gunners have seeing them.', choices: [
        { id: 'enter', label: 'Fly into the cloud', detail: 'Enemy attacks need a better roll; add two temporary MISS tokens to the combat bag. The cloud may still cover the target.', fact: 'Entered heavy cloud over the coast.', effects: [{ type: 'condition', id: 'heavy_cloud', title: 'HEAVY CLOUD', description: 'The aircraft entered the weather front rather than fly around it.', effectText: 'Enemy hit threshold +1. Two temporary MISS tokens are in the combat bag.', resolveText: 'Ends when the cloud breaks, after the Bomb Run, or on Turn Back.', pendingText: 'If it persists to TARGET, visual corrections may be impossible.', modifiers: { enemyHit: 1 }, tokens: [{ bag: 'combat', token: 'Miss', count: 2 }], until: 'bombed' }], next: { after: 1, branches: [{ weight: 2, stage: 'break' }, { weight: 3, stage: 'deeper' }] } },
        { id: 'around', label: 'Keep the coastline in sight', detail: 'The next Progress requires 1 extra Time. Avoid the cloud and its target consequences.', fact: 'Followed the coast around the weather front.', effects: [detour('weather_detour', 'The formation follows the coast around the front, keeping land in view.')], next: delay('clear_coast') },
      ] },
      break: { title: 'SUN THROUGH THE WINDSCREEN', body: 'The cloud tears open. There is the river, exactly where the chart said it should be. For once, the direct route paid off.', effects: [resolve('heavy_cloud', 'The weather front broke before the target.')], fact: 'The cloud broke; the direct route paid off.' },
      clear_coast: { title: 'THE PRICE OF CERTAINTY', body: 'The coastline finally bends back toward the planned route. You spent longer under fire, but every landmark is where it should be.', fact: 'Cleared the weather by following the longer coastal route.' },
      deeper: { title: 'NOT A HOLE IN IT', body: 'Condensation drips onto the chart case. The cloud has become a solid roof over the country. The target lies under the same bank.', eligible: s => condition(s, 'heavy_cloud') && outbound(s), fact: 'The weather front continued inland toward the target.', next: { at: 'target', stage: 'target' } },
      target: { title: '{targetName} UNDER CLOUD', body: 'The earlier front is still with you. The lead ship calls the approach over the radio. A fleeting glimpse through a break confirms the aiming area; the formation must hold straight and level for release. There is little time for further corrections.', eligible: s => condition(s, 'heavy_cloud') && outbound(s) && Boolean(specialistOperator(s, 'bombardier')), elseStage: 'no_drop', choices: [
        { id: 'through', label: 'Hold the lead ship’s bombing line', detail: 'Keep the Bombardier’s free reroll. Officer-resource rerolls are unavailable on this Bomb Run.', fact: 'Reached {targetName} under the cloud entered earlier; held the lead ship’s run after a brief visual confirmation.', effects: [{ type: 'condition', id: 'cloud_target', title: 'TARGET OBSCURED', description: 'The coast’s weather front still covers {targetName}.', effectText: 'Officer-resource Bomb Run rerolls are unavailable. The Bombardier’s free reroll remains.', resolveText: 'Ends after the Bomb Run or on Turn Back.', modifiers: { bombOfficerBlocked: true }, until: 'bombed' }] },
        { id: 'gap', label: 'Follow the lead through a break', eligible: s => s.altitude > 1, detail: 'Follow a coordinated descent before the final run: lose 1 Altitude to get a visual run. Remove the cloud and its combat tokens.', fact: 'Descended below the old weather front to identify {targetName}.', effects: [{ type: 'altitude', amount: -1 }, resolve('heavy_cloud', 'Descended below the cloud at the target.')] },
      ] },
      no_drop: { title: 'CLOUD OVER AN EMPTY SIGHT', body: 'The earlier weather still covers {targetName}, but visibility is no longer the deciding problem. Nobody qualified is operating the Bombardier station. The aircraft must turn home without a drop.', eligible: s => condition(s, 'heavy_cloud') && outbound(s) && !specialistOperator(s, 'bombardier'), fact: 'The old cloud covered {targetName}, but an unmanned Bombardier function prevented a drop.' },
    },
  },
  {
    id: 'rough_engine', weight: 5, initial: 'knock', eligible: s => Boolean(engineTrouble(s)), bind: engineBindings,
    stages: {
      knock: { title: '{engineId}: A DIFFERENT SOUND', body: 'The earlier hit at {cellId} did not stop {engineId}. Now a hard knock comes through the wing. The sound cuts through even the gunfire.', choices: [
        { id: 'stop', label: 'Feather the engine', detail: 'Stop the engine now. Existing stopped-engine altitude checks apply; its damaged square still needs Repair before restart.', fact: 'Shut down {engineId} when the damaged engine began knocking.', effects: [{ type: 'stopEngine', engineId: '{engineId}' }] },
        { id: 'inspect', label: 'Check the engine controls', eligible: canInspect, detail: 'Assign a healthy free worker, preferring the Engineer, to check accessible controls and connections from inside the aircraft (Repair {cellId}). Takes 2 future Time and no resource; that worker leaves their station.', fact: 'Assigned a worker to the accessible controls and connections for {engineId}.', effects: [inspection], next: delay('checked') },
        { id: 'push', label: 'Keep it running', detail: 'Keep the engine’s power. At the next Progress it may settle, deteriorate or fail. Repairing the marked square first removes the risk.', fact: 'Chose to push the damaged {engineId}.', effects: [{ type: 'condition', id: 'engine_gamble', title: 'PUSHING A ROUGH ENGINE', description: '{engineId} is still running despite the knock at {cellId}.', effectText: 'No immediate modifier; its damaged square remains a normal Repair target.', resolveText: 'Repair {cellId} or await the next Progress report.', pendingText: 'The engine may settle, worsen or stop at the next Progress.', repairCell: '{cellId}' }], next: { after: 1, branches: [{ weight: 3, stage: 'settled' }, { weight: 2, stage: 'worse' }, { weight: 1, stage: 'failed' }] } },
      ] },
      checked: { title: 'AT THE ENGINE CONTROLS', body: 'Checking accessible controls and connections for the damage at {cellId} has taken hands away from other stations. Nobody can reach the nacelle in flight. Whether those hands are still at work or back on the guns, that was the price of not leaving the knock to chance.', eligible: (s, b) => s.cells[b.cellId] === 'healthy' || s.jobs.some(j => j.storyThreadId === 'rough_engine'), elseStage: 'inspection_interrupted', fact: 'Made time for an in-flight inspection of {engineId}.' },
      inspection_interrupted: { title: 'THE TOOLS HAD TO BE LEFT', body: 'The inspection of {engineId} was interrupted before {cellId} could be repaired. The damage is still there. The next decision belongs to whoever can spare a pair of hands.', fact: 'The inspection of {engineId} was interrupted before {cellId} was repaired.' },
      settled: { title: 'THE KNOCK FADES', body: 'Without warning, the vibration subsides. {engineId} is still running. Someone looks back at the nacelle for a long moment and says nothing.', eligible: (s, b) => condition(s, 'engine_gamble') && s.engines.some(e => e.id === b.engineId && e.running), elseStage: 'averted', effects: [resolve('engine_gamble', 'The vibration settled; the gamble paid off.')], fact: 'Pushed {engineId}; the vibration settled without an engine failure.' },
      worse: { title: 'OIL ON THE COWLING', body: 'Keeping {engineId} running bought distance. Now oil is tracing a black line across the old damage at {cellId}. There is still time to stop or repair it.', eligible: (s, b) => condition(s, 'engine_gamble') && s.engines.some(e => e.id === b.engineId && e.running), elseStage: 'averted', choices: [
        { id: 'stop', label: 'Stop it before it seizes', detail: 'Stop the engine; no additional damage. Normal engine altitude rules apply.', effects: [resolve('engine_gamble', 'Stopped the engine when oil pressure worsened.'), { type: 'stopEngine', engineId: '{engineId}' }], fact: 'The pushed {engineId} worsened; finally shut it down.' },
        { id: 'repair', label: 'Check the accessible connections', eligible: canInspect, detail: 'A healthy free worker leaves their station for a free 2-Time Repair of {cellId}.', effects: [resolve('engine_gamble', 'Committed to repairing the oil leak.'), inspection], fact: 'Assigned work on accessible connections after {engineId} showed worsening oil trouble.' },
      ] },
      failed: { title: 'THE PROPELLER SLOWS', body: 'The power you borrowed is gone. {engineId} runs down, leaving the other engines carrying its share. The original damage must be repaired before a restart.', eligible: (s, b) => condition(s, 'engine_gamble') && s.engines.some(e => e.id === b.engineId && e.running), elseStage: 'averted', effects: [resolve('engine_gamble', 'The damaged engine failed after being pushed.'), { type: 'stopEngine', engineId: '{engineId}' }], fact: 'Pushed {engineId} until it failed.' },
      averted: { title: 'CAUGHT BEFORE IT FAILED', body: 'The marked damage at {cellId} has been repaired before the delayed engine report arrives. Whatever else the flight has brought, that old leak no longer dictates the outcome.', eligible: (s, b) => s.cells[b.cellId] === 'healthy', elseStage: 'overtaken', effects: [resolve('engine_gamble', 'The marked damage was repaired before the delayed risk.')], fact: 'Repaired {cellId} before the delayed risk from pushing {engineId}.' },
      overtaken: { title: 'THE ENGINE REPORT IS OVERTAKEN', body: '{engineId} has stopped since the crew chose to push it. The old question of keeping it running is over; its present damage and the normal restart rules now determine what is possible.', effects: [resolve('engine_gamble', 'The engine stopped before the delayed report; the original gamble no longer applies.')], fact: '{engineId} stopped before the delayed report on its earlier knock.' },
    },
  },
  {
    id: 'oxygen_line', weight: 4, initial: 'hiss',
    eligible: s => s.altitude >= 4 && Boolean(damagedCell(s, c => c.fuselage)),
    bind: s => ({ cellId: damagedCell(s, c => c.fuselage).id }),
    stages: {
      hiss: { title: 'A HISS BESIDE THE OLD HIT', body: 'Near {cellId}, frost is spreading along a damaged oxygen fitting. Treating a wounded man up here means sharing a working mask while someone holds the connection together.', choices: [
        { id: 'stay', label: 'Stay high and work around it', detail: 'Medical jobs begun at Altitude 4 or higher take 1 extra Time. Repair {cellId} or descend to Altitude 3 to end it.', effects: [{ type: 'condition', id: 'oxygen_leak', title: 'OXYGEN LINE LEAK', description: 'The existing hit at {cellId} has opened an oxygen fitting.', effectText: 'Medical work begun at Altitude 4 or higher takes +1 Time.', resolveText: 'Repair {cellId} or descend to Altitude 3 or lower.', pendingText: 'The next checkpoint brings a report from the crew.', modifiers: { jobTime: { medical: 1 } }, repairCell: '{cellId}', altitudeAtMost: 3 }], next: delay('report'), fact: 'Stayed high despite the oxygen leak at {cellId}.' },
        { id: 'descend', label: 'Get below the worst of it', detail: 'Descend 1 Altitude. At Altitude 5 this only reaches 4: the leak still needs Repair or another later descent.', effects: [{ type: 'altitude', amount: -1 }, { type: 'condition', id: 'oxygen_leak', title: 'OXYGEN LINE LEAK', description: 'The damaged fitting at {cellId} still leaks above Altitude 3.', effectText: 'Medical work at Altitude 4 or higher takes +1 Time.', resolveText: 'Repair {cellId} or reach Altitude 3 or lower.', modifiers: { jobTime: { medical: 1 } }, repairCell: '{cellId}', altitudeAtMost: 3 }], next: delay('report'), fact: 'Gave up altitude to ease the oxygen leak at {cellId}.' },
      ] },
      report: { title: 'PASS THE WORKING MASK', body: 'The crew reports on the damaged line. Any remaining delay belongs to the ordinary Medical jobs; there is no reserve to count, only people who need hands freed to help them.', eligible: s => condition(s, 'oxygen_leak'), elseStage: 'breathing', fact: 'The oxygen leak continued to complicate treatment at altitude.' },
      breathing: { title: 'BREATHING EASIER', body: 'The line has been repaired, or the aircraft has reached air where the damaged fitting no longer dictates the crew’s work.', fact: 'Resolved the oxygen problem before it became a lasting burden.' },
    },
  },
  {
    id: 'uncertain_landmarks', weight: 3, initial: 'river', eligible: s => outbound(s) && distanceToTarget(s) >= 3 && (!specialistOperator(s, 'navigator') || condition(s, 'heavy_cloud')),
    stages: {
      river: { title: 'THAT RIVER SHOULD FORK', body: 'The river below bends the wrong way. It might be the next valley over, or the chart might be wrong. A limited course correction for the formation could recover the lost minutes—or carry it farther off course.', choices: [
        { id: 'fix', label: 'Take a careful bearing', detail: 'The next Progress takes 1 extra Time. End the uncertainty without a gamble.', effects: [detour('navigation_fix', 'The Navigator checks a second landmark while the formation follows its planned course correction.')], next: delay('fixed'), fact: 'Spent time establishing a reliable position over an unfamiliar river.' },
        { id: 'follow', label: 'Trust the river', detail: 'At the next Progress, a correct shortcut claims one available physical Time; a wrong valley costs 1 extra Time on the following Progress.', effects: [], next: { after: 1, branches: [{ weight: 3, stage: 'shortcut' }, { weight: 2, stage: 'wrong_valley' }] }, fact: 'Trusted an uncertain river as a shortcut.' },
      ] },
      fixed: { title: 'A TOWN WITH TWO SPIRES', body: 'Two church spires line up with a railway cutting. The pencil goes firmly back on the chart. Nobody will have to admit which river that was.', fact: 'Recovered a firm position from the twin spires and railway.' },
      shortcut: { title: 'THE RIGHT VALLEY AFTER ALL', body: 'The river leads straight to the railway junction. The correction has saved distance: claim one Time if a physical token remains in the mission bag.', effects: [{ type: 'time' }], fact: 'The uncertain river proved to be a useful shortcut.' },
      wrong_valley: { title: 'A TOWN THAT IS NOT ON THE CHART', body: 'The railway should cross here. It does not. The aircraft must turn back toward the last reliable bearing; the crew now knows exactly what the gamble cost.', effects: [detour('wrong_valley_delay', 'Following the river took the aircraft into the wrong valley.')], fact: 'The river shortcut led into the wrong valley; lost time recovering the route.' },
    },
  },
  {
    id: 'flak_corridor', weight: 3, initial: 'warning', eligible: s => outbound(s) && distanceToTarget(s) >= 2 && healthyRadio(s),
    stages: {
      warning: { title: 'THE GUNS HAVE MOVED', body: 'A clipped radio warning names the railway crossing ahead. Reconnaissance missed a battery there. The planned route goes straight across its prepared field of fire.', choices: [
        { id: 'straight', label: 'Stay on the plotted course', detail: 'Flak salvos fire one extra shot until the next Progress. No route delay.', effects: [{ type: 'condition', id: 'prepared_battery', title: 'PREPARED FLAK CORRIDOR', description: 'The aircraft stayed on the route identified by the radio warning.', effectText: 'Each Flak salvo has +1 shot.', resolveText: 'Ends after the next Progress checkpoint.', expireText: 'The railway battery is behind the aircraft.', modifiers: { flakShots: 1 }, duration: 1 }], next: delay('crossed'), fact: 'Flew through the newly reported flak corridor.' },
        { id: 'detour', label: 'Go around the railway crossing', detail: 'The next Progress requires 1 extra Time; avoid the prepared battery.', effects: [detour('flak_detour', 'A fresh radio warning sent the aircraft around the railway battery.')], next: delay('outside'), fact: 'Detoured around a battery after a late reconnaissance warning.' },
      ] },
      crossed: { title: 'THE LAST BLACK BURST', body: 'The battery falls behind. The crossing’s name belongs in the report home. Now you know why the voice on the set sounded so urgent.', fact: 'Survived the warned flak corridor and left its battery behind.' },
      outside: { title: 'BURSTS OFF THE PORT WING', body: 'Far off the wing, black bursts mark the crossing you avoided. The detour has cost time, but the warning was real.', fact: 'Saw the warned battery firing along the route the crew had avoided.' },
    },
  },
  {
    id: 'fighter_hunters', weight: 3, initial: 'shadow', eligible: s => s.fighters.length > 0,
    stages: {
      shadow: { title: 'THEY ARE WAITING FOR A GAP', body: 'Fighters hang beyond effective range, waiting for a gap in the box. Hold formation and prepare a concentrated barrage, or tighten fire discipline: call approaching fighters over the interphone and fire short covering bursts, giving up some aimed shots.', choices: [
        { id: 'barrage', label: 'Make them respect the guns', detail: 'The next Advanced Fire costs no resource. New fighters arriving before the next Progress have +1 Engagement: the approaching flight is committed to repeated passes.', effects: [boon('warning_barrage', 'AMMUNITION LAID READY', 'advancedFire', 'The gunners have belts ready for a coordinated warning barrage.', 'The next Advanced Fire costs no Enlisted resource.'), { type: 'condition', id: 'drawn_hunters', title: 'A COMMITTED FIGHTER ATTACK', description: 'The approaching flight appears committed to repeated passes; the barrage is a response to that threat.', effectText: 'New fighters joining this committed attack have +1 Engagement; existing fighters are unchanged.', resolveText: 'Ends at the next Progress checkpoint.', expireText: 'This committed attack has passed; later arrivals use normal Engagement.', modifiers: { engagement: 1 }, duration: 1 }], next: delay('passing'), fact: 'Answered patient fighter hunters with a prepared barrage.' },
        { id: 'weave', label: 'Coordinate covering fire', detail: 'Until next Progress, enemy hit threshold +1 and one temporary MISS enters your own combat bag.', effects: [{ type: 'condition', id: 'evasive_weave', title: 'COORDINATED COVERING FIRE', description: 'The pilot holds formation while the gunners call out approaches and fire covering bursts. Fewer rounds are reserved for carefully aimed shots.', effectText: 'Enemy hit threshold +1; one temporary combat MISS makes your own aim harder.', resolveText: 'Ends at the next Progress checkpoint.', expireText: 'The first approaches have passed; the gunners resume their usual fire discipline.', modifiers: { enemyHit: 1 }, tokens: [{ bag: 'combat', token: 'Miss', count: 1 }], duration: 1 }], next: delay('passing'), fact: 'Held formation and coordinated covering fire against the fighter hunters, sacrificing aimed shots.' },
      ] },
      passing: { title: 'THE ATTACK CHANGES SHAPE', body: 'The first patient stalkers have had their chance. Any fighters still on the board remain real threats, with their own remaining Engagement; the brief tactical advantage has passed.', fact: 'Weathered the hunters’ attempt to find an uncovered approach.' },
    },
  },
  {
    id: 'broken_aerial', weight: 4, initial: 'silence',
    eligible: s => healthyRadio(s) && Boolean(damagedCell(s, c => STATIONS.radio.cells.includes(c.id))),
    bind: s => ({ cellId: damagedCell(s, c => STATIONS.radio.cells.includes(c.id)).id }),
    stages: {
      silence: { title: 'EVERY VOICE GOES THIN', body: 'The set survived the hit at {cellId}, but its aerial connection is failing. Calls to the escort are disappearing into static. The Radio Operator reports the failing connection; a worker can check it from inside the compartment.', choices: [
        { id: 'patch', label: 'Put a worker on the connection', eligible: canInspect, detail: 'Start a free 2-Time Repair at {cellId} with a healthy free worker. Escort calls stay blocked until the square is repaired.', effects: [{ type: 'condition', id: 'radio_silence', title: 'RADIO CONTACT LOST', description: 'The aerial connection at the damaged {cellId} is failing.', effectText: 'Summon Escort is unavailable.', resolveText: 'Repair {cellId}; all other actions remain available.', modifiers: { radioBlocked: true }, repairCell: '{cellId}' }, inspection], next: delay('listen'), fact: 'Lost radio contact; assigned a worker to repair the aerial connection.' },
        { id: 'wait', label: 'Keep the crew at their stations', detail: 'Escort calls are blocked until {cellId} is repaired. Regular Repair can be started later; there is no automatic recovery.', effects: [{ type: 'condition', id: 'radio_silence', title: 'RADIO CONTACT LOST', description: 'The damaged aerial connection was left while the crew stayed on their guns.', effectText: 'Summon Escort is unavailable.', resolveText: 'Repair {cellId}.', modifiers: { radioBlocked: true }, repairCell: '{cellId}' }], next: delay('listen'), fact: 'Lost radio contact but kept the crew on their fighting stations.' },
      ] },
      listen: { title: 'LISTENING FOR AN ANSWER', body: 'Static still fills the set. The same damaged connection prevents clear calls for help.', eligible: s => condition(s, 'radio_silence'), elseStage: 'voices', fact: 'Radio contact remained lost beyond the next checkpoint.' },
      voices: { title: 'SOMEONE SAYS YOUR CALL SIGN', body: 'A voice finally comes back clearly. Repairing the old hit has restored the aerial connection; normal Escort calls are possible again.', fact: 'Restored radio contact by repairing the damaged connection.' },
    },
  },
  {
    id: 'medical_locker', weight: 3, initial: 'find', eligible: s => Boolean(injured(s)) || s.stats.enemyAttacks >= 8, bind: crewBindings,
    stages: {
      find: { title: 'THE KIT UNDER THE SEAT', body: 'Moving a loose ammunition box uncovers a sealed emergency pouch from the previous crew. Dressings, clamps, an untouched ampoule. It is small enough to be forgotten, and useful enough that nobody laughs.', choices: [
        { id: 'medical', label: 'Hold it for treatment', detail: 'The next Medical action costs no resource. The worker and its normal Time are still required.', effects: [boon('spare_medical_kit', 'EXTRA MEDICAL SUPPLIES', 'medical', 'A sealed emergency pouch was found beneath an ammunition box.', 'The next Medical action costs no resource; normal workers and Time are required.')], fact: 'Found a forgotten medical pouch and saved it for treatment.' },
        { id: 'clamps', label: 'Use the clamps and sealing tape', detail: 'The next Repair action costs no resource. Normal crew work and Time still apply.', effects: [boon('spare_repair_kit', 'CLAMPS AND SEALING TAPE', 'repair', 'The forgotten emergency pouch supplied clamps and sealing tape.', 'The next Repair action costs no resource; normal workers and Time are required.')], fact: 'Put the forgotten emergency pouch’s clamps and tape aside for Repair.' },
      ] },
    },
  },
  {
    id: 'wounded_friend', weight: 2, initial: 'neighbor', eligible: s => outbound(s) && distanceToTarget(s) >= 3 && healthyRadio(s),
    stages: {
      neighbor: { title: 'A BOMBER WITH ONE SILENT WING', body: 'A damaged B-17 falls behind the box with two propellers feathered. Its radio asks for a position fix and someone to pass a fighter call. The lead permits a brief delay to relay a fix while it sorts out a heading home.', choices: [
        { id: 'help', label: 'Stay long enough to guide them', detail: 'The next Progress requires 1 extra Time. Their fighter call may bring you an Escort opportunity at a later checkpoint.', effects: [detour('friendly_guidance', 'The formation makes a brief course adjustment while bearings are checked and relayed to the damaged bomber.')], next: { after: 1, branches: [{ weight: 3, stage: 'thanks' }, { weight: 1, stage: 'lost_voice' }] }, fact: 'Stayed with a damaged friendly bomber to help it find a heading home.' },
        { id: 'bearing', label: 'Send the bearing and carry on', detail: 'No delay. Their fate stays uncertain; your crew keeps flying its own mission.', effects: [], next: delay('wave'), fact: 'Passed a damaged bomber a heading home without staying beside it.' },
      ] },
      thanks: { title: 'THEY PASSED YOUR CALL SIGN ON', body: 'An escort leader repeats your call sign. The bomber you helped reached another frequency and made sure you were mentioned. There is a patrol you can call without spending a resource.', effects: [boon('friendly_escort', 'A PATROL EXPECTS YOUR CALL', 'escort', 'The damaged bomber passed your call sign to an escort leader.', 'The next Summon Escort costs no resource. Radio availability and the Escort cap still apply.')], fact: 'The bomber helped earlier relayed the call; an Escort patrol offered support.' },
      lost_voice: { title: 'NO ANSWER ON THEIR FREQUENCY', body: 'The damaged bomber’s frequency has gone quiet. That is not proof of anything. You gave them a bearing when they needed one.', fact: 'Lost contact with the damaged bomber after guiding it homeward.' },
      wave: { title: 'A WING ROCKS BELOW', body: 'The other aircraft rocks once and turns onto your bearing. Its destination is now out of sight. Your own target is still ahead.', fact: 'Watched the damaged bomber turn home on the bearing you supplied.' },
    },
  },
  {
    id: 'ammunition_locker', weight: 2, initial: 'belt', eligible: s => s.stats.turns >= 8 && s.crew.some(c => ['leftWaist', 'rightWaist', 'tail'].includes(c.id) && c.health === 'healthy'),
    stages: {
      belt: { title: 'THE BELT THAT WAS PUT ASIDE', body: 'A gunner finds a belt tagged by the armourer: already checked, already straightened, held back for when there would be no time to clear a stoppage.', choices: [
        { id: 'ready', label: 'Lay it out for the next attack', detail: 'The next Advanced Fire costs no resource. Keep it until a real target offers itself.', effects: [boon('checked_belt', 'ARMOURER’S CHECKED BELT', 'advancedFire', 'A carefully prepared belt was found in the gunner’s reserve locker.', 'The next Advanced Fire costs no Enlisted resource.')], fact: 'Found the armourer’s checked belt and kept it ready for a difficult shot.' },
        { id: 'load', label: 'Feed it into the guns now', detail: 'One temporary HIT token enters the combat bag until the next Progress. It is ready if a firing opportunity comes before then.', effects: [{ type: 'condition', id: 'ready_ammunition', title: 'GUNS FED AND READY', description: 'The checked belt is in the guns for any attack along this stretch of the route.', effectText: 'One temporary HIT token is in the combat bag.', resolveText: 'Removed at the next Progress, from bag or discard.', expireText: 'The gunners reset their feeds for the next stretch; the brief readiness advantage has passed.', tone: 'positive', tokens: [{ bag: 'combat', token: 'Hit', count: 1 }], duration: 1 }], fact: 'Loaded the armourer’s checked belt for the next stretch of the route.' },
      ] },
    },
  },
  {
    id: 'target_markers', weight: 3, initial: 'flares', eligible: s => outbound(s) && distanceToTarget(s) === 1 && healthyRadio(s) && !condition(s, 'heavy_cloud'),
    stages: {
      flares: { title: 'A CORRECTED AIMING POINT', body: 'The radio identifies a late aiming-point correction from the lead ship over {targetName}. Following the formation onto the corrected line should make Course easier to judge, but the marked approach runs nearer the batteries.', choices: [
        { id: 'markers', label: 'Follow the corrected aiming line', detail: 'Course’s accepted range expands by 1 at both ends for this Bomb Run. Flak salvos get one extra shot until the next Progress.', effects: [{ type: 'condition', id: 'corrected_markers', title: 'CORRECTED TARGET MARKERS', description: 'The radio’s corrected marker line gives a clearer approach to {targetName}.', effectText: 'Bomb Run Course range expands by 1 at each end, within 1–6.', resolveText: 'Ends after the Bomb Run or on Turn Back.', tone: 'positive', modifiers: { bombRange: { course: 1 } }, until: 'bombed' }, { type: 'condition', id: 'marker_batteries', title: 'MARKED APPROACH BATTERIES', description: 'The corrected approach passes nearer the defended target line.', effectText: 'Flak salvos have +1 shot.', resolveText: 'Ends at the next Progress checkpoint.', expireText: 'The marked approach has brought the aircraft beyond the near batteries.', modifiers: { flakShots: 1 }, duration: 1 }], next: { at: 'target', stage: 'found' }, fact: 'Accepted a more exposed approach to follow the corrected target markers.' },
        { id: 'briefed', label: 'Keep the briefed approach', detail: 'Keep the normal target ranges and Flak rules. Ignore the late correction.', effects: [], fact: 'Kept the briefed approach to {targetName} despite a late aiming-point correction from the lead ship.' },
      ] },
      found: { title: 'THE MARKERS ARE THERE', body: 'The reported landmark lies across the aiming line exactly where the lead ship said it would. There is a little more room for error judging the Course.', eligible: s => condition(s, 'corrected_markers') && outbound(s) && Boolean(specialistOperator(s, 'bombardier')), fact: 'Found the corrected markers over {targetName} after taking the exposed approach.' },
    },
  },
  {
    id: 'homeward_sea', weight: 4, initial: 'coast', eligible: s => returning(s) && (s.engines.some(e => !e.running) || Boolean(injured(s)) || s.compromised.length > 0),
    stages: {
      coast: { title: 'WATER BETWEEN YOU AND HOME', body: 'The coast is falling behind. With the damaged aircraft dropping away from the homeward stream, the water looks much wider than it did on the way out. Descending toward the haze may hinder the fighters; the direct bearing preserves altitude.', choices: [
        { id: 'low', label: 'Take the low route home', eligible: s => s.altitude > 1, detail: 'Lose 1 Altitude. Until the next Progress, enemy hit threshold +1; sea haze makes the next approach harder to judge.', effects: [{ type: 'altitude', amount: -1 }, { type: 'condition', id: 'low_over_sea', title: 'LOW OVER THE SEA', description: 'The damaged straggler descended into sea haze, making the next fighter approach harder to judge.', effectText: 'Enemy hit threshold +1.', resolveText: 'Ends at the next Progress checkpoint.', expireText: 'The fighters have had time to adjust to the lower route; altitude remains where the aircraft descended.', modifiers: { enemyHit: 1 }, duration: 1 }], fact: 'Brought the damaged aircraft home low over the sea.' },
        { id: 'direct', label: 'Trust the direct bearing', detail: 'No immediate penalty. At the next Progress, a landmark may grant one available physical Time—or the crew may simply have to keep flying.', effects: [], next: { after: 1, branches: [{ weight: 3, stage: 'lighthouse' }, { weight: 2, stage: 'grey_water' }] }, fact: 'Trusted a direct sea crossing while bringing a damaged crew and aircraft home.' },
      ] },
      lighthouse: { title: 'A LIGHTHOUSE THROUGH THE HAZE', body: 'The light appears off the wing, exactly on the bearing. The chart confirms the shorter run home. Claim one Time if a physical token is available.', effects: [{ type: 'time' }], fact: 'Found the lighthouse on the homeward bearing and saved flying time.' },
      grey_water: { title: 'STILL NOTHING BUT WATER', body: 'The wings stay level over the grey water. Nothing has gone wrong with the bearing; there is simply no landmark yet. The guns, the jobs and the remaining Progress still have to carry you home.', fact: 'Crossed featureless water on the direct homeward bearing.' },
    },
  },
  {
    id: 'hydraulic_damage', weight: 4, initial: 'pressure',
    eligible: s => outbound(s) && distanceToTarget(s) <= 3 && distanceToTarget(s) >= 1 && Boolean(damagedCell(s, c => c.section === 'Fuselage')),
    bind: s => ({ cellId: damagedCell(s, c => c.section === 'Fuselage').id }),
    stages: {
      pressure: { title: 'THE BOMB DOORS HESITATE', body: 'A damaged electrical connection near {cellId} interrupts the bomb-door motor during its check. If it cannot be restored, the crew must prepare the manual crank and coordinate opening over the interphone, taking attention from bombing corrections.', choices: [
        { id: 'repair', label: 'Repair the connection before the target', eligible: canInspect, detail: 'A healthy free worker starts a free 2-Time Repair of {cellId}. Officer Bomb Run rerolls are blocked only while the damage remains.', effects: [{ type: 'condition', id: 'door_pressure', title: 'BOMB DOOR MOTOR TROUBLE', description: 'The motor connection beside {cellId} needs repair before normal door operation is reliable.', effectText: 'Officer-resource Bomb Run rerolls are unavailable while unresolved.', resolveText: 'Repair {cellId}, complete the Bomb Run, or Turn Back.', modifiers: { bombOfficerBlocked: true }, repairCell: '{cellId}', until: 'bombed' }, inspection], next: { at: 'target', stage: 'doors' }, fact: 'Assigned a worker to repair the bomb-door motor connection before {targetName}.' },
        { id: 'hold', label: 'Prepare manual door operation', detail: 'Officer-resource rerolls are unavailable on this Bomb Run unless {cellId} is repaired first. The Bombardier’s free reroll remains.', effects: [{ type: 'condition', id: 'door_pressure', title: 'BOMB DOOR MOTOR TROUBLE', description: 'The crew must crank the doors open and relay readiness while the motor connection remains damaged.', effectText: 'Officer-resource Bomb Run rerolls are unavailable while unresolved.', resolveText: 'Repair {cellId}, complete the Bomb Run, or Turn Back.', modifiers: { bombOfficerBlocked: true }, repairCell: '{cellId}', until: 'bombed' }], next: { at: 'target', stage: 'doors' }, fact: 'Kept the crew on other tasks and prepared to crank the bomb doors open manually.' },
      ] },
      doors: { title: 'CRANK THE DOORS OPEN', body: 'The motor trouble has followed you to {targetName}. Manual opening and readiness calls occupy the interphone during the approach, leaving less time for additional bombing corrections.', eligible: s => condition(s, 'door_pressure') && outbound(s) && Boolean(specialistOperator(s, 'bombardier')), elseStage: 'repaired', fact: 'Used manual bomb-door operation at {targetName} because the motor connection remained damaged.' },
      repaired: { title: 'THE DOORS OPEN CLEANLY', body: 'The earlier work paid off. The motor runs, the doors open, and the bombing station can call for corrections normally.', eligible: s => Boolean(specialistOperator(s, 'bombardier')), elseStage: 'no_drop', fact: 'The repaired bomb-door connection worked at {targetName}.' },
      no_drop: { title: 'THE DOORS ARE NO LONGER THE PROBLEM', body: 'The earlier motor trouble has been overtaken by events. Nobody qualified is operating the Bombardier station; there can be no drop over {targetName}.', fact: 'Reached {targetName} after bomb-door trouble, but the missing Bombardier function prevented a drop.' },
    },
  },
];

export const STORY_CONTENT_COUNTS = Object.freeze({
  families: STORY_THREADS.length,
  stages: STORY_THREADS.reduce((sum, thread) => sum + Object.keys(thread.stages).length, 0),
  choices: STORY_THREADS.reduce((sum, thread) => sum + Object.values(thread.stages).reduce((n, stage) => n + (stage.choices?.length ?? 0), 0), 0),
});
