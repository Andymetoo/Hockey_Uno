import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { dispatch, availableActions, resolveAttack, legalWorkPositions } from '../rules.mjs';
import { effectiveTimeThreshold } from '../crew-position.mjs';
import { addStoryCondition, resolveStoryCondition, reconcileStory, storyModifier, storyToken, storyActionCost } from '../story-effects.mjs';
import { startStoryThread, evaluateStoryBoundary, storyEligibleThreads, finishStory } from '../story.mjs';
import { drawBag, refillBag } from '../random.mjs';
import { ResolutionQueue } from '../queue.mjs';
import { saveSession, loadSession, SAVE_KEY } from '../persistence.mjs';
import { createCampaign, createCampaignStore, prepareCampaignSortie, finalizeCampaignSortie, CAMPAIGN_STORE_KEY } from '../campaign.mjs';
import { campaignBackup, parseCampaignBackup, discardActiveCampaignSession } from '../campaign-session.mjs';
import { fighter, collect, rngForDice, rngForIndexes, commitTestBombRun } from './fixtures.mjs';
import { ENGINE_CELLS, BOARD } from '../board.mjs';

const fresh = (config = {}, seed = 'story-regression') => createGame({ opportunityEnabled: false, ...config }, seed, 'v2-continuous');
const memory = () => { const values = new Map(); return { values, getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) }; };
const saved = state => ({ version: 1, presentationVersion: 2, state, view: structuredClone(state), pending: [], current: null, log: [], speed: 'manual', presenting: false });
const roundTrip = state => { const storage = memory(); assert.equal(saveSession(saved(state), storage), true); return loadSession(storage).state; };
const condition = (id, extra = {}) => ({ id, threadId: 'test-thread', title: id, description: 'A stateful test situation.', effectText: 'The specified existing rule changes.', resolveText: 'Ends when the condition resolves.', modifiers: {}, ...extra });
const countTime = state => [...state.bags.mission.tokens, ...state.bags.mission.discard, ...state.timeTokens, ...state.overflowTimeTokens].filter(token => token === 'Time').length;
const countResources = state => state.resources.Officer + state.resources.Enlisted + [...state.bags.mission.tokens, ...state.bags.mission.discard].filter(token => token === 'Resource').length;
const baseTokens = state => Object.fromEntries(Object.entries(state.bags).map(([name, bag]) => [name, [...bag.tokens, ...bag.discard].filter(token => !token.startsWith('Story:')).sort()]));
const person = (state, id) => state.crew.find(crew => crew.id === id);
const acting = (state, crewId = 'radio') => { state.phase = 'action'; state.activeCrew = crewId; Object.assign(person(state,crewId), { used: true, cycleSlotConsumed: true }); return state; };
function checkpoint(state) {
  state = structuredClone(state); state.phase = 'select'; state.activeCrew = null;
  const required = effectiveTimeThreshold(state);
  while (state.timeTokens.length < required) {
    const index = state.bags.mission.tokens.indexOf('Time');
    assert.ok(index >= 0, 'checkpoint fixture requires real available Time');
    state.timeTokens.push(state.bags.mission.tokens.splice(index,1)[0]);
  }
  state.time = state.timeTokens.length; state.pendingProgress = true;
  return dispatch(state, { type: 'continueProgress' });
}

test('Story OFF leaves baseline rules, bags and tactical RNG unchanged at a checkpoint', () => {
  const off = fresh({ v2StoryMode: false }), legacy = structuredClone(off);
  delete legacy.story;
  const a = checkpoint(off), b = checkpoint(legacy);
  assert.deepEqual(a,b);
  assert.equal(a.events.some(event => event.type.startsWith('STORY_')), false);
  assert.equal(addStoryCondition(a.state, condition('disabled', { modifiers: { enemyHit: 5 } })), null);
  assert.equal(storyModifier(a.state,'enemyHit'),0);
});

test('active conditions and their token identities round-trip without changing either RNG', () => {
  const state = fresh();
  addStoryCondition(state, condition('cloud', { duration: 3, modifiers: { enemyHit: 1 }, tokens: [{ bag:'combat',token:'Miss',count:2 }] }));
  assert.deepEqual(roundTrip(state),state);
  assert.equal(storyModifier(roundTrip(state),'enemyHit'),1);
});

test('temporary combat tokens are distinct, attributable and removed from both piles without touching defaults', () => {
  const state = fresh(), base = baseTokens(state), config = structuredClone(state.config);
  const a = addStoryCondition(state,condition('cloud-a',{tokens:[{bag:'combat',token:'Miss',count:2}]}));
  const b = addStoryCondition(state,condition('cloud-b',{tokens:[{bag:'combat',token:'Miss',count:1}]}));
  const tags = state.bags.combat.tokens.filter(token => token.startsWith('Story:'));
  assert.equal(new Set(tags).size,3); assert.ok(tags[0].includes(a.uid)); assert.ok(tags[2].includes(b.uid));
  state.bags.combat.discard.push(state.bags.combat.tokens.splice(state.bags.combat.tokens.indexOf(tags[0]),1)[0]);
  assert.equal(storyToken(tags[0]),'Miss');
  resolveStoryCondition(state,'cloud-a','Visibility opens.');
  assert.deepEqual(baseTokens(state),base);
  assert.deepEqual([...state.bags.combat.tokens,...state.bags.combat.discard].filter(token => token.startsWith('Story:')), [tags[2]]);
  resolveStoryCondition(state,'cloud-b');
  assert.deepEqual(baseTokens(state),base); assert.deepEqual(state.config,config);
  assert.equal(state.story.conditions.length,0); assert.equal(state.story.recent.length,2);
});

test('tagged tokens survive repeated emergency refills and normal refill without duplication', () => {
  const state = fresh(), before = baseTokens(state);
  addStoryCondition(state,condition('visibility',{tokens:[{bag:'combat',token:'Miss',count:2}]}));
  const expected = [...state.bags.combat.tokens].sort();
  for (let pass = 0; pass < 3; pass++) {
    for (let draw = 0; draw < expected.length; draw++) { const { token } = drawBag(state,state.bags.combat); state.bags.combat.discard.push(token); }
    assert.deepEqual([...state.bags.combat.tokens,...state.bags.combat.discard].sort(),expected);
  }
  refillBag(state.bags.combat);
  assert.deepEqual(state.bags.combat.tokens.sort(),expected); assert.equal(state.bags.combat.discard.length,0);
  resolveStoryCondition(state,'visibility'); assert.deepEqual(baseTokens(state),before);
});

test('temporary mission pressure tokens refill and expire without entering physical Time or Resource pools', () => {
  const state = fresh(), before = baseTokens(state), time = countTime(state), resources = countResources(state);
  addStoryCondition(state,condition('pursuit',{tokens:[{bag:'mission',token:'Enemy',count:2}]}));
  const tags = state.bags.mission.tokens.filter(token => token.startsWith('Story:'));
  state.bags.mission.tokens = state.bags.mission.tokens.filter(token => !tags.includes(token));
  state.bags.mission.discard.push(...tags); refillBag(state.bags.mission);
  resolveStoryCondition(state,'pursuit'); assert.deepEqual(baseTokens(state),before);
  assert.equal(countTime(state),time); assert.equal(countResources(state),resources);
  for (const token of ['Time','Resource']) assert.throws(() => addStoryCondition(state,condition(`unsafe-${token}`,{tokens:[{bag:'mission',token,count:1}]})),/Unsupported/);
});

test('next Medical free pays no physical resource, is consumed once and starts ordinary work', () => {
  const state = acting(fresh()); person(state,'pilot').health = 'injured';
  state.resources.Enlisted = 0;
  addStoryCondition(state,condition('medical-kit',{tone:'positive',modifiers:{nextFree:'medical'}}));
  assert.equal(storyActionCost(state,'medical',1),0);
  assert.ok(availableActions(state,'radio').some(action => action.id === 'medical' && action.enabled));
  const resources = countResources(state);
  const result = dispatch(state,{type:'action',action:'medical',targetId:'pilot'});
  assert.equal(result.state.jobs[0].kind,'medical'); assert.equal(result.state.jobs[0].remainingTime,state.config.v2MedicalTime);
  assert.equal(countResources(result.state),resources); assert.equal(result.state.resources.Enlisted,0);
  assert.equal(result.state.story.conditions.some(c => c.id === 'medical-kit'),false);
  assert.equal(storyActionCost(result.state,'medical',1),1);
});

test('temporary enemy to-hit modifier changes the threshold and stops changing it after resolution', () => {
  const state = fresh(), {events,emit} = collect();
  addStoryCondition(state,condition('cloud',{modifiers:{enemyHit:1}}));
  resolveAttack(state,emit,{roll:2,cellId:'A1-1'});
  assert.ok(['miss','off-target'].includes(events.find(event => event.type === 'ENEMY_ATTACK_ROLL').result));
  assert.equal(events.some(event => event.type === 'ENEMY_HIT_LOCATION'),false);
  resolveStoryCondition(state,'cloud');
  const clear = collect(); resolveAttack(state,clear.emit,{roll:2,cellId:'A1-1'});
  assert.equal(clear.events.find(event => event.type === 'ENEMY_ATTACK_ROLL').result,'hit');
});

test('temporary Flak shot modifier applies only while its condition exists', () => {
  function flak(state) {
    state.fighters = ['a','b','c'].map(id => fighter(id,{engagementRemaining:5}));
    const index = state.bags.mission.tokens.indexOf('Enemy');
    state.rng = rngForIndexes([state.bags.mission.tokens.length],[index]);
    return dispatch(state,{type:'activate',crewId:'pilot'});
  }
  const state = fresh(); addStoryCondition(state,condition('corridor',{modifiers:{flakShots:1}}));
  assert.equal(flak(structuredClone(state)).events.filter(event => event.type === 'ENEMY_ATTACK').length,state.config.flakShots+1);
  resolveStoryCondition(state,'corridor');
  assert.equal(flak(state).events.filter(event => event.type === 'ENEMY_ATTACK').length,state.config.flakShots);
});

test('tagged Miss is actually resolved and discarded as a Miss by B-17 gunfire', () => {
  const state = acting(fresh(),'engineer'); state.fighters = [fighter('target',{hp:5,maxHp:5,engagementRemaining:5,facing:180})];
  addStoryCondition(state,condition('cloud',{tokens:[{bag:'combat',token:'Miss',count:1}]}));
  const tag = state.bags.combat.tokens.find(token => token.startsWith('Story:'));
  state.rng = rngForIndexes([state.bags.combat.tokens.length],[state.bags.combat.tokens.indexOf(tag)]);
  const result = dispatch(state,{type:'action',action:'basicFire',targetId:'target'});
  assert.equal(result.events.find(event => event.type === 'GUNNER_SHOT_ROLL').token,'Miss');
  assert.ok(result.state.bags.combat.discard.includes(tag)); assert.equal(result.state.fighters[0].hp,5);
  resolveStoryCondition(result.state,'cloud'); assert.equal(result.state.bags.combat.discard.includes(tag),false);
});

test('repairing the marked aircraft square resolves the condition through ordinary Repair', () => {
  const state = acting(fresh({v2RepairTime:1})); state.cells['B2-4']='damaged';
  addStoryCondition(state,condition('oxygen',{repairCell:'B2-4',modifiers:{jobTime:{medical:1}}}));
  const work = dispatch(state,{type:'action',action:'repair',cells:['B2-4']}).state;
  work.rng = rngForIndexes([work.bags.mission.tokens.length],[work.bags.mission.tokens.indexOf('Time')]);
  const result = dispatch(work,{type:'activate',crewId:'pilot'});
  assert.equal(result.state.cells['B2-4'],'healthy');
  assert.equal(result.state.story.conditions.some(c => c.id === 'oxygen'),false);
  assert.ok(result.state.story.recent.some(c => c.id === 'oxygen' && /Repair/.test(c.outcome)));
});

test('descending to the stated safe altitude resolves the same condition without imaginary oxygen points', () => {
  const state = fresh(); state.cells['B2-4']='damaged';
  addStoryCondition(state,condition('oxygen',{repairCell:'B2-4',altitudeAtMost:3,modifiers:{jobTime:{medical:1}}}));
  state.altitude=3; reconcileStory(state);
  assert.equal(state.story.conditions.length,0); assert.equal(state.cells['B2-4'],'damaged');
});

test('next-Progress threshold modifier conserves physical Time and expires after the intended checkpoint', () => {
  const state = fresh(), time = countTime(state);
  addStoryCondition(state,condition('detour',{duration:1,modifiers:{nextProgress:1}}));
  assert.equal(effectiveTimeThreshold(state),state.config.v2TimePerProgress+1);
  const result = checkpoint(state);
  assert.equal(countTime(result.state),time); assert.equal(result.state.time,0);
  assert.equal(result.state.story.conditions.some(c => c.id === 'detour'),false);
  assert.equal(effectiveTimeThreshold(result.state),state.config.v2TimePerProgress);
});

test('condition lifetime is measured in future Progress boundaries, not crew actions', () => {
  let state = fresh(); addStoryCondition(state,condition('temporary',{duration:2,modifiers:{flakShots:1}}));
  state = checkpoint(state).state;
  assert.ok(state.story.conditions.some(c => c.id === 'temporary'));
  if (state.phase === 'story') state = dispatch(state,{type:'storyChoice',choiceId:state.story.pending.choices.find(c=>!c.disabled).id}).state;
  state = checkpoint(state).state;
  assert.equal(state.story.conditions.some(c => c.id === 'temporary'),false);
});

test('a Story decision cannot be submitted while a presentation sequence owns the UI', () => {
  const queue = new ResolutionQueue({state:fresh(),dispatch}); queue.speed='manual';
  queue.send({type:'activate',crewId:'pilot'});
  assert.equal(queue.busy,true);
  assert.throws(()=>queue.send({type:'storyChoice',choiceId:'enter'}),/sequence/);
  queue.dispose();
});

test('director selection is deterministic, uses its own saved RNG and allows quiet checkpoints', () => {
  const a=fresh(), b=structuredClone(a), tacticalRng=a.rng;
  const first=checkpoint(a), second=checkpoint(b);
  assert.deepEqual(first,second); assert.equal(first.state.rng,tacticalRng);
  let quiet=0, encounters=0;
  for (let i=0;i<20;i++) {
    const result=checkpoint(fresh({},`story-pacing-${i}`));
    if(result.state.story.pending) encounters++; else quiet++;
  }
  assert.ok(quiet>0 && encounters>0,`quiet=${quiet}, encounters=${encounters}`);
});

for (const phase of ['action','opportunity','betweenOpportunity','enemy','roundEnd','ended']) test(`director does not evaluate inside unsafe ${phase} phase`,()=>{
  const state=fresh(); state.phase=phase;
  const before=structuredClone(state), {emit,events}=collect();
  assert.equal(evaluateStoryBoundary(state,emit),false);
  assert.deepEqual(state,before); assert.deepEqual(events,[]);
});

test('director does not prompt while active crew or pending checkpoint still owns the boundary',()=>{
  for(const change of [s=>s.activeCrew='pilot',s=>s.pendingProgress=true]) {
    const state=fresh();change(state);const before=structuredClone(state);
    assert.equal(evaluateStoryBoundary(state),false);assert.deepEqual(state,before);
  }
});

test('one checkpoint opens at most one major prompt, after checkpoint completion, with no choice chain',()=>{
  let found=false;
  for(let i=0;i<12 && !found;i++) {
    const result=checkpoint(fresh({},`story-safe-${i}`));
    const prompts=result.events.filter(e=>e.type==='STORY_SITUATION');
    assert.ok(prompts.length<=1);
    if(!prompts.length)continue;
    found=true;
    assert.ok(result.events.findIndex(e=>e.type==='STORY_SITUATION')>result.events.findIndex(e=>e.type==='PROGRESS_COMPLETED'));
    const pending=result.state.story.pending;
    const choice=dispatch(result.state,{type:'storyChoice',choiceId:pending.choices.find(c=>!c.disabled).id});
    assert.equal(choice.events.filter(e=>e.type==='STORY_SITUATION').length,0);
    assert.equal(choice.state.story.pending,null);
    assert.equal(choice.state.story.beats,1);
  }
  assert.equal(found,true);
});

test('saving a pending authored choice restores its exact text, options and next deterministic consequence',()=>{
  const state=fresh();startStoryThread(state,'weather_front');
  const restored=roundTrip(state);
  assert.deepEqual(restored,state);
  assert.deepEqual(dispatch(restored,{type:'storyChoice',choiceId:'enter'}),dispatch(state,{type:'storyChoice',choiceId:'enter'}));
});

test('weather choices create recognizable different continuations and never reroll after reload',()=>{
  const state=fresh();startStoryThread(state,'weather_front');
  const cloud=dispatch(state,{type:'storyChoice',choiceId:'enter'}).state;
  const detour=dispatch(state,{type:'storyChoice',choiceId:'around'}).state;
  assert.ok(cloud.story.conditions.some(c=>c.id==='heavy_cloud'));
  assert.ok(detour.story.conditions.some(c=>c.id==='weather_detour'));
  assert.equal(detour.story.threads.weather_front.due.stage,'clear_coast');
  assert.notEqual(cloud.story.threads.weather_front.due.stage,detour.story.threads.weather_front.due.stage);
  const restored=roundTrip(cloud);
  assert.deepEqual(checkpoint(restored),checkpoint(cloud));
  assert.ok(cloud.story.facts.some(f=>/Entered heavy cloud/.test(f.text)));
});

test('a delayed engine gamble waits the saved N boundaries and preserves its preselected outcome',()=>{
  let state=fresh();const cell=ENGINE_CELLS[state.engines[0].id][0];state.cells[cell]='damaged';
  startStoryThread(state,'rough_engine');state=dispatch(state,{type:'storyChoice',choiceId:'push'}).state;
  state.story.threads.rough_engine.due.boundary=state.story.boundary+2;
  const branch=state.story.threads.rough_engine.due.stage, restored=roundTrip(state);
  const first=checkpoint(restored).state;
  assert.equal(first.story.threads.rough_engine.stage,'knock');assert.equal(first.story.threads.rough_engine.due.stage,branch);
  if(first.phase==='story')assert.fail('a new prompt was chained ahead of the delayed engine report');
  const second=checkpoint(first).state;
  assert.equal(second.story.threads.rough_engine.stage,branch);
  assert.deepEqual(checkpoint(roundTrip(first)).state,second);
});

test('rough-engine content has good, manageable and failed outcomes across deterministic seeds',()=>{
  const outcomes=new Set();
  for(let i=0;i<30;i++) {
    const state=fresh({},`engine-gamble-${i}`);state.cells[ENGINE_CELLS[state.engines[0].id][0]]='damaged';
    startStoryThread(state,'rough_engine');
    outcomes.add(dispatch(state,{type:'storyChoice',choiceId:'push'}).state.story.threads.rough_engine.due.stage);
  }
  assert.deepEqual([...outcomes].sort(),['failed','settled','worse']);
});

test('state eligibility uses real engine damage, wounds, altitude and return-leg condition',()=>{
  const state=fresh(), ids=s=>storyEligibleThreads(s).map(t=>t.id);
  assert.equal(ids(state).includes('rough_engine'),false);
  state.cells[ENGINE_CELLS[state.engines[0].id][0]]='damaged';assert.equal(ids(state).includes('rough_engine'),true);
  state.engines[0].running=false;assert.equal(ids(state).includes('rough_engine'),false);
  assert.equal(ids(state).includes('medical_locker'),false);
  person(state,'ball').health='injured';assert.equal(ids(state).includes('medical_locker'),true);
  assert.equal(ids(state).includes('homeward_sea'),false);state.mission.bombed=true;assert.equal(ids(state).includes('homeward_sea'),true);
  assert.equal(ids(state).includes('weather_front'),false);
  state.cells[BOARD.find(c=>c.fuselage).id]='damaged';state.altitude=3;assert.equal(ids(state).includes('oxygen_line'),false);
  state.altitude=4;assert.equal(ids(state).includes('oxygen_line'),true);
});

test('Story-created engine inspection uses actual safe work, completes on two future Time and releases its worker',()=>{
  let state=fresh();const cell=ENGINE_CELLS[state.engines[0].id][0];state.cells[cell]='damaged';
  startStoryThread(state,'rough_engine');
  const resources=countResources(state);state=dispatch(state,{type:'storyChoice',choiceId:'inspect'}).state;
  const job=state.jobs.find(j=>j.storyThreadId==='rough_engine');
  assert.ok(job);assert.equal(job.kind,'repair');assert.equal(job.remainingTime,2);assert.deepEqual(job.cells,[cell]);
  assert.equal(countResources(state),resources);assert.equal(person(state,job.crewId).job,job.id);
  assert.ok(job.workPosition.length>0);
  for(const crewId of ['pilot','copilot']) {
    state.rng=rngForIndexes([state.bags.mission.tokens.length],[state.bags.mission.tokens.indexOf('Time')]);
    state=dispatch(state,{type:'activate',crewId}).state;
    if(crewId==='pilot')state=dispatch(state,{type:'action',action:'wait'}).state;
  }
  assert.equal(state.cells[cell],'healthy');assert.equal(state.jobs.length,0);assert.equal(person(state,job.crewId).job,null);
});

test('weather reaching TARGET gates Bomb Run before rolling and limits only paid rerolls until bombing completes',()=>{
  let state=fresh();startStoryThread(state,'weather_front');state.story.rng=rngForIndexes([5],[3]);
  state=dispatch(state,{type:'storyChoice',choiceId:'enter'}).state;
  assert.equal(state.story.threads.weather_front.due.stage,'deeper');
  state=checkpoint(state).state;state.mission.position=state.config.v2OutboundLength-1;
  const target=checkpoint(state);
  assert.equal(target.state.phase,'story');assert.equal(target.state.story.pending.stage,'target');assert.equal(target.state.mission.bombRun,undefined);
  state=dispatch(target.state,{type:'storyChoice',choiceId:'through'}).state;
  assert.equal(state.phase,'bombing');assert.equal(state.mission.bombRun.freeRerollAvailable,true);
  assert.throws(()=>dispatch(state,{type:'rerollBombDie',dieIndex:0,source:'officer'}),/prevent Officer-resource rerolls/i);
  state=dispatch(state,{type:'rerollBombDie',dieIndex:0,source:'free'}).state;
  assert.equal(state.mission.bombRun.freeRerollUsed,true);
  state=commitTestBombRun(state).state;
  assert.equal(state.story.conditions.some(c=>['heavy_cloud','cloud_target'].includes(c.id)),false);
  assert.equal(state.bags.combat.tokens.some(t=>t.startsWith('Story:')),false);
});

test('Turn Back cancels target continuations and removes temporary target/cloud tokens while retaining the remembered choice',()=>{
  const c=createCampaign(createCampaignStore());let {state}=prepareCampaignSortie(c.store,c.campaign.id,fresh(),{aircraftId:c.campaign.currentAircraftId});
  startStoryThread(state,'weather_front');state.story.rng=rngForIndexes([5],[3]);state=dispatch(state,{type:'storyChoice',choiceId:'enter'}).state;
  state=checkpoint(state).state;
  assert.equal(state.story.threads.weather_front.due.at,'target');
  state=dispatch(state,{type:'turnBack',confirmed:true}).state;
  assert.equal(state.story.threads.weather_front.due,null);assert.equal(state.story.conditions.some(c=>c.id==='heavy_cloud'),false);
  assert.equal([...state.bags.combat.tokens,...state.bags.combat.discard].some(t=>t.startsWith('Story:')),false);
  assert.ok(state.story.facts.some(f=>/Entered heavy cloud/.test(f.text)));
});

for(const loss of [false,true])test(`${loss?'aircraft loss':'HOME'} removes active conditions/tokens, closes delayed threads and finalizes Story facts once`,()=>{
  const c=createCampaign(createCampaignStore());let {state,store}=prepareCampaignSortie(c.store,c.campaign.id,fresh(),{aircraftId:c.campaign.currentAircraftId});
  startStoryThread(state,'weather_front');state=dispatch(state,{type:'storyChoice',choiceId:'enter'}).state;
  if(loss){state.altitude=1;state.engines.forEach(e=>e.running=false);state.rng=rngForDice([1]);}
  else{state.mission.bombed=true;state.mission.position=state.config.v2OutboundLength+state.config.v2ReturnLength-1;}
  const result=checkpoint(state);state=result.state;
  assert.equal(state.outcome,loss?'destroyed':'success');assert.equal(state.story.closed,true);
  assert.equal(state.story.conditions.length,0);assert.equal(state.story.pending,null);
  assert.ok(Object.values(state.story.threads).every(thread=>thread.resolved && !thread.due));
  assert.equal(Object.values(state.bags).some(bag=>[...bag.tokens,...bag.discard].some(t=>t.startsWith('Story:'))),false);
  const finalized=finalizeCampaignSortie(store,state,result.events);
  assert.ok(finalized.record.storyFacts.some(f=>/Entered heavy cloud/.test(f.text)));
  assert.ok(finalized.record.storyFacts.some(f=>loss?/Aircraft lost/.test(f.text):/Returned HOME/.test(f.text)));
  assert.ok(finalized.record.storyThreads.includes('weather_front'));
  assert.equal(finalizeCampaignSortie(finalized.store,state).finalized,false);
});

test('portable Campaign backup includes pending Story and Dev Discard records none of its facts',()=>{
  const c=createCampaign(createCampaignStore());let {state,store}=prepareCampaignSortie(c.store,c.campaign.id,fresh(),{aircraftId:c.campaign.currentAircraftId});
  startStoryThread(state,'weather_front');state=dispatch(state,{type:'storyChoice',choiceId:'around'}).state;
  const session=saved(state), backup=campaignBackup(store,session), parsed=parseCampaignBackup(JSON.stringify(backup));
  assert.deepEqual(parsed.activeSession.state,JSON.parse(JSON.stringify(state)));
  const storage=memory();storage.setItem(CAMPAIGN_STORE_KEY,JSON.stringify(store));storage.setItem(SAVE_KEY,JSON.stringify(session));
  const result=discardActiveCampaignSession(store,state.campaign.campaignId,state.campaign.sortieId,true,storage);
  assert.deepEqual(result.store,c.store);assert.equal(storage.getItem(SAVE_KEY),null);
  assert.equal(result.store.campaigns[0].sorties.length,0);
});

test('a finalized Campaign remembers signature threads for the next fresh director without tactical bonuses',()=>{
  const c=createCampaign(createCampaignStore());let {state,store}=prepareCampaignSortie(c.store,c.campaign.id,fresh(),{aircraftId:c.campaign.currentAircraftId});
  startStoryThread(state,'weather_front');state=dispatch(state,{type:'storyChoice',choiceId:'around'}).state;
  state.phase='ended';state.outcome='success';state.mission.bombed=true;finishStory(state,'home');
  const completed=finalizeCampaignSortie(store,state);
  const pristine=fresh(), next=prepareCampaignSortie(completed.store,c.campaign.id,pristine,{aircraftId:c.campaign.currentAircraftId}).state;
  assert.ok(next.campaign.priorStoryThreads.includes('weather_front'));
  for(const key of ['bags','crew','engines','cells','resources','config'])assert.deepEqual(next[key],pristine[key]);
  assert.deepEqual(next.story.conditions,[]);assert.deepEqual(next.story.facts,[]);
});

test('Story boundary, choice, tagged mission draw, work and target snapshots all persist exactly at every semantic beat',t=>{
  let snapshots=0;
  const verify=(before,result)=>{
    const storage=memory(), session={...saved(result.state),view:before,pending:result.events};
    assert.equal(saveSession(session,storage),true);
    assert.deepEqual(loadSession(storage),JSON.parse(JSON.stringify(session)));
    for(const event of result.events) {
      assert.deepEqual(roundTrip(event.state),JSON.parse(JSON.stringify(event.state)),event.type);snapshots++;
    }
    return result.state;
  };
  let state=fresh();startStoryThread(state,'weather_front');state.story.rng=rngForIndexes([5],[3]);
  state=verify(state,dispatch(state,{type:'storyChoice',choiceId:'enter'}));
  state=verify(state,checkpoint(state));
  state.mission.position=state.config.v2OutboundLength-1;
  state=verify(state,checkpoint(state));
  state=verify(state,dispatch(state,{type:'storyChoice',choiceId:'through'}));
  state=verify(state,dispatch(state,{type:'rerollBombDie',dieIndex:0,source:'free'}));
  state=verify(state,commitTestBombRun(state));

  state=fresh();addStoryCondition(state,condition('pressure',{tokens:[{bag:'mission',token:'Enemy',count:1}]}));
  const tag=state.bags.mission.tokens.find(token=>token.startsWith('Story:'));
  state.rng=rngForIndexes([state.bags.mission.tokens.length],[state.bags.mission.tokens.indexOf(tag)]);
  state.deck={cards:['BF-109'],discard:[]};
  const drawn=dispatch(state,{type:'activate',crewId:'pilot'});
  const reveal=drawn.events.find(e=>e.type==='MISSION_TOKEN_DRAWN');
  assert.equal(reveal.token,'Enemy');assert.equal(reveal.state.bags.mission.discard.includes(tag),false);
  state=verify(state,drawn);assert.ok(state.bags.mission.discard.includes(tag));
  resolveStoryCondition(state,'pressure');assert.equal(state.bags.mission.discard.includes(tag),false);

  state=fresh();state.cells[ENGINE_CELLS[state.engines[0].id][0]]='damaged';startStoryThread(state,'rough_engine');
  state=verify(state,dispatch(state,{type:'storyChoice',choiceId:'inspect'}));
  for(const crewId of ['pilot','copilot']) {
    state.rng=rngForIndexes([state.bags.mission.tokens.length],[state.bags.mission.tokens.indexOf('Time')]);
    state=verify(state,dispatch(state,{type:'activate',crewId}));
    if(crewId==='pilot')state=verify(state,dispatch(state,{type:'action',action:'wait'}));
  }
  assert.equal(state.jobs.length,0);
  assert.ok(snapshots>40);t.diagnostic(`${snapshots} Story-enabled semantic snapshots round-tripped exactly, including an in-flight tagged token before discard.`);
});

test('automatic target acknowledgements cannot strand the weather decision or roll Bomb Run dice too early',()=>{
  let state=fresh();startStoryThread(state,'weather_front');state.story.rng=rngForIndexes([5],[3]);
  state=dispatch(state,{type:'storyChoice',choiceId:'enter'}).state;state=checkpoint(state).state;
  state.mission.position=5;state.cells[BOARD.find(c=>c.section==='Fuselage').id]='damaged';
  startStoryThread(state,'hydraulic_damage');state=dispatch(state,{type:'storyChoice',choiceId:'hold'}).state;
  state.mission.position=7;const target=checkpoint(state);
  assert.equal(target.events.filter(e=>e.type==='STORY_OUTCOME'&&e.threadId==='hydraulic_damage').length,1);
  assert.equal(target.events.filter(e=>e.type==='STORY_SITUATION').length,1);
  assert.equal(target.state.story.pending.threadId,'weather_front');assert.equal(target.state.mission.bombRun,undefined);
  assert.equal(target.state.story.threads.hydraulic_damage.resolved,true);
});

test('a Story duration discount that makes assisted work zero completes immediately and releases both workers',()=>{
  let state=acting(fresh());state.cells['B2-4']='damaged';
  state=dispatch(state,{type:'action',action:'repair',cells:['B2-4']}).state;
  const job=state.jobs[0];assert.equal(job.remainingTime,4);
  addStoryCondition(state,condition('tools',{modifiers:{jobTime:{repair:-2}}}));
  acting(state,'engineer');
  const result=dispatch(state,{type:'action',action:'assistWork',jobId:job.id,workCellId:legalWorkPositions(state,'engineer',job.cells)[0].id});
  assert.equal(result.state.jobs.length,0);assert.equal(result.state.cells['B2-4'],'healthy');
  assert.equal(person(result.state,'radio').job,null);assert.equal(person(result.state,'engineer').job,null);
  assert.equal(result.events.filter(e=>e.type==='WORK_COMPLETED').length,1);
});

test('a delivered oxygen follow-up removes stale Pending copy while its real repair condition remains',()=>{
  let state=fresh();state.cells[BOARD.find(c=>c.fuselage).id]='damaged';startStoryThread(state,'oxygen_line');
  state=dispatch(state,{type:'storyChoice',choiceId:'stay'}).state;
  assert.ok(state.story.conditions.find(c=>c.id==='oxygen_leak').pendingText);
  state=checkpoint(state).state;
  assert.ok(state.story.conditions.find(c=>c.id==='oxygen_leak'));
  assert.equal(state.story.conditions.find(c=>c.id==='oxygen_leak').pendingText,undefined);
  assert.equal(state.story.threads.oxygen_line.resolved,true);
});

test('real Progress refills tagged combat discard and the next expiration removes only its own tokens',()=>{
  let state=fresh();state.story.beats=5;
  const base=baseTokens(state),time=countTime(state);
  addStoryCondition(state,condition('brief-weather',{duration:2,tokens:[{bag:'combat',token:'Miss',count:2}]}));
  const tag=state.bags.combat.tokens.find(t=>t.startsWith('Story:'));
  state.bags.combat.discard.push(state.bags.combat.tokens.splice(state.bags.combat.tokens.indexOf(tag),1)[0]);
  state=checkpoint(state).state;
  assert.ok(state.bags.combat.tokens.includes(tag));assert.equal(state.bags.combat.discard.length,0);
  assert.equal(state.bags.combat.tokens.filter(t=>t.startsWith('Story:')).length,2);
  assert.deepEqual(baseTokens(state),base);assert.equal(countTime(state),time);
  state=checkpoint(state).state;
  assert.equal(state.bags.combat.tokens.some(t=>t.startsWith('Story:')),false);
  assert.deepEqual(baseTokens(state),base);assert.equal(countTime(state),time);
});

test('weather and bomb-door continuations respect a lost Bombardier function and leave the actual NO DROP rule in charge',()=>{
  for(const threadId of ['weather_front','hydraulic_damage']) {
    let state=fresh();
    if(threadId==='weather_front') {
      startStoryThread(state,threadId);state.story.rng=rngForIndexes([5],[3]);
      state=dispatch(state,{type:'storyChoice',choiceId:'enter'}).state;state=checkpoint(state).state;
    } else {
      state.mission.position=5;state.cells[BOARD.find(c=>c.section==='Fuselage').id]='damaged';
      startStoryThread(state,threadId);state=dispatch(state,{type:'storyChoice',choiceId:'hold'}).state;
    }
    person(state,'bombardier').health='dead';state.mission.position=7;
    const target=checkpoint(state);state=target.state;
    assert.equal(state.phase,'select');assert.equal(state.mission.bombingResult,'no-drop');assert.equal(state.mission.bombRun.dice.length,0);
    assert.equal(state.story.pending,null);assert.equal(target.events.some(e=>e.type==='STORY_SITUATION'),false);
    assert.equal(state.story.conditions.some(c=>['heavy_cloud','door_pressure'].includes(c.id)),false);
    assert.equal(target.events.some(e=>e.type==='STORY_OUTCOME'&&/doors open cleanly|hold them there/i.test(e.message)),false);
    if(threadId==='hydraulic_damage')assert.ok(state.story.facts.some(f=>/missing Bombardier function prevented a drop/.test(f.text)));
    else assert.ok(state.story.facts.some(f=>/unmanned Bombardier function prevented a drop/.test(f.text)));
  }
});

test('hostile damage stopping a pushed engine supersedes its gamble without inventing crew repair or success',()=>{
  for(const branch of ['settled','worse','failed']) {
    let state=fresh();const engineId=state.engines[0].id;state.cells[ENGINE_CELLS[engineId][0]]='damaged';
    startStoryThread(state,'rough_engine');state=dispatch(state,{type:'storyChoice',choiceId:'push'}).state;
    state.story.threads.rough_engine.due.stage=branch;state.engines.find(e=>e.id===engineId).running=false;
    const result=checkpoint(state);
    assert.equal(result.state.story.threads.rough_engine.stage,'overtaken');
    assert.equal(result.state.story.conditions.some(c=>c.id==='engine_gamble'),false);
    const facts=result.state.story.facts.filter(f=>f.kind==='outcome');
    assert.ok(facts.some(f=>/stopped before the delayed report/.test(f.text)));
    assert.equal(facts.some(f=>/averted|repaired|settled without|gamble paid off/i.test(f.text)),false);
  }
});

test('a lucky route continuation claims one real Time, advances jobs once and records Story rather than a fighter kill',()=>{
  let state=fresh();person(state,'navigator').health='injured';startStoryThread(state,'uncertain_landmarks');state.story.rng=rngForIndexes([5],[0]);
  state=dispatch(state,{type:'storyChoice',choiceId:'follow'}).state;
  assert.equal(state.story.threads.uncertain_landmarks.due.stage,'shortcut');
  acting(state,'radio');state.cells['B2-4']='damaged';
  state=dispatch(state,{type:'action',action:'repair',cells:['B2-4']}).state;
  const physicalTime=countTime(state),remaining=state.jobs[0].remainingTime,result=checkpoint(state);
  assert.equal(countTime(result.state),physicalTime);assert.equal(result.state.time,1);
  assert.equal(result.state.jobs[0].remainingTime,remaining-1);
  assert.equal(result.events.filter(e=>e.type==='STORY_TIME_TAKEN').length,1);
  assert.equal(result.events.filter(e=>e.type==='WORK_TIME_ADVANCED').length,1);
  assert.equal(result.events.some(e=>e.type==='FIGHTER_KILL_TIME_TAKEN'),false);
});

test('aborting Story inspection leaves the damage real and its later report remembers the interruption',()=>{
  let state=fresh();const cell=ENGINE_CELLS[state.engines[0].id][0];state.cells[cell]='damaged';
  startStoryThread(state,'rough_engine');state=dispatch(state,{type:'storyChoice',choiceId:'inspect'}).state;
  const worker=state.jobs[0].crewId;state=dispatch(state,{type:'abortWork',jobId:state.jobs[0].id}).state;
  assert.equal(state.cells[cell],'damaged');assert.equal(person(state,worker).job,null);
  state=checkpoint(state).state;
  assert.equal(state.story.threads.rough_engine.stage,'inspection_interrupted');
  assert.ok(state.story.facts.some(f=>/inspection.*interrupted before/.test(f.text)));
});
