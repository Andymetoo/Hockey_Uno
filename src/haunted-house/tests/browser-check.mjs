// Real Chromium smoke test against compiled files on an ordinary HTTP server.
// Run `npm run build:haunted` first. CHROME_PATH may select another Chromium binary.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame } from '../generation.ts';
import { act, previewAttack, restartState } from '../game.ts';
import { REWARD_DEFINITIONS } from '../item-definitions.ts';
import { solve } from '../solver.ts';
import { SAVE_KEY, LEGACY_KEYS, COMPLETIONS_KEY } from '../persistence.ts';
import { baseFixture, addHaunting, addSupply, addConnection, position, markTile } from './fixtures.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const artifacts = resolve(root, '.haunted-checks');
await mkdir(artifacts, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)) throw new Error('Outside root');
    response.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
console.log(`Static browser check: ${base}`);
const chrome = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${resolve(artifacts, 'smoke-profile')}`,
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions',
  // The surrounding Windows tool sandbox otherwise blocks Chromium's renderer startup.
  // This dedicated profile only opens the local test server.
  '--no-sandbox', '--disable-gpu', 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let launchError;
chrome.on('error', error => { launchError = error; });
const sleep = ms => new Promise(done => setTimeout(done, ms));
let ws;
const exceptions = [], badResponses = [], viewportResults = [];
try {
  let pages;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (launchError) throw launchError;
    try { pages = await fetch('http://127.0.0.1:9333/json/list', { signal: AbortSignal.timeout(1000) }).then(r => r.json()); if (pages.some(p => p.type === 'page')) break; } catch {}
    await sleep(100);
  }
  assert.ok(pages?.some(p => p.type === 'page'), 'Chromium debugging endpoint is available');
  console.log('Chromium connected');
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((done, reject) => { const timer = setTimeout(() => reject(new Error('CDP connection timed out')), 5000); ws.addEventListener('open', () => { clearTimeout(timer); done(); }, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id); pending.delete(message.id); if (task) clearTimeout(task.timer);
      if (message.error) task?.reject(new Error(JSON.stringify(message.error))); else task?.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) badResponses.push(message.params.response.url);
  });
  function command(method, params = {}) { return new Promise((resolve, reject) => { const id = ++nextId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 8000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); }); }
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let attempt = 0; attempt < 1200; attempt++) { if (await evaluate(expression)) return; await sleep(50); }
    throw new Error(`Timed out: ${expression}`);
  }
  async function navigate(path, ready) {
    await command('Page.navigate', { url: `${base}${path}` });
    await waitFor(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete' && (${ready})`);
  }
  async function click(selector) {
    assert.ok(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), selector);
    assert.ok(await evaluate(`!document.querySelector(${JSON.stringify(selector)}).disabled`), `Enabled: ${selector}`);
    await evaluate(`(() => { const target = document.querySelector(${JSON.stringify(selector)}); target.focus({preventScroll:true}); target.click(); })()`);
  }
  const action = name => click(`[data-action="${name}"]`);
  const readState = () => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)}))`);
  async function reload() {
    await evaluate('window.__hauntedSmokeOldPage = true');
    await command('Page.reload');
    await waitFor('!window.__hauntedSmokeOldPage && !!document.querySelector("[data-action=new]")');
  }
  async function inject(state) {
    await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(JSON.stringify(state))})`);
    await reload(); await action('continue');
  }
  async function key(key, autoRepeat = false) {
    const virtual = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Escape: 27, Enter: 13, Tab: 9, ' ': 32 }[key] ?? key.toUpperCase().charCodeAt(0);
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: virtual, autoRepeat });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: virtual });
  }
  async function screenshot(name) {
    const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(resolve(artifacts, `${name}.png`), Buffer.from(result.data, 'base64'));
  }
  const tileSelector = (x, y) => `[data-action=tile][data-x="${x}"][data-y="${y}"]`;
  const tileClick = (x, y) => click(tileSelector(x, y));
  const queued = () => evaluate('document.querySelector("[data-action=flare]").getAttribute("aria-pressed") === "true"');
  const selectedEnemy = () => evaluate('!!document.querySelector(".hh-tile.is-haunting[aria-selected=true]")');
  async function closeDialog() { if (await evaluate('!!document.querySelector("dialog[open]")')) await action('close-dialog'); }
  async function showRoom(id) {
    await closeDialog(); await action('rooms'); await click(`[data-action=room][data-id="${id}"]`);
  }
  async function useAbility(ability) {
    await action(ability); await click(`[data-action=use-ability][data-ability="${ability}"]`);
  }
  async function fromMenu(name) { await action('menu'); await action(name); }
  async function sameGame(expected, reason) {
    assert.deepEqual(await readState(), JSON.parse(JSON.stringify(expected)), reason);
  }
  async function touch(selector) {
    const p = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(50);
  }
  async function viewport(width, height) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 900 });
    await sleep(100);
  }
  async function layout() {
    return evaluate(`(() => {
      const box = selector => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right} : null; };
      return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,scrollX,scrollY,
        board:box(".hh-board-scroll"),strip:box(".hh-ability-strip"),combat:box(".hh-combat-panel"),player:box(".hh-player-panel"),enemy:box(".hh-enemy-panel"),
        tile:box(".hh-tile"), flare:box("[data-action=flare]")};
    })()`);
  }
  function assertFits(l, description) {
    assert.ok(l.scrollWidth <= l.width + 1, `${description}: no horizontal document scrolling (${l.scrollWidth}/${l.width})`);
    assert.ok(l.scrollHeight <= l.height + 1, `${description}: no vertical document scrolling (${l.scrollHeight}/${l.height})`);
    for (const name of ['board', 'strip', 'combat', 'player', 'enemy']) {
      assert.ok(l[name], `${description}: ${name} exists`);
      assert.ok(l[name].y >= -1 && l[name].bottom <= l.height + 1, `${description}: ${name} stays visible ${JSON.stringify(l[name])}`);
      assert.ok(l[name].x >= -1 && l[name].right <= l.width + 1, `${description}: ${name} does not clip horizontally`);
    }
    assert.ok(l.tile.width >= 31.9 && l.tile.height >= 31.9, `${description}: board retains >=32px targets`);
    assert.ok(l.flare.width >= 43.9 && l.flare.height >= 43.9, `${description}: frequent ability retains >=44px target`);
  }
  async function assertPreview(game, enemy, mode) {
    const p = previewAttack(game, enemy, mode);
    const meters = await evaluate(`Array.from(document.querySelectorAll("[data-meter]")).map(e=>({meter:e.dataset.meter,current:Number(e.dataset.current),max:Number(e.dataset.max),loss:Number(e.dataset.loss),text:e.textContent,aria:e.getAttribute("aria-label")}))`);
    const player = meters.find(m => m.meter === 'player-health');
    const light = meters.find(m => m.meter === 'light');
    const target = meters.find(m => m.meter === 'enemy-health');
    assert.ok(player && light && target, 'player HP/light and enemy HP expose accessible numerical meters');
    assert.equal(player.current, game.resources.health); assert.equal(player.max, game.resources.maxHealth);
    assert.equal(player.loss, Math.min(game.resources.health, p.incoming), 'player damage is immediate exchange before recovery');
    assert.equal(light.current, game.resources.light); assert.equal(light.loss, p.lightCost);
    assert.equal(target.current, enemy.hp); assert.equal(target.loss, Math.min(enemy.hp, p.damage));
    assert.ok(player.text.includes(`${game.resources.health}/${game.resources.maxHealth}`), 'exact current/max player HP remains visible');
    assert.ok(target.text.includes(`${enemy.hp}/${enemy.maxHp}`), 'exact current/max enemy HP remains visible');
    return p;
  }
  async function assertFighterRows(description) {
    assert.ok(await evaluate(`Array.from(document.querySelectorAll(".hh-fighter")).every(panel => {
      const box=panel.getBoundingClientRect(), rows=Array.from(panel.children).map(c=>c.getBoundingClientRect()).filter(r=>r.height>0);
      return rows.every((r,i)=>r.left>=box.left-1 && r.right<=box.right+1 && r.top>=box.top-1 && r.bottom<=box.bottom+1 && (!i || rows[i-1].bottom<=r.top+1));
    })`), `${description}: fighter rows do not overlap or clip`);
  }
  async function assertDialogActions(names, description, includeClose=true) {
    for (const name of includeClose ? [...names,'close-dialog'] : names) {
      const result = await evaluate(`(() => {
        const dialog=document.querySelector('dialog'), footer=dialog.querySelector('footer'), control=footer.querySelector('[data-action="${name}"]');
        if(!control) return null; const r=control.getBoundingClientRect(), d=dialog.getBoundingClientRect();
        return {inContent:!!control.closest('.hh-dialog-content'),top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,width:r.width,dialogTop:d.top,dialogBottom:d.bottom,viewportHeight:innerHeight,viewportWidth:innerWidth};
      })()`);
      assert.ok(result, `${description}: ${name} is in persistent footer`);
      assert.equal(result.inContent,false, `${description}: ${name} is outside scrolling content`);
      assert.ok(result.top>=result.dialogTop-1 && result.bottom<=result.dialogBottom+1 && result.top>=-1 && result.bottom<=result.viewportHeight+1 && result.left>=-1 && result.right<=result.viewportWidth+1, `${description}: ${name} is visible without scrolling ${JSON.stringify(result)}`);
      assert.ok(result.height>=43.9 && result.width>=43.9, `${description}: ${name} has usable touch target`);
    }
  }
  function exitFixture() {
    const game=baseFixture();game.runId='browser-exit-diary-regression';game.seed='exit-diary-regression';game.player={...game.entrance};
    game.objective={kind:'diary',title:'Bring the diary into the morning',description:'Recover the diary and return to the entrance.',completed:false};game.inventory=['diary'];
    addHaunting(game,{name:'Wisp left in the hall',kind:'wisp',hp:17,maxHp:17,attack:4});
    addSupply(game,'food');addSupply(game,'candle',{position:position(2,4)});addSupply(game,'treasure',{position:position(3,4)});
    addConnection(game,{opened:false,gate:'moth-key',name:'Optional moth-marked storeroom'});game.rooms[0].discovered[4*7+5]=false;
    return game;
  }
  async function exitChecks() {
    console.log('Checking explicit entrance completion, optional cleanup, touch, keyboard and completion persistence');
    const countFor=id=>evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(COMPLETIONS_KEY)}) || '[]').filter(r=>r.runId===${JSON.stringify(id)}).length`);
    const focus=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).focus({preventScroll:true})`);
    for(const [width,height] of [[390,700],[320,568],[667,375]]) {
      await viewport(width,height);const game=exitFixture();await inject(game);const before=await layout();assertFits(before,`${width}x${height} ready entrance`);
      assert.ok(await evaluate(`!!document.querySelector('${tileSelector(1,1)} .hh-icon-exit')`),'standing player retains visible entrance marker');
      assert.match(await evaluate(`document.querySelector('${tileSelector(1,1)}').getAttribute('aria-label')`),/entrance|leave|exit options/i,'entrance has specific completion label');
      assert.match(await evaluate('document.querySelector("[data-action=objective]").innerText'),/Exit/,'ready objective has discoverable Exit control');
      await command('Emulation.setTouchEmulationEnabled',{enabled:true});
      await touch(tileSelector(4,3));await touch('[data-action=flare]');assert.equal(await queued(),true);
      await evaluate(`window.__staleExitEnemy=document.querySelector('${tileSelector(4,3)}')`);
      await touch(tileSelector(1,1));await sameGame(game,'touch entrance opens completion without taking a turn');
      assert.equal(await queued(),false);assert.equal(await selectedEnemy(),false,'entrance clears stale actionable enemy');
      assert.equal(await evaluate('document.querySelector("dialog").dataset.modal'),'exit');
      await assertDialogActions(['leave','keep-exploring'],`${width}x${height} exit decisions`,false);
      assert.match(await evaluate('document.querySelector("[data-action=leave]").innerText'),/diary/i,'completion names the actual objective item');
      assert.match(await evaluate('document.querySelector("dialog").innerText'),/optional/i,'remaining exploration and spirits are explicitly optional');
      assert.equal(await evaluate('document.querySelector("[data-action=leave]").disabled'),false,'living Wisp, unused supplies, unknown tiles and closed optional gate do not block exit');
      await evaluate('window.__staleExitLeave=document.querySelector("[data-action=leave]")');
      await screenshot(`exit-ready-${width}x${height}`);
      await touch('[data-action=keep-exploring]');await sameGame(game,'Keep exploring is free and does not consume supplies');
      assert.equal(await evaluate('!!document.querySelector("dialog[open]")'),false);
      assert.equal(await evaluate('document.activeElement.dataset.action'),'tile','Keep exploring returns focus to entrance tile');
      await evaluate('window.__staleExitEnemy.click();window.__staleExitLeave.click()');await sameGame(game,'stale enemy and Leave nodes cannot commit after closing');
      const after=await layout();assert.deepEqual(after.board,before.board);assert.equal(after.scrollY,0);assert.equal(after.scrollX,0);
      if(width===390) {await touch(tileSelector(1,1));await touch('[data-action=leave]');}
      else {await focus(tileSelector(1,1));await key('Enter');await sameGame(game,'keyboard entrance inspection is free');await focus('[data-action=leave]');await key('Enter');}
      const won=act(game,{type:'leave'}).state;await sameGame(won,'one deliberate Leave activation ends exactly one turn');
      assert.equal(won.status,'won');assert.equal(won.hauntings[0].hp,17);assert.equal(won.connections[0].opened,false);
      assert.equal(await countFor(game.runId),1,'one completion record per attempt');
      await screenshot(`exit-completed-${width}x${height}`);
      await command('Emulation.setTouchEmulationEnabled',{enabled:false});
      await closeDialog();await action('undo');await sameGame(game,'undo restores exact pre-exit adventure');
      await reload();await action('continue');await sameGame(game,'reload of undone exit preserves all remaining content');
      assert.equal(await selectedEnemy(),false);assert.equal(await queued(),false);
      await action('objective');await assertDialogActions(['leave','keep-exploring'],'ready header Exit shortcut',false);await action('leave');
      await sameGame(won,'re-entering completion uses same legal action');assert.equal(await countFor(game.runId),1,'re-ending updates same record');
      await reload();await action('continue');await sameGame(won,'completed save reload is exact');assert.equal(await countFor(game.runId),1,'completed reload never duplicates awards');
    }
    await viewport(390,700);
    const away=exitFixture();away.player=position(3,3);away.runId='browser-exit-diary-away';await inject(away);
    await tileClick(1,1);await sameGame(away,'entrance inspection away from it is free');await assertDialogActions(['return','keep-exploring'],'moving to entrance is distinct',false);
    assert.ok(await evaluate('!document.querySelector("[data-action=leave]") || document.querySelector("[data-action=leave]").disabled'),'cannot leave remotely');
    await action('return');const arrived=act(away,{type:'move',to:away.entrance}).state;await sameGame(arrived,'move to entrance costs one turn');
    assert.equal(arrived.status,'active');assert.equal(await evaluate('document.querySelector("dialog").dataset.modal'),'exit','arrival keeps explicit Leave choice open');
    await assertDialogActions(['leave','keep-exploring'],'arrival choices remain visible',false);await action('keep-exploring');await sameGame(arrived,'arriving never forces completion');
    await action('rooms');await action('exit-controls');await action('leave');await sameGame(act(arrived,{type:'leave'}).state,'room selector also reaches explicit completion');
    for(const kind of ['diary','escape','keepsake']) {
      const missing=exitFixture();missing.runId=`browser-exit-missing-${kind}`;missing.objective.kind=kind;missing.inventory=kind==='keepsake'?['keepsake']:[];
      if(kind==='keepsake'){missing.objective.altar=position(1,4);markTile(missing,missing.objective.altar,{kind:'altar'});}
      await inject(missing);await tileClick(1,1);assert.equal(await evaluate('document.querySelector("[data-action=leave]").disabled'),true,`${kind}: genuine missing prerequisite blocks completion`);
      const explanation=await evaluate('document.querySelector("dialog").innerText');assert.match(explanation,kind==='diary'?/diary/i:kind==='escape'?/key/i:/memorial|locket/i);
      await evaluate('document.querySelector("[data-action=leave]").click()');await sameGame(missing,'disabled Leave cannot bypass objective');await action('keep-exploring');await sameGame(missing,'keeping exploration with missing objective is free');
      if(kind==='keepsake')missing.objective.completed=true;else missing.inventory=[kind==='diary'?'diary':'exit-key'];
      await inject(missing);await tileClick(1,1);assert.equal(await evaluate('document.querySelector("[data-action=leave]").disabled'),false,`${kind}: actual prerequisite is sufficient`);
      await action('leave');await sameGame(act(missing,{type:'leave'}).state,`${kind}: valid completion through visible control`);
    }
    assert.deepEqual(exceptions,[]);assert.deepEqual(badResponses,[]);
    await writeFile(resolve(artifacts,'exit-browser-results.json'),JSON.stringify({browser:browserVersion.product,equivalentFixture:true,reportedExportAvailable:false,viewports:[[390,700],[320,568],[667,375]],nativeTouch:true,nativeKeyboard:true,objectiveFamilies:['diary','escape','keepsake'],remainingWispAllowed:true,optionalCleanupAllowed:true,duplicateRecords:false,exceptions,badResponses},null,2));
    console.log('Exit checks passed: explicit diary completion with a living Wisp, free Keep exploring, native touch/keyboard, real prerequisites, separate return/leave costs and duplicate-free records.');
  }

  await command('Runtime.enable'); await command('Page.enable'); await command('Network.enable');
  const browserVersion = await command('Browser.getVersion');
  await viewport(390, 700);
  await navigate('/haunted_house.html', '!!document.querySelector("[data-action=new]")');
  if(!process.argv.includes('--exit-only')) {
  await evaluate(`localStorage.removeItem(${JSON.stringify(SAVE_KEY)}); localStorage.setItem(${JSON.stringify(LEGACY_KEYS[0])}, 'old-v2-save'); localStorage.setItem('unrelated-game-fixture', 'untouched')`);
  await reload(); await action('new');
  await evaluate('document.querySelector("#seed").value = "first-light"'); await evaluate('document.querySelector(' + JSON.stringify('[data-form=new]') + ').requestSubmit()');
  await waitFor('!!document.querySelector(".hh-board")');
  assert.equal((await readState()).resources.health, 22);
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(LEGACY_KEYS[0])})`), 'old-v2-save');
  await screenshot('mobile-generated-390x700');
  console.log('Worker generation and v4 load passed; checking tile attack contract');

  let fixture = baseFixture(); const shade = addHaunting(fixture); addHaunting(fixture, { name: 'Wisp', kind: 'wisp', position: position(4, 4) }); addSupply(fixture);
  await inject(fixture);
  await tileClick(4, 3); await sameGame(fixture, 'first enemy activation only inspects');
  await assertPreview(fixture, shade, 'strike');
  await tileClick(4, 3); let expected = act(fixture, { type: 'attack', hauntingId: shade.id, mode: 'strike' }).state;
  await sameGame(expected, 'second activation performs exactly one Strike');
  await tileClick(4, 4); await sameGame(expected, 'changing enemies never attacks');
  await action('flare'); assert.equal(await queued(), true); await sameGame(expected, 'queue is free');
  await tileClick(4, 3); await sameGame(expected, 'queued spell can change targets without casting');
  await assertPreview(expected, expected.hauntings[0], 'flare');
  await tileClick(4, 3); expected = act(expected, { type: 'attack', hauntingId: shade.id, mode: 'flare' }).state;
  await sameGame(expected, 'queued spell casts exactly once'); assert.equal(await queued(), false);
  await action('flare'); await action('flare'); await sameGame(expected, 'cancelling Flare is free'); assert.equal(await queued(), false);
  await action('flare'); await tileClick(5, 3); expected = act(expected, { type: 'move', to: position(5, 3) }).state;
  await sameGame(expected, 'committed discovered movement crosses occupied tiles freely'); assert.equal(await queued(), false);
  await action('undo'); assert.equal(await selectedEnemy(), false); assert.equal(await queued(), false);
  await reload(); await action('continue'); assert.equal(await selectedEnemy(), false); assert.equal(await queued(), false);

  fixture = baseFixture(); addHaunting(fixture);
  await inject(fixture); await action('flare'); await tileClick(4, 3); await sameGame(fixture, 'queued Flare first enemy tap only selects');
  await tileClick(4, 3); await sameGame(act(fixture, { type: 'attack', hauntingId: 'h0', mode: 'flare' }).state, 'queued Flare second enemy tap casts');
  fixture.resources.light = 3; await inject(fixture); await action('flare');
  assert.equal(await queued(), false); await sameGame(fixture, 'insufficient light never queues or spends');
  assert.match(await evaluate('document.body.innerText'), /4.*light|light.*4/i, 'unavailable Flare states its cost'); await closeDialog();

  console.log('Checking preparation overlays, supply inspection, exact preview/execution and confirmations');
  fixture = baseFixture(); fixture.resources.health = 10; addHaunting(fixture, { kind: 'armour', trait: 'brittle', attack: 5, hp: 35, maxHp: 35 });
  await inject(fixture); await tileClick(4, 3); await action('flare'); await action('oil');
  await sameGame(fixture, 'oil explanation is free'); await action('close-dialog'); await sameGame(fixture, 'closing explanation is free'); assert.equal(await queued(), true);
  await useAbility('oil'); expected = act(fixture, { type: 'oil' }).state; await sameGame(expected, 'oil preparation once'); assert.equal(await queued(), false);
  assert.ok(await evaluate('document.querySelector("[data-action=oil]").getAttribute("aria-label").toLowerCase().includes("prepared")'), 'prepared Oil remains marked');
  await useAbility('ward'); expected = act(expected, { type: 'ward' }).state; await sameGame(expected, 'ward preparation once');
  assert.ok(await evaluate('document.querySelector("[data-action=ward]").getAttribute("aria-label").toLowerCase().includes("prepared")'), 'prepared Ward remains marked');
  await action('ward'); assert.ok(await evaluate('!document.querySelector("[data-action=use-ability]") || document.querySelector("[data-action=use-ability]").disabled'), 'prepared Ward cannot be purchased twice');
  await sameGame(expected, 'unavailable preparation explanation is free'); await action('close-dialog');
  // Opening a preparation explanation retains the enemy, allowing immediate comparison.
  if (!(await selectedEnemy())) await tileClick(4, 3);
  await assertPreview(expected, expected.hauntings[0], 'strike');
  await action('combat-details'); const arithmetic = await evaluate('document.querySelector("dialog").innerText');
  for (const term of ['power', 'Oil', 'armour', 'Spirit trait', 'Ward']) assert.ok(arithmetic.toLowerCase().includes(term.toLowerCase()), `arithmetic includes ${term}`);
  await action('close-dialog'); await tileClick(4, 3);
  expected = act(expected, { type: 'attack', hauntingId: 'h0', mode: 'strike' }).state; await sameGame(expected, 'armour, Oil, brittle and Ward match shared preview');
  await useAbility('tonic'); expected = act(expected, { type: 'tonic' }).state; await sameGame(expected, 'tonic use costs one turn');
  await action('inventory'); await sameGame(expected, 'inventory explanation is free'); await action('close-dialog');

  fixture = baseFixture(); const food = addSupply(fixture); await inject(fixture); await tileClick(2, 3);
  await sameGame(fixture, 'full-health floor food only inspects');
  assert.match(await evaluate('document.querySelector("dialog").innerText'), /wast/i, 'food explains exact waste before use');
  assert.match(await evaluate('document.querySelector("dialog").innerText'), /14.*wast|wast.*14/i, 'full-health food displays all 14 wasted HP');
  await action('close-dialog'); await sameGame(fixture, 'closing floor inspection is free');
  await tileClick(2, 3); await action('use'); await sameGame(act(fixture, { type: 'use', supplyId: food.id }).state, 'explicit supply use costs exactly one turn');
  fixture = baseFixture(); addSupply(fixture, 'note', { name: 'Faded annotation', text: 'Compare the spirits before acting.' });
  await inject(fixture); await tileClick(2, 3);
  assert.match(await evaluate('document.querySelector("dialog").innerText'), /information/i);
  await sameGame(fixture, 'reading note overlay is free'); await action('use');
  await sameGame(act(fixture, { type: 'use', supplyId: 's0' }).state, 'collecting information preserves turn/discovery rule');

  for (const special of [
    { name: 'Smouldering flare', mode: 'flare', health: 12, hp: 7, maxHp: 7, xp: 3, kind: 'wisp', trait: 'smouldering' },
    { name: 'Ward rounded strike', mode: 'strike', health: 12, hp: 8, maxHp: 8, xp: 3, attack: 5, ward: true, empowered: true, kind: 'armour' },
    { name: 'Lethal killing strike', mode: 'strike', health: 4, hp: 6, maxHp: 6, xp: 3, attack: 4 },
  ]) {
    fixture = baseFixture(); fixture.resources.health = special.health; fixture.resources.ward = special.ward ?? false; fixture.resources.empowered = special.empowered ?? false;
    const enemy = addHaunting(fixture, special); await inject(fixture); await tileClick(4, 3);
    if (special.mode === 'flare') await action('flare');
    const p = await assertPreview(fixture, enemy, special.mode);
    if (p.levelsGained) assert.match(await evaluate('document.querySelector(".hh-combat-panel").innerText'), /level/i, 'level-up has separate indicator');
    if (p.lethal) assert.match(await evaluate('document.querySelector(".hh-combat-panel").innerText'), /death|fatal|die/i, 'lethal killing exchange is visible');
    await tileClick(4, 3);
    if (p.lethal) {
      await sameGame(fixture, 'lethal confirmation does not commit');
      assert.ok(await evaluate('document.querySelector("dialog").open'));
      await key('Escape'); await sameGame(fixture, 'cancelling lethal attack leaves gameplay identical');
      assert.equal(await evaluate('document.activeElement.dataset.action'), 'tile', 'confirmation returns focus to tile');
      await tileClick(4, 3); await action('accept-death');
      await sameGame(act(fixture, { type: 'attack', hauntingId: enemy.id, mode: special.mode, acceptDeath: true }).state, special.name);
      await action('undo'); assert.equal((await readState()).status, 'active');
    } else {
      await sameGame(act(fixture, { type: 'attack', hauntingId: enemy.id, mode: special.mode }).state, special.name);
      assert.equal(await selectedEnemy(), false, 'enemy death clears actionable selection');
    }
  }

  // Native keyboard activation, held-key suppression, touch synthesis, and detached-node safety.
  fixture = baseFixture(); addHaunting(fixture, { hp: 6, maxHp: 6 }); await inject(fixture);
  await evaluate(`document.querySelector(${JSON.stringify(tileSelector(4, 3))}).focus({preventScroll:true})`);
  await key('Enter'); await sameGame(fixture, 'keyboard first activation selects');
  await key('Enter', true); await sameGame(fixture, 'held Enter never attacks');
  await key('Enter'); expected = act(fixture, { type: 'attack', hauntingId: 'h0', mode: 'strike' }).state;
  await sameGame(expected, 'keyboard commits once'); await key('Enter', true); await sameGame(expected, 'held Enter after enemy death cannot activate cleared tile');
  await inject(fixture); await tileClick(4, 3);
  await evaluate(`(() => { const tile = document.querySelector(${JSON.stringify(tileSelector(4, 3))}); tile.click(); tile.click(); })()`);
  await sameGame(expected, 'duplicate events from detached old enemy node commit once');
  await tileClick(4, 3); await sameGame(expected, 'immediate tap after kill cannot act on replacement floor');

  await inject(fixture); await evaluate('document.querySelector("[data-action=flare]").focus({preventScroll:true})');
  await key('Enter'); assert.equal(await queued(), true, 'keyboard queues Flare');
  await key('Enter', true); assert.equal(await queued(), true, 'held ability key cannot toggle queue repeatedly');
  await key('Enter'); assert.equal(await queued(), false, 'next deliberate keyboard activation cancels queue');

  await inject(baseFixture()); await tileClick(3, 3); await key('ArrowLeft');
  assert.equal((await readState()).turns, 0, 'arrow browsing only moves focus');
  await key('Enter'); assert.equal((await readState()).turns, 1);
  await key('z'); assert.equal((await readState()).turns, 0);
  await action('menu'); await key('Tab'); assert.ok(await evaluate('!!document.activeElement.closest("dialog")'), 'dialog contains keyboard focus'); await key('Escape');
  assert.ok(await evaluate('document.activeElement.dataset.action === "menu"'), 'menu restores opener focus');

  // Door/stair controls keep local discovery separate from travel, including locks.
  fixture = baseFixture(); const stairs = addConnection(fixture, {kind:'stairs'}); fixture.rooms[0].discovered[4 * fixture.rooms[0].width + 4] = false;
  await inject(fixture); await action('flare'); await tileClick(5, 5);
  assert.match(await evaluate('document.querySelector("[data-action=stand]").innerText'), /Stand on this landing/);
  await sameGame(fixture, 'stair inspection is free'); await action('stand');
  expected = act(fixture, { type: 'move', to: stairs.a }).state; await sameGame(expected, 'standing costs one turn and reveals local 3x3');
  assert.equal(await queued(), false); await tileClick(5, 5);
  assert.equal(await evaluate('document.querySelector("[data-action=stand]").disabled'), true, 'already on landing distinguished from travel');
  await action('travel'); expected = act(expected, { type: 'travel', connectionId: stairs.id, from: stairs.a }).state;
  await sameGame(expected, 'stair travel is a separate turn'); assert.equal(await selectedEnemy(), false);
  fixture = baseFixture(); addConnection(fixture, { opened: false, gate: 'moth-key' }); fixture.inventory.push('moth-key');
  await inject(fixture); await tileClick(5, 5);
  assert.ok(await evaluate('!document.querySelector("[data-action=stand]") || document.querySelector("[data-action=stand]").disabled'), 'closed doorway cannot be occupied');
  await action('unlock'); expected = act(fixture, { type: 'unlock', connectionId: 'passage' }).state; await sameGame(expected, 'unlock is exactly one action');
  await tileClick(5, 5); assert.match(await evaluate('document.querySelector("[data-action=stand]").innerText'), /Stand in this doorway/); await action('close-dialog');

  fixture = baseFixture(); addConnection(fixture); fixture.rooms[1].discovered.fill(true); addHaunting(fixture, { position: position(3, 3, 'study') });
  await inject(fixture); await showRoom('study'); await tileClick(3, 3); await action('flare'); await showRoom('hall');
  await sameGame(fixture, 'room selector is free'); assert.equal(await selectedEnemy(), false); assert.equal(await queued(), false);
  await showRoom('study'); await tileClick(3, 3); await tileClick(3, 3);
  await sameGame(act(fixture, { type: 'attack', hauntingId: 'h0', mode: 'strike' }).state, 'remembered-room attacks preserve remote movement rules');
  assert.equal(await evaluate('document.querySelector(".hh-board").getAttribute("aria-label")'), 'study', 'view stays on remembered target room');

  // Exercise the real browser file controls as well as localStorage roundtrips.
  const downloadPath = resolve(artifacts, `downloads-${Date.now()}`); await mkdir(downloadPath);
  await command('Browser.setDownloadBehavior', {behavior:'allow',downloadPath});
  expected = await readState(); await fromMenu('export'); await sameGame(expected, 'export is free');
  let exported;
  for (let i = 0; i < 100; i++) { exported = (await readdir(downloadPath)).find(n=>n.endsWith('.json')); if (exported) break; await sleep(50); }
  assert.ok(exported, 'browser save export downloads a JSON file');
  assert.deepEqual(JSON.parse(await readFile(resolve(downloadPath,exported),'utf8')), expected, 'download preserves exact v4 state');
  await closeDialog();
  fixture = baseFixture(); fixture.resources.ward = true; fixture.resources.empowered = true; addHaunting(fixture,{hp:9,maxHp:17});
  const importPath = resolve(artifacts,'mobile-import-fixture.json'); await writeFile(importPath,JSON.stringify(fixture));
  await fromMenu('choose-import');
  const dom = await command('DOM.getDocument');
  const input = await command('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#hh-import'});
  await command('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[importPath]});
  await waitFor('!!document.querySelector("[data-action=confirm-import]")');
  await sameGame(expected, 'file selection and import confirmation are free');
  await action('confirm-import'); await sameGame(fixture, 'browser import preserves content, prepared buffs and wounded enemy');
  assert.equal(await selectedEnemy(),false); assert.equal(await queued(),false);

  console.log('Checking remembered architecture, room identity, persistent item actions and stored relics');
  await viewport(390,700);
  fixture=baseFixture({width:9,height:9});
  Object.assign(fixture.rooms[0],{name:'Moonlit library',identity:'library',accent:'ink',flavor:'Tall shelves divide the room into narrow aisles.'});
  markTile(fixture,position(5,5),{kind:'wall'}); markTile(fixture,position(6,6),{kind:'wall'});
  fixture.rooms[0].discovered[6*9+6]=false;
  addSupply(fixture,'food',{position:position(7,7)}); addSupply(fixture,'food',{position:position(2,3)});
  addSupply(fixture,'candle',{position:position(6,7)}); fixture.rooms[0].discovered[7*9+6]=false;
  addHaunting(fixture,{position:position(7,6),name:'Remembered librarian'});
  await inject(fixture);
  const memory = await evaluate(`(() => {
    const at=(x,y)=>document.querySelector('[data-action=tile][data-x="'+x+'"][data-y="'+y+'"]');
    const wall=at(5,5),floor=at(5,6),hiddenWall=at(6,6),hiddenSupply=at(6,7),food=at(7,7).querySelector('svg'),litFood=at(2,3).querySelector('svg');
    return {wallMemory:wall.classList.contains('is-memory'),floorMemory:floor.classList.contains('is-memory'),wallBackground:getComputedStyle(wall).backgroundColor,floorBackground:getComputedStyle(floor).backgroundColor,
      wallPattern:getComputedStyle(wall,'::before').backgroundImage,floorPattern:getComputedStyle(floor,'::before').backgroundImage,
      hidden:[hiddenWall,hiddenSupply].map(e=>({label:e.getAttribute('aria-label'),icons:e.querySelectorAll('svg').length,classes:e.className})),
      sameFood:food.innerHTML===litFood.innerHTML,foodOpacity:getComputedStyle(food).opacity,foodFilter:getComputedStyle(food).filter,
      rememberedEnemy:!!at(7,6).querySelector('.hh-icon-shade'),hint:!!document.querySelector('.hh-board-hint'),identity:document.querySelector('.hh-board-stage').dataset.identity,accent:document.querySelector('.hh-board-stage').dataset.accent};
  })()`);
  assert.ok(memory.wallMemory && memory.floorMemory,'terrain probe is outside current illumination');
  assert.notEqual(memory.wallBackground,memory.floorBackground,'remembered wall remains visibly distinct from floor');
  assert.notEqual(memory.wallPattern,memory.floorPattern,'remembered walls retain masonry shape beyond color');
  for (const hidden of memory.hidden) { assert.equal(hidden.icons,0); assert.match(hidden.label,/Unknown/); assert.ok(!/is-wall|is-supply/.test(hidden.classes),'unknown terrain/content type is hidden'); }
  assert.ok(memory.sameFood && Number(memory.foodOpacity)>=.85 && memory.foodFilter==='none' && memory.rememberedEnemy,'remembered objects retain distinct colored sprites');
  assert.equal(memory.hint,false,'board-pan instruction does not cover board');
  assert.equal(memory.identity,'library'); assert.equal(memory.accent,'ink');
  await action('rooms'); assert.match(await evaluate('document.querySelector("dialog").innerText'),/Tall shelves divide/); await closeDialog();
  await screenshot('adventure-phone-memory');

  for (const keyId of ['moth-key','thorn-key']) {
    fixture=baseFixture();addConnection(fixture,{opened:false,gate:keyId,name:`The ${keyId.split('-')[0]}-marked library door`});
    addSupply(fixture,'cache',{item:keyId,name:keyId});await inject(fixture);
    const keyGlyph=await evaluate(`document.querySelector('${tileSelector(2,3)} svg').innerHTML`);
    const gateGlyph=await evaluate(`document.querySelector('${tileSelector(5,5)} .hh-lock-mark svg').innerHTML`);
    assert.equal(gateGlyph,keyGlyph,`${keyId}: key and lock share the same emblem`);
    await tileClick(2,3);await assertDialogActions(['use'],`${keyId} collect`);await action('use');
    expected=act(fixture,{type:'use',supplyId:'s0'}).state;await sameGame(expected,`${keyId} collected once`);
    await action('inventory');assert.match(await evaluate('document.querySelector("dialog").innerText'),new RegExp(`marked with a ${keyId.split('-')[0]}`));await closeDialog();
    await tileClick(5,5);await assertDialogActions(['unlock'],`${keyId} unlock`);
    assert.match(await evaluate('document.querySelector("#hh-dialog-title").textContent'),/marked library door/);
    assert.equal(await evaluate('document.querySelector(".hh-dialog-content svg").innerHTML'),keyGlyph,'passage explains the same matching key');
    await action('unlock');expected=act(expected,{type:'unlock',connectionId:'passage'}).state;await sameGame(expected,'matching reusable key unlocks exactly once');
    assert.ok(expected.inventory.includes(keyId));
  }

  for (const [width,height] of [[320,568],[390,520],[667,375]]) {
    await viewport(width,height);
    fixture=baseFixture();
    addSupply(fixture,'note',{name:'A long letter from the keeper of the northern gallery',noteType:'clue',text:'A moth is carved into the old lock. The corresponding key opens the passage, and remains in your pocket. '.repeat(6)});
    await inject(fixture); await tileClick(2,3); await sameGame(fixture,'long note inspection remains free');
    await assertDialogActions(['use'],`${width}x${height} long note`);
    const beforeFooter=await evaluate('document.querySelector("dialog footer").getBoundingClientRect().top');
    await evaluate('document.querySelector(".hh-dialog-content").scrollTop=99999');
    assert.equal(await evaluate('document.querySelector("dialog footer").getBoundingClientRect().top'),beforeFooter,'content scrolling never displaces primary action');
    await assertDialogActions(['use'],`${width}x${height} scrolled note`);
    await screenshot(`adventure-note-${width}x${height}`); await action('close-dialog'); await sameGame(fixture,'closing long note is free');
    await action('oil'); await assertDialogActions(['use-ability'],`${width}x${height} Oil`); await closeDialog();
    fixture=baseFixture(); addConnection(fixture,{kind:'stairs',name:'The winding stair beside the music room'});
    await inject(fixture); await tileClick(5,5); await assertDialogActions(['stand','travel'],`${width}x${height} stair`); await closeDialog();
  }
  await viewport(390,700);
  for (const definition of REWARD_DEFINITIONS) {
    fixture=baseFixture(); const item=addSupply(fixture,'relic',structuredClone(definition));
    if(item.effect.kind==='recovery') { fixture.resources.health=21;fixture.resources.light=9; }
    else addHaunting(fixture,{kind:item.effect.kind==='damage' && item.effect.mode==='flare'?'armour':'shade',hp:18,maxHp:18,attack:5});
    if(item.effect.kind==='guard') fixture.resources.ward=true;
    await inject(fixture); await tileClick(2,3); await sameGame(fixture,`${item.name}: inspecting spends nothing`);
    await assertDialogActions(['use'],`${item.name} collect`);
    assert.ok(await evaluate(`!!document.querySelector('dialog .hh-icon-${item.definitionId}')`),`${item.name} has distinct icon`);
    if(item.effect.kind==='recovery') assert.match(await evaluate('document.querySelector("dialog").innerText'),/\+1 health \(3 wasted\), \+1 light \(3 wasted\)/,'Ember flask shows independent health/light caps and waste');
    await action('use'); expected=act(fixture,{type:'use',supplyId:item.id}).state; await sameGame(expected,`${item.name}: exact existing use action`);
    await reload(); await action('continue'); await sameGame(expected,`${item.name}: stored effect survives reload`);
    if(item.effect.kind==='recovery') { assert.equal(expected.resources.health,22); assert.equal(expected.resources.light,10); }
    else {
      await action('inventory'); assert.match(await evaluate('document.querySelector("dialog").innerText'),new RegExp(item.name)); await closeDialog();
      await tileClick(4,3); const mode=item.effect.kind==='damage'?item.effect.mode:'strike'; if(mode==='flare')await action('flare');
      const preview=await assertPreview(expected,expected.hauntings[0],mode);
      if(item.effect.kind==='damage') assert.equal(preview.itemDamage,2,`${item.name} affects its intended attack`);
      else {assert.equal(preview.incomingReduction,1);assert.equal(preview.incoming,2,'Mourning ribbon applies after ceil(5/2) Ward');}
      await action('combat-details'); assert.match(await evaluate('document.querySelector("dialog").innerText'),/Collected relics|Relic reduction/); await closeDialog();
      await tileClick(4,3); expected=act(expected,{type:'attack',hauntingId:'h0',mode}).state; await sameGame(expected,`${item.name}: displayed preview equals execution`);
    }
    await action('undo'); await sameGame(act(expected,{type:'undo'}).state,`${item.name}: undo restores item/resource state`);
    if(item.effect.kind!=='recovery') { await action('undo');await sameGame(fixture,`${item.name}: undo collection removes its effect`); }
  }
  // A save's effect snapshot is authoritative even if the same catalog ID later changes.
  fixture=baseFixture(); addSupply(fixture,'relic',{...structuredClone(REWARD_DEFINITIONS[0]),used:true,effect:{kind:'damage',mode:'strike',targets:['shade'],amount:3}}); addHaunting(fixture);
  await inject(fixture); await tileClick(4,3); assert.equal((await assertPreview(fixture,fixture.hauntings[0],'strike')).itemDamage,3);
  await action('inventory'); assert.match(await evaluate('document.querySelector("dialog").innerText'),/\+3 Strike/); await closeDialog();

  fixture=baseFixture(); fixture.seed='first-light'; fixture.runId='browser-original-attempt';
  Object.assign(fixture.rooms[0],{name:'Saved private library',identity:'library',accent:'ink',flavor:'A saved room identity.'});
  addSupply(fixture,'relic',structuredClone(REWARD_DEFINITIONS[0])); addHaunting(fixture);
  let played=act(fixture,{type:'use',supplyId:'s0'}).state; played=act(played,{type:'attack',hauntingId:'h0',mode:'strike'}).state;
  await inject(played); await tileClick(4,3); await action('flare'); await fromMenu('restart');
  await sameGame(played,'restart explanation leaves saved adventure unchanged'); await action('confirm-restart');
  const restarted=await readState(), restored=restartState(played);
  assert.notEqual(restarted.runId,played.runId,'restart creates a distinct attempt identity');
  assert.deepEqual({...restarted,runId:undefined},{...JSON.parse(JSON.stringify(restored)),runId:undefined},'restart restores exact saved geometry/content/first turn rather than regenerating seed');
  assert.equal(await selectedEnemy(),false);assert.equal(await queued(),false);

  console.log('Checking portrait, short screen, landscape, tablet, desktop and resizing');
  const sizes = [[390,700], [375,667], [360,640], [320,568], [390,520], [667,375], [844,390], [768,1024], [1024,600], [1280,720], [1366,768]];
  for (const [width, height] of sizes) {
    await viewport(width, height);
    fixture = baseFixture({width:9,height:9}); addHaunting(fixture, {kind:'armour',trait:'brittle',name:'The keeper of the forgotten northern music room'}); addSupply(fixture);
    await inject(fixture); const neutral = await layout(); assertFits(neutral, `${width}x${height} neutral`);await assertFighterRows(`${width}x${height} neutral combat`);
    await tileClick(4, 3); const inspected = await layout(); assertFits(inspected, `${width}x${height} selected`);
    await assertFighterRows(`${width}x${height} compact combat`);
    assert.ok(await evaluate('document.querySelector(".hh-enemy-panel").getAttribute("aria-label").includes("The keeper of the forgotten northern music room")'),'long names remain available in accessible labels');
    assert.equal(await evaluate('!!document.querySelector(".hh-board-hint")'),false,'no board instruction overlays tiles');
    if(width===390 && height===700) assert.ok(inspected.board.height/height>=.59,`ordinary phone dedicates at least59% height to board (${inspected.board.height/height})`);
    assert.deepEqual(inspected.board, neutral.board, 'selection never resizes the board');
    assert.deepEqual(inspected.combat, neutral.combat, 'neutral and selected panels have the same dimensions');
    assert.equal(await evaluate('document.activeElement.dataset.focus'), 'tile-hall-4-3');
    await action('flare'); const withFlare = await layout(); assertFits(withFlare, `${width}x${height} Flare`);
    assert.deepEqual(withFlare.board, neutral.board, 'queuing never resizes the board');
    if (width===390 && height===700) await screenshot('mobile-pass-phone-flare-queued');
    await action('flare'); await tileClick(4, 3); assertFits(await layout(), `${width}x${height} attack`);
    await action('oil'); assert.ok(await evaluate('document.querySelector("dialog").getBoundingClientRect().bottom <= innerHeight + 1'), 'item overlay fits viewport');
    if (width===390 && height===700) await screenshot('mobile-pass-phone-ability-overlay');
    await action('close-dialog'); assert.equal(await evaluate('document.activeElement.dataset.action'), 'oil', 'item overlay returns focus');
    await action('combat-details'); assert.ok(await evaluate('document.querySelector("dialog").getBoundingClientRect().bottom <= innerHeight + 1'), 'math overlay fits viewport'); await action('close-dialog');
    await screenshot(`mobile-pass-${width}x${height}`);
    await screenshot(`adventure-${width}x${height}`);
    if(width===390 && height===700) await screenshot('adventure-phone');
    viewportResults.push({ width, height, ...inspected });
  }
  await viewport(320,568);
  fixture=baseFixture();fixture.resources.health=4;fixture.resources.ward=true;fixture.resources.empowered=true;
  addSupply(fixture,'relic',{...structuredClone(REWARD_DEFINITIONS.find(r=>r.definitionId==='mourning-ribbon')),used:true});
  addHaunting(fixture,{name:'The watcher beneath the library stair',trait:'smouldering',hp:10,maxHp:10,attack:9,xp:3});await inject(fixture);await tileClick(4,3);
  await assertFighterRows('320x568 prepared Ward/Oil and lethal killing preview');
  assert.ok(await evaluate('(() => { const name=document.querySelector(".hh-player-panel .hh-identity strong");return name.scrollWidth<=name.clientWidth+1; })()'),'lethal preview keeps player level visible without ellipsis');
  assert.ok(await evaluate('document.querySelector(".hh-player-panel").getAttribute("aria-label").includes("Ward prepared") && document.querySelector(".hh-player-panel").getAttribute("aria-label").includes("Oil prepared")'));
  await screenshot('adventure-prepared-lethal-320x568');
  fixture.resources.health=9;await inject(fixture);await tileClick(4,3);await assertFighterRows('320x568 prepared buffs and surviving level-up');
  await screenshot('adventure-prepared-levelup-320x568');
  // Shrinking available height emulates the space change from browser chrome.
  await viewport(390, 700); await inject(fixture); await tileClick(4, 3);
  for (const height of [580, 480, 700]) { await viewport(390,height); assertFits(await layout(), `mobile browser height ${height}`); }
  await viewport(390, 700); await evaluate('document.documentElement.style.fontSize = "200%"'); await sleep(150);
  const zoomLayout = await layout();
  assert.ok(zoomLayout.scrollWidth <= zoomLayout.width + 1, 'enlarged text does not create document horizontal scrolling');
  assert.ok(await evaluate('document.querySelector(".hh-board-scroll").scrollHeight >= document.querySelector(".hh-board-scroll").clientHeight'), 'board remains in contained pan area');
  assert.ok(await evaluate('document.querySelector("[data-action=menu]").getBoundingClientRect().width >= 32'), 'enlarged text keeps menu operable');
  await fromMenu('reading-layout');
  assert.ok(await evaluate('document.querySelector(".hh-play").classList.contains("is-reading-layout")'), 'large-text contained reading fallback is available');
  assert.ok(await evaluate('document.documentElement.scrollHeight <= innerHeight+1'), 'reading fallback preserves document scroll boundary');
  await evaluate('document.querySelector(".hh-play").scrollTop = document.querySelector(".hh-play").scrollHeight');
  assert.ok(await evaluate('document.querySelector(".hh-combat-panel").getBoundingClientRect().bottom <= innerHeight+1'), 'large-text combat details are reachable inside contained fallback');
  assert.ok(await evaluate(`Array.from(document.querySelectorAll(".hh-fighter")).every(panel => {
    const box=panel.getBoundingClientRect(), rows=Array.from(panel.children).map(c=>c.getBoundingClientRect()).filter(r=>r.height>0);
    return rows.every((r,i)=>r.top>=box.top-1 && r.bottom<=box.bottom+1 && (!i || rows[i-1].bottom<=r.top+1));
  })`), 'enlarged text fighter rows do not overlap or clip');
  await screenshot('mobile-pass-enlarged-text'); await action('menu'); await action('help'); await key('Escape');
  await fromMenu('reading-layout');
  await evaluate('document.documentElement.style.fontSize = ""');
  await viewport(390, 700); fixture = baseFixture(); addHaunting(fixture); await inject(fixture);
  await command('Emulation.setTouchEmulationEnabled', {enabled:true});
  await touch(tileSelector(4, 3)); await sameGame(fixture, 'touch first activation only selects');
  await touch(tileSelector(4, 3)); await sameGame(act(fixture, {type:'attack', hauntingId:'h0', mode:'strike'}).state, 'touch second activation commits once with no synthesized-click duplicate');
  await touch('[data-action=flare]'); assert.equal(await queued(), true); await touch(tileSelector(4,3));
  assert.equal((await readState()).turns,2,'touch Flare commits once'); assert.equal(await queued(),false);
  await screenshot('mobile-pass-phone-touch');
  await command('Emulation.setTouchEmulationEnabled', {enabled:false});

  // Replay a complete real solver witness using exactly the public player controls.
  console.log('Replaying complete winning witness through compact UI');
  await viewport(390,700);
  expected = createGame('winter-ink'); const witness = solve(expected); assert.ok(witness.solved); await inject(expected);let capturedGeneratedFight=false;
  for (const a of witness.actions) {
    if (a.type === 'move') {
      await showRoom(a.to.roomId); await tileClick(a.to.x, a.to.y);
      if ((await readState()).turns === expected.turns) await action(await evaluate('!!document.querySelector("[data-action=stand]")') ? 'stand' : 'return');
    } else if (a.type === 'travel' || a.type === 'unlock') {
      const c = expected.connections.find(c => c.id === a.connectionId);
      const from = a.type === 'travel' ? a.from : [c.a,c.b].find(p=>expected.rooms.find(r=>r.id===p.roomId).discovered[p.y*expected.rooms.find(r=>r.id===p.roomId).width+p.x]);
      await showRoom(from.roomId); await tileClick(from.x,from.y); await action(a.type);
    } else if (a.type === 'attack' || a.type === 'use') {
      const entity = a.type === 'attack' ? expected.hauntings.find(h=>h.id===a.hauntingId) : expected.supplies.find(s=>s.id===a.supplyId);
      await showRoom(entity.position.roomId); await tileClick(entity.position.x,entity.position.y);
      if (a.type === 'attack') { if (a.mode==='flare') await action('flare'); if(!capturedGeneratedFight){await screenshot('adventure-generated-combat');capturedGeneratedFight=true;} await tileClick(entity.position.x,entity.position.y); }
      else await action('use');
    } else if (a.type === 'settle') {
      const p = expected.objective.altar; await showRoom(p.roomId); await tileClick(p.x,p.y); await action('settle');
    } else if (['ward','oil','tonic'].includes(a.type)) await useAbility(a.type);
    else if (a.type === 'leave') { await closeDialog(); await action('rooms'); await action('exit-controls'); await action('leave'); }
    else await action(a.type);
    expected = act(expected,a).state; await sameGame(expected, JSON.stringify(a));
  }
  assert.equal((await readState()).status,'won');
  assert.match(await evaluate('document.querySelector("dialog").innerText'), /Playable tiles discovered/);
  await screenshot('mobile-pass-completion');
  await screenshot('adventure-completion');
  const recordCount = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(COMPLETIONS_KEY)})).length`);
  await action('close-dialog'); await action('undo'); await action('rooms'); await action('exit-controls'); await action('leave');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(COMPLETIONS_KEY)})).length`), recordCount, 're-ending does not duplicate report');
  await reload(); await action('continue');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(COMPLETIONS_KEY)})).length`), recordCount, 'reload does not duplicate report');
  await closeDialog(); await fromMenu('records'); assert.match(await evaluate('document.querySelector("dialog").innerText'), /winter-ink/); await closeDialog();
  await action('menu');
  for (const name of ['export','choose-import','restart','new','records','help','journal','activity']) assert.ok(await evaluate(`!!document.querySelector('[data-action="${name}"]')`), `menu provides ${name}`);
  assert.equal(await evaluate('!!document.querySelector("[data-action=known]")'), false, 'global enemy directory is absent');
  assert.equal(await evaluate("localStorage.getItem('unrelated-game-fixture')"), 'untouched');
  assert.deepEqual(exceptions, []); assert.deepEqual(badResponses, []);
  const browserReport=JSON.stringify({browser:browserVersion.product,viewports:viewportResults,witnessTurns:expected.turns,exceptions,badResponses,notes:'Headless Chromium emulation; physical device safe areas and actual mobile browser chrome remain human checks.'},null,2);
  await Promise.all(['mobile-browser-results.json','adventure-browser-results.json'].map(name=>writeFile(resolve(artifacts,name),browserReport)));
  console.log(`Browser checks passed: ${sizes.length} sizes, height changes, enlarged text, native touch/keyboard, compact overlays, preview agreement, and ${expected.turns}-turn UI witness.`);
  }
  await exitChecks();
} finally { ws?.close(); chrome.kill(); await new Promise(done => server.close(done)); }
