// src/main/configTypes.ts — Config shape definitions and default values
//
// Shared by config.ts (store + persistence) and configNormalizers.ts.
// Keeping types and defaults here avoids circular imports between the
// store module and the normalizer module.

import { PROVIDER_URLS } from '../shared/types';
import type { CaptureFormat, CaptureSettings, PromptPreferences, TelegramPairingState } from '../shared/types';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface Config {
  targetUrl: string;
  hotkey: string;
  debounceMs: number;
  responseTimeout: number;
  locale: string;
  localeSetByUser: boolean;
  theme: string;
  syncSystemLanguageToModel: boolean;
  notifyOnComplete: boolean;
  promptPreferences: PromptPreferences;
  telegram: TelegramConfig;
  closeToTray: boolean;
  autoShowTray: boolean;
  closeActionDecided: boolean;
  launchAtStartup: boolean;
  layoutMode: 'stacked' | 'side-by-side';
  markdownZoom: number;
  captureSettings: CaptureSettings;
}

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  allowGroupCommands: boolean;
  defaultReplyMode: 'markdown' | 'png' | 'webp' | 'pdf';
  adminUserIds: number[];
  pairing: TelegramPairingState;
}

// On-disk stored shape — botToken replaced with encrypted form
export interface StoredTelegramConfig extends Omit<TelegramConfig, 'botToken'> {
  botTokenEncrypted: string;
}
export type StoredConfig = Omit<Config, 'telegram'> & { telegram: StoredTelegramConfig };

// ── Default stored config ─────────────────────────────────────────────────────

export const defaultStored: StoredConfig = {
  targetUrl: PROVIDER_URLS.gemini,
  hotkey: process.platform === 'darwin' ? 'Command+G' : 'Alt+G',
  debounceMs: 1000,
  responseTimeout: 60_000,
  locale: 'en-US',
  localeSetByUser: false,
  theme: 'auto',
  syncSystemLanguageToModel: true,
  notifyOnComplete: true,
  closeToTray: false,
  autoShowTray: false,
  closeActionDecided: false,
  launchAtStartup: false,
  layoutMode: 'stacked',
  markdownZoom: 100,
  captureSettings: {
    palette: 'aurora',
    direction: 'se',
    showPrompt: false,
    showProvider: true,
    showTimestamp: true,
    format: 'png' as CaptureFormat,
  },
  promptPreferences: {
    tone: 'default',
    length: 'auto',
    customInstructions: '',
    customTemplates: [],
    nickname: '',
  },
  telegram: {
    enabled: false,
    botTokenEncrypted: '',
    allowGroupCommands: false,
    defaultReplyMode: 'markdown',
    adminUserIds: [],
    pairing: { pendingCodes: [], pairedUsers: [] },
  },
};
