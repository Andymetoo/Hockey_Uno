// Optional real-Chrome smoke test. Start an isolated Chrome with remote debugging first.
// CHROME_PORT defaults to 9225; BOMBER_URL defaults to the local Vite dev entry.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCampaign } from '../game.ts';
import { SAVE_KEY, LEGACY_KEY } from '../persistence.ts';

const base = process.env.BOMBER_URL ?? 'http://127.0.0.1:5174/bomber_command.html';
const pages = await fetch(`http://127.0.0.1:${process.env.CHROME_PORT ?? 9225}/json/list`).then(r => r.json());
const page = pages.find(p => p.type === 'page');
assert.ok(page, 'Open a blank page in the isolated debugging browser');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0; const pending = new Map(), errors = [], networkErrors = [];
ws.addEventListener('message', event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.reject(m.error); else p.resolve(m.result); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ': ' + m.params.exceptionDetails.exception?.description);
  if (m.method === 'Network.responseReceived' && (m.params.response.status >= 400 || (m.params.type === 'Script' && m.params.response.mimeType === 'video/mp2t'))) networkErrors.push(`${m.params.response.status} ${m.params.response.mimeType} ${m.params.response.url}`);
});
function command(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; }
async function waitFor(expression) { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 50)); } throw new Error(`Timed out: ${expression}`); }
async function click(selector) { assert.ok(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), selector); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
const action = name => click(`[data-action="${name}"]`);
async function load() { await evaluate('window.__browserTestNavigation = true'); await command('Page.reload'); await waitFor('!window.__browserTestNavigation && !!document.querySelector("nav")'); }
const getState = () => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)}))`);
async function screenshot(name) {
  const metrics = await command('Page.getLayoutMetrics');
  const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: metrics.cssContentSize.width, height: metrics.cssContentSize.height, scale: 1 } });
  await writeFile(`tmp/bomber-browser/${name}.png`, Buffer.from(result.data, 'base64'));
}
try {
  await mkdir('tmp/bomber-browser', { recursive: true });
  await command('Runtime.enable'); await command('Page.enable'); await command('Network.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: base }); await waitFor('!!document.querySelector("nav")');
  const guided = createCampaign(3030, Date.now());
  await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(JSON.stringify(guided))})`); await load();
  assert.equal(await evaluate('document.querySelector("dialog h2")?.textContent'), 'Your operations desk');
  await screenshot('desktop-tutorial');
  await action('tutorial-continue');
  assert.equal(await evaluate('document.querySelector("dialog h2")?.textContent'), 'Build the package');
  await action('tutorial-continue');
  assert.deepEqual((await getState()).tutorial.seen, ['intro', 'planning']);
  await action('review');
  assert.equal(await evaluate('document.querySelector("dialog h2")?.textContent'), 'Check the commitment');
  await action('tutorial-continue');
  assert.equal(await evaluate('document.querySelector("dialog h2")?.textContent'), 'Sign the flying order');
  await action('cancel');
  await action('review'); await action('confirm-dispatch');
  assert.equal(await evaluate('document.querySelector("dialog h2")?.textContent'), 'While they are away');
  await action('tutorial-continue'); await load();
  assert.equal(await evaluate('!!document.querySelector("dialog")'), false);
  await action('skip-return');
  assert.equal(await evaluate('document.querySelector("dialog h2")?.textContent'), 'Read the return report');
  await action('tutorial-continue');
  assert.ok(await evaluate('document.querySelector(".report-assessment")?.innerText.length > 30'));
  assert.equal(await evaluate('!!document.querySelector(".flight-highlight")'), (await getState()).reports[0].results.some(f => f.details?.length));
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await action('tutorial-help'); await click('[data-tutorial-open="return"]');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  assert.equal(await evaluate('(() => { const r = document.querySelector("dialog").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight + 1; })()'), true);
  await screenshot('mobile-tutorial');
  const guideViewport = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile('tmp/bomber-browser/mobile-tutorial-viewport.png', Buffer.from(guideViewport.data, 'base64'));
  await action('tutorial-continue');
  assert.deepEqual((await getState()).tutorial.seen, ['intro', 'planning', 'dispatch', 'underway', 'return']);
  await action('tutorial-help');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate('document.activeElement.dataset.action'), 'tutorial-help');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  // Only Bomber keys in this isolated profile are changed; sibling game data is never touched.
  const initial = createCampaign(2026, Date.now());
  initial.tutorial.disabled = true;
  await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(JSON.stringify(initial))})`); await load();
  assert.equal(await evaluate('document.querySelectorAll("[data-aircraft]").length'), 6);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await screenshot('desktop-today');
  const before = await getState();
  await click('[name="route"][value="dogleg"]'); await click('[name="orders"][value="press"]');
  await action('review'); assert.equal(await evaluate('document.querySelector("dialog").open'), true);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate('!!document.querySelector("dialog")'), false);
  assert.equal(await evaluate('document.activeElement.dataset.action'), 'review');
  await action('review'); await action('confirm-dispatch');
  let state = await getState(); assert.ok(state.active); assert.equal(state.active.plan.route, 'dogleg'); assert.equal(state.active.plan.orders, 'press');
  assert.ok(await evaluate('document.body.innerText.includes("It is safe to leave")'));
  const outcome = state.active.report; await load(); assert.deepEqual((await getState()).active.report, outcome);
  await screenshot('desktop-dispatched');
  await action('skip-return'); state = await getState(); assert.equal(state.completed, 1); assert.equal(state.active, null);
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await screenshot('mobile-return');
  const viewport = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile('tmp/bomber-browser/mobile-viewport.png', Buffer.from(viewport.data, 'base64'));
  for (const tab of ['squadron', 'tour', 'today']) { await click(`[data-tab="${tab}"]`); assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true); }
  await click('[data-tab="squadron"]'); await screenshot('mobile-squadron'); await click('[data-tab="today"]');
  // Complete the tour with real UI actions, taking a stand-down only when no fit package exists.
  while ((state = await getState()).phase === 'active') {
    if (await evaluate('!!document.querySelector("[data-action=prepare-morning]")')) await action('prepare-morning');
    const branch = await evaluate('document.querySelector("[data-event-kind=branch]")?.dataset.decision');
    if (branch) await click(`[data-decision="${branch}"]:not(:disabled)`);
    await action('propose');
    if (await evaluate('document.querySelector("[data-action=review]").disabled')) await action('standdown');
    else await action('review');
    await action('confirm-dispatch'); await action('skip-return');
    const returned = await getState();
    if ([3, 7, 10].includes(returned.completed)) {
      assert.ok(returned.assignments[returned.completed].followup);
      assert.ok(await evaluate('document.querySelector("[data-tutorial-target=briefing]")?.innerText.includes("From the last operation")'));
      await screenshot(`mobile-branch-${returned.completed + 1}`);
    }
  }
  if ((await getState()).phase === 'closing') await action('skip-all');
  state = await getState(); assert.equal(state.phase, 'ended'); assert.equal(state.completed, 14);
  await screenshot('mobile-ending');
  await action('new'); await action('confirm-new');
  assert.equal((await getState()).completed, 0);
  assert.ok(await evaluate(`Object.keys(localStorage).some(k => k.startsWith(${JSON.stringify(SAVE_KEY + '-archive')}))`));
  // Verify the edition transition in the rendered application.
  await evaluate(`localStorage.removeItem(${JSON.stringify(SAVE_KEY)}); localStorage.setItem(${JSON.stringify(LEGACY_KEY)}, '{"version":11,"marker":"untouched"}')`); await load();
  assert.ok(await evaluate('document.body.innerText.includes("earlier campaign is preserved")'));
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(LEGACY_KEY)})`), '{"version":11,"marker":"untouched"}');
  await click('[data-tab="tour"]');
  const importPath = resolve('tmp/bomber-browser/import-test.json');
  await writeFile(importPath, '{"version":999}');
  let dom = await command('DOM.getDocument');
  let fileNode = await command('DOM.querySelector', { nodeId: dom.root.nodeId, selector: '[data-save-file]' });
  const beforeInvalidImport = await getState();
  await command('DOM.setFileInputFiles', { nodeId: fileNode.nodeId, files: [importPath] });
  await waitFor('document.body.innerText.includes("The file was not restored")');
  assert.deepEqual(await getState(), beforeInvalidImport);
  await writeFile(importPath, JSON.stringify(initial));
  dom = await command('DOM.getDocument');
  fileNode = await command('DOM.querySelector', { nodeId: dom.root.nodeId, selector: '[data-save-file]' });
  await command('DOM.setFileInputFiles', { nodeId: fileNode.nodeId, files: [importPath] });
  await waitFor('document.body.innerText.includes("Your saved tour has been restored")');
  assert.equal((await getState()).seed, initial.seed);
  // Exercise the connected strain -> leave -> relief and defect -> inspection -> certification paths.
  const content = createCampaign(2026, Date.now());
  content.tutorial.disabled = true;
  content.crews[0].strain = 3; content.crews[0].fatigue = 70;
  content.aircraft[0].defect = true; content.aircraft[0].defectType = 'controls'; content.aircraft[0].condition = 60;
  content.assignments[0].circumstance = 'flak';
  await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(JSON.stringify(content))})`); await load();
  assert.ok(await evaluate('document.body.innerText.includes("Guns along the approach")'));
  await screenshot('mobile-station-decisions');
  await click('[data-choice="leave"]'); await click('[data-choice="bench"]');
  let changed = await getState(); assert.equal(changed.crews[0].leaveThrough, 1); assert.equal(changed.support, content.support - 1);
  assert.ok(await evaluate('document.body.innerText.includes("Today’s two station decisions are entered")'));
  await action('skip-next'); changed = await getState(); assert.equal(changed.aircraft[0].defect, false); assert.equal(changed.aircraft[0].certified, 2);
  await action('propose'); await action('review'); await action('confirm-dispatch'); await action('skip-return');
  changed = await getState(); assert.equal(changed.crews[0].strain, 0); assert.equal(changed.crews[0].fatigue, 0);
  assert.ok(await evaluate('document.body.innerText.includes("promised assignment off is complete")'));
  await screenshot('mobile-follow-up');
  // Migrate an actual pre-pass fixture, including the active operation, in the running UI.
  const oldRaw = await readFile(new URL('./fixtures/v20-active.json', import.meta.url), 'utf8');
  await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(oldRaw)})`); await load();
  const migrated = await getState(); assert.equal(migrated.version, 22); assert.deepEqual(migrated.active.report, JSON.parse(oldRaw).active.report);
  assert.ok(await evaluate('document.body.innerText.includes("earlier station book was backed up")'));
  assert.deepEqual(errors, []);
  assert.deepEqual(networkErrors, []);
  console.log(JSON.stringify({ browser: 'Chrome via CDP', url: base, desktop: '1280×900', mobile: '390×844', assignmentsCompleted: state.completed, effectiveStrikes: state.contribution, checks: 'tutorial timing and viewport, reports, linked briefs, views, overflow, dispatch, reload, acceleration, full tour, save restoration and v20 migration', runtimeErrors: errors.length, originalSeed: before.seed }, null, 2));
} catch (e) { console.error(await evaluate('document.body.innerText')); throw e; } finally { ws.close(); }
