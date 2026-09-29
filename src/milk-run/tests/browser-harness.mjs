// Dependency-free Chromium harness shared by the presentation/interaction checks.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAVE_KEY } from '../persistence.mjs';

export const sleep = ms => new Promise(done => setTimeout(done, ms));

export async function openBrowser({ port = 9338, artifactFolder = 'ux' } = {}) {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const artifacts = resolve(root, 'src/milk-run/.checks', artifactFolder);
  await mkdir(artifacts, { recursive: true });
  const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.csv': 'text/csv', '.png': 'image/png' };
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
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${resolve(artifacts, 'browser-profile')}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions',
    '--no-sandbox', '--disable-gpu', 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let launchError, ws;
  chrome.on('error', error => { launchError = error; });
  const exceptions = [], badResponses = [];
  const close = async () => { ws?.close(); chrome.kill(); await new Promise(done => server.close(done)); };
  try {
    let pages;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (launchError) throw launchError;
      try {
        pages = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) }).then(r => r.json());
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
        const task = pending.get(message.id); pending.delete(message.id);
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
        pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
      });
    }
    async function evaluate(expression) {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    }
    async function waitFor(expression) {
      for (let attempt = 0; attempt < 200; attempt++) { if (await evaluate(expression)) return; await sleep(50); }
      throw new Error(`Timed out: ${expression}`);
    }
    async function click(selector) {
      assert.ok(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), `Exists: ${selector}`);
      assert.ok(await evaluate(`!document.querySelector(${JSON.stringify(selector)}).disabled`), `Enabled: ${selector}`);
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
    }
    async function touch(selector) {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'center',behavior:'instant'})`);
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(40);
    }
    async function viewport(width, height) {
      await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
      await command('Emulation.setTouchEmulationEnabled', { enabled: width < 768 }); await sleep(75);
    }
    async function screenshot(name) {
      const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(resolve(artifacts, `${name}.png`), Buffer.from(result.data, 'base64'));
    }
    async function reload() {
      await evaluate('window.__milkOldPage = true'); await command('Page.reload');
      await waitFor('!window.__milkOldPage && !!window.milkRun');
    }
    async function inject(state, extra = {}) {
      const session = { version: 1, state, view: state, pending: [], log: [], current: null, speed: 'instant', ...extra };
      await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(JSON.stringify(session))})`); await reload();
    }
    await command('Runtime.enable'); await command('Network.enable'); await command('Page.enable');
    const version = await command('Browser.getVersion');
    await command('Page.navigate', { url: `${base}/src/milk-run/index.html` }); await waitFor('!!window.milkRun');
    return { artifacts, base, version, exceptions, badResponses, command, evaluate, waitFor, click, touch,
      viewport, screenshot, reload, inject, close,
      flush: () => evaluate('window.milkRun.flush()'),
      getState: () => evaluate('window.milkRun.getState()'),
      getView: () => evaluate('window.milkRun.getView()'),
      current: () => evaluate('window.milkRun.exportSession().current'),
      writeResults: result => writeFile(resolve(artifacts, 'browser-results.json'), JSON.stringify(result, null, 2)),
    };
  } catch (error) { await close(); throw error; }
}
