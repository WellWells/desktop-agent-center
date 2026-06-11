// src/main/parserBlocks.ts — Parser-block execution against fetched HTML/XML
//
// Pure functions: cheerio-based CSS selector / regex / RSS extraction blocks.
// No Electron APIs here — page loading lives in pageLoader.ts.

import { load } from 'cheerio';

/** A single parsed item from an RSS or Atom feed. */
export interface RssFeedItem {
  link: string;
  pubDate?: string; // ISO 8601 string, undefined if not present or unparseable
}

/**
 * Parses an RSS/Atom feed XML string and returns items with link + pubDate.
 * Unlike the `parseRss` parser block (which returns only URLs), this function
 * preserves pubDate metadata needed for checkpoint-based deduplication.
 */
export function parseRssFeed(rawXml: string): RssFeedItem[] {
  const $xml = load(rawXml, { xmlMode: true });
  const items: RssFeedItem[] = [];

  const toIso = (raw: string): string | undefined => {
    if (!raw) return undefined;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  };

  // Try RSS 2.0 <item>
  $xml('item').each((_, el) => {
    const link = $xml(el).find('link').first().text().trim();
    if (!link || !/^https?:\/\//i.test(link)) return;
    const pubDate = toIso($xml(el).find('pubDate').first().text().trim());
    items.push({ link, pubDate });
  });

  // Fall back to Atom <entry>
  if (items.length === 0) {
    $xml('entry').each((_, el) => {
      const href = $xml(el).find('link').attr('href') ?? '';
      const text = $xml(el).find('link').first().text().trim();
      const link = href || text;
      if (!link || !/^https?:\/\//i.test(link)) return;
      const rawDate =
        $xml(el).find('updated').first().text().trim() ||
        $xml(el).find('published').first().text().trim();
      const pubDate = toIso(rawDate);
      items.push({ link, pubDate });
    });
  }

  return items;
}

export type ParserBlockType =
  | 'extractLinks'    // user intent: extract all <a> hrefs → URL array
  | 'extractText'     // user intent: get text content (first match)
  | 'parseRss'        // user intent: parse RSS/Atom feed items → URL array
  | 'getLinks'        // legacy alias for extractLinks
  | 'getText'         // legacy alias for extractText
  | 'getTexts'
  | 'getHtml'
  | 'getAttribute'
  | 'getByRegex';

export interface ParserBlock {
  id: string;
  type: ParserBlockType;
  selector: string;
  attribute?: string;
  // Regex-specific fields (used when type === 'getByRegex')
  pattern?: string;
  flags?: string;
  group?: number;
  // Array output limit: 0 = unlimited, positive N = keep first N items (default: 3)
  maxItems?: number;
}

/**
 * Extracts elements matching a CSS selector from raw HTML.
 * Selector may include the uBlock-style "##" prefix (stripped automatically).
 *
 * - outputType 'links': finds <a> hrefs within or on matched elements → JSON URL array
 * - outputType 'text': extracts text content of each matched element → separator-joined string
 */
export function runCssSelector(
  html: string,
  sourceUrl: string,
  selector: string,
  outputType: 'links' | 'text',
  maxItems: number,
): string {
  const cleanSel = selector.replace(/^##/, '').trim();
  if (!cleanSel) return '';

  const $ = load(`<html>${html}</html>`);

  let baseOrigin = '';
  try {
    baseOrigin = new URL(sourceUrl).origin;
  } catch {
    // keep empty — relative URLs will not be resolved
  }

  if (outputType === 'links') {
    const links: string[] = [];
    $(cleanSel).each((_, el) => {
      const $el = $(el);
      const directHref = $el.attr('href') ?? '';
      if (directHref) {
        try {
          const resolved = new URL(directHref, baseOrigin || sourceUrl).href;
          if (/^https?:\/\//i.test(resolved)) links.push(resolved);
        } catch { /* skip unparseable href */ }
        return;
      }
      $el.find('a[href]').each((_, a) => {
        const href = $(a).attr('href') ?? '';
        if (!href) return;
        try {
          const resolved = new URL(href, baseOrigin || sourceUrl).href;
          if (/^https?:\/\//i.test(resolved)) links.push(resolved);
        } catch { /* skip */ }
      });
    });
    const limited = maxItems > 0 ? links.slice(0, maxItems) : links;
    return JSON.stringify(limited);
  }

  const texts: string[] = [];
  $(cleanSel).each((_, el) => {
    const text = $(el).text().trim();
    if (text) texts.push(text);
  });
  const limited = maxItems > 0 ? texts.slice(0, maxItems) : texts;
  return limited.join('\n\n---\n\n');
}

/**
 * Runs an ordered list of parser blocks against the fetched HTML or XML.
 * Returns the output of the last block (or empty string if the list is empty).
 *
 * DOM-based blocks query the content via CSS selectors (works for both HTML and XML):
 * - getLinks: CSS selector → JSON array of absolute href URLs
 * - getText: CSS selector → text content of the first match
 * - getTexts: CSS selector → JSON array of all matches' text content
 * - getHtml: CSS selector → innerHTML of the first match
 * - getAttribute: CSS selector + attribute → attribute value of the first match
 *
 * Regex block operates on the accumulated text output of previous blocks
 * (or the raw HTML/XML when it is the first block):
 * - getByRegex: regex pattern + flags + group → first match text or JSON array of all matches
 *
 * When xmlMode is true, cheerio parses the content with XML semantics (case-sensitive tags,
 * self-closing tags, no implicit HTML structure). Use this for RSS/Atom feeds.
 */
export function runParserBlocks(html: string, sourceUrl: string, blocks: ParserBlock[], xmlMode = false): string {
  if (blocks.length === 0) return '';

  const $ = xmlMode
    ? load(html, { xmlMode: true })
    : load(`<html>${html}</html>`);

  // Resolve relative URLs to absolute using the source URL's origin.
  let baseOrigin = '';
  try {
    const base = new URL(sourceUrl);
    baseOrigin = base.origin;
  } catch {
    // keep empty — relative URLs will not be resolved
  }

  // Regex blocks apply to the accumulated text output of previous blocks.
  // The initial value is the raw HTML so a leading getByRegex works on the full source.
  let lastOutput = html;

  for (const block of blocks) {
    if (block.type === 'getByRegex') {
      const pat = (block.pattern ?? '').trim();
      if (!pat) continue;
      try {
        const flags = block.flags ?? '';
        const group = block.group ?? 0;
        const regex = new RegExp(pat, flags);
        if (flags.includes('g')) {
          const matches: string[] = [];
          let m: RegExpExecArray | null;
          while ((m = regex.exec(lastOutput)) !== null) {
            matches.push(m[group] ?? m[0] ?? '');
            // Prevent infinite loops on zero-width matches
            if (regex.lastIndex === m.index) regex.lastIndex++;
          }
          lastOutput = JSON.stringify(applyMaxItems(matches, block.maxItems));
        } else {
          const m = regex.exec(lastOutput);
          lastOutput = m ? (m[group] ?? m[0] ?? '') : '';
        }
      } catch {
        // Invalid regex — leave lastOutput unchanged
      }
      continue;
    }

    // parseRss: auto-detect RSS/Atom items using XML-mode parsing (no selector needed)
    if (block.type === 'parseRss') {
      const $xml = load(html, { xmlMode: true });
      const links: string[] = [];

      // Try RSS <item> first
      $xml('item').each((_, el) => {
        const link = $xml(el).find('link').first().text().trim();
        if (link && /^https?:\/\//i.test(link)) links.push(link);
      });

      // Fall back to Atom <entry>
      if (links.length === 0) {
        $xml('entry').each((_, el) => {
          const href = $xml(el).find('link').attr('href') ?? '';
          const text = $xml(el).find('link').first().text().trim();
          const link = href || text;
          if (link && /^https?:\/\//i.test(link)) links.push(link);
        });
      }

      lastOutput = JSON.stringify(applyMaxItems(links, block.maxItems));
      continue;
    }

    const selector = block.selector.trim();
    if (!selector) continue;

    switch (block.type) {
      case 'extractLinks':
      case 'getLinks': {
        const links: string[] = [];
        $(selector).each((_, el) => {
          const href = $(el).attr('href') ?? '';
          if (!href) return;
          try {
            const resolved = new URL(href, baseOrigin || sourceUrl).href;
            if (/^https?:\/\//i.test(resolved)) links.push(resolved);
          } catch {
            // skip unparseable hrefs
          }
        });
        lastOutput = JSON.stringify(applyMaxItems(links, block.maxItems));
        break;
      }
      case 'extractText':
      case 'getText': {
        lastOutput = $(selector).first().text().trim();
        break;
      }
      case 'getTexts': {
        const texts: string[] = [];
        $(selector).each((_, el) => {
          const text = $(el).text().trim();
          if (text) texts.push(text);
        });
        lastOutput = JSON.stringify(applyMaxItems(texts, block.maxItems));
        break;
      }
      case 'getHtml': {
        lastOutput = $(selector).first().html() ?? '';
        break;
      }
      case 'getAttribute': {
        const attr = (block.attribute ?? '').trim();
        lastOutput = attr ? ($(selector).first().attr(attr) ?? '') : '';
        break;
      }
    }
  }

  return lastOutput;
}

/** Applies maxItems limit to an array: 0 = unlimited, otherwise keep first N. */
function applyMaxItems<T>(arr: T[], maxItems: number | undefined): T[] {
  const limit = maxItems ?? 3;
  return limit > 0 ? arr.slice(0, limit) : arr;
}
