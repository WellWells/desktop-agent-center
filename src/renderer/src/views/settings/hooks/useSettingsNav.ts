// src/renderer/src/views/settings/hooks/useSettingsNav.ts
import React, { useMemo, useState } from 'react';
import { Bot, MessageSquare, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { useI18nStore } from '../../../store/i18nStore';

export type Category = 'general' | 'ai' | 'telegram' | 'system';

// Search tag definitions (centralized so each section can reference them).
export const TAG_SETS = {
  hotkey: ['hotkey', 'keyboard', 'shortcut', 'key', 'binding'],
  language: ['language', 'locale', 'translation', 'i18n', 'zh', 'en'],
  notify: ['notification', 'bell', 'notify', 'alert'],
  theme: ['theme', 'dark', 'light', 'dracula', 'nord', 'amoled', 'sepia', 'appearance', 'color', 'oled'],
  timeout: ['timeout', 'timer', 'response', 'time'],
  prompt: ['prompt', 'persona', 'template', 'tone', 'length', 'nickname'],
  telegram: ['telegram', 'bot', 'token', 'pairing', 'group'],
  runtime: ['runtime', 'login', 'worker', 'browser', 'window'],
  config: ['config', 'configuration', 'backup', 'restore', 'import', 'export', 'json', 'folder', 'directory'],
  update: ['update', 'version', 'release', 'download', 'upgrade'],
  danger: ['danger', 'reset', 'clear', 'delete', 'restore'],
  tray: ['tray', 'system tray', 'menu bar', 'close', 'hide', 'startup', 'minimize'],
} as const;

const CATEGORY_TAG_MAP: Record<Category, (keyof typeof TAG_SETS)[]> = {
  general: ['hotkey', 'language', 'notify', 'theme', 'tray'],
  ai: ['timeout', 'prompt'],
  telegram: ['telegram'],
  system: ['runtime', 'config', 'danger'],
};

export function useSettingsNav() {
  const { t, locale } = useI18nStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category>('general');

  const q = searchQuery.trim().toLowerCase();
  const isSearching = q.length > 0;

  const sectionVisible = (tags: readonly string[]): boolean =>
    tags.some((tag) => tag.toLowerCase().includes(q));

  const showSection = (tags: readonly string[], category: Category): boolean =>
    isSearching ? sectionVisible(tags) : activeCategory === category;

  const showCategory = (category: Category): boolean => {
    if (!isSearching) return activeCategory === category;
    return CATEGORY_TAG_MAP[category].some((key) => sectionVisible(TAG_SETS[key]));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const navCategoryDefs = useMemo(() => [
    { id: 'general' as Category, label: t('settings.group.general'), icon: React.createElement(SlidersHorizontal, { size: 14 }) },
    { id: 'ai' as Category, label: t('settings.group.ai'), icon: React.createElement(Bot, { size: 14 }) },
    { id: 'telegram' as Category, label: t('settings.group.telegram'), icon: React.createElement(MessageSquare, { size: 14 }) },
    { id: 'system' as Category, label: t('settings.group.system'), icon: React.createElement(ShieldAlert, { size: 14 }) },
    // Recompute labels when locale changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [locale]);

  return {
    searchQuery,
    setSearchQuery,
    activeCategory,
    setActiveCategory,
    isSearching,
    showSection,
    showCategory,
    navCategoryDefs,
  };
}
