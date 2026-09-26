// Real Chromium smoke test against compiled files on an ordinary HTTP server.
// Run `npm run build:haunted` first. CHROME_PATH may select another Chromium binary.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame } from '../generation.ts';
import { act, candle, interactions } from '../game.ts';
import { SAVE_KEY } from '../persistence.ts';

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
    for (let attempt = 0; attempt < 120; attempt++) { if (await evaluate(expression)) return; await sleep(50); }
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
  console.log('Checking navigation and gameplay');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate('/index.html', '!!document.querySelector(".button-row")');
  for (const page of ['hockey_card_proto.html', 'bomber_command.html', 'OuijaSimulator.html', 'haunted_house.html']) assert.ok(await evaluate(`!!document.querySelector('a[href="${page}"]')`));
  await click('a[href="haunted_house.html"]');
  await waitFor('!!document.querySelector("[data-action=new]")');
  await evaluate(`localStorage.removeItem(${JSON.stringify(SAVE_KEY)}); localStorage.setItem('unrelated-game-fixture', 'untouched')`);
  await reload(); await screenshot('desktop-menu');
  await action('new');
  assert.equal((await readState()).turn, 0);
  await inject(createGame('browser-verification'));
  const initial = await readState();
  assert.equal(await evaluate('document.querySelectorAll(".hh-tile").length'), 81);
  assert.equal(await evaluate('document.querySelectorAll(".hh-tile.is-lit").length'), 5);
  assert.equal(await evaluate('[...document.querySelectorAll(".hh-tile.is-dark")].every(tile => tile.getAttribute("aria-label").includes("Unexplored darkness"))'), true);
  await screenshot('desktop-game');

  await key('ArrowUp');
  assert.deepEqual((await readState()).player, { ...initial.player, y: initial.player.y - 1 });
  assert.equal((await readState()).turn, 1);
  assert.equal(await evaluate('scrollY'), 0, 'movement must not scroll');
  await key('ArrowUp', true);
  assert.equal((await readState()).turn, 1, 'held keys cannot chain turns');
  await action('help'); await key('ArrowDown');
  assert.equal((await readState()).turn, 1, 'rules do not spend turns');
  assert.ok(await evaluate('document.querySelector("dialog").innerText.includes("orthogonally")'));
  await key('Escape');
  assert.equal(await evaluate('!!document.querySelector("dialog")'), false);
  assert.equal(await evaluate('document.activeElement.dataset.action'), 'help');
  await action('legend'); await action('close-dialog');
  await action('journal');
  assert.equal(await evaluate('document.querySelectorAll(".hh-journal-room").length'), 1);
  await action('close-dialog');

  await action('match-mode'); await action('direction-north');
  assert.equal((await readState()).turn, 1, 'selecting a target is free');
  await action('commit-match');
  assert.equal((await readState()).turn, 2);
  assert.equal((await readState()).matches, initial.matches - 1);
  assert.equal(await evaluate('document.querySelectorAll(".hh-clue").length'), 1);
  await action('wait'); await action('wait');
  assert.equal((await readState()).turn, 4);
  assert.equal(await evaluate('document.querySelectorAll(".hh-clue").length'), 0);
  const resumed = await readState();
  await reload(); await action('continue');
  assert.deepEqual(await readState(), resumed);
  await action('wait');
  assert.deepEqual(await readState(), act(resumed, { type: 'wait' }).state);

  await action('new'); assert.ok(await evaluate('!!document.querySelector("dialog")'));
  await action('close-dialog'); assert.equal((await readState()).seed, initial.seed);
  await action('restart'); await action('confirm-start');
  assert.deepEqual(await readState(), initial);
  await action('new'); await action('confirm-start');
  assert.notEqual((await readState()).seed, initial.seed);

  // Narrow viewport + an actual touchscreen tap (not a synthetic click).
  await inject(initial);
  for (const width of [390, 320]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${width}px viewport overflow`);
    await screenshot(`mobile-${width}`);
    await action('help');
    assert.equal(await evaluate('document.querySelector("dialog").getBoundingClientRect().right <= innerWidth'), true);
    await screenshot(`mobile-${width}-rules`); await action('close-dialog');
  }
  await command('Emulation.setTouchEmulationEnabled', { enabled: true });
  const beforeTouch = await readState();
  const selector = `[data-action=tile][data-x="${beforeTouch.player.x}"][data-y="${beforeTouch.player.y - 1}"]`;
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
  const point = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, radiusX: 1, radiusY: 1, force: 1, id: 0 }] });
  await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitFor(`JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})).turn === 1`);
  assert.equal((await readState()).player.y, beforeTouch.player.y - 1);

  // UI gates search/travel commits behind explicit target selection.
  let fixture = createGame('browser-context');
  const room = fixture.rooms.find(r => r.containers.some(c => c.item));
  const container = room.containers.find(c => c.item);
  fixture.player = { roomId: room.id, x: container.x, y: container.y + 1 };
  fixture = act(fixture, { type: 'wait' }).state;
  await inject(fixture);
  const search = interactions(fixture).find(i => i.action.type === 'search');
  await click(`[data-action=select-interaction][data-id="${search.id}"]`);
  assert.equal((await readState()).turn, fixture.turn);
  await action('commit-interaction');
  assert.ok((await readState()).inventory.includes(container.item));

  // Honest reading with an invisible adjacent spirit and a single-use charm.
  fixture = createGame('browser-contact');
  fixture.spirit = { ...fixture.player, y: fixture.player.y - 1 };
  await inject(fixture);
  assert.equal(await evaluate('document.querySelector(".hh-candle-reading h2").textContent'), 'Guttering');
  assert.equal(await evaluate('[...document.querySelectorAll(".hh-tile")].some(t => /spirit present/i.test(t.getAttribute("aria-label")))'), false);
  await key('ArrowUp'); assert.equal((await readState()).charm, false);
  await key('ArrowUp'); assert.equal((await readState()).status, 'lost');
  assert.ok(await evaluate('!!document.querySelector(".hh-ending")')); await screenshot('defeat');
  await reload(); await action('continue'); assert.equal((await readState()).status, 'lost');

  // A well-formed objective-complete fixture exercises the final leave control.
  fixture = createGame('browser-win');
  for (const r of fixture.rooms) for (const c of r.containers) if (c.item) { c.opened = true; fixture.inventory.push(c.item); }
  fixture.objective.completed = true;
  await inject(fixture);
  await click('[data-action=select-interaction][data-id=leave]'); await action('commit-interaction');
  assert.equal((await readState()).status, 'won'); await screenshot('victory');

  // No automatic overwrite/regeneration on unreadable or incompatible saves.
  for (const raw of ['{broken save', JSON.stringify({ version: 999 })]) {
    await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(raw)})`); await reload();
    assert.equal(await evaluate('!!document.querySelector("[data-action=continue]")'), false);
    assert.ok(await evaluate('!!document.querySelector("[data-action=download-save]")'));
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(SAVE_KEY)})`), raw);
    await action('new'); await action('close-dialog');
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(SAVE_KEY)})`), raw);
  }
  await action('new'); await action('confirm-start');
  await evaluate('Storage.prototype.setItem = function(){ throw new DOMException("Full", "QuotaExceededError") }');
  await action('wait');
  assert.match(await evaluate('document.querySelector(".hh-save-status").textContent'), /Not saved/);
  assert.equal(await evaluate('localStorage.getItem("unrelated-game-fixture")'), 'untouched');
  await screenshot('storage-failure');

  // Standalone build entry also serves the same runtime without source/TS tooling.
  await navigate('/haunted-build/haunted_house.html', '!!document.querySelector("[data-action=new]")');
  assert.equal(await evaluate('document.title'), 'Haunted House');
  assert.deepEqual(exceptions, [], 'no browser runtime exceptions');
  assert.deepEqual(badResponses.filter(url => !url.endsWith('/favicon.ico')), [], 'no failed page/assets requests');
  console.log('Browser smoke passed: static navigation, keyboard/touch, targeting, rules/journal, saves, restart/new, clue expiry, charm/defeat/victory, 320/390px layouts, storage errors.');
  console.log(`Screenshots: ${artifacts}`);
  try { await command('Browser.close'); } catch {}
} finally {
  ws?.close(); chrome.kill(); server.closeAllConnections();
  await new Promise(done => server.close(done));
}
