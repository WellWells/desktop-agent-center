// src/main/tray.ts — Cross-platform system tray (Windows) / menu bar (macOS) integration
import { app, Menu, Tray, nativeImage } from 'electron';
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
import { getLangCache, t } from './i18n';
import { sendLog, getAssetPath } from './helpers';

let tray: Tray | null = null;

// ── Tray icon loader ─────────────────────────────────────────────────────────
// Windows : 32×32 PNG (Electron auto-scales to 16 px for the tray area).
// macOS   : 16×16 template image (black + transparent) — adapts to light/dark
//           menu bar automatically. Source PNG is resized at runtime via
//           nativeImage so no separate template PNG file is required.
function buildTrayIcon(): ReturnType<typeof nativeImage.createEmpty> {
  if (process.platform === 'darwin') {
    const src = nativeImage.createFromPath(getAssetPath('icon-mac.png'));
    const img = src.resize({ width: 18, height: 18 });
    return img;
  }
  // Windows: 32×32 provides crisp rendering on both 100% and 200% DPI displays.
  const src = nativeImage.createFromPath(getAssetPath('icon-win.png'));
  return src.resize({ width: 32, height: 32 });
}

// ── Deps interface ────────────────────────────────────────────────────────────
export interface TrayDeps {
  getMainWin: () => BrowserWindow | null;
  getNotifyEnabled: () => boolean;
  setNotifyEnabled: (v: boolean) => void;
  getLaunchAtStartup: () => boolean;
  setLaunchAtStartup: (v: boolean) => void;
  onQuit: () => void;
  onNavigateSettings: () => void;
}

// ── Internal helpers ─────────────────────────────────────────────────────────
function restoreWindow(getMainWin: () => BrowserWindow | null): void {
  const win = getMainWin();
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  // macOS: bring app to front
  if (process.platform === 'darwin') app.focus({ steal: true });
}

function buildContextMenu(deps: TrayDeps): Menu {
  const {
    getMainWin, getNotifyEnabled, setNotifyEnabled,
    getLaunchAtStartup, setLaunchAtStartup, onQuit, onNavigateSettings,
  } = deps;
  const notifyEnabled = getNotifyEnabled();
  const launchAtStartup = getLaunchAtStartup();
  const strings = getLangCache();

  let items: MenuItemConstructorOptions[];

  if (process.platform === 'darwin') {
    // macOS Menu Bar — follows Apple HIG
    items = [
      {
        label: t(strings, 'app.name', {}),
        enabled: false,
      },
      { type: 'separator' },
      {
        label: t(strings, 'tray.show', {}),
        click: () => restoreWindow(getMainWin),
      },
      {
        label: t(strings, 'tray.preferences', {}),
        accelerator: 'Command+,',
        click: () => {
          restoreWindow(getMainWin);
          onNavigateSettings();
        },
      },
      { type: 'separator' },
      {
        label: t(strings, 'tray.quit', {}),
        accelerator: 'Command+Q',
        click: () => onQuit(),
      },
    ];
  } else {
    // Windows System Tray — use & access keys for keyboard navigation
    items = [
      {
        label: t(strings, 'app.name', {}),
        enabled: false,
      },
      { type: 'separator' },
      {
        label: t(strings, 'tray.restore', {}),
        click: () => restoreWindow(getMainWin),
      },
      { type: 'separator' },
      {
        label: t(strings, 'tray.notifications', {}),
        type: 'checkbox',
        checked: notifyEnabled,
        click: (menuItem) => {
          setNotifyEnabled(menuItem.checked);
          rebuildMenu(deps);
        },
      },
      {
        label: t(strings, 'tray.launchAtStartup', {}),
        type: 'checkbox',
        checked: launchAtStartup,
        click: (menuItem) => {
          setLaunchAtStartup(menuItem.checked);
          rebuildMenu(deps);
        },
      },
      { type: 'separator' },
      {
        label: t(strings, 'tray.quit.win', {}),
        click: () => onQuit(),
      },
    ];
  }

  return Menu.buildFromTemplate(items);
}

function rebuildMenu(deps: TrayDeps): void {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(buildContextMenu(deps));
}

// ── Public API ────────────────────────────────────────────────────────────────
export function isTrayCreated(): boolean {
  return tray !== null && !tray.isDestroyed();
}

export function createTray(deps: TrayDeps): void {
  if (isTrayCreated()) return;

  const icon = buildTrayIcon();
  tray = new Tray(icon);

  const strings = getLangCache();
  const appName = t(strings, 'app.name', {});
  tray.setToolTip(appName);

  tray.setContextMenu(buildContextMenu(deps));

  if (process.platform === 'win32') {
    // Windows: double-click restores the window
    tray.on('double-click', () => restoreWindow(deps.getMainWin));
  }

  sendLog('🔔 System tray icon created');
}

export function updateTrayMenu(deps: TrayDeps): void {
  rebuildMenu(deps);
}

export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    sendLog('🔔 System tray icon removed');
  }
  tray = null;
}
