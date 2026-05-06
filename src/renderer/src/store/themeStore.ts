// src/renderer/src/store/themeStore.ts
import { create } from 'zustand';
import type { MantineThemeOverride } from '@mantine/core';
import { getMantineTheme, buildCssVariablesResolver } from '../theme';
import type { CSSVariablesResolver } from '@mantine/core';

export type Theme =
  | 'dark' | 'light' | 'dracula' | 'nord' | 'amoled' | 'sepia'
  | 'catppuccin' | 'everforest' | 'rosepine' | 'gruvbox' | 'cyberpunk';

const VALID_THEMES: readonly Theme[] = [
  'dark', 'light', 'dracula', 'nord', 'amoled', 'sepia',
  'catppuccin', 'everforest', 'rosepine', 'gruvbox', 'cyberpunk',
];

interface ThemeState {
  theme: Theme;
  colorScheme: 'light' | 'dark';
  mantineTheme: MantineThemeOverride;
  cssVariablesResolver: CSSVariablesResolver;
  setTheme: (theme: Theme) => void;
}

function resolveTheme(raw: string | null | undefined): Theme {
  if (VALID_THEMES.includes(raw as Theme)) return raw as Theme;
  // 'auto' or unrecognized → follow system preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// ── Initial theme (synchronous, before React mounts) ─────────────────────────
const _initial: Theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
const _initialMantine = getMantineTheme(_initial);

// Set data-theme attribute for Shiki and legacy CSS selectors
document.documentElement.setAttribute('data-theme', _initial);

export const useThemeStore = create<ThemeState>((set) => ({
  theme: _initial,
  colorScheme: _initialMantine.colorScheme,
  mantineTheme: _initialMantine.theme,
  cssVariablesResolver: buildCssVariablesResolver(_initial),

  setTheme: (theme: Theme) => {
    const mantine = getMantineTheme(theme);
    document.documentElement.setAttribute('data-theme', theme);
    set({
      theme,
      colorScheme: mantine.colorScheme,
      mantineTheme: mantine.theme,
      cssVariablesResolver: buildCssVariablesResolver(theme),
    });
    // Persist to main config
    window.electronAPI.updateTheme(theme).catch(() => {});
  },
}));

// Load persisted theme from main config on startup.
// If config returns 'auto' or empty (= no explicit user choice), fall back to system preference.
export function initThemeFromConfig(): void {
  window.electronAPI.getTheme().then((raw) => {
    const theme = resolveTheme(raw);
    const mantine = getMantineTheme(theme);
    document.documentElement.setAttribute('data-theme', theme);
    useThemeStore.setState({
      theme,
      colorScheme: mantine.colorScheme,
      mantineTheme: mantine.theme,
      cssVariablesResolver: buildCssVariablesResolver(theme),
    });
  }).catch(() => { });
}
