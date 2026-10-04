/** Small rule adapters: effects never mutate configured defaults or base tokens. */
export const storyEnabled = state => state.ruleset === 'v2-continuous' && state.config.v2StoryMode === true && state.story?.version === 1 && !state.story.closed;
export const storyToken = token => typeof token === 'string' && token.startsWith('Story:') ? token.split(':').at(-1) : token;
export const storyConditions = state => storyEnabled(state) ? state.story.conditions : [];
export const storyModifier = (state, key) => storyConditions(state).reduce((sum, c) => sum + (typeof c.modifiers?.[key] === 'number' ? c.modifiers[key] : 0), 0);
export const storyFlag = (state, key) => storyConditions(state).some(c => c.modifiers?.[key] === true);
export const storyJobTime = (state, kind) => storyConditions(state).reduce((sum, c) => sum + (c.modifiers?.jobTime?.[kind] ?? 0), 0);
export const storyActionCost = (state, kind, base) => storyConditions(state).some(c => c.modifiers?.nextFree === kind) ? 0 : Math.max(0, base + storyConditions(state).reduce((sum, c) => sum + (c.modifiers?.cost?.[kind] ?? 0), 0));

export function addStoryFact(state, threadId, text, kind = 'story') {
  if (!state.story || !text) return;
  state.story.facts.push({ id: `fact-${state.story.nextId++}`, threadId, text, progress: state.mission.position, kind });
}

export function addStoryCondition(state, definition, emit = () => {}) {
  if (!storyEnabled(state)) return null;
  if (state.story.conditions.some(c => c.id === definition.id)) return null;
  const condition = { ...structuredClone(definition), uid: `condition-${state.story.nextId++}`, createdBoundary: state.story.boundary };
  if (Number.isInteger(definition.duration)) condition.dueBoundary = state.story.boundary + Math.max(1, definition.duration);
  if (condition.repairCell && !condition.cellId) condition.cellId = condition.repairCell;
  condition.modifiers ??= {};
  condition.tokens ??= [];
  for (const entry of condition.tokens) {
    // Temporary resource/Time tokens would escape into fungible held pools.
    // Only pressure tokens enter the mission bag; physical clocks remain native.
    if (!(entry.bag === 'combat' && ['Hit', 'Miss', 'Burst'].includes(entry.token) || entry.bag === 'mission' && entry.token === 'Enemy') || !Number.isInteger(entry.count) || entry.count < 0 || entry.count > 12) throw new Error('Unsupported temporary Story bag token.');
  }
  state.story.conditions.push(condition);
  let index = 0;
  for (const entry of condition.tokens) for (let n = 0; n < entry.count; n++) state.bags[entry.bag].tokens.push(`Story:${condition.uid}:${index++}:${entry.token}`);
  emit({ type: 'STORY_CONDITION_STARTED', title: condition.title, message: `${condition.title}: ${condition.effectText}`, conditionId: condition.id, cellId: condition.cellId });
  return condition;
}

export function resolveStoryCondition(state, id, reason = 'The situation has passed.', emit = () => {}, { history = true } = {}) {
  const condition = state.story?.conditions.find(c => c.id === id);
  if (!condition) return false;
  const prefix = `Story:${condition.uid}:`;
  for (const bag of Object.values(state.bags)) for (const pile of ['tokens', 'discard']) bag[pile] = bag[pile].filter(token => !String(token).startsWith(prefix));
  state.story.conditions = state.story.conditions.filter(c => c.id !== id);
  state.story.recent.unshift({ id, title: condition.title, outcome: reason, boundary: state.story.boundary });
  state.story.recent = state.story.recent.slice(0, 5);
  if (history) addStoryFact(state, condition.threadId ?? id, `${condition.title} — ${reason}`, 'resolution');
  emit({ type: 'STORY_CONDITION_RESOLVED', title: condition.title, message: `${condition.title}: ${reason}`, conditionId: id, cellId: condition.cellId });
  return true;
}

export function consumeStoryAction(state, kind, emit) {
  const condition = storyConditions(state).find(c => c.modifiers?.nextFree === kind);
  const name = { medical: 'Medical', repair: 'Repair', fireControl: 'Fire Control', advancedFire: 'Advanced Fire', escort: 'an Escort call' }[kind] ?? kind;
  if (condition) resolveStoryCondition(state, condition.id, `Used for ${name}.`, emit);
}

export function reconcileStory(state, emit = () => {}) {
  if (!storyEnabled(state)) return;
  for (const condition of [...state.story.conditions]) {
    const reason = condition.repairCell && state.cells[condition.repairCell] === 'healthy' ? `Repair at ${condition.repairCell} solved the problem.`
      : condition.altitudeAtMost !== undefined && state.altitude <= condition.altitudeAtMost ? `Below the danger altitude (${state.altitude}).`
      : condition.until === 'bombed' && (state.mission.bombed || state.mission.aborted) ? 'The target is behind us.'
      : condition.until === 'turnBack' && state.mission.aborted ? 'The outbound route was abandoned.' : null;
    if (reason) resolveStoryCondition(state, condition.id, reason, emit, { history: reason !== 'The target is behind us.' });
  }
}
