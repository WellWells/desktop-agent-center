// src/renderer/src/views/settings/hooks/useTelegramSettings.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { telegramApi, clipboardApi } from '../../../api/electronApi';

import type { TelegramSettingsSnapshot } from '../../../../../shared/types';

export function useTelegramSettings() {
  const [telegramSettings, setTelegramSettings] = useState<TelegramSettingsSnapshot | null>(null);
  const [telegramTokenInput, setTelegramTokenInput] = useState('');
  const [telegramBusy, setTelegramBusy] = useState(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const loadTelegramSettings = useCallback(async () => {
    const snapshot = await telegramApi.getSettings();
    setTelegramSettings(snapshot);
  }, []);

  const refreshTelegramSettings = useCallback(async () => {
    if (refreshInFlightRef.current) {
      await refreshInFlightRef.current;
      return;
    }
    const task = loadTelegramSettings().finally(() => {
      refreshInFlightRef.current = null;
    });
    refreshInFlightRef.current = task;
    await task;
  }, [loadTelegramSettings]);

  useEffect(() => {
    void refreshTelegramSettings();
    const unsub = telegramApi.onRuntime((runtime) => {
      setTelegramSettings((prev) => {
        if (!prev) return prev;
        return { ...prev, runtime };
      });
      // Pairing or admin changes may be pushed from main with the same runtime signal.
      // Re-fetch full snapshot to keep pairing lists and counters in sync.
      void refreshTelegramSettings();
    });
    return unsub;
  }, [refreshTelegramSettings]);

  const handleToggleTelegramEnabled = useCallback(async () => {
    if (!telegramSettings) return;
    setTelegramBusy(true);
    await telegramApi.updateEnabled(!telegramSettings.enabled);
    await loadTelegramSettings();
    setTelegramBusy(false);
  }, [telegramSettings, loadTelegramSettings]);

  const handleToggleTelegramGroupCommands = useCallback(async () => {
    if (!telegramSettings) return;
    setTelegramBusy(true);
    await telegramApi.updateAllowGroupCommands(!telegramSettings.allowGroupCommands);
    await loadTelegramSettings();
    setTelegramBusy(false);
  }, [telegramSettings, loadTelegramSettings]);

  const handleTelegramDefaultReplyMode = useCallback(async (mode: 'markdown' | 'png' | 'webp' | 'pdf') => {
    setTelegramBusy(true);
    await telegramApi.updateDefaultReplyMode(mode);
    await loadTelegramSettings();
    setTelegramBusy(false);
  }, [loadTelegramSettings]);

  const handleSaveTelegramToken = useCallback(async () => {
    setTelegramBusy(true);
    const result = await telegramApi.updateToken(telegramTokenInput);
    await loadTelegramSettings();
    setTelegramBusy(false);
    if (result.ok) {
      setTelegramTokenInput('');
    }
  }, [telegramTokenInput, loadTelegramSettings]);

  const handleToggleTelegramAdmin = useCallback(async (userId: number) => {
    if (!telegramSettings) return;
    const next = new Set(telegramSettings.adminUserIds ?? []);
    if (next.has(userId)) next.delete(userId); else next.add(userId);
    setTelegramBusy(true);
    await telegramApi.updateAdminUsers(Array.from(next));
    await loadTelegramSettings();
    setTelegramBusy(false);
  }, [telegramSettings, loadTelegramSettings]);

  const handleGeneratePairingCode = useCallback(async () => {
    setTelegramBusy(true);
    await telegramApi.generatePairingCode();
    await loadTelegramSettings();
    setTelegramBusy(false);
  }, [loadTelegramSettings]);

  const handleRevokePairingCode = useCallback(async (code: string) => {
    setTelegramBusy(true);
    await telegramApi.revokePairingCode(code);
    await loadTelegramSettings();
    setTelegramBusy(false);
  }, [loadTelegramSettings]);

  const handleCopyPairingCode = useCallback(async (code: string) => {
    await clipboardApi.copyText(code);
  }, []);

  const buildTelegramStartUrl = useCallback((code: string): string | null => {
    const rawUsername = telegramSettings?.runtime.botUsername ?? '';
    const username = rawUsername.replace(/^@/, '').trim();
    if (!username) return null;
    return `https://t.me/${username}?start=${encodeURIComponent(code)}`;
  }, [telegramSettings?.runtime.botUsername]);

  const handleCopyTelegramStartUrl = useCallback(async (code: string) => {
    const url = buildTelegramStartUrl(code);
    if (!url) return;
    await clipboardApi.copyText(url);
  }, [buildTelegramStartUrl]);

  const handleOpenTelegramStart = useCallback(async (code: string) => {
    const url = buildTelegramStartUrl(code);
    if (!url) return;
    await clipboardApi.openExternalUrl(url);
  }, [buildTelegramStartUrl]);

  const handleUnpairTelegramUser = useCallback(async (userId: number) => {
    setTelegramBusy(true);
    await telegramApi.unpairUser(userId);
    await loadTelegramSettings();
    setTelegramBusy(false);
  }, [loadTelegramSettings]);

  return {
    telegramSettings,
    telegramTokenInput,
    setTelegramTokenInput,
    telegramBusy,
    loadTelegramSettings,
    handleToggleTelegramEnabled,
    handleToggleTelegramGroupCommands,
    handleTelegramDefaultReplyMode,
    handleSaveTelegramToken,
    handleToggleTelegramAdmin,
    handleGeneratePairingCode,
    handleRevokePairingCode,
    handleCopyPairingCode,
    handleCopyTelegramStartUrl,
    handleOpenTelegramStart,
    handleUnpairTelegramUser,
  };
}
