import { BOARD, SECTIONS, CREW_DEFS, STATIONS, QUADRANTS, ALTITUDES, getCell } from './board.mjs';
import { crewStatus, footprintCenter, arcPreview, stationStatus } from './ui-model.mjs';
import { fighterHeading } from './spatial.mjs';
import { targetOptions } from './targeting.mjs';
import { currentStationId } from './crew-position.mjs';
import { isV2 } from './rulesets.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bx=89,by=87,step=36;
const markerStrokeMargin=2.5; // Includes the widest selected-token outline.
const clamp=(value,minimum,maximum)=>Math.max(minimum,Math.min(maximum,value));

// Presentation snapshots only. These maps never enter saves or the rule engine.
export function crewPositions(state) {
  return new Map(crewMarkerLayout(state).map(marker=>[marker.id,{x:marker.x,y:marker.y,footprint:marker.footprint}]));
}
export function boardMotionDuration(speed='normal',reducedMotion=false) {
  return reducedMotion||speed==='instant'?0:speed==='fast'?120:360;
}
const structuralEdges=BOARD.filter(cell=>cell.structure).flatMap(cell=>{
  const x=bx+cell.x*step,y=by+cell.y*step;
  return [[0,-1,`M${x} ${y}h${step}`],[1,0,`M${x+step} ${y}v${step}`],[0,1,`M${x} ${y+step}h${step}`],[-1,0,`M${x} ${y}v${step}`]]
    .filter(([dx,dy])=>!BOARD.some(other=>other.structure&&other.x===cell.x+dx&&other.y===cell.y+dy))
    .map(([, ,path])=>path);
}).join(' ');
// Only a real bag pull identifies a firing gunner. Damage can also be an Escort.
const shotEvents=new Set(['GUNNER_SHOT_ROLL']);
const crewCueEvents=new Set(['CREW_ACTIVATED','CREW_INJURED','CREW_KILLED','CREW_HEALED','WORK_STARTED','WORK_ASSISTED','CREW_DISPLACED','CREW_RETURNED','CREW_RELOCATED','STATION_MANNED','COCKPIT_MANNED','STATION_RECLAIMED']);
function connectorPath(from,to,startGap=18,endGap=42) {
  const distance=Math.hypot(to.x-from.x,to.y-from.y),dx=(to.x-from.x)/(distance||1),dy=(to.y-from.y)/(distance||1);
  const start=Math.min(startGap,distance/3),end=Math.min(endGap,distance/3);
  return `M${from.x+dx*start} ${from.y+dy*start}L${to.x-dx*end} ${to.y-dy*end}`;
}

/** Visual-only packing inside each person's actual one/two-square footprint.
 * Station tokens keep their exact centers. Crowded work tokens shrink and fan
 * inside that location; neither their bodies nor status badges enter a wing or
 * imply a different occupied sub-square. Hit detection never reads this layout.
 */
export function crewMarkerLayout(state) {
  const entries=state.crew.flatMap(crew=>{
    const cells=crew.position.map(getCell).filter(Boolean),center=footprintCenter(crew.position);
    if(!cells.length||!center)return [];
    const assigned=STATIONS[crew.station]?.cells??[];
    return [{id:crew.id,number:CREW_DEFS.find(def=>def.id===crew.id).number,health:crew.health,
      anchor:{x:bx+center.x*step,y:by+center.y*step},
      bounds:{left:bx+Math.min(...cells.map(c=>c.x))*step,top:by+Math.min(...cells.map(c=>c.y))*step,
        right:bx+(Math.max(...cells.map(c=>c.x))+1)*step,bottom:by+(Math.max(...cells.map(c=>c.y))+1)*step},
      footprint:[...crew.position].sort().join(' '),
      fixed:currentStationId(crew)!==null&&assigned.length===crew.position.length&&assigned.every(id=>crew.position.includes(id))}];
  });
  // A replacement may legitimately share a cockpit footprint with its dead
  // former occupant. Keep the living operator centered and stack the casualty.
  for(const footprint of new Set(entries.filter(entry=>entry.fixed).map(entry=>entry.footprint))) {
    const seated=entries.filter(entry=>entry.fixed&&entry.footprint===footprint)
      .sort((a,b)=>({healthy:0,injured:1,dead:2}[a.health]??3)-({healthy:0,injured:1,dead:2}[b.health]??3)||a.number-b.number);
    for(const duplicate of seated.slice(1))duplicate.fixed=false;
  }
  const placed=[];
  // A worker must never displace an otherwise centered station token.
  for(const entry of [...entries].sort((a,b)=>Number(b.fixed)-Number(a.fixed)||a.number-b.number)) {
    const peers=entries.filter(other=>!other.fixed&&other.footprint===entry.footprint).sort((a,b)=>a.number-b.number);
    const resident=entries.some(other=>other.id!==entry.id&&other.fixed&&other.footprint===entry.footprint);
    const count=peers.length,index=peers.findIndex(other=>other.id===entry.id);
    const near=placed.filter(other=>Math.hypot(other.x-entry.anchor.x,other.y-entry.anchor.y)<32);
    let radius=15.5,x=entry.anchor.x,y=entry.anchor.y;
    if(!entry.fixed) {
      if(count>1||resident) {
        radius=resident?(count<=4?7.5:5.5):count===2?10.5:count<=4?8.5:count<=9?6.5:5.5;
        const margin=radius+markerStrokeMargin,b=entry.bounds;
        const columns=count===2?2:count<=4?2:count<=9?3:4,rows=Math.ceil(count/columns);
        if(resident&&count<=4) {
          const corners=[[1,1],[0,0],[1,0],[0,1]],corner=corners[index];
          x=corner[0]?b.right-margin:b.left+margin;
          y=corner[1]?b.bottom-margin:b.top+margin;
        } else if(count===2) {
          x=index?b.right-margin:b.left+margin;
          y=index?b.bottom-margin:b.top+margin;
        } else {
          const column=index%columns,row=Math.floor(index/columns);
          x=b.left+margin+(b.right-b.left-margin*2)*column/(columns-1);
          y=rows===1?entry.anchor.y:b.top+margin+(b.bottom-b.top-margin*2)*row/(rows-1);
        }
      } else if(near.length) {
        radius=14;
        const other=near[0],dx=entry.anchor.x-other.x,dy=entry.anchor.y-other.y;
        x+=dx===0?0:Math.sign(dx)*19;y+=dy===0?0:Math.sign(dy)*19;
      }
    }
    const margin=radius+markerStrokeMargin,b=entry.bounds;
    x=clamp(x,b.left+margin,b.right-margin);y=clamp(y,b.top+margin,b.bottom-margin);
    const badgeRadius=Math.min(5,radius*.28);
    placed.push({...entry,x,y,radius,outerRadius:margin,stackCount:count+(resident?1:0),
      numberSize:radius>=14?18:radius>=10?13:radius>=8?11:radius>=6?9:7,
      // Dense stacks retain status color and an accessible label; the crew rack
      // keeps the full-size status icon available on touch screens.
      badge:radius>=8?{x:x+radius*.52,y:y+radius*.68,radius:badgeRadius,fontSize:Math.min(11,badgeRadius*1.8)}:null});
  }
  return entries.map(entry=>placed.find(marker=>marker.id===entry.id));
}

export const sectorPoint=(q,a)=>{const i=ALTITUDES.indexOf(a);return q==='Fore'?[232+i*74,47]:q==='Aft'?[232+i*74,563]:q==='Port'?[47,234+i*74]:[567,234+i*74];};
const engagementConfigKey={'BF-109':'v2Bf109Engagement','BF-110':'v2Bf110Engagement','FW-190':'v2Fw190Engagement','Me-262':'v2Me262Engagement'};
function fighterSegments(value,maximum,radius,kind) {
  if(!Number.isFinite(maximum)||maximum<=0)return '';
  const gap=Math.min(22,180/maximum),span=360/maximum-gap;
  return Array.from({length:maximum},(_,index)=>{
    const start=(-90+index*360/maximum+gap/2)*Math.PI/180,end=(-90+index*360/maximum+360/maximum-gap/2)*Math.PI/180;
    const x1=radius*Math.cos(start),y1=radius*Math.sin(start),x2=radius*Math.cos(end),y2=radius*Math.sin(end);
    const filled=index<value;
    return `<path class="fighter-status-segment ${kind} ${filled?'filled':'depleted'}" d="M${x1.toFixed(2)} ${y1.toFixed(2)}A${radius} ${radius} 0 ${span>180?1:0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}"/>`;
  }).join('');
}
function fighterStatusMarkup(state,f) {
  const hpMaximum=Math.max(1,Math.floor(f.maxHp??1)),hp=Math.max(0,Math.min(hpMaximum,f.hp??0));
  const key=engagementConfigKey[f.type],engMaximum=key?Math.max(1,Math.floor(state.config[key]??0)):0,eng=Math.max(0,Math.min(engMaximum,f.engagementRemaining??0));
  const engagement=isV2(state)&&engMaximum?`<g class="fighter-engagement-ring" aria-hidden="true">${fighterSegments(eng,engMaximum,36,'engagement')}</g>`:'';
  return `<g class="fighter-status-indicators" aria-hidden="true"><g class="fighter-hp-ring">${fighterSegments(hp,hpMaximum,29,'hp')}</g>${engagement}</g>`;
}
export function boardMarkup(s,{selectedCrew,interaction:t,visual={},current,previousFighters=new Map(),previousCrew=new Map(),presentationSpeed='normal',reducedMotion=false,animate=true,hitMap=null,hitMapEnabled=false,hitMapStructure=true,hitMapEmpty=true}={}) {
  const options=targetOptions(s,t),preview=arcPreview(s,t?.gunnerId??t?.crewId??selectedCrew);
  const aimed=t&&['basicFire','advancedFire','opportunityShot','directFire','rotateFighter'].includes(t.action)&&t.stage!=='gunner';
  const worked=new Set(s.jobs.flatMap(j=>j.cells??[]));
  const focus=visual.focusCell??(current?.type==='ENEMY_HIT_LOCATION'?null:current?.cellId);
  const duration=animate?boardMotionDuration(presentationSpeed,reducedMotion):0;
  const positions=fighterPositions(s);
  let svg=`<svg viewBox="0 0 620 620" aria-label="B-17 damage board, columns A to F, rows 1 to 6" role="group"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L6 0" stroke="#653c21" stroke-width="1.3" opacity=".5"/></pattern><linearGradient id="fighter-hp-gradient" x1="-40" y1="-40" x2="40" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="#52a7dc"/><stop offset="1" stop-color="#123b68"/></linearGradient><linearGradient id="fighter-engagement-gradient" x1="-40" y1="-40" x2="40" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="#dc9b57"/><stop offset="1" stop-color="#8a2545"/></linearGradient></defs><rect width="620" height="620" fill="#e8e8d8" rx="12"/><text x="310" y="21" class="compass-label" text-anchor="middle">FORE</text><text x="310" y="611" class="compass-label" text-anchor="middle">AFT</text><text x="20" y="309" transform="rotate(-90 20 309)" class="compass-label" text-anchor="middle">PORT</text><text x="607" y="309" transform="rotate(90 607 309)" class="compass-label" text-anchor="middle">STARBOARD</text>`;
  svg=svg.replace('<svg viewBox=',`<svg class="plotting-board ${t?'is-targeting':''} ${duration?'motion-enabled':'motion-static'}" data-board-beat="${esc(current?.beat??current?.sequence??'')}" data-board-event="${esc(current?.type??'')}" viewBox=`);
  svg+=`<g class="plotting-furniture" aria-hidden="true" pointer-events="none"><rect x="5" y="5" width="610" height="610" rx="8"/><path d="M89 67v-10h28m376 0h28v10M89 539v10h28m376 0h28v-10"/><text x="91" y="31">B-17 / TACTICAL PLOT</text><text x="525" y="590" text-anchor="end">CREW · STRUCTURE · CONTACTS</text></g><rect data-frame-aircraft="true" x="${bx}" y="${by}" width="432" height="432" fill="none" pointer-events="none"/>`;
  for(let i=0;i<6;i++)svg+=`<text x="${bx+i*72+36}" y="78" class="grid-label" text-anchor="middle">${'ABCDEF'[i]}</text><text x="77" y="${by+i*72+41}" class="grid-label" text-anchor="middle">${i+1}</text>`;
  for(const c of BOARD) {
    const x=bx+c.x*step,y=by+c.y*step,state=s.cells[c.id],indicator=c.engineIndicator?s.engines.find(e=>e.id===c.engineIndicator):null;
    const legal=t?.stage==='work'?options.work.includes(c.id):options.cells.includes(c.id),chosen=t?.cells.includes(c.id),work=t?.workCellId===c.id;
    const job=s.jobs.find(j=>j.cells?.includes(c.id)),suppressed=state==='fire'&&job?.kind==='fireControl';
    const description=c.structure?`${SECTIONS[c.section].name}, ${state}${c.engine?`, engine ${c.engine}`:''}${suppressed?', Fire suppressed by active Fire Control':''}`:indicator?`${indicator.id} ${indicator.running?'running':'stopped'} indicator only; no aircraft structure`:'open sky';
    svg+=`<g data-cell="${c.id}" ${t?.stage==='work'&&legal?`data-work-cell="${c.id}"`:''} data-structure="${c.structure}" data-cell-state="${state??'sky'}" data-suppressed="${suppressed}" data-section="${c.section??''}" class="board-cell ${current?.cellId===c.id?'event-cell event-'+current.type.toLowerCase().replaceAll('_','-'):''} ${focus===c.id?'struck':''} ${legal?'target-legal':''} ${chosen?'target-chosen':''} ${work?'work-chosen':''}" role="button" tabindex="${t?legal||chosen?'0':'-1':'0'}" aria-label="${esc(c.id+': '+description)}"><title>${esc(c.id+': '+description)}</title><rect class="square-fill" x="${x}" y="${y}" width="36" height="36" fill="${!c.structure?'#f2f0e5':state==='fire'?'#d86a30':SECTIONS[c.section].color}" stroke="#a4ad99" stroke-width=".5"/>${state==='damaged'?`<rect x="${x}" y="${y}" width="36" height="36" fill="url(#hatch)"/><path d="M${x+9} ${y+9}l18 18m0-18l-18 18" stroke="#754123" stroke-width="2.4"/>`:state==='fire'?`<path class="fire-symbol" d="M${x+18} ${y+4}c3 7 10 10 10 18a10 10 0 0 1-20 0c0-5 3-8 5-11 0 5 2 6 3 7 3-5 2-10 2-14Z"/><path class="fire-core" d="M${x+18} ${y+18}c1 4 5 6 5 9a5 5 0 0 1-10 0c0-3 3-5 5-9Z"/>`:''}${c.engine?`<text x="${x+4}" y="${y+11}" class="engine-cell">${c.engine}</text>`:''}${indicator?`<g class="engine-indicator ${indicator.running?'engine-running':'engine-stopped'} ${current?.type==='ENGINE_DISABLED'&&current.engineId===indicator.id?'engine-change':''}" data-engine-id="${indicator.id}"><circle cx="${x+18}" cy="${y+18}" r="12" fill="${indicator.running?'#b6cf87':'#e2c2a1'}" stroke="#607e41" stroke-width="1.7"/><text x="${x+18}" y="${y+22}" text-anchor="middle">${indicator.running?'↻':'×'}${indicator.id.slice(1)}</text></g>`:''}${worked.has(c.id)?`<rect class="work-outline work-${job?.kind??'active'}" x="${x+3}" y="${y+3}" width="30" height="30" fill="none" stroke="#245fa0" stroke-width="3" stroke-dasharray="4 2"/>`:''}${legal||chosen||work?`<rect class="target-outline" x="${x+2}" y="${y+2}" width="32" height="32" fill="${chosen||work?'#fff7a755':'none'}" stroke="${chosen||work?'#ab4600':t.stage==='work'?'#246aab':'#21623c'}" stroke-width="4"/>`:''}</g>`;
  }
  if(isV2(s)&&s.config.v2StoryMode)for(const condition of s.story?.conditions??[]){
    const c=getCell(condition.cellId??condition.repairCell);if(!c)continue;
    const x=bx+c.x*step,y=by+c.y*step;
    svg+=`<g class="story-cell-mark" data-story-mark="${esc(c.id)}" pointer-events="none"><title>${esc(condition.title)} · ${esc(c.id)}</title><path d="M${x+23} ${y+1}h12v12z" fill="#f1cd61" stroke="#665120" stroke-width="1"/><text x="${x+31}" y="${y+10}" text-anchor="middle" fill="#402f13" font-size="10" font-weight="900">!</text></g>`;
  }
  if(hitMapEnabled)for(const c of BOARD){
    const count=c.structure?(hitMapStructure?hitMap?.structure?.[c.id]??0:0):(hitMapEmpty?hitMap?.empty?.[c.id]??0:0);
    if(!count)continue;
    const x=bx+c.x*step,y=by+c.y*step,color=c.structure?'#245fa0':'#bd5d32',kind=c.structure?'aircraft':'empty-space';
    svg+=`<g class="hit-map-mark ${c.structure?'hit-map-aircraft':'hit-map-empty'}" data-hit-map-cell="${c.id}" data-hit-map-rolls="${count}" data-hit-map-kind="${kind}" pointer-events="none"><title>${c.id}: ${count} ${kind} hit-location roll${count===1?'':'s'}</title><rect x="${x+1.5}" y="${y+1.5}" width="33" height="33" fill="none" stroke="${color}" stroke-width="2.5" stroke-dasharray="4 2"/><circle cx="${x+28}" cy="${y+8}" r="7"/><text x="${x+28}" y="${y+11}" text-anchor="middle">${count}</text></g>`;
  }
  for(let i=0;i<=6;i++)svg+=`<path class="grid-rule" d="M${bx+i*72} ${by}v432 M${bx} ${by+i*72}h432" stroke="#607565" opacity=".65" stroke-width="1.4"/>`;
  svg+=`<path class="aircraft-outline" d="${structuralEdges}" fill="none" pointer-events="none"/>`;
  const crewLayout=new Map(crewMarkerLayout(s).map(marker=>[marker.id,marker]));
  // Paint the operator first, then the smaller physical occupants on top.
  for(const c of [...s.crew].sort((a,b)=>Number(crewLayout.get(b.id)?.fixed)-Number(crewLayout.get(a.id)?.fixed))) {
    const marker=crewLayout.get(c.id);if(!marker)continue;
    const d=CREW_DEFS.find(d=>d.id===c.id),status=crewStatus(s,c,selectedCrew===c.id);
    const {x,y,anchor,radius,numberSize,badge}=marker;
    if(c.displaced)status.label+=' · Displaced';
    const station=stationStatus(s,c),operator=station.operating;
    const role=operator?`Operator: ${station.currentName}`:c.displaced?'Physical occupant · no station operated':'Physical occupant · station unavailable';
    const previous=previousCrew.get(c.id),moving=duration&&previous&&previous.footprint!==marker.footprint;
    const cue=crewCueEvents.has(current?.type)&&current.crewId===c.id;
    if(moving)svg+=`<path class="crew-move-trail" d="M${previous.x} ${previous.y}L${x} ${y}" pointer-events="none"/>`;
    const legal=options.crew.includes(c.id),chosen=t?.targetId===c.id||t?.gunnerId===c.id;
    const transparent=t&&(t.stage==='work'||['repair','fireControl'].includes(t.action));
    svg+=`<g class="crew-marker status-${status.id} ${operator?'station-operator':'physical-occupant'} ${cue?'crew-cue cue-'+current.type.toLowerCase().replaceAll('_','-'):''} ${c.displaced?'is-displaced':''} ${radius<14?'compact-marker':''} ${legal?'target-legal':''} ${chosen?'target-chosen':''} ${transparent?'pass-through':''}" data-crew-id="${c.id}" data-footprint="${c.position.join(' ')}" data-operator="${operator}" role="button" tabindex="${transparent?'-1':'0'}" aria-label="${esc(d.name+', '+status.label+', '+c.position.join(' + ')+', '+role)}"><title>${esc(d.name+' · '+status.label+' · '+c.position.join(' + '))}</title>${moving?`<animateTransform attributeName="transform" type="translate" from="${previous.x-x} ${previous.y-y}" to="0 0" dur="${duration}ms"/>`:''}${x!==anchor.x||y!==anchor.y?`<path class="crew-anchor" d="M${anchor.x} ${anchor.y}L${x} ${y}" stroke="#173e38"/>`:''}${c.health==='dead'?`<path class="crew-body casualty-shape" d="M${x} ${y-radius}L${x+radius*.86} ${y-radius*.5}L${x+radius*.86} ${y+radius*.5}L${x} ${y+radius}L${x-radius*.86} ${y+radius*.5}L${x-radius*.86} ${y-radius*.5}Z" stroke="#faf5df" stroke-width="1.6"/>`:`<circle class="crew-body" cx="${x}" cy="${y}" r="${radius}" stroke="#faf5df" stroke-width="1.6"/>`}<text x="${x}" y="${y+numberSize*.34}" style="font-size:${numberSize}px" text-anchor="middle">${d.number}</text>${operator&&radius>=14?`<path class="operator-mark" d="M${x-5} ${y-radius+4}h10"/>`:''}${badge?`<g class="crew-state-dot"><circle cx="${badge.x}" cy="${badge.y}" r="${badge.radius}"/><text x="${badge.x}" y="${badge.y+badge.fontSize*.32}" style="font-size:${badge.fontSize}px" text-anchor="middle">${status.icon}</text></g>`:''}</g>`;
  }
  // Paint the entire sector field first. A clustered Fore/High contact can
  // overlap Fore/Level; its later backdrop must never cover the plane or tap area.
  for(const q of QUADRANTS)for(const a of ALTITUDES) {
    const [x,y]=sectorPoint(q,a),legal=preview.sectors.includes(`${q}/${a}`);
    svg+=`<g class="sector ${legal?'arc-legal':''}" data-sector="${q}/${a}"><circle cx="${x}" cy="${y}" r="25"/><text x="${x}" y="${y+4}" class="sector-alt" text-anchor="middle">${a==='High'?'HI':a==='Level'?'LV':'LO'}</text></g>`;
  }
  for(const q of QUADRANTS)for(const a of ALTITUDES) {
    const [x,y]=sectorPoint(q,a),fighters=s.fighters.filter(f=>f.quadrant===q&&f.altitude===a);
    if(fighters.length>1)svg+=`<text x="${x+27}" y="${y-22}" class="cluster-count">×${fighters.length}</text>`;
    fighters.forEach((f,i)=>{
      const [dx,dy]=fighterFormationOffset(q,i,fighters.length),px=x+dx,py=y+dy,heading=fighterHeading(f);
      const legal=aimed?options.fighters.includes(f.id):preview.fighterIds.includes(f.id),dim=(aimed||preview.arc)&&!legal,selected=t?.targetId===f.id;
      const previous=previousFighters.get(f.id),moving=duration&&current?.type==='FIGHTER_MOVED'&&current.fighterId===f.id&&previous;
      const rotating=duration&&current?.type==='FIGHTER_ROTATED'&&current.fighterId===f.id&&previous&&previous.heading!==heading;
      const turn=previous?((heading-previous.heading+540)%360)-180:0;
      const hpLabel=`HP ${f.hp}/${f.maxHp}`;
      const engagementKey=engagementConfigKey[f.type],engagementMax=engagementKey?s.config[engagementKey]:0;
      const engagementLabel=isV2(s)&&engagementMax?` Engagement ${f.engagementRemaining}/${engagementMax}`:'';
      const eventFighter=current?.fighterId===f.id;
      const cue=eventFighter?`contact-${current.type.toLowerCase().replaceAll('_','-')}`:'';
      const shot=eventFighter&&current.type==='GUNNER_SHOT_ROLL'?current.token:null;
      const shotLabelY=py<68?45:-52;
      svg+=`<g class="fighter-marker ${cue} ${shot?'shot-'+String(shot).toLowerCase():''} ${legal?'target-legal':''} ${dim?'target-dim':''} ${selected?'target-chosen':''} ${visual.activeFighterId===f.id?'resolving':''} ${visual.departingFighter===f.id?'departing':''}" data-fighter="${f.id}" data-heading="${heading}" data-disrupted="${Boolean(f.disrupted)}" role="button" tabindex="0" aria-label="Fighter ${s.fighters.indexOf(f)+1}, ${esc(f.type)}, ${hpLabel}${engagementLabel}, ${q} ${a}" transform="translate(${px} ${py})"><title>${esc(`${f.type} · ${hpLabel}${engagementLabel}`)}</title>${moving?`<animateTransform attributeName="transform" type="translate" from="${previous.x} ${previous.y}" to="${px} ${py}" dur="${duration}ms" fill="freeze"/>`:''}<circle r="44" class="fighter-touch"/><circle r="24" class="fighter-token-face"/>${fighterStatusMarkup(s,f)}<g class="fighter-airframe" transform="rotate(${heading})">${rotating?`<animateTransform attributeName="transform" type="rotate" from="${previous.heading}" to="${previous.heading+turn}" dur="${duration}ms" fill="freeze"/>`:''}<path class="fighter-shape" d="M0 -19L4 -7L17 3L17 7L4 3L3 13L8 17L8 20L0 17L-8 20L-8 17L-3 13L-4 3L-17 7L-17 3L-4 -7Z"/></g><circle class="fighter-id-disc" cx="13" cy="16" r="10"/><text x="13" y="20" class="fighter-number" text-anchor="middle">${s.fighters.indexOf(f)+1}</text>${f.disrupted?'<g class="disrupt-marker"><rect x="-26" y="-26" width="18" height="15" rx="3"/><text x="-17" y="-14" text-anchor="middle">D</text></g>':''}${shot?`<g class="shot-result result-${String(shot).toLowerCase()}" pointer-events="none"><rect x="-29" y="${shotLabelY}" width="58" height="18" rx="3"/><text x="0" y="${shotLabelY+13}" text-anchor="middle">${esc(String(shot).toUpperCase())}</text></g>`:''}${current?.type==='ATTACK_DISRUPTED'&&current.fighterId===f.id?'<text class="attack-disrupted" x="0" y="-33" text-anchor="middle">ATTACK DISRUPTED</text>':''}${visual.attackMissFighter===f.id?'<text x="0" y="-29" class="attack-miss" text-anchor="middle">MISS</text>':''}</g>`;
    });
  }
  for(const e of s.escorts) {
    const [x,y]=e.quadrant==='Fore'?[142,43]:e.quadrant==='Aft'?[142,562]:e.quadrant==='Port'?[45,442]:[568,442];
    svg+=`<g class="escort-marker ${visual.escortId===e.id?'intercepting':''}" data-escort="${e.id}" transform="translate(${x} ${y})"><title>Escort: ${e.quadrant}</title><circle r="23"/><path d="M0 -16L4 -3L15 5L15 8L3 4L3 13L-3 13L-3 4L-15 8L-15 5L-4 -3Z"/><text y="34" text-anchor="middle">ESCORT</text></g>`;
  }
  const shooter=crewLayout.get(current?.crewId??visual.shooterId),shotTarget=positions.get(current?.fighterId);
  if(shotEvents.has(current?.type)&&shooter&&shotTarget&&visual.shooterId) {
    const result=current.type==='GUNNER_SHOT_ROLL'?String(current.token).toLowerCase():'hit';
    svg+=`<path class="combat-tracer tracer-${esc(result)}" d="${connectorPath(shooter,shotTarget)}" pathLength="100" pointer-events="none" aria-hidden="true"/>`;
  } else if(t?.targetId&&positions.has(t.targetId)) {
    const actor=crewLayout.get(t.gunnerId??t.crewId),target=positions.get(t.targetId);
    if(actor)svg+=`<path class="target-vector" d="${connectorPath(actor,target)}" pointer-events="none" aria-hidden="true"/>`;
  }
  if(current?.type==='ENEMY_LOCATION_FOCUS'&&visual.attackerId&&focus) {
    const attacker=positions.get(visual.attackerId),cell=getCell(focus);
    if(attacker&&cell)svg+=`<path class="combat-tracer tracer-enemy" d="${connectorPath(attacker,{x:bx+cell.x*step+18,y:by+cell.y*step+18},42,18)}" pathLength="100" pointer-events="none" aria-hidden="true"/>`;
  }
  if(['FIGHTER_DESTROYED','FIGHTER_DISENGAGED'].includes(current?.type)&&previousFighters.has(current.fighterId)&&!positions.has(current.fighterId)) {
    const previous=previousFighters.get(current.fighterId),destroyed=current.type==='FIGHTER_DESTROYED';
    // Keep an inspectable result at the last known location. It has no hit region.
    svg+=`<g class="contact-exit ${destroyed?'contact-destroyed':'contact-disengaged'}" transform="translate(${previous.x} ${previous.y})" pointer-events="none" aria-hidden="true"><g class="contact-exit-symbol">${destroyed?'<path d="M-16 -16 16 16M16 -16-16 16"/><circle r="27"/>':'<path d="M-14 14 14-14M-8-14h22V8"/>'}</g><text y="46" text-anchor="middle">${destroyed?'DESTROYED':'BREAKS OFF'}</text></g>`;
  }
  if(visual.emptyMissCell) {const c=BOARD.find(c=>c.id===visual.emptyMissCell);if(c)svg+=`<g class="empty-miss" data-miss-cell="${c.id}"><path d="M${bx+c.x*step+7} ${by+c.y*step+7}l22 22m0-22l-22 22"/><text x="${bx+c.x*step+18}" y="${by+c.y*step+34}" text-anchor="middle">SKY</text></g>`;}
  if(focus){const c=BOARD.find(c=>c.id===focus);if(c)svg+=`<g class="hit-focus" data-focus-cell="${focus}" transform="translate(${bx+c.x*step+18} ${by+c.y*step+18})"><rect class="strike-ring" x="-16" y="-16" width="32" height="32"/><path class="focus-reticle ${current?.type==='ENEMY_LOCATION_FOCUS'?'contract':''}" d="M-25 -10v-15h15m20 0h15v15m0 20v15h-15m-20 0h-15v-15"/></g>`;}
  return svg+'</svg>';
}
function fighterFormationOffset(quadrant,index,count) {
  if(count<2)return[0,0];
  if(count===2)return['Fore','Aft'].includes(quadrant)?[(index===0?-52:52),0]:[0,index===0?-52:52];
  if(['Fore','Aft'].includes(quadrant)) {
    const inward=quadrant==='Fore'?1:-1;
    return index===0?[-52,inward*8]:index===1?[52,inward*8]:[0,inward*100];
  }
  const inward=quadrant==='Port'?1:-1;
  return index===0?[inward*8,-52]:index===1?[inward*8,52]:[inward*100,0];
}
export function fighterPositions(s) {return new Map(s.fighters.map(f=>{const [x,y]=sectorPoint(f.quadrant,f.altitude),group=s.fighters.filter(g=>g.quadrant===f.quadrant&&g.altitude===f.altitude),i=group.indexOf(f),[dx,dy]=fighterFormationOffset(f.quadrant,i,group.length);return[f.id,{x:x+dx,y:y+dy,heading:fighterHeading(f)}];}));}
