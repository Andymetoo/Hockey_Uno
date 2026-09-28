// Ordinary HTTP + real Chromium. No build or browser-testing dependency required.
// Run: node src/milk-run/tests/browser-check.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame } from '../state.mjs';
import { SAVE_KEY } from '../persistence.mjs';
import { DEFAULT_CONFIG, CONFIG_FIELDS } from '../config.mjs';
import { dispatch } from '../rules.mjs';
import { die } from '../random.mjs';
import { BOARD, CREW_DEFS, STATIONS, ENGINE_CELLS } from '../board.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const artifacts = resolve(root, 'src/milk-run/.checks');
await mkdir(artifacts, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)) throw new Error('Outside root');
    response.setHeader('Content-Type', mime[extname(target)] ?? 'application/octet-stream');
    response.end(await readFile(target));
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9337', `--user-data-dir=${resolve(artifacts, 'browser-profile')}`,
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions',
  '--no-sandbox', '--disable-gpu', 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let launchError, ws;
chrome.on('error', error => { launchError = error; });
const sleep = ms => new Promise(done => setTimeout(done, ms));
const exceptions = [], badResponses = [], sizes = [[1440, 1000], [390, 844], [320, 740], [768, 1024]];
const viewportResults = [];
const boardResults = [];
try {
  let pages;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError;
    try {
      pages = await fetch('http://127.0.0.1:9337/json/list', { signal: AbortSignal.timeout(1000) }).then(r => r.json());
      if (pages.some(p => p.type === 'page')) break;
    } catch { /* Chromium is still starting. */ }
    await sleep(100);
  }
  assert.ok(pages?.some(p => p.type === 'page'), 'Chromium debugging endpoint available');
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP connection timed out')), 5000);
    ws.addEventListener('open', () => { clearTimeout(timer); done(); }, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (task) clearTimeout(task.timer);
      if (message.error) task?.reject(new Error(JSON.stringify(message.error)));
      else task?.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) badResponses.push(message.params.response.url);
  });
  function command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await evaluate(expression)) return;
      await sleep(50);
    }
    throw new Error(`Timed out: ${expression}`);
  }
  async function click(selector) {
    assert.ok(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), `Exists: ${selector}`);
    assert.ok(await evaluate(`!document.querySelector(${JSON.stringify(selector)}).disabled`), `Enabled: ${selector}`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  }
  async function touch(selector) {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'center'})`);
    const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(50);
  }
  async function viewport(width, height) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await command('Emulation.setTouchEmulationEnabled', { enabled: width < 768 });
    await sleep(100);
  }
  async function screenshot(name) {
    const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(resolve(artifacts, `${name}.png`), Buffer.from(result.data, 'base64'));
  }
  const flush = () => evaluate('window.milkRun.flush()');
  const getState = () => evaluate('window.milkRun.getState()');
  async function reload() {
    await evaluate('window.__milkOldPage = true');
    await command('Page.reload');
    await waitFor('!window.__milkOldPage && !!window.milkRun');
  }
  async function inject(state, extra = {}) {
    const session = { version: 1, state, view: state, pending: [], log: [], current: null, speed: 'instant', ...extra };
    await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(JSON.stringify(session))})`);
    await reload();
  }
  async function assertLayout(description) {
    const result = await evaluate(`(() => {
      const board=document.querySelector('svg');
      const r=board?.getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
        board:r?{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right}:null,
        controls:[...document.querySelectorAll('[data-command],[data-crew],[data-ui="choose"]')]
          .filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height;})
          .map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent.trim(),width:r.width,height:r.height};})};
    })()`);
    assert.ok(result.scrollWidth <= result.width + 1, `${description}: document does not overflow horizontally (${result.scrollWidth}/${result.width})`);
    assert.ok(result.board?.width > 200, `${description}: B-17 board stays readable`);
    assert.ok(result.board.x >= -1 && result.board.right <= result.width + 1, `${description}: board fits screen`);
    assert.ok(result.controls.length > 0, `${description}: primary controls visible`);
    assert.ok(result.controls.every(c => c.height >= 43.9 && c.width >= 43.9), `${description}: primary touch targets >=44px: ${JSON.stringify(result.controls.filter(c => c.height < 43.9 || c.width < 43.9))}`);
    viewportResults.push({ description, ...result });
  }
  async function assertBoardMapping(description) {
    const actual = await evaluate(`(() => {
      const number = (element, attribute) => Number(element.getAttribute(attribute));
      return {
        cells: [...document.querySelectorAll('#board [data-cell]')].map(g => {
          const r = g.querySelector('rect'); return { id:g.dataset.cell, x:number(r,'x'), y:number(r,'y'),
            width:number(r,'width'), height:number(r,'height'), fill:r.getAttribute('fill') };
        }),
        crew: [...document.querySelectorAll('#board .crew-marker')].map(g => {
          const c=g.querySelector('circle'),t=g.querySelector('text'),r=t.getBoundingClientRect();
          return {id:g.dataset.crewId,footprint:g.dataset.footprint,number:t.textContent.trim(),
            x:number(c,'cx'),y:number(c,'cy'),circles:g.querySelectorAll('circle').length,
            labels:g.querySelectorAll('text').length,labelHeight:r.height};
        }),
        indicators: [...document.querySelectorAll('#board .engine-indicator')].map(g => ({
          id:g.dataset.engineId,cellId:g.closest('[data-cell]')?.dataset.cell
        }))
      };
    })()`);
    assert.equal(actual.cells.length,144,`${description}: all 144 sub-squares render`);
    assert.equal(new Set(actual.cells.map(c=>c.id)).size,144);
    const cells = new Map(actual.cells.map(c=>[c.id,c])), origin=cells.get('A1-1');
    for(const expected of BOARD) {
      const shown=cells.get(expected.id);
      assert.ok(shown,`${description}: ${expected.id}`);
      assert.equal(shown.x,origin.x+expected.x*origin.width,expected.id);
      assert.equal(shown.y,origin.y+expected.y*origin.height,expected.id);
      assert.equal(shown.width,origin.width);assert.equal(shown.height,origin.height);
    }
    assert.notEqual(cells.get('A3-1').fill,cells.get('A3-2').fill,'section colors divide a main target cell');
    assert.notEqual(cells.get('C4-2').fill,cells.get('C4-3').fill,'corrected waist fill is quarter-specific');
    assert.equal(actual.crew.length,10,`${description}: one visible token per crew member`);
    assert.equal(new Set(actual.crew.map(c=>c.id)).size,10);
    for(const definition of CREW_DEFS) {
      const shown=actual.crew.find(c=>c.id===definition.id),footprint=STATIONS[definition.station].cells;
      assert.ok(shown,definition.id);
      assert.deepEqual(shown.footprint.split(' '),footprint,definition.id);
      assert.equal(shown.number,String(definition.number));
      assert.equal(shown.circles,1);assert.equal(shown.labels,1);
      const midpoint=axis=>footprint.reduce((sum,id)=>sum+cells.get(id)[axis]+origin[axis==='x'?'width':'height']/2,0)/footprint.length;
      assert.equal(shown.x,midpoint('x'),`${definition.id} centered across footprint x`);
      assert.equal(shown.y,midpoint('y'),`${definition.id} centered across footprint y`);
      assert.ok(shown.labelHeight>=8,`${description}: ${definition.id} number stays legible`);
    }
    assert.equal(actual.indicators.length,4);
    for(const indicator of actual.indicators) {
      assert.equal(BOARD.find(c=>c.id===indicator.cellId)?.engineIndicator,indicator.id);
      assert.ok(!ENGINE_CELLS[indicator.id].includes(indicator.cellId),'running token is separate from engine hit footprint');
    }
    boardResults.push({description,quarters:actual.cells.length,crewTokens:actual.crew.length,
      engineIndicators:actual.indicators.length,minimumCrewLabelHeight:Math.min(...actual.crew.map(c=>c.labelHeight))});
  }
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Page.enable');
  const version = await command('Browser.getVersion');
  await command('Page.navigate', { url: `${base}/src/milk-run/index.html` });
  await waitFor('!!window.milkRun');
  await evaluate("localStorage.setItem('unrelated-game-fixture', 'untouched')");

  // The remaining scenario checks use public controls and autosave, as a real player does.
  const safe = createGame({ missionEnemy: 0, missionResource: 100 }, 'browser-sortie');
  for (const [width, height] of sizes) {
    await viewport(width, height);
    await inject(safe);
    await assertLayout(`${width}x${height} ready`);
    await assertBoardMapping(`${width}x${height} exact board`);
    await screenshot(`ready-${width}x${height}`);
    await click('[data-command="startRound"]');
    await flush();
    await assertLayout(`${width}x${height} crew selection`);
    await click('[data-crew="pilot"]');
    await click('[data-ui="activate"]');
    await flush();
    await click('[data-ui="choose"]');
    const dialog = await evaluate(`(() => {const d=document.querySelector('dialog[open]'),r=d?.getBoundingClientRect();return r?{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null;})()`);
    assert.ok(dialog && dialog.x >= -1 && dialog.y >= -1 && dialog.right <= width + 1 && dialog.bottom <= height + 1, `${width}x${height}: action sheet fits viewport`);
    await screenshot(`actions-${width}x${height}`);
    await evaluate("document.querySelector('dialog[open]').close()");
  }

  console.log('Checking real touch, editable rules, and paused event autosave');
  await viewport(390,844);
  await inject(safe);
  await touch('[data-cell="C4-2"]');
  assert.match(await evaluate("document.querySelector('#info-title').textContent"),/C4-2/,'touch identifies exact waist quarter');
  assert.match(await evaluate("document.querySelector('#info-content').textContent"),/Fuselage.*Left Waist/s,'touch explains structure and one crew member');
  await click('#info-dialog [data-ui="close"]');
  await touch('[data-cell="C4-3"]');
  assert.match(await evaluate("document.querySelector('#info-content').textContent"),/Open sky/,'adjacent corrected empty quarter reports no structure');
  await click('#info-dialog [data-ui="close"]');
  await touch('[data-command="startRound"]'); await flush();
  await touch('[data-crew="pilot"]');
  assert.equal((await getState()).slot,0,'touching a crew card only selects it');
  await touch('[data-ui="activate"]'); await flush();
  assert.equal((await getState()).slot,1,'one touch activates exactly once');
  await touch('[data-ui="choose"]');
  await touch('[data-action="wait"]');
  await touch('#choice-form button[type="submit"]'); await flush();
  assert.equal((await getState()).phase,'select');
  assert.equal((await getState()).slot,1,'confirming action does not activate another crew member');

  await click('[data-ui="dev"]');
  for(const field of CONFIG_FIELDS) assert.ok(await evaluate(`!!document.querySelector('#dev-form [name="${field.key}"]')`),`editable rule: ${field.key}`);
  await evaluate(`(() => {const f=document.querySelector('#dev-form');f.elements.namedItem('startingOfficer').value=9;f.elements.namedItem('missionEnemy').value=0;f.elements.namedItem('outboundLength').value=1;f.elements.namedItem('animationMs').value=0;f.elements.namedItem('seed').value='browser-custom-seed';})()`);
  await click('[data-ui="apply-dev"]');
  const customized=await getState();
  assert.equal(customized.seed,'browser-custom-seed');assert.equal(customized.resources.Officer,9);assert.equal(customized.config.missionEnemy,0);assert.equal(customized.config.outboundLength,1);assert.equal(customized.config.animationMs,0);
  assert.equal(await evaluate("document.querySelector('#speed').value"),'instant','zero animation delay selects instant presentation');
  await click('[data-ui="dev"]');await click('[data-ui="reset-defaults"]');await click('[data-ui="apply-dev"]');
  assert.deepEqual((await getState()).config,DEFAULT_CONFIG,'Reset Defaults resets every experimental value');

  let invalidWork=dispatch(createGame({missionEnemy:0},'browser-invalid-work'),{type:'startRound'}).state;
  invalidWork=dispatch(invalidWork,{type:'activate',crewId:'engineer'}).state;
  invalidWork.cells['A3-1']='damaged';invalidWork.cells['C6-2']='damaged';
  await inject(invalidWork);await click('[data-ui="choose"]');await click('[data-action="repair"]');
  await click('[data-select-cell="A3-1"]');await click('[data-select-cell="C6-2"]');
  await click('#choice-form button[type="submit"]');
  assert.deepEqual(await getState(),invalidWork,'invalid disconnected repair does not spend or advance enemies');
  assert.ok(await evaluate("document.querySelector('#action-dialog').open"),'invalid choice keeps action sheet open');
  assert.match(await evaluate("document.querySelector('#action-dialog [role=alert]').textContent"),/connected/i,'action error is visible inside modal');
  assert.equal(await evaluate("document.querySelectorAll('[data-select-cell][aria-pressed=true]').length"),2,'invalid work preserves selection for correction');
  await click('[data-select-cell="C6-2"]');await click('#choice-form button[type="submit"]');await flush();
  assert.equal((await getState()).jobs.length,1,'correcting selection can complete the action');

  let attack=dispatch(createGame({missionEnemy:0,missionResource:100},'browser-attack'),{type:'startRound'}).state;
  attack=dispatch(attack,{type:'activate',crewId:'pilot'}).state;
  attack.fighters=[{id:'browser-fighter',type:'BF-109',hp:2,maxHp:2,quadrant:'Fore',altitude:'High',facing:0}];
  for(let candidate=0;candidate<100000;candidate++) {
    const rng={rng:candidate};
    if(die(rng,6)===6&&die(rng,6)===3&&die(rng,6)===2&&die(rng,4)===2){attack.rng=candidate;break;}
  }
  const attackResult=dispatch(attack,{type:'action',action:'wait'});
  assert.ok(attackResult.events.some(e=>e.type==='FIRE_STARTED'&&e.cellId==='C2-2'),'known critical witness hits pilot square');
  await inject(attackResult.state,{view:attack,pending:attackResult.events,speed:'normal'});
  assert.equal((await getState()).cells['C2-2'],'fire');
  assert.equal(await evaluate("window.milkRun.getView().cells['C2-2']"),'healthy','future damage hidden in restored queue');
  for(let steps=0;steps<10;steps++) {
    await click('[data-ui="step"]');
    if(await evaluate("window.milkRun.exportSession().current?.type==='ENEMY_ATTACK_ROLL'"))break;
  }
  assert.equal(await evaluate("window.milkRun.exportSession().current.type"),'ENEMY_ATTACK_ROLL');
  assert.equal(await evaluate("window.milkRun.getView().cells['C2-2']"),'healthy');
  const pendingBefore=await evaluate('window.milkRun.getQueue().length');
  await reload();
  assert.equal(await evaluate('window.milkRun.getQueue().length'),pendingBefore);
  assert.equal(await evaluate("window.milkRun.exportSession().current.type"),'ENEMY_ATTACK_ROLL','reload preserves exact visible cause');
  await click('[data-ui="step"]');
  assert.equal(await evaluate("window.milkRun.exportSession().current.type"),'ENEMY_HIT_LOCATION');
  assert.ok(await evaluate("!!document.querySelector('[data-cell=\"C2-2\"].struck')"),'hit location highlights selected quarter before damage');
  assert.equal(await evaluate("document.querySelectorAll('#board .strike-ring').length"),1,'exactly one attack quarter is highlighted');
  assert.equal(await evaluate("document.querySelectorAll('#board [data-cell].struck').length"),1,'other quarters remain unstruck');
  await click('[data-ui="step"]');
  assert.equal(await evaluate("window.milkRun.getView().cells['C2-2']"),'damaged');
  assert.equal(await evaluate("window.milkRun.getView().crew.find(c=>c.id==='pilot').health"),'healthy','crew injury has its own later event');
  assert.match(await evaluate("document.querySelector('#action-context').innerText"),/C2-2.*damaged/s,'sticky mobile dock describes the actual event');
  await evaluate("document.querySelector('#board').scrollIntoView({block:'center'})");
  await screenshot('mobile-critical-step');
  await flush();
  assert.deepEqual(await getState(),attackResult.state);
  assert.equal(await evaluate('window.milkRun.exportSession().log.length'),attackResult.events.length);

  console.log('Completing full 10-round sorties through player controls on desktop and phone');
  const sorties=[];
  for(const [width,height] of [[1440,1000],[390,844]]) {
    await viewport(width,height);await inject(safe);
    let current=await getState(), commands=0;
    while(current.phase!=='ended'&&commands<300) {
      if(['ready','roundEnd','bombing'].includes(current.phase)) {
        const type={ready:'startRound',roundEnd:'endRound',bombing:'bomb'}[current.phase];
        await click(`[data-command="${type}"]`);
      } else if(current.phase==='select') {
        const crew=current.crew.find(c=>!c.used&&c.health==='healthy'&&!c.job);
        assert.ok(crew,'select phase offers usable crew');
        await click(`[data-crew="${crew.id}"]`);await click('[data-ui="activate"]');
      } else {
        await click('[data-ui="choose"]');await click('[data-action="wait"]');await click('#choice-form button[type="submit"]');
      }
      await flush();commands++;current=await getState();
      if(commands===60){const before=current;await reload();assert.deepEqual(await getState(),before,'mid-sortie autosave resumes without changing state');}
    }
    assert.equal(current.phase,'ended');assert.equal(current.outcome,'success');assert.equal(current.round,10);assert.equal(current.mission.position,10);assert.equal(current.mission.bombed,true);assert.equal(current.stats.missionDraws,100);
    assert.ok(await evaluate("!document.querySelector('#summary').hidden"),'compact telemetry visible at HOME');
    assert.ok(await evaluate("document.querySelector('#summary').innerText.includes('100')"),'summary includes mission draws');
    await evaluate("document.querySelector('#summary').scrollIntoView({block:'center'})");
    await screenshot(`home-${width}x${height}`);
    sorties.push({width,height,commands,rounds:current.round,missionDraws:current.stats.missionDraws,outcome:current.outcome});
  }

  console.log('Replaying a deterministic sortie with all default combat and mission settings');
  const witness=JSON.parse(await readFile(new URL('./fixtures/baseline-home-witness.json',import.meta.url),'utf8'));
  await viewport(390,844);await inject(createGame({},witness.seed));
  let expected=await getState(), combatCaptured=false;
  for(const move of witness.commands) {
    expected=dispatch(expected,move).state;
    assert.equal(await evaluate(`window.milkRun.send(${JSON.stringify(move)})`),true,`default witness accepts ${JSON.stringify(move)}`);
    await flush();
    // Real-time timestamps belong to each execution; seeded rules and state match exactly.
    const actual=await getState();
    assert.deepEqual({...actual,endedAt:null},{...expected,endedAt:null});
    if(!combatCaptured&&actual.fighters.length&&Object.values(actual.cells).some(s=>s!=='healthy')) {
      await evaluate("document.querySelector('#board').scrollIntoView({block:'center'})");
      await screenshot('default-sortie-combat-phone');combatCaptured=true;
    }
  }
  const baseline=await getState();
  assert.equal(baseline.outcome,'success');assert.equal(baseline.mission.position,10);
  assert.ok(baseline.stats.enemyAttacks>0&&baseline.stats.fightersKilled>0&&baseline.stats.aircraftHits>0,'default witness exercises genuine combat pressure');
  assert.ok(baseline.stats.repairs>0,'default witness completes crisis repair work');
  assert.deepEqual(baseline.config,DEFAULT_CONFIG);
  await evaluate("document.querySelector('#summary').scrollIntoView({block:'start'})");await screenshot('default-sortie-home-phone');
  sorties.push({width:390,height:844,seed:witness.seed,defaultRules:true,commands:witness.commands.length,rounds:baseline.round,...baseline.stats,outcome:baseline.outcome});

  assert.equal(await evaluate("localStorage.getItem('unrelated-game-fixture')"), 'untouched');
  assert.deepEqual(exceptions, [], 'no browser runtime errors');
  assert.deepEqual(badResponses, [], 'all static assets load');
  await writeFile(resolve(artifacts, 'browser-results.json'), JSON.stringify({ browser: version.product, viewportResults, boardResults, sorties, exceptions, badResponses, notes: 'Chromium responsive emulation; physical mobile devices remain a manual check. All 144 quarters, ten unique centered crew markers, engine indicators, exact-quarter mobile touch and hit highlighting checked. Resource-only sorties isolate UI progression; a third committed witness exercises complete default-rules combat, damage, crisis work, and HOME.' }, null, 2));
  console.log(`Browser checks passed at ${sizes.map(([w,h]) => `${w}x${h}`).join(', ')}.`);
} finally {
  ws?.close();
  chrome.kill();
  await new Promise(done => server.close(done));
}
