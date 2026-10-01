import { legalTargets, eligibleCrisisTargets, eligibleMedicalTargets, crisisTargetCap, connectedTargetSelection, legalWorkPositions, opportunityGunners, opportunityAvailability, directFireGunners, eligibleAssistants } from './rules.mjs';
import { isV2 } from './rulesets.mjs';

export const DIRECT_ACTIONS = ['basicFire','advancedFire','opportunityShot','directFire','rotateFighter','repair','fireControl','medical'];
export function beginTargeting(action, crewId) { return {action,crewId,cells:[],targetId:null,workCellId:null,gunnerId:null,stage:['opportunityShot','directFire'].includes(action)?'gunner':'target'}; }
export function selectableGunners(s,action='opportunityShot') {return action==='directFire'?directFireGunners(s):opportunityGunners(s);}
export function targetOptions(s,t) {
  if(!t)return {fighters:[],cells:[],crew:[],work:[]};
  const fighters=t.action==='rotateFighter'?s.fighters.filter(f=>f.facing<180):['basicFire','advancedFire','opportunityShot','directFire'].includes(t.action)?legalTargets(s,t.gunnerId??t.crewId):[];
  const crew=t.stage==='gunner'?selectableGunners(s,t.action):t.action==='medical'?eligibleMedicalTargets(s,t.crewId):[];
  const cells=['repair','fireControl'].includes(t.action)?eligibleCrisisTargets(s,t.action).filter(c=>t.cells.includes(c.id)||t.cells.length<crisisTargetCap(s,t.crewId,t.action)&&(!t.cells.length||connectedTargetSelection(s,t.action,[...t.cells,c.id]))):[];
  const workTargets=t.action==='medical'?(s.crew.find(c=>c.id===t.targetId)?.position??[]):t.cells;
  return {fighters:fighters.map(f=>f.id),crew:crew.map(c=>c.id),cells:cells.map(c=>c.id),work:workTargets.length?legalWorkPositions(s,t.crewId,workTargets).map(c=>c.id):[]};
}
export function selectTarget(s,t,kind,id) {
  const options=targetOptions(s,t);
  if(t.stage==='work')return kind==='cell'&&options.work.includes(id)?{...t,workCellId:id}:t;
  if(kind==='crew'&&options.crew.includes(id))return t.stage==='gunner'?{...t,gunnerId:id,stage:'target',targetId:null}:{...t,targetId:id,workCellId:null};
  if(kind==='fighter'&&options.fighters.includes(id))return {...t,targetId:id};
  if(kind==='cell'&&options.cells.includes(id)) {
    const cells=t.cells.includes(id)?t.cells.filter(c=>c!==id):[...t.cells,id];
    if(cells.length>crisisTargetCap(s,t.crewId,t.action)||cells.length&&!connectedTargetSelection(s,t.action,cells))return t;
    return {...t,cells,workCellId:null};
  }
  return t;
}
export function needsWorkPosition(t) {return ['repair','fireControl','medical'].includes(t.action);}
export function assistantOptions(s,t) {
  if(!isV2(s)||!t||!needsWorkPosition(t))return [];
  const targets=t.action==='medical'?(s.crew.find(c=>c.id===t.targetId)?.position??[]):t.cells;
  return eligibleAssistants(s,t.crewId).filter(c=>c.id!==t.targetId&&(!t.workCellId||legalWorkPositions(s,c.id,targets).some(position=>position.id===t.workCellId)));
}
export function canConfirm(s,t) {
  if(!t)return false;
  if(t.action==='opportunityShot'&&(!opportunityAvailability(s).enabled||!opportunityGunners(s).some(c=>c.id===t.gunnerId)))return false;
  if(t.action==='directFire'&&!directFireGunners(s).some(c=>c.id===t.gunnerId))return false;
  const options=targetOptions(s,t);
  if(needsWorkPosition(t))return (t.action==='medical'?options.crew.includes(t.targetId):t.cells.length>0)&&t.stage==='work'&&options.work.includes(t.workCellId)&&(!t.assistantId||assistantOptions(s,t).some(c=>c.id===t.assistantId));
  return options.fighters.includes(t.targetId);
}
export function targetingCommand(t) {return t.action==='opportunityShot'?{type:'opportunityShot',gunnerId:t.gunnerId,targetId:t.targetId}:{type:'action',action:t.action,...(t.cells.length?{cells:t.cells}:{}),...(t.targetId?{targetId:t.targetId}:{}),...(t.gunnerId?{gunnerId:t.gunnerId}:{}),...(t.workCellId?{workCellId:t.workCellId}:{}),...(t.assistantId?{assistantId:t.assistantId}:{})};}
