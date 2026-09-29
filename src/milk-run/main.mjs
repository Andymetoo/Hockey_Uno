import { createGame } from './state.mjs';
import { DEFAULT_CONFIG, CONFIG_FIELDS, normalizeConfig } from './config.mjs';
import { BOARD, SECTIONS, STATIONS, CREW_DEFS } from './board.mjs';
import { dispatch, availableCrew, availableActions, isAtStation, conversionOptions, opportunityAvailability } from './rules.mjs';
import { ResolutionQueue } from './queue.mjs';
import { boardMarkup, fighterPositions } from './board-view.mjs';
import { crewStatus, stationStatus, availableCount, actionGroup } from './ui-model.mjs';
import { describeEvent } from './presentation.mjs';
import { crewMarkup, enemyMarkup, eventMarkup, logMarkup, altitudeMarkup } from './views.mjs';
import { DIRECT_ACTIONS, beginTargeting, targetOptions, selectTarget, needsWorkPosition, canConfirm, targetingCommand } from './targeting.mjs';
import { crisisTargetCap } from './rules.mjs';
import { loadSession, saveSession, hasLegacyBoardSave, loadDevPreferences, saveDevPreferences, resetDevPreferences, isConfigModified } from './persistence.mjs';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const def = id => CREW_DEFS.find(c => c.id === id);
const sectionEntries = () => Object.entries(SECTIONS);
const section = id => SECTIONS[id] ?? { name: id, color: '#8b9880' };
const cell = id => BOARD.find(c => c.id === id);
let queue, selectedCrew = null, chosenAction = null, saveWarning = false;
let focusBeforeDialog = null, interaction = null, previousFighters = new Map(), previousBeat = null;
let interceptRequested = false;
let devPreferences = loadDevPreferences();

$('#app').innerHTML = `
  <header class="topbar">
    <a href="../../index.html" class="home-link" aria-label="Return to prototype launcher">← <span>PROTOTYPES</span></a>
    <div class="wordmark">MILK RUN <span>V3 / FLIGHT TEST</span><span id="rules-modified" class="rules-modified" hidden>PLAYTEST RULES MODIFIED</span></div>
    <button class="quiet" data-ui="help" aria-label="How to play">Field guide</button>
    <button class="quiet" data-ui="dev">Playtest settings</button>
  </header>
  <div id="status" class="status-strip" aria-label="Sortie status"></div>
  <main class="tabletop">
    <section class="mission-panel panel"><div class="panel-label">01 / FLIGHT PLAN <span id="mission-label"></span></div><div id="mission-track" class="mission-track"></div></section>
    <section class="crew-panel panel"><div class="panel-label">02 / YOUR CREW <span id="available-count">AVAILABLE 10/10</span></div><div id="crew-list" class="crew-list"></div><p class="crew-note">One draw. One action. Then the fighters.<br>Injured, busy and lost crew still consume time.</p></section>
    <section class="board-panel panel">
      <div class="board-heading"><div><div class="eyebrow">BOEING B-17 / FLYING FORTRESS</div><h1>The long way home.</h1></div><button class="board-badge" id="enemy-shortcut" data-ui="enemies">0 / 3 HOSTILES<br>VIEW QUEUE ↓</button></div>
      <div id="board-stage" class="board-stage" aria-live="polite"></div><div class="board-and-altitude"><div id="board" class="board-wrap"></div><div id="altitude-track" class="altitude-track" aria-label="Altitude track"></div></div><div id="target-detail" class="target-detail" hidden></div>
      <div class="board-key"><span><i class="key-damage">×</i> Damage</span><span><i class="key-fire">♨</i> Fire</span><span><i class="key-crew">3</i> Crew</span><span>Quarter: 1 2 / 3 4</span></div>
      <div id="conditions" class="conditions"></div>
      <div id="section-key" class="section-key"></div>
    </section>
    <aside class="right-rail">
      <section class="enemy-panel panel"><div class="panel-label">03 / ENEMY QUEUE <span id="fighter-count"></span></div><div id="enemies"></div><p class="small muted">Resolve from top to bottom. Facing arrows show whether each fighter attacks or turns.</p></section>
      <section class="event-panel panel"><div class="panel-label">04 / RESOLUTION <span id="queue-count"></span></div><div id="event" class="event-card" role="status" aria-live="polite"></div><div class="playback"><label>Speed <select id="speed" aria-label="Presentation speed"><option value="manual">Step / Manual</option><option value="normal">Normal</option><option value="fast">Fast</option><option value="instant">Instant</option></select></label><button data-ui="pause" class="quiet">Pause</button><button data-ui="step" class="quiet">Step</button><button data-ui="skip" class="quiet">Skip</button></div></section>
      <section class="bag-panel panel"><details><summary>Bag intelligence</summary><div id="bags"></div></details></section>
    </aside>
    <section class="log-panel panel"><details id="log-details"><summary>Flight recorder <span id="log-count"></span></summary><div class="log-tools"><button class="quiet" data-ui="export">Export sortie + log</button></div><ol id="event-log" reversed></ol></details></section>
    <section id="summary" class="summary-panel panel" hidden></section>
  </main>
  <footer class="action-dock"><div id="action-context"></div><div id="primary-action"></div></footer>
  <div id="notice" role="alert" hidden></div>
  <dialog id="action-dialog" class="sheet"><div class="dialog-heading"><div><div class="eyebrow">CREW ACTIVATION</div><h2 id="action-title">Choose one action</h2></div><button data-ui="close" class="close" aria-label="Close actions">×</button></div><div id="action-content" class="dialog-content"></div></dialog>
  <dialog id="dev-dialog" class="sheet wide"><div class="dialog-heading"><div><div class="eyebrow">EXPERIMENTAL RULES</div><h2>Flight test settings</h2></div><button data-ui="close" class="close" aria-label="Close playtest settings">×</button></div><div class="dialog-content"><p><b>Applies next run.</b> Valid changes save automatically on this browser. Current flight rules stay fixed; presentation speed can also be changed beside the board. Reset restores next-run defaults without replacing your sortie.</p><p id="dev-prefs-status" class="small" role="status"></p><form id="dev-form"></form></div><footer class="dialog-footer"><button class="quiet" data-ui="reset-defaults">Reset to Defaults</button><button class="primary" data-ui="apply-dev">Launch with these settings</button></footer></dialog>
  <dialog id="info-dialog" class="sheet"><div class="dialog-heading"><h2 id="info-title"></h2><button data-ui="close" class="close" aria-label="Close details">×</button></div><div id="info-content" class="dialog-content"></div></dialog>
`;

function initialize(config = devPreferences, seed = 'MILK-RUN', saved = null) {
  queue?.dispose();
  queue = new ResolutionQueue({ state: createGame(config, seed), dispatch, saved, onChange: render });
  selectedCrew = null; interaction = null; previousFighters = new Map(); previousBeat = null; interceptRequested = false;
  render();
}

function missionLengths(s) { return { outbound: s.config.outboundLength, back: s.config.returnLength }; }
function missionName(s) {
  const { outbound, back } = missionLengths(s);
  if (s.mission.position >= outbound + back) return 'HOME';
  if (s.phase === 'bombing') return 'OVER TARGET';
  return s.mission.position < outbound ? 'OUTBOUND' : 'RETURN';
}
function render() {
  const s = queue.view;
  saveWarning = !saveSession(queue.export());
  $('#rules-modified').hidden=!(isConfigModified(s.config)||isConfigModified(devPreferences)||queue.speed!==DEFAULT_CONFIG.presentationSpeed);
  $('#rules-modified').title='The active sortie or saved next-run settings differ from the canonical defaults.';
  if (!selectedCrew || !s.crew.some(c => c.id === selectedCrew)) selectedCrew = availableCrew(s)[0]?.id ?? null;
  $('#status').innerHTML = `<div><span>POSITION</span><strong>${missionName(s)} <small>${s.mission.position}</small></strong></div><div><span>ALTITUDE</span><strong class="${s.altitude <= 1 ? 'danger-text' : ''}">${s.altitude} <small>LEVELS</small></strong></div><div><span>RESOURCES</span><strong><b class="officer">${s.resources.Officer}</b><small> O</small> <b class="enlisted">${s.resources.Enlisted}</b><small> E</small>${s.config.opportunityEnabled?`<small class="opportunity-count" aria-label="${s.opportunity??0} of ${s.config.opportunityCap} Opportunity">◎ ${s.opportunity??0}/${s.config.opportunityCap}</small>`:''} </strong></div><div><span>ROUND / SLOT</span><strong>${s.round || '—'} <small>/ ${s.slot ?? 0} OF 10</small></strong></div>`;
  renderTrack(s); renderCrew(s); renderBoard(s); renderEnemies(s); renderEvent(s); renderBags(s); renderAction(s); renderSummary(s);
  $('#speed').value = queue.speed;
  $('[data-ui="pause"]').textContent = queue.paused ? 'Play' : 'Pause';
  $('[data-ui="pause"]').disabled = queue.speed==='manual';
  if(queue.speed==='manual')$('[data-ui="pause"]').textContent='Manual';
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
function renderCrew(s) { $('#available-count').textContent='AVAILABLE '+availableCount(s)+'/10'; $('#crew-list').innerHTML=crewMarkup(s,selectedCrew,interaction); }
function renderBoard(s) {
 const beat=queue.current?.beat??queue.current?.sequence;
 $('#board').innerHTML=boardMarkup(s,{selectedCrew,interaction,visual:queue.visual,current:queue.current,previousFighters:beat!==previousBeat?previousFighters:new Map()});
 if(beat!==previousBeat){previousFighters=fighterPositions(s);previousBeat=beat;}
 $('#board').classList.toggle('targeting',Boolean(interaction));
 $('#altitude-track').classList.toggle('losing',queue.current?.type==='ALTITUDE_LOST');$('#altitude-track').innerHTML=altitudeMarkup(s);
  $('#conditions').innerHTML=s.engines.map(e=>`<div class="engine-status ${e.running?'':'stopped'}"><span>ENGINE ${String(e.id).replace(/\D/g,'')}</span><strong>${e.running?'RUNNING':e.repairReady?'RESTART READY':'OFF · REPAIR'}</strong></div>`).join('');
  $('#section-key').innerHTML=sectionEntries().map(([id,d])=>`<span class="${s.compromised.includes(id)?'compromised':''}"><i style="background:${d.color}"></i>${esc(d.name)}${s.compromised.includes(id)?' !':''}</span>`).join('');
}

function renderEnemies(s) { $('#fighter-count').textContent=s.fighters.length+' / '+s.config.maxFighters; $('#enemy-shortcut').innerHTML=s.fighters.length+' / '+s.config.maxFighters+' HOSTILES<br>VIEW QUEUE ↓'; $('#enemies').innerHTML=enemyMarkup(s,{selectedCrew,interaction,visual:queue.visual}); }
function renderEvent(s) {
 const markup=eventMarkup(queue.current,queue.visual);$('#event').innerHTML=markup.detail;
 $('#board-stage').className='board-stage category-'+markup.category+(queue.busy?' playing':' resting');
 $('#board-stage').innerHTML=interaction?'<div class="beat-icon">⌖</div><div><strong>'+esc(targetTitle(s))+'</strong><small>'+esc(targetHint(s))+'</small></div>':markup.stage;
}
function renderBags(s) {
  const m=s.bags.mission,c=s.bags.combat,count=(bag,t)=>bag.tokens.filter(v=>v===t).length;
  $('#bags').innerHTML=`<div class="bag-line"><span>Mission</span><strong>${m.tokens.length} in bag</strong></div><div class="bag-line muted"><span>${count(m,'Enemy')} enemy · ${count(m,'Resource')} resource</span><span>${m.discard.length} discard</span></div><div class="bag-line"><span>Combat</span><strong>${count(c,'Hit')} hit / ${count(c,'Burst')} burst / ${count(c,'Miss')} miss</strong></div><div class="bag-line muted"><span>Held resources stay out.</span><span>${c.discard.length} discard</span></div><p class="small muted">Spent resources return next round. Bags refill early only when empty.</p>`;
}
function targetTitle(s) {
  const t=interaction;if(t.stage==='gunner')return 'Opportunity · choose a completed gunner';
  if(t.stage==='work')return 'Choose a safe internal work position';
  return ({repair:'Select damaged squares',fireControl:'Select burning squares',medical:'Select an injured crewmate',rotateFighter:'Select a fighter to turn',opportunityShot:'Select the gunner’s target',basicFire:'Select a fighter · Basic Fire',advancedFire:'Select a fighter · Advanced Fire'})[t.action];
}
function workTiming(s,t) {
  const duration=s.config[t.action==='fireControl'?'fireDuration':t.action+'Duration'];
  return duration===0?'Completes immediately':`Completes at Round ${s.round+duration} start`;
}
function targetHint(s) {
  const t=interaction,options=targetOptions(s,t);
  if(t.stage==='gunner')return 'Choose a gunner whose normal action is complete. One Basic pull before the pending enemy phase.';
  if(needsWorkPosition(t)&&(t.cells.length||t.targetId)&&!options.work.length)return 'No safe interior work position on this row. Choose another target, or cancel.';
  if(t.stage==='work')return `Tap a highlighted C/D interior space on row ${cell(t.cells[0]??s.crew.find(c=>c.id===t.targetId)?.position[0])?.id[1]}. Shared positions are allowed.`;
  if(['repair','fireControl'].includes(t.action))return `${t.cells.length}/${crisisTargetCap(s,t.crewId,t.action)} selected · ${s.config.eightWayWork?'Eight-way':'Orthogonal'} connections · Primary: ${t.cells[0]??'tap the board'}`;
  if(t.action==='medical')return t.targetId?`${def(t.targetId).name} selected. Choose the worker’s position next.`:'Tap an injured crew marker or card.';
  return t.targetId?`${s.fighters.find(f=>f.id===t.targetId)?.type} selected. Confirm to spend ${t.action==='opportunityShot'?'1 Opportunity':'the action'}.`:`Tap a highlighted aircraft or queue card · ${options.fighters.length} legal targets`;
}
function renderAction(s) {
  let text='',sub='',button='';
  if(interaction&&!queue.busy) {
    const t=interaction,options=targetOptions(s,t);text=targetTitle(s);sub=targetHint(s);
    button='<button class="quiet" data-ui="cancel-target">Cancel</button>';
    if(needsWorkPosition(t)&&t.stage!=='work')button+=`<button class="primary" data-ui="work-position" ${options.work.length?'':'disabled'}>Choose work position →</button>`;
    else if(t.stage!=='gunner')button+=`<button class="primary" data-ui="confirm-target" ${canConfirm(s,t)?'':'disabled'}>Confirm ${t.stage==='work'?t.workCellId??'position':'target'} →</button>`;
    const detail=$('#target-detail');detail.hidden=false;detail.innerHTML=`<strong>${esc(def(t.gunnerId??t.crewId)?.name??'Choose a completed gunner')} · ${esc(t.action==='opportunityShot'?'1 Opportunity':availableActions(s,t.crewId).find(a=>a.id===t.action)?.cost??'Free')}</strong><span>${esc(t.cells.join(' + ')||t.targetId&&def(t.targetId)?.name||'Tap highlighted targets')}</span>${needsWorkPosition(t)?`<span>${workTiming(s,t)}</span>`:''}${t.stage==='work'?`<span>Worker: ${esc(t.workCellId??'choose internal position')} · targets stay on their original squares</span>`:''}`;
  }
  else if(queue.busy) { text=describeEvent(queue.current).title;sub=queue.speed==='manual'||queue.paused?'Step through each major beat at your pace.':queue.current?.message??'';button=`<button class="quiet" data-ui="skip">Skip</button><button class="primary" data-ui="${queue.speed==='manual'||queue.paused?'step':'pause'}">${queue.speed==='manual'||queue.paused?'Next beat →':'Pause beats'}</button>`; }
  else if(s.phase==='ready') { text=s.round?'Crew ready for the next leg.':'Your aircraft is ready.';sub=s.round?'Refill bags, complete work, then resolve fire.':'Begin round one. Choose your crew order.';button=`<button class="primary" data-command="startRound">${s.round?'Begin next round':'Begin sortie'} →</button>`; }
  else if(s.phase==='select') {const c=def(selectedCrew);text=c?`${c.number} / ${c.name}`:'Choose an available crew member';sub='Tap crew for abilities and a free gun-arc preview.';button=`${c?.abilities?.includes('intercept')&&isAtStation(s,s.crew.find(v=>v.id===c.id))?'<label class="intercept"><input id="intercept" type="checkbox"'+(interceptRequested?' checked':'')+'> Intercept</label>':''}<button class="primary" data-ui="activate" ${availableCrew(s).some(c=>c.id===selectedCrew)?'':'disabled'}>Activate & draw →</button>`;}
  else if(s.phase==='action') {text=`${def(s.activeCrew)?.name ?? 'Crew'} · choose one action`;sub='Complete your action, then use any available Opportunity before the enemy queue.';button='<button class="primary" data-ui="choose">Choose action →</button>';}
  else if(s.phase==='opportunity') {text='Opportunity window';sub=opportunityAvailability(s).enabled?'Take a Basic Shot with a completed gunner, or continue to the pending enemy phase.':'No legal Opportunity Shot remains. Continue to the pending enemy phase.';button='<button class="primary" data-command="continueEnemyPhase">Continue to Enemy Phase →</button>';}
  else if(s.phase==='roundEnd') {text='All ten time slots complete.';sub='Check control, structure and engines independently.';button='<button class="primary" data-command="endRound">Altitude checks & advance →</button>';}
  else if(s.phase==='bombing') {text='Target below. Make your run.';sub='Provisional bombing test. Return home after the attempt.';button='<button class="primary" data-command="bomb">Release bombs →</button>';}
  else {text=s.outcome==='success'?'Welcome home.':s.altitude<=0?'Aircraft lost.':'Sortie complete.';sub='Review the flight report or adjust the next flight.';button='<button class="primary" data-ui="dev">Plan another sortie →</button>';}
  if(!interaction)$('#target-detail').hidden=true;
  if(!interaction&&!queue.busy&&s.config.opportunityEnabled&&s.phase==='opportunity') {
    const chance=opportunityAvailability(s);
    button=`<button class="opportunity-button ${chance.enabled?'available':'unavailable'}" data-ui="opportunity" aria-label="${esc(chance.enabled?'Spend Opportunity for one Basic Shot':chance.reason)}">◎ ${s.opportunity??0}/${s.config.opportunityCap}<small>Opportunity</small></button>`+button;
  }
  $('#action-context').innerHTML=`<strong>${esc(text)}</strong><small>${esc(sub)}</small>`;
  $('#primary-action').innerHTML=button;
}
function renderLog() {
  const key=d=>d.dataset.logGroup??`raw:${d.querySelector('summary')?.textContent}`;
  const expanded=new Set([...$('#event-log').querySelectorAll('details[open]')].map(key));
  $('#event-log').innerHTML=logMarkup(queue.log);
  $('#event-log').querySelectorAll('details').forEach(d=>{if(expanded.has(key(d)))d.open=true;});
}
function renderSummary(s) {
  $('#summary').hidden=s.phase!=='ended'; if(s.phase!=='ended')return;
  const elapsed=Math.round(((s.endedAt??Date.now())-s.startedAt)/60000);
  $('#summary').innerHTML=`<div class="eyebrow">END OF SORTIE / SEED ${esc(s.seed)}</div><h2>${s.outcome==='success'?'Home, at last.':'A flight to learn from.'}</h2><p>${s.round} rounds · ${elapsed} minutes · bombing ${s.mission.bombed ? esc(s.mission.bombingResult ?? 'attempted') : 'not reached'}</p><div class="telemetry">${Object.entries(s.stats).map(([k,v])=>`<div><small>${esc(k.replace(/([A-Z])/g,' $1'))}</small><strong>${typeof v==='object'?Object.entries(v).map(([a,b])=>`${a}: ${b}`).join(' · '):esc(v)}</strong></div>`).join('')}</div><button data-ui="export" class="quiet">Export full report</button>`;
}

function openDialog(id) { if(queue.busy&&!queue.paused&&queue.speed!=='manual')queue.togglePause();focusBeforeDialog=document.activeElement; const dialog=$(id);if(!dialog.open)dialog.showModal(); }
function closeDialog() {document.querySelectorAll('dialog[open]').forEach(d=>d.close());focusBeforeDialog?.focus({preventScroll:true});}
function notice(message) {
  const content=document.querySelector('dialog[open] .dialog-content');
  if(content){let error=content.querySelector('.action-error');if(!error){error=document.createElement('p');error.className='action-error';error.setAttribute('role','alert');content.prepend(error);}error.textContent=message;error.scrollIntoView({block:'nearest'});return;}
  $('#notice').textContent=message;$('#notice').hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('#notice').hidden=true,6500);
}
function send(command) {
  const prior=interaction;interaction=null;
  try {queue.send(command);if(command.type==='activate')interceptRequested=false;closeDialog();if(queue.busy)$('#board-stage').scrollIntoView({block:'start',behavior:'instant'});return true;}
  catch(e){interaction=prior;render();notice(e.message);return false;}
}

function openOpportunity() {
  if(queue.busy)return;
  const s=queue.view,chance=opportunityAvailability(s);
  if(!chance.enabled) {
    $('#info-title').textContent='Opportunity Shot';
    $('#info-content').innerHTML=`<p><b>${s.opportunity??0} / ${s.config.opportunityCap} Opportunity</b></p><p>${esc(chance.reason)}</p><p>A healthy gunner whose normal action is complete can take one Basic pull from an operating gun station. Shots happen only in this window before the pending enemy phase. Fighter kills can earn another Opportunity.</p>`;
    openDialog('#info-dialog');return;
  }
  interaction=beginTargeting('opportunityShot',null);closeDialog();render();
  $('#crew-list').scrollIntoView({block:'center',behavior:'instant'});
}

const actionDescriptions={basicFire:'One free combat pull against a fighter in your operating gun arc.',advancedFire:'Keep hitting one fighter until a miss. A first-pull miss grants exactly one more pull.',repair:'Select connected damaged squares. Work completes after the configured duration.',fireControl:'Select connected burning squares. Squares under active suppression do not spread.',medical:'Treat one injured crewmate. Care completes after the configured duration.',relocate:'Move to a safe fuselage square. This uses your action.',manCockpit:'Take an empty pilot seat. This uses your action.',restartEngine:'Attempt to restart a stopped, fully repaired engine from a pilot seat.',directFire:'Create 1 Opportunity up to the cap. Uses this action and the shown Officer cost; does not fire a weapon.',convert:'Change Resource denominations. Enlisted to Officer returns surplus tokens to discard; Officer to Enlisted requires extra Resource tokens from the mission bag. Copilot only.',rotateFighter:'Turn one fighter 90° away from the B-17.',escort:'Call an escort into a random quadrant for the rest of this round.',wait:'Hold position. Use the activation, then resolve the enemy queue.'};
function crewDetails(s,c) {
 const d=def(c.id),status=crewStatus(s,c,selectedCrew===c.id),station=stationStatus(s,c);
 return '<div class="crew-detail status-'+status.id+'"><strong>'+esc(status.icon+' '+status.label)+'</strong><p>Physical position: <b>'+esc(station.position)+'</b></p><p>'+esc(station.name)+' — <b>'+esc(station.label)+'</b></p>'+(status.job?'<p>Working: '+esc(({repair:'Repair',fireControl:'Fire Control',medical:'Medical'})[status.job.kind]??status.job.kind)+' · completes Round '+status.job.completeRound+'</p>':'')+'<small>'+esc(d.tags.join(' · '))+'</small></div>';
}
function openActions(crewId=queue.view.activeCrew??selectedCrew) {
 chosenAction=null;
 const s=queue.view,c=s.crew.find(c=>c.id===crewId);if(!c)return;
 if(selectedCrew!==crewId)interceptRequested=false;
 selectedCrew=crewId;render();
 const canAct=!queue.busy&&s.phase==='action'&&s.activeCrew===crewId;
 const canActivate=!queue.busy&&s.phase==='select'&&availableCrew(s).some(c=>c.id===crewId);
 $('#action-title').textContent=def(crewId).name+(canAct?' · one action':' · crew details');
 const actions=availableActions(s,crewId),groups=['General Actions','Role Actions','Station Actions'];
 $('#action-content').innerHTML=crewDetails(s,c)+'<p class="small muted">'+s.resources.Officer+' Officer / '+s.resources.Enlisted+' Enlisted resources held'+(!canAct?' · Preview: activate before taking an action.':'')+'</p>'+groups.map(group=>{const list=actions.filter(a=>actionGroup(a.id)===group);return list.length?'<section class="action-group"><h3>'+group+'</h3><div class="action-options">'+list.map(a=>'<button data-action="'+a.id+'" class="action-option" '+(canAct&&a.enabled?'':'disabled')+'><span><strong>'+esc(a.label)+'</strong><small>'+esc(a.enabled?actionDescriptions[a.id]:a.reason)+'</small></span><b>'+esc(a.cost??'FREE')+'</b></button>').join('')+'</div></section>':'';}).join('')+'<div class="choice-footer"><button class="quiet" data-ui="close">Preview board</button>'+(canActivate?(def(crewId).abilities?.includes('intercept')&&isAtStation(s,c)?'<label class="intercept"><input id="sheet-intercept" type="checkbox"'+(interceptRequested?' checked':'')+'> Intercept Enemy draw as Flak</label>':'')+'<button class="primary" data-ui="activate">Activate & draw →</button>':'')+'</div>';
 openDialog('#action-dialog');
}
const option=(value,label)=>`<option value="${esc(value)}">${esc(label)}</option>`;
function chooseAction(id) {
  chosenAction=id;
  const s=queue.view,c=s.crew.find(c=>c.id===s.activeCrew),action=availableActions(s,s.activeCrew).find(a=>a.id===id);
  if(!action?.enabled)return;
  $('#action-title').textContent=action.label;
  let choices='';
  if(DIRECT_ACTIONS.includes(id)) {interaction=beginTargeting(id,c.id);closeDialog();render();$('#board-stage').scrollIntoView({block:'start',behavior:'instant'});return;}
  if(id==='restartEngine') choices='<label>Engine<select name="targetId">'+s.engines.filter(e=>!e.running&&BOARD.filter(b=>b.engine===e.id).every(b=>s.cells[b.id]==='healthy')).map(e=>option(e.id,'Engine '+e.id.slice(1))).join('')+'</select></label>';
  else if(id==='manCockpit') choices=`<label>Empty cockpit seat<select name="stationId">${['pilot','copilot'].filter(id=>!(c.station===id&&isAtStation(s,c))&&!STATIONS[id].cells.some(id=>s.cells[id]==='fire')&&!s.crew.some(other=>other.id!==c.id&&other.health!=='dead'&&other.position.some(p=>STATIONS[id].cells.includes(p)))).map(id=>option(id,def(id).name+' station')).join('')}</select></label>`;
  else if(id==='relocate') choices=`<label>Safe fuselage position<select name="targetId">${BOARD.filter(b=>b.fuselage&&s.cells[b.id]!=='fire'&&!(c.position.length===1&&c.position[0]===b.id)&&!s.crew.some(other=>other.id!==c.id&&other.health!=='dead'&&other.position.includes(b.id))).map(b=>option(b.id,`${b.id} · ${section(b.section).name}`)).join('')}</select></label>`;
  else if(id==='convert') {
    const choicesByRank=conversionOptions(s);
    choices=`<label>Conversion<select name="to">${choicesByRank.map(o=>`<option value="${o.to}" ${o.enabled?'':'disabled'}>${esc(o.label)}${o.enabled?'':' — unavailable'}</option>`).join('')}</select></label><div class="conversion-explanation">${choicesByRank.map(o=>`<p><b>${esc(o.label)}</b><br>${o.enabled?(o.bagNeeded?`${o.bagNeeded} extra Resource token(s) come from the mission bag.`:`${o.cost-o.gain} surplus Resource token(s) enter discard.`):esc(o.reason)}</p>`).join('')}</div>`;
  }
  $('#action-content').innerHTML=`<p>${esc(actionDescriptions[id])}</p><form id="choice-form">${choices}<div class="choice-footer"><button type="button" data-ui="back-actions" class="quiet">← Actions</button><button class="primary" type="submit">${esc(action.label)}${action.cost?` · ${esc(action.cost)}`:''}</button></div></form>`;
}
function configForm(config,seed) {
  const groups=[...new Set(CONFIG_FIELDS.map(f=>f.group??'Rules'))];
  $('#dev-form').innerHTML=`<label class="seed-field">RNG seed<input name="seed" value="${esc(seed)}" maxlength="100" required><small>Same settings, seed and decisions reproduce the run.</small></label>`+groups.map(g=>`<details class="config-group" ${g===groups[0]?'open':''}><summary>${esc(g)}</summary><div class="config-grid">${CONFIG_FIELDS.filter(f=>(f.group??'Rules')===g).map(f=>`<label class="${f.type==='boolean'?'checkbox-field':''}">${f.type==='boolean'?`<input type="checkbox" name="${f.key}" ${config[f.key]?'checked':''}>`:''}<span>${esc(f.label)}</span>${f.type==='boolean'?'':f.type==='select'?`<select name="${f.key}">${f.options.map(v=>typeof v==='object'?`<option value="${v.value}" ${config[f.key]===v.value?'selected':''}>${esc(v.label)}</option>`:`<option ${config[f.key]===v?'selected':''}>${esc(v)}</option>`).join('')}</select>`:`<input name="${f.key}" type="number" min="${f.min??0}" max="${f.max??100}" step="${f.step??1}" value="${config[f.key]}">`}${f.description?`<small>${esc(f.description)}</small>`:''}</label>`).join('')}</div></details>`).join('');
}
function readDevForm() {
  const values=new FormData($('#dev-form')),config={};
  for(const f of CONFIG_FIELDS)config[f.key]=f.type==='boolean'?values.has(f.key):f.type==='number'?Number(values.get(f.key)):values.get(f.key);
  return normalizeConfig(config);
}
function rememberPreferences(config) {
  devPreferences=normalizeConfig(config);
  const saved=saveDevPreferences(devPreferences);
  $('#dev-prefs-status').textContent=saved?'Saved on this browser · applies next run.':'Settings kept for this tab; browser storage is unavailable.';
  render();return saved;
}
function openDev() {
  configForm(devPreferences,queue.state.seed);
  $('#dev-prefs-status').textContent=isConfigModified(devPreferences)?'Saved playtest overrides · applies next run.':'Canonical defaults · applies next run.';
  openDialog('#dev-dialog');
}
function inspectCell(id) {
  const s=queue.view,b=cell(id);if(!b)return;
  $('#info-title').textContent=`Square ${id}`;
  $('#info-content').innerHTML=`<p>${b.structure?`${esc(section(b.section).name)} · <b>${s.cells[id]}</b>`:'Open sky. An attack here passes through.'}</p>${b.engine?`<p>Engine ${esc(b.engine)} damageable footprint.</p>`:''}${b.engineIndicator?`<p>${esc(b.engineIndicator)} running indicator: visual only. This square contains no aircraft structure and cannot damage the engine.</p>`:''}<p>${s.crew.filter(c=>c.health!=='dead'&&c.position.includes(id)).map(c=>`${def(c.id).name}: ${c.health}`).join('<br>')||'No crew at this position.'}</p><p class="small muted">Quarters: 1 top left, 2 top right, 3 bottom left, 4 bottom right. Aircraft damage and crew injury resolve separately.</p>`;
  openDialog('#info-dialog');
}
function help() {
  $('#info-title').textContent='Your field guide';
  $('#info-content').innerHTML=`<p><b>Fly to the target. Attempt the bombing run. Reach HOME.</b> This is a provisional v3 rules test; settings and the authoritative CSV board map are documented in <a href="./README.md">the developer notes</a>.</p><ol class="guide-list"><li><b>Start the round.</b> Bags refill, work completes, fire spreads.</li><li><b>Choose ready crew in any order.</b> Activate to draw a mission token. Officers gain Officer resources; enlisted crew gain Enlisted resources. An enemy draw spawns a fighter or causes Flak.</li><li><b>Choose one action.</b> Fire at an enemy in arc, repair, suppress fire, treat injuries, or use a role ability. Work takes time; it completes at a future round start.</li><li><b>Watch the enemy queue.</b> Facing fighters attack; others turn. Every roll, square, consequence and movement appears in the recorder.</li><li><b>Finish ten time slots.</b> Unavailable crew still draw and face enemies. Then make independent altitude checks and advance.</li></ol><p><b>Damage:</b> healthy → damaged → fire. A hit injures a healthy occupant; a second hit kills. A critical adds two aircraft damage steps but checks crew only once.</p><p><b>Stay airborne:</b> Keep a usable cockpit staffed, repair compromised sections, and restart repaired engines from a pilot seat. These three altitude checks can all cost altitude.</p><p><b>Economy:</b> Held resources stay outside the mission bag. Spending returns them to discard. Copilot converts 2 Enlisted to 1 Officer and returns the surplus token to discard; the reverse conversion spends 1 Officer and removes an additional Resource token from the bag to make 2 Enlisted. Without that extra token, reverse conversion is unavailable.</p><p><b>Combat:</b> Hit deals 1 HP; Burst deals 2 HP; Miss deals none. Advanced Fire continues on Hit or Burst. Damaging hits Disrupt a fighter: rotations still happen, but its next attack is cancelled and it flies by normally.</p><p><b>Opportunity:</b> This separate counter starts at 1 and normally gains 1 per fighter kill, up to 3. After a normal crew action finishes, an Opportunity window opens when a legal shot is available. Only gunners whose normal action is complete may shoot. Spend one for one Basic pull, chain any earned Opportunity, then choose Continue to Enemy Phase. No extra mission draw, slot or enemy phase is created. Pilot Direct Fire spends 1 Officer and the normal action to create one Opportunity.</p><p><b>Crisis timing:</b> Work begun in Round N normally completes at Round N+2 Start. Worker and Medical patient remain unavailable through N+1. Select the complete target set up front; Repair skips selected squares that become Fire. Fire Control suppresses its selected fires immediately.</p><p><b>Controls:</b> Select crew, then use the button at the bottom. Action choices open in a sheet. Tap a board square or unavailable crewmate for details. Pause, step, or skip the event sequence at any time. Your flight and pending events autosave locally.</p><p><b>Testing:</b> Playtest settings restart the sortie with your seed and chosen rules. Bombing, mission length, Flak count and work costs/durations are provisional.</p>`;
  openDialog('#info-dialog');
}
function exportRun() {
  const blob=new Blob([JSON.stringify(queue.export(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`milk-run-${queue.state.seed.replace(/[^a-z0-9_-]/gi,'_')}-round-${queue.state.round}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

document.addEventListener('click', e=>{
  const fighter=e.target.closest('[data-fighter]');if(fighter){const id=fighter.dataset.fighter;if(interaction&&!queue.busy){interaction=selectTarget(queue.view,interaction,'fighter',id);render();}else{const f=queue.view.fighters.find(f=>f.id===id);if(f){$('#info-title').textContent=`#${queue.view.fighters.indexOf(f)+1} ${f.type}`;$('#info-content').innerHTML=`<p>${f.hp}/${f.maxHp} HP · ${esc(f.quadrant)} / ${esc(f.altitude)}</p><p>${f.facing===0?'Facing B-17: attacks next enemy phase.':`${f.facing}° away: rotates next enemy phase.`}</p><p>Select a gunner and Fire to target this aircraft.</p>`;openDialog('#info-dialog');}}return;}
  const crew=e.target.closest('[data-crew],[data-crew-id]');if(crew){const id=crew.dataset.crew??crew.dataset.crewId;if(interaction&&!queue.busy){const wasGunner=interaction.stage==='gunner';interaction=selectTarget(queue.view,interaction,'crew',id);if(wasGunner&&interaction.stage==='target')selectedCrew=interaction.gunnerId;render();if(wasGunner&&interaction.stage==='target')$('#board-stage').scrollIntoView({block:'start',behavior:'instant'});}else {openActions(id);}return;}
  const square=e.target.closest('[data-cell]');if(square){if(interaction&&!queue.busy){interaction=selectTarget(queue.view,interaction,'cell',square.dataset.cell);render();}else inspectCell(square.dataset.cell);return;}
  const action=e.target.closest('[data-action]');if(action){chooseAction(action.dataset.action);return;}
  const command=e.target.closest('[data-command]');if(command){send({type:command.dataset.command});return;}
  const control=e.target.closest('[data-ui]');if(!control)return;
  switch(control.dataset.ui){
    case 'activate':send({type:'activate',crewId:selectedCrew,intercept:Boolean(def(selectedCrew)?.abilities?.includes('intercept')&&interceptRequested)});break;
    case 'choose':case 'back-actions':openActions();break;
    case 'opportunity':openOpportunity();break;
    case 'cancel-target':interaction=null;render();break;
    case 'work-position':if(interaction&&targetOptions(queue.view,interaction).work.length){interaction={...interaction,stage:'work'};render();}break;
    case 'confirm-target':if(canConfirm(queue.view,interaction))send(targetingCommand(interaction));break;
    case 'close':closeDialog();break;
    case 'help':help();break;
    case 'enemies':$('.enemy-panel').scrollIntoView({block:'center',behavior:'smooth'});break;
    case 'dev':openDev();break;
    case 'reset-defaults':{const cleared=resetDevPreferences();devPreferences={...DEFAULT_CONFIG};configForm(devPreferences,queue.state.seed);$('#dev-prefs-status').textContent=cleared?'Saved overrides cleared. Canonical defaults apply next run; current sortie is unchanged.':'Defaults restored for this tab; browser storage could not be cleared.';render();break;}
    case 'apply-dev':{const form=$('#dev-form');if(!form.reportValidity())break;try{const config=readDevForm(),seed=new FormData(form).get('seed')||'MILK-RUN';rememberPreferences(config);closeDialog();initialize(config,seed);}catch(error){notice(error.message);}break;}
    case 'pause':queue.togglePause();break;
    case 'step':queue.step();break;
    case 'skip':queue.flush();break;
    case 'export':exportRun();break;
  }
});
document.addEventListener('change',e=>{
  if(!e.target.matches('#intercept,#sheet-intercept'))return;
  interceptRequested=e.target.checked;
  document.querySelectorAll('#intercept,#sheet-intercept').forEach(input=>{input.checked=interceptRequested;});
});
document.addEventListener('submit',e=>{
  if(e.target.id!=='choice-form')return;e.preventDefault();send({type:'action',action:chosenAction,...Object.fromEntries(new FormData(e.target))});
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('svg [role="button"]')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
$('#speed').addEventListener('change',e=>{queue.setSpeed(e.target.value);rememberPreferences({...devPreferences,presentationSpeed:e.target.value});});
$('#dev-form').addEventListener('change',()=>{if(!$('#dev-form').checkValidity())return;try{rememberPreferences(readDevForm());$('#dev-form').closest('.dialog-content').querySelector('.action-error')?.remove();}catch(error){$('#dev-prefs-status').textContent='Not saved: '+error.message;}});
$('#log-details').addEventListener('toggle',()=>{if($('#log-details').open)renderLog();});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}}));
// Keep playback beside the board at every width; the same controls serve mobile.
$('#board-stage').after($('.playback'));
const savedSession=loadSession();
const legacyBoardSave=!savedSession&&hasLegacyBoardSave();
initialize(devPreferences,'MILK-RUN',savedSession);
if(legacyBoardSave)notice('The board geometry has been corrected. Start a new sortie on this map; your previous-board save has been kept separately.');
window.milkRun={ getState:()=>structuredClone(queue.state),getView:()=>structuredClone(queue.view),getQueue:()=>queue.pending.map(({state,...e})=>e),getInteraction:()=>structuredClone(interaction),send,restart:(config,seed)=>initialize(config??devPreferences,seed),getPreferences:()=>({...devPreferences}),setSpeed:s=>queue.setSpeed(s),flush:()=>queue.flush(),exportSession:()=>queue.export() };
