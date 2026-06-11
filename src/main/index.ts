// src/main/index.ts — Electron main process entry point
//
// Thin orchestrator: app lifecycle wiring only. Setup logic lives in
// src/main/bootstrap/ (appSetup, traySetup, flowSetup, telegramSetup).

// Suppress url.parse() deprecation (DEP0169) emitted by third-party packages
{
  const _ew = process.emitWarning.bind(process);
  process.emitWarning = (warning: string | Error, ...args: unknown[]) => {
    const opts = args[0];
    if (opts && typeof opts === 'object' && (opts as Record<string, unknown>).code === 'DEP0169') return;
    (_ew as (w: string | Error, ...a: unknown[]) => void)(warning, ...args);
  };
}

// ── Global process safety net ─────────────────────────────────────────────────
// Must be registered before any async work starts to catch stray rejections
// from third-party libraries (e.g. GrammY AbortError on bot restart) that
// bypass all application-level try/catch blocks.
process.on('unhandledRejection', (reason: unknown) => {
  // AbortError is expected when the Telegram bot is intentionally restarted or
  // when a fetch is cancelled via AbortController — suppress as non-fatal.
  if (
    reason instanceof Error &&
    (reason.name === 'AbortError' || reason.message === 'The operation was aborted.')
  ) {
    console.warn('[process] unhandledRejection suppressed (AbortError):', reason.message);
    return;
  }
  console.error('[process] unhandledRejection:', reason);
});

process.on('uncaughtException', (err: Error) => {
  console.error('[process] uncaughtException:', err);
});

import { app, powerSaveBlocker, session } from 'electron';
import { unregisterAll } from './hotkey';
import { config, initSensitiveConfig } from './config';
import { QueueManager } from './queueManager';
import type { Task } from '../shared/types';
import { sendLog, setMainWindow } from './helpers';
import {
  createMainWindow,
  getMainWin,
  setAppQuitting,
  isAllWindowsClosed,
} from './windows';
import { CLEAN_UA } from './userAgent';
import { setupIpcHandlers } from './ipc';
import { processTask } from './taskProcessor';
import { bindHotkey as bindHotkeyImpl } from './hotkeyBinding';
import type { FlowManager } from './flow';
import { checkForUpdates } from './updater';
import { destroyTray, isTrayCreated } from './tray';
import { setupPlatformIcons, loadInitialLanguages, setupWindows } from './bootstrap/appSetup';
import { setupTrayAndCloseBehavior, buildTrayIpcCallbacks } from './bootstrap/traySetup';
import { initFlowManager, broadcastMergedQueueState } from './bootstrap/flowSetup';
import { createTelegramRuntime } from './bootstrap/telegramSetup';

// ── Chromium flags — must be called before app.on('ready') ──────────────────
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.userAgentFallback = CLEAN_UA;

// Prevent multiple app instances on Windows/Linux (optional, but recommended)
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!app.isReady()) return;

    let mainWin = getMainWin();

    if (!mainWin || mainWin.isDestroyed()) {
      createMainWindow();
      setMainWindow(getMainWin());
      mainWin = getMainWin();
    }

    if (!mainWin) return;
    if (mainWin.isMinimized()) mainWin.restore();
    if (!mainWin.isVisible()) mainWin.show();
    mainWin.focus();
  });
}

const TELEGRAM_SESSION_ID = `${app.getName().toLowerCase()}-desktop`;

// Track powerSaveBlocker ID for cleanup
let powerSaveBlockerId: number | null = null;

// ── AgentFlow (Flow Automation) ──────────────────────────────────────────────
let flowManager: FlowManager | null = null;

// ── Queue Manager ─────────────────────────────────────────────────────────────
const queue = new QueueManager(async (task: Task) => {
  await processTask(task, { telegramRuntime });
});

// Zero-arg hotkey binder bound to the shared queue (matches the IpcContext contract).
const bindHotkey = (): void => bindHotkeyImpl({ queue });

queue.onUpdate(() => {
  broadcastMergedQueueState(queue, flowManager);
});

// ── Telegram Runtime ──────────────────────────────────────────────────────────
const telegramRuntime = createTelegramRuntime({
  queue,
  getFlowManager: () => flowManager,
});

app.whenReady().then(async () => {
  app.setAppUserModelId('com.wellstsai.dac');
  powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  session.fromPartition('persist:gemini').setUserAgent(CLEAN_UA);
  session.fromPartition('persist:url-parser').setUserAgent(CLEAN_UA);

  // Decrypt sensitive config fields (requires app.ready for safeStorage)
  initSensitiveConfig();

  setupPlatformIcons();
  await loadInitialLanguages();
  setupWindows();

  flowManager = initFlowManager({ queue, telegramRuntime });

  if (process.platform === 'darwin') {
    getMainWin()?.focus();
  }

  setupTrayAndCloseBehavior();

  setupIpcHandlers({
    queue,
    telegramRuntime,
    telegramSessionId: TELEGRAM_SESSION_ID,
    getMainWin,
    bindHotkey,
    checkForUpdates,
    flowManager: flowManager!,
    ...buildTrayIpcCallbacks(),
  });

  bindHotkey();
  void telegramRuntime.syncWithConfig();
  sendLog(`✅ Ready — copy text and press ${config.hotkey}`);
});

app.on('before-quit', () => {
  sendLog('🔄 App closing — shutting down services...');
  setAppQuitting(true);
  destroyTray();
  flowManager?.shutdown();
  void telegramRuntime.shutdown();
});

app.on('quit', () => {
  sendLog('🛑 App quitting — cleaning up resources...');
  unregisterAll();
  if (powerSaveBlockerId !== null) {
    powerSaveBlocker.stop(powerSaveBlockerId);
    powerSaveBlockerId = null;
  }
  sendLog('✅ Cleanup complete — app exit');
});

app.on('will-quit', () => {
  unregisterAll();
});

app.on('window-all-closed', () => {
  // If tray is active, the app stays alive (window hidden to tray).
  // Otherwise, follow platform conventions: macOS keeps alive; others quit.
  if (isTrayCreated()) return;
  if (process.platform !== 'darwin') {
    void app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create a window when the dock icon is clicked
  // and there are no other windows open.
  if (isAllWindowsClosed()) {
    createMainWindow();
    setMainWindow(getMainWin());
  }
});
