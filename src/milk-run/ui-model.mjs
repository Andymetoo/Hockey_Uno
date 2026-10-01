// Pure view models: selecting and previewing never mutates a game or consumes RNG.
import { CREW_DEFS, STATIONS, getCell } from './board.mjs';
import { availableCrew, isAtStation, legalTargets, operatingArc } from './rules.mjs';
import { isV2 } from './rulesets.mjs';

export const crewDefinition = id => CREW_DEFS.find(c => c.id === id);
export const SHORT_NAMES = { pilot:'Pilot',copilot:'Copilot',navigator:'Nav',bombardier:'Bomb',engineer:'Eng.',radio:'Radio',ball:'Ball',leftWaist:'L. Waist',rightWaist:'R. Waist',tail:'Tail' };
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
  const station=STATIONS[crew.station];
  const operator=state.crew.find(c=>c.station===crew.station&&isAtStation(state,c));
  const cockpit=['pilot','copilot'].includes(crew.station);
  const operating=isAtStation(state,crew);
  return { name:station?.name??'No station',operating,cockpit,
    label:operating?(cockpit?'CONTROLLING AIRCRAFT':'OPERATING STATION'):operator?`COVERED BY ${crewDefinition(operator.id).name.toUpperCase()}`:cockpit?'SEAT UNCONTROLLED':'STATION UNOPERATED',
    position:crew.position.join(' + '),job:state.jobs.find(j=>j.id===crew.job)??null };
}
export function availableCount(state) {
  const active=state.crew.find(c=>c.id===state.activeCrew);
  return availableCrew(state).length+(state.phase==='action'&&active?.health==='healthy'&&!active.job&&!active.activationCompleted?1:0);
}
const STATION_ACTIONS=new Set(['basicFire','advancedFire','restartEngine','opportunityShot']);
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
