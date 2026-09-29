import { BOARD, SECTIONS, CREW_DEFS, STATIONS, QUADRANTS, ALTITUDES, getCell } from './board.mjs';
import { crewStatus, footprintCenter, arcPreview } from './ui-model.mjs';
import { fighterHeading } from './spatial.mjs';
import { targetOptions } from './targeting.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bx=89,by=87,step=36;
const markerStrokeMargin=2.5; // Includes the widest selected-token outline.
const clamp=(value,minimum,maximum)=>Math.max(minimum,Math.min(maximum,value));

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
      fixed:!crew.job&&assigned.length===crew.position.length&&assigned.every(id=>crew.position.includes(id))}];
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
export function boardMarkup(s,{selectedCrew,interaction:t,visual={},current,previousFighters=new Map()}={}) {
  const options=targetOptions(s,t),preview=arcPreview(s,t?.gunnerId??t?.crewId??selectedCrew);
  const aimed=t&&['basicFire','advancedFire','opportunityShot','rotateFighter'].includes(t.action)&&t.stage!=='gunner';
  const worked=new Set(s.jobs.flatMap(j=>j.cells??[]));
  const focus=visual.focusCell??(current?.type==='ENEMY_HIT_LOCATION'?null:current?.cellId);
  let svg=`<svg viewBox="0 0 620 620" aria-label="B-17 damage board, columns A to F, rows 1 to 6" role="group"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L6 0" stroke="#653c21" stroke-width="1.3" opacity=".5"/></pattern></defs><rect width="620" height="620" fill="#e8e8d8" rx="12"/><text x="310" y="21" class="compass-label" text-anchor="middle">FORE</text><text x="310" y="611" class="compass-label" text-anchor="middle">AFT</text><text x="20" y="309" transform="rotate(-90 20 309)" class="compass-label" text-anchor="middle">PORT</text><text x="607" y="309" transform="rotate(90 607 309)" class="compass-label" text-anchor="middle">STARBOARD</text>`;
  for(let i=0;i<6;i++)svg+=`<text x="${bx+i*72+36}" y="78" class="grid-label" text-anchor="middle">${'ABCDEF'[i]}</text><text x="77" y="${by+i*72+41}" class="grid-label" text-anchor="middle">${i+1}</text>`;
  for(const c of BOARD) {
    const x=bx+c.x*step,y=by+c.y*step,state=s.cells[c.id],indicator=c.engineIndicator?s.engines.find(e=>e.id===c.engineIndicator):null;
    const legal=t?.stage==='work'?options.work.includes(c.id):options.cells.includes(c.id),chosen=t?.cells.includes(c.id),work=t?.workCellId===c.id;
    const description=c.structure?`${SECTIONS[c.section].name}, ${state}${c.engine?`, engine ${c.engine}`:''}`:indicator?`${indicator.id} running indicator only; no aircraft structure`:'open sky';
    svg+=`<g data-cell="${c.id}" ${t?.stage==='work'&&legal?`data-work-cell="${c.id}"`:''} data-structure="${c.structure}" data-section="${c.section??''}" class="board-cell ${focus===c.id?'struck':''} ${legal?'target-legal':''} ${chosen?'target-chosen':''} ${work?'work-chosen':''}" role="button" tabindex="${t?legal||chosen?'0':'-1':'0'}" aria-label="${esc(c.id+': '+description)}"><title>${esc(c.id+': '+description)}</title><rect class="square-fill" x="${x}" y="${y}" width="36" height="36" fill="${!c.structure?'#f2f0e5':state==='fire'?'#d86a30':SECTIONS[c.section].color}" stroke="#a4ad99" stroke-width=".5"/>${state==='damaged'?`<rect x="${x}" y="${y}" width="36" height="36" fill="url(#hatch)"/><path d="M${x+9} ${y+9}l18 18m0-18l-18 18" stroke="#754123" stroke-width="2.4"/>`:state==='fire'?`<text x="${x+18}" y="${y+26}" class="fire-symbol" text-anchor="middle">♨</text>`:''}${c.engine?`<text x="${x+4}" y="${y+11}" class="engine-cell">${c.engine}</text>`:''}${indicator?`<g class="engine-indicator" data-engine-id="${indicator.id}"><circle cx="${x+18}" cy="${y+18}" r="12" fill="${indicator.running?'#b6cf87':'#e2c2a1'}" stroke="#607e41" stroke-width="1.7"/><text x="${x+18}" y="${y+22}" text-anchor="middle">${indicator.running?'↻':'×'}${indicator.id.slice(1)}</text></g>`:''}${worked.has(c.id)?`<rect class="work-outline" x="${x+3}" y="${y+3}" width="30" height="30" fill="none" stroke="#245fa0" stroke-width="3" stroke-dasharray="4 2"/>`:''}${legal||chosen||work?`<rect class="target-outline" x="${x+2}" y="${y+2}" width="32" height="32" fill="${chosen||work?'#fff7a755':'none'}" stroke="${chosen||work?'#ab4600':t.stage==='work'?'#246aab':'#21623c'}" stroke-width="4"/>`:''}</g>`;
  }
  for(let i=0;i<=6;i++)svg+=`<path class="grid-rule" d="M${bx+i*72} ${by}v432 M${bx} ${by+i*72}h432" stroke="#607565" opacity=".65" stroke-width="1.4"/>`;
  const crewLayout=new Map(crewMarkerLayout(s).map(marker=>[marker.id,marker]));
  for(const c of s.crew) {
    const marker=crewLayout.get(c.id);if(!marker)continue;
    const d=CREW_DEFS.find(d=>d.id===c.id),status=crewStatus(s,c,selectedCrew===c.id);
    const {x,y,anchor,radius,numberSize,badge}=marker;
    const legal=options.crew.includes(c.id),chosen=t?.targetId===c.id||t?.gunnerId===c.id;
    const transparent=t&&(t.stage==='work'||['repair','fireControl'].includes(t.action));
    svg+=`<g class="crew-marker status-${status.id} ${radius<14?'compact-marker':''} ${legal?'target-legal':''} ${chosen?'target-chosen':''} ${transparent?'pass-through':''}" data-crew-id="${c.id}" data-footprint="${c.position.join(' ')}" role="button" tabindex="${transparent?'-1':'0'}" aria-label="${esc(d.name+', '+status.label+', '+c.position.join(' + '))}"><title>${esc(d.name+' · '+status.label+' · '+c.position.join(' + '))}</title>${x!==anchor.x||y!==anchor.y?`<path class="crew-anchor" d="M${anchor.x} ${anchor.y}L${x} ${y}" stroke="#173e38"/>`:''}<circle class="crew-body" cx="${x}" cy="${y}" r="${radius}" stroke="#faf5df" stroke-width="1.6"/><text x="${x}" y="${y+numberSize*.34}" style="font-size:${numberSize}px" text-anchor="middle">${d.number}</text>${badge?`<g class="crew-state-dot"><circle cx="${badge.x}" cy="${badge.y}" r="${badge.radius}"/><text x="${badge.x}" y="${badge.y+badge.fontSize*.32}" style="font-size:${badge.fontSize}px" text-anchor="middle">${status.icon}</text></g>`:''}</g>`;
  }
  for(const q of QUADRANTS)for(const a of ALTITUDES) {
    const [x,y]=sectorPoint(q,a),fighters=s.fighters.filter(f=>f.quadrant===q&&f.altitude===a),legal=preview.sectors.includes(`${q}/${a}`);
    svg+=`<g class="sector ${legal?'arc-legal':''}" data-sector="${q}/${a}"><circle cx="${x}" cy="${y}" r="25"/><text x="${x}" y="${y+4}" class="sector-alt" text-anchor="middle">${a==='High'?'HI':a==='Level'?'LV':'LO'}</text></g>`;
    if(fighters.length>1)svg+=`<text x="${x+27}" y="${y-22}" class="cluster-count">×${fighters.length}</text>`;
    fighters.forEach((f,i)=>{
      const px=x+(i-(fighters.length-1)/2)*22,py=y+(i%2)*13-5,heading=fighterHeading(f);
      const legal=aimed?options.fighters.includes(f.id):preview.fighterIds.includes(f.id),dim=(aimed||preview.arc)&&!legal,selected=t?.targetId===f.id;
      const previous=previousFighters.get(f.id),moving=current?.type==='FIGHTER_MOVED'&&current.fighterId===f.id&&previous;
      const rotating=current?.type==='FIGHTER_ROTATED'&&current.fighterId===f.id&&previous&&previous.heading!==heading;
      const turn=previous?((heading-previous.heading+540)%360)-180:0;
      svg+=`<g class="fighter-marker ${legal?'target-legal':''} ${dim?'target-dim':''} ${selected?'target-chosen':''} ${visual.activeFighterId===f.id?'resolving':''}" data-fighter="${f.id}" data-heading="${heading}" data-disrupted="${Boolean(f.disrupted)}" role="button" tabindex="0" aria-label="Fighter ${s.fighters.indexOf(f)+1}, ${esc(f.type)}, ${f.hp} HP, ${q} ${a}" transform="translate(${px} ${py})">${moving?`<animateTransform attributeName="transform" type="translate" from="${previous.x} ${previous.y}" to="${px} ${py}" dur=".65s" fill="freeze"/>`:''}<circle r="21" class="fighter-touch"/><g transform="rotate(${heading})">${rotating?`<animateTransform attributeName="transform" type="rotate" from="${previous.heading}" to="${previous.heading+turn}" dur=".55s" fill="freeze"/>`:''}<path class="fighter-shape" d="M0 -19L4 -7L17 3L17 7L4 3L3 13L8 17L8 20L0 17L-8 20L-8 17L-3 13L-4 3L-17 7L-17 3L-4 -7Z"/></g><circle class="fighter-id-disc" cx="13" cy="16" r="10"/><text x="13" y="20" class="fighter-number" text-anchor="middle">${s.fighters.indexOf(f)+1}</text>${f.disrupted?'<g class="disrupt-marker"><rect x="-26" y="-26" width="18" height="15" rx="3"/><text x="-17" y="-14" text-anchor="middle">D</text></g>':''}${current?.type==='ATTACK_DISRUPTED'&&current.fighterId===f.id?'<text class="attack-disrupted" x="0" y="-33" text-anchor="middle">DISRUPTED</text>':''}${visual.attackMissFighter===f.id?'<text x="0" y="-29" class="attack-miss" text-anchor="middle">MISS</text>':''}</g>`;
    });
  }
  for(const e of s.escorts) {
    const [x,y]=e.quadrant==='Fore'?[142,43]:e.quadrant==='Aft'?[142,562]:e.quadrant==='Port'?[45,442]:[568,442];
    svg+=`<g class="escort-marker ${visual.escortId===e.id?'intercepting':''}" data-escort="${e.id}" transform="translate(${x} ${y})"><title>Escort: ${e.quadrant}</title><circle r="23"/><path d="M0 -16L4 -3L15 5L15 8L3 4L3 13L-3 13L-3 4L-15 8L-15 5L-4 -3Z"/><text y="34" text-anchor="middle">ESCORT</text></g>`;
  }
  if(visual.emptyMissCell) {const c=BOARD.find(c=>c.id===visual.emptyMissCell);if(c)svg+=`<g class="empty-miss" data-miss-cell="${c.id}"><path d="M${bx+c.x*step+7} ${by+c.y*step+7}l22 22m0-22l-22 22"/><text x="${bx+c.x*step+18}" y="${by+c.y*step+34}" text-anchor="middle">SKY</text></g>`;}
  if(focus){const c=BOARD.find(c=>c.id===focus);if(c)svg+=`<g class="hit-focus" data-focus-cell="${focus}" transform="translate(${bx+c.x*step+18} ${by+c.y*step+18})"><rect class="strike-ring" x="-16" y="-16" width="32" height="32"/><path class="focus-reticle ${current?.type==='ENEMY_LOCATION_FOCUS'?'contract':''}" d="M-25 -10v-15h15m20 0h15v15m0 20v15h-15m-20 0h-15v-15"/></g>`;}
  return svg+'</svg>';
}
export function fighterPositions(s) {return new Map(s.fighters.map(f=>{const [x,y]=sectorPoint(f.quadrant,f.altitude),group=s.fighters.filter(g=>g.quadrant===f.quadrant&&g.altitude===f.altitude),i=group.indexOf(f);return[f.id,{x:x+(i-(group.length-1)/2)*22,y:y+(i%2)*13-5,heading:fighterHeading(f)}];}));}
