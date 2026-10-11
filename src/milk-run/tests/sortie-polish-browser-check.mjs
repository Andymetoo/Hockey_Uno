import assert from 'node:assert/strict';
import { openBrowser, sleep } from './browser-harness.mjs';
import { createGame } from '../state.mjs';
import { startStoryThread } from '../story.mjs';
import { beginBombRun } from '../bombing.mjs';
import { createCampaignStore, createCampaign, CAMPAIGN_STORE_KEY } from '../campaign.mjs';
import { dispatch } from '../rules.mjs';
import { fighter } from './fixtures.mjs';
const b = await openBrowser({port:9372,artifactFolder:'sortie-polish'});
const widths=[320,360,390,430,768,1440],checks=[],metrics=[];
const note=message=>{checks.push(message);console.log(message);};
const fresh=()=>createGame({opportunityEnabled:false},'visual-sortie-polish','v2-continuous');
const fit=selector=>b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1})()`);
const close=selector=>b.click(`${selector} [data-ui=close]`);
const frame=selector=>b.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
try{
  for(const width of widths){
    await b.viewport(width,width<768?844:1000);
    const state=fresh();startStoryThread(state,'weather_front');
    await b.inject(state);await b.waitFor("document.querySelector('#story-dialog').open");
    await b.touch('[data-story-choice=enter]');await close('#story-dialog');await b.touch('[data-ui=story-choice]');
    assert.equal(await b.evaluate("document.querySelector('[data-story-choice=enter]').getAttribute('aria-pressed')"),'true');
    assert.equal(await fit('#story-dialog'),true);
    assert.deepEqual(await b.getState(),JSON.parse(JSON.stringify(state)));
    await b.screenshot(`after-story-${width}`);
    await b.touch('[data-ui=story-continue]');await b.flush();
    await b.touch('[data-ui=story-conditions]');assert.equal(await fit('#info-dialog'),true);
    assert.match(await b.evaluate("document.querySelector('#info-content').textContent"),/Resolve \/ expires/);
    await b.screenshot(`after-conditions-${width}`);await close('#info-dialog');
    const bomb=fresh();bomb.config.v2StoryMode=false;bomb.phase='bombing';bomb.mission.position=bomb.config.v2OutboundLength;bomb.resources.Officer=2;beginBombRun(bomb,()=>{});bomb.mission.bombRun.dice=[3,3,4,6];
    await b.inject(bomb);
    for(const [index,slot] of ['course','drift','release'].entries()){
      await b.touch(`[data-bomb-die="${index}"]`);await b.touch(`[data-bomb-slot="${slot}"]`);await b.flush();
    }
    assert.equal(await fit('.bomb-run'),true);
    assert.match(await b.evaluate("document.querySelector('.bomb-total').textContent"),/9\/9.*TARGET DESTROYED/);
    assert.equal(await b.evaluate("document.querySelectorAll('.bomb-slot-distance').length"),3);
    await frame('.bomb-run');await b.screenshot(`after-bomb-${width}`);
    const geometry=await b.evaluate("({height:document.querySelector('.bomb-run').getBoundingClientRect().height,commitVisible:document.querySelector('.bomb-commit').getBoundingClientRect().bottom<innerHeight,documentWidth:document.documentElement.scrollWidth})");
    metrics.push({width,...geometry});
    await b.touch('[data-command=commitBombRun]');await b.flush();
    const ended=await b.getState();ended.phase='ended';ended.outcome='success';ended.mission.position=ended.config.v2OutboundLength+ended.config.v2ReturnLength;ended.endedAt=Date.now();
    await b.inject(ended);await frame('.sortie-result');assert.equal(await fit('.sortie-result'),true);await b.screenshot(`after-home-${width}`);
    ended.outcome='destroyed';ended.mission.position=7;ended.altitude=0;ended.endReason={cause:'altitude'};
    await b.inject(ended);await frame('.sortie-result');assert.equal(await fit('.sortie-result'),true);await b.screenshot(`after-loss-${width}`);
    const noDrop=fresh();noDrop.phase='bombing';noDrop.mission.position=noDrop.config.v2OutboundLength;noDrop.crew.find(c=>c.id==='bombardier').health='injured';beginBombRun(noDrop,()=>{});
    await b.inject(noDrop);await frame('.bomb-run');assert.equal(await fit('.bomb-run'),true);assert.match(await b.evaluate("document.querySelector('.bomb-run').textContent"),/NO DROP/);await b.screenshot(`after-no-drop-${width}`);
    noDrop.mission.position++;await b.inject(noDrop);assert.equal(await b.evaluate("document.querySelector('.bomb-run-return-record').getBoundingClientRect().height<70"),true);await b.touch('.bomb-run-return-record summary');assert.equal(await b.evaluate("document.querySelector('.bomb-run-return-record details').open"),true);assert.ok((await b.evaluate("document.querySelector('.bomb-run-return-record').textContent")).includes(noDrop.mission.bombRun.noDropReason));assert.deepEqual(await b.getState(),JSON.parse(JSON.stringify(noDrop)));await frame('.bomb-run');await b.screenshot(`after-no-drop-record-${width}`);
    const created=createCampaign(createCampaignStore());
    await b.evaluate(`localStorage.setItem(${JSON.stringify(CAMPAIGN_STORE_KEY)},${JSON.stringify(JSON.stringify(created.store))})`);await b.reload();await b.touch('[data-ui=campaign]');assert.equal(await fit('#campaign-dialog'),true);
    if(width===390)metrics.push({width,campaign:await b.evaluate("({firstAircraftTop:document.querySelector('.hangar-card').getBoundingClientRect().top,launchTop:document.querySelector('#campaign-launch-form').getBoundingClientRect().top})")});
    await b.screenshot(`after-hangar-${width}`);await close('#campaign-dialog');
    note(`${width}px: Story select/inspect/reopen/Continue, Conditions, four dice/9-point release, HOME, aircraft loss, exact NO DROP and Hangar fit with no horizontal overflow`);
  }
  // These geometry/focus regressions deliberately use no auto-scrolling touch
  // helper: the production controller owns all framing after action selection.
  await b.viewport(390,640);
  const prepared=crewId=>dispatch(createGame({v2StoryMode:false,v2MissionEnemy:0,v2MissionResource:100,opportunityEnabled:false},'sortie-focus-review','v2-continuous'),{type:'activate',crewId}).state;
  const clustered=prepared('engineer');clustered.fighters=['one','two','three'].map(id=>fighter(id,{hp:4,maxHp:4,engagementRemaining:5}));
  await b.inject(clustered);await b.click('[data-compact-action=basicFire]');await sleep(150);
  await b.evaluate(`(()=>{const e=document.querySelector('#board [data-fighter=one]'),r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.right-3,clientY:r.top+r.height/2}))})()`);await sleep(150);
  assert.ok(await b.evaluate("document.querySelectorAll('[data-target-choice]').length>=2"));
  assert.ok(await b.evaluate("(()=>{const board=document.querySelector('#board').getBoundingClientRect(),dock=document.querySelector('.action-dock').getBoundingClientRect(),status=document.querySelector('#status').getBoundingClientRect();return board.top>=status.bottom&&board.bottom<=dock.top})()"),'Expanded target chooser refits complete board above the controller');
  await b.click('[data-target-choice=two]');await b.click('[data-ui=status-toggle]');await sleep(150);
  assert.ok(await b.evaluate("(()=>{const board=document.querySelector('#board').getBoundingClientRect(),dock=document.querySelector('.action-dock').getBoundingClientRect(),status=document.querySelector('#status').getBoundingClientRect();return board.top>=status.bottom&&board.bottom<=dock.top})()"),'Expanded HUD refits board between status and controller');
  assert.deepEqual(await b.getState(),clustered);
  const converted=prepared('copilot');await b.inject(converted);await b.click('[data-compact-action=convert]');
  await b.evaluate(`(()=>{const select=document.querySelector('#compact-choice select');select.focus();select.value=select.options[1].value;select.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  assert.equal(await b.evaluate("document.activeElement.matches('#compact-choice select[name=to]')"),true,'Compact select retains focus after a choice rerender');
  await b.evaluate("document.querySelector('#compact-choice [data-ui=cancel-target]').focus()");await b.click('#compact-choice [data-ui=cancel-target]');
  assert.equal(await b.evaluate("document.activeElement.dataset.compactAction"),'convert','Cancel returns focus to the originating action');
  assert.deepEqual(await b.getState(),converted);
  const direct=prepared('pilot');direct.fighters=[fighter('space-target',{hp:4,maxHp:4,engagementRemaining:5})];await b.inject(direct);await b.click('[data-compact-action=directFire]');await sleep(150);
  await b.evaluate("scrollTo({top:0,behavior:'instant'});document.querySelector('#board [data-crew-id=engineer]').focus({preventScroll:true})");
  for(const type of ['keyDown','keyUp'])await b.command('Input.dispatchKeyEvent',{type,key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});
  await sleep(150);
  assert.match(await b.evaluate("document.querySelector('#action-context').textContent"),/choose a fighter/i);
  assert.ok(await b.evaluate('scrollY>100'),'Space activates an SVG gunner and preserves framing for the next target stage');
  assert.deepEqual(await b.getState(),direct);
  note('390×640 chooser/HUD expansion preserves complete board; select and Cancel retain keyboard focus; SVG Space advances and frames Direct Fire without changing state');
  const reduced=fresh();startStoryThread(reduced,'weather_front');await b.inject(reduced);await b.waitFor("document.querySelector('#story-dialog').open");
  // Change the OS preference only after the final fixture has loaded. Preference
  // renders may autosave; do not interleave them with injected-save writes.
  await b.command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await b.evaluate("matchMedia('(prefers-reduced-motion:reduce)').matches"),true);
  assert.deepEqual(await b.getState(),reduced,'Changing motion preference preserves the pending Story snapshot');
  assert.equal(await b.evaluate("getComputedStyle(document.querySelector('.story-choice')).transitionDuration"),'0s');
  await b.touch('[data-story-choice=around]');await b.touch('[data-ui=story-continue]');await b.flush();assert.equal((await b.getState()).story.pending,null);
  note('Reduced motion preserves Story selection and commitment with zero choice-transition duration');
  assert.deepEqual(b.exceptions,[]);assert.deepEqual(b.badResponses,[]);
  await b.writeResults({passed:checks.length,widths,checks,metrics,exceptions:b.exceptions,badResponses:b.badResponses});console.log(JSON.stringify({passed:checks.length,metrics},null,2));
}finally{await b.close();}
