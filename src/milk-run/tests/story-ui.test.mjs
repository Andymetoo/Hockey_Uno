import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { DEFAULT_CONFIG, CONFIG_FIELDS } from '../config.mjs';
import { loadDevPreferences, saveDevPreferences, resetDevPreferencesScope, saveSession, loadSession } from '../persistence.mjs';
import { createCampaignStore, createCampaign, prepareCampaignSortie } from '../campaign.mjs';
import { storyIndicatorMarkup, storyConditionsMarkup, storyChoiceMarkup, storyFactsMarkup } from '../story-view.mjs';
import { boardMarkup } from '../board-view.mjs';

const storage = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value), removeItem: key => data.delete(key) }; };
const fresh = () => createGame({}, 'story-ui', 'v2-continuous');
const session = state => ({ version: 1, state, view: structuredClone(state), pending: [{ type: 'CREW_SELECTION_READY', state: structuredClone(state) }], log: [] });
const restore = state => { const saved = storage(); saveSession(session(state), saved); return loadSession(saved); };

test('Story Mode is a V2 boolean default ON for fresh V2 and Campaign sorties', () => {
  assert.equal(DEFAULT_CONFIG.v2StoryMode, true);
  const field = CONFIG_FIELDS.find(field => field.key === 'v2StoryMode');
  assert.equal(field.type, 'boolean'); assert.equal(field.scope, 'v2'); assert.equal(field.label, 'Story Mode');
  assert.equal(fresh().config.v2StoryMode, true);
  const campaign = createCampaign(createCampaignStore());
  const flight = prepareCampaignSortie(campaign.store, campaign.campaign.id, fresh(), { aircraftId: campaign.campaign.currentAircraftId });
  assert.equal(flight.state.config.v2StoryMode, true);
  assert.equal(storyIndicatorMarkup(createGame()), '');
});

test('Story Mode preference is independently persisted and Reset V2 restores ON', () => {
  const saved = storage();
  assert.equal(saveDevPreferences({ v2StoryMode: false, startingOfficer: 6, outboundLength: 9 }, saved), true);
  assert.equal(loadDevPreferences(saved).v2StoryMode, false);
  assert.equal(resetDevPreferencesScope('v2', saved), true);
  const reset = loadDevPreferences(saved);
  assert.equal(reset.v2StoryMode, true); assert.equal(reset.startingOfficer, 6); assert.equal(reset.outboundLength, 9);
});

for (const missing of ['flag', 'director', 'both']) test(`legacy save missing ${missing} conservatively disables Story in every snapshot`, () => {
  const state = fresh();
  if (missing !== 'director') delete state.config.v2StoryMode;
  if (missing !== 'flag') delete state.story;
  const loaded = restore(state); assert.ok(loaded);
  for (const restored of [loaded.state, loaded.view, ...loaded.pending.map(event => event.state)]) {
    assert.equal(restored.config.v2StoryMode, false);
    assert.equal(restored.rng, state.rng); assert.deepEqual(restored.bags, state.bags);
    assert.deepEqual(restored.story, state.story);
  }
});

for (const enabled of [true, false]) test(`explicit saved Story Mode ${enabled} restores exactly`, () => {
  const state = createGame({ v2StoryMode: enabled }, 'story-ui', 'v2-continuous');
  const loaded = restore(state); assert.ok(loaded);
  assert.equal(loaded.state.config.v2StoryMode, enabled);
  assert.deepEqual(loaded.state, state);
});

test('unsupported director schema rejects safely without rewriting original storage', () => {
  const state = fresh(); state.story.version = 999;
  const saved = storage();saveSession(session(state), saved);const before = saved.getItem('milk-run-v3-session-2');
  assert.equal(loadSession(saved), null); assert.equal(saved.getItem('milk-run-v3-session-2'), before);
});

test('missing director cannot silently retain orphan temporary tokens during legacy migration', () => {
  const state = fresh();delete state.story;delete state.config.v2StoryMode;
  state.bags.combat.discard.push('Story:condition-1:0:Miss');
  const saved=storage();saveSession(session(state),saved);
  const before=saved.getItem('milk-run-v3-session-2');
  assert.equal(loadSession(saved),null);assert.equal(saved.getItem('milk-run-v3-session-2'),before);
});

test('Current Conditions explains positive, temporary and repair effects with recent resolutions', () => {
  const state = fresh();
  state.story.conditions = [{ id: 'kit', title: 'Spare medical kit', tone: 'positive', description: 'A sealed kit was found.', effectText: 'Next Medical costs no resource.', resolveText: 'Used or HOME.' },
    { id: 'oxygen', title: 'Oxygen manifold', tone: 'negative', description: 'Fragments cut a hose.', effectText: 'Medical takes +1 Time above Altitude 3.', resolveText: 'Repair C3-2 or descend.', pendingText: 'Another consequence may follow.', repairCell: 'C3-2' }];
  state.story.recent = [{ title: 'Heavy cloud', outcome: 'Clear air at last.' }];
  const before = structuredClone(state), markup = storyConditionsMarkup(state);
  for (const text of ['Spare medical kit', 'Effect', 'Resolve / expires', 'Pending', 'Recent / Resolved', 'Clear air at last.', 'data-story-cell="C3-2"']) assert.ok(markup.includes(text), text);
  assert.match(markup, /story-condition positive/); assert.match(markup, /story-condition negative/);
  assert.match(storyIndicatorMarkup(state), /has-conditions/);assert.match(storyIndicatorMarkup(state), /2 active/);
  assert.match(boardMarkup(state), /data-story-mark="C3-2"/);
  assert.deepEqual(state, before);
});

test('empty conditions remain quiet, disabled Story hides its control, and content is escaped', () => {
  const state = fresh();assert.doesNotMatch(storyIndicatorMarkup(state), /has-conditions/);
  assert.match(storyConditionsMarkup(state), /No active Story conditions/);
  const markup = storyChoiceMarkup({ body: '<script>bad()</script>', choices: [{ id: 'wait', label: 'Wait & listen', detail: 'Keep listening.', disabled: true, reason: 'Radio unavailable' }] });
  assert.doesNotMatch(markup, /<script>/);assert.match(markup, /Wait &amp; listen/);assert.match(markup, /disabled/);assert.match(markup, /Radio unavailable/);
  assert.match(storyFactsMarkup([{ text: '<cloud>', progress: 2 }]), /&lt;cloud&gt;/);
  state.config.v2StoryMode = false;assert.equal(storyIndicatorMarkup(state), '');
});

test('Current Conditions counts only its own temporary tokens in their live bag and discard piles', () => {
  const state=fresh();
  state.story.conditions=[{id:'cloud',uid:'condition-1',title:'Cloud',description:'Cloud surrounds the aircraft.',effectText:'Two temporary MISS tokens.',resolveText:'Clear weather.',tokens:[{bag:'combat',token:'Miss',count:2}]}];
  state.bags.combat.tokens.push('Story:condition-1:0:Miss','Story:condition-10:0:Miss');
  state.bags.combat.discard.push('Story:condition-1:1:Miss','Miss');
  const before=structuredClone(state);
  assert.match(storyConditionsMarkup(state),/Temporary tokens:<\/b> 1 in bag · 1 in discard/);
  assert.deepEqual(state,before);
  state.bags.combat.tokens.push(...state.bags.combat.discard.splice(0));
  assert.match(storyConditionsMarkup(state),/Temporary tokens:<\/b> 2 in bag · 0 in discard/);
  state.story.conditions[0].tokens=[];
  assert.doesNotMatch(storyConditionsMarkup(state),/Temporary tokens:/);
});
