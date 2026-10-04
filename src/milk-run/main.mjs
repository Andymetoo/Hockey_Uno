import { compactCrewFlow, crewFlowState, compactCost, actionPalette, STATION_PALETTE, nearbyTargets } from './crew-flow.mjs';
import { createGame } from './state.mjs';
import { freshSortieSeed } from './random.mjs';
import { missionExportFilename } from './mission-export.mjs';
import { recorderWindow, RECORDER_PAGE_SIZE } from './recorder.mjs';
import { measure } from './performance.mjs';
import { DEFAULT_CONFIG, CONFIG_FIELDS, normalizeConfig, configScope, modifiedConfigScopes } from './config.mjs';
import { isV2, missionLengths as rulesetMissionLengths } from './rulesets.mjs';
import { BOARD, SECTIONS, STATIONS, CREW_DEFS } from './board.mjs';
import { dispatch, availableCrew, availableActions, conversionOptions, opportunityAvailability, canAbortWork, eligibleStations, eligibleAssistJobs, legalWorkPositions, reclaimReliefPlan } from './rules.mjs';
import { effectiveTimeThreshold, homeStationId, crewStateProblems } from './crew-position.mjs';
import { sortieResult } from './results.mjs';
import { bombRunTargetWarning, DEFAULT_BOMBING_TARGET, getBombingTarget, bombingOutcomeLabel } from './bombing.mjs';
import { bombRunMarkup, targetChoiceMarkup } from './bomb-run-view.mjs';
import { mountBombRunTest } from './bomb-run-test-view.mjs';
import { canTurnBack, emergencyReturnDistance } from './turn-back.mjs';
import { createCampaignStore, loadCampaignStore, saveCampaignStore, createCampaign, commissionAircraft, selectCampaign, renameAircraft, renameCrew, prepareCampaignSortie, finalizeCampaignSortie } from './campaign.mjs';
import { campaignMarkup } from './campaign-view.mjs';
import { campaignBackup, parseCampaignBackup, storeCampaignBackup, discardActiveCampaignSession } from './campaign-session.mjs';
import { ResolutionQueue } from './queue.mjs';
import { boardMarkup, fighterPositions } from './board-view.mjs';
import { crewStatus, stationStatus, availableCount, actionGroup, actionIconMarkup } from './ui-model.mjs';
import { describeEvent } from './presentation.mjs';
import { crewMarkup, enemyMarkup, eventMarkup, logMarkup, altitudeMarkup, continuousHudMarkup, activeJobsMarkup, jobKindLabel } from './views.mjs';
import { v2TelemetryRows } from './telemetry.mjs';
import { DIRECT_ACTIONS, beginTargeting, targetOptions, selectTarget, needsWorkPosition, canConfirm, targetingCommand, assistantOptions } from './targeting.mjs';
import { crisisTargetCap } from './rules.mjs';
import { SAVE_KEY, loadSession, saveSession, hasLegacyBoardSave, loadDevPreferences, saveDevPreferences, resetDevPreferences, resetDevPreferencesScope } from './persistence.mjs';
import { deriveCellHistory, hitLocationHeatMap } from './diagnostics.mjs';
import { healthProvenance } from './crew-health.mjs';
import { specialistStatus } from './crew-position.mjs';
import { storyIndicatorMarkup, storyConditionsMarkup, storyChoiceMarkup, storyFactsMarkup } from './story-view.mjs';
import { storyToken, storyJobTime } from './story-effects.mjs';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const def = id => CREW_DEFS.find(c => c.id === id);
const sectionEntries = () => Object.entries(SECTIONS);
const section = id => SECTIONS[id] ?? { name: id, color: '#8b9880' };
const cell = id => BOARD.find(c => c.id === id);
let queue, selectedCrew = null, chosenAction = null, saveWarning = false;
let focusBeforeDialog = null, interaction = null, previousFighters = new Map(), previousBeat = null;
let compactChoice = null, paletteFocus = null, targetChooser = null;
let compactHudExpanded = false;
let hitMapEnabled = false, hitMapStructure = true, hitMapEmpty = true;
let devPreferences = loadDevPreferences();
let selectedBombDie = null, campaignStore, campaignStoreError = '', pendingCampaignImport = null;
let resultPresented = false;
let autosaveEnabled = true, pendingDiscard = null;
let shownStoryPrompt = null;
let storySelection = null;
let recorderEnd = null, renderedRecorderLog = null, renderedRecorderKey = '';
try {campaignStore=loadCampaignStore();}catch(error){campaignStore=createCampaignStore();campaignStoreError=error.message;}

$('#app').innerHTML = `
  <header class="topbar">
    <a href="../../index.html" class="home-link" aria-label="Return to prototype launcher">← <span>PROTOTYPES</span></a>
    <div class="wordmark">MILK RUN <span id="ruleset-label">V1 — ROUND-BASED</span><span id="rules-modified" class="rules-modified" hidden>PLAYTEST RULES MODIFIED</span></div>
    <button class="quiet turn-back-button" data-ui="turn-back" aria-label="Turn back and abort the mission" hidden>Turn Back</button>
    <button class="quiet" data-ui="new-sortie" aria-label="Start a new sortie"><span class="desktop-label">New sortie</span><span class="mobile-label">New</span></button>
    <button class="quiet" data-ui="help" aria-label="How to play"><span class="desktop-label">Field guide</span><span class="mobile-label">Guide</span></button>
    <button class="quiet" data-ui="dev" aria-label="Playtest settings"><span class="desktop-label">Playtest settings</span><span class="mobile-label">Dev</span></button>
  </header>
  <div class="playback-topline"><button class="quiet campaign-entry" data-ui="campaign">Campaign</button><span id="campaign-sortie-label" class="campaign-sortie-label" hidden></span><div class="playback" aria-label="Presentation controls"><label>Speed <select id="speed" aria-label="Presentation speed"><option value="manual">Step / Manual</option><option value="normal">Normal</option><option value="fast">Fast</option><option value="instant">Instant</option></select></label><button data-ui="pause" class="quiet">Pause</button><button data-ui="step" class="quiet">Step</button><button data-ui="skip" class="quiet">Skip</button></div></div>
  <div id="status" class="status-strip" aria-label="Sortie status"></div>
  <div id="story-status" class="story-status" hidden></div>
  <div id="time-status" class="time-status" hidden aria-live="polite"></div>
  <div id="bombardier-warning" class="bombardier-warning" role="alert" hidden></div>
  <main class="tabletop">
    <section class="mission-panel panel"><div class="panel-label">01 / FLIGHT PLAN <span id="mission-label"></span></div><div id="mission-track" class="mission-track"></div></section>
    <section id="bomb-run-panel" class="bomb-run-panel panel" hidden></section>
    <section class="crew-panel panel"><div class="panel-label">02 / YOUR CREW <span id="available-count">AVAILABLE 10/10</span></div><div id="crew-list" class="crew-list"></div><div id="active-jobs" class="active-jobs" hidden></div><p class="crew-note">One draw. One action. Then the fighters.<br>Injured, busy and lost crew still consume time.</p></section>
    <section class="board-panel panel">
      <div class="board-heading"><div><div class="eyebrow">BOEING B-17 / FLYING FORTRESS</div><h1>The long way home.</h1></div><button class="board-badge" id="enemy-shortcut" data-ui="enemies">0 / 3 HOSTILES<br>VIEW QUEUE ↓</button></div>
      <div id="board-stage" class="board-stage" aria-live="polite"></div><div id="conditions" class="conditions"></div><div class="board-and-altitude"><div id="board" class="board-wrap"></div><div id="altitude-track" class="altitude-track" aria-label="Altitude track"></div><div id="map-opportunity" class="map-opportunity" role="img" hidden></div></div><div id="target-detail" class="target-detail" hidden></div>
      <div class="board-key"><span><i class="key-damage">×</i> Damage</span><span><i class="key-fire">♨</i> Fire</span><span><i class="key-crew">3</i> Crew</span><span>Quarter: 1 2 / 3 4</span></div>
      <div id="section-key" class="section-key"></div>
    </section>
    <aside class="right-rail">
      <section class="enemy-panel panel"><div class="panel-label">03 / ENEMY QUEUE <span id="fighter-count"></span></div><div id="enemies"></div><p class="small muted">Resolve from top to bottom. Facing arrows show whether each fighter attacks or turns.</p></section>
      <section class="event-panel panel"><div class="panel-label">04 / RESOLUTION <span id="queue-count"></span></div><div id="event" class="event-card" role="status" aria-live="polite"></div></section>
      <section class="bag-panel panel"><details><summary>Bag intelligence</summary><div id="bags"></div></details></section>
    </aside>
    <section class="diagnostic-panel panel"><div class="diagnostic-tools"><div><b>PLAYTEST DIAGNOSTICS</b><small>Enemy hit-location rolls · this sortie</small></div><button class="quiet" data-ui="hit-map-toggle" aria-pressed="false">Show hit-location overlay</button><label for="hit-map-structure"><input id="hit-map-structure" type="checkbox" checked disabled><span data-hit-map-count="structure">Aircraft · 0</span></label><label for="hit-map-empty"><input id="hit-map-empty" type="checkbox" checked disabled><span data-hit-map-count="empty">Empty space · 0</span></label></div></section>
    <section class="log-panel panel"><details id="log-details"><summary>Flight recorder <span id="log-count"></span></summary><div class="log-tools"><button class="quiet" data-ui="export">Export sortie + log</button></div><ol id="event-log" reversed></ol></details></section>
    <section id="summary" class="summary-panel panel" hidden></section>
  </main>
  <footer class="action-dock"><section id="crew-flow" aria-label="Crew action panel" hidden></section><button id="opportunity-control" class="opportunity-button unavailable" data-ui="opportunity" aria-label="Opportunity status"></button><div id="action-context"></div><div id="primary-action"></div></footer>
  <div id="notice" role="alert" hidden></div>
  <dialog id="action-dialog" class="sheet"><div class="dialog-heading"><div><div class="eyebrow">CREW ACTIVATION</div><h2 id="action-title">Choose one action</h2></div><button data-ui="close" class="close" aria-label="Close actions">×</button></div><div id="action-content" class="dialog-content"></div></dialog>
  <dialog id="dev-dialog" class="sheet wide"><div class="dialog-heading"><div><div class="eyebrow">NEXT SORTIE / PLAYTEST SETTINGS</div><h2>Flight test settings</h2></div><button data-ui="close" class="close" aria-label="Close playtest settings">×</button></div><div class="dialog-content"><p><b>Applies to next sortie.</b> Valid changes save automatically on this browser. Common settings apply to either ruleset; V1 and V2 settings are stored separately. Your current sortie keeps its rules. Presentation speed can also be changed beside the board.</p><p id="dev-prefs-status" class="small" role="status"></p><form id="dev-form"></form></div><footer class="dialog-footer dev-footer"><div class="reset-controls"><button class="quiet" data-ui="reset-v1">Reset V1</button><button class="quiet" data-ui="reset-v2">Reset V2</button><button class="quiet" data-ui="reset-defaults">Reset All to Defaults</button></div><button class="primary" data-ui="apply-dev">Launch with these settings</button></footer></dialog>
  <dialog id="info-dialog" class="sheet"><div class="dialog-heading"><h2 id="info-title"></h2><button data-ui="close" class="close" aria-label="Close details">×</button></div><div id="info-content" class="dialog-content"></div></dialog>
  <dialog id="campaign-dialog" class="sheet wide"><div class="dialog-heading"><div><div class="eyebrow">HISTORY / V2 CAMPAIGN</div><h2>Campaign Hangar</h2></div><button data-ui="close" class="close" aria-label="Close campaign">×</button></div><div id="campaign-content" class="dialog-content"></div></dialog>
  <dialog id="sortie-dialog" class="sheet"><div class="dialog-heading"><div><div class="eyebrow">NEW SORTIE</div><h2>Choose your ruleset</h2></div><button data-ui="close" class="close" aria-label="Close new sortie">×</button></div><form id="sortie-form"><div class="dialog-content"><p>Launch a clean sortie with your saved playtest settings. This replaces the current autosaved sortie.</p><fieldset class="ruleset-options"><legend>Ruleset for this sortie</legend><label class="ruleset-choice"><input type="radio" name="ruleset" value="v1" required><span><strong>V1 — Round-Based</strong><small>Current/classic Milk Run rules.</small></span></label><label class="ruleset-choice experimental"><input type="radio" name="ruleset" value="v2-continuous"><span><strong>V2 — Continuous Time <b>EXPERIMENTAL</b></strong><small>Crew readiness, aircraft progress and fighter lifespan use independent clocks.</small></span></label></fieldset><label class="seed-field">RNG seed<input name="seed" value="MILK-RUN" maxlength="100" required></label><p class="small muted">Changing your preferred ruleset affects only a new sortie. Resume always keeps the saved ruleset and timers.</p></div><footer class="dialog-footer"><button type="button" class="quiet" data-ui="close">Cancel</button><button type="submit" class="primary">Launch new sortie →</button></footer></form></dialog>
`;

const bombTestDialog = document.createElement('dialog');
const recorderNavigation = document.createElement('div');
recorderNavigation.className = 'recorder-navigation';
$('#event-log').before(recorderNavigation);
bombTestDialog.id = 'bomb-run-test-dialog';
bombTestDialog.className = 'sheet wide bomb-test-dialog';
bombTestDialog.setAttribute('aria-label', 'Bomb Run test — results are not saved');
$('#app').append(bombTestDialog);
const storyDialog = document.createElement('dialog');
storyDialog.id = 'story-dialog';
storyDialog.className = 'sheet story-dialog';
storyDialog.setAttribute('aria-labelledby', 'story-title');
storyDialog.innerHTML = '<div class="dialog-heading"><div><div class="eyebrow">IN FLIGHT / STORY</div><h2 id="story-title"></h2></div><button data-ui="close" class="close" aria-label="Inspect aircraft before deciding">×</button></div><div id="story-content" class="dialog-content"></div>';
$('#app').append(storyDialog);
const bombTest = mountBombRunTest(bombTestDialog, () => {
  const suspendedQueue = queue, hadTimer = queue.timer !== null;
  queue.dispose(); // Timer only: do not change/export any gameplay or queue flags.
  return () => { if (queue === suspendedQueue && hadTimer && queue.busy && !queue.paused) queue.schedule(); };
});
const bombTestButton = document.createElement('button');
bombTestButton.type = 'button'; bombTestButton.dataset.ui = 'test-bomb-run';
bombTestButton.textContent = 'Test Bomb Run';
$('#dev-dialog .dialog-content').prepend(bombTestButton);
const discardButton = document.createElement('button');
discardButton.type = 'button'; discardButton.dataset.ui = 'discard-campaign';
discardButton.textContent = 'Discard Active Campaign Sortie (DEV)';
$('#dev-dialog .dialog-content').prepend(discardButton);

function initialize(config = devPreferences, seed, saved = null, ruleset = config.preferredRuleset ?? 'v1', targetId=DEFAULT_BOMBING_TARGET, persist = true) {
  if(persist)unreadableSave=false;
  const state=saved?.state??createGame(config,seed,ruleset);
  if(!saved&&isV2(state))state.mission.targetId=getBombingTarget(targetId).id;
  queue?.dispose();
  autosaveEnabled = persist;
  queue = new ResolutionQueue({ state, dispatch, saved, onChange: render });
  selectedCrew = null; interaction = null; previousFighters = new Map(); previousBeat = null; compactChoice = null; paletteFocus = null; targetChooser = null;
  hitMapEnabled = false; hitMapStructure = true; hitMapEmpty = true;
  selectedBombDie = null;
  resultPresented = false;
  shownStoryPrompt = null; storySelection = null;
  recorderEnd = null; renderedRecorderLog = null; renderedRecorderKey = '';
  render();
}

function missionLengths(s) { const lengths=rulesetMissionLengths(s);return {outbound:lengths.outboundLength,back:lengths.returnLength}; }
function missionName(s) {
  const { outbound, back } = missionLengths(s);
  if (s.mission.position >= outbound + back) return 'HOME';
  if (s.phase === 'bombing' || s.phase === 'story' && s.story?.pending?.resumePhase === 'bombing') return 'OVER TARGET';
  if (s.mission.aborted) return 'ABORTED · RETURN';
  return s.mission.position < outbound ? 'OUTBOUND' : 'RETURN';
}
function render() { return measure('render', renderFrame); }
function renderFrame() {
  const s = queue.view;
  saveWarning = autosaveEnabled && !measure('autosave', () => saveSession(queue.export()));
  finalizeCampaignIfReady();
  $('[data-ui="turn-back"]').hidden=queue.busy||Boolean(interaction)||!canTurnBack(s);
  $('#campaign-sortie-label').hidden=!s.campaign;
  if(s.campaign)$('#campaign-sortie-label').textContent=`CAMPAIGN · SORTIE ${s.campaign.sortieNumber}`;
  const warning=bombRunTargetWarning(s);$('#bombardier-warning').hidden=!warning;$('#bombardier-warning').textContent=warning;
  const bombPanel=$('#bomb-run-panel');bombPanel.hidden=!isV2(s)||!s.mission.bombRun||(s.phase!=='bombing'&&s.mission.bombRun.status!=='no-drop');
  bombPanel.innerHTML=bombPanel.hidden?'':bombRunMarkup(s,selectedBombDie,queue.busy);
  const modifiedScopes=modifiedConfigScopes(s.config,s.ruleset);
  if(queue.speed!==DEFAULT_CONFIG.presentationSpeed&&!modifiedScopes.includes('common'))modifiedScopes.unshift('common');
  $('#rules-modified').hidden=!modifiedScopes.length;
  $('#rules-modified').textContent=`PLAYTEST RULES MODIFIED${modifiedScopes.length?' · '+modifiedScopes.map(scope=>scope.toUpperCase()).join(' / '):''}`;
  $('#rules-modified').title='Only Common and this active sortie’s ruleset are compared with canonical defaults. Next-sortie preferences do not alter this flight.';
  $('#ruleset-label').textContent=isV2(s)?'V2 — CONTINUOUS TIME · EXPERIMENTAL':'V1 — ROUND-BASED';
  $('#ruleset-label').classList.toggle('experimental-label',isV2(s));
  if (compactCrewFlow(s) && s.activeCrew && !interaction?.gunnerId) selectedCrew=s.activeCrew;
  if (!selectedCrew || !s.crew.some(c => c.id === selectedCrew)) selectedCrew = availableCrew(s)[0]?.id ?? null;
  const status=$('#status');
  const storyStatus=$('#story-status');
  storyStatus.innerHTML=storyIndicatorMarkup(s);storyStatus.hidden=!storyStatus.innerHTML;
  status.classList.toggle('continuous-hud',isV2(s));
  status.classList.toggle('hud-expanded',compactHudExpanded);
  status.innerHTML = isV2(s)?continuousHudMarkup(s,compactHudExpanded):`<div><span>POSITION</span><strong>${missionName(s)} <small>${s.mission.position}</small></strong></div><div><span>ALTITUDE</span><strong class="${s.altitude <= 1 ? 'danger-text' : ''}">${s.altitude} <small>LEVELS</small></strong></div><div><span>RESOURCES</span><strong><b class="officer">${s.resources.Officer}</b><small> O</small> <b class="enlisted">${s.resources.Enlisted}</b><small> E</small>${s.config.opportunityEnabled?`<small class="opportunity-count" aria-label="${s.opportunity??0} of ${s.config.opportunityCap} Opportunity">◎ ${s.opportunity??0}/${s.config.opportunityCap}</small>`:''} </strong></div><div><span>ROUND / SLOT</span><strong>${s.round || '—'} <small>/ ${s.slot ?? 0} OF 10</small></strong></div>`;
  const cap=Math.max(0,Number(s.config.opportunityCap)||0),opportunity=Math.max(0,Math.min(cap,Number(s.opportunity)||0)),mapOpportunity=$('#map-opportunity');
  mapOpportunity.hidden=!s.config.opportunityEnabled||cap===0;
  mapOpportunity.setAttribute('aria-label',`Opportunity ${opportunity} of ${cap}`);
  mapOpportunity.title=`Opportunity ${opportunity} of ${cap}`;
  mapOpportunity.innerHTML=Array.from({length:cap},(_,index)=>`<span class="${index<opportunity?'filled':''}" aria-hidden="true"></span>`).join('');
  const timeStatus=$('#time-status');timeStatus.hidden=!isV2(s)||!s.pendingProgress;
  if(isV2(s)){timeStatus.classList.toggle('pending',s.pendingProgress);timeStatus.innerHTML=`<strong>TIME ${Math.min(s.time,effectiveTimeThreshold(s))}/${effectiveTimeThreshold(s)}</strong><span>PROGRESS CHECKPOINT AFTER THIS TURN${s.overflowTimeTokens?.length?' · +1 BONUS TIME BANKED':''}</span>`;}
  renderTrack(s); renderCrew(s); renderBoard(s); renderEnemies(s); renderEvent(s); renderBags(s); renderAction(s); renderCompactFlow(s); renderSummary(s);
  $('#speed').value = queue.speed;
  $('[data-ui="pause"]').textContent = queue.paused ? 'Play' : 'Pause';
  $('[data-ui="pause"]').disabled = queue.speed==='manual';
  if(queue.speed==='manual')$('[data-ui="pause"]').textContent='Manual';
  $('[data-ui="step"]').disabled = !queue.busy;
  $('[data-ui="skip"]').disabled = !queue.busy;
  $('#queue-count').textContent = queue.busy ? `${queue.pending.length} TO FOLLOW` : 'AWAITING ORDERS';
  $('#log-count').textContent = `${queue.log.length} events${saveWarning ? ' · autosave unavailable' : ' · autosaved'}`;
  if ($('#log-details').open) renderLog();
  // The saved decision becomes visible only after the entire tactical sequence.
  // Inspecting the board dismisses its sheet, never the decision itself.
  const pending = s.phase === 'story' ? s.story?.pending : null;
  if (!queue.busy && !interaction && pending && shownStoryPrompt !== pending.id && !document.querySelector('dialog[open]')) {
    const pendingId = pending.id;
    requestAnimationFrame(() => {
      if (!queue.busy && !interaction && queue.view.phase === 'story' && queue.view.story?.pending?.id === pendingId && !document.querySelector('dialog[open]')) openStoryChoice();
    });
  }
}
function renderTrack(s) {
  const { outbound, back } = missionLengths(s), total = outbound + back;
  $('#mission-label').textContent = s.mission.aborted ? `ABORTED — ${Math.max(0,total-s.mission.position)} PROGRESS TO HOME · EMERGENCY ROUTE` : `${isV2(s)?'PROGRESS · ':''}SEED ${s.seed}`;
  $('#mission-track').innerHTML = Array.from({length:total + 1}, (_, i) => `<div class="track-space ${i === s.mission.position ? 'current' : ''} ${i < s.mission.position ? 'passed' : ''} ${i === outbound ? 'target' : ''}"><span>${i === s.mission.position ? '✈' : i < s.mission.position ? '·' : i === outbound ? '◎' : '—'}</span><small>${i === 0 ? 'START' : i === total ? 'HOME' : i === outbound ? s.mission.aborted?'TURN BACK':'TARGET' : String(i).padStart(2,'0')}</small></div>`).join('');
  const track = $('#mission-track'), current = $('#mission-track .current');
  if (current) track.scrollLeft = Math.max(0, current.offsetLeft - track.offsetLeft - track.clientWidth / 2 + current.clientWidth / 2);
}
function renderCrew(s) { $('#available-count').textContent='AVAILABLE '+availableCount(s)+'/10'; $('#crew-list').innerHTML=crewMarkup(s,selectedCrew,interaction);$('#active-jobs').hidden=!isV2(s)||!s.jobs.length;$('#active-jobs').innerHTML=activeJobsMarkup(s,queue.visual); }
function renderBoard(s) {
 const beat=queue.current?.beat??queue.current?.sequence;
 const hitMap=hitLocationHeatMap(queue.log);
 $('#board').innerHTML=boardMarkup(s,{selectedCrew,interaction,visual:queue.visual,current:queue.current,previousFighters:beat!==previousBeat?previousFighters:new Map(),hitMap,hitMapEnabled,hitMapStructure,hitMapEmpty});
 const overlayButton=$('[data-ui="hit-map-toggle"]');overlayButton.setAttribute('aria-pressed',String(hitMapEnabled));overlayButton.textContent=hitMapEnabled?'Hide hit-location overlay':'Show hit-location overlay';
 $('#hit-map-structure').disabled=!hitMapEnabled;$('#hit-map-empty').disabled=!hitMapEnabled;
 $('[data-hit-map-count="structure"]').textContent=`Aircraft · ${hitMap.structureRolls}`;
 $('[data-hit-map-count="empty"]').textContent=`Empty space · ${hitMap.emptyRolls}`;
 $('#hit-map-structure').setAttribute('aria-label',`Aircraft structure hit-location rolls: ${hitMap.structureRolls}`);
 $('#hit-map-empty').setAttribute('aria-label',`Empty-space hit-location rolls: ${hitMap.emptyRolls}`);
 if(beat!==previousBeat){previousFighters=fighterPositions(s);previousBeat=beat;}
 $('#board').classList.toggle('targeting',Boolean(interaction));
 $('#altitude-track').classList.toggle('losing',queue.current?.type==='ALTITUDE_LOST');$('#altitude-track').innerHTML=altitudeMarkup(s);
  $('#conditions').innerHTML=s.engines.map(e=>`<div class="engine-status ${e.running?'':'stopped'}"><span>ENGINE ${String(e.id).replace(/\D/g,'')}</span><strong>${e.running?'RUNNING':e.repairReady?'RESTART READY':'OFF · REPAIR'}</strong></div>`).join('');
  $('#section-key').innerHTML=sectionEntries().map(([id,d])=>`<span class="${s.compromised.includes(id)?'compromised':''}"><i style="background:${d.color}"></i>${esc(d.name)}${s.compromised.includes(id)?' !':''}</span>`).join('');
}

function renderEnemies(s) { $('#fighter-count').textContent=s.fighters.length+' / '+s.config.maxFighters; $('#enemy-shortcut').innerHTML=s.fighters.length+' / '+s.config.maxFighters+' HOSTILES<br>VIEW QUEUE ↓'; $('#enemies').innerHTML=enemyMarkup(s,{selectedCrew,interaction,visual:queue.visual}); }
function renderEvent(s) {
 const markup=eventMarkup(queue.current,queue.visual);$('#event').innerHTML=markup.detail;
 $('#board-stage').className='board-stage category-'+markup.category+(queue.busy?' playing':' resting')+(queue.current?.type==='FIGHTER_BREAKING_OFF'?' fighter-breakoff':'')+(queue.current?.type==='ENEMY_ATTACK_ROLL'&&queue.current.result==='critical'?' critical-hit':'');
 $('#board-stage').innerHTML=interaction?'<div class="beat-icon">⌖</div><div><strong>'+esc(targetTitle(s))+'</strong><small>'+esc(targetHint(s))+'</small></div>':markup.stage;
}
function renderBags(s) {
  const m=s.bags.mission,c=s.bags.combat,count=(bag,t)=>bag.tokens.filter(v=>storyToken(v)===t).length;
  $('#bags').innerHTML=`<div class="bag-line"><span>Mission</span><strong>${m.tokens.length} in bag</strong></div><div class="bag-line muted"><span>${count(m,'Enemy')} enemy · ${count(m,'Resource')} resource${isV2(s)?` · ${count(m,'Time')} Time`:''}</span><span>${m.discard.length} discard</span></div><div class="bag-line"><span>Combat</span><strong>${count(c,'Hit')} hit / ${count(c,'Burst')} burst / ${count(c,'Miss')} miss</strong></div><div class="bag-line muted"><span>Held resources stay out.</span><span>${c.discard.length} discard</span></div><p class="small muted">${isV2(s)?`${s.timeTokens.length} Time held toward Progress; ${s.overflowTimeTokens?.length??0} bonus Time banked. ${s.config.v2RefillAtProgress===false?'Discard refill at Progress is disabled; accumulated Time still returns.':'Normal refill occurs at a Progress checkpoint.'}`:'Spent resources return next round.'} Bags refill early only when empty.</p>`;
}
function targetTitle(s) {
  const t=interaction;if(t.stage==='gunner')return t.action==='directFire'?'Pilot Direct Fire · choose an operating gunner':'Opportunity Shot · choose a completed gunner';
  if(t.stage==='work')return 'Choose a safe internal work position';
  return ({repair:'Select damaged squares',fireControl:'Select burning squares',medical:'Select an injured crewmate',rotateFighter:'Select a fighter to turn',opportunityShot:'Select the gunner’s target',directFire:'Pilot Direct Fire · choose a fighter',basicFire:'Select a fighter · Basic Fire',advancedFire:'Select a fighter · Advanced Fire'})[t.action];
}
function workTiming(s,t) {
  if(isV2(s)){const kind=t.action==='fireControl'?'Fire':t.action==='medical'?'Medical':'Repair';const duration=Math.max(0,s.config[`v2${t.assistantId?'Assisted':''}${kind}Time`]+storyJobTime(s,t.action));return duration===0?'Completes immediately':`Completes after ${duration} future Time draws${t.assistantId?' · assisted':''}`;}
  const duration=s.config[t.action==='fireControl'?'fireDuration':t.action+'Duration'];
  return duration===0?'Completes immediately':`Completes at Round ${s.round+duration} start`;
}
function assistantMarkup(s,t) {
  if(!isV2(s)||!needsWorkPosition(t)||t.stage!=='work')return '';
  return `<label class="assistant-choice">Optional assistant<select id="job-assistant"><option value="">Work alone</option>${assistantOptions(s,t).map(c=>`<option value="${c.id}" ${t.assistantId===c.id?'selected':''}>${esc(def(c.id).name)} · ${c.cycleSlotConsumed?'slot used':'slot still due'}</option>`).join('')}</select><small>Both workers are unavailable until completion. An open Cycle slot still causes its normal Turn.</small></label>`;
}
function targetHint(s) {
  const t=interaction,options=targetOptions(s,t);
  if(t.stage==='gunner')return t.action==='directFire'?'Choose any healthy gunner at a usable gun station, tapped or untapped. Then choose a fighter for one immediate Basic Shot.':'Choose a healthy gunner whose normal activation is complete. Choose a fighter, then confirm to spend 1 Opportunity. Cancel at any stage costs nothing.';
  if(needsWorkPosition(t)&&(t.cells.length||t.targetId)&&!options.work.length)return 'No safe interior work position in the permitted rows. Choose another target, or cancel.';
  if(t.stage==='work')return 'Tap a highlighted safe interior position. Same row is preferred; fuselage targets can use an adjacent row if the target row is unsafe. Shared work positions are allowed.';
  if(['repair','fireControl'].includes(t.action))return `${t.cells.length}/${crisisTargetCap(s,t.crewId,t.action)} selected · ${s.config.eightWayWork?'Eight-way':'Orthogonal'} connections · Primary: ${t.cells[0]??'tap the board'}`;
  if(t.action==='medical')return t.targetId?`${def(t.targetId).name} selected. Choose the worker’s position next.`:'Tap an injured crew marker or card.';
  if(t.action==='directFire'&&t.targetId)return `${s.fighters.find(f=>f.id===t.targetId)?.type} selected. Confirm to fire one Basic Shot; Pilot spends Officer resources.`;
  if(t.action==='directFire')return `Tap a highlighted aircraft or queue card · ${options.fighters.length} legal targets · confirm before the Basic Shot fires.`;
  const spend=t.action==='opportunityShot'?'1 Opportunity':t.action==='directFire'?'1 Officer for Pilot Direct Fire':'the action';
  return t.targetId?`${s.fighters.find(f=>f.id===t.targetId)?.type} selected. Confirm to spend ${spend}.`:`Tap a highlighted aircraft or queue card · ${options.fighters.length} legal targets`;
}
function renderAction(s) {
  let text='',sub='',button='';
  if(interaction&&!queue.busy) {
    const t=interaction,options=targetOptions(s,t);text=targetTitle(s);sub=targetHint(s);
    button='<button class="quiet" data-ui="cancel-target">Cancel</button>';
    if(needsWorkPosition(t)&&t.stage!=='work')button+=`<button class="primary" data-ui="work-position" ${options.work.length?'':'disabled'}>Choose work position →</button>`;
    else if(t.stage!=='gunner')button+=`<button class="primary" data-ui="confirm-target" ${canConfirm(s,t)?'':'disabled'}>Confirm ${t.stage==='work'?t.workCellId??'position':['basicFire','advancedFire','directFire','opportunityShot'].includes(t.action)?'fire':'target'} →</button>`;
    const detail=$('#target-detail');detail.hidden=false;detail.innerHTML=`<strong>${esc(def(t.gunnerId??t.crewId)?.name??'Choose a completed gunner')} · ${esc(t.action==='opportunityShot'?'1 Opportunity':availableActions(s,t.crewId).find(a=>a.id===t.action)?.cost??'Free')}</strong><span>${esc(t.cells.join(' + ')||t.targetId&&def(t.targetId)?.name||'Tap highlighted targets')}</span>${needsWorkPosition(t)?`<span>${workTiming(s,t)}</span>`:''}${t.stage==='work'?`<span>Worker${t.assistantId?'s':''}: ${esc(t.workCellId??'choose internal position')} · targets stay on their original squares</span>`:''}${assistantMarkup(s,t)}`;
  }
  else if(queue.busy) { text=describeEvent(queue.current).title;sub=queue.speed==='manual'||queue.paused?'Step through each major beat at your pace.':queue.current?.message??'';button=`<button class="quiet" data-ui="skip">Skip</button>${queue.paused||queue.speed==='manual'?'<button class="quiet" data-ui="play">▶ Play</button>':''}<button class="primary" data-ui="${queue.speed==='manual'||queue.paused?'step':'pause'}">${queue.speed==='manual'||queue.paused?'Next beat →':'Pause beats'}</button>`; }
  else if(isV2(s)&&s.phase==='story'&&s.story?.pending) {text=s.story.pending.title;sub='Inspect the aircraft and Current Conditions, then decide how the crew should respond.';button='<button class="primary" data-ui="story-choice">Resolve situation →</button>';}
  else if(isV2(s)&&s.pendingProgress&&['select','betweenOpportunity'].includes(s.phase)) {text='Opportunity window · Time track full';sub='Finish any Opportunity Shots, then resolve Progress before the next crew activation.';button='<button class="primary" data-command="continueProgress">Continue to Progress →</button>';}
  else if(isV2(s)&&s.phase==='betweenOpportunity'&&s.config.v2OpportunityProvokesEnemyPhase) {text='Between-turn Opportunity window';sub=opportunityAvailability(s).enabled?'Chain Opportunity Shots, then resolve one enemy phase before the next crew activation.':'Opportunity sequence complete. Resolve one enemy phase before the next crew activation.';button='<button class="primary" data-command="continueBetweenOpportunity">Continue to Enemy Phase →</button>';}
  else if(s.phase==='ready') { text=s.round?'Crew ready for the next leg.':'Your aircraft is ready.';sub=s.round?'Refill bags, complete work, then resolve fire.':'Begin round one. Choose your crew order.';button=`<button class="primary" data-command="startRound">${s.round?'Begin next round':'Begin sortie'} →</button>`; }
  else if(s.phase==='select') {const c=def(selectedCrew);text=c?`${c.number} / ${c.name}`:'Choose an available crew member';sub='Tap crew for abilities and a free gun-arc preview.';button=`<button class="primary" data-ui="activate" ${availableCrew(s).some(c=>c.id===selectedCrew)?'':'disabled'}>Activate & draw →</button>`;if(isV2(s)&&!availableCrew(s).length){text='No crew available to act.';sub='Unavailable crew slots pass time, then draw a mission token and resolve the enemy queue.';button='<button class="primary" data-command="advanceUnavailable">Continue unavailable Turns →</button>';}}
  else if(s.phase==='action') {text=`${def(s.activeCrew)?.name ?? 'Crew'} · choose one action`;sub='Complete your action, then use any available Opportunity before the enemy queue.';button='<button class="primary" data-ui="choose">Choose action →</button>';}
  else if(s.phase==='opportunity') {text='Opportunity window';sub=opportunityAvailability(s).enabled?'Take a Basic Shot with a completed gunner, or continue to the pending enemy phase.':'No legal Opportunity Shot remains. Continue to the pending enemy phase.';button='<button class="primary" data-command="continueEnemyPhase">Continue to Enemy Phase →</button>';}
  else if(s.phase==='roundEnd') {text='All ten time slots complete.';sub='Check control, structure and engines independently.';button='<button class="primary" data-command="endRound">Altitude checks & advance →</button>';}
  else if(s.phase==='bombing') {
    text=isV2(s)?'BOMB RUN · place three dice':'Target below. Make your run.';
    sub=isV2(s)?'Tap a die, then Course, Drift or Release. Rearrange or reroll before Commit.':'Provisional bombing test. Return home after the attempt.';
    button=isV2(s)?s.mission.bombRun?'<button class="primary" data-ui="bomb-run-focus">Bomb Run ↑</button>':'<button class="primary" data-command="bomb">Begin Bomb Run →</button>':'<button class="primary" data-command="bomb">Release bombs →</button>';
  }
  else {const result=sortieResult(s);text=result.title;sub=result.reason;button='<button class="primary" data-ui="new-sortie">Plan another sortie →</button>';}
  if(!interaction)$('#target-detail').hidden=true;
  const chance=opportunityAvailability(s),control=$('#opportunity-control');
  const unavailableReason=queue.busy?'Wait for the current action to finish.':interaction?'Finish or cancel the current target selection first.':chance.reason;
  control.className=`opportunity-button ${chance.enabled&&!interaction&&!queue.busy?'available':'unavailable'}`;
  control.innerHTML=`◎ ${s.opportunity??0} / ${s.config.opportunityCap}<small>Opportunity</small>`;
  control.title=chance.enabled&&!interaction&&!queue.busy?'Spend one Opportunity for a Basic Shot.':unavailableReason;
  control.setAttribute('aria-label',chance.enabled&&!interaction&&!queue.busy?'Opportunity '+(s.opportunity??0)+' of '+s.config.opportunityCap+'. Start a Basic Shot.':`Opportunity unavailable: ${unavailableReason}`);
  control.setAttribute('aria-disabled',String(!chance.enabled||Boolean(interaction)||queue.busy));
  control.disabled=Boolean(interaction||queue.busy);
  $('#action-context').innerHTML=`<strong>${esc(text)}</strong><small>${esc(sub)}</small>`;
  $('#primary-action').innerHTML=button;
}
function renderLog() {
  const page = recorderWindow(queue.log, recorderEnd);
  const pageKey = `${page.from}:${page.to}`;
  recorderNavigation.innerHTML = `<button class="quiet" data-ui="log-newer" ${page.to >= page.total ? 'disabled' : ''}>Newer</button><span>Events ${page.total ? page.from + 1 : 0}–${page.to} of ${page.total} · full history retained</span><button class="quiet" data-ui="log-older" ${page.from === 0 ? 'disabled' : ''}>Older</button><button class="quiet" data-ui="log-latest" ${recorderEnd === null ? 'disabled' : ''}>Latest</button>`;
  if (renderedRecorderLog === queue.log && renderedRecorderKey === pageKey) return;
  const key=d=>d.dataset.logGroup??`raw:${d.querySelector('summary')?.textContent}`;
  const expanded=new Set([...$('#event-log').querySelectorAll('details[open]')].map(key));
  measure('recorder', () => { $('#event-log').innerHTML=logMarkup(page.events); });
  $('#event-log').querySelectorAll('details').forEach(d=>{if(expanded.has(key(d)))d.open=true;});
  renderedRecorderLog = queue.log; renderedRecorderKey = pageKey;
}
function renderSummary(s) {
  $('#summary').hidden=s.phase!=='ended'; if(s.phase!=='ended')return;
  const elapsed=Math.round(((s.endedAt??Date.now())-s.startedAt)/60000);
  const result=sortieResult(s);
  if(!queue.busy&&!resultPresented){resultPresented=true;requestAnimationFrame(()=>$('#summary').scrollIntoView({block:'start',behavior:'instant'}));}
  const telemetry=Object.entries(s.stats).filter(([key])=>!isV2(s)||key!=='rounds');
  const continuous=isV2(s)?`<h3>Playtest telemetry</h3><p class="small muted">Observations for comparing rules. Fighter averages include every spawned fighter, including early kills and fighters still active. Enemy actions completed and Engagement countdown spent are measured separately. Outbound and return Time count drawn Time tokens, not elapsed minutes.</p><div class="telemetry v2-telemetry">${v2TelemetryRows(s).map(row=>`<div><small>${esc(row.label)}</small><strong>${esc(row.value)}</strong></div>`).join('')}</div><h3>Flight record</h3>`:'';
  $('#summary').innerHTML=`<div class="eyebrow">END OF SORTIE / ${isV2(s)?'V2 — CONTINUOUS TIME · EXPERIMENTAL':'V1 — ROUND-BASED'} / SEED ${esc(s.seed)}</div><div class="sortie-result ${s.outcome==='success'?'returned':'lost'}" role="status"><h2>${esc(result.title)}</h2><p>${esc(result.reason)}</p>${result.distance?`<p>${esc(result.distanceLabel)}</p>`:''}<p>${esc(s.mission.aborted?'ABORTED — NO BOMBING CREDIT':s.mission.bombingResult?bombingOutcomeLabel(s.mission.bombingResult):'Target not reached')}${s.mission.bombRun?.noDropReason?' — '+esc(s.mission.bombRun.noDropReason):''}</p></div><p>${isV2(s)?`${s.stats.turns??0} Turns · ${s.mission.position} Progress`:`${s.round} rounds`} · ${elapsed} minutes · bombing ${s.mission.bombed ? esc(s.mission.bombingResult ?? 'attempted') : 'not reached'}</p>${continuous}<div class="telemetry">${telemetry.map(([k,v])=>`<div><small>${esc(k.replace(/([A-Z])/g,' $1'))}</small><strong>${typeof v==='object'?Object.entries(v).map(([a,b])=>`${a}: ${b}`).join(' · '):esc(v)}</strong></div>`).join('')}</div><button data-ui="export" class="quiet">Export full report</button>${s.campaign?'<button data-ui="campaign" class="primary">Return to Hangar</button>':''}`;
  $('#summary .sortie-result').insertAdjacentHTML('afterend',storyFactsMarkup(s.story?.facts));
}

function openDialog(id) { if(queue.busy&&!queue.paused&&queue.speed!=='manual')queue.togglePause();focusBeforeDialog=document.activeElement; const dialog=$(id);if(!dialog.open)dialog.showModal(); }
function openStoryChoice() {
  const s=queue.view,pending=s.story?.pending;
  if(queue.busy||interaction||s.phase!=='story'||!pending)return;
  closeDialog();shownStoryPrompt=pending.id;
  $('#story-title').textContent=pending.title;$('#story-content').innerHTML=storyChoiceMarkup(pending, storySelection?.pendingId === pending.id ? storySelection.choiceId : null);
  openDialog('#story-dialog');
}
function openStoryConditions() {
  closeDialog();$('#info-title').textContent='Current Conditions';$('#info-content').innerHTML=storyConditionsMarkup(queue.view);openDialog('#info-dialog');
}
function closeDialog() {document.querySelectorAll('dialog[open]').forEach(d=>d.close());focusBeforeDialog?.focus({preventScroll:true});}
function notice(message) {
  const content=document.querySelector('dialog[open] .dialog-content');
  if(content){let error=content.querySelector('.action-error');if(!error){error=document.createElement('p');error.className='action-error';error.setAttribute('role','alert');content.prepend(error);}error.textContent=message;error.scrollIntoView({block:'nearest'});return;}
  $('#notice').textContent=message;$('#notice').hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('#notice').hidden=true,6500);
}
function send(command) {
  if(queue.busy)return false;
  if(unreadableSave){notice('Launch a new sortie to replace the unreadable save. Its original data is still retained.');return false;}
  const prior=interaction;interaction=null;compactChoice=null;targetChooser=null;paletteFocus=null;
  autosaveEnabled = true;
  try {queue.send(command);closeDialog();if(queue.busy)$('#board-stage').scrollIntoView({block:'start',behavior:'instant'});return true;}
  catch(e){interaction=prior;render();notice(e.message);return false;}
}

function openOpportunity() {
  if(queue.busy||interaction)return;
  const s=queue.view,chance=opportunityAvailability(s);
  if(!chance.enabled) {
    $('#info-title').textContent='Opportunity Shot';
    $('#info-content').innerHTML=`<p><b>${s.opportunity??0} / ${s.config.opportunityCap} Opportunity</b></p><p>${esc(chance.reason)}</p><p>A healthy gunner whose normal activation is complete can take one Basic pull from an operating gun station. Spend Opportunity between crew activations or after an action before its enemy phase. Select a legal gunner and fighter, then confirm; canceling costs nothing. Fighter kills by B-17 gunfire can earn another Opportunity.</p>`;
    openDialog('#info-dialog');return;
  }
  interaction=beginTargeting('opportunityShot',null);closeDialog();render();
  $('#crew-list').scrollIntoView({block:'center',behavior:'instant'});
}

const actionDescriptions={reclaimHome:'Spend your normal action to relieve the substitute. They return home if free and safe, otherwise stay on this station footprint as Displaced. Their action slot is unchanged.',assistWork:'Join an active Repair, Fire Control or Medical job. Uses this normal action, costs no resources, and reduces its remaining Time to the assisted duration if lower.',basicFire:'One free combat pull against a fighter in your operating gun arc.',advancedFire:'Keep hitting one fighter until a miss. A first-pull miss grants exactly one more pull.',repair:'Select connected damaged squares. Work completes after the configured duration.',fireControl:'Select connected burning squares. Squares under active suppression do not spread.',medical:'Treat one injured crewmate. Care completes after the configured duration.',relocate:'Move to a safe fuselage square. This uses your action.',manCockpit:'Take a vacant pilot seat. This uses your action.',manStation:'Spend this action to occupy a vacant, non-burning gun station or cockpit seat. Your rank and personal abilities stay the same.',returnHome:'Spend this action to return to your vacant, safe home station. Nobody is evicted.',leaveStation:'Spend this action to leave your station for nearby safe interior space. Your next reassignment requires another action.',restartEngine:'Attempt to restart a stopped, fully repaired engine from a pilot seat.',directFire:'Spend 1 Officer → order any healthy gunner at an operational gun station to make one immediate Basic Shot. Does not use that gunner’s activation.',convert:'Change Resource denominations. Enlisted to Officer returns surplus tokens to discard; Officer to Enlisted requires extra Resource tokens from the mission bag. Copilot only.',rotateFighter:'Turn one fighter 90° away from the B-17.',escort:'Call an escort into a random quadrant for the rest of this round.',wait:"Finish this crew member's turn without taking an action."};
function crewDetails(s,c) {
 const d=def(c.id),status=crewStatus(s,c,selectedCrew===c.id),station=stationStatus(s,c);
 return `<p class="crew-health-history"><b>${esc(d.name)} — ${esc(c.health.toUpperCase())}</b><br>${esc(healthProvenance(s,c))}</p><div class="crew-cell-links">${c.position.map(id=>`<button class="quiet" data-crew-history="${esc(id)}">View Cell History${c.position.length>1?' · '+esc(id):''}</button>`).join('')}</div>${['navigator','bombardier'].includes(station.currentId??station.homeId)?`<p class="specialist-status">${esc(specialistStatus(s,station.currentId??station.homeId).reason)}</p>`:''}` + '<details class="crew-detail status-'+status.id+'"><summary><strong>'+esc(status.label)+'</strong><span class="crew-detail-hint">Crew details</span></summary><div class="crew-detail-body"><p>Home Station: <b>'+esc(station.homeName)+'</b></p><p>Current Station: <b>'+esc(station.currentName)+(station.displaced?' - Displaced':'')+'</b></p><p>Physical position: <b>'+esc(station.position)+'</b></p><p>'+esc(station.name)+' — <b>'+esc(station.label)+'</b></p>'+(status.job?'<p>Working: '+esc(({repair:'Repair',fireControl:'Fire Control',medical:'Medical'})[status.job.kind]??status.job.kind)+' · '+(isV2(s)?status.job.remainingTime+' Time remaining'+(status.job.assistantId?' · assisted':''):'completes Round '+status.job.completeRound)+'</p>':'')+(isV2(s)?`<p>Crew Cycle slot: <b>${c.cycleSlotConsumed?'consumed — waits for next Cycle':'open — may act when available'}</b></p>`:'')+'<small>'+esc(d.tags.join(' · '))+'</small></div></details>';
}
function resourceSummary(s,canAct) {
 return `<div class="action-resources" aria-label="Resources held: ${s.resources.Officer} Officer, ${s.resources.Enlisted} Enlisted"><div class="resource-counts"><span class="resource-count officer"><small>OFFICER</small><b>${s.resources.Officer}</b></span><span class="resource-count enlisted"><small>ENLISTED</small><b>${s.resources.Enlisted}</b></span></div><small class="resource-caption">AVAILABLE TO SPEND${canAct?'':' · PREVIEW — ACTIVATE FIRST'}</small></div>`;
}
function actionDescription(s,id) {
  if(isV2(s)&&id==='escort')return `Call an escort into a random quadrant until the next Progress checkpoint (${s.config.v2MaxEscorts === null ? 'no simultaneous cap' : `maximum ${s.config.v2MaxEscorts} at once`}).`;
  if(isV2(s)&&['repair','medical','fireControl'].includes(id))return `${actionDescriptions[id]} ${workTiming(s,{action:id})}.`;
  if(id==='directFire')return `Spend ${s.config.directFireCost} Officer → order any healthy gunner at an operational gun station to make one immediate Basic Shot. Does not use that gunner’s activation.`;
  return actionDescriptions[id];
}
function openActions(crewId=queue.view.activeCrew??selectedCrew) {
 if(compactCrewFlow(queue.view)&&queue.view.phase==='action'&&crewId===queue.view.activeCrew){compactChoice=null;interaction=null;closeDialog();render();return;}
 chosenAction=null;
 const s=queue.view,c=s.crew.find(c=>c.id===crewId);if(!c)return;
 selectedCrew=crewId;render();
 const canAct=!queue.busy&&s.phase==='action'&&s.activeCrew===crewId;
 const canActivate=!queue.busy&&s.phase==='select'&&(!isV2(s)||!s.pendingProgress)&&availableCrew(s).some(c=>c.id===crewId);
 $('#action-title').textContent=def(crewId).name+(canAct?' · one action':' · crew details');
 const actions=availableActions(s,crewId);
 const ordered=[
  {label:'Combat Actions',items:actions.filter(a=>['basicFire','advancedFire'].includes(a.id))},
  {label:'No Action',items:actions.filter(a=>a.id==='wait')},
  {label:'Role Actions',items:actions.filter(a=>actionGroup(a.id)==='Role Actions')},
  {label:'Station Actions',items:actions.filter(a=>actionGroup(a.id)==='Station Actions'&&!['basicFire','advancedFire'].includes(a.id))},
  {label:'General Actions',items:actions.filter(a=>actionGroup(a.id)==='General Actions'&&a.id!=='wait')},
 ];
 $('#action-content').innerHTML=crewDetails(s,c)+resourceSummary(s,canAct)+ordered.map(group=>group.items.length?'<section class="action-group"><h3>'+group.label+'</h3><div class="action-options">'+group.items.map(a=>{const resource=a.cost?.includes('Officer')?'officer':a.cost?.includes('Enlisted')?'enlisted':a.cost?'mixed':'free';return '<button data-action="'+a.id+'" class="action-option" '+(canAct&&a.enabled?'':'disabled')+'>'+actionIconMarkup(a.id)+'<span class="action-copy"><strong>'+esc(a.label)+'</strong><small>'+esc(a.enabled?actionDescription(s,a.id):a.reason)+'</small></span><b class="action-cost resource-'+resource+'">'+esc(a.cost??'FREE')+'</b></button>';}).join('')+'</div></section>':'').join('')+'<div class="choice-footer"><button class="quiet" data-ui="close">Preview board</button>'+(canActivate?'<button class="primary" data-ui="activate">Activate & draw →</button>':'')+'</div>';
 openDialog('#action-dialog');
}
const option=(value,label)=>`<option value="${esc(value)}">${esc(label)}</option>`;
function chooseAction(id) {
  if(queue.busy)return;
  if(compactCrewFlow(queue.view)){chooseCompactAction(id);return;}
  chosenAction=id;
  const s=queue.view,c=s.crew.find(c=>c.id===s.activeCrew),action=availableActions(s,s.activeCrew).find(a=>a.id===id);
  if(!action?.enabled)return;
  if(!$('#action-dialog').open){closeDialog();openDialog('#action-dialog');}
  $('#action-title').textContent=action.label;
  let choices='';
  if(DIRECT_ACTIONS.includes(id)) {interaction=beginTargeting(id,c.id);closeDialog();render();$('#board-stage').scrollIntoView({block:'start',behavior:'instant'});return;}
  if(id==='restartEngine') choices='<label>Engine<select name="targetId">'+s.engines.filter(e=>!e.running&&BOARD.filter(b=>b.engine===e.id).every(b=>s.cells[b.id]==='healthy')).map(e=>option(e.id,'Engine '+e.id.slice(1))).join('')+'</select></label>';
  else if(id==='assistWork') {
    choices=`<label>Active job<select name="jobId" id="assist-job">${eligibleAssistJobs(s,c.id).map(job=>option(job.id,`${jobKindLabel(job.kind)} · ${def(job.crewId).name} · ${job.remainingTime} Time`)).join('')}</select></label><label>Safe work position<select name="workCellId" id="assist-position"></select></label><p class="small">Both workers remain unavailable until the job ends. Injury or death of either worker cancels the shared job.</p>`;
  }
  else if(id==='manStation'||id==='manCockpit') choices=`<label>Vacant station<select name="stationId">${eligibleStations(s,c.id).filter(stationId=>id!=='manCockpit'||['pilot','copilot'].includes(stationId)).map(stationId=>option(stationId,STATIONS[stationId].name)).join('')}</select></label>`;
  else if(id==='relocate') choices=`<label>Safe fuselage position<select name="targetId">${BOARD.filter(b=>b.fuselage&&s.cells[b.id]!=='fire'&&!(c.position.length===1&&c.position[0]===b.id)&&!s.crew.some(other=>other.id!==c.id&&other.health!=='dead'&&other.position.includes(b.id))).map(b=>option(b.id,`${b.id} · ${section(b.section).name}`)).join('')}</select></label>`;
  else if(id==='convert') {
    const choicesByRank=conversionOptions(s);
    choices=`<label>Conversion<select name="to">${choicesByRank.map(o=>`<option value="${o.to}" ${o.enabled?'':'disabled'}>${esc(o.label)}${o.enabled?'':' — unavailable'}</option>`).join('')}</select></label><div class="conversion-explanation">${choicesByRank.map(o=>`<p><b>${esc(o.label)}</b><br>${o.enabled?(o.bagNeeded?`${o.bagNeeded} extra Resource token(s) come from the mission bag.`:`${o.cost-o.gain} surplus Resource token(s) enter discard.`):esc(o.reason)}</p>`).join('')}</div>`;
  }
  $('#action-content').innerHTML=`<p>${esc(actionDescription(s,id))}</p><form id="choice-form">${choices}<div class="choice-footer"><button type="button" data-ui="back-actions" class="quiet">← Actions</button><button class="primary" type="submit">${esc(action.label)}${action.cost?` · ${esc(action.cost)}`:''}</button></div></form>`;
  if(id==='assistWork') updateAssistPositions();
}
function inspectCrew(id) {
  const c=queue.view.crew.find(c=>c.id===id);if(!c)return;
  $('#info-title').textContent=def(id).name;
  const occupants=queue.view.crew.filter(other=>other.position.some(cell=>c.position.includes(cell)));
  const shared=occupants.length>1?`<section class="shared-occupants" aria-label="Shared physical occupants"><p><b>Sharing this footprint</b> · Each occupant is exposed to hits in their occupied cells.</p><div class="crew-cell-links">${occupants.map(other=>{const station=stationStatus(queue.view,other);return `<button class="quiet" data-inspect-occupant="${esc(other.id)}">${esc(def(other.id).name)} · ${esc(other.health)} · ${other.job?'Working':other.displaced?'Displaced':station.operating?'Operator':'Not operating'}</button>`;}).join('')}</div></section>`:'';
  $('#info-content').innerHTML=crewDetails(queue.view,c)+shared;openDialog('#info-dialog');
}
function compactTile(a) {
  const labels={reclaimHome:'Reclaim Home',assistWork:'Assist',rotateFighter:'Distract',convert:'Convert',escort:'Escort'};
  return `<button type="button" data-compact-action="${a.id}" aria-disabled="${!a.enabled}" aria-describedby="compact-description" class="action-tile ${paletteFocus===a.id?'highlighted':''}">${actionIconMarkup(a.id)}<strong>${esc(labels[a.id]??a.label)}</strong><span>${esc(compactCost(a.cost))}${a.enabled?'':' · Unavailable'}</span></button>`;
}
function renderCompactFlow(s) {
  const focusedAction=document.activeElement?.dataset.compactAction;
  const panel=$('#crew-flow'),dock=$('.action-dock'),mode=crewFlowState(queue,interaction,compactChoice);
  dock.dataset.crewFlow=mode;panel.hidden=mode==='legacy'||mode==='selection'||mode==='story';
  panel.dataset.state=mode;
  if(mode==='legacy')return;
  if(mode==='selection'&&s.phase==='select'&&availableCrew(s).length&&!s.pendingProgress){$('#action-context').innerHTML='<strong>Choose your next crew</strong><small>Tap a crew card to activate · aircraft tokens inspect</small>';$('#primary-action').innerHTML='';}
  if(panel.hidden)return;
  const actor=s.activeCrew??queue.state.activeCrew??selectedCrew;
  const heading=`<div class="compact-heading"><strong>${esc(def(actor)?.name??'Crew')} · ${mode==='ready'?'ONE ACTION':mode==='targeting'?'TARGET':mode==='choosing'?'CHOOSE':mode==='activating'?'ACTIVATING':'TOKEN / RESOLUTION'}</strong><span>${s.resources.Enlisted}E · ${s.resources.Officer}O</span></div>`;
  if(queue.busy){panel.innerHTML=heading+`<p class="compact-beat" role="status">${esc(describeEvent(queue.current).title)} · Actions locked</p>`;return;}
  if(interaction){
    const f=s.fighters.find(f=>f.id===interaction.targetId),gunner=def(interaction.gunnerId??interaction.crewId)?.name;
    const cost=interaction.action==='opportunityShot'?'1 Opportunity':compactCost(availableActions(s,interaction.crewId).find(a=>a.id===interaction.action)?.cost);
    panel.innerHTML=`<div class="compact-heading"><strong>${esc(gunner??'Choose gunner')} → ${esc(f?`#${s.fighters.indexOf(f)+1} ${f.type}`:def(interaction.targetId)?.name??(interaction.cells.join(' + ')||'Choose target'))}</strong><span>${f?`HP ${f.hp}/${f.maxHp} · ENG ${f.engagementRemaining??'—'}<br>`:''}${esc(cost)}</span></div>`;
    if(targetChooser)panel.innerHTML+=`<div class="target-chooser" aria-label="Select target"><strong>Select target</strong>${targetChooser.ids.map(id=>{const f=s.fighters.find(f=>f.id===id),c=s.crew.find(c=>c.id===id);return `<button data-target-choice="${esc(id)}">${f?`#${s.fighters.indexOf(f)+1} ${esc(f.type)} · HP ${f.hp}/${f.maxHp} · ENG ${f.engagementRemaining??'—'}`:c?`${esc(def(id).name)} · ${esc(c.health)}`:esc(id)}</button>`;}).join('')}</div>`;
    return;
  }
  const actions=availableActions(s,s.activeCrew);
  if(compactChoice){panel.innerHTML=heading+compactChoicesMarkup(s,actions);return;}
  const palette=actionPalette(actions),a=palette.find(a=>a.id===paletteFocus);
  panel.innerHTML=heading+`<div class="action-palette">${palette.map(compactTile).join('')}</div><div id="compact-description" class="compact-description" role="status">${a?`<b>${esc(a.label)} · ${esc(compactCost(a.cost))}</b> ${esc(a.enabled?(actionDescription(s,a.id)??'Choose a station action.'):a.reason)}`:'Choose an action. Unavailable tiles explain why.'}</div>`;
  if(focusedAction)panel.querySelector(`[data-compact-action="${focusedAction}"]`)?.focus({preventScroll:true});
}
function chooseCompactAction(id) {
  const s=queue.view;if(queue.busy||s.phase!=='action')return;
  paletteFocus=id;
  if(id==='stations'){compactChoice={action:id,values:{}};render();return;}
  const a=availableActions(s,s.activeCrew).find(a=>a.id===id);
  if(!a?.enabled){render();return;}
  closeDialog();
  if(id==='wait'){send({type:'action',action:id});return;}
  if(DIRECT_ACTIONS.includes(id)){compactChoice=null;interaction=beginTargeting(id,s.activeCrew);render();$('#board-stage').scrollIntoView({block:'start',behavior:'instant'});return;}
  compactChoice={action:id,values:{}};render();
}
function compactChoicesMarkup(s,actions) {
  const {action:id,values}=compactChoice;
  if(id==='stations')return `<div class="action-palette">${actions.filter(a=>STATION_PALETTE.includes(a.id)).map(compactTile).join('')}</div><p id="compact-description" role="status">${esc(actions.find(a=>a.id===paletteFocus)?.reason??'Choose a station action; confirm the destination before moving.')}</p><button data-ui="cancel-target">Back to actions</button>`;
  const a=actions.find(a=>a.id===id),c=s.crew.find(c=>c.id===s.activeCrew);
  const select=(name,label,items)=>`<label>${label}<select name="${name}" required><option value="">Choose…</option>${items.map(([value,label])=>`<option value="${esc(value)}" ${values[name]===value?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`;
  let fields='',required=[];
  if(['returnHome','reclaimHome'].includes(id)){const plan=id==='reclaimHome'?reclaimReliefPlan(s,c.id):null;fields=`<p>Destination: <b>${esc(STATIONS[homeStationId(c)].name)}</b>${plan?` · ${esc(def(plan.substituteId).name)} ${plan.relief==='returned'?'returns home':`stays here, Displaced (${plan.substitutePosition.join(' + ')}). ${esc(plan.returnReason)}`}`:''}</p>`;}
  if(id==='manStation'||id==='manCockpit'){required=['stationId'];fields=`<div class="compact-options" aria-label="Destination station">${eligibleStations(s,c.id).filter(i=>id!=='manCockpit'||['pilot','copilot'].includes(i)).map(i=>`<button data-compact-value="stationId" data-value="${i}" aria-pressed="${values.stationId===i}">${esc(STATIONS[i].name)}</button>`).join('')}</div>`;}
  if(id==='restartEngine'){required=['targetId'];fields=select('targetId','Engine',s.engines.filter(e=>!e.running&&BOARD.filter(b=>b.engine===e.id).every(b=>s.cells[b.id]==='healthy')).map(e=>[e.id,e.id]));}
  if(id==='relocate'){required=['targetId'];fields=select('targetId','Safe position',BOARD.filter(b=>b.fuselage&&s.cells[b.id]!=='fire'&&!(c.position.length===1&&c.position[0]===b.id)&&!s.crew.some(o=>o.id!==c.id&&o.health!=='dead'&&o.position.includes(b.id))).map(b=>[b.id,b.id]));}
  if(id==='convert'){required=['to'];fields=select('to','Conversion',conversionOptions(s).filter(o=>o.enabled).map(o=>[o.to,o.label]));}
  if(id==='assistWork'){
    required=['jobId','workCellId'];const jobs=eligibleAssistJobs(s,c.id),job=jobs.find(j=>j.id===values.jobId);
    fields=select('jobId','Job',jobs.map(j=>[j.id,`${jobKindLabel(j.kind)} · ${def(j.crewId).name} · ${j.remainingTime} Time`]));
    if(job){const targets=job.kind==='medical'?s.crew.find(c=>c.id===job.targetId).position:job.cells;fields+=select('workCellId','Safe position',legalWorkPositions(s,c.id,targets).map(b=>[b.id,b.id]));}
  }
  return `<div id="compact-choice"><p id="compact-description"><b>${esc(a?.label)} · ${esc(compactCost(a?.cost))}</b> ${esc(actionDescription(s,id))}</p>${fields}<div class="compact-confirm"><button data-ui="cancel-target">Cancel</button><button class="primary" data-compact-confirm ${required.every(k=>values[k])?'':'disabled'}>Confirm ${esc(a?.label)}</button></div></div>`;
}
function handleCompactClick(e) {
  if(!compactCrewFlow(queue.view))return false;
  const tile=e.target.closest('[data-compact-action]');if(tile){chooseCompactAction(tile.dataset.compactAction);return true;}
  const value=e.target.closest('[data-compact-value]');if(value){if(compactChoice&&!queue.busy){compactChoice.values[value.dataset.compactValue]=value.dataset.value;render();}return true;}
  if(e.target.closest('[data-compact-confirm]')){if(!queue.busy&&compactChoice){const {action,values}=compactChoice;send({type:'action',action,...values});}return true;}
  const choice=e.target.closest('[data-target-choice]');if(choice){if(!queue.busy&&interaction&&targetChooser){interaction=selectTarget(queue.view,interaction,targetChooser.kind,choice.dataset.targetChoice);targetChooser=null;render();}return true;}
  if(!interaction||queue.busy)return false;
  const el=e.target.closest('#board [data-fighter],#board [data-crew-id],#board [data-cell]');if(!el)return false;
  const kind=interaction.stage==='work'?'cell':interaction.stage==='gunner'||interaction.action==='medical'?'crew':['repair','fireControl'].includes(interaction.action)?'cell':'fighter',attr={fighter:'data-fighter',crew:'data-crew-id',cell:'data-cell'}[kind];
  const options=targetOptions(queue.view,interaction),valid=kind==='fighter'?options.fighters:kind==='crew'?options.crew:interaction.stage==='work'?options.work:options.cells;
  const rects=[...document.querySelectorAll(`#board [${attr}]`)].filter(n=>valid.includes(n.getAttribute(attr))).map(n=>({id:n.getAttribute(attr),...(()=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()}));
  const bounds=el.getBoundingClientRect(),x=e.clientX||bounds.x+bounds.width/2,y=e.clientY||bounds.y+bounds.height/2;
  const primary=valid.includes(el.getAttribute(attr))?el.getAttribute(attr):rects.find(r=>x>=r.x&&x<=r.x+r.width&&y>=r.y&&y<=r.y+r.height)?.id;
  if(!primary)return false;
  const ids=nearbyTargets(rects,primary,x,y,kind==='fighter'?24:8);
  if(ids.length>1){targetChooser={kind,ids};render();return true;}
  targetChooser=null;interaction=selectTarget(queue.view,interaction,kind,primary);render();return true;
}
document.addEventListener('focusin',e=>{const tile=e.target.closest('[data-compact-action]');if(tile&&!compactChoice){paletteFocus=tile.dataset.compactAction;const a=actionPalette(availableActions(queue.view,queue.view.activeCrew)).find(a=>a.id===paletteFocus);if(a&&$('#compact-description'))$('#compact-description').textContent=`${a.label} · ${compactCost(a.cost)} — ${a.enabled?actionDescription(queue.view,a.id)??'Choose a station action.':a.reason}`;}});
function updateAssistPositions() {
  const select=$('#assist-job'),positions=$('#assist-position');if(!select||!positions)return;
  const s=queue.view,job=s.jobs.find(job=>job.id===select.value);if(!job)return;
  const targets=job.kind==='medical'?s.crew.find(c=>c.id===job.targetId)?.position??[]:job.cells;
  positions.innerHTML=legalWorkPositions(s,s.activeCrew,targets).map(cell=>option(cell.id,cell.id)).join('');
}
function configForm(config,seed) {
  const fieldMarkup=f=>`<label class="config-field ${f.type==='boolean'?'checkbox-field':''}" data-config-scope="${f.scope}">${f.type==='boolean'?`<input type="checkbox" name="${f.key}" ${config[f.key]?'checked':''}>`:''}<span class="config-field-label">${esc(f.label)}${f.scope==='v2'?'<b class="experimental-badge">EXPERIMENTAL</b>':''}</span>${f.type==='boolean'?'':f.type==='select'?`<select name="${f.key}">${f.options.map(v=>typeof v==='object'?`<option value="${v.value}" ${config[f.key]===v.value?'selected':''}>${esc(v.label)}</option>`:`<option ${config[f.key]===v?'selected':''}>${esc(v)}</option>`).join('')}</select>`:`<input name="${f.key}" type="number" min="${f.min??0}" max="${f.max??100}" step="${f.step??1}" value="${config[f.key]}" ${f.fixedReason?'readonly aria-readonly="true"':''}>`}<small class="next-sortie-note">Applies to next sortie</small>${f.fixedReason?`<small class="fixed-reason">FIXED: ${esc(f.fixedReason)}</small>`:f.description?`<small>${esc(f.description)}</small>`:''}</label>`;
  const labels={common:'COMMON',v1:'V1 — ROUND-BASED',v2:'V2 — CONTINUOUS TIME · EXPERIMENTAL'};
  const scopeMarkup=scope=>{const fields=CONFIG_FIELDS.filter(f=>f.scope===scope),groups=[...new Set(fields.map(f=>f.group??'Rules'))];return `<details class="config-scope" data-scope="${scope}" ${scope==='common'?'open':''}><summary>${labels[scope]}<small>${scope==='common'?'Applies to either ruleset':'Separate next-sortie defaults'}</small></summary>${groups.map(group=>`<fieldset class="config-section"><legend>${esc(group)}</legend><div class="config-grid">${fields.filter(f=>(f.group??'Rules')===group).map(fieldMarkup).join('')}</div></fieldset>`).join('')}</details>`;};
  $('#dev-form').innerHTML=`<div class="config-grid sortie-preferences"><label class="seed-field">RNG seed<input name="seed" value="${esc(seed)}" maxlength="100" required><small>Applies to next sortie. Same settings, seed and decisions reproduce the run.</small></label>${CONFIG_FIELDS.filter(f=>f.scope==='preferences').map(fieldMarkup).join('')}</div>`+['common','v1','v2'].map(scopeMarkup).join('');
}
function readDevForm() {
  const values=new FormData($('#dev-form')),config={};
  for(const f of CONFIG_FIELDS)config[f.key]=f.type==='boolean'?values.has(f.key):f.type==='number'?Number(values.get(f.key)):values.get(f.key);
  return normalizeConfig(config);
}
function rememberPreferences(config) {
  devPreferences=normalizeConfig(config);
  const saved=saveDevPreferences(devPreferences);
  const scopes=modifiedConfigScopes(devPreferences);
  $('#dev-prefs-status').textContent=saved?`Saved on this browser · applies to next sortie.${scopes.length?' Modified: '+scopes.map(scope=>scope.toUpperCase()).join(', ')+'.':''}`:'Settings kept for this tab; browser storage is unavailable.';
  render();return saved;
}
function openDev() {
  configForm(devPreferences,queue.state.seed);
  let flow=$('#compact-flow-setting');if(!flow){flow=document.createElement('label');flow.id='compact-flow-setting';flow.innerHTML='<input type="checkbox" id="compact-flow-current"> Compact Crew Flow · current sortie (UX only)';$('#dev-form').before(flow);}
  flow.hidden=!isV2(queue.state);$('#compact-flow-current').checked=compactCrewFlow(queue.state);$('#compact-flow-current').disabled=queue.busy;
  const scopes=modifiedConfigScopes(devPreferences);
  $('#dev-prefs-status').textContent=scopes.length?`Saved next-sortie overrides: ${scopes.map(scope=>scope.toUpperCase()).join(', ')}.`:'Canonical defaults · applies to next sortie.';
  discardButton.disabled = !discardTarget();
  openDialog('#dev-dialog');
}
function resetScope(scope) {
  const seed=$('#dev-form').elements.seed.value||queue.state.seed;
  const saved=resetDevPreferencesScope(scope);
  devPreferences=normalizeConfig({...devPreferences,...Object.fromEntries(Object.entries(DEFAULT_CONFIG).filter(([key])=>configScope(key)===scope))});
  configForm(devPreferences,seed);
  $('#dev-prefs-status').textContent=`${scope.toUpperCase()} defaults restored for the next sortie.${saved?'':' Browser storage is unavailable.'} Current sortie unchanged.`;
  render();
}
function openNewSortie(seed=freshSortieSeed()) {
  closeDialog();
  const form=$('#sortie-form');
  form.elements.ruleset.value=devPreferences.preferredRuleset??'v1';
  form.elements.seed.value=seed;
  let targetField=$('#sortie-target');
  if(!targetField){targetField=document.createElement('div');targetField.id='sortie-target';form.querySelector('.seed-field').after(targetField);}
  targetField.innerHTML=targetChoiceMarkup(queue.state.mission.targetId??DEFAULT_BOMBING_TARGET);
  targetField.hidden=form.elements.ruleset.value!=='v2-continuous';
  openDialog('#sortie-dialog');
}
function inspectCell(id) {
  const s=queue.view,b=cell(id);if(!b)return;
  const history=deriveCellHistory(queue.log,id),rolls=hitLocationHeatMap(queue.log);
  $('#info-title').textContent=`Cell History · ${id}`;
  const entries=history.entries.length?`<ol class="cell-history">${history.entries.map(item=>`<li><time>${esc(item.time)}</time><span>${esc(item.description)}</span></li>`).join('')}</ol>`:'<p class="cell-history-empty">No recorded events at this square yet.</p>';
  $('#info-content').innerHTML=`<p>${b.structure?`${esc(section(b.section).name)} · <b>${esc(s.cells[id])}</b>`:'Open sky · attack locations here pass through without structure damage.'}</p>${b.engine?`<p>Engine ${esc(b.engine)} damageable footprint.</p>`:''}${b.engineIndicator?`<p>${esc(b.engineIndicator)} running indicator: visual only. This square contains no aircraft structure and cannot damage the engine.</p>`:''}<p class="small">Hit-location rolls: <b>${b.structure?rolls.structure[id]??0:rolls.empty[id]??0}</b> ${b.structure?'on aircraft structure':'into empty space'}.</p>${entries}<p>${s.crew.filter(c=>c.health!=='dead'&&c.position.includes(id)).map(c=>`${esc(def(c.id).name)}: ${esc(c.health)}`).join('<br>')||'No crew at this position.'}</p><p class="small muted">Quarters: 1 top left, 2 top right, 3 bottom left, 4 bottom right. A rolled attack location is separate from actual structure damage.</p>`;
  const storyConditions=s.config.v2StoryMode?s.story?.conditions.filter(condition=>(condition.cellId??condition.repairCell)===id)??[]:[];
  if(storyConditions.length)$('#info-content').insertAdjacentHTML('afterbegin',`<div class="story-marked-cell">${storyConditions.map(condition=>`<p><b>◆ ${esc(condition.title)}</b><br>${esc(condition.effectText)}<br>${esc(condition.resolveText)}</p>`).join('')}<button class="quiet" data-ui="story-conditions">Current Conditions →</button></div>`);
  openDialog('#info-dialog');
}
function inspectHud(metric) {
  const s=queue.view;
  const slots=s.crew.filter(crew=>crew.cycleSlotConsumed).length;
  const details={
    cycle:['Crew Cycle',`<p><b>Cycle ${s.crewCycle.number} · ${slots}/10 crew slots consumed</b></p><p>Each crewmate has one slot in this fixed ten-Turn Cycle. When all ten finish, eligible crew refresh. Busy, injured and dead crew still account for their normal slots.</p>`],
    time:['Time',`<p><b>TIME ${Math.min(s.time,effectiveTimeThreshold(s))}/${effectiveTimeThreshold(s)}</b></p><p>Each Time token advances existing jobs by one Time. At the threshold, finish the current crew action, Opportunity window and enemy queue before the Progress checkpoint.</p><p>${s.pendingProgress?'PROGRESS CHECKPOINT AFTER THIS TURN':'Time tokens remain outside the bag until Progress.'}</p>`],
    progress:['Progress',`<p><b>${missionName(s)} · mission space ${s.mission.position}</b></p><p>${s.mission.aborted?`ABORTED — emergency route: ${missionLengths(s).back} Progress total; ${Math.max(0,missionLengths(s).outbound+missionLengths(s).back-s.mission.position)} Progress to HOME. The outbound flight plan was replaced when you turned back.`:`${s.config.v2OutboundLength} outbound Progress to target; ${s.config.v2ReturnLength} return Progress to HOME.`}</p><p>A checkpoint completes zero-Time jobs, spreads unsuppressed fire, checks altitude and advances one space if the aircraft survives. Crew and fighters keep their independent clocks.</p>`],
    altitude:['Altitude',`<p><b>${s.altitude} levels remaining</b></p><p>At Progress, Control, Structure and Engines are checked independently. Each failed check can cost altitude. Ground is zero.</p>`],
    resources:['Held resources',`<p><b>${s.resources.Officer} Officer · ${s.resources.Enlisted} Enlisted</b></p><p>Resource denomination comes from the activating crew member. Held physical Resource tokens remain outside the mission bag; spending sends them to discard.</p>`],
  };
  const detail=details[metric];if(!detail)return;
  $('#info-title').textContent=detail[0];$('#info-content').innerHTML=detail[1];openDialog('#info-dialog');
}
function inspectJob(id) {
  const s=queue.view,job=s.jobs.find(item=>item.id===id);if(!job)return;
  $('#info-title').textContent=`${jobKindLabel(job.kind)} — ${job.remainingTime} TIME REMAINING`;
  $('#info-content').innerHTML=`<p><b>Primary: ${esc(def(job.crewId)?.name)}</b>${job.assistantId?`<br><b>Assistant: ${esc(def(job.assistantId)?.name)}</b>`:''}</p><p>${job.targetId?`Patient: ${esc(def(job.targetId)?.name)}`:`Targets: ${job.cells.map(esc).join(', ')}`}</p>${[job.crewId,job.assistantId].filter(Boolean).map(workerId=>{const worker=s.crew.find(crew=>crew.id===workerId);return `<p>${esc(def(workerId)?.name)}: ${esc(worker.position.join(' + '))} · Cycle slot ${worker.cycleSlotConsumed?'consumed':'still open'}.</p>`;}).join('')}<p>${isV2(s)?'Only future Time draws advance this job.':'Work completes at its scheduled Round Start.'} Workers remain at the work position if cancelled. A worker returning normally with an open slot may act during the same Crew Cycle.</p>${isV2(s)?`<button class="quiet" data-ui="abort-work" data-abort-job="${esc(job.id)}" ${!queue.busy&&!interaction&&canAbortWork(s,job.id)?'':'disabled'}>Abort Work</button>`:''}`;
  if(isV2(s)&&!job.assistantId&&!queue.busy&&!interaction){
    const current=s.phase==='action'?s.activeCrew:null;
    const helpers=current?eligibleAssistJobs(s,current).some(j=>j.id===id):availableCrew(s).some(c=>eligibleAssistJobs(s,c.id).some(j=>j.id===id));
    if(helpers)$('#info-content').insertAdjacentHTML('beforeend',current?'<button class="primary" data-action="assistWork">Assist Work →</button>':'<p class="job-assist-note"><b>Assist Work available.</b> Activate an available crew member, then choose Assist Work to join this job.</p>');
  }
  openDialog('#info-dialog');
}
function help() {
  $('#info-title').textContent='Your field guide';
  if(isV2(queue.view)){
    const s=queue.view;
    $('#info-content').innerHTML=`<p><b>V2 — Continuous Time — EXPERIMENTAL.</b> Fly ${s.config.v2OutboundLength} outbound Progress to the target, attempt bombing, then fly ${s.config.v2ReturnLength} return Progress to HOME.</p><ol class="guide-list"><li><b>Turn:</b> choose and activate an available crew member with an open Cycle slot, draw a mission token, take one action or Continue, use any legal Opportunity, then resolve fighters in queue order.</li><li><b>Crew Cycle:</b> ten crew slots, ten Turns. After all are consumed, readiness refreshes quietly. Busy, injured and dead crew still take their normal slots, mission draws and enemy pressure. A worker who returns with an open slot may act this Cycle.</li><li><b>Time:</b> Time tokens fill the global meter and reduce existing jobs by one. Newly started jobs wait for future Time draws. Crew still take their action on a Time draw.</li><li><b>Progress:</b> at ${s.config.v2TimePerProgress} Time, finish this Turn first. Completed jobs resolve before fire spread and independent Control, Structure and Engine altitude checks. If the aircraft survives, move one Progress, return accumulated Time to the bag and refill discards. Fighters stay; crew readiness stays.</li><li><b>Engagement:</b> each fighter has its own remaining actions. ${s.config.v2EngagementMode==='attack-pass-only'?'Only attacks and disrupted would-be attacks count; pure rotations do not.':'Every attack, rotation and disrupted would-be attack counts.'} Finish the action, then disengage at zero. A fourth fighter draw becomes immediate Flak.</li></ol><p><b>Crisis work:</b> Repair ${s.config.v2RepairTime}, Fire Control ${s.config.v2FireTime}, Medical ${s.config.v2MedicalTime} future Time draws. An optional assistant changes these to ${s.config.v2AssistedRepairTime}, ${s.config.v2AssistedFireTime}, ${s.config.v2AssistedMedicalTime}; both workers remain unavailable, and open Cycle slots still count. Repair uses explicit targets and skips squares that become Fire. Fire Control immediately suppresses selected fires, then leaves Damage on completion.</p><p><b>Combat:</b> Hit deals 1, Burst deals 2, Miss deals 0. ${s.config.v2DisruptEnabled?'B-17 gunfire damage Disrupts surviving fighters. '+(s.config.v2DisruptEffect==='accuracy-penalty'?'A facing-in attack rolls: 1–3 Off Target, 4–5 Hit, 6 Critical.':'A facing-in attack is an automatic miss.')+' A rotation still happens normally; Disrupt clears after that action.':'Disrupt is disabled.'} Escort damage never causes Disrupt. Escorts expire at the next Progress checkpoint; up to ${s.config.v2MaxEscorts} can be active.</p><p><b>Opportunity and Pilot:</b> spend banked Opportunity in open decision windows for a completed gunner's Basic Shot. Pilot Direct Fire spends Officer resources for one immediate Basic Shot by an operating gunner without consuming that gunner's activation. Normal Opportunity kill rewards and gun arcs apply. Separately, when Fighter Kill Grants Time is enabled, B-17 gunfire kills pull a Time token from the mission bag if one remains; this advances jobs and can trigger pending Progress.</p><p><b>Resources:</b> the activating crew's rank supplies the denomination. Held resources remain outside the bag; spent Resource tokens enter discard. ${s.config.v2RefillAtProgress===false?'Discard refill at Progress is disabled for this sortie; accumulated Time still returns.':'Normal bag refill happens at Progress.'} Empty bags may refill early.</p><p><b>Save and resume:</b> all clocks, jobs, Cycle slots and fighter Engagement are saved exactly. New sortie lets you choose V1 or V2; changing preferences does not change an active sortie.</p>`;
    openDialog('#info-dialog');return;
  }
  $('#info-content').innerHTML=`<p><b>Fly to the target. Attempt the bombing run. Reach HOME.</b> This sortie uses V1 — ROUND-BASED; settings and the authoritative CSV board map are documented in <a href="./README.md">the developer notes</a>.</p><ol class="guide-list"><li><b>Start the round.</b> Bags refill, work completes, fire spreads.</li><li><b>Choose ready crew in any order.</b> Activate to draw a mission token. Officers gain Officer resources; enlisted crew gain Enlisted resources. An enemy draw spawns a fighter or causes Flak.</li><li><b>Choose one action.</b> Fire at an enemy in arc, repair, suppress fire, treat injuries, or use a role ability. Work takes time; it completes at a future round start.</li><li><b>Watch the enemy queue.</b> Facing fighters attack; others turn. Every roll, square, consequence and movement appears in the recorder.</li><li><b>Finish ten time slots.</b> Unavailable crew still draw and face enemies. Then make independent altitude checks and advance.</li></ol><p><b>Damage:</b> healthy → damaged → fire. A hit injures a healthy occupant; a second hit kills. A direct Critical Hit applies two damage steps to both structure and occupants: a healthy occupant is killed. Fire Spread keeps its separate crew-blocking rule.</p><p><b>Stay airborne:</b> Keep a usable cockpit staffed, repair compromised sections, and restart repaired engines from a pilot seat. These three altitude checks can all cost altitude.</p><p><b>Economy:</b> Held resources stay outside the mission bag. Spending returns them to discard. Copilot converts 2 Enlisted to 1 Officer and returns the surplus token to discard; the reverse conversion spends 1 Officer and removes an additional Resource token from the bag to make 2 Enlisted. Without that extra token, reverse conversion is unavailable.</p><p><b>Combat:</b> Hit deals 1 HP; Burst deals 2 HP; Miss deals none. Advanced Fire continues on Hit or Burst. B-17 gunfire Disrupts a surviving fighter until its next enemy action: a facing-in attack is cancelled with a normal flyby; a facing-away fighter rotates normally, then clears Disrupt.</p><p><b>Opportunity:</b> This separate counter starts at 1 and normally gains 1 when B-17 gunfire destroys a fighter, up to 3. Spend it between crew activations or after an action before its enemy phase, with any healthy completed gunner at a usable station and a target in arc. Each shot is one Basic pull; kills can replenish it up to the cap. No extra mission draw, activation or enemy phase is created. Pilot Direct Fire spends 1 Officer for one immediate Basic shot from another operating gunner; it does not change that gunner’s activation or Opportunity.</p><p><b>Crisis timing:</b> Work begun in Round N normally completes at Round N+2 Start. Worker and Medical patient remain unavailable through N+1. Select the complete target set up front; Repair skips selected squares that become Fire. Fire Control suppresses its selected fires immediately.</p><p><b>Controls:</b> Select crew, then use the button at the bottom. Action choices open in a sheet. Tap a board square or unavailable crewmate for details. Pause, step, or skip the event sequence at any time. Your flight and pending events autosave locally.</p><p><b>Testing:</b> Playtest settings restart the sortie with your seed and chosen rules. Bombing, mission length, Flak count and work costs/durations are provisional.</p>`;
  openDialog('#info-dialog');
}
function exportRun() {
  const s=queue.state;
  const blob=new Blob([JSON.stringify(queue.export(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=missionExportFilename(s);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function persistCampaign(nextStore) {
  saveCampaignStore(nextStore);campaignStore=nextStore;campaignStoreError='';
}
function finalizeCampaignIfReady() {
  if(queue.busy||queue.state.phase!=='ended'||!queue.state.campaign)return;
  try {
    const result=finalizeCampaignSortie(campaignStore,queue.state,queue.log);
    if(result.finalized){
      if(!result.record.aircraftSurvived)result.store.activeCampaignId=queue.state.campaign.campaignId;
      persistCampaign(result.store);
      if(!result.record.aircraftSurvived){
        const sortieId=result.record.id;
        requestAnimationFrame(()=>{if(queue.state.campaign?.sortieId===sortieId)openCampaign();});
      }
    }
  }catch(error){campaignStoreError=error.message;}
}
function openCampaign() {
  finalizeCampaignIfReady();closeDialog();
  $('#campaign-content').innerHTML=(campaignStoreError?`<p class="action-error">${esc(campaignStoreError)}. Existing stored history has been preserved. Export this sortie before leaving if storage is unavailable.</p>`:'')+campaignMarkup(campaignStore,queue.state);
  openDialog('#campaign-dialog');
}
function newCampaignForm() {
  $('#campaign-content').innerHTML='<p>Start a V2 service history with one aircraft and ten crew. Names may be changed at any time.</p><form id="campaign-new-form"><label>Campaign name<input name="name" value="Milk Run Campaign" maxlength="80" required></label><button class="primary" type="submit">Create Campaign →</button></form>';
}
function activeCampaignPreventsReplacement() {
  const assignment=queue.state.campaign;
  const reserved=assignment&&campaignStore.campaigns.some(c=>c.id===assignment.campaignId&&c.activeSortie?.sortieId===assignment.sortieId);
  if(reserved&&!queue.state.outcome){notice('Finish the current campaign sortie before replacing its autosave. Turn Back is available while outbound; export a campaign backup to keep this flight.');return true;}
  return false;
}
function launchCampaign(form) {
  if(activeCampaignPreventsReplacement())return;
  const values=new FormData(form),fresh=createGame(devPreferences,values.get('seed')||undefined,'v2-continuous');
  fresh.mission.targetId=getBombingTarget(values.get('bombingTarget')||DEFAULT_BOMBING_TARGET).id;
  const prepared=prepareCampaignSortie(campaignStore,campaignStore.activeCampaignId,fresh,{aircraftId:values.get('aircraftId')});
  const session={version:1,presentationVersion:2,state:prepared.state,view:prepared.state,pending:[],log:[],current:null,speed:devPreferences.presentationSpeed,presenting:false};
  storeCampaignBackup(campaignBackup(prepared.store,session));
  campaignStore=prepared.store;initialize(prepared.state.config,prepared.state.seed,session);closeDialog();
}
function downloadJSON(data,name) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function confirmTurnBack() {
  if(queue.busy||interaction||!canTurnBack(queue.state))return;
  closeDialog();$('#info-title').textContent='TURN BACK?';
  $('#info-content').innerHTML=`<p>Mission will be recorded as <b>ABORTED</b>.</p><p><b>Emergency return: ${emergencyReturnDistance(queue.state)} Progress</b></p><p>Current aircraft, crew and damage state will be preserved. Fighters, fires, jobs, Time and supplies remain in play. The flight plan will change to the shortest emergency route home.</p><p>No crew action or resource is spent.</p><button class="quiet" data-ui="close">Keep flying outbound</button> <button class="primary" data-ui="confirm-turn-back">Confirm TURN BACK</button>`;
  openDialog('#info-dialog');
}

function discardTarget() {
  const assignment = queue.state.campaign;
  const campaign = campaignStore.campaigns.find(c => c.id === (assignment?.campaignId ?? campaignStore.activeCampaignId));
  const active = campaign?.activeSortie;
  if (!active || campaign.sorties.some(sortie => sortie.id === active.sortieId)) return null;
  if (assignment?.sortieId === active.sortieId && (queue.state.outcome || queue.state.phase === 'ended')) return null;
  return active;
}
function confirmDiscard() {
  const target = discardTarget(); if (!target) return;
  pendingDiscard = { campaignId: target.campaignId, sortieId: target.sortieId };
  closeDialog(); $('#info-title').textContent = 'Discard unfinished campaign sortie?';
  $('#info-content').innerHTML = '<p>This flight will be removed and will not be added to Campaign history.</p><p>The aircraft and crew will return to their pre-sortie Campaign availability.</p><p><b>This cannot be undone.</b></p><button class="quiet" data-ui="cancel-discard">Cancel</button> <button class="primary" data-ui="confirm-discard">Discard Sortie</button>';
  openDialog('#info-dialog');
}
function performDiscard() {
  if (!pendingDiscard) return;
  const { campaignId, sortieId } = pendingDiscard;
  try {
    const target = discardTarget();
    if (!target || target.campaignId !== campaignId || target.sortieId !== sortieId) throw new Error('The active sortie changed. Open Playtest settings again.');
    const result = discardActiveCampaignSession(campaignStore, campaignId, sortieId, true);
    campaignStore = result.store; campaignStoreError = ''; pendingDiscard = null;
    if (queue.state.campaign?.sortieId === sortieId) {
      // Dispose every pending beat before it can save/finalize the removed flight.
      initialize(devPreferences, 'MILK-RUN', null, 'v2-continuous', DEFAULT_BOMBING_TARGET, false);
    }
    openCampaign();
  } catch (error) { notice(error.message); }
}

document.addEventListener('click', e=>{
  const occupant=e.target.closest('[data-inspect-occupant]');if(occupant){inspectCrew(occupant.dataset.inspectOccupant);return;}
  const history=e.target.closest('[data-crew-history]');if(history){closeDialog();inspectCell(history.dataset.crewHistory);return;}
  const storyChoice=e.target.closest('[data-story-choice]');if(storyChoice){if(!storyChoice.disabled&&!queue.busy&&queue.view.story?.pending){storySelection={pendingId:queue.view.story.pending.id,choiceId:storyChoice.dataset.storyChoice};openStoryChoice();}return;}
  const storyCell=e.target.closest('[data-story-cell]');if(storyCell){closeDialog();inspectCell(storyCell.dataset.storyCell);return;}
  const service=e.target.closest('[data-service-aircraft],[data-service-personnel]');
  if(service){
    const aircraft=service.dataset.serviceAircraft;
    const selector=aircraft?`[data-aircraft-service="${CSS.escape(aircraft)}"]`:`[data-personnel-service="${CSS.escape(service.dataset.servicePersonnel)}"]`;
    const record=$('#campaign-content').querySelector(selector);
    if(record){for(let parent=record;parent&&parent!==$('#campaign-content');parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;record.scrollIntoView({block:'start',behavior:'instant'});record.querySelector('summary')?.focus();}
    return;
  }
  const die=e.target.closest('[data-bomb-die]');if(die&&!queue.busy){selectedBombDie=Number(die.dataset.bombDie);render();return;}
  const slot=e.target.closest('[data-bomb-slot]');if(slot&&!queue.busy&&selectedBombDie!==null){send({type:'placeBombDie',slot:slot.dataset.bombSlot,dieIndex:selectedBombDie});return;}
  const reroll=e.target.closest('[data-bomb-reroll]');if(reroll&&!queue.busy&&selectedBombDie!==null){send({type:'rerollBombDie',dieIndex:selectedBombDie,source:reroll.dataset.bombReroll});return;}
  const hud=e.target.closest('[data-hud]');if(hud){inspectHud(hud.dataset.hud);return;}
  const job=e.target.closest('[data-job]');if(job){inspectJob(job.dataset.job);return;}
  if(handleCompactClick(e))return;
  const fighter=e.target.closest('[data-fighter]');if(fighter){const id=fighter.dataset.fighter;if(interaction&&!queue.busy){interaction=selectTarget(queue.view,interaction,'fighter',id);render();}else{const f=queue.view.fighters.find(f=>f.id===id);if(f){const engagementKey={'BF-109':'v2Bf109Engagement','BF-110':'v2Bf110Engagement','FW-190':'v2Fw190Engagement','Me-262':'v2Me262Engagement'}[f.type];$('#info-title').textContent=`#${queue.view.fighters.indexOf(f)+1} ${f.type}`;$('#info-content').innerHTML=`<p>HP ${f.hp}/${f.maxHp}</p>${isV2(queue.view)&&engagementKey?`<p>Engagement ${f.engagementRemaining}/${queue.view.config[engagementKey]}</p>`:''}<p>${esc(f.quadrant)} / ${esc(f.altitude)} · ${f.facing===0?'Facing B-17: attacks next enemy phase.':`${f.facing}° away: rotates next enemy phase.`}</p><p>Select a gunner and Fire to target this aircraft.</p>`;openDialog('#info-dialog');}}return;}
  const crew=e.target.closest('[data-crew],[data-crew-id]');if(crew){const id=crew.dataset.crew??crew.dataset.crewId;if(interaction&&!queue.busy){const wasGunner=interaction.stage==='gunner';interaction=selectTarget(queue.view,interaction,'crew',id);if(wasGunner&&interaction.stage==='target')selectedCrew=interaction.gunnerId;render();if(wasGunner&&interaction.stage==='target')$('#board-stage').scrollIntoView({block:'start',behavior:'instant'});}else if(!queue.busy){if(compactCrewFlow(queue.view)&&crew.dataset.crew&&queue.view.phase==='select'&&!queue.view.pendingProgress&&availableCrew(queue.view).some(c=>c.id===id)){selectedCrew=id;send({type:'activate',crewId:id});}else if(compactCrewFlow(queue.view)){inspectCrew(id);}else openActions(id);}return;}
  const square=e.target.closest('[data-cell]');if(square){if(interaction&&!queue.busy){interaction=selectTarget(queue.view,interaction,'cell',square.dataset.cell);render();}else inspectCell(square.dataset.cell);return;}
  const action=e.target.closest('[data-action]');if(action){chooseAction(action.dataset.action);return;}
  const command=e.target.closest('[data-command]');if(command){send({type:command.dataset.command});return;}
  const control=e.target.closest('[data-ui]');if(!control)return;
  switch(control.dataset.ui){
    case 'story-conditions':openStoryConditions();break;
    case 'story-choice':openStoryChoice();break;
    case 'story-continue':{const selected=storySelection,pending=queue.state.story?.pending;if(!queue.busy&&selected?.pendingId===pending?.id&&pending.choices.some(c=>c.id===selected.choiceId&&!c.disabled)){storySelection=null;send({type:'storyChoice',choiceId:selected.choiceId});}break;}
    case 'status-toggle':compactHudExpanded=!compactHudExpanded;render();break;
    case 'campaign':openCampaign();break;
    case 'campaign-new':newCampaignForm();break;
    case 'campaign-resume':closeDialog();break;
    case 'campaign-export':downloadJSON(campaignBackup(campaignStore,queue.export()),'milk-run-campaign-backup.json');break;
    case 'campaign-import-confirm':try{if(pendingCampaignImport){const restored=storeCampaignBackup(pendingCampaignImport);campaignStore=restored.store;campaignStoreError='';pendingCampaignImport=null;if(restored.activeSession)initialize(restored.activeSession.state.config,restored.activeSession.state.seed,restored.activeSession);openCampaign();}}catch(error){notice(error.message);}break;
    case 'turn-back':confirmTurnBack();break;
    case 'confirm-turn-back':send({type:'turnBack',confirmed:true});break;
    case 'bomb-run-focus':$('#bomb-run-panel').scrollIntoView({block:'center',behavior:'instant'});break;
    case 'hit-map-toggle':hitMapEnabled=!hitMapEnabled;render();break;
    case 'activate':send({type:'activate',crewId:selectedCrew});break;
    case 'choose':case 'back-actions':openActions();break;
    case 'opportunity':openOpportunity();break;
    case 'cancel-target':interaction=null;compactChoice=null;targetChooser=null;render();break;
    case 'work-position':if(interaction&&targetOptions(queue.view,interaction).work.length){interaction={...interaction,stage:'work'};render();}break;
    case 'confirm-target':if(canConfirm(queue.view,interaction))send(targetingCommand(interaction));break;
    case 'abort-work':send({type:'abortWork',jobId:control.dataset.abortJob});break;
    case 'close':closeDialog();break;
    case 'help':help();break;
    case 'enemies':$('.enemy-panel').scrollIntoView({block:'center',behavior:'smooth'});break;
    case 'dev':openDev();break;
    case 'test-bomb-run':bombTest.open();break;
    case 'discard-campaign':confirmDiscard();break;
    case 'cancel-discard':pendingDiscard=null;closeDialog();openDev();break;
    case 'confirm-discard':performDiscard();break;
    case 'new-sortie':openNewSortie();break;
    case 'reset-v1':resetScope('v1');break;
    case 'reset-v2':resetScope('v2');break;
    case 'reset-defaults':{const cleared=resetDevPreferences();devPreferences={...DEFAULT_CONFIG};configForm(devPreferences,queue.state.seed);$('#dev-prefs-status').textContent=cleared?'Saved overrides cleared. Canonical defaults apply next run; current sortie is unchanged.':'Defaults restored for this tab; browser storage could not be cleared.';render();break;}
    case 'apply-dev':{const form=$('#dev-form');if(!form.reportValidity())break;try{const config=readDevForm(),seed=new FormData(form).get('seed')||'MILK-RUN';rememberPreferences(config);openNewSortie(seed);}catch(error){notice(error.message);}break;}
    case 'play':queue.play();break;
    case 'pause':queue.togglePause();break;
    case 'step':queue.step();break;
    case 'skip':queue.flush();break;
    case 'export':exportRun();break;
    case 'log-older':recorderEnd=recorderWindow(queue.log,recorderEnd).from;renderLog();break;
    case 'log-newer':recorderEnd=Math.min(queue.log.length,(recorderEnd??queue.log.length)+RECORDER_PAGE_SIZE);if(recorderEnd===queue.log.length)recorderEnd=null;renderLog();break;
    case 'log-latest':recorderEnd=null;renderLog();break;
  }
});
document.addEventListener('change',e=>{
  if(e.target.id==='compact-flow-current'){
    if(queue.busy)return;
    queue.state.config.v2CompactCrewFlow=e.target.checked;queue.view.config.v2CompactCrewFlow=e.target.checked;
    interaction=null;compactChoice=null;targetChooser=null;paletteFocus=null;render();return;
  }
  if(e.target.matches('#sortie-form [name="ruleset"]')){$('#sortie-target').hidden=e.target.value!=='v2-continuous';return;}
  if(e.target.id==='campaign-select'){try{persistCampaign(selectCampaign(campaignStore,e.target.value));openCampaign();}catch(error){notice(error.message);}return;}
  if(e.target.id==='campaign-import'){
    const file=e.target.files?.[0];if(!file)return;
    file.text().then(text=>{const parsed=parseCampaignBackup(text);pendingCampaignImport={kind:'milk-run-campaign-backup',version:1,...parsed};$('#campaign-content').innerHTML=`<p>Import ${parsed.store.campaigns.length} campaign(s) with ${parsed.store.campaigns.reduce((n,c)=>n+c.sorties.length,0)} recorded sorties${parsed.activeSession?' and its active flight':''}. This replaces the campaign history on this browser${parsed.activeSession?' and the active sortie autosave':''}.</p><p>Export the current campaign first if you want to keep both backups.</p><button class="primary" data-ui="campaign-import-confirm">Import this backup</button> <button class="quiet" data-ui="campaign">Cancel</button>`;}).catch(error=>notice(error.message));return;
  }
  if(e.target.matches('#compact-choice select')){compactChoice.values[e.target.name]=e.target.value;if(e.target.name==='jobId')delete compactChoice.values.workCellId;render();return;}
  if(e.target.id==='assist-job'){updateAssistPositions();return;}
  if(e.target.id==='hit-map-structure'){hitMapStructure=e.target.checked;render();return;}
  if(e.target.id==='hit-map-empty'){hitMapEmpty=e.target.checked;render();return;}
  if(e.target.id==='job-assistant'&&interaction){interaction={...interaction,assistantId:e.target.value||null};render();return;}
});
document.addEventListener('submit',e=>{
  if(e.target.id==='campaign-new-form'){e.preventDefault();try{persistCampaign(createCampaign(campaignStore,{name:new FormData(e.target).get('name')}).store);openCampaign();}catch(error){notice(error.message);}return;}
  if(e.target.id==='campaign-commission-form'){e.preventDefault();try{const values=new FormData(e.target),result=commissionAircraft(campaignStore,campaignStore.activeCampaignId,{name:values.get('name'),serial:values.get('serial')});persistCampaign(result.store);openCampaign();const card=$('#campaign-content').querySelector(`[data-aircraft-card="${CSS.escape(result.aircraft.id)}"]`);card.scrollIntoView({block:'center',behavior:'instant'});card.querySelector('input[type=radio]')?.focus();}catch(error){notice(error.message);}return;}
  if(e.target.id==='campaign-launch-form'){e.preventDefault();try{launchCampaign(e.target);}catch(error){notice(error.message);}return;}
  if(e.target.dataset.aircraftRename||e.target.dataset.crewRename){e.preventDefault();try{const values=new FormData(e.target);persistCampaign(e.target.dataset.aircraftRename?renameAircraft(campaignStore,e.target.dataset.campaignId,e.target.dataset.aircraftRename,values.get('name'),values.get('serial')):renameCrew(campaignStore,e.target.dataset.campaignId,e.target.dataset.crewRename,values.get('name')));openCampaign();}catch(error){notice(error.message);}return;}
  if(e.target.id==='sortie-form'){e.preventDefault();if(activeCampaignPreventsReplacement())return;const values=new FormData(e.target),ruleset=values.get('ruleset');try{initialize({...devPreferences,preferredRuleset:ruleset},values.get('seed')||'MILK-RUN',null,ruleset,values.get('bombingTarget')||DEFAULT_BOMBING_TARGET);rememberPreferences({...devPreferences,preferredRuleset:ruleset});closeDialog();}catch(error){notice(error.message);}return;}
  if(e.target.id!=='choice-form')return;e.preventDefault();send({type:'action',action:chosenAction,...Object.fromEntries(new FormData(e.target))});
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('svg [role="button"]')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
$('#speed').addEventListener('change',e=>{queue.setSpeed(e.target.value);rememberPreferences({...devPreferences,presentationSpeed:e.target.value});});
$('#dev-form').addEventListener('change',()=>{if(!$('#dev-form').checkValidity())return;try{rememberPreferences(readDevForm());$('#dev-form').closest('.dialog-content').querySelector('.action-error')?.remove();}catch(error){$('#dev-prefs-status').textContent='Not saved: '+error.message;}});
$('#log-details').addEventListener('toggle',()=>{if($('#log-details').open)renderLog();});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}}));
const savedSession=loadSession();
let unreadableSave=false;try{unreadableSave=!savedSession&&Boolean(localStorage.getItem(SAVE_KEY));}catch{/* Storage can be unavailable. */}
const legacyBoardSave=!savedSession&&hasLegacyBoardSave();
initialize(savedSession?.state.config??DEFAULT_CONFIG,'MILK-RUN',savedSession,undefined,DEFAULT_BOMBING_TARGET,!unreadableSave);
if(!savedSession)openNewSortie();
if(unreadableSave)notice('The saved sortie could not be safely loaded. Its original data is retained until you deliberately launch a new sortie.');
if(savedSession){const problems=crewStateProblems(savedSession.state);if(problems.length)notice('Saved crew state needs attention: '+problems.join(' '));}
if(legacyBoardSave)notice('The board geometry has been corrected. Start a new sortie on this map; your previous-board save has been kept separately.');
window.milkRun={ getState:()=>structuredClone(queue.state),getView:()=>structuredClone(queue.view),getQueue:()=>queue.pending.map(({state,...e})=>e),getInteraction:()=>structuredClone(interaction),getBombRunTest:()=>bombTest.snapshot(),getCampaignStore:()=>structuredClone(campaignStore),send,restart:(config,seed,ruleset)=>{closeDialog();initialize(config??devPreferences,seed,null,ruleset??config?.preferredRuleset??devPreferences.preferredRuleset);},getPreferences:()=>({...devPreferences}),setSpeed:s=>queue.setSpeed(s),flush:()=>queue.flush(),exportSession:()=>queue.export() };
