import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  publicDir: false,
  server: { watch: { ignored: ['**/tmp/bomber-browser/**', '**/bomber-build/**'] } },
  build: {
    outDir: 'bomber-build',
    emptyOutDir: true,
    rollupOptions: { input: 'bomber_command.html' },
  },
});
