import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

test('static root and standalone build both load compiled browser files without a TypeScript server', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const artifacts = resolve(root, 'tmp/bomber-browser');
  await mkdir(artifacts, { recursive: true });
  const output = await mkdtemp(resolve(artifacts, 'static-build-'));
  // Build/cleanup must stay inside this one newly allocated test directory.
  assert.equal(dirname(output), artifacts);
  try {
    await build({ root, configFile: resolve(root, 'vite.bomber.config.ts'), logLevel: 'silent', build: { outDir: output } });
    const entry = await readFile(resolve(root, 'bomber_command.html'), 'utf8');
    const built = await readFile(resolve(output, 'bomber_command.html'), 'utf8');
    assert.match(entry, /src="\.\/bomber-build\/bomber-command\.js"/);
    assert.match(entry, /href="\.\/bomber-build\/bomber-command\.css"/);
    assert.match(built, /src="\.\/bomber-command\.js"/);
    assert.match(built, /href="\.\/bomber-command\.css"/);
    for (const html of [entry, built]) {
      assert.doesNotMatch(html, /src="[^"]*\.ts"/);
      assert.match(html, /rel="icon" href="data:image\/svg\+xml,/);
      assert.match(html, /id="boot-help"/);
    }
    assert.ok((await stat(resolve(output, 'bomber-command.js'))).size > 1000);
    assert.ok((await stat(resolve(output, 'bomber-command.css'))).size > 1000);
    const runtime = await readFile(resolve(output, 'bomber-command.js'), 'utf8');
    assert.doesNotMatch(runtime, /\bimport\.meta\b|\bfrom\s*["']\.\//);
  } finally {
    assert.equal(dirname(output), artifacts);
    await rm(output, { recursive: true, force: true });
  }
});
