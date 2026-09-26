// Real Chromium smoke test against compiled files on an ordinary HTTP server.
// Run `npm run build:haunted` first. CHROME_PATH may select another Chromium binary.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame } from '../generation.ts';
import { act, interactions } from '../game.ts';
import { SAVE_KEY, LEGACY_KEY } from '../persistence.ts';
import { orderingFixture, baseFixture, addHaunting, addCandle, position } from './fixtures.mjs';

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
  await evaluate(`localStorage.removeItem(${JSON.stringify(SAVE_KEY)}); localStorage.removeItem(${JSON.stringify(LEGACY_KEY)}); localStorage.setItem('unrelated-game-fixture', 'untouched')`);
  await reload(); await screenshot('desktop-menu-v2');
  await action('new');
  assert.equal((await readState()).light, 4);
  assert.equal((await readState()).ritualPower, 1);
  assert.equal(await evaluate('/guttering|movement beat|charm|strike a match|spirit moves in/i.test(document.body.innerText)'), false);
  await screenshot('desktop-game-v2');

  const tileClick = (x, y) => click(`[data-action=tile][data-x="${x}"][data-y="${y}"]`);
  const select = id => click(`[data-action=select-interaction][data-id="${id}"]`);
  let fixture = orderingFixture();
  await inject(fixture);
  await tileClick(4, 3);
  assert.equal((await readState()).decisions, 0, 'inspection is free');
  assert.ok(await evaluate('document.querySelector(".hh-action-detail").getBoundingClientRect().left > document.querySelector(".hh-board").getBoundingClientRect().right'), 'desktop decisions sit beside the map');
  assert.ok(await evaluate('document.querySelector(".hh-resource-icon svg").getBoundingClientRect().height < 40'), 'resource glyph stays compact');
  await screenshot('desktop-decision-v2');
  assert.ok(await evaluate('/6 light/.test(document.body.innerText)'), 'initial strong guardian cost is shown');
  assert.ok(await evaluate('document.querySelector("[data-action=commit-interaction]")?.disabled'), 'insufficient light disables commitment');
  await tileClick(3, 2);
  assert.ok(await evaluate('/2.*wasted/.test(document.body.innerText)'), 'candle preview shows wasted restoration');
  assert.equal((await readState()).candles[0].used, false);
  await tileClick(2, 3); await action('commit-interaction');
  assert.equal((await readState()).light, 2); assert.equal((await readState()).ritualPower, 2);
  await tileClick(3, 2); await action('commit-interaction');
  assert.equal((await readState()).light, 5);
  await tileClick(4, 3); await action('commit-interaction');
  assert.equal((await readState()).light, 0); assert.equal((await readState()).status, 'active');
  const solvedCluster = await readState();
  await reload(); await action('continue'); assert.deepEqual(await readState(), solvedCluster);
  await key('ArrowRight');
  assert.equal((await readState()).light, 0, 'zero light still permits movement');
  await action('undo');
  assert.deepEqual(await readState(), act(solvedCluster, { type: 'undo' }).state, 'undo restores snapshot position/discovery too');
  await tileClick(4, 3); await action('commit-interaction');
  await key('ArrowLeft'); await key('ArrowLeft'); await key('ArrowDown'); await key('ArrowDown');
  await select('leave'); await action('commit-interaction');
  assert.equal((await readState()).status, 'won'); await screenshot('victory-v2');
  await action('undo'); assert.equal((await readState()).status, 'active');

  // Bad ordering stays loadable, with an understandable local affordability problem.
  await inject(orderingFixture());
  await tileClick(3, 2); await action('commit-interaction');
  await tileClick(2, 3); await action('commit-interaction');
  assert.equal((await readState()).light, 3);
  const deadEnd = await readState();
  await reload(); await action('continue'); assert.deepEqual(await readState(), deadEnd);
  await tileClick(4, 3);
  assert.ok(await evaluate('document.querySelector("[data-action=commit-interaction]").disabled'));

  // Repeated movement keys, forms, dialogs and remembered inspection never spend resources.
  fixture = baseFixture(); await inject(fixture);
  await key('ArrowUp'); assert.equal((await readState()).steps, 1);
  assert.equal(await evaluate('scrollY'), 0);
  await key('ArrowUp', true); assert.equal((await readState()).steps, 1);
  await evaluate('const input=document.createElement("input"); input.id="smoke-input"; document.body.append(input); input.focus();');
  await key('ArrowDown'); assert.equal((await readState()).steps, 1);
  await evaluate('document.getElementById("smoke-input").remove()');
  await action('help'); await key('ArrowDown'); assert.equal((await readState()).steps, 1);
  assert.ok(await evaluate('/ritual power/i.test(document.querySelector("dialog").innerText)'));
  await key('Escape'); assert.equal(await evaluate('document.activeElement.dataset.action'), 'help');
  await action('legend'); await action('close-dialog');
  await action('journal'); await action('close-dialog');

  // Destination movement follows revealed routes, stops at discoveries, and never auto-uses objects.
  fixture = baseFixture(); fixture.player = position(1, 3);
  addCandle(fixture, 'new-candle', position(4, 2), 3);
  fixture.rooms[0].discovered[2 * 7 + 4] = false;
  await inject(fixture); await tileClick(5, 3);
  await waitFor(`JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})).player.x >= 2`);
  await sleep(600);
  assert.equal((await readState()).player.x, 3, 'newly discovered candle interrupts a queued route');
  assert.equal((await readState()).candles[0].used, false);
  assert.equal((await readState()).light, 4);
  fixture = baseFixture(); fixture.player = position(1, 3);
  addHaunting(fixture, 'approach-target', position(5, 3), 3, { power: 1 });
  await inject(fixture); await tileClick(5, 3); await action('approach');
  await waitFor(`JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})).player.x === 4`);
  assert.equal((await readState()).hauntings[0].banished, false);
  assert.equal((await readState()).decisions, 0);
  assert.equal((await readState()).light, 4);
  await action('commit-interaction'); assert.equal((await readState()).light, 2);
  await tileClick(5, 3);
  await waitFor(`JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})).player.x === 5`);
  assert.equal((await readState()).decisions, 1, 'clicking a cleared haunting walks without another decision');

  fixture = baseFixture({ width: 21 }); fixture.player = position(1, 3);
  await inject(fixture); await tileClick(19, 3); await action('help');
  const pausedSteps = (await readState()).steps; await sleep(350);
  assert.equal((await readState()).steps, pausedSteps, 'dialogs cancel pending movement');
  await action('close-dialog'); await tileClick(19, 3); await key('Escape');
  const cancelledSteps = (await readState()).steps; await sleep(350);
  assert.equal((await readState()).steps, cancelledSteps, 'Escape cancels the route');
  await tileClick(19, 3); await tileClick(1, 4); await sleep(650);
  assert.deepEqual((await readState()).player, position(1, 4), 'a new destination replaces the old route');

  // Same-seed restart versus a different new adventure.
  const generated = createGame('browser-new-and-restart'); await inject(generated);
  await key('ArrowUp'); await action('restart'); await action('close-dialog');
  assert.equal((await readState()).seed, generated.seed);
  await action('restart'); await action('confirm-start'); assert.deepEqual(await readState(), generated);
  await action('new'); await action('confirm-start'); assert.notEqual((await readState()).seed, generated.seed);

  // Tablet/phone layouts and a real touchscreen tap.
  await inject(orderingFixture());
  await command('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: true });
  await tileClick(2, 3);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, '768px viewport overflow');
  assert.ok(await evaluate('document.querySelector(".hh-ritual-preview").scrollWidth <= document.querySelector(".hh-ritual-preview").clientWidth'), 'tablet preview fits its panel');
  await screenshot('tablet-decision-v2');
  for (const width of [390, 320]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate('scrollTo(0, 0)');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${width}px viewport overflow`);
    await screenshot(`mobile-${width}-v2`);
    await tileClick(2, 3); await screenshot(`mobile-${width}-decision-v2`);
    await action('help');
    assert.equal(await evaluate('document.querySelector("dialog").getBoundingClientRect().right <= innerWidth'), true);
    await screenshot(`mobile-${width}-rules-v2`); await action('close-dialog');
  }
  await inject(baseFixture());
  await command('Emulation.setTouchEmulationEnabled', { enabled: true });
  const selector = '[data-action=tile][data-x="3"][data-y="4"]';
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
  const point = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, radiusX: 1, radiusY: 1, force: 1, id: 0 }] });
  await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitFor(`JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})).player.y === 4`);
  assert.equal((await readState()).light, 4);

  // Version1 belongs to earlier rules and is never converted or overwritten.
  const old = '{"version":1,"seed":"earlier-house"}';
  await evaluate(`localStorage.removeItem(${JSON.stringify(SAVE_KEY)}); localStorage.setItem(${JSON.stringify(LEGACY_KEY)}, ${JSON.stringify(old)})`);
  await reload();
  assert.equal(await evaluate('!!document.querySelector("[data-action=continue]")'), false);
  assert.ok(await evaluate('!!document.querySelector("[data-action=download-legacy]")'));
  await action('new');
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(LEGACY_KEY)})`), old);
  await reload(); await action('continue'); await action('journal');
  assert.ok(await evaluate('!!document.querySelector("[data-action=download-legacy]")'), 'earlier save download remains available after v2 reload');
  await action('close-dialog');
  for (const raw of ['{broken save', JSON.stringify({ version: 999 })]) {
    await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(raw)})`); await reload();
    assert.equal(await evaluate('!!document.querySelector("[data-action=continue]")'), false);
    assert.ok(await evaluate('!!document.querySelector("[data-action=download-save]")'));
    await action('new'); await action('close-dialog');
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(SAVE_KEY)})`), raw);
  }
  await inject(orderingFixture());
  await evaluate('Storage.prototype.setItem = function(){ throw new DOMException("Full", "QuotaExceededError") }');
  await tileClick(2, 3); await action('commit-interaction');
  assert.match(await evaluate('document.querySelector(".hh-save-status").textContent'), /Not saved/);
  assert.equal(await evaluate('localStorage.getItem("unrelated-game-fixture")'), 'untouched');
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(LEGACY_KEY)})`), old);
  await screenshot('storage-failure-v2');
  await navigate('/haunted-build/haunted_house.html', '!!document.querySelector("[data-action=new]")');
  assert.equal(await evaluate('document.title'), 'Haunted House');
  assert.deepEqual(exceptions, [], 'no browser runtime exceptions');
  assert.deepEqual(badResponses.filter(url => !url.endsWith('/favicon.ico')), [], 'no failed assets');
  console.log('Browser smoke passed: complete resource puzzle and escape, undo/resume, explicit costs/refills, dead-end saves, click routes/cancellation, keyboard/touch, phone layouts, old-save preservation, storage failures and static navigation.');
  console.log(`Screenshots: ${artifacts}`);
  try { await command('Browser.close'); } catch {}
} finally {
  ws?.close(); chrome.kill(); server.closeAllConnections();
  await new Promise(done => server.close(done));
}
