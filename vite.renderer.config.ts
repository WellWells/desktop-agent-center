import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  // Use relative asset paths so packaged Electron (file://) can load CSS/JS correctly.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'out/renderer'),
    emptyOutDir: true,
    // Shiki language grammars (e.g. cpp ~626 kB, emacs-lisp ~780 kB) and the
    // Oniguruma WASM (~622 kB) are lazy-loaded on demand — they are never all
    // loaded at once.  Raising the warning threshold avoids false-positive
    // "chunk too large" noise for these unavoidably-large but lazy assets.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html'),
        capture: resolve(__dirname, 'src/renderer/capture.html'),
      },
      output: {
        // Split heavy vendor libraries into named chunks so they are cached
        // independently and the main entry chunk stays lean.
        manualChunks(id: string) {
          // KaTeX rendering engine (~300 kB) — loaded with every markdown view
          if (id.includes('node_modules/katex')) return 'vendor-katex';
          // remark / rehype / micromark / unified / hast / unist ecosystem
          if (
            id.includes('node_modules/react-markdown') ||
            id.includes('node_modules/remark-') ||
            id.includes('node_modules/rehype-') ||
            id.includes('node_modules/micromark') ||
            id.includes('node_modules/unified') ||
            id.includes('node_modules/mdast-') ||
            id.includes('node_modules/hast-') ||
            id.includes('node_modules/unist-') ||
            id.includes('node_modules/vfile') ||
            id.includes('node_modules/decode-named-character-reference') ||
            id.includes('node_modules/character-entities')
          ) return 'vendor-markdown';
          // React core
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/')
          ) return 'vendor-react';
          // Icon library
          if (id.includes('node_modules/lucide-react')) return 'vendor-lucide';
          // State management
          if (id.includes('node_modules/zustand')) return 'vendor-state';
        },
      },
    },
  },
});
