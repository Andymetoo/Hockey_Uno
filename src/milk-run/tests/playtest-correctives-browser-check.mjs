import assert from 'node:assert/strict';
import { openBrowser } from './browser-harness.mjs';
import { createGame } from '../state.mjs';
import { dispatch } from '../rules.mjs';

const b=await openBrowser({port:9360,artifactFolder:'playtest-correctives'}), checks=[];
try {
  const launch=async()=>{
    await b.click('[data-ui="new-sortie"]');
    await b.click('#sortie-form input[value="v2-continuous"]');
    const seed=await b.evaluate(`document.querySelector('#sortie-form').elements.seed.value`);
    await b.click('#sortie-form button[type="submit"]');
    assert.equal((await b.getState()).seed,seed);return seed;
  };
  await b.evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);
  const first=await launch(),second=await launch();assert.notEqual(first,second);assert.match(second,/^MR-/);
  await b.reload();assert.equal((await b.getState()).seed,second);
  checks.push('Two ordinary UI launches have distinct fresh seeds; reload preserves seed');
  await b.click('[data-ui="dev"]');
  assert.equal(await b.evaluate(`document.querySelector('[name=v2AircraftSpecificCrits]').checked`),false);
  assert.equal(await b.evaluate(`document.querySelector('[name=v2BadlyDamagedBreakoff]').checked`),false);
  await b.evaluate(`document.querySelector('#dev-form').elements.seed.value='MANUAL-REPLAY';
    for(const key of ['v2AircraftSpecificCrits','v2BadlyDamagedBreakoff'])document.querySelector('#dev-form').elements[key].checked=true;`);
  await b.click('[data-ui="apply-dev"]');await b.click('#sortie-form button[type="submit"]');
  const manual=await b.getState();assert.equal(manual.seed,'MANUAL-REPLAY');
  assert.equal(manual.config.v2AircraftSpecificCrits,true);assert.equal(manual.config.v2BadlyDamagedBreakoff,true);
  await b.reload();assert.deepEqual(await b.getState(),manual);
  checks.push('Dev manual seed and both experiment switches survive launch/reload; defaults OFF');
  await b.evaluate(`window.downloaded=null;window.exportBlob=null;
    const original=URL.createObjectURL; URL.createObjectURL=function(blob){window.exportBlob=blob;return original.call(this,blob)};
    HTMLAnchorElement.prototype.click=function(){window.downloaded=this.download};
    document.querySelector('#log-details').open=true;`);
  await b.click('[data-ui="export"]');
  const exported=await b.evaluate(`(async()=>({filename:downloaded,json:JSON.parse(await exportBlob.text())}))()`);
  assert.ok(exported.filename.includes(manual.seed));assert.equal(exported.json.metadata.seed,manual.seed);
  assert.deepEqual(exported.json.state,manual);
  checks.push('Actual download contains authoritative seed in filename, metadata and state');

  for(const width of [320,360,390,430,768,1440]) {
    await b.viewport(width,width<768?844:1000);
    for(const unavailable of [false,true]) {
      let s=createGame({opportunityEnabled:false,v2MissionEnemy:0,v2MissionResource:0,v2MissionTime:10},'assist-contrast','v2-continuous');
      s.cells['B2-4']='damaged';s.phase='action';s.activeCrew='radio';
      s=dispatch(s,{type:'action',action:'repair',cells:['B2-4']}).state;
      if(unavailable)s.crew.forEach(c=>c.cycleSlotConsumed=true);
      await b.inject(s);
      const result=await b.evaluate(`(()=>{
        const el=document.querySelector('.job-assist-note'),style=getComputedStyle(el),bg=getComputedStyle(el.closest('.active-job'));
        const luminance=rgb=>{const v=rgb.match(/[\\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return v[0]*.2126+v[1]*.7152+v[2]*.0722};
        const a=luminance(style.color),z=luminance(bg.backgroundColor),r=el.getBoundingClientRect();
        return {contrast:(Math.max(a,z)+.05)/(Math.min(a,z)+.05),text:el.textContent,font:parseFloat(style.fontSize),
          overflow:document.documentElement.scrollWidth>innerWidth,inside:r.left>=0&&r.right<=innerWidth};
      })()`);
      assert.ok(result.contrast>=4.5,`${width}: contrast ${result.contrast}`);assert.ok(result.font>=10);
      assert.equal(result.overflow,false);assert.equal(result.inside,true);
      assert.equal(result.text.includes('unavailable'),unavailable);
      await b.evaluate(`document.querySelector('#active-jobs').scrollIntoView({block:'center',behavior:'instant'})`);
      await b.screenshot(`assist-${width}-${unavailable?'unavailable':'available'}`);
    }
    checks.push(`${width}px: available/unavailable Assist contrast, text and no overflow`);
  }
  assert.deepEqual(b.exceptions,[]);assert.deepEqual(b.badResponses,[]);
  await b.writeResults({checks,passed:checks.length});console.log(JSON.stringify({checks,passed:checks.length}));
} finally {await b.close();}
