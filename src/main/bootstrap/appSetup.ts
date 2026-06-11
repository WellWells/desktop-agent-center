// src/main/bootstrap/appSetup.ts — App foundation setup run inside app.whenReady()
//
// Covers platform icons (macOS dock/About panel), initial i18n cache loading,
// and main/worker window creation with helper-level wiring.

import { app, nativeImage } from 'electron';
import { config } from '../config';
import { detectProvider } from '../providers';
import {
  sendLog,
  sendToRenderer,
  setMainWindow,
  setNotifyEnabled,
  setWorkerReveal,
  getAssetPath,
} from '../helpers';
import { loadLanguageData, setLangCache, setEnCache } from '../i18n';
import {
  createMainWindow,
  createWorkerWindow,
  getMainWin,
  revealWorkerWindow,
  showInteractiveWorkerWindow,
} from '../windows';
import { initializeUpdater } from '../updater';

/** Sets the macOS dock icon and native About panel. No-op on other platforms. */
export function setupPlatformIcons(): void {
  if (process.platform !== 'darwin') return;
  // macOS Dock icon — must be set after app is ready.
  const dockIcon = nativeImage.createFromPath(getAssetPath('icon-mac.png'));
  app.dock?.setIcon(dockIcon);
  // macOS native About panel (Help → About… or Cmd+I).
  app.setAboutPanelOptions({
    applicationName: 'Desktop Agent Center',
    iconPath: getAssetPath('icon-mac.png'),
  });
}

/** Loads the active locale into the lang cache, plus en-US as fallback. */
export async function loadInitialLanguages(): Promise<void> {
  const initialLang = await loadLanguageData(config.locale);
  if (initialLang) setLangCache(initialLang);
  // Always cache en-US as fallback for keys missing from the active locale.
  const enLang = await loadLanguageData('en-US');
  if (enLang) setEnCache(enLang);
}

/** Creates main + worker windows and wires helper-level window state. */
export function setupWindows(): void {
  createMainWindow();
  setMainWindow(getMainWin());
  setWorkerReveal(() => {
    if (detectProvider(config.targetUrl) === 'perplexity') {
      void showInteractiveWorkerWindow(config.targetUrl);
      return;
    }
    revealWorkerWindow();
  });
  setNotifyEnabled(config.notifyOnComplete);
  initializeUpdater({ sendLog, sendToRenderer });

  createWorkerWindow(config.targetUrl);
}
