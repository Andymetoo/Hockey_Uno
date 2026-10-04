import assert from 'node:assert/strict';
import { openBrowser } from './browser-harness.mjs';

const label = process.argv[2] ?? 'after';
const b = await openBrowser({ port: 9359, artifactFolder: `long-session-${label}` });
try {
  await b.evaluate(`(async () => {
    window.MILK_RUN_PROFILE = true;
    window.samples = (await import('./performance.mjs')).performanceSamples;
    window.rules = await import('./rules.mjs');
    window.writes = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      const start = performance.now(); original.call(this, key, value);
      writes.push({bytes:value.length * 2, ms:performance.now()-start});
    };
    milkRun.restart({v2StoryMode:true, v2MissionEnemy:0, v2MissionResource:0,
      v2MissionTime:10, v2TimePerProgress:10, v2CrewCycleRefreshGrantsTime:false,
      opportunityEnabled:false, presentationSpeed:'manual'}, 'MR-PERF-STORY', 'v2-continuous');
    document.querySelector('#log-details').open = true;
    window.nextStressCommand = s => {
      if (s.phase === 'story') return {type:'storyChoice',choiceId:s.story.pending.choices.find(c=>!c.disabled).id};
      if (s.phase === 'bombing') { const run=s.mission.bombRun, slot=['course','drift','release'].find(k=>run.placement[k]===null);
        return slot?{type:'placeBombDie',slot,dieIndex:[0,1,2,3].find(i=>!Object.values(run.placement).includes(i))}:{type:'commitBombRun'}; }
      if (s.phase === 'action') return {type:'action',action:'wait'};
      if (s.phase === 'select') return {type:'activate',crewId:rules.availableCrew(s)[0].id};
      if (s.phase === 'opportunity') return {type:'continueEnemyPhase'};
      return {type:'continueProgress'};
    };
  })()`);
  const points = [];
  for (const turns of [10, 50, 79, 100, 110]) {
    await b.evaluate('samples.length=0; writes.length=0');
    while (await b.evaluate(`milkRun.getState().stats.turns < ${turns} && !milkRun.getState().outcome`)) {
      await b.evaluate(`(() => { for(let i=0;i<10;i++) {
        const s=milkRun.getState(); if(s.stats.turns>=${turns}||s.outcome)break;
        if(!milkRun.send(nextStressCommand(s)))throw Error('Stress command rejected'); milkRun.flush();
      } })()`);
    }
    const point = await b.evaluate(`(() => {
      const s=milkRun.exportSession();
      const metric = label => { const rows=samples.filter(x=>x.label===label).map(x=>x.ms).sort((a,b)=>a-b);
        return {n:rows.length,mean:rows.reduce((a,b)=>a+b,0)/(rows.length||1),p95:rows[Math.floor(rows.length*.95)]??0}; };
      return {turns:s.state.stats.turns,progress:s.state.mission.position,log:s.log.length,
        storyFacts:s.state.story.facts.length,storyThreads:Object.keys(s.state.story.threads).length,
        pending:s.pending.length,dom:document.querySelectorAll('*').length,rows:document.querySelectorAll('#event-log li').length,
        command:metric('command'),render:metric('render'),recorder:metric('recorder'),autosave:metric('autosave'),presentation:metric('presentation'),
        writes:writes.length,bytes:writes.at(-1)?.bytes,storageMs:writes.reduce((n,w)=>n+w.ms,0),
        snapshotBytes:JSON.stringify(s.state).length}; })()`);
    await b.command('Performance.enable');
    const metrics = await b.command('Performance.getMetrics');
    point.memory = Object.fromEntries(metrics.metrics.filter(m=>['JSHeapUsedSize','JSEventListeners','Nodes'].includes(m.name)).map(m=>[m.name,m.value]));
    points.push(point);
  }
  const before = await b.evaluate('milkRun.exportSession()');
  assert.equal(before.state.stats.turns, 110);
  assert.ok(before.state.story.facts.length > 0);
  await b.reload();
  const after = await b.evaluate('milkRun.exportSession()');
  assert.deepEqual(after.state, before.state);
  assert.deepEqual(after.log, before.log);
  assert.deepEqual(after.pending, before.pending);
  if (label !== 'before') {
    assert.ok(points.every(p=>p.rows<=200), 'Recorder DOM stays bounded');
    assert.ok(points.at(-1).render.mean < points[0].render.mean*4+10, 'No large late-session render regression');
    await b.evaluate(`document.querySelector('#log-details').open=true`);
    const seen=[];
    for (;;) {
      seen.push(...await b.evaluate(`[...document.querySelectorAll('#event-log .log-raw summary')].map(e=>Number(e.textContent.match(/\\d+/)[0]))`));
      if(await b.evaluate(`document.querySelector('[data-ui="log-older"]').disabled`))break;
      await b.click('[data-ui="log-older"]');
    }
    assert.deepEqual(seen.sort((a,b)=>a-b),before.log.map(e=>e.sequence));
  }
  assert.deepEqual(b.exceptions, []); assert.deepEqual(b.badResponses, []);
  await b.writeResults({label,points,checks:5,historyPreserved:true});
  console.log(JSON.stringify({label,points}, null, 2));
} finally { await b.close(); }
