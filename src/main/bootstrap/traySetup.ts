// Tray setup and close-to-tray behavior
//
// Builds the TrayDeps object consumed by tray.ts, performs initial tray
// creation (including --hidden startup), and installs the main-window close
// handler (first-time dialog + tray hide).

import { app } from 'electron';
import { IPC } from '../../shared/types';
import { config, saveConfig } from '../config';
import { sendToRenderer, setNotifyEnabled, applyLaunchAtStartup } from '../helpers';
import { getMainWin, setAppQuitting, setMainWindowCloseHandler } from '../windows';
import { createTray, destroyTray, isTrayCreated, updateTrayMenu } from '../tray';
import type { TrayDeps } from '../tray';

/** Builds the dependency object the tray menu needs to read/write settings. */
export function getTrayDeps(): TrayDeps {
  return {
    getMainWin,
    getNotifyEnabled: () => config.notifyOnComplete,
    setNotifyEnabled: (v: boolean) => {
      config.notifyOnComplete = v;
      saveConfig({ notifyOnComplete: v });
      setNotifyEnabled(v); sendToRenderer(IPC.NOTIFY_ON_COMPLETE_CHANGED, v);
    },
    getLaunchAtStartup: () => config.launchAtStartup,
    setLaunchAtStartup: (v: boolean) => {
      config.launchAtStartup = v;
      saveConfig({ launchAtStartup: v });
      applyLaunchAtStartup(v, config.closeToTray);
      sendToRenderer(IPC.LAUNCH_AT_STARTUP_CHANGED, v);
    },
    onQuit: () => {
      setAppQuitting(true);
      app.quit();
    },
    onNavigateSettings: () => {
      sendToRenderer(IPC.NAVIGATE_SETTINGS);
    },
  };
}

/**
 * Initial tray creation, auto-launch sync, --hidden startup handling, and the
 * main-window close handler. Call once inside app.whenReady().
 */
export function setupTrayAndCloseBehavior(): void {
  if (config.autoShowTray || config.closeToTray) {
    createTray(getTrayDeps());
  }

  // Sync auto-launch state (with hidden mode) with OS on startup
  applyLaunchAtStartup(config.launchAtStartup, config.closeToTray);

  // If launched with --hidden flag and closeToTray is on → start hidden in tray
  const isStartupHidden = process.argv.includes('--hidden');
  if (isStartupHidden && config.closeToTray) {
    const win = getMainWin();
    win?.hide();
    if (!isTrayCreated()) createTray(getTrayDeps());
  }

  // Main window close handler (first-time dialog + tray hide)
  setMainWindowCloseHandler((event) => {
    // If tray is active and user chose to hide to tray: just hide
    if (config.closeToTray) {
      event.preventDefault();
      if (!isTrayCreated()) {
        createTray(getTrayDeps());
      }
      const win = getMainWin();
      win?.hide();
      return;
    }

    // First-time: show choice via renderer UI dialog (only on non-macOS)
    if (!config.closeActionDecided && process.platform !== 'darwin') {
      event.preventDefault();
      sendToRenderer(IPC.SHOW_CLOSE_DIALOG);
      return;
    }

    // Default: macOS keeps alive; others quit
    if (process.platform !== 'darwin') {
      event.preventDefault();
      setAppQuitting(true);
      app.quit();
    }
  });
}

/** Tray-related callbacks passed to setupIpcHandlers(). */
export function buildTrayIpcCallbacks(): {
  onTraySettingsChanged: () => void;
  onTrayMenuRebuild: () => void;
  onHideToTray: () => void;
  onQuitApp: () => void;
} {
  return {
    onTraySettingsChanged: () => {
      // Create or destroy tray based on updated settings
      if (config.autoShowTray || config.closeToTray) {
        if (!isTrayCreated()) createTray(getTrayDeps());
        else updateTrayMenu(getTrayDeps());
      } else if (!config.closeToTray && !config.autoShowTray) {
        destroyTray();
      }
    },
    onTrayMenuRebuild: () => {
      if (isTrayCreated()) updateTrayMenu(getTrayDeps());
    },
    onHideToTray: () => {
      if (!isTrayCreated()) createTray(getTrayDeps());
      const win = getMainWin();
      win?.hide();
    },
    onQuitApp: () => {
      setAppQuitting(true);
      app.quit();
    },
  };
}
