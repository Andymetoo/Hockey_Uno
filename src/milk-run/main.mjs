import { createGame } from './state.mjs';
import { DEFAULT_CONFIG, CONFIG_FIELDS, normalizeConfig } from './config.mjs';
import { BOARD, SECTIONS, STATIONS, CREW_DEFS, QUADRANTS, ALTITUDES } from './board.mjs';
import { dispatch, availableCrew, availableActions, legalTargets, isAtStation } from './rules.mjs';
import { ResolutionQueue } from './queue.mjs';
import { loadSession, saveSession, hasLegacyBoardSave } from './persistence.mjs';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const def = id => CREW_DEFS.find(c => c.id === id);
const sectionEntries = () => Object.entries(SECTIONS);
const section = id => SECTIONS[id] ?? { name: id, color: '#8b9880' };
const cell = id => BOARD.find(c => c.id === id);
let queue, selectedCrew = null, chosenAction = null, selectedCells = [], saveWarning = false;
let focusBeforeDialog = null;

$('#app').innerHTML = `
  <header class="topbar">
    <a href="../../index.html" class="home-link" aria-label="Return to prototype launcher">← <span>PROTOTYPES</span></a>
    <div class="wordmark">MILK RUN <span>V3 / FLIGHT TEST</span></div>
    <button class="quiet" data-ui="help" aria-label="How to play">Field guide</button>
    <button class="quiet" data-ui="dev">Playtest settings</button>
  </header>
  <div id="status" class="status-strip" aria-label="Sortie status"></div>
  <main class="tabletop">
    <section class="mission-panel panel"><div class="panel-label">01 / FLIGHT PLAN <span id="mission-label"></span></div><div id="mission-track" class="mission-track"></div></section>
    <section class="crew-panel panel"><div class="panel-label">02 / YOUR CREW <span>CHOOSE THE ORDER</span></div><div id="crew-list" class="crew-list"></div><p class="crew-note">One draw. One action. Then the fighters.<br>Injured, busy and lost crew still consume time.</p></section>
    <section class="board-panel panel">
      <div class="board-heading"><div><div class="eyebrow">BOEING B-17 / FLYING FORTRESS</div><h1>The long way home.</h1></div><button class="board-badge" id="enemy-shortcut" data-ui="enemies">0 / 3 HOSTILES<br>VIEW QUEUE ↓</button></div>
      <div id="board" class="board-wrap"></div>
      <div class="board-key"><span><i class="key-damage">×</i> Damage</span><span><i class="key-fire">♨</i> Fire</span><span><i class="key-crew">3</i> Crew</span><span>Quarter: 1 2 / 3 4</span></div>
      <div id="conditions" class="conditions"></div>
      <div id="section-key" class="section-key"></div>
    </section>
    <aside class="right-rail">
      <section class="enemy-panel panel"><div class="panel-label">03 / ENEMY QUEUE <span id="fighter-count"></span></div><div id="enemies"></div><p class="small muted">Resolve from top to bottom. Facing arrows show whether each fighter attacks or turns.</p></section>
      <section class="event-panel panel"><div class="panel-label">04 / RESOLUTION <span id="queue-count"></span></div><div id="event" class="event-card" role="status" aria-live="polite"></div><div class="playback"><label>Speed <select id="speed" aria-label="Presentation speed"><option value="normal">Normal</option><option value="fast">Fast</option><option value="instant">Instant</option></select></label><button data-ui="pause" class="quiet">Pause</button><button data-ui="step" class="quiet">Step</button><button data-ui="skip" class="quiet">Skip</button></div></section>
      <section class="bag-panel panel"><div class="panel-label">BAG INTELLIGENCE</div><div id="bags"></div></section>
    </aside>
    <section class="log-panel panel"><details id="log-details"><summary>Flight recorder <span id="log-count"></span></summary><div class="log-tools"><button class="quiet" data-ui="export">Export sortie + log</button></div><ol id="event-log" reversed></ol></details></section>
    <section id="summary" class="summary-panel panel" hidden></section>
  </main>
  <footer class="action-dock"><div id="action-context"></div><div id="primary-action"></div></footer>
  <div id="notice" role="alert" hidden></div>
  <dialog id="action-dialog" class="sheet"><div class="dialog-heading"><div><div class="eyebrow">CREW ACTIVATION</div><h2 id="action-title">Choose one action</h2></div><button data-ui="close" class="close" aria-label="Close actions">×</button></div><div id="action-content" class="dialog-content"></div></dialog>
  <dialog id="dev-dialog" class="sheet wide"><div class="dialog-heading"><div><div class="eyebrow">EXPERIMENTAL RULES</div><h2>Flight test settings</h2></div><button data-ui="close" class="close" aria-label="Close playtest settings">×</button></div><div class="dialog-content"><p>Settings apply to a new sortie. Your current flight is autosaved until you launch the replacement. Export it first if you want to keep its record.</p><form id="dev-form"></form></div><footer class="dialog-footer"><button class="quiet" data-ui="reset-defaults">Reset defaults</button><button class="primary" data-ui="apply-dev">Launch with these settings</button></footer></dialog>
  <dialog id="info-dialog" class="sheet"><div class="dialog-heading"><h2 id="info-title"></h2><button data-ui="close" class="close" aria-label="Close details">×</button></div><div id="info-content" class="dialog-content"></div></dialog>
`;

function initialize(config = DEFAULT_CONFIG, seed = 'MILK-RUN', saved = null) {
  queue?.dispose();
  queue = new ResolutionQueue({ state: createGame(config, seed), dispatch, saved, onChange: render });
  selectedCrew = null;
  render();
}

function missionLengths(s) { return { outbound: s.config.outboundLength ?? 6, back: s.config.returnLength ?? 4 }; }
function missionName(s) {
  const { outbound, back } = missionLengths(s);
  if (s.mission.position >= outbound + back) return 'HOME';
  if (s.phase === 'bombing') return 'OVER TARGET';
  return s.mission.position < outbound ? 'OUTBOUND' : 'RETURN';
}
function render() {
  const s = queue.view;
  saveWarning = !saveSession(queue.export());
  if (!selectedCrew || !s.crew.some(c => c.id === selectedCrew)) selectedCrew = availableCrew(s)[0]?.id ?? null;
  if (s.phase === 'select' && !availableCrew(s).some(c => c.id === selectedCrew)) selectedCrew = availableCrew(s)[0]?.id ?? null;
  if (s.activeCrew) selectedCrew = s.activeCrew;
  $('#status').innerHTML = `<div><span>POSITION</span><strong>${missionName(s)} <small>${s.mission.position}</small></strong></div><div><span>ALTITUDE</span><strong class="${s.altitude <= 1 ? 'danger-text' : ''}">${s.altitude} <small>LEVELS</small></strong></div><div><span>RESOURCES</span><strong><b class="officer">${s.resources.Officer}</b><small> O</small> <b class="enlisted">${s.resources.Enlisted}</b><small> E</small></strong></div><div><span>ROUND / SLOT</span><strong>${s.round || '—'} <small>/ ${s.slot ?? 0} OF 10</small></strong></div>`;
  renderTrack(s); renderCrew(s); renderBoard(s); renderEnemies(s); renderEvent(s); renderBags(s); renderAction(s); renderSummary(s);
  $('#speed').value = queue.speed;
  $('[data-ui="pause"]').textContent = queue.paused ? 'Play' : 'Pause';
  $('[data-ui="step"]').disabled = !queue.busy;
  $('[data-ui="skip"]').disabled = !queue.busy;
  $('#queue-count').textContent = queue.busy ? `${queue.pending.length} TO FOLLOW` : 'AWAITING ORDERS';
  $('#log-count').textContent = `${queue.log.length} events${saveWarning ? ' · autosave unavailable' : ' · autosaved'}`;
  if ($('#log-details').open) renderLog();
}
function renderTrack(s) {
  const { outbound, back } = missionLengths(s), total = outbound + back;
  $('#mission-label').textContent = `SEED ${s.seed}`;
  $('#mission-track').innerHTML = Array.from({length:total + 1}, (_, i) => `<div class="track-space ${i === s.mission.position ? 'current' : ''} ${i < s.mission.position ? 'passed' : ''} ${i === outbound ? 'target' : ''}"><span>${i === s.mission.position ? '✈' : i < s.mission.position ? '·' : i === outbound ? '◎' : '—'}</span><small>${i === 0 ? 'START' : i === total ? 'HOME' : i === outbound ? 'TARGET' : String(i).padStart(2,'0')}</small></div>`).join('');
  const track = $('#mission-track'), current = $('#mission-track .current');
  if (current) track.scrollLeft = Math.max(0, current.offsetLeft - track.offsetLeft - track.clientWidth / 2 + current.clientWidth / 2);
}
function renderCrew(s) {
  const available = availableCrew(s).map(c => c.id);
  $('#crew-list').innerHTML = s.crew.map(c => {
    const d = def(c.id), active = selectedCrew === c.id;
    const job=s.jobs.find(j=>j.id===c.job);
    const status = c.health !== 'healthy' ? c.health : c.job ? 'working' : s.activeCrew===c.id ? 'active' : c.used ? 'acted' : 'ready';
    const stationCells=STATIONS[c.station]?.cells??[];
    const seated = stationCells.length===c.position.length&&stationCells.every(id=>c.position.includes(id)&&s.cells[id]!=='fire');
    return `<button data-crew="${c.id}" class="crew-card ${active ? 'selected' : ''} ${status}" aria-pressed="${active}" aria-label="${esc(d.name)}, ${status}" ${s.phase === 'select' && available.includes(c.id) && !queue.busy ? '' : 'data-inspect="true"'}><span class="crew-number">${d.number}</span><span class="crew-copy"><strong>${esc(d.name)}</strong><small>${d.rank} · ${esc(d.role ?? d.tags.join(' / '))}</small></span><span class="crew-status">${status}${job?`<br>UNTIL R${job.completeRound}`:!seated && c.health !== 'dead' ? '<br>displaced' : ''}</span></button>`;
  }).join('');
}
function renderBoard(s) {
  const step = 36, bx = 89, by = 87;
  const suppressed=new Set(s.jobs.filter(j=>j.kind==='fireControl').flatMap(j=>j.cells));
  let svg = `<svg viewBox="0 0 620 620" aria-label="B-17 damage board, columns A to F, rows 1 to 6" role="img"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L6 0" stroke="#653c21" stroke-width="1.3" opacity=".5"/></pattern></defs><rect width="620" height="620" fill="#e8e8d8" rx="12"/><text x="310" y="21" class="compass-label" text-anchor="middle">FORE</text><text x="310" y="611" class="compass-label" text-anchor="middle">AFT</text><text x="20" y="309" transform="rotate(-90 20 309)" class="compass-label" text-anchor="middle">PORT</text><text x="607" y="309" transform="rotate(90 607 309)" class="compass-label" text-anchor="middle">STARBOARD</text>`;
  for (let i=0;i<6;i++) { svg += `<text x="${bx + i*72 + 36}" y="78" class="grid-label" text-anchor="middle">${'ABCDEF'[i]}</text><text x="77" y="${by+i*72+41}" class="grid-label" text-anchor="middle">${i+1}</text>`; }
  for (const c of BOARD) {
    const x=bx+c.x*step,y=by+c.y*step,state=s.cells[c.id],highlight=queue.current?.cellId===c.id;
    const fill=!c.structure?'#f2f0e5':state==='fire'?'#d86a30':section(c.section).color;
    const indicator=c.engineIndicator?s.engines.find(e=>e.id===c.engineIndicator):null;
    const description=c.structure?`${section(c.section).name}, ${state}${c.engine?`, engine ${c.engine}`:''}`:indicator?`${indicator.id} running indicator only; no aircraft structure`:'open sky';
    svg+=`<g data-cell="${c.id}" data-structure="${c.structure}" data-section="${c.section??''}" class="board-cell ${highlight?'struck':''}"><title>${c.id}: ${description}</title><rect x="${x}" y="${y}" width="36" height="36" fill="${fill}" stroke="#a4ad99" stroke-width=".5"/>${state==='damaged'?`<rect x="${x}" y="${y}" width="36" height="36" fill="url(#hatch)"/><path d="M${x+9} ${y+9}l18 18m0-18l-18 18" stroke="#754123" stroke-width="2.4"/>`:state==='fire'?`<text x="${x+18}" y="${y+26}" class="fire-symbol" text-anchor="middle">♨</text>`:''}${c.engine?`<text x="${x+4}" y="${y+11}" class="engine-cell">E${String(c.engine).replace(/\D/g,'')}</text>`:''}${indicator?`<g class="engine-indicator" data-engine-id="${indicator.id}"><circle cx="${x+18}" cy="${y+18}" r="12" fill="${indicator.running?'#b6cf87':'#e2c2a1'}" stroke="${indicator.running?'#607e41':'#945e41'}" stroke-width="1.7"/><text x="${x+18}" y="${y+22}" text-anchor="middle">${indicator.running?'↻':'×'}${indicator.id.slice(1)}</text></g>`:''}${suppressed.has(c.id)?`<rect x="${x+3}" y="${y+3}" width="30" height="30" fill="none" stroke="#244f70" stroke-width="3" stroke-dasharray="4 2"/>`:''}${highlight?`<rect class="strike-ring" x="${x+2}" y="${y+2}" width="32" height="32" fill="none" stroke="#e63b21" stroke-width="4"/>`:''}</g>`;
  }
  for(let i=0;i<=6;i++) svg+=`<path d="M${bx+i*72} ${by}v432 M${bx} ${by+i*72}h432" stroke="#607565" opacity=".65" stroke-width="1.4"/>`;
  for(const c of s.crew.filter(c=>c.health!=='dead')) {
    const footprint=c.position.map(cell).filter(Boolean); if(!footprint.length) continue;
    const d=def(c.id),color=c.health==='injured'?'#d75a34':c.used?'#738377':'#173e38';
    // One person, one token. The state keeps every vulnerable footprint square.
    const x=bx+(footprint.reduce((sum,square)=>sum+square.x+.5,0)/footprint.length)*step;
    const y=by+(footprint.reduce((sum,square)=>sum+square.y+.5,0)/footprint.length)*step;
    svg+=`<g class="crew-marker" data-crew-id="${c.id}" data-footprint="${c.position.join(' ')}"><title>${esc(d.name)} · ${c.position.join(', ')}</title><circle cx="${x}" cy="${y}" r="16" fill="${color}" stroke="#faf5df" stroke-width="1.6"/><text x="${x}" y="${y+6}" text-anchor="middle">${d.number}</text></g>`;
  }
  const sectorPoints = (q,a) => { const i=ALTITUDES.indexOf(a);return q==='Fore'?[232+i*74,47]:q==='Aft'?[232+i*74,563]:q==='Port'?[47,234+i*74]:[567,234+i*74]; };
  for(const q of QUADRANTS) for(const a of ALTITUDES) {
    const [x,y]=sectorPoints(q,a), inSector=s.fighters.filter(f=>f.quadrant===q&&f.altitude===a);
    svg+=`<circle cx="${x}" cy="${y}" r="22" fill="${inSector.length?'#314f49':'#dee2d2'}" stroke="#aab7a2"/><text x="${x}" y="${y+4}" class="sector-alt" text-anchor="middle" fill="${inSector.length?'#fff7db':'#697c68'}">${a==='High'?'HI':a==='Level'?'LV':'LO'}</text>`;
    inSector.forEach((f,i)=>{const rotation=({Fore:180,Starboard:270,Aft:0,Port:90}[q])+f.facing;svg+=`<g transform="translate(${x+(i-((inSector.length-1)/2))*19} ${y-5})"><path d="M0 -14L7 4L0 0L-7 4Z" transform="rotate(${rotation})" fill="#f4b855" stroke="#273f35" stroke-width="1"/><text y="23" class="fighter-number" text-anchor="middle">${s.fighters.indexOf(f)+1}</text></g>`;});
  }
  svg+='</svg>';
  $('#board').innerHTML=svg;
  $('#conditions').innerHTML=s.engines.map(e=>`<div class="engine-status ${e.running?'':'stopped'}"><span>ENGINE ${String(e.id).replace(/\D/g,'')}</span><strong>${e.running?'RUNNING':e.repairReady?'RESTART READY':'OFF · REPAIR'}</strong></div>`).join('');
  $('#section-key').innerHTML=sectionEntries().map(([id,d])=>`<span class="${s.compromised.includes(id)?'compromised':''}"><i style="background:${d.color}"></i>${esc(d.name)}${s.compromised.includes(id)?' !':''}</span>`).join('');
}
function renderEnemies(s) {
  $('#fighter-count').textContent=`${s.fighters.length} / ${s.config.maxFighters}`;
  $('#enemy-shortcut').innerHTML=`${s.fighters.length} / ${s.config.maxFighters} HOSTILES<br>VIEW QUEUE ↓`;
  $('#enemies').innerHTML=Array.from({length:s.config.maxFighters},(_,i)=>{
    const f=s.fighters[i];return f?`<div class="fighter-card ${queue.current?.fighterId===f.id?'resolving':''}"><span class="queue-number">0${i+1}</span><div><strong>${esc(f.type)}</strong><p>${esc(f.quadrant)} / ${esc(f.altitude)}</p><div class="hp-pips" aria-label="${f.hp} of ${f.maxHp} hit points">${Array.from({length:f.maxHp},(_,j)=>`<i class="${j<f.hp?'full':''}"></i>`).join('')}</div></div><div class="facing"><b>${f.facing===0?'↓':f.facing===90?'↱':'↑'}</b><small>${f.facing===0?'ATTACK':`${f.facing}° · TURN`}</small></div></div>`:`<div class="fighter-empty"><span>0${i+1}</span> Clear sky</div>`;
  }).join('')+(s.escorts.length?`<p class="escort-note">✦ Escort: ${s.escorts.map(e=>esc(e.quadrant ?? e)).join(', ')}</p>`:'');
}
function renderEvent(s) {
  const e=queue.current;
  $('#event').innerHTML=e?`<span class="event-type">${esc(e.type.replaceAll('_',' '))}</span><p>${esc(e.message)}</p>${e.roll!=null?`<div class="die-face">${esc(e.roll)}</div>`:''}<small>ROUND ${e.round} · EVENT ${e.sequence}</small>`:`<span class="event-type">MISSION BRIEFING</span><p>Ten crew. One aircraft.<br>Get to the target, then bring them home.</p><small>START → TARGET → HOME</small>`;
}
function renderBags(s) {
  const m=s.bags.mission,c=s.bags.combat,count=(bag,t)=>bag.tokens.filter(v=>v===t).length;
  $('#bags').innerHTML=`<div class="bag-line"><span>Mission</span><strong>${m.tokens.length} in bag</strong></div><div class="bag-line muted"><span>${count(m,'Enemy')} enemy · ${count(m,'Resource')} resource</span><span>${m.discard.length} discard</span></div><div class="bag-line"><span>Combat</span><strong>${count(c,'Hit')} hit / ${count(c,'Miss')} miss</strong></div><div class="bag-line muted"><span>Held resources stay out.</span><span>${c.discard.length} discard</span></div><p class="small muted">Spent resources return next round. Bags refill early only when empty.</p>`;
}
function renderAction(s) {
  let text='',sub='',button='';
  if(queue.busy) { text=`${queue.paused?'Paused · ':''}${queue.current?.type.replaceAll('_',' ')??'Events resolving'}`;sub=queue.current?.message??'Watch the board and flight recorder.';button='<button class="primary" data-ui="skip">Skip this sequence →</button>'; }
  else if(s.phase==='ready') { text=s.round?'Crew ready for the next leg.':'Your aircraft is ready.';sub=s.round?'Refill bags, complete work, then resolve fire.':'Begin round one. Choose your crew order.';button=`<button class="primary" data-command="startRound">${s.round?'Begin next round':'Begin sortie'} →</button>`; }
  else if(s.phase==='select') {const c=def(selectedCrew);text=c?`${c.number} / ${c.name}`:'Choose an available crew member';sub='Draw a mission token, then choose one action.';button=`${c?.abilities?.includes('intercept')&&isAtStation(s,s.crew.find(v=>v.id===c.id))?'<label class="intercept"><input id="intercept" type="checkbox"> Intercept enemy draw as Flak</label>':''}<button class="primary" data-ui="activate" ${c?'':'disabled'}>Activate & draw →</button>`;}
  else if(s.phase==='action') {text=`${def(s.activeCrew)?.name ?? 'Crew'} · choose one action`;sub='The enemy queue acts after your action.';button='<button class="primary" data-ui="choose">Choose action →</button>';}
  else if(s.phase==='roundEnd') {text='All ten time slots complete.';sub='Check control, structure and engines independently.';button='<button class="primary" data-command="endRound">Altitude checks & advance →</button>';}
  else if(s.phase==='bombing') {text='Target below. Make your run.';sub='Provisional bombing test. Return home after the attempt.';button='<button class="primary" data-command="bomb">Release bombs →</button>';}
  else {text=s.outcome==='success'?'Welcome home.':s.altitude<=0?'Aircraft lost.':'Sortie complete.';sub='Review the flight report or adjust the next flight.';button='<button class="primary" data-ui="dev">Plan another sortie →</button>';}
  $('#action-context').innerHTML=`<strong>${esc(text)}</strong><small>${esc(sub)}</small>`;
  $('#primary-action').innerHTML=button;
}
function renderLog() {
  $('#event-log').innerHTML=queue.log.slice().reverse().map(e=>`<li><span class="log-index">${e.sequence} / R${e.round}</span><span><b>${esc(e.type.replaceAll('_',' '))}</b>${esc(e.message)}</span></li>`).join('');
}
function renderSummary(s) {
  $('#summary').hidden=s.phase!=='ended'; if(s.phase!=='ended')return;
  const elapsed=Math.round(((s.endedAt??Date.now())-s.startedAt)/60000);
  $('#summary').innerHTML=`<div class="eyebrow">END OF SORTIE / SEED ${esc(s.seed)}</div><h2>${s.outcome==='success'?'Home, at last.':'A flight to learn from.'}</h2><p>${s.round} rounds · ${elapsed} minutes · bombing ${s.mission.bombed ? esc(s.mission.bombingResult ?? 'attempted') : 'not reached'}</p><div class="telemetry">${Object.entries(s.stats).map(([k,v])=>`<div><small>${esc(k.replace(/([A-Z])/g,' $1'))}</small><strong>${typeof v==='object'?Object.entries(v).map(([a,b])=>`${a}: ${b}`).join(' · '):esc(v)}</strong></div>`).join('')}</div><button data-ui="export" class="quiet">Export full report</button>`;
}

function openDialog(id) { focusBeforeDialog=document.activeElement; const dialog=$(id);if(!dialog.open)dialog.showModal(); }
function closeDialog() {document.querySelectorAll('dialog[open]').forEach(d=>d.close());focusBeforeDialog?.focus({preventScroll:true});}
function notice(message) {
  const content=document.querySelector('dialog[open] .dialog-content');
  if(content){let error=content.querySelector('.action-error');if(!error){error=document.createElement('p');error.className='action-error';error.setAttribute('role','alert');content.prepend(error);}error.textContent=message;error.scrollIntoView({block:'nearest'});return;}
  $('#notice').textContent=message;$('#notice').hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('#notice').hidden=true,6500);
}
function send(command) {try {queue.send(command);closeDialog();return true;}catch(e){notice(e.message);return false;}}

const actionDescriptions={basicFire:'One free combat pull against a fighter in your operating gun arc.',advancedFire:'Keep hitting one fighter until a miss. A first-pull miss grants exactly one more pull.',repair:'Select connected damaged squares. Work completes after the configured duration.',fireControl:'Select connected burning squares. Squares under active suppression do not spread.',medical:'Treat one injured crewmate. Care completes after the configured duration.',relocate:'Move to a safe fuselage square. This uses your action.',manCockpit:'Take an empty pilot seat. This uses your action.',restartEngine:'Attempt to restart a stopped, fully repaired engine from a pilot seat.',orderShot:'Order an already-used, healthy gunner to make one Basic Shot. No new activation.',convert:'Exchange resources for one of the other rank at the configured ratio. Copilot only.',rotateFighter:'Turn one fighter 90° away from the B-17.',escort:'Call an escort into a random quadrant for the rest of this round.',wait:'Hold position. Use the activation, then resolve the enemy queue.'};
function openActions() {
  chosenAction=null;selectedCells=[];
  const s=queue.view;
  $('#action-title').textContent=`${def(s.activeCrew)?.name ?? 'Crew'} · one action`;
  $('#action-content').innerHTML=`<p class="small muted">${def(s.activeCrew)?.rank} · ${s.resources.Officer} Officer / ${s.resources.Enlisted} Enlisted resources held</p><div class="action-options">${availableActions(s,s.activeCrew).map(a=>`<button data-action="${a.id}" class="action-option" ${a.enabled?'':'disabled'}><span><strong>${esc(a.label)}</strong><small>${esc(a.enabled?actionDescriptions[a.id]:a.reason)}</small></span><b>${esc(a.cost??'FREE')}</b></button>`).join('')}</div>`;
  openDialog('#action-dialog');
}
const option=(value,label)=>`<option value="${esc(value)}">${esc(label)}</option>`;
function chooseAction(id) {
  chosenAction=id;selectedCells=[];
  const s=queue.view,c=s.crew.find(c=>c.id===s.activeCrew),action=availableActions(s,s.activeCrew).find(a=>a.id===id);
  if(!action?.enabled)return;
  $('#action-title').textContent=action.label;
  let choices='';
  if(['basicFire','advancedFire','rotateFighter'].includes(id)) {
    const fighters=id==='rotateFighter'?s.fighters.filter(f=>f.facing<180):legalTargets(s,c.id);
    choices=`<label>Target fighter<select name="targetId">${fighters.map(f=>option(f.id,`${s.fighters.indexOf(f)+1}. ${f.type} · ${f.quadrant} / ${f.altitude} · ${f.hp} HP`)).join('')}</select></label>`;
  } else if(['repair','fireControl'].includes(id)) {
    const desired=id==='repair'?'damaged':'fire';
    const assigned=new Set(s.jobs.flatMap(j=>j.cells??[])),targets=BOARD.filter(b=>s.cells[b.id]===desired&&!assigned.has(b.id)),cap=id==='repair'?(s.config.repairCap+(def(c.id).abilities?.includes('enhancedRepair')?s.config.engineerBonus:0)):s.config.fireCap;
    const duration=id==='repair'?s.config.repairDuration:s.config.fireDuration;
    choices=`<p>Select up to <b>${cap}</b> connected ${desired==='fire'?'burning':'damaged'} squares. ${s.config.eightWayWork?'Diagonal connections allowed.':'Orthogonal connections only.'} Completes ${duration===0?'immediately':`at Round ${s.round+duration} start`}.</p><div class="cell-options">${targets.map(b=>`<button type="button" data-select-cell="${b.id}" aria-pressed="false">${b.id}<small>${esc(section(b.section).name)}</small></button>`).join('')}</div><p id="cell-selection" class="small">No squares selected.</p>`;
  } else if(id==='medical') choices=`<p>Completes ${s.config.medicalDuration===0?'immediately':`at Round ${s.round+s.config.medicalDuration} start`}.</p><label>Injured crewmate<select name="targetId">${s.crew.filter(c=>c.health==='injured'&&!s.jobs.some(j=>j.kind==='medical'&&j.targetId===c.id)).map(c=>option(c.id,def(c.id).name)).join('')}</select></label>`;
  else if(id==='restartEngine') choices=`<label>Engine<select name="targetId">${s.engines.filter(e=>!e.running&&BOARD.filter(b=>b.engine===e.id).every(b=>s.cells[b.id]==='healthy')).map(e=>option(e.id,`Engine ${String(e.id).replace(/\D/g,'')}`)).join('')}</select></label>`;
  else if(id==='manCockpit') choices=`<label>Empty cockpit seat<select name="stationId">${['pilot','copilot'].filter(id=>!(c.station===id&&isAtStation(s,c))&&!STATIONS[id].cells.some(id=>s.cells[id]==='fire')&&!s.crew.some(other=>other.id!==c.id&&other.health!=='dead'&&other.position.some(p=>STATIONS[id].cells.includes(p)))).map(id=>option(id,def(id).name+' station')).join('')}</select></label>`;
  else if(id==='relocate') choices=`<label>Safe fuselage position<select name="targetId">${BOARD.filter(b=>b.fuselage&&s.cells[b.id]!=='fire'&&!(c.position.length===1&&c.position[0]===b.id)&&!s.crew.some(other=>other.id!==c.id&&other.health!=='dead'&&other.position.includes(b.id))).map(b=>option(b.id,`${b.id} · ${section(b.section).name}`)).join('')}</select></label>`;
  else if(id==='convert') choices=`<label>Conversion<select name="to">${s.resources.Enlisted>=s.config.conversionRate?option('Officer',`${s.config.conversionRate} Enlisted → 1 Officer`):''}${s.resources.Officer>=s.config.conversionRate?option('Enlisted',`${s.config.conversionRate} Officer → 1 Enlisted`):''}</select></label>`;
  else if(id==='orderShot') {
    const gunners=s.crew.filter(c=>c.used&&c.health==='healthy'&&!c.job&&legalTargets(s,c.id).length);
    choices=`<label>Gunner and legal target<select name="orderedShot">${gunners.flatMap(g=>legalTargets(s,g.id).map(f=>option(`${g.id}|${f.id}`,`${def(g.id).name} → ${f.type} (${f.quadrant}/${f.altitude})`))).join('')}</select></label>`;
  }
  $('#action-content').innerHTML=`<p>${esc(actionDescriptions[id])}</p><form id="choice-form">${choices}<div class="choice-footer"><button type="button" data-ui="back-actions" class="quiet">← Actions</button><button class="primary" type="submit">${esc(action.label)}${action.cost?` · ${esc(action.cost)}`:''}</button></div></form>`;
}
function configForm(config,seed) {
  const groups=[...new Set(CONFIG_FIELDS.map(f=>f.group??'Rules'))];
  $('#dev-form').innerHTML=`<label class="seed-field">RNG seed<input name="seed" value="${esc(seed)}" maxlength="100" required><small>Same settings, seed and decisions reproduce the run.</small></label>`+groups.map(g=>`<details class="config-group" ${g===groups[0]?'open':''}><summary>${esc(g)}</summary><div class="config-grid">${CONFIG_FIELDS.filter(f=>(f.group??'Rules')===g).map(f=>`<label class="${f.type==='boolean'?'checkbox-field':''}">${f.type==='boolean'?`<input type="checkbox" name="${f.key}" ${config[f.key]?'checked':''}>`:''}<span>${esc(f.label)}</span>${f.type==='boolean'?'':f.type==='select'?`<select name="${f.key}">${f.options.map(v=>typeof v==='object'?`<option value="${v.value}" ${config[f.key]===v.value?'selected':''}>${esc(v.label)}</option>`:`<option ${config[f.key]===v?'selected':''}>${esc(v)}</option>`).join('')}</select>`:`<input name="${f.key}" type="number" min="${f.min??0}" max="${f.max??100}" step="${f.step??1}" value="${config[f.key]}">`}${f.description?`<small>${esc(f.description)}</small>`:''}</label>`).join('')}</div></details>`).join('');
}
function openDev() {configForm(queue.state.config,queue.state.seed);openDialog('#dev-dialog');}
function inspectCell(id) {
  const s=queue.view,b=cell(id);if(!b)return;
  $('#info-title').textContent=`Square ${id}`;
  $('#info-content').innerHTML=`<p>${b.structure?`${esc(section(b.section).name)} · <b>${s.cells[id]}</b>`:'Open sky. An attack here passes through.'}</p>${b.engine?`<p>Engine ${esc(b.engine)} damageable footprint.</p>`:''}${b.engineIndicator?`<p>${esc(b.engineIndicator)} running indicator: visual only. This square contains no aircraft structure and cannot damage the engine.</p>`:''}<p>${s.crew.filter(c=>c.health!=='dead'&&c.position.includes(id)).map(c=>`${def(c.id).name}: ${c.health}`).join('<br>')||'No crew at this position.'}</p><p class="small muted">Quarters: 1 top left, 2 top right, 3 bottom left, 4 bottom right. Aircraft damage and crew injury resolve separately.</p>`;
  openDialog('#info-dialog');
}
function inspectCrew(id) {
  const c=queue.view.crew.find(c=>c.id===id),d=def(id);
  const job=queue.view.jobs.find(j=>j.id===c.job);
  $('#info-title').textContent=d.name;
  $('#info-content').innerHTML=`<p>${esc(d.tags.join(' · '))}</p><p>Status: <b>${c.health}</b>${c.used?' · already acted':''}${c.job?' · crisis work in progress':''}</p>${job?`<p><b>${job.kind}</b> completes at Round ${job.completeRound} start. ${job.cells?.length?`Squares: ${job.cells.join(', ')}.`:`Treating ${def(job.targetId)?.name??job.targetId}.`}</p>`:''}<p>Position: ${c.position.join(', ')}. Assigned station: ${esc(STATIONS[c.station]?.name??c.station??'none')}.</p><p>${d.arc?`Gun arc: ${d.arc.quadrants.join(', ')} / ${d.arc.altitudes.join(', ')}.`:'No gun station.'}</p><p class="small muted">Injured crew cannot activate until treated. Fire makes a station unusable. A displaced crew member can still use General actions.</p>`;
  openDialog('#info-dialog');
}
function help() {
  $('#info-title').textContent='Your field guide';
  $('#info-content').innerHTML=`<p><b>Fly to the target. Attempt the bombing run. Reach HOME.</b> This is a provisional v3 rules test; settings and the authoritative CSV board map are documented in <a href="./README.md">the developer notes</a>.</p><ol class="guide-list"><li><b>Start the round.</b> Bags refill, work completes, fire spreads.</li><li><b>Choose ready crew in any order.</b> Activate to draw a mission token. Officers gain Officer resources; enlisted crew gain Enlisted resources. An enemy draw spawns a fighter or causes Flak.</li><li><b>Choose one action.</b> Fire at an enemy in arc, repair, suppress fire, treat injuries, or use a role ability. Work takes time; it completes at a future round start.</li><li><b>Watch the enemy queue.</b> Facing fighters attack; others turn. Every roll, square, consequence and movement appears in the recorder.</li><li><b>Finish ten time slots.</b> Unavailable crew still draw and face enemies. Then make independent altitude checks and advance.</li></ol><p><b>Damage:</b> healthy → damaged → fire. A hit injures a healthy occupant; a second hit kills. A critical adds two aircraft damage steps but checks crew only once.</p><p><b>Stay airborne:</b> Keep a usable cockpit staffed, repair compromised sections, and restart repaired engines from a pilot seat. These three altitude checks can all cost altitude.</p><p><b>Economy:</b> Held resources stay out of the mission bag. Spending adds resources to the discard for the next refill. Combat hits and misses stay out until refill too.</p><p><b>Controls:</b> Select crew, then use the button at the bottom. Action choices open in a sheet. Tap a board square or unavailable crewmate for details. Pause, step, or skip the event sequence at any time. Your flight and pending events autosave locally.</p><p><b>Testing:</b> Playtest settings restart the sortie with your seed and chosen rules. Bombing, mission length, Flak count and work costs/durations are provisional.</p>`;
  openDialog('#info-dialog');
}
function exportRun() {
  const blob=new Blob([JSON.stringify(queue.export(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`milk-run-${queue.state.seed.replace(/[^a-z0-9_-]/gi,'_')}-round-${queue.state.round}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

document.addEventListener('click', e=>{
  const crew=e.target.closest('[data-crew]');if(crew){if(crew.dataset.inspect)inspectCrew(crew.dataset.crew);else {selectedCrew=crew.dataset.crew;render();}return;}
  const square=e.target.closest('[data-cell]');if(square){inspectCell(square.dataset.cell);return;}
  const selectCell=e.target.closest('[data-select-cell]');if(selectCell){const id=selectCell.dataset.selectCell;selectedCells=selectedCells.includes(id)?selectedCells.filter(v=>v!==id):[...selectedCells,id];selectCell.setAttribute('aria-pressed',String(selectedCells.includes(id)));$('#cell-selection').textContent=selectedCells.length?`Selected: ${selectedCells.join(', ')}`:'No squares selected.';return;}
  const action=e.target.closest('[data-action]');if(action){chooseAction(action.dataset.action);return;}
  const command=e.target.closest('[data-command]');if(command){send({type:command.dataset.command});return;}
  const control=e.target.closest('[data-ui]');if(!control)return;
  switch(control.dataset.ui){
    case 'activate':send({type:'activate',crewId:selectedCrew,intercept:$('#intercept')?.checked??false});break;
    case 'choose':case 'back-actions':openActions();break;
    case 'close':closeDialog();break;
    case 'help':help();break;
    case 'enemies':$('.enemy-panel').scrollIntoView({block:'center',behavior:'smooth'});break;
    case 'dev':openDev();break;
    case 'reset-defaults':configForm(DEFAULT_CONFIG,'MILK-RUN');break;
    case 'apply-dev':{const form=$('#dev-form');if(!form.reportValidity())break;const values=new FormData(form),config={};for(const f of CONFIG_FIELDS)config[f.key]=f.type==='boolean'?values.has(f.key):f.type==='number'?Number(values.get(f.key)):values.get(f.key);const seed=values.get('seed')||'MILK-RUN';closeDialog();initialize(normalizeConfig(config),seed);break;}
    case 'pause':queue.togglePause();break;
    case 'step':queue.step();break;
    case 'skip':queue.flush();break;
    case 'export':exportRun();break;
  }
});
document.addEventListener('submit',e=>{
  if(e.target.id!=='choice-form')return;e.preventDefault();const data=Object.fromEntries(new FormData(e.target)),command={type:'action',action:chosenAction,...data};if(['repair','fireControl'].includes(chosenAction))command.cells=selectedCells;if(data.orderedShot){[command.gunnerId,command.targetId]=data.orderedShot.split('|');delete command.orderedShot;}send(command);
});
$('#speed').addEventListener('change',e=>queue.setSpeed(e.target.value));
$('#log-details').addEventListener('toggle',()=>{if($('#log-details').open)renderLog();});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}}));
const savedSession=loadSession();
const legacyBoardSave=!savedSession&&hasLegacyBoardSave();
initialize(DEFAULT_CONFIG,'MILK-RUN',savedSession);
if(legacyBoardSave)notice('The board geometry has been corrected. Start a new sortie on this map; your previous-board save has been kept separately.');
window.milkRun={ getState:()=>structuredClone(queue.state),getView:()=>structuredClone(queue.view),getQueue:()=>queue.pending.map(({state,...e})=>e),send,restart:(config,seed)=>initialize(config,seed),setSpeed:s=>queue.setSpeed(s),flush:()=>queue.flush(),exportSession:()=>queue.export() };
