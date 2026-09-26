import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const page = fileURLToPath(new URL('./haunted_house.html', import.meta.url));
const runtimeTag = '<script defer src="./haunted-build/haunted-house.js"></script>';
const styleTag = '<link rel="stylesheet" href="./haunted-build/haunted-house.css" />';

export default defineConfig({
  base: './',
  publicDir: false,
  server: { watch: { ignored: ['**/.haunted-checks/**', '**/*-build/**', '**/tmp/**'] } },
  plugins: [{
    name: 'haunted-house-static-entry',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        if (!context.path.endsWith('/haunted_house.html')) return html;
        return html.replace(styleTag, '').replace(runtimeTag, '<script type="module" src="./src/haunted-house/main.ts"></script>');
      },
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'haunted_house.html', source: readFileSync(page, 'utf8').replaceAll('./haunted-build/', './') });
      // Keep the return link useful when serving this build directory alone.
      this.emitFile({ type: 'asset', fileName: 'index.html', source: '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Haunted House</title><body><main><h1>Haunted House</h1><p><a href="./haunted_house.html">Enter Haunted House</a></p><p><a href="../index.html">Return to the minigames home page</a></p></main></body></html>' });
    },
  }],
  build: {
    outDir: 'haunted-build',
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./src/haunted-house/main.ts', import.meta.url)),
      name: 'HauntedHouseRuntime',
      formats: ['iife'],
      fileName: () => 'haunted-house.js',
      cssFileName: 'haunted-house',
    },
  },
});
