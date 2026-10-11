/** Pure presentation of the director's saved decision, conditions and history. */
import { isV2 } from './rulesets.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const active = state => isV2(state) && state.config.v2StoryMode === true && state.story;
export function conditionLifecycle(state, condition) {
  const due = state.story?.threads[condition.threadId]?.due;
  const parts = [];
  if (Number.isInteger(condition.dueBoundary)) {
    const remaining = Math.max(0, condition.dueBoundary - state.story.boundary);
    parts.push(remaining <= 1 ? 'Ends after the next Progress checkpoint.' : `Ends in ${remaining} Progress checkpoints.`);
  }
  if (due?.boundary !== undefined) {
    const remaining = due.boundary - state.story.boundary;
    parts.push(remaining <= 1 ? 'Next update: after the next Progress checkpoint.' : `Next update: in ${remaining} Progress checkpoints.`);
  } else if (due?.at === 'target') parts.push('Expected duration: through TARGET unless Turn Back or another listed resolution occurs. Next update: at TARGET.');
  if (condition.repairCell) parts.push(`Ends when ${condition.repairCell} is repaired.`);
  if (condition.altitudeAtMost !== undefined) parts.push(`Ends at Altitude ${condition.altitudeAtMost} or lower.`);
  if (condition.modifiers?.nextFree) parts.push('Ends when used; otherwise at HOME.');
  if (condition.until === 'bombed') parts.push('Ends after the Bomb Run or on Turn Back.');
  return parts.join(' ') || condition.resolveText || 'Ends at HOME or aircraft loss.';
}
function conditionTokenCounts(state, condition) {
  if (!condition.uid || !condition.tokens?.some(entry => entry.count > 0)) return '';
  const prefix = `Story:${condition.uid}:`;
  const bags = [...new Set(condition.tokens.map(entry => entry.bag))].map(name => state.bags[name]).filter(Boolean);
  const count = pile => bags.reduce((total, bag) => total + bag[pile].filter(token => typeof token === 'string' && token.startsWith(prefix)).length, 0);
  return `<p class="story-token-count"><b>Temporary tokens:</b> ${count('tokens')} in bag · ${count('discard')} in discard</p>`;
}

export function storyIndicatorMarkup(state) {
  if (!active(state)) return '';
  const total = state.story.conditions.length, pending = Boolean(state.story.pending);
  return `<button type="button" class="story-indicator ${total || pending ? 'has-conditions' : ''}" data-ui="story-conditions" aria-label="Current Conditions: ${total} active${pending ? ', decision waiting' : ''}" title="Current Conditions"><span aria-hidden="true">${pending ? '!' : total ? '◆' : '◇'}</span><span class="story-indicator-label">Conditions</span>${total ? `<b>${total}</b>` : ''}${pending ? '<span class="story-pending-dot" aria-hidden="true"></span>' : ''}</button>`;
}

export function storyConditionsMarkup(state) {
  const story = active(state) ? state.story : null;
  if (!story) return '<p>Story Mode is off for this sortie.</p>';
  return `<div class="conditions-brief"><span class="eyebrow">IN FLIGHT / CURRENT CONDITIONS</span><strong>${story.conditions.length ? `${story.conditions.length} active ${story.conditions.length === 1 ? 'condition' : 'conditions'}` : 'No active conditions'}</strong><span>Effects remain in force until their listed resolution.</span></div>${story.pending ? '<p class="story-awaiting">The crew is waiting for your decision.</p><button class="primary" data-ui="story-choice">Return to situation →</button>' : ''}
    <div class="story-conditions-list">${story.conditions.length ? story.conditions.map(condition => {
      const cell = condition.cellId ?? condition.repairCell;
      const tone = condition.tone === 'positive' ? 'positive' : condition.tone === 'negative' ? 'negative' : 'neutral';
      return `<article class="story-condition ${tone}" data-story-condition="${esc(condition.id)}"><div class="condition-topline"><span class="condition-tone">${tone === 'positive' ? '+ ADVANTAGE' : tone === 'negative' ? '! HAZARD' : '◆ SITUATION'}</span>${cell ? `<span class="condition-square">SQUARE ${esc(cell)}</span>` : ''}</div><h3>${esc(condition.title)}</h3><dl><dt>Effect</dt><dd class="condition-effect">${esc(condition.effectText)}</dd><dt>Resolve / expires</dt><dd class="condition-duration">${esc(conditionLifecycle(state, condition))}</dd>${condition.pendingText ? `<dt>Pending</dt><dd>${esc(condition.pendingText)}</dd>` : ''}</dl><p class="condition-background">${esc(condition.description)}</p>${conditionTokenCounts(state,condition)}${cell ? `<button class="quiet story-cell-link" data-story-cell="${esc(cell)}">Inspect marked square ${esc(cell)} →</button>` : ''}</article>`;
    }).join('') : '<p class="story-quiet">No active Story conditions. The crew has a little room to breathe.</p>'}</div>
    ${story.recent.length ? `<details class="story-recent"><summary>Recent / Resolved <span>${Math.min(story.recent.length, 5)}</span></summary><ul>${story.recent.slice(0, 5).map(item => `<li><b>${esc(item.title)}</b><span>${esc(item.outcome ?? item.text ?? item.reason)}</span></li>`).join('')}</ul></details>` : ''}`;
}

export function storyChoiceMarkup(pending, selectedId = null, state = null) {
  if (!pending) return '';
  const selected = pending.choices.find(choice => choice.id === selectedId && !choice.disabled);
  return `<div class="story-context"><span>CREW REPORT</span>${state ? `<span>PROGRESS ${esc(state.mission.position)} · ALT ${esc(state.altitude)}</span>` : '<span>DECISION REQUIRED</span>'}</div><p class="story-situation">${esc(pending.body)}</p><div class="story-decision-label"><b>YOUR ORDERS</b><span>Select, then Continue</span></div><div class="story-choices">${pending.choices.map((choice, index) => `<button type="button" class="story-choice ${choice.id === selectedId ? 'selected' : ''}" aria-pressed="${choice.id === selectedId}" data-story-choice="${esc(choice.id)}" ${choice.disabled ? 'disabled' : ''}><span class="story-choice-mark" aria-hidden="true">${choice.id === selectedId ? '✓' : String(index + 1).padStart(2, '0')}</span><strong>${esc(choice.label)}</strong><span class="story-choice-detail">${esc(choice.detail)}</span>${choice.disabled && choice.reason ? `<small>${esc(choice.reason)}</small>` : ''}</button>`).join('')}</div><div class="story-decision-footer"><p class="story-selection-status" role="status">${selected ? `Selected: ${esc(selected.label)}` : 'No order committed. Select an option above.'}</p><div class="story-decision-actions"><button class="quiet story-inspect" data-ui="close">Inspect aircraft</button><button class="primary story-continue" data-ui="story-continue" ${selected?'':'disabled'}>Continue · Commit Choice</button></div><p class="small story-inspect-note">Aircraft and Current Conditions remain inspectable. Your selection waits here.</p></div>`;
}

export function storyFactsMarkup(facts = []) {
  return facts.length ? `<section class="story-flight-facts"><h3>That was the sortie where…</h3><ol>${facts.map(fact => `<li><span>${esc(fact.text)}</span><small>Progress ${esc(fact.progress)}</small></li>`).join('')}</ol></section>` : '';
}
