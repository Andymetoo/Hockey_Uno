/** Gameplay targets, not historical simulation claims. Keep tuning here.
 * `modifiers` reserves a home for later travel/bag rules; none apply today.
 * A Bomb Run saves its complete target definition so future tuning cannot
 * change a run that has already rolled its dice.
 */
export const BOMBRUN_SLOTS = Object.freeze(['course', 'drift', 'release']);
export const DEFAULT_BOMBING_TARGET = 'bremen';

function freezeTarget(target) {
  for (const range of Object.values(target.ranges)) Object.freeze(range);
  Object.freeze(target.ranges);
  Object.freeze(target.thresholds);
  Object.freeze(target.modifiers);
  return Object.freeze(target);
}

export const BOMBING_TARGETS = Object.freeze(Object.fromEntries([
  { id: 'wilhelmshaven', name: 'Wilhelmshaven', difficulty: 'Easy',
    ranges: { course: [2, 5], drift: [2, 5], release: [3, 5] },
    thresholds: { destroyed: 7, heavy: 5, partial: 3, minimal: 1, miss: 0 }, modifiers: {} },
  { id: 'bremen', name: 'Bremen', difficulty: 'Standard',
    ranges: { course: [3, 4], drift: [2, 4], release: [4, 5] },
    thresholds: { destroyed: 8, heavy: 6, partial: 4, minimal: 1, miss: 0 }, modifiers: {} },
  { id: 'schweinfurt', name: 'Schweinfurt', difficulty: 'Hard',
    ranges: { course: [4, 4], drift: [2, 3], release: [5, 5] },
    thresholds: { destroyed: 9, heavy: 7, partial: 5, minimal: 2, miss: 0 }, modifiers: {} },
].map(target => [target.id, freezeTarget(target)])));

export function getBombingTarget(id = DEFAULT_BOMBING_TARGET) {
  const target = BOMBING_TARGETS[id];
  if (!target) throw new RangeError(`Unknown bombing target: ${id}`);
  return target;
}

export function bombingOutcomeLabel(outcome) {
  return { destroyed: 'TARGET DESTROYED', heavy: 'HEAVY DAMAGE', partial: 'PARTIAL DAMAGE',
    minimal: 'MINIMAL DAMAGE', miss: 'MISS', hit: 'BOMBS ON TARGET', 'no-drop': 'NO DROP' }[outcome] ?? 'NOT COMMITTED';
}

export function validBombingTarget(target) {
  if (!target || typeof target !== 'object' || typeof target.id !== 'string' || !target.id ||
      typeof target.name !== 'string' || !target.name || typeof target.difficulty !== 'string') return false;
  if (!BOMBRUN_SLOTS.every(slot => Array.isArray(target.ranges?.[slot]) && target.ranges[slot].length === 2 &&
    target.ranges[slot].every(value => Number.isInteger(value) && value >= 1 && value <= 6) &&
    target.ranges[slot][0] <= target.ranges[slot][1])) return false;
  const values = ['destroyed', 'heavy', 'partial', 'minimal', 'miss'].map(key => target.thresholds?.[key]);
  return values.every((value, index) => Number.isInteger(value) && value >= 0 && value <= 9 &&
    (!index || values[index - 1] > value)) && values[4] === 0;
}

export function rangeDistance(value, range) {
  if (!Number.isInteger(value) || value < 1 || value > 6 || !Array.isArray(range) || range.length !== 2 ||
      !range.every(edge => Number.isInteger(edge) && edge >= 1 && edge <= 6) || range[0] > range[1]) {
    throw new RangeError('Bomb Run scoring needs a d6 value and an inclusive range within 1–6.');
  }
  return value < range[0] ? range[0] - value : value > range[1] ? value - range[1] : 0;
}

export const scoreBombDie = (value, range) => Math.max(0, 3 - rangeDistance(value, range));

export function targetOutcome(score, target) {
  if (!Number.isInteger(score) || score < 0 || score > 9 || !validBombingTarget(target)) {
    throw new RangeError('Bomb Run outcome needs a score from 0–9 and a valid target.');
  }
  return ['destroyed', 'heavy', 'partial', 'minimal', 'miss'].find(key => score >= target.thresholds[key]);
}
