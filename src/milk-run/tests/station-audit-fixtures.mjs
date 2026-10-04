import { createGame } from '../state.mjs';
import { STATIONS } from '../board.mjs';
import { dispatch } from '../rules.mjs';
export const member=(s,id)=>s.crew.find(c=>c.id===id);
export const fresh=(extra={},ruleset='v2-continuous')=>{
  let s=createGame({v2StoryMode:false,v2CompactCrewFlow:true,opportunityEnabled:false,missionEnemy:0,missionResource:100,v2MissionEnemy:0,v2MissionResource:100,v2CrewCycleRefreshGrantsTime:false,...extra},'station-audit',ruleset);
  return ruleset==='v1'?dispatch(s,{type:'startRound'}).state:s;
};
// Action-only fixtures preserve all unrelated crew flags. Lifecycle tests use
// real activate/draw commands separately.
export function prepared(s,id){s=structuredClone(s);s.phase='action';s.activeCrew=id;member(s,id).used=true;member(s,id).cycleSlotConsumed=true;member(s,id).activationCompleted=false;return s;}
export const action=(s,id,action,extra={})=>dispatch(prepared(s,id),{type:'action',action,...extra});
export function replacement(home='pilot',substitute='navigator',blocked='free',ruleset='v2-continuous'){
  let s=fresh({},ruleset);member(s,home).health='injured';s=action(s,substitute,'manStation',{stationId:home}).state;
  member(s,home).health='healthy';
  if(blocked==='fire')s.cells[STATIONS[substitute].cells[0]]='fire';
  if(['occupied','injured','dead'].includes(blocked)){
    const third=['engineer','radio','tail'].find(id=>id!==home&&id!==substitute);
    s=action(s,third,'manStation',{stationId:substitute}).state;
    if(blocked!=='occupied')member(s,third).health=blocked;
  }
  return s;
}
export const stacked=(home='pilot',substitute='navigator',blocked='occupied',ruleset)=>action(replacement(home,substitute,blocked,ruleset),home,'reclaimHome').state;
export const session=s=>({version:1,presentationVersion:2,state:s,view:structuredClone(s),pending:[],current:null,log:[],speed:'instant'});
