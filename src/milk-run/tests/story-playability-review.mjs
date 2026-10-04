/** Human-review aid, not a balance test: seeded full sorties with a visible-state
 * greedy tactical policy and varying Story decisions. Never inspects future RNG
 * or alters aircraft state. Run with [number of seeds, default 24]. */
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { BOARD, CREW_DEFS, STATIONS } from '../board.mjs';
import { dispatch, availableCrew, availableActions, legalTargets, isAtStation,
  eligibleCrisisTargets, eligibleMedicalTargets, legalWorkPositions, opportunityAvailability, conversionOptions } from '../rules.mjs';
import { scoreBombDie } from '../bombing-targets.mjs';
import { STORY_CONTENT_COUNTS } from '../story-content.mjs';

const crewDef = id => CREW_DEFS.find(c => c.id === id);
const threat = f => (f.facing === 0 && !f.disrupted ? 40 : 0) + (f.hp === 1 ? 35 : 10 / f.hp);
const ranked = (s, id) => legalTargets(s, id).sort((a, b) => threat(b) - threat(a));
const cockpit = s => s.crew.filter(c => c.health === 'healthy' && ['pilot', 'copilot'].includes(c.station) && isAtStation(s, c));

function actionFor(s, id) {
  const options = new Set(availableActions(s, id).filter(a => a.enabled).map(a => a.id));
  const choices = [];
  const add = (action, score, extra = {}) => options.has(action) && choices.push({ command: { type: 'action', action, ...extra }, score });
  const target = ranked(s, id)[0];
  if (target) {
    add('basicFire', 52 + threat(target), { targetId: target.id });
    add('advancedFire', 56 + threat(target) + (target.hp > 1 ? 12 : -8), { targetId: target.id });
  }
  const seats = cockpit(s), solePilot = seats.length === 1 && seats[0].id === id;
  if (!solePilot) {
    for (const kind of ['fireControl', 'repair']) if (options.has(kind)) {
      for (const cell of eligibleCrisisTargets(s, kind)) {
        const positions = legalWorkPositions(s, id, [cell.id]);
        if (!positions.length) continue;
        const score = (kind === 'fireControl' ? 77 : 27) + (s.compromised.includes(cell.section) ? 22 : 0)
          + (cell.engine ? 13 : 0) + (s.story.conditions.some(c => c.repairCell === cell.id) ? 30 : 0)
          - (s.jobs.length >= 3 ? 40 : 0);
        add(kind, score, { cells: [cell.id], workCellId: positions[0].id });
      }
    }
    if (options.has('medical')) for (const target of eligibleMedicalTargets(s, id)) {
      const positions = legalWorkPositions(s, id, target.position);
      if (positions.length) add('medical', (['pilot', 'engineer', 'bombardier', 'radio'].includes(target.id) ? 96 : 67) - (s.jobs.length >= 3 ? 40 : 0), { targetId: target.id, workCellId: positions[0].id });
    }
  }
  if (!seats.length && options.has('manCockpit')) for (const stationId of ['pilot', 'copilot']) {
    if (STATIONS[stationId].cells.every(cell => s.cells[cell] !== 'fire') && !s.crew.some(c => c.id !== id && c.health === 'healthy' && c.station === stationId)) {
      add('manCockpit', crewDef(id).rank === 'Officer' ? 160 : 135, { stationId });
    }
  }
  const engine = s.engines.find(e => !e.running && BOARD.filter(c => c.engine === e.id).every(c => s.cells[c.id] === 'healthy'));
  if (engine) add('restartEngine', 78, { targetId: engine.id });
  add('escort', s.fighters.length ? 103 : 42);
  const exchange = conversionOptions(s).find(c => c.to === 'Enlisted' && c.enabled);
  if (exchange) add('convert', s.resources.Enlisted < 3 ? 100 : 10, { to: 'Enlisted' });
  const hunter = s.fighters.filter(f => f.facing < 180 && !f.disrupted).sort((a, b) => threat(b) - threat(a))[0];
  if (hunter) add('rotateFighter', 25 + threat(hunter), { targetId: hunter.id });
  add('returnHome', 36);
  add('wait', 0);
  return choices.sort((a, b) => b.score - a.score)[0];
}

function bombCommand(s) {
  const run = s.mission.bombRun;
  let best;
  for (let c = 0; c < 4; c++) for (let d = 0; d < 4; d++) for (let r = 0; r < 4; r++) {
    if (new Set([c, d, r]).size !== 3) continue;
    const slots = { course: c, drift: d, release: r };
    const score = Object.entries(slots).reduce((n, [slot, index]) => n + scoreBombDie(run.dice[index], run.target.ranges[slot]), 0);
    if (!best || score > best.score) best = { score, slots };
  }
  const slot = Object.keys(best.slots).find(key => run.placement[key] !== best.slots[key]);
  return slot ? { type: 'placeBombDie', slot, dieIndex: best.slots[slot] } : { type: 'commitBombRun' };
}

function commandFor(s, policy) {
  if (s.phase === 'story') {
    const options = s.story.pending.choices.filter(c => !c.disabled);
    // Alternate cautious/committed choices across seeds, based only on visible options.
    const index = policy % 3 === 0 ? 0 : policy % 3 === 1 ? options.length - 1 : s.story.beats % options.length;
    return { type: 'storyChoice', choiceId: options[index].id };
  }
  if (s.phase === 'bombing') return bombCommand(s);
  const opportunity = opportunityAvailability(s);
  if (opportunity.enabled) {
    const shots = opportunity.gunners.flatMap(c => ranked(s, c.id).map(f => ({ gunnerId: c.id, f }))).sort((a, b) => threat(b.f) - threat(a.f));
    if (shots.length) return { type: 'opportunityShot', gunnerId: shots[0].gunnerId, targetId: shots[0].f.id };
  }
  if (s.phase === 'betweenOpportunity') return { type: s.pendingProgress ? 'continueProgress' : 'continueBetweenOpportunity' };
  if (s.phase === 'opportunity') return { type: 'continueEnemyPhase' };
  if (s.phase === 'progressOpportunity') return { type: 'continueProgress' };
  if (s.phase === 'action') return actionFor(s, s.activeCrew).command;
  if (s.phase === 'select') {
    const choices = availableCrew(s).map(c => ({ id: c.id, score: actionFor(s, c.id).score + (!s.fighters.length ? ({ engineer: 25, ball: 20 })[c.id] ?? 0 : 0) })).sort((a, b) => b.score - a.score);
    return choices.length ? { type: 'activate', crewId: choices[0].id } : { type: 'advanceUnavailable' };
  }
  throw new Error(`Unhandled review phase ${s.phase}`);
}

export function reviewSortie(index) {
  const seed = `story-review-${index}`;
  let state = createGame({}, seed, 'v2-continuous');
  const actions = {}, beats = [], conditions = [];
  const nativeTotals = s => {
    const mission = [...s.bags.mission.tokens, ...s.bags.mission.discard];
    return { resources: mission.filter(t => t === 'Resource').length + s.resources.Officer + s.resources.Enlisted,
      time: mission.filter(t => t === 'Time').length + s.timeTokens.length + s.overflowTimeTokens.length,
      enemy: mission.filter(t => t === 'Enemy').length,
      combat: [...s.bags.combat.tokens, ...s.bags.combat.discard].filter(t => !String(t).startsWith('Story:')).sort() };
  };
  const initialTotals = nativeTotals(state);
  let commands = 0;
  for (; !state.outcome && commands < 1800; commands++) {
    const command = commandFor(state, index);
    const result = dispatch(state, command);
    assert.deepEqual(nativeTotals(result.state), initialTotals, `${seed}: physical token conservation after ${command.type}`);
    if (command.action) actions[command.action] = (actions[command.action] ?? 0) + 1;
    for (const event of result.events) {
      if (['STORY_SITUATION', 'STORY_OUTCOME', 'STORY_CHOICE'].includes(event.type)) beats.push({ progress: result.state.mission.position, boundary: result.state.story.boundary, type: event.type, thread: event.threadId, text: event.message });
      if (event.type === 'STORY_CONDITION_STARTED') {
        const c = (event.state ?? result.state).story.conditions.find(c => c.id === event.conditionId);
        conditions.push({ id: event.conditionId, title: c?.title, tone: c?.tone ?? 'neutral', modifiers: c?.modifiers ?? {}, progress: result.state.mission.position });
      }
    }
    state = result.state;
  }
  return { seed, policy: ['first available', 'last available', 'alternate'][index % 3], outcome: state.outcome, commands,
    turns: state.stats.turns, progress: state.mission.position, altitude: state.altitude,
    crewLost: state.crew.filter(c => c.health === 'dead').map(c => c.id), actions,
    decisions: beats.filter(b => b.type === 'STORY_SITUATION').length,
    outcomes: beats.filter(b => b.type === 'STORY_OUTCOME').length,
    threads: Object.keys(state.story.threads), facts: state.story.facts, beats, conditions, conservationChecks: commands };
}

const count = Number(process.argv[2] ?? 24);
const sorties = Array.from({ length: count }, (_, index) => reviewSortie(index));
const average = key => +(sorties.reduce((n, s) => n + s[key], 0) / sorties.length).toFixed(2);
const summary = { content: STORY_CONTENT_COUNTS, seeds: sorties.length, completed: sorties.filter(s => s.outcome).length,
  returned: sorties.filter(s => s.outcome === 'success').length, lost: sorties.filter(s => s.outcome === 'destroyed').length,
  decisionRange: [Math.min(...sorties.map(s => s.decisions)), Math.max(...sorties.map(s => s.decisions))],
  averageDecisions: average('decisions'), averageOutcomes: average('outcomes'),
  positiveConditions: sorties.flatMap(s => s.conditions).filter(c => c.tone === 'positive').length,
  allConditions: sorties.flatMap(s => s.conditions).length,
  conservationChecks: sorties.reduce((n, s) => n + s.conservationChecks, 0),
  familiesSeen: [...new Set(sorties.flatMap(s => s.threads))],
  actionCounts: sorties.reduce((all, s) => { for (const [key, count] of Object.entries(s.actions)) all[key] = (all[key] ?? 0) + count; return all; }, {}),
  note: 'Greedy visible-state policy, unmodified defaults, real dispatch and hazards. These are playability examples, not a win-rate or balance claim.' };
console.log(JSON.stringify(summary, null, 2));
const directory = new URL('../.checks/story-review/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('sorties.json', directory), `${JSON.stringify({ summary, sorties }, null, 2)}\n`);
