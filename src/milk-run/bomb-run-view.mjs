/** Read-only Bomb Run markup. Interaction uses stable die indices; the command
 * engine remains responsible for placement, payments, RNG and commitment.
 */
import { BOMBRUN_SLOTS, BOMBING_TARGETS, DEFAULT_BOMBING_TARGET, bombRunPreview, bombingOutcomeLabel, rangeDistance } from './bombing.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const pipPositions = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const rangeLabel = ([low, high]) => low === high ? `EXACTLY ${low}` : `${low}–${high}`;
const scoreMarks = (score, total = 3) => `<span class="bomb-score-marks" aria-hidden="true">${Array.from({ length: total }, (_, index) => `<i class="${index < score ? 'filled' : ''}"></i>`).join('')}</span>`;
const targetGraphic = '<svg class="bomb-target-graphic" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="29"/><circle cx="40" cy="40" r="17"/><path d="M40 0v29m0 22v29M0 40h29m22 0h29M26 56l9-10 11 5 8-14-10-7-9 9Z"/><circle class="target-center" cx="40" cy="40" r="3"/></svg>';

function diceFace(value, small = false) {
  return `<span class="bomb-die-face${small ? ' mini' : ''}" aria-hidden="true">${Array.from({ length: 9 }, (_, position) => `<i class="${pipPositions[value]?.includes(position) ? 'pip' : ''}"></i>`).join('')}</span>`;
}

export function targetChoiceMarkup(selectedId = DEFAULT_BOMBING_TARGET) {
  return `<label class="bomb-target-choice">Bomb Run target<select id="bombing-target-choice" data-bomb-target-choice name="bombingTarget">${Object.values(BOMBING_TARGETS).map(target => `<option value="${esc(target.id)}"${target.id === selectedId ? ' selected' : ''}>${esc(target.name)} — ${esc(target.difficulty)}</option>`).join('')}</select></label>`;
}

export function bombRunMarkup(state, selectedDieIndex = null, disabled = false) {
  const run = state.mission.bombRun;
  if (!run) return '';
  const heading = `<div class="bomb-run-heading"><div><span class="eyebrow">${run.status === 'no-drop' ? 'TARGET RESULT' : 'OVER TARGET'} / ${esc(run.target.difficulty)}</span><h2>${esc(run.target.name)}</h2><span class="bomb-target-threshold">${run.status === 'no-drop' ? 'BOMBING ATTEMPT CLOSED' : `DESTROYED AT ${run.target.thresholds.destroyed}/9`}</span></div>${targetGraphic}<span class="bomb-run-stamp">BOMB<br>RUN</span></div>`;
  if (run.status === 'no-drop') {
    if (state.mission.position > state.config.v2OutboundLength) return `<section class="bomb-run bomb-run-no-drop bomb-run-return-record" aria-label="Bomb Run result"><details><summary><strong class="bomb-run-result">NO DROP</strong><span>${esc(run.target.name)} · RETURNING HOME</span></summary><p>${esc(run.noDropReason)}</p><small>Bombs were not released at TARGET. This result is recorded.</small></details></section>`;
    return `<section class="bomb-run bomb-run-no-drop" aria-label="Bomb Run result">${heading}<div class="bomb-no-drop-report"><span class="eyebrow">BOMBS NOT RELEASED</span><strong class="bomb-run-result">NO DROP</strong><p>${esc(run.noDropReason)}</p></div><b class="bomb-return-order">↶ TURNING FOR HOME</b></section>`;
  }
  const preview = bombRunPreview(state);
  const locked = disabled || run.status !== 'placing' || state.phase !== 'bombing';
  const selected = Number.isInteger(selectedDieIndex) && selectedDieIndex >= 0 && selectedDieIndex < 4 ? selectedDieIndex : null;
  const canPlace = !locked && selected !== null;
  const dice = run.dice.map((value, index) => {
    const slot = BOMBRUN_SLOTS.find(key => run.placement[key] === index);
    const location = slot?.toUpperCase() ?? (preview.complete ? 'UNUSED' : 'AVAILABLE');
    return `<button type="button" class="bomb-die${selected === index ? ' selected' : ''}${slot ? ' assigned' : ''}" data-bomb-die="${index}" aria-pressed="${selected === index}" aria-label="Die ${index + 1}, value ${value}, ${location.toLowerCase()}"${locked ? ' disabled' : ''}>${diceFace(value)}<strong>${value}</strong><small>${location}</small></button>`;
  }).join('');
  const slots = BOMBRUN_SLOTS.map(slot => {
    const index = run.placement[slot], value = index === null ? null : run.dice[index];
    const distance = value === null ? null : rangeDistance(value, run.target.ranges[slot]);
    return `<button type="button" class="bomb-slot${value === null ? ' empty' : ''}${canPlace ? ' placeable' : ''}" data-bomb-slot="${slot}" data-score="${value === null ? 'empty' : preview.slotScores[slot]}" aria-label="${slot}, target ${rangeLabel(run.target.ranges[slot])}, ${value === null ? 'empty' : `die ${index + 1}, value ${value}, score ${preview.slotScores[slot]} of 3`}${canPlace ? `; place selected die ${selected + 1}` : ''}"${canPlace ? '' : ' disabled'}><strong>${slot.toUpperCase()}</strong><small class="bomb-slot-range">${rangeLabel(run.target.ranges[slot])}</small><span class="bomb-slot-value">${value === null ? '<span class="bomb-slot-empty">＋</span>' : diceFace(value, true)}</span><span class="bomb-slot-score">${value === null ? '— / 3' : `${preview.slotScores[slot]} / 3`}</span>${scoreMarks(value === null ? 0 : preview.slotScores[slot])}<span class="bomb-slot-distance">${distance === null ? 'PLACE DIE' : distance === 0 ? 'IN RANGE' : `${distance} AWAY`}</span></button>`;
  }).join('');
  const total = preview.complete ? `${preview.total}/9` : '—/9';
  const outcome = preview.complete ? bombingOutcomeLabel(preview.outcome) : 'PLACE THREE DICE';
  const officerCost = run.storyOfficerCost ?? 1;
  const controls = run.status === 'placing' ? `<div class="bomb-rerolls"><button type="button" data-bomb-reroll="free"${!locked && selected !== null && run.freeRerollAvailable ? '' : ' disabled'}><strong>↻ Bombardier reroll</strong><small>${run.freeRerollAvailable ? 'FREE · 1 AVAILABLE' : run.freeRerollUsed ? 'FREE REROLL USED' : 'NO FREE REROLL'}</small></button><button type="button" data-bomb-reroll="officer"${!locked && !run.storyOfficerBlocked && selected !== null && state.resources.Officer >= officerCost ? '' : ' disabled'}><strong>↻ Officer reroll</strong><small>${run.storyOfficerBlocked ? 'UNAVAILABLE · CURRENT CONDITIONS' : `${officerCost} OFFICER · ${state.resources.Officer} HELD`}</small></button></div>${run.storyOfficerBlocked ? '<button type="button" class="quiet" data-ui="story-conditions">Inspect Current Conditions →</button>' : ''}<button type="button" class="primary bomb-commit" data-command="commitBombRun"${!locked && preview.complete ? '' : ' disabled'}>Commit & release bombs →</button>` : '<p class="bomb-run-return">BOMBS AWAY — TURNING FOR HOME</p>';
  return `<section class="bomb-run${run.status === 'committed' ? ' is-committed' : ''}" data-bomb-outcome="${preview.complete ? esc(preview.outcome) : 'placing'}" aria-label="Bomb Run dice placement">${heading}<p class="bomb-run-instruction">${run.status === 'placing' ? 'Choose any three dice. Tap a die, then a slot. Rearrange freely before Commit.' : 'Bombing result recorded.'}</p><div class="bomb-dice-tray">${dice}</div><p class="bomb-selection" aria-live="polite">${selected === null ? 'Select a die to place or reroll.' : `DIE ${selected + 1} SELECTED · VALUE ${run.dice[selected]} · TAP A SLOT`}</p><div class="bomb-slots">${slots}</div><div class="bomb-total" aria-live="polite"><span>${run.status === 'placing' ? 'PREVIEW' : 'FINAL'} <strong>${total}</strong></span><b>${esc(outcome)}</b>${scoreMarks(preview.complete ? preview.total : 0, 9)}</div><p class="bomb-score-guide"><span>In range <b>3</b></span><span>1 away <b>2</b></span><span>2 away <b>1</b></span><span>3+ away <b>0</b></span></p>${controls}</section>`;
}
