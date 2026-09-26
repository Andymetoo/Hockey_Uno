// Real Chromium smoke test against compiled files on an ordinary HTTP server.
// Run `npm run build:haunted` first. CHROME_PATH may select another Chromium binary.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame } from '../generation.ts';
import { act } from '../game.ts';
import { solve } from '../solver.ts';
import { SAVE_KEY, LEGACY_KEYS } from '../persistence.ts';
import { baseFixture, addHaunting, addSupply, position } from './fixtures.mjs';

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
const exceptions = [], badResponses = [];
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
    const virtual = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Escape: 27 }[key] ?? key.toUpperCase().charCodeAt(0);
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: virtual, autoRepeat });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: virtual });
  }
  async function screenshot(name) {
    const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(resolve(artifacts, `${name}.png`), Buffer.from(result.data, 'base64'));
  }
  await command('Runtime.enable'); await command('Page.enable'); await command('Network.enable');
  console.log('Checking destination movement, previews, saves and worker generation');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate('/haunted_house.html', '!!document.querySelector("[data-action=new]")');
  await evaluate(`localStorage.removeItem(${JSON.stringify(SAVE_KEY)}); localStorage.setItem(${JSON.stringify(LEGACY_KEYS[0])}, 'old-v2-save'); localStorage.setItem('unrelated-game-fixture', 'untouched')`);
  await reload(); await action('new');
  await evaluate('document.querySelector("#hh-seed").value = "first-light"'); await action('confirm-start');
  await waitFor('!!document.querySelector(".hh-board")');
  assert.equal((await readState()).resources.health, 22);
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(LEGACY_KEYS[0])})`), 'old-v2-save');
  await screenshot('desktop-game-v3');
  const tileClick = (x, y) => click(`[data-action=tile][data-x="${x}"][data-y="${y}"]`);
  let fixture = baseFixture(); addHaunting(fixture); addSupply(fixture);
  await inject(fixture); await tileClick(4, 3); assert.equal((await readState()).turns, 0);
  assert.ok(await evaluate('document.querySelector(".hh-action-detail").innerText.includes("22 → 18")'));
  await action('attack'); assert.equal((await readState()).resources.health, 18); assert.equal((await readState()).hauntings[0].hp, 11);
  await tileClick(1, 5); assert.equal((await readState()).turns, 2); assert.equal((await readState()).hauntings[0].hp, 13);
  await action('undo'); assert.equal((await readState()).turns, 1);
  await reload(); await action('continue'); assert.equal((await readState()).hauntings[0].hp, 11);
  await tileClick(2, 3); assert.ok(await evaluate('/wasted/.test(document.querySelector(".hh-action-detail").innerText)'));
  await action('use'); assert.equal((await readState()).supplies[0].used, true);
  fixture = baseFixture(); fixture.resources.health = 4; addHaunting(fixture, { hp: 6, maxHp: 6 });
  await inject(fixture); await tileClick(4, 3); await action('attack');
  assert.ok(await evaluate('document.querySelector("dialog").open')); assert.equal((await readState()).turns, 0);
  await key('Escape'); assert.equal((await readState()).turns, 0);
  await action('attack'); await action('confirm-lethal'); assert.equal((await readState()).status, 'dead');
  await action('undo'); assert.equal((await readState()).status, 'active');
  // Keyboard exploration: arrows only focus; Enter activates the focused floor.
  await inject(baseFixture()); await click('[data-action=tile][data-x="3"][data-y="3"]');
  await key('ArrowLeft'); assert.equal((await readState()).turns, 0);
  await key('Enter'); assert.equal((await readState()).turns, 1);
  await key('z'); assert.equal((await readState()).turns, 0);
  // Replay one complete solver witness through UI events, checking the save after every action.
  let expected = createGame('winter-ink'); const witness = solve(expected); assert.ok(witness.solved); await inject(expected);
  for (const a of witness.actions) {
    if (a.type === 'move') {
      await click(`[data-action=room][data-id="${a.to.roomId}"]`); await tileClick(a.to.x, a.to.y);
      // Passage endpoints inspect first; the solver uses ordinary relocation to them.
      // Follow this exact destination using an exposed empty endpoint button.
      if ((await readState()).turns === expected.turns) {
        assert.ok(await evaluate('!!document.querySelector("[data-action=stand]")')); await action('stand');
      }
    } else if (a.type === 'travel' || a.type === 'unlock') {
      const c = expected.connections.find(c => c.id === a.connectionId); const from = a.type === 'travel' ? a.from : [c.a, c.b].find(p => expected.rooms.find(r => r.id === p.roomId).discovered[p.y * expected.rooms.find(r => r.id === p.roomId).width + p.x]);
      await click(`[data-action=room][data-id="${from.roomId}"]`); await tileClick(from.x, from.y); await action(a.type);
    } else if (a.type === 'attack' || a.type === 'use') {
      const entity = a.type === 'attack' ? expected.hauntings.find(h => h.id === a.hauntingId) : expected.supplies.find(x => x.id === a.supplyId);
      await click(`[data-action=room][data-id="${entity.position.roomId}"]`); await tileClick(entity.position.x, entity.position.y);
      if (a.type === 'attack') { await action(a.mode === 'strike' ? 'strike-mode' : 'flare-mode'); await action('attack'); } else await action('use');
    } else if (a.type === 'settle') {
      const p = expected.objective.altar; await click(`[data-action=room][data-id="${p.roomId}"]`); await tileClick(p.x, p.y); await action('settle');
    } else await action(a.type);
    expected = act(expected, a).state; assert.deepEqual(await readState(), JSON.parse(JSON.stringify(expected)), JSON.stringify(a));
  }
  assert.equal((await readState()).status, 'won');
  for (const width of [768, 390, 320]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 700 });
    fixture = baseFixture({ width: 9, height: 9 }); addHaunting(fixture); addSupply(fixture); await inject(fixture);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `${width}px page does not overflow`);
    assert.ok(await evaluate('document.querySelector(".hh-tile").getBoundingClientRect().width >= 28'), `${width}px tiles stay usable`);
    await tileClick(4, 3); await screenshot(`inspection-${width}-v3`);
    if (width < 700) {
      await command('Emulation.setTouchEmulationEnabled', { enabled: true });
      await evaluate('document.querySelector("[data-action=attack]").scrollIntoView({block:"center"})');
      const p = await evaluate('(() => { const r = document.querySelector("[data-action=attack]").getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()');
      await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] }); await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal((await readState()).turns, 1); await command('Emulation.setTouchEmulationEnabled', { enabled: false });
    }
  }
  assert.equal(await evaluate("localStorage.getItem('unrelated-game-fixture')"), 'untouched');
  assert.deepEqual(exceptions, []); assert.deepEqual(badResponses, []);
  console.log('Browser checks passed: generated worker, complete UI witness, desktop/tablet/mobile, keyboard, touch, saves, confirmation and undo.');
} finally { ws?.close(); chrome.kill(); await new Promise(done => server.close(done)); }
