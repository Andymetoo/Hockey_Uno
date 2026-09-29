/** HTML presentation only. These helpers never activate crew, draw or mutate state. */
import { crewDefinition, crewStatus, stationStatus, SHORT_NAMES, arcPreview, headingLabel } from './ui-model.mjs';
import { fighterHeading } from './spatial.mjs';
import { targetOptions } from './targeting.mjs';
import { describeEvent, groupEvents } from './presentation.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const classes = values => values.filter(Boolean).join(' ');
const targetingFighters = interaction => interaction && ['basicFire', 'advancedFire', 'opportunityShot', 'rotateFighter'].includes(interaction.action);

export function crewMarkup(state, selectedCrew, interaction = null) {
  const choices = targetOptions(state, interaction);
  const choosingCrew = interaction && (interaction.stage === 'gunner' || interaction.action === 'medical' && interaction.stage !== 'work');
  return [...state.crew].sort((a, b) => crewDefinition(a.id).number - crewDefinition(b.id).number).map(crew => {
    const definition = crewDefinition(crew.id);
    const selected = selectedCrew === crew.id;
    const status = crewStatus(state, crew, selected);
    const station = stationStatus(state, crew);
    const legal = choosingCrew && choices.crew.includes(crew.id);
    const chosen = interaction?.targetId === crew.id || interaction?.gunnerId === crew.id;
    const control = station.cockpit ? station.operating ? 'CTRL' : 'OPEN' : !station.operating && crew.health !== 'dead' ? 'AWAY' : '';
    const until = status.job ? `Until Round ${status.job.completeRound} start` : '';
    const detail = `${definition.name}, ${status.label}. ${station.name}: ${station.label}. Position ${station.position}.${until ? ` ${until}.` : ''}`;
    return `<button type="button" class="${classes(['crew-card', `status-${status.id}`, selected && 'selected', legal && 'target-legal', choosingCrew && !legal && 'target-dim', chosen && 'target-chosen'])}" data-crew="${esc(crew.id)}" aria-pressed="${Boolean(selected || chosen)}" aria-label="${esc(detail)}" title="${esc(detail)}">
      <span class="crew-number">${definition.number}</span>
      <span class="crew-copy"><strong><span class="full-name">${esc(definition.name)}</span><span class="short-name">${esc(SHORT_NAMES[crew.id] || definition.name)}</span></strong><small class="crew-role">${esc(definition.rank)} · ${esc(definition.role || definition.tags.join(' / '))}</small></span>
      <span class="crew-status"><span class="status-icon" aria-hidden="true">${esc(status.icon)}</span><span class="full-status">${esc(status.label)}</span><span class="short-status">${esc(status.short)}</span>${until ? `<small class="work-until">R${status.job.completeRound}</small>` : ''}</span>
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
    const label = `Queue ${index + 1}, ${fighter.type}, ${fighter.hp} of ${fighter.maxHp} HP, ${fighter.quadrant}, ${fighter.altitude}, heading ${headingLabel(heading)}, ${facing}${fighter.disrupted ? ', Disrupted' : ''}${showLegality ? legal ? ', legal target' : ', unavailable target' : ''}`;
    return `<button type="button" class="${classes(['fighter-card', showLegality && legal && 'target-legal', showLegality && !legal && 'target-dim', chosen && 'target-chosen', resolving && 'resolving'])}" data-fighter="${esc(fighter.id)}" aria-pressed="${Boolean(chosen)}" aria-label="${esc(label)}">
      <span class="queue-number">#${index + 1}</span>
      <span class="fighter-copy"><strong>${esc(fighter.type)}</strong><span class="fighter-hp">${fighter.hp}/${fighter.maxHp} HP</span><span class="fighter-sector">${esc(fighter.quadrant.toUpperCase())} / ${esc(fighter.altitude.toUpperCase())}</span><span class="hp-pips" aria-hidden="true">${Array.from({ length: fighter.maxHp }, (_, pip) => `<i class="${pip < fighter.hp ? 'full' : ''}"></i>`).join('')}</span>${fighter.disrupted ? '<span class="disrupted-badge">DISRUPTED</span>' : ''}</span>
      <span class="facing"><b class="heading-arrow" style="transform:rotate(${heading}deg)" aria-hidden="true">↑</b><span class="heading-label">${headingLabel(heading)}</span><small>${facing}</small></span>
    </button>`;
  });
  for (let index = cards.length; index < state.config.maxFighters; index++) cards.push(`<div class="fighter-empty"><span>#${index + 1}</span> Clear sky</div>`);
  if (state.escorts.length) cards.push(`<p class="escort-note">✈ ESCORT · ${state.escorts.map(escort => esc(escort.quadrant.toUpperCase())).join(' / ')} · until round end</p>`);
  return cards.join('');
}

function tokenGraphic(token, animate = false) {
  const back = Boolean(token.back ?? token.tokenBack);
  const value = token.value ?? token.token;
  const label = back ? '?' : token.label || (String(value).toUpperCase() === 'BURST' ? 'BURST ×2' : String(value).toUpperCase());
  const symbol = back ? '●' : String(value).toUpperCase() === 'ENEMY' ? '✈' : String(value).toUpperCase() === 'RESOURCE' ? '+' : String(value).toUpperCase() === 'MISS' ? '×' : '⌖';
  return `<span class="draw-token tone-${esc(token.tone || 'neutral')} ${animate ? back ? 'token-back' : 'token-reveal' : 'token-held'}" data-token="${esc(back ? 'back' : value)}" aria-label="${esc(back ? 'Token face down' : label)}"><span class="token-symbol" aria-hidden="true">${symbol}</span><strong>${esc(label)}</strong>${token.bag ? `<small>${esc(token.bag.toUpperCase())}</small>` : ''}</span>`;
}

export function eventMarkup(event, visual = {}) {
  const descriptor = describeEvent(event || { message: 'Begin the sortie, then choose your crew order.' });
  let graphic = '';
  if (descriptor.kind === 'token') graphic = tokenGraphic({ ...descriptor, bag: event?.type?.startsWith('MISSION_') ? 'mission' : 'combat', label: descriptor.title }, true);
  else if (descriptor.kind === 'die') graphic = `<span class="die-face tone-${esc(descriptor.tone)}" aria-label="Roll ${esc(descriptor.roll)}">${esc(descriptor.roll)}</span>`;
  else if (descriptor.kind === 'location') graphic = `<span class="location-readout">${esc(event.cellId)}</span>`;
  else if (visual.token) graphic = tokenGraphic(visual.token);
  else graphic = `<span class="stage-icon" aria-hidden="true">${esc(descriptor.icon)}</span>`;
  const detail = `<div class="event-type">${esc(descriptor.icon)} ${esc((event?.type || 'READY FOR ORDERS').replaceAll('_', ' '))}</div><p class="event-message">${esc(descriptor.detail)}</p><small>${event?.round !== undefined ? `ROUND ${esc(event.round)} · ` : ''}${event?.sequence ? `EVENT ${esc(event.sequence)}` : 'FLIGHT TEST / V3'}</small>`;
  const stage = `<div class="stage-graphic tone-${esc(descriptor.tone)}">${graphic}</div><div class="stage-copy"><strong class="stage-title">${esc(descriptor.title)}</strong><span class="stage-detail">${esc(descriptor.detail)}</span></div>`;
  return { detail, stage, category: descriptor.category };
}

export function logMarkup(log = []) {
  if (!log.length) return '<li class="log-empty">The flight recorder begins with your first order.</li>';
  return groupEvents(log).reverse().map(group => {
    const first = group.events[0];
    const last = group.events.at(-1);
    return `<li class="log-group category-${esc(group.category)}"><details data-log-group="${esc(group.id)}"><summary><span class="log-icon" aria-hidden="true">${esc(group.icon)}</span><span class="log-group-title">${esc(group.title)}</span><span class="log-index">R${esc(group.round ?? '—')} · ${esc(first.sequence ?? '')}${last.sequence !== first.sequence ? `–${esc(last.sequence ?? '')}` : ''}</span></summary><ol class="log-events">${group.events.map(event => {
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
