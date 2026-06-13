// Centralized configuration via electron-store + safeStorage
//
// On-disk: <userData>/config.json in packaged app, <cwd>/config.json in dev mode.
// Sensitive fields (Telegram botToken) are encrypted with Electron's safeStorage
// (see configEncryption.ts) before being stored. The rest of the config is kept
// as plain JSON. Normalizer/deserializer functions live in configNormalizers.ts;
// shape definitions and defaults live in configTypes.ts.
//
// Call initSensitiveConfig() once inside app.whenReady() to decrypt sensitive
// fields — safeStorage APIs require the app to be ready.

import { app, nativeTheme } from 'electron';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import Store from 'electron-store';
import { defaultStored } from './configTypes';
import type { Config, StoredConfig, StoredTelegramConfig, TelegramConfig } from './configTypes';
import { encryptToken, decryptToken } from './configEncryption';
import {
  normalizeConfig,
  normalizeCaptureSettings,
  normalizePromptPreferences,
  deserializePairingConfig,
} from './configNormalizers';

// Dev       : project root / config.json (app is not packaged, use cwd)
// Packaged  : userData / config.json (stable, survives one-file temp extraction)
function getConfigDir(): string {
  if (app.isPackaged) return app.getPath('userData');
  return path.resolve('.');
}

function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

function getLegacyWindowsConfigPath(): string | null {
  if (!app.isPackaged || process.platform !== 'win32') return null;
  return path.join(path.dirname(app.getPath('exe')), 'config.json');
}

function migrateLegacyWindowsConfigIfNeeded(configDir: string): void {
  const legacyPath = getLegacyWindowsConfigPath();
  if (!legacyPath) return;
  const targetPath = path.join(configDir, 'config.json');
  if (!existsSync(legacyPath) || existsSync(targetPath)) return;
  try {
    mkdirSync(configDir, { recursive: true });
    copyFileSync(legacyPath, targetPath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown migration error';
    console.warn(`[config] failed to migrate legacy config: ${message}`);
  }
}

const configDir = getConfigDir();
migrateLegacyWindowsConfigIfNeeded(configDir);

const store = new Store<StoredConfig>({
  name: 'config',
  cwd: configDir,
  defaults: defaultStored,
});

// Build in-memory Config from store (botToken left empty until app.ready)
function buildConfigFromStore(): Config {
  const stored = store.store as StoredConfig & { telegram: StoredTelegramConfig & { botToken?: string } };
  const { telegram: { botTokenEncrypted: _enc, ...telegramRest }, ...rest } = stored;
  return normalizeConfig({
    ...rest,
    telegram: { ...telegramRest, botToken: '' },
  });
}

const config: Config = buildConfigFromStore();

// initSensitiveConfig — call from index.ts after app.whenReady()
// Decrypts botToken and migrates legacy plaintext token from old config format.
function initSensitiveConfig(): void {
  const stored = store.store as StoredConfig & { telegram: StoredTelegramConfig & { botToken?: string } };
  const encrypted = stored.telegram?.botTokenEncrypted ?? '';
  const legacyToken = stored.telegram?.botToken ?? '';

  if (!encrypted && legacyToken) {
    // Migrate: encrypt legacy plaintext botToken and remove old field
    const newEncrypted = encryptToken(legacyToken);
    const { botToken: _removed, ...telegramWithout } = stored.telegram as StoredTelegramConfig & { botToken?: string };
    store.set('telegram', { ...telegramWithout, botTokenEncrypted: newEncrypted } as StoredTelegramConfig);
    config.telegram.botToken = legacyToken;
  } else {
    config.telegram.botToken = decryptToken(encrypted);
  }
}

function saveConfig(cfg: Partial<Config>): void {
  const { telegram: partialTelegram, ...nonTelegramPartial } = cfg;

  // Merge & normalize non-telegram fields
  const mergedBase = normalizeConfig({
    ...config,
    ...nonTelegramPartial,
    telegram: config.telegram,
  });
  const { telegram: _ignored, ...storedBase } = mergedBase;

  const mergedTelegram = partialTelegram !== undefined
    ? deserializePairingConfig({ ...config.telegram, ...partialTelegram })
    : config.telegram;

  const { botToken, ...telegramWithoutToken } = mergedTelegram;

  // Single atomic write — assembles the full StoredConfig and writes once to disk,
  // avoiding partial writes and multiple Disk I/O round-trips.
  store.store = {
    ...storedBase,
    telegram: {
      ...telegramWithoutToken,
      botTokenEncrypted: encryptToken(botToken),
    },
  } as StoredConfig;

  Object.assign(config, { ...mergedBase, telegram: mergedTelegram });
}

// loadConfig — returns current in-memory config
function loadConfig(): Config {
  return config;
}

function getDefaultConfig(): Config {
  const { telegram: { botTokenEncrypted: _enc, ...telegramRest }, ...rest } = defaultStored;
  // Detect system dark/light mode for default theme
  const systemTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return normalizeConfig({ ...rest, theme: systemTheme, telegram: { ...telegramRest, botToken: '' } });
}

function importConfigFromJson(raw: unknown): Config | null {
  if (!raw || typeof raw !== 'object') return null;
  const rawConfig = raw as Record<string, unknown>;
  const hasKnownField = [
    'targetUrl',
    'hotkey',
    'locale',
    'theme',
    'telegram',
    'promptPreferences',
    'responseTimeout',
  ].some((key) => key in rawConfig);
  if (!hasKnownField) return null;

  const rawTelegram = rawConfig.telegram;
  const fromStoredShape = rawTelegram && typeof rawTelegram === 'object'
    && 'botTokenEncrypted' in (rawTelegram as Record<string, unknown>);

  const normalized = fromStoredShape
    ? normalizeConfig({
      ...rawConfig,
      telegram: {
        ...(rawTelegram as Record<string, unknown>),
        botToken: decryptToken(
          typeof (rawTelegram as Record<string, unknown>).botTokenEncrypted === 'string'
            ? (rawTelegram as Record<string, unknown>).botTokenEncrypted as string
            : '',
        ),
      },
    })
    : normalizeConfig(rawConfig);

  saveConfig(normalized);
  return config;
}

export {
  config,
  saveConfig,
  loadConfig,
  getDefaultConfig,
  getConfigPath,
  importConfigFromJson,
  initSensitiveConfig,
  normalizePromptPreferences,
  normalizeCaptureSettings,
};
export type { Config, TelegramConfig };
