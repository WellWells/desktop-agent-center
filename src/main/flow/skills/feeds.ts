// src/main/flow/skills/feeds.ts — checkpoint-based feed ingestion skills (rss, scraper).
//
// Both skills fetch a remote list of items and return only those unseen since the
// previous run, persisting a per-step checkpoint to deduplicate across executions.

import { load } from 'cheerio';
import { getProviderLabel, preparePromptForProvider } from '../../providers';
import { fetchAndParse, fetchRawText, parseRssFeed } from '../../urlParser';
import { sendLog } from '../../helpers';
import { makeCheckpointStore } from '../checkpoint';

// ── RSS Skill ────────────────────────────────────────────────────────────────

/** RSS checkpoint state persisted per step instance. */
interface RssCheckpoint {
  lastLinks: string[];
  /** ISO 8601 pubDate of the oldest item among lastLinks; used as a dedup anchor. */
  lastPubDate?: string;
  updatedAt: string;
}

const rssCheckpoints = makeCheckpointStore<RssCheckpoint>('rss');

/**
 * Fetches RSS/Atom feed and returns new article links since last checkpoint.
 * - First run: returns latest 5 items, creates checkpoint
 * - Subsequent runs: returns articles newer than checkpoint, updates checkpoint
 * - When fetchContent is enabled, fetches each URL's content and formats as title/link/content
 */
export async function execRss(
  config: Record<string, string>,
  stepId: string,
  targetUrl: string,
): Promise<string> {
  const url = config.url ?? '';
  if (!url) return '[]';

  const INITIAL_FETCH_COUNT = 5;

  sendLog(`📡 [AgentFlow] RSS step — fetching feed: ${url}`);

  // Fetch the raw feed XML
  const rawXml = await fetchRawText(url);

  // Parse feed items (link + pubDate) for rich deduplication
  const allItems = parseRssFeed(rawXml);
  const allLinks = allItems.map((item) => item.link);

  if (allLinks.length === 0) {
    sendLog('📡 [AgentFlow] RSS: feed returned 0 items');
    return '[]';
  }

  // Load existing checkpoint
  const checkpoint = await rssCheckpoints.load(stepId);

  let newLinks: string[];

  if (!checkpoint) {
    // First run: take latest N items and create checkpoint
    newLinks = allLinks.slice(0, INITIAL_FETCH_COUNT);
    sendLog(`📡 [AgentFlow] RSS: first run — returning ${newLinks.length} latest items`);
  } else {
    // Subsequent run: filter items not in the known set.
    // Do NOT break early — popularity-sorted feeds (e.g. Mobile01 hot articles)
    // are NOT ordered strictly by time; a known article can appear anywhere in the list.
    const knownSet = new Set(checkpoint.lastLinks);
    const anchorDate = checkpoint.lastPubDate ? new Date(checkpoint.lastPubDate) : null;

    newLinks = allItems
      .filter((item) => {
        if (knownSet.has(item.link)) return false;
        // pubDate anchor: skip articles clearly older than our checkpoint pool
        if (anchorDate && item.pubDate) {
          const itemDate = new Date(item.pubDate);
          if (itemDate < anchorDate) return false;
        }
        return true;
      })
      .map((item) => item.link);

    sendLog(`📡 [AgentFlow] RSS: found ${newLinks.length} new items since checkpoint`);

    if (newLinks.length > INITIAL_FETCH_COUNT) {
      sendLog(`⚠️ [AgentFlow] RSS: New items count (${newLinks.length}) exceeds limit of ${INITIAL_FETCH_COUNT}. Protection mechanism activated, fetching the latest ${INITIAL_FETCH_COUNT} items.`);
      newLinks = allLinks.slice(0, INITIAL_FETCH_COUNT);
    }
  }

  // Compute oldest pubDate among the top-100 items for next checkpoint anchor
  const poolItems = allItems.slice(0, 100);
  const poolDates = poolItems
    .map((item) => item.pubDate)
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime());
  const oldestPubDate =
    poolDates.length > 0
      ? new Date(Math.min(...poolDates)).toISOString()
      : undefined;

  // Update checkpoint — store up to 100 links to handle popularity-sorted feeds
  await rssCheckpoints.save(stepId, {
    lastLinks: allLinks.slice(0, 100),
    lastPubDate: oldestPubDate,
    updatedAt: new Date().toISOString(),
  });

  if (newLinks.length === 0) {
    return '[]';
  }

  // If fetchContent is disabled, return link array
  if (config.fetchContent !== 'true') {
    return JSON.stringify(newLinks);
  }

  // Fetch content from each link and format
  sendLog(`📡 [AgentFlow] RSS: fetching content for ${newLinks.length} articles`);
  const parts: string[] = [];
  for (let i = 0; i < newLinks.length; i++) {
    const articleUrl = newLinks[i];
    sendLog(`📡 [${i + 1}/${newLinks.length}] Fetching: ${articleUrl}`);
    try {
      const result = await fetchAndParse(articleUrl, { rawHtml: false });
      const title = result.title || articleUrl;
      parts.push(`title: ${title}\nlink: ${articleUrl}\ncontent: ${result.cleanedText}`);
      sendLog(`✅ [${i + 1}/${newLinks.length}] OK — ${result.cleanedText.length} chars`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      parts.push(`title: (fetch failed)\nlink: ${articleUrl}\ncontent: Error: ${msg}`);
      sendLog(`❌ [${i + 1}/${newLinks.length}] Failed: ${msg}`);
    }
  }

  const rawOutput = parts.join('\n\n---\n\n');
  const prepared = preparePromptForProvider(rawOutput, targetUrl);
  if (prepared.truncated) {
    sendLog(`✂️ [AgentFlow] RSS: output truncated to ${prepared.maxChars} chars (${getProviderLabel(targetUrl)} limit)`);
  }
  return prepared.prompt;
}

// ── Scraper Skill ────────────────────────────────────────────────────────────

interface ScraperCheckpoint {
  lastLinks: string[];
  lastTitles?: string[];
  updatedAt: string;
}

const scraperCheckpoints = makeCheckpointStore<ScraperCheckpoint>('scraper');

export async function execScraper(
  config: Record<string, string>,
  stepId: string,
): Promise<string> {
  const url = config.url ?? '';
  if (!url) return '[]';

  sendLog(`🔍 [AgentFlow] Web Scraper step — fetching page: ${url}`);
  const result = await fetchAndParse(url, { rawHtml: true });
  const html = result.cleanedText;

  const $ = load(`<html>${html}</html>`);

  let baseOrigin = '';
  try {
    baseOrigin = new URL(url).origin;
  } catch {
    // ignore
  }

  const items: Array<{ title: string; link: string }> = [];

  const itemSel = (config.itemSelector ?? '').trim();
  const titleSel = (config.titleSelector ?? '').trim();
  const linkSel = (config.linkSelector ?? '').trim();

  if (!titleSel && !linkSel) {
    sendLog(`⚠️ [AgentFlow] Scraper: Both titleSelector and linkSelector are empty!`);
    return '[]';
  }

  if (itemSel) {
    // Nested selector mode
    $(itemSel).each((_, el) => {
      const $el = $(el);
      const title = titleSel ? $el.find(titleSel).first().text().trim() : $el.text().trim();
      let rawLink = '';
      if (linkSel) {
        const linkEl = $el.find(linkSel).first();
        rawLink = linkEl.attr('href') ?? linkEl.text().trim();
      } else {
        rawLink = $el.attr('href') ?? '';
      }

      if (rawLink) {
        try {
          const resolved = new URL(rawLink, baseOrigin || url).href;
          if (/^https?:\/\//i.test(resolved)) {
            items.push({ title: title || resolved, link: resolved });
          }
        } catch {
          // ignore
        }
      }
    });
  } else {
    // Global selector mode paired by index
    const titles: string[] = [];
    if (titleSel) {
      $(titleSel).each((_, el) => {
        titles.push($(el).text().trim());
      });
    }

    const rawLinks: string[] = [];
    if (linkSel) {
      $(linkSel).each((_, el) => {
        const $el = $(el);
        const l = $el.attr('href') ?? $el.text().trim();
        rawLinks.push(l);
      });
    }

    const maxLen = Math.max(titles.length, rawLinks.length);
    for (let i = 0; i < maxLen; i++) {
      const title = titles[i] ?? '';
      const rawLink = rawLinks[i] ?? '';
      if (rawLink) {
        try {
          const resolved = new URL(rawLink, baseOrigin || url).href;
          if (/^https?:\/\//i.test(resolved)) {
            items.push({ title: title || resolved, link: resolved });
          }
        } catch {
          // ignore
        }
      }
    }
  }

  sendLog(`🔍 [AgentFlow] Scraper: Found ${items.length} total items on page`);

  if (items.length === 0) {
    return '[]';
  }

  // Load existing checkpoint
  const checkpoint = await scraperCheckpoints.load(stepId);

  // A set of seen titles and links from the checkpoint
  const seenSet = new Set<string>();
  if (checkpoint) {
    if (checkpoint.lastTitles) {
      checkpoint.lastTitles.forEach((t) => { if (t) seenSet.add(t.trim()); });
    }
    if (checkpoint.lastLinks) {
      checkpoint.lastLinks.forEach((l) => { if (l) seenSet.add(l.trim()); });
    }
  }

  const newItems: Array<{ title: string; link: string }> = [];
  for (const item of items) {
    const titleKey = item.title.trim();
    const linkKey = item.link.trim();
    if (!titleKey && !linkKey) continue;

    // Check if seen (by title or by link)
    const isSeen = (titleKey && seenSet.has(titleKey)) || (linkKey && seenSet.has(linkKey));
    if (!isSeen) {
      newItems.push(item);
    }
  }

  const INITIAL_FETCH_COUNT = parseInt(config.maxItems ?? '5', 10);

  // Slice to get the items to return in this execution
  const itemsToReturn = newItems.slice(0, INITIAL_FETCH_COUNT);

  if (!checkpoint) {
    sendLog(`🔍 [AgentFlow] Scraper: First run — returning ${itemsToReturn.length} latest items`);
  } else {
    sendLog(`🔍 [AgentFlow] Scraper: Found ${itemsToReturn.length} new items out of ${newItems.length} total unseen items`);
  }

  // Update checkpoint — replace entirely with current page content so that
  // items removed from the webpage are also removed from the checkpoint.
  const newCheckpointTitles = items.map((item) => item.title.trim()).filter(Boolean);
  const newCheckpointLinks = items.map((item) => item.link.trim()).filter(Boolean);

  await scraperCheckpoints.save(stepId, {
    lastLinks: newCheckpointLinks,
    lastTitles: newCheckpointTitles,
    updatedAt: new Date().toISOString(),
  });

  return JSON.stringify(itemsToReturn);
}
