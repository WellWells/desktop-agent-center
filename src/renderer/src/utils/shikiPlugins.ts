import rehypeKatex from 'rehype-katex';
import type { Highlighter } from 'shiki';
import type { Theme } from '../store/themeStore';

/** Maps each app theme to the appropriate Shiki theme for syntax highlighting. */
export const appThemeToShikiTheme: Record<Theme, string> = {
  dark:        'github-dark',
  light:       'github-light',
  dracula:     'dracula',
  nord:        'nord',
  amoled:      'github-dark',
  sepia:       'github-light',
  catppuccin:  'github-dark',
  everforest:  'nord',
  rosepine:    'github-light',
  gruvbox:     'github-dark',
  cyberpunk:   'github-dark',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RehypePluginList = any[];

/**
 * Static rehype plugin list for react-markdown.
 * KaTeX only — Shiki is applied via <ShikiCodeBlock> component.
 */
export const REHYPE_PLUGINS: RehypePluginList = [rehypeKatex];

/** Backward-compat aliases kept so callers don't need updating. */
export const FALLBACK_REHYPE = REHYPE_PLUGINS;
export function getShikiPluginsSync(): RehypePluginList { return REHYPE_PLUGINS; }

let _highlighter: Highlighter | null = null;
let _loadPromise: Promise<Highlighter | null> | null = null;

/** Returns the Shiki Highlighter instance once loaded, or null before that. */
export function getHighlighterSync(): Highlighter | null {
  return _highlighter;
}

/** Returns true once the Highlighter has finished loading. */
export function isShikiReady(): boolean {
  return _highlighter !== null;
}

/**
 * Asynchronously loads the Shiki Highlighter (once, cached).
 * Returns the Highlighter (or null on failure).
 * Safe to call multiple times — always returns the same Promise.
 */
export function loadShiki(): Promise<Highlighter | null> {
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async (): Promise<Highlighter | null> => {
    try {
      const { createHighlighter } = await import('shiki');
      _highlighter = await createHighlighter({
        themes: ['github-dark', 'github-light', 'dracula', 'nord'],
        langs: [
          'typescript', 'tsx', 'javascript', 'jsx',
          'python', 'bash', 'sh', 'json', 'css', 'html',
          'yaml', 'markdown', 'rust', 'go', 'java', 'cpp', 'c',
        ],
      });
    } catch {
      // Shiki failed to load — code blocks render without syntax highlighting.
    }
    return _highlighter;
  })();
  return _loadPromise;
}
