// Language list and locale change IPC handlers.

import { ipcMain } from 'electron';
import * as fs from 'node:fs/promises';
import { IPC } from '../../shared/types';
import { config, saveConfig } from '../config';
import { loadLanguageData, setLangCache } from '../i18n';
import { getLanguageDir } from '../files';
import type { IpcContext } from './context';

/**
 * Persists a locale change and refreshes the language cache, tray menu and bot.
 * markUserSet distinguishes an explicit user choice from auto-detection.
 */
function applyLocaleChange(ctx: IpcContext, lang: string, markUserSet: boolean): boolean {
  const nextLocale = (lang ?? '').trim();
  if (!nextLocale) return false;
  config.locale = nextLocale;
  if (markUserSet) config.localeSetByUser = true;
  saveConfig(markUserSet ? { locale: nextLocale, localeSetByUser: true } : { locale: nextLocale });
  void loadLanguageData(nextLocale).then((data) => {
    if (!data) return;
    setLangCache(data);
    ctx.onTrayMenuRebuild?.();
    void ctx.telegramRuntime.syncWithConfig();
  });
  return true;
}

export function registerLocaleHandlers(ctx: IpcContext): void {
  ipcMain.handle(IPC.GET_LANGUAGE_LIST, async () => {
    const langDir = getLanguageDir();
    try {
      const files = await fs.readdir(langDir);
      return files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
    } catch {
      return ['en-US', 'zh-TW'];
    }
  });

  ipcMain.handle(IPC.GET_CURRENT_LOCALE, () => ({
    locale: config.locale,
    setByUser: config.localeSetByUser,
  }));
  ipcMain.handle(IPC.GET_LANGUAGE_CONTENT, (_event, lang: string) => loadLanguageData(lang));

  // User-initiated locale change — marks locale as explicitly chosen by user
  ipcMain.handle(IPC.SET_CURRENT_LOCALE, (_event, lang: string) => applyLocaleChange(ctx, lang, true));

  // Auto-detected locale save — stores detected locale without marking as user-set
  ipcMain.handle(IPC.SET_LOCALE_AUTO, (_event, lang: string) => applyLocaleChange(ctx, lang, false));
}
