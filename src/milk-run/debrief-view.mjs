/** The recorded end state, presented without inventing post-loss crew outcomes. */
import { bombingOutcomeLabel } from './bombing.mjs';
import { sortieResult } from './results.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function debriefMarkup(state, result = sortieResult(state)) {
  if (!result) return '';
  const run = state.mission.bombRun;
  const lost = !result.aircraftSurvived;
  const outcome = state.mission.aborted ? 'ABORTED — NO BOMBING CREDIT' : state.mission.bombingResult ? bombingOutcomeLabel(state.mission.bombingResult) : 'TARGET NOT REACHED';
  const score = !state.mission.aborted && Number.isInteger(run?.committedScore) ? `${run.committedScore}/9` : '—';
  const healthy = state.crew.filter(crew => crew.health === 'healthy').length;
  const injured = state.crew.filter(crew => crew.health === 'injured').length;
  const dead = state.crew.filter(crew => crew.health === 'dead').length;
  return `<section class="sortie-result debrief ${lost ? 'lost' : 'returned'}${state.mission.aborted ? ' aborted' : ''}" role="status" aria-label="End of sortie">
    <div class="debrief-topline"><span>FLIGHT REPORT / ${lost ? 'AIRCRAFT LOSS' : 'HOME STATION'}</span><span>${lost ? 'REPORT CLOSED' : 'SORTIE COMPLETE'}</span></div>
    <div class="debrief-heading"><span class="debrief-seal" aria-hidden="true">${lost ? '×' : '✓'}</span><div><h2>${esc(result.title)}</h2><p>${esc(result.reason)}</p>${result.distance ? `<p class="debrief-distance">${esc(result.distanceLabel)}</p>` : ''}</div></div>
    <div class="debrief-objective" data-bombing-outcome="${esc(result.bombingOutcome ?? 'not-reached')}"><span class="debrief-score">${score}<small>BOMBING</small></span><div><span class="eyebrow">${esc(run?.target?.name ?? 'OBJECTIVE REPORT')}</span><strong>${esc(outcome)}</strong>${run?.noDropReason ? `<p>${esc(run.noDropReason)}</p>` : ''}</div></div>
    <div class="debrief-metrics"><span><b>${state.stats.fightersKilled ?? 0}</b><small>FIGHTERS DESTROYED</small></span><span><b>${state.mission.position}</b><small>PROGRESS REACHED</small></span><span><b>${healthy} / ${injured} / ${dead}</b><small>HEALTHY / INJURED / DEAD</small></span></div>
    ${lost ? '<p class="debrief-crew-note">Crew health is the final recorded state. No post-loss survival outcome is assigned.</p>' : ''}
  </section>`;
}
