// Pure view models: selecting and previewing never mutates a game or consumes RNG.
import { CREW_DEFS, STATIONS, getCell } from './board.mjs';
import { availableCrew, isAtStation, legalTargets, operatingArc } from './rules.mjs';
import { isV2 } from './rulesets.mjs';
import { homeStationId, currentStationId } from './crew-position.mjs';

export const crewDefinition = id => CREW_DEFS.find(c => c.id === id);
export const SHORT_NAMES = { pilot:'Pilot',copilot:'Copilot',navigator:'Nav',bombardier:'Bomb',engineer:'Eng.',radio:'Radio',ball:'Ball',leftWaist:'L. Waist',rightWaist:'R. Waist',tail:'Tail' };
const ACTION_ICONS = {
  repair: '<path d="M14.6 6.4a5 5 0 0 0 6.3 6.3l-9.4 9.4a2.1 2.1 0 0 1-3-3l9.4-9.4a5 5 0 0 0-6.3-6.3l3 3-3.8 3.8-3-3a5 5 0 0 0 6.8-.8Z"/>',
  fireControl: '<path d="M12 22c4.4 0 7-3 7-6.8 0-2.5-1.4-4.6-3.7-6.8.1 2.1-.6 3.2-1.5 3.8C14 8.1 12.4 5 9.2 2.5c.5 4.1-3.7 6.4-3.7 12.3C5.5 18.8 8.2 22 12 22Z"/><path d="M12 18.8c1.5 0 2.5-1.1 2.5-2.5 0-1-.5-1.8-1.4-2.7-.1 1-.6 1.6-1.4 2-.2-1.2-.7-2-1.5-2.7-.1 2-1.1 2.7-1.1 3.6 0 1.3 1.1 2.3 2.9 2.3Z"/>',
  medical: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
  combat: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
  assistWork: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1.4a6 6 0 0 1 12 0V20M17 5.5a3 3 0 0 1 0 5.8M18 15a4.5 4.5 0 0 1 3 4.2V20"/>',
  move: '<path d="M12 3v18M3 12h18M12 3 8.5 6.5M12 3l3.5 3.5M21 12l-3.5-3.5M21 12l-3.5 3.5M12 21l-3.5-3.5M12 21l3.5-3.5M3 12l3.5-3.5M3 12l3.5 3.5"/>',
  engine: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2.2 2.2M16.8 16.8 19 19M19 5l-2.2 2.2M7.2 16.8 5 19"/>',
  convert: '<path d="M4 7h15l-3-3M20 17H5l3 3"/>',
  escort: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m12 7 1.4 3h3.1l-2.5 1.9 1 3.1-3-1.9-3 1.9 1-3.1L7.5 10h3.1L12 7Z"/>',
  wait: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
};
const ACTION_LABELS = {
  assistWork: ['Assist Work', 'ASSIST'], basicFire: ['Basic Fire', 'BASIC FIRE'], advancedFire: ['Advanced Fire', 'ADV. FIRE'],
  repair: ['Repair', 'REPAIR'], fireControl: ['Fire Control', 'FIRE CTRL'], medical: ['Medical', 'MEDICAL'],
  relocate: ['Relocate', 'MOVE'], manCockpit: ['Man Cockpit', 'COCKPIT'], manStation: ['Man Station', 'STATION'],
  reclaimHome: ['Reclaim Home Station', 'RECLAIM'], returnHome: ['Return Home', 'HOME'], leaveStation: ['Leave Station', 'LEAVE'], restartEngine: ['Restart Engine', 'ENGINE'],
  directFire: ['Direct Fire', 'DIRECT FIRE'], convert: ['Convert Resources', 'CONVERT'], rotateFighter: ['Distract Fighter', 'DISTRACT'],
  escort: ['Summon Escort', 'ESCORT'], wait: ['No Action', 'NO ACTION'],
};
const iconKind = action => ({ basicFire:'combat', advancedFire:'combat', directFire:'combat', rotateFighter:'combat', manCockpit:'move', manStation:'move', reclaimHome:'move', returnHome:'move', leaveStation:'move', relocate:'move', restartEngine:'engine' })[action] || action;
export function actionIconMarkup(action, className = 'action-glyph') {
  const kind = iconKind(action), paths = ACTION_ICONS[kind] || ACTION_ICONS.wait;
  return `<svg class="${className}" data-action-icon="${kind}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
export function crewActionMarker(state, crew) {
  const job = state.jobs.find(item => item.crewId === crew.id || item.assistantId === crew.id || item.kind === 'medical' && item.targetId === crew.id);
  if (job) {
    if (job.targetId === crew.id && job.kind === 'medical') return { action:'medical', label:'Receiving Medical', short:'MEDICAL', title:'Being treated with Medical' };
    if (job.assistantId === crew.id) return { action:'assistWork', label:`Assisting ${ACTION_LABELS[job.kind]?.[0] || 'work'}`, short:'ASSIST', title:`Assisting with ${ACTION_LABELS[job.kind]?.[0] || 'work'}` };
    return { action:job.kind, label:ACTION_LABELS[job.kind]?.[0] || 'Working', short:ACTION_LABELS[job.kind]?.[1] || 'WORK', title:`${ACTION_LABELS[job.kind]?.[0] || 'Work'} in progress` };
  }
  if (!crew.lastAction) return null;
  const [label, short] = ACTION_LABELS[crew.lastAction] || ['Action taken', 'ACTED'];
  return { action:crew.lastAction, label, short, title:`Action this round: ${label}` };
}
export function crewStatus(state, crew, selected = false) {
  const job=state.jobs.find(j=>j.id===crew.job);
  const treatment=state.jobs.find(j=>j.kind==='medical'&&j.targetId===crew.id);
  if(crew.health==='dead')return {id:'dead',label:'Dead',short:'DEAD',icon:'×',job:null};
  if(treatment)return {id:'treated',label:'Being treated',short:'CARE',icon:'✚',job:treatment};
  if(crew.health==='injured')return {id:'injured',label:'Injured',short:'HURT',icon:'✚',job:null};
  if(job){const types={repair:['repair','Repair','FIX','⚒'],fireControl:['fire','Fire Control','FIRE','♨'],medical:['medical','Medical','MED','✚']};const [id,label,short,icon]=types[job.kind]??['working','Working','WORK','⌛'];return {id,label,short,icon,job};}
  if(state.phase==='action'&&state.activeCrew===crew.id&&!crew.activationCompleted)return {id:'active',label:'Acting',short:'ACT',icon:'▶'};
  if(isV2(state)?crew.cycleSlotConsumed:crew.used)return {id:'used',label:isV2(state)?'Cycle slot consumed':'Used / tapped',short:'USED',icon:'✓'};
  if(selected)return {id:'selected',label:'Selected',short:'READY',icon:'◉'};
  return {id:'ready',label:'Ready',short:'READY',icon:'●'};
}
export function stationStatus(state, crew) {
  const homeId=homeStationId(crew),currentId=currentStationId(crew),station=STATIONS[currentId??homeId];
  const operator=state.crew.find(c=>currentStationId(c)===(currentId??homeId)&&isAtStation(state,c));
  const cockpit=['pilot','copilot'].includes(currentId??homeId);
  const operating=isAtStation(state,crew);
  return { name:station?.name??'No station',operating,cockpit,homeId,currentId,
    homeName:STATIONS[homeId]?.name??'Unknown',currentName:currentId?STATIONS[currentId].name:'None',displaced:currentId===null,
    label:operating?(cockpit?'CONTROLLING AIRCRAFT':'OPERATING STATION'):operator?`COVERED BY ${crewDefinition(operator.id).name.toUpperCase()}`:cockpit?'SEAT UNCONTROLLED':'STATION UNOPERATED',
    position:crew.position.join(' + '),job:state.jobs.find(j=>j.id===crew.job)??null };
}
export function availableCount(state) {
  const active=state.crew.find(c=>c.id===state.activeCrew);
  return availableCrew(state).length+(state.phase==='action'&&active?.health==='healthy'&&!active.job&&!active.activationCompleted?1:0);
}
const STATION_ACTIONS=new Set(['reclaimHome','returnHome','manStation','manCockpit','leaveStation','basicFire','advancedFire','restartEngine','opportunityShot']);
const ROLE_ACTIONS=new Set(['directFire','convert','rotateFighter','escort']);
export function actionGroup(id) {return STATION_ACTIONS.has(id)?'Station Actions':ROLE_ACTIONS.has(id)?'Role Actions':'General Actions';}
export function arcPreview(state,crewId) {
  const arc=operatingArc(state,crewId);
  return {arc, fighterIds:arc?legalTargets(state,crewId).map(f=>f.id):[],sectors:arc?arc.quadrants.flatMap(quadrant=>arc.altitudes.map(altitude=>`${quadrant}/${altitude}`)):[]};
}
export function footprintCenter(position) {
  const squares=position.map(getCell).filter(Boolean);
  return squares.length?{x:squares.reduce((sum,c)=>sum+c.x+.5,0)/squares.length,y:squares.reduce((sum,c)=>sum+c.y+.5,0)/squares.length}:null;
}
export function headingLabel(degrees) {return ({0:'N',90:'E',180:'S',270:'W'})[((degrees%360)+360)%360]??`${degrees}°`;}
