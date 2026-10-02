/** Read-only Bomb Run markup. Interaction uses stable die indices; the command
 * engine remains responsible for placement, payments, RNG and commitment.
 */
import { BOMBRUN_SLOTS, BOMBING_TARGETS, DEFAULT_BOMBING_TARGET, bombRunPreview, bombingOutcomeLabel } from './bombing.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const pipPositions = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const rangeLabel = ([low, high]) => low === high ? `EXACTLY ${low}` : `${low}–${high}`;

function diceFace(value, small = false) {
  return `<span class="bomb-die-face${small ? ' mini' : ''}" aria-hidden="true">${Array.from({ length: 9 }, (_, position) => `<i class="${pipPositions[value]?.includes(position) ? 'pip' : ''}"></i>`).join('')}</span>`;
}

export function targetChoiceMarkup(selectedId = DEFAULT_BOMBING_TARGET) {
  return `<label class="bomb-target-choice">Bomb Run target<select id="bombing-target-choice" data-bomb-target-choice name="bombingTarget">${Object.values(BOMBING_TARGETS).map(target => `<option value="${esc(target.id)}"${target.id === selectedId ? ' selected' : ''}>${esc(target.name)} — ${esc(target.difficulty)}</option>`).join('')}</select></label>`;
}

export function bombRunMarkup(state, selectedDieIndex = null, disabled = false) {
  const run = state.mission.bombRun;
  if (!run) return '';
  const heading = `<div class="bomb-run-heading"><div><span class="eyebrow">OVER TARGET / ${esc(run.target.difficulty)}</span><h2>${esc(run.target.name)}</h2></div><span class="bomb-run-stamp">BOMB<br>RUN</span></div>`;
  if (run.status === 'no-drop') return `<section class="bomb-run bomb-run-no-drop" aria-label="Bomb Run result">${heading}<strong class="bomb-run-result">NO DROP</strong><p>${esc(run.noDropReason)}</p><b>TURNING FOR HOME</b></section>`;
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
    return `<button type="button" class="bomb-slot${value === null ? ' empty' : ''}${canPlace ? ' placeable' : ''}" data-bomb-slot="${slot}" aria-label="${slot}, target ${rangeLabel(run.target.ranges[slot])}, ${value === null ? 'empty' : `die ${index + 1}, value ${value}, score ${preview.slotScores[slot]} of 3`}${canPlace ? `; place selected die ${selected + 1}` : ''}"${canPlace ? '' : ' disabled'}><strong>${slot.toUpperCase()}</strong><small class="bomb-slot-range">${rangeLabel(run.target.ranges[slot])}</small><span class="bomb-slot-value">${value === null ? '<span class="bomb-slot-empty">＋</span>' : diceFace(value, true)}</span><span class="bomb-slot-score">${value === null ? '— / 3' : `${preview.slotScores[slot]} / 3`}</span></button>`;
  }).join('');
  const total = preview.complete ? `${preview.total}/9` : '—/9';
  const outcome = preview.complete ? bombingOutcomeLabel(preview.outcome) : 'PLACE THREE DICE';
  const controls = run.status === 'placing' ? `<div class="bomb-rerolls"><button type="button" data-bomb-reroll="free"${!locked && selected !== null && run.freeRerollAvailable ? '' : ' disabled'}><strong>Bombardier reroll</strong><small>${run.freeRerollAvailable ? 'FREE · 1 AVAILABLE' : run.freeRerollUsed ? 'FREE REROLL USED' : 'NO FREE REROLL'}</small></button><button type="button" data-bomb-reroll="officer"${!locked && selected !== null && state.resources.Officer > 0 ? '' : ' disabled'}><strong>Officer reroll</strong><small>1 OFFICER · ${state.resources.Officer} HELD</small></button></div><button type="button" class="primary bomb-commit" data-command="commitBombRun"${!locked && preview.complete ? '' : ' disabled'}>Commit & release bombs →</button>` : '<p class="bomb-run-return">BOMBS AWAY — TURNING FOR HOME</p>';
  return `<section class="bomb-run" aria-label="Bomb Run dice placement">${heading}<p class="bomb-run-instruction">${run.status === 'placing' ? 'Tap a die, then Course, Drift or Release. Use any three dice. Rearrange freely before Commit.' : 'Bombing result recorded.'}</p><div class="bomb-dice-tray">${dice}</div><p class="bomb-selection" aria-live="polite">${selected === null ? 'Select a die to place or reroll.' : `DIE ${selected + 1} SELECTED · VALUE ${run.dice[selected]}`}</p><div class="bomb-slots">${slots}</div><div class="bomb-total" aria-live="polite"><span>TOTAL <strong>${total}</strong></span><b>${esc(outcome)}</b></div><p class="bomb-score-guide">In range = 3 · 1 away = 2 · 2 away = 1 · 3+ away = 0</p>${controls}</section>`;
}
