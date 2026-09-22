import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const page = fileURLToPath(new URL('./bomber_command.html', import.meta.url));
const runtimeTag = '<script defer src="./bomber-build/bomber-command.js"></script>';
const styleTag = '<link rel="stylesheet" href="./bomber-build/bomber-command.css" />';

export default defineConfig({
  base: './',
  publicDir: false,
  server: { watch: { ignored: ['**/tmp/bomber-browser/**', '**/bomber-build/**'] } },
  plugins: [{
    name: 'bomber-static-entry',
    // The checked-in page works on an ordinary static server. Only Vite dev
    // replaces its compiled runtime with the authoritative source entry.
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(styleTag, '').replace(runtimeTag, '<script type="module" src="./src/bomber-command/main.ts"></script>');
      },
    },
    generateBundle() {
      // Also provide a self-contained build directory for preview/static hosts.
      this.emitFile({ type: 'asset', fileName: 'bomber_command.html', source: readFileSync(page, 'utf8').replaceAll('./bomber-build/', './') });
    },
  }],
  build: {
    outDir: 'bomber-build',
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./src/bomber-command/main.ts', import.meta.url)),
      name: 'BomberCommandRuntime',
      formats: ['iife'],
      fileName: () => 'bomber-command.js',
      cssFileName: 'bomber-command',
    },
  },
});
