/** Serializable narrative director. Authored content is data; tactical mutations
 * go through the same services used by ordinary crew commands. */
import { random, seedToInt } from './random.mjs';
import { STORY_THREADS } from './story-content.mjs';
import { getBombingTarget } from './bombing-targets.mjs';
import { CREW_DEFS } from './board.mjs';
import { storyEnabled, addStoryFact, addStoryCondition, resolveStoryCondition, reconcileStory } from './story-effects.mjs';
export { reconcileStory } from './story-effects.mjs';

export const createStory = seed => ({ version: 1, rng: seedToInt(`${seed}:story-director`), boundary: 0,
  lastPromptBoundary: -99, beats: 0, threads: {}, conditions: [], recent: [], facts: [], pending: null,
  recentThreads: [], nextId: 1, closed: false });
const requireRule = (yes, message) => { if (!yes) throw new Error(message); };
const content = id => STORY_THREADS.find(thread => thread.id === id);
const interpolate = (value, bindings) => typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (whole, key) => bindings[key] ?? whole)
  : Array.isArray(value) ? value.map(item => interpolate(item, bindings))
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolate(item, bindings)])) : value;
function weighted(story, entries) {
  const total = entries.reduce((sum, item) => sum + (item.weight ?? 1), 0);
  let roll = random(story) * total;
  return entries.find(item => (roll -= item.weight ?? 1) < 0) ?? entries.at(-1);
}
export const storyEligibleThreads = state => !storyEnabled(state) ? [] : STORY_THREADS.filter(thread => !state.story.threads[thread.id] && (!thread.eligible || thread.eligible(state)));

function schedule(state, thread, next) {
  thread.due = null;
  if (!next) {
    thread.resolved = true;
    for (const condition of state.story.conditions.filter(c => c.threadId === thread.id)) delete condition.pendingText;
    return;
  }
  const candidates = next.branches?.filter(branch => !branch.eligible || branch.eligible(state, thread.bindings));
  const stage = candidates ? weighted(state.story, candidates)?.stage : next.stage;
  if (!stage) { thread.resolved = true; return; }
  // Resolve the roll now and save its branch. Loading or deferring a beat never rerolls it.
  thread.due = { stage, ...(next.at === 'target' ? { at: 'target' } : { boundary: state.story.boundary + Math.max(1, next.after ?? 1) }) };
}

function applyEffects(state, thread, effects = [], emit, services) {
  for (const raw of effects) {
    const effect = interpolate(raw, thread.bindings);
    switch (effect.type) {
      case 'condition': addStoryCondition(state, { ...effect, threadId: thread.id }, emit); break;
      case 'resolve': resolveStoryCondition(state, effect.id, effect.reason, emit); break;
      case 'fact': addStoryFact(state, thread.id, effect.text); break;
      case 'time': services.gainTime?.(); break;
      case 'work': requireRule(services.startWork, 'Story work requires the tactical work service.'); services.startWork(effect, thread); break;
      case 'damage': requireRule(services.damage, 'Story damage requires the tactical damage service.'); services.damage(effect.cellId, effect.steps ?? 1); break;
      case 'stopEngine': {
        const engine = state.engines.find(item => item.id === effect.engineId);
        if (engine?.running) { engine.running = false; state.stats.enginesDisabled++; emit({ type: 'ENGINE_DISABLED', message: `${engine.id} is shut down: ${thread.id.replaceAll('_', ' ')}.`, engineId: engine.id }); services.recalculate?.(); }
        break;
      }
      case 'altitude':
        requireRule(effect.amount < 0 && state.altitude + effect.amount >= 1, 'There is no safe altitude remaining for this descent.');
        state.altitude += effect.amount;
        emit({ type: 'STORY_ALTITUDE_CHANGED', message: `The crew descends to Altitude ${state.altitude}.`, altitude: state.altitude }); break;
      default: throw new Error(`Unknown Story effect: ${effect.type}`);
    }
  }
  reconcileStory(state, emit);
}

function choiceReason(state, thread, choice, services) {
  if (choice.eligible && !choice.eligible(state, thread.bindings)) return choice.reason ?? 'Current aircraft or crew conditions prevent this choice.';
  for (const raw of choice.effects ?? []) {
    const effect = interpolate(raw, thread.bindings);
    if (effect.type === 'work' && !services.canWork?.(effect)) return 'No healthy free worker has a safe position for this job.';
    if (effect.type === 'altitude' && state.altitude + effect.amount < 1) return 'Too low to descend safely.';
  }
  return '';
}

function enterStage(state, thread, stageId, emit, services) {
  const stage = content(thread.id)?.stages[stageId];
  requireRule(stage, `Unknown Story stage ${thread.id}/${stageId}.`);
  thread.due = null;
  if (stage.eligible && !stage.eligible(state, thread.bindings)) {
    if (stage.elseStage) return enterStage(state, thread, stage.elseStage, emit, services);
    thread.resolved = true;
    return false;
  }
  thread.stage = stageId;
  const text = interpolate({ title: stage.title, body: stage.body, fact: stage.fact }, thread.bindings);
  if (stage.choices?.length) {
    requireRule(!state.story.pending && state.story.lastPromptBoundary !== state.story.boundary, 'Only one Story decision is allowed at a Progress boundary.');
    state.story.pending = { id: `${thread.id}:${stageId}:${state.story.boundary}`, threadId: thread.id, stage: stageId,
      title: text.title, body: text.body, resumePhase: state.phase,
      choices: stage.choices.map(choice => { const reason = choiceReason(state, thread, choice, services); return { id: choice.id, label: interpolate(choice.label, thread.bindings), detail: interpolate(choice.detail, thread.bindings), disabled: Boolean(reason), reason }; }) };
    state.story.lastPromptBoundary = state.story.boundary;
    state.story.beats++;
    state.phase = 'story';
    emit({ type: 'STORY_SITUATION', title: text.title, message: `${text.title}. ${text.body}`, threadId: thread.id });
  } else {
    if (text.fact) addStoryFact(state, thread.id, text.fact, 'outcome');
    emit({ type: 'STORY_OUTCOME', title: text.title, message: `${text.title}. ${text.body}`, threadId: thread.id });
    applyEffects(state, thread, stage.effects, emit, services);
    schedule(state, thread, stage.next);
  }
  return true;
}

/** Also useful for deterministic scenario fixtures; production uses eligibility. */
export function startStoryThread(state, id, emit = () => {}, services = {}) {
  requireRule(storyEnabled(state) && ['select', 'bombing'].includes(state.phase) && !state.activeCrew && !state.pendingProgress && !state.story.pending, 'Story decisions require a safe V2 boundary.');
  const definition = content(id);
  requireRule(definition && !state.story.threads[id], 'This Story thread is unknown or has already occurred.');
  requireRule(!definition.eligible || definition.eligible(state), 'This Story is not relevant to the current flight.');
  const thread = { id, stage: definition.initial ?? 'start', bindings: { targetName: getBombingTarget(state.mission.targetId).name, ...(definition.bind?.(state) ?? {}) }, choices: [], due: null, resolved: false };
  state.story.threads[id] = thread;
  return enterStage(state, thread, thread.stage, emit, services);
}

export function chooseStory(state, choiceId, emit = () => {}, services = {}) {
  const pending = state.story?.pending;
  requireRule(storyEnabled(state) && state.phase === 'story' && pending && !state.activeCrew && !state.pendingProgress, 'There is no safe Story decision awaiting a choice.');
  const thread = state.story.threads[pending.threadId];
  const choice = content(thread.id)?.stages[pending.stage]?.choices.find(item => item.id === choiceId);
  requireRule(choice, 'Choose one of the current Story options.');
  requireRule(!choiceReason(state, thread, choice, services), choiceReason(state, thread, choice, services));
  state.phase = pending.resumePhase;
  state.story.pending = null;
  thread.choices.push({ id: choice.id, boundary: state.story.boundary });
  const fact = interpolate(choice.fact ?? `${pending.title} — ${choice.label}`, thread.bindings);
  addStoryFact(state, thread.id, fact, 'choice');
  emit({ type: 'STORY_CHOICE', message: fact, threadId: thread.id, choiceId });
  applyEffects(state, thread, choice.effects, emit, services);
  schedule(state, thread, choice.next);
}

export function evaluateStoryBoundary(state, emit = () => {}, services = {}) {
  if (!storyEnabled(state) || state.outcome || !['select', 'bombing'].includes(state.phase) || state.activeCrew || state.pendingProgress || state.story.pending) return false;
  const story = state.story;
  story.boundary++;
  reconcileStory(state, emit);
  for (const condition of [...story.conditions]) if (condition.dueBoundary <= story.boundary) resolveStoryCondition(state, condition.id, condition.expireText ?? 'The temporary situation has passed.', emit, { history: false });
  const atTarget = state.phase === 'bombing' && !state.mission.bombRun;
  const due = Object.values(story.threads).filter(thread => !thread.resolved && thread.due && (thread.due.at === 'target' ? atTarget : thread.due.boundary <= story.boundary))
    .sort((a, b) => Number(b.due.at === 'target') - Number(a.due.at === 'target'));
  // Automatic target acknowledgements must not strand another target thread.
  // Present them in the existing queue; only one may ask for a decision.
  if (atTarget) for (const thread of [...due]) if (thread.due.at === 'target' && !content(thread.id).stages[thread.due.stage].choices) {
    enterStage(state, thread, thread.due.stage, emit, services);
    due.splice(due.indexOf(thread), 1);
  }
  // One developing thread owns this boundary, even when it only resolves silently.
  if (due.length) { enterStage(state, due[0], due[0].due.stage, emit, services); return true; }
  if (story.beats >= 5 || story.boundary - story.lastPromptBoundary < 2 || story.conditions.length >= 3) return false;
  const eligible = storyEligibleThreads(state);
  if (!eligible.length || random(story) > (atTarget ? 0.85 : 0.68)) return false;
  const recent = state.campaign?.priorStoryThreads ?? story.recentThreads;
  const fresh = eligible.filter(thread => !recent.includes(thread.id));
  const selected = weighted(story, fresh.length ? fresh : eligible);
  return startStoryThread(state, selected.id, emit, services);
}

export function finishStory(state, reason, emit = () => {}) {
  if (!state.story || state.story.closed) return;
  const final = reason === 'home' || reason === 'destroyed';
  for (const condition of [...state.story.conditions]) {
    if (final || condition.until === 'turnBack' || condition.until === 'bombed' || condition.modifiers?.bombOfficerBlocked || condition.modifiers?.bombRange) resolveStoryCondition(state, condition.id, reason === 'home' ? 'Returned HOME.' : reason === 'destroyed' ? 'Aircraft lost.' : 'The target was abandoned.', emit, { history: false });
  }
  for (const thread of Object.values(state.story.threads)) if (!thread.resolved && (final || thread.due?.at === 'target')) {
    thread.resolved = true; thread.due = null;
    addStoryFact(state, thread.id, `${interpolate(content(thread.id)?.stages[thread.stage]?.title ?? thread.id, thread.bindings)}: ${final ? 'the flight ended before another development.' : 'target continuation cancelled on Turn Back.'}`, 'closed');
  }
  state.story.pending = null;
  if (final) {
    for (const crew of state.crew.filter(c => c.health === 'dead')) addStoryFact(state, 'crew', `${CREW_DEFS.find(c => c.id === crew.id)?.name ?? crew.id} KIA.`, 'casualty');
    state.story.closed = true;
    addStoryFact(state, 'sortie', reason === 'home' ? 'Returned HOME.' : 'Aircraft lost.', 'end');
  }
}

/** Reject malformed portable snapshots; absence is handled conservatively by migration. */
export function validateStorySnapshot(state) {
  const story = state.story;
  if (!story) return state.phase !== 'story' && !Object.values(state.bags).some(bag => [...bag.tokens, ...bag.discard].some(token => String(token).startsWith('Story:')));
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const whole = value => Number.isSafeInteger(value) && value >= 0;
  if (state.ruleset !== 'v2-continuous' || story.version !== 1 || !whole(story.rng) || story.rng > 0xFFFFFFFF || !whole(story.boundary) || !whole(story.beats) || !Number.isSafeInteger(story.lastPromptBoundary) || !Number.isSafeInteger(story.nextId) || story.nextId < 1 || typeof story.closed !== 'boolean' || !object(story.threads)) return false;
  if (!['conditions', 'recent', 'facts', 'recentThreads'].every(key => Array.isArray(story[key]))) return false;
  if (state.config.v2StoryMode !== true && (story.pending || story.conditions.length)) return false;
  if (!story.recentThreads.every(id => typeof id === 'string') || !story.facts.every(fact => object(fact) && typeof fact.text === 'string' && typeof fact.threadId === 'string' && whole(fact.progress))) return false;
  if (!Object.entries(story.threads).every(([id, thread]) => object(thread) && content(id)?.stages[thread.stage] && thread.id === id && object(thread.bindings) && Array.isArray(thread.choices) && typeof thread.resolved === 'boolean' && (!thread.due || content(id)?.stages[thread.due.stage] && (thread.due.at === 'target' || whole(thread.due.boundary))))) return false;
  if (!story.conditions.every(c => object(c) && typeof c.id === 'string' && typeof c.uid === 'string' && typeof c.title === 'string' && object(c.modifiers) && Array.isArray(c.tokens) && (c.dueBoundary === undefined || whole(c.dueBoundary)))) return false;
  if (new Set(story.conditions.map(c => c.id)).size !== story.conditions.length || new Set(story.conditions.map(c => c.uid)).size !== story.conditions.length) return false;
  const tags = new Set();
  for (const c of story.conditions) { let i = 0; for (const entry of c.tokens) { if (!(entry.bag === 'combat' && ['Hit', 'Miss', 'Burst'].includes(entry.token) || entry.bag === 'mission' && entry.token === 'Enemy') || !Number.isInteger(entry.count) || entry.count < 0 || entry.count > 12) return false; for (let n = 0; n < entry.count; n++) tags.add(`${entry.bag}|Story:${c.uid}:${i++}:${entry.token}`); } }
  for (const [name, bag] of Object.entries(state.bags)) for (const token of [...bag.tokens, ...bag.discard]) if (String(token).startsWith('Story:') && !tags.delete(`${name}|${token}`)) return false;
  // A presentation snapshot may own the just-drawn token between reveal and discard.
  const pending = story.pending;
  if (pending) {
    const stage = content(pending.threadId)?.stages[pending.stage];
    if (state.phase !== 'story' || story.closed || !stage?.choices || !story.threads[pending.threadId] || !['select', 'bombing'].includes(pending.resumePhase) || !Array.isArray(pending.choices) || !pending.choices.length || !pending.choices.every(c => object(c) && stage.choices.some(item => item.id === c.id) && typeof c.label === 'string' && typeof c.detail === 'string' && typeof c.disabled === 'boolean') || typeof pending.id !== 'string' || typeof pending.title !== 'string' || typeof pending.body !== 'string') return false;
  }
  return state.phase !== 'story' || Boolean(pending);
}
