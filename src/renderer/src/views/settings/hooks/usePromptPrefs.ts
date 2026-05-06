// src/renderer/src/views/settings/hooks/usePromptPrefs.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { settingsApi } from '../../../api/electronApi';
import { useI18nStore } from '../../../store/i18nStore';
import type { PromptLength, PromptPreferences, PromptTone } from '../../../../../shared/types';

/** Assembles a full System Instruction string from PromptPreferences. */
export function buildCombinedPrompt(
  prefs: PromptPreferences,
  t: (key: string) => string,
): string {
  const parts: string[] = [];
  if ((prefs.nickname ?? '').trim()) {
    parts.push(t('settings.prompt.built.nickname').replace(/\{\{name\}\}/g, prefs.nickname!.trim()));
  }
  if (prefs.tone !== 'default') {
    parts.push(t(`settings.prompt.built.tone.${prefs.tone}`));
  }
  if (prefs.length !== 'auto') {
    parts.push(t(`settings.prompt.built.length.${prefs.length}`));
  }
  if (prefs.customInstructions.trim()) {
    parts.push(`${t('settings.prompt.built.extra')}${prefs.customInstructions.trim()}`);
  }
  return parts.filter(Boolean).join('\n');
}

const DEFAULT_PREFS: PromptPreferences = {
  tone: 'default',
  length: 'auto',
  customInstructions: '',
  customTemplates: [],
};

export function usePromptPrefs() {
  const { t, locale } = useI18nStore();
  const [promptPrefs, setPromptPrefs] = useState<PromptPreferences>(DEFAULT_PREFS);
  const [syncSystemLanguageToModel, setSyncSystemLanguageToModel] = useState(false);

  useEffect(() => {
    void settingsApi.getPromptPreferences().then(setPromptPrefs);
    void settingsApi.getSyncSystemLanguageToModel().then(setSyncSystemLanguageToModel);
  }, []);

  const savePromptPrefs = useCallback(async (prefs: PromptPreferences) => {
    const systemInstruction = buildCombinedPrompt(prefs, t);
    await settingsApi.updatePromptPreferences(prefs, systemInstruction);
  }, [t]);

  const handleToggleSyncSystemLanguageToModel = useCallback(async () => {
    const next = !syncSystemLanguageToModel;
    await settingsApi.updateSyncSystemLanguageToModel(next);
    setSyncSystemLanguageToModel(next);
  }, [syncSystemLanguageToModel]);

  const handleToneChange = useCallback((tone: string) => {
    const next = { ...promptPrefs, tone: tone as PromptTone };
    setPromptPrefs(next);
    void savePromptPrefs(next);
  }, [promptPrefs, savePromptPrefs]);

  const handleLengthChange = useCallback((length: string) => {
    const next = { ...promptPrefs, length: length as PromptLength };
    setPromptPrefs(next);
    void savePromptPrefs(next);
  }, [promptPrefs, savePromptPrefs]);

  const combinedPromptPreview = useMemo(() => {
    const base = buildCombinedPrompt(promptPrefs, t);
    const localeLine = syncSystemLanguageToModel
      ? t('system.localeInstruction').replace('{{locale}}', locale)
      : '';
    const parts = [base, localeLine].filter(Boolean);
    if (parts.length === 0) return '';
    return `System Instruction: ${parts.join('\n')}`;
  }, [promptPrefs, t, syncSystemLanguageToModel, locale]);

  /** Called externally (handleResetSettings) to force-apply the post-reset values. */
  const applyPromptReset = useCallback((prefs: PromptPreferences, syncLang: boolean) => {
    setPromptPrefs(prefs);
    setSyncSystemLanguageToModel(syncLang);
  }, []);

  return {
    promptPrefs,
    setPromptPrefs,
    syncSystemLanguageToModel,
    combinedPromptPreview,
    savePromptPrefs,
    handleToggleSyncSystemLanguageToModel,
    handleToneChange,
    handleLengthChange,
    applyPromptReset,
  };
}
