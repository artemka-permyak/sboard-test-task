import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  optimizeDeps: {
    // canvaskit-wasm is a CJS module; let Vite prebundle it so the default
    // export (`CanvasKitInit`) is exposed to ESM consumers.
    include: ['canvaskit-wasm'],
  },
  assetsInclude: ['**/*.wasm'],
  server: {
    fs: {
      allow: ['.', './node_modules'],
    },
  },
});
