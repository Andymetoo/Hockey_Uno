/** Pure presentation of the director's saved decision, conditions and history. */
import { isV2 } from './rulesets.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const active = state => isV2(state) && state.config.v2StoryMode === true && state.story;
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
  return `${story.pending ? '<p class="story-awaiting">The crew is waiting for your decision.</p><button class="primary" data-ui="story-choice">Return to situation →</button>' : ''}
    <div class="story-conditions-list">${story.conditions.length ? story.conditions.map(condition => {
      const cell = condition.cellId ?? condition.repairCell;
      return `<article class="story-condition ${condition.tone === 'positive' ? 'positive' : condition.tone === 'negative' ? 'negative' : 'neutral'}" data-story-condition="${esc(condition.id)}"><h3><span aria-hidden="true">${condition.tone === 'positive' ? '✚' : '◆'}</span> ${esc(condition.title)}</h3><p>${esc(condition.description)}</p><dl><dt>Effect</dt><dd>${esc(condition.effectText)}</dd><dt>Resolve / expires</dt><dd>${esc(condition.resolveText)}</dd>${condition.pendingText ? `<dt>Pending</dt><dd>${esc(condition.pendingText)}</dd>` : ''}</dl>${conditionTokenCounts(state,condition)}${cell ? `<button class="quiet story-cell-link" data-story-cell="${esc(cell)}">Inspect marked square ${esc(cell)}</button>` : ''}</article>`;
    }).join('') : '<p class="story-quiet">No active Story conditions. The crew has a little room to breathe.</p>'}</div>
    ${story.recent.length ? `<details class="story-recent" open><summary>Recent / Resolved</summary><ul>${story.recent.slice(0, 5).map(item => `<li><b>${esc(item.title)}</b><span>${esc(item.outcome ?? item.text ?? item.reason)}</span></li>`).join('')}</ul></details>` : ''}`;
}

export function storyChoiceMarkup(pending) {
  if (!pending) return '';
  return `<p class="story-situation">${esc(pending.body)}</p><div class="story-choices">${pending.choices.map(choice => `<button type="button" class="story-choice" data-story-choice="${esc(choice.id)}" ${choice.disabled ? 'disabled' : ''}><strong>${esc(choice.label)}</strong><span>${esc(choice.detail)}</span>${choice.disabled && choice.reason ? `<small>${esc(choice.reason)}</small>` : ''}</button>`).join('')}</div><p class="small story-inspect-note">You can inspect your aircraft and Current Conditions before deciding. This situation waits for you.</p><button class="quiet" data-ui="close">Inspect aircraft</button>`;
}

export function storyFactsMarkup(facts = []) {
  return facts.length ? `<section class="story-flight-facts"><h3>That was the sortie where…</h3><ol>${facts.map(fact => `<li><span>${esc(fact.text)}</span><small>Progress ${esc(fact.progress)}</small></li>`).join('')}</ol></section>` : '';
}
