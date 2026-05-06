// src/main/urlParser.ts — URL detection, HTML fetch & prompt construction
//
// Uses a hidden Electron BrowserWindow (real Chromium) to load pages so that
// anti-bot 403 responses, Cloudflare checks and JS-rendered content are handled
// exactly like a real user browsing — no custom http/https wrangling needed.
import { BrowserWindow } from 'electron';
import { load } from 'cheerio';
import { CLEAN_UA } from './windows';

/** Max body characters sent to AI (avoid context overflow). */
const MAX_CONTENT_CHARS = 80_000;

/** Total page-load timeout (ms) before we give up and throw. */
const LOAD_TIMEOUT_MS = 25_000;

/**
 * Extra settle time (ms) after `did-finish-load`.
 * Gives JS-rendered pages (React/Vue SPAs) time to mount content.
 */
const JS_SETTLE_MS = 1_500;

export interface UrlParseResult {
  title: string;
  url: string;
  cleanedText: string;
  truncated: boolean;
}

/**
 * Returns true when `text` is a single, standalone HTTP(S) URL
 * (no whitespace, no line breaks).
 */
export function isSingleUrl(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Opens a hidden Electron BrowserWindow, loads `url` as a real Chromium
 * browser (reusing the `persist:gemini` session/cookies), waits for the page
 * to finish rendering, then extracts and cleans the page content.
 *
 * The window is always destroyed after extraction, even on error.
 */
export async function fetchAndParse(url: string): Promise<UrlParseResult> {
  const html = await loadPageHtml(url);
  return parseHtml(html, url);
}

/**
 * Builds the analysis prompt by substituting {{title}}, {{url}},
 * {{cleaned_text}} in the template (sourced from i18n).
 */
export function buildUrlAnalysisPrompt(
  result: UrlParseResult,
  promptTemplate: string,
  truncatedLabel: string,
): string {
  const body = result.truncated
    ? `${result.cleanedText}\n\n${truncatedLabel}`
    : result.cleanedText;

  return promptTemplate
    .replace(/\{\{title\}\}/g, result.title)
    .replace(/\{\{url\}\}/g, result.url)
    .replace(/\{\{cleaned_text\}\}/g, body);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Spins up a hidden BrowserWindow, loads the URL with the shared
 * `persist:gemini` Chromium session, waits for load + JS settle,
 * then returns the full `innerHTML` of `<html>`.
 */
function loadPageHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const win = new BrowserWindow({
      // Off-screen, invisible — never shown to the user
      x: -20_000,
      y: -20_000,
      width: 1_280,
      height: 900,
      show: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        // Share cookies/login state with the AI worker window
        partition: 'persist:gemini',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
        // Block JS popups/dialogs that could stall execution
        disableDialogs: true,
      },
    });

    win.webContents.setUserAgent(CLEAN_UA);

    // Hard timeout — destroy and reject if the page never finishes
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      safeDestroy(win);
      reject(new Error(`Page load timed out after ${LOAD_TIMEOUT_MS / 1_000}s`));
    }, LOAD_TIMEOUT_MS);

    win.webContents.on('did-finish-load', () => {
      if (settled) return;
      // Give JS-rendered content (React/Vue/Next) time to mount
      setTimeout(async () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try {
          const html = await win.webContents.executeJavaScript(
            'document.documentElement.innerHTML',
          ) as string;
          safeDestroy(win);
          resolve(html);
        } catch (err) {
          safeDestroy(win);
          reject(err);
        }
      }, JS_SETTLE_MS);
    });

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      if (settled) return;
      // ERR_ABORTED (-3) fires for navigations cancelled by JS — page may still
      // have loaded (e.g. redirect via window.location). Let the settle path run.
      if (errorCode === -3) return;
      settled = true;
      clearTimeout(timeout);
      safeDestroy(win);
      reject(new Error(`Failed to load page: ${errorDescription} (${errorCode})`));
    });

    win.loadURL(url).catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      safeDestroy(win);
      reject(err);
    });
  });
}

function safeDestroy(win: BrowserWindow): void {
  try {
    if (!win.isDestroyed()) win.destroy();
  } catch {
    // ignore
  }
}

function parseHtml(html: string, sourceUrl: string): UrlParseResult {
  const fullHtml = `<html>${html}</html>`;
  const $ = load(fullHtml);

  // Strip non-content elements
  $(
    'script, style, noscript, iframe, nav, footer, header, aside, ' +
    '[role="banner"], [role="navigation"], [role="complementary"], ' +
    '[aria-hidden="true"], .ad, .advertisement, .sidebar, .menu, .cookie-banner',
  ).remove();

  const title = $('title').first().text().trim() || sourceUrl;

  // Prefer article/main content; fall back to full body
  const contentEl = $('article, [role="main"], main').first();
  const rawText = (contentEl.length ? contentEl : $('body')).text();

  // Collapse whitespace
  const cleanedText = rawText
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (cleanedText.length <= MAX_CONTENT_CHARS) {
    return { title, url: sourceUrl, cleanedText, truncated: false };
  }

  return {
    title,
    url: sourceUrl,
    cleanedText: cleanedText.slice(0, MAX_CONTENT_CHARS),
    truncated: true,
  };
}
