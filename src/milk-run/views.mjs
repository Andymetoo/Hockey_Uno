/** HTML presentation only. These helpers never activate crew, draw or mutate state. */
import { crewDefinition, crewStatus, crewActionMarker, actionIconMarkup, stationStatus, SHORT_NAMES, arcPreview, headingLabel } from './ui-model.mjs';
import { fighterHeading } from './spatial.mjs';
import { targetOptions } from './targeting.mjs';
import { describeEvent, groupEvents } from './presentation.mjs';
import { isV2, missionLengths } from './rulesets.mjs';
import { effectiveTimeThreshold, specialistOperator } from './crew-position.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const classes = values => values.filter(Boolean).join(' ');
const targetingFighters = interaction => interaction && ['basicFire', 'advancedFire', 'opportunityShot', 'rotateFighter'].includes(interaction.action);

export function continuousHudMarkup(state, expanded = false) {
  const threshold=effectiveTimeThreshold(state), navigationPenalty=(state.config.v2NavigatorUnmannedTimePenalty??0)>0&&!specialistOperator(state,'navigator');
  const {outboundLength,returnLength}=missionLengths(state);
  const returning=state.mission.bombed||state.mission.aborted||state.mission.position>outboundLength;
  const progress=returning?Math.max(0,state.mission.position-outboundLength):state.mission.position;
  const length=returning?returnLength:outboundLength;
  const leg=state.mission.position>=outboundLength+returnLength?'HOME':state.phase==='bombing'||state.phase==='story'&&state.story?.pending?.resumePhase==='bombing'?'TARGET':state.mission.aborted?'ABORTED · RETURN':returning?'RETURN':'OUTBOUND';
  const consumed=state.crew.filter(crew=>crew.cycleSlotConsumed).length;
  const shownTime=Math.min(state.time,threshold);
  const timeGraphic=threshold<=8?`<span class="time-pips" aria-hidden="true">${Array.from({length:threshold},(_,index)=>`<i class="${index<shownTime?'filled':''}"></i>`).join('')}</span>`:`<progress class="hud-time-progress" aria-hidden="true" max="${threshold}" value="${shownTime}"></progress>`;
  return `<button class="hud-metric hud-time ${state.pendingProgress?'pending':''}" data-status-metric="time" data-hud="time" aria-label="Time ${shownTime} of ${threshold}${navigationPenalty?', Navigation unmanned':''}${state.pendingProgress?', Progress checkpoint after this Turn':''}"><span>TIME</span><strong>${shownTime}<small>/${threshold}</small></strong>${timeGraphic}${navigationPenalty?'<small class="navigation-warning">NAVIGATION UNMANNED</small>':''}${state.overflowTimeTokens?.length?'<small class="time-bank">+1 BANKED</small>':''}</button>
    <button class="hud-metric" data-status-metric="resources" data-hud="resources" aria-label="Resources ${state.resources.Officer} Officer and ${state.resources.Enlisted} Enlisted"><span>RESOURCES</span><strong><b class="officer">${state.resources.Officer}</b><small> O</small> <b class="enlisted">${state.resources.Enlisted}</b><small> E</small></strong><small>Held outside bag</small></button>
    <button class="hud-metric" data-status-metric="altitude" data-hud="altitude" aria-label="Altitude ${state.altitude} of ${state.config.startingAltitude}"><span>ALTITUDE</span><strong class="${state.altitude<=1?'danger-text':''}">${state.altitude}</strong><small>Levels</small></button>
    <button class="hud-metric" data-status-metric="cycle" data-hud="cycle" aria-label="Crew Cycle ${state.crewCycle.number}, ${consumed} of 10 slots consumed"><span>CREW CYCLE</span><strong>${consumed}<small>/10</small></strong><small>Cycle ${state.crewCycle.number}</small></button>
    <button class="hud-metric" data-status-metric="progress" data-hud="progress" aria-label="${leg} Progress ${progress} of ${length}"><span>PROGRESS</span><strong>${progress}<small>/${length}</small></strong><small>${leg}</small></button>
    <button class="status-toggle" data-ui="status-toggle" aria-expanded="${expanded}" aria-label="${expanded?'Hide':'Show'} cycle and progress details" title="${expanded?'Hide':'Show'} extra flight status"><span aria-hidden="true">${expanded?'⌃':'⌄'}</span></button>`;
}

export const jobKindLabel=kind=>({repair:'REPAIR',fireControl:'FIRE CONTROL',medical:'MEDICAL'})[kind]??kind.toUpperCase();
export function activeJobsMarkup(state,visual={}) {
  if(!isV2(state)||!state.jobs.length)return '';
  return `<div class="active-jobs-heading">ACTIVE JOBS <small>Tap for workers, targets and Assist Work</small></div>${state.jobs.map(job=>`<button class="active-job ${visual.jobCountdown?.jobId===job.id?'counting-down':''}" data-job="${esc(job.id)}" data-job-id="${esc(job.id)}"><strong>${esc(jobKindLabel(job.kind))} — <span>${job.remainingTime} TIME REMAINING</span></strong><small>${[job.crewId,job.assistantId].filter(Boolean).map(id=>esc(crewDefinition(id)?.name??id)).join(' + ')}${job.targetId?` · Patient: ${esc(crewDefinition(job.targetId)?.name??job.targetId)}`:''}</small>${!job.assistantId?'<span class="job-assist-note">+ Assist Work · uses an available crew action</span>':''}</button>`).join('')}`;
}

export function crewMarkup(state, selectedCrew, interaction = null) {
  const choices = targetOptions(state, interaction);
  const choosingCrew = interaction && (interaction.stage === 'gunner' || interaction.action === 'medical' && interaction.stage !== 'work');
  return [...state.crew].sort((a, b) => crewDefinition(a.id).number - crewDefinition(b.id).number).map(crew => {
    const definition = crewDefinition(crew.id);
    const selected = selectedCrew === crew.id;
    const status = crewStatus(state, crew, selected);
    const actionMarker = crewActionMarker(state, crew);
    const station = stationStatus(state, crew);
    const legal = choosingCrew && choices.crew.includes(crew.id);
    const chosen = interaction?.targetId === crew.id || interaction?.gunnerId === crew.id;
    const control = station.cockpit ? station.operating ? 'CTRL' : 'OPEN' : !station.operating && crew.health !== 'dead' ? 'AWAY' : '';
    const until = status.job ? isV2(state) ? `${status.job.remainingTime} Time remaining${status.job.assistantId ? ' · assisted' : ''}` : `Until Round ${status.job.completeRound} start` : '';
    const location = station.displaced ? crew.job ? 'WORKING' : 'DISPLACED' : station.currentId === station.homeId ? 'HOME' : `AT ${({engineer:'TOP TURRET',radio:'DORSAL',navigator:'NOSE',bombardier:'NOSE',pilot:'PILOT',copilot:'COPILOT',ball:'BALL',leftWaist:'PORT',rightWaist:'STBD',tail:'TAIL'})[station.currentId]}`;
    const detail = `${definition.name}, ${status.label}.${actionMarker ? ` ${actionMarker.title}.` : ''} Home Station: ${station.homeName}. Current Station: ${station.currentName}${station.displaced ? ' — Displaced' : ''}. ${station.label}. Position ${station.position}.${until ? ` ${until}.` : ''}`;
    return `<button type="button" class="${classes(['crew-card', `status-${status.id}`, station.displaced && !crew.job && 'is-displaced', selected && 'selected', legal && 'target-legal', choosingCrew && !legal && 'target-dim', chosen && 'target-chosen'])}" data-crew="${esc(crew.id)}" aria-pressed="${Boolean(selected || chosen)}" aria-label="${esc(detail)}" title="${esc(detail)}">
      <span class="crew-number">${definition.number}</span>
      <span class="crew-copy"><strong><span class="full-name">${esc(definition.name)}</span><span class="short-name">${esc(SHORT_NAMES[crew.id] || definition.name)}</span></strong><small class="crew-role">${esc(definition.rank)} · ${esc(definition.role || definition.tags.join(' / '))}</small><small class="crew-location">${esc(location)}</small></span>
      <span class="crew-status"><span class="status-icon" aria-hidden="true">${esc(status.icon)}</span><span class="full-status">${esc(status.label)}</span><span class="short-status">${esc(status.short)}</span>${until ? `<small class="work-until">${isV2(state)?`${status.job.remainingTime} Time`:`R${status.job.completeRound}`}</small>` : ''}${isV2(state)?`<small class="cycle-slot">${crew.cycleSlotConsumed?'SLOT USED':'SLOT OPEN'}</small>`:''}${actionMarker ? `<span class="crew-action-marker" data-action="${esc(actionMarker.action)}" title="${esc(actionMarker.title)}">${actionIconMarkup(actionMarker.action, 'crew-action-glyph')}<span>${esc(actionMarker.short)}</span></span>` : ''}</span>
      ${control ? `<span class="station-indicator ${station.operating ? 'controlling' : 'uncontrolled'}" aria-label="${esc(station.label)}">${control}</span>` : ''}
    </button>`;
  }).join('');
}

export function enemyMarkup(state, { selectedCrew = null, interaction = null, visual = {} } = {}) {
  const choices = targetOptions(state, interaction);
  const preview = arcPreview(state, interaction?.gunnerId || interaction?.crewId || selectedCrew);
  const targeting = targetingFighters(interaction);
  const showLegality = targeting || Boolean(preview.arc);
  const legalIds = targeting ? choices.fighters : preview.fighterIds;
  const cards = state.fighters.map((fighter, index) => {
    const heading = fighterHeading(fighter);
    const legal = legalIds.includes(fighter.id);
    const chosen = interaction?.targetId === fighter.id;
    const resolving = visual.activeFighterId === fighter.id;
    const facing = fighter.facing === 0 ? 'FACING B-17' : `${fighter.facing}° AWAY`;
    const label = `Queue ${index + 1}, ${fighter.type}, ${fighter.hp} of ${fighter.maxHp} HP, ${fighter.quadrant}, ${fighter.altitude}, heading ${headingLabel(heading)}, ${facing}${isV2(state)?`, ${fighter.engagementRemaining} Engagement remaining`:''}${fighter.disrupted ? ', Disrupted' : ''}${showLegality ? legal ? ', legal target' : ', unavailable target' : ''}`;
    return `<button type="button" class="${classes(['fighter-card', showLegality && legal && 'target-legal', showLegality && !legal && 'target-dim', chosen && 'target-chosen', resolving && 'resolving', visual.departingFighter===fighter.id&&'departing'])}" data-fighter="${esc(fighter.id)}" aria-pressed="${Boolean(chosen)}" aria-label="${esc(label)}">
      <span class="queue-number">#${index + 1}</span>
      <span class="fighter-copy"><strong>${esc(fighter.type)}</strong><span class="fighter-hp">${fighter.hp}/${fighter.maxHp} HP</span><span class="fighter-sector">${esc(fighter.quadrant.toUpperCase())} / ${esc(fighter.altitude.toUpperCase())}</span><span class="hp-pips" aria-hidden="true">${Array.from({ length: fighter.maxHp }, (_, pip) => `<i class="${pip < fighter.hp ? 'full' : ''}"></i>`).join('')}</span>${isV2(state)?`<span class="engagement-badge" aria-label="ENGAGEMENT ${fighter.engagementRemaining}" title="Engagement: ${state.config.v2EngagementMode==='attack-pass-only'?'counts attack passes and disrupted flybys':'counts every normal enemy action'}">ENG ${fighter.engagementRemaining}</span>`:''}${visual.departingFighter===fighter.id?'<span class="breakoff-badge">BREAKING OFF ↗</span>':fighter.disrupted ? '<span class="disrupted-badge">DISRUPTED</span>' : ''}</span>
      <span class="facing"><b class="heading-arrow" style="transform:rotate(${heading}deg)" aria-hidden="true">↑</b><span class="heading-label">${headingLabel(heading)}</span><small>${facing}</small></span>
    </button>`;
  });
  for (let index = cards.length; index < state.config.maxFighters; index++) cards.push(`<div class="fighter-empty"><span>#${index + 1}</span> Clear sky</div>`);
  if (state.escorts.length) cards.push(`<p class="escort-note">✈ ESCORT · ${state.escorts.map(escort => esc(escort.quadrant.toUpperCase())).join(' / ')} · until ${isV2(state)?'next Progress checkpoint':'round end'}</p>`);
  return cards.join('');
}

function tokenGraphic(token, animate = false) {
  const back = Boolean(token.back ?? token.tokenBack);
  const value = token.value ?? token.token;
  const combatLabel={HIT:'HIT',BURST:'×2',MISS:'MISS'}[String(value).toUpperCase()];
  const label = back ? '?' : combatLabel || token.label || String(value).toUpperCase();
  const symbol = back ? '●' : String(value).toUpperCase() === 'ENEMY' ? '✈' : String(value).toUpperCase() === 'RESOURCE' ? '+' : String(value).toUpperCase() === 'TIME' ? '◷' : String(value).toUpperCase() === 'MISS' ? '×' : '⌖';
  return `<span class="draw-token tone-${esc(token.tone || 'neutral')} ${animate ? back ? 'token-back' : 'token-reveal' : 'token-held'}" data-token="${esc(back ? 'back' : value)}" aria-label="${esc(back ? 'Token face down' : String(value).toUpperCase()==='BURST'?'BURST ×2':label)}"><span class="token-symbol" aria-hidden="true">${symbol}</span><strong>${esc(label)}</strong>${token.bag ? `<small>${esc(token.bag.toUpperCase())}</small>` : ''}</span>`;
}

export function eventMarkup(event, visual = {}) {
  const descriptor = describeEvent(event || { message: 'Begin the sortie, then choose your crew order.' });
  let graphic = '';
  if (descriptor.kind === 'token') graphic = tokenGraphic({ ...descriptor, bag: event?.type?.startsWith('MISSION_') ? 'mission' : 'combat', label: descriptor.title }, true);
  else if (descriptor.kind === 'die') graphic = `<span class="die-face tone-${esc(descriptor.tone)}" aria-label="Roll ${esc(descriptor.roll)}">${esc(descriptor.roll)}</span>`;
  else if (descriptor.kind === 'location') graphic = `<span class="location-readout">${esc(event.cellId)}</span>`;
  else if (visual.token) graphic = tokenGraphic(visual.token);
  else graphic = `<span class="stage-icon" aria-hidden="true">${esc(descriptor.icon)}</span>`;
  const detail = `<div class="event-type">${esc(descriptor.icon)} ${esc((event?.type || 'READY FOR ORDERS').replaceAll('_', ' '))}</div><p class="event-message">${esc(descriptor.detail)}</p><small>${event?.ruleset==='v2-continuous'?`CREW CYCLE ${esc(event.crewCycle??'—')} · TURN ${esc((event.cycleTurn??0)+1)} · `:event?.round !== undefined ? `ROUND ${esc(event.round)} · ` : ''}${event?.sequence ? `EVENT ${esc(event.sequence)}` : 'MILK RUN / FLIGHT TEST'}</small>`;
  const stage = `<div class="stage-graphic tone-${esc(descriptor.tone)}">${graphic}</div><div class="stage-copy"><strong class="stage-title">${esc(descriptor.title)}</strong><span class="stage-detail">${esc(descriptor.detail)}</span></div>`;
  return { detail, stage, category: descriptor.category };
}

export function logMarkup(log = []) {
  if (!log.length) return '<li class="log-empty">The flight recorder begins with your first order.</li>';
  return groupEvents(log).reverse().map(group => {
    const first = group.events[0];
    const last = group.events.at(-1);
    return `<li class="log-group category-${esc(group.category)} ${group.events.some(e=>e.type==='MISSION_ENDED')?'sortie-ending':''}"><details data-log-group="${esc(group.id)}"><summary><span class="log-icon" aria-hidden="true">${esc(group.icon)}</span><span class="log-group-title">${esc(group.title)}</span><span class="log-index">${first.ruleset==='v2-continuous'?`C${esc(first.crewCycle??'—')} T${esc((first.cycleTurn??0)+1)}`:`R${esc(group.round ?? '—')}`} · ${esc(first.sequence ?? '')}${last.sequence !== first.sequence ? `–${esc(last.sequence ?? '')}` : ''}</span></summary><ol class="log-events">${group.events.map(event => {
      const description = describeEvent(event);
      return `<li class="category-${esc(description.category)}"><span class="log-event-message"><b>${esc(description.title)}</b>${esc(event.message)}</span><details class="log-raw"><summary>Raw event ${esc(event.sequence ?? '')}</summary><pre>${esc(JSON.stringify(event, null, 2))}</pre></details></li>`;
    }).join('')}</ol></details></li>`;
  }).join('');
}

export function altitudeMarkup(state) {
  const maximum = Math.max(state.config.startingAltitude, state.altitude);
  const pips = Array.from({ length: maximum + 1 }, (_, index) => maximum - index).map(altitude => `<span class="${classes(['altitude-pip', altitude === state.altitude && 'current', altitude > state.altitude && 'lost', altitude === 0 && 'ground'])}" data-altitude="${altitude}" aria-hidden="true"><i></i><span>${altitude === 0 ? '0 GROUND' : altitude}</span></span>`).join('');
  return `<div class="altitude-track" role="img" aria-label="Altitude ${state.altitude} of ${maximum}. Ground and destruction at zero."><span class="altitude-caption">ALTITUDE <b>${state.altitude}</b></span><div class="altitude-pips">${pips}</div></div>`;
}
