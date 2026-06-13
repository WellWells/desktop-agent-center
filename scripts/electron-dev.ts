/**
 * scripts/electron-dev.ts
 *
 * Development orchestrator using native Vite 8 (no electron-vite):
 *  1. Starts a Vite dev server for the renderer (HMR enabled)
 *  2. Watches & rebuilds the preload bundle — restarts Electron on change
 *  3. Watches & rebuilds the main process bundle — restarts Electron on change
 *
 * Run with:  tsx scripts/electron-dev.ts
 */

import { build, createServer, type Plugin } from 'vite';
import { spawn, type ChildProcess } from 'node:child_process';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const electronBin = require('electron') as string;

let electronProcess: ChildProcess | null = null;
let rendererUrl = '';

// Debounce so simultaneous preload + main rebuilds only restart Electron once
let restartTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRestart() {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    electronProcess?.kill();
    electronProcess = spawn(electronBin, ['out/main/index.js'], {
      stdio: 'inherit',
      env: { ...process.env, ELECTRON_RENDERER_URL: rendererUrl },
    });
  }, 300);
}

function watcherPlugin(): Plugin {
  return {
    name: 'electron-restart',
    closeBundle() {
      scheduleRestart();
    },
  };
}

async function main() {
  // Step 1: Start renderer Vite dev server
  const server = await createServer({ configFile: 'vite.renderer.config.ts' });
  await server.listen();
  server.printUrls();

  rendererUrl = server.resolvedUrls?.local[0] ?? 'http://localhost:5173';

  // Step 2: Watch preload (restart electron on rebuild)
  await build({
    configFile: 'vite.preload.config.ts',
    build: { watch: {} },
    plugins: [watcherPlugin()],
  });

  // Step 3: Watch main process (restart electron on rebuild)
  await build({
    configFile: 'vite.main.config.ts',
    build: { watch: {} },
    plugins: [watcherPlugin()],
  });

  // Clean up on exit
  process.on('SIGINT', () => {
    electronProcess?.kill();
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
