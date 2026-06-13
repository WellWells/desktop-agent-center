// Shared context and helpers for IPC handler registrars.
//
// setupIpcHandlers builds one IpcContext and passes it to each registerXxxHandlers
// function. Stateless helpers (path validation, dialog pickers) live here too so
// the focused registrars can share them without re-importing electron internals.

import { dialog } from 'electron';
import * as path from 'node:path';
import type {
  BrowserWindow,
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue,
} from 'electron';
import type { SettingsSnapshot } from '../../shared/types';
import { config } from '../config';
import { getOutputDir } from '../files';
import type { QueueManager } from '../queueManager';
import type { TelegramRuntime } from '../telegram';
import type { FlowManager } from '../flow';

export interface IpcContext {
  queue: QueueManager;
  telegramRuntime: TelegramRuntime;
  telegramSessionId: string;
  getMainWin: () => BrowserWindow | null;
  bindHotkey: () => void;
  checkForUpdates: () => Promise<boolean>;
  onTraySettingsChanged?: () => void;
  onTrayMenuRebuild?: () => void;
  onHideToTray?: () => void;
  onQuitApp?: () => void;
  flowManager?: FlowManager;
}

export function buildSettingsSnapshot(): SettingsSnapshot {
  return {
    hotkey: config.hotkey,
    geminiUrl: config.targetUrl,
    locale: config.locale,
    theme: config.theme,
    syncSystemLanguageToModel: config.syncSystemLanguageToModel,
    notifyOnComplete: config.notifyOnComplete,
    promptPreferences: config.promptPreferences,
    responseTimeout: config.responseTimeout,
    closeToTray: config.closeToTray,
    launchAtStartup: config.launchAtStartup,
  };
}

// Path validation — restricts file operations to the output directory.
// Prevents path traversal attacks from malicious IPC messages.
export async function isAllowedFilePath(filePath: string): Promise<boolean> {
  if (!filePath || typeof filePath !== 'string') return false;
  const resolved = path.resolve(filePath);
  const outputDir = await getOutputDir();
  return resolved.startsWith(outputDir + path.sep) || resolved === outputDir;
}

/** Shows a save dialog anchored to the window when available, falling back to a detached dialog. */
export function showSaveDialogForWin(
  win: BrowserWindow | null,
  opts: SaveDialogOptions,
): Promise<SaveDialogReturnValue> {
  return win && !win.isDestroyed() ? dialog.showSaveDialog(win, opts) : dialog.showSaveDialog(opts);
}

/** Shows an open dialog anchored to the window when available, falling back to a detached dialog. */
export function showOpenDialogForWin(
  win: BrowserWindow | null,
  opts: OpenDialogOptions,
): Promise<OpenDialogReturnValue> {
  return win && !win.isDestroyed() ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts);
}
