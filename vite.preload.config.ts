import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import { resolve } from 'node:path';

const EXTERNALIZED = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

export default defineConfig({
  resolve: {
    conditions: ['node'],
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  ssr: {
    // Keep electron + Node built-ins external, bundle everything else inline
    external: EXTERNALIZED,
    noExternal: true,
  },
  build: {
    outDir: 'out/preload',
    emptyOutDir: true,
    sourcemap: true,
    ssr: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/preload/index.ts'),
        gemini: resolve(__dirname, 'src/preload/gemini.ts'),
      },
      output: {
        format: 'cjs',
        entryFileNames: '[name].js',
      },
    },
  },
});
