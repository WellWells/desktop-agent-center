// src/main/urlParser.ts — URL detection, HTML fetch & prompt construction
//
// Orchestrates page loading (pageLoader.ts) and parser-block execution
// (parserBlocks.ts), and builds the AI analysis prompt from parsed content.
// Re-exports the loader/parser public surface so existing importers keep
// working against './urlParser'.

import { load } from 'cheerio';
import { loadPageHtml, fetchRawText } from './pageLoader';
import { runParserBlocks, runCssSelector, parseRssFeed } from './parserBlocks';
import type { ParserBlock, ParserBlockType, RssFeedItem } from './parserBlocks';

// Re-export the public surface of the extracted modules.
export { fetchRawText, runParserBlocks, runCssSelector, parseRssFeed };
export type { ParserBlock, ParserBlockType, RssFeedItem };

/** Max body characters sent to AI (avoid context overflow). */
const MAX_CONTENT_CHARS = 80_000;

export interface UrlParseResult {
  title: string;
  url: string;
  cleanedText: string;
  truncated: boolean;
}

export interface FetchAndParseOptions {
  rawHtml?: boolean;
  xmlMode?: boolean;
  parserBlocks?: ParserBlock[];
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
 * Opens a hidden Electron BrowserWindow, loads `url` in an isolated parser
 * session, waits for the page
 * to finish rendering, then extracts and cleans the page content.
 *
 * When `options.rawHtml` is true, returns the full HTML source in `cleanedText`.
 * When `options.parserBlocks` is non-empty, the last block's result is returned
 * in `cleanedText` (overrides rawHtml mode).
 *
 * The window is always destroyed after extraction, even on error.
 */
export async function fetchAndParse(url: string, options?: FetchAndParseOptions): Promise<UrlParseResult> {
  const html = await loadPageHtml(url);

  if (options?.parserBlocks && options.parserBlocks.length > 0) {
    const parserOutput = runParserBlocks(html, url, options.parserBlocks, options?.xmlMode);
    return { title: url, url, cleanedText: parserOutput, truncated: false };
  }

  if (options?.xmlMode) {
    const raw = html.length > MAX_CONTENT_CHARS ? html.slice(0, MAX_CONTENT_CHARS) : html;
    return { title: url, url, cleanedText: raw, truncated: html.length > MAX_CONTENT_CHARS };
  }

  if (options?.rawHtml) {
    const raw = html.length > MAX_CONTENT_CHARS ? html.slice(0, MAX_CONTENT_CHARS) : html;
    return { title: url, url, cleanedText: raw, truncated: html.length > MAX_CONTENT_CHARS };
  }

  return parseHtml(html, url);
}

/**
 * Fetches multiple URLs sequentially and returns their results in order.
 * Uses sequential (not parallel) loading to avoid Electron session conflicts
 * with concurrent BrowserWindow navigations. Skips failed URLs and logs them.
 */
export async function fetchAndParseMany(urls: string[], options?: FetchAndParseOptions): Promise<UrlParseResult[]> {
  const results: UrlParseResult[] = [];
  for (const url of urls) {
    try {
      results.push(await fetchAndParse(url, options));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[urlParser] Skipping ${url}: ${msg}`);
    }
  }
  return results;
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

// ── Shared URL-to-prompt helper ──────────────────────────────────────────────
// Eliminates duplication between hotkey handler (index.ts) and UI handler (ipcHandlers.ts).

interface UrlPromptContext {
  langData: Record<string, string>;
  onLog: (msg: string) => void;
  onNotify: (title: string, body: string) => void;
}

/**
 * If `text` is a single URL, fetches and parses it into an analysis prompt.
 * Otherwise returns the text unchanged.
 */
export async function resolveUrlPrompt(text: string, ctx: UrlPromptContext): Promise<string> {
  if (!isSingleUrl(text)) return text;

  const logFetching = ctx.langData['urlParser.log.fetching'] ?? '🔗 URL detected — fetching page content...';
  const notifyTitle = ctx.langData['urlParser.notify.title'] ?? 'Desktop Agent Center';
  const notifyBody = (ctx.langData['urlParser.notify.body'] ?? 'Fetching: {{url}}').replace('{{url}}', text);
  ctx.onLog(logFetching);
  ctx.onNotify(notifyTitle, notifyBody);

  try {
    const parsed = await fetchAndParse(text);
    const promptTemplate = ctx.langData['urlParser.prompt'] ?? '';
    const truncatedLabel = ctx.langData['urlParser.truncated'] ?? '(Content truncated — too long)';
    const prompt = buildUrlAnalysisPrompt(parsed, promptTemplate, truncatedLabel);
    const logDone = (ctx.langData['urlParser.log.done'] ?? '🔗 Fetched {{chars}} chars — wrapping analysis prompt...')
      .replace('{{chars}}', String(parsed.cleanedText.length));
    ctx.onLog(logDone);
    return prompt;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const logError = (ctx.langData['urlParser.log.error'] ?? '❌ URL fetch failed: {{error}} (sending raw URL instead)')
      .replace('{{error}}', errMsg);
    ctx.onLog(logError);
    return text;
  }
}
