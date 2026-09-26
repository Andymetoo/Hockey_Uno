import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';

test('home preserves existing links and adds the separate Haunted House page', async () => {
  const home = await readFile(new URL('../../../index.html', import.meta.url), 'utf8');
  for (const page of ['hockey_card_proto.html', 'bomber_command.html', 'OuijaSimulator.html', 'haunted_house.html']) assert.ok(home.includes(`href="${page}"`));
});

test('root and standalone pages load compiled assets on ordinary static hosting', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const outDir = fileURLToPath(new URL('../../../.haunted-checks/static-build/', import.meta.url));
  await build({ root, configFile: fileURLToPath(new URL('../../../vite.haunted.config.ts', import.meta.url)), logLevel: 'silent', build: { outDir } });
  const page = await readFile(new URL('../../../haunted_house.html', import.meta.url), 'utf8');
  const built = await readFile(`${outDir}/haunted_house.html`, 'utf8');
  assert.match(page, /src="\.\/haunted-build\/haunted-house\.js"/);
  assert.match(page, /href="\.\/haunted-build\/haunted-house\.css"/);
  assert.match(built, /src="\.\/haunted-house\.js"/);
  assert.match(built, /href="\.\/haunted-house\.css"/);
  assert.doesNotMatch(page + built, /src="[^"]*\.ts"/);
  assert.ok((await stat(`${outDir}/haunted-house.js`)).size > 1000);
  assert.ok((await stat(`${outDir}/haunted-house.css`)).size > 1000);
});

test('dedicated development server loads the Haunted House source entry', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const server = await createServer({ root, configFile: fileURLToPath(new URL('../../../vite.haunted.config.ts', import.meta.url)), logLevel: 'silent', server: { host: '127.0.0.1', port: 0, open: false } });
  try {
    await server.listen();
    const port = server.httpServer.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/haunted_house.html`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /src="\.\/src\/haunted-house\/main\.ts"/);
    assert.doesNotMatch(html, /src="\.\/haunted-build/);
    const entry = await fetch(`http://127.0.0.1:${port}/src/haunted-house/main.ts`);
    assert.equal(entry.status, 200);
    assert.match(entry.headers.get('content-type'), /javascript/);
  } finally { await server.close(); }
});
