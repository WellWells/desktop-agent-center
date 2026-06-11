// src/main/pageLoader.ts — Page-loading machinery for URL parsing
//
// Uses a hidden Electron BrowserWindow (real Chromium) to load JS-rendered pages.
// Auth and bot challenges are not bypassed; challenge pages may be returned as-is.
//
// For RSS/Atom feeds, uses Electron's net.request() directly — Chromium's
// innerHTML serialization collapses <link> into a void element and drops its
// text content (the article URL), so BrowserWindow is unsuitable for RSS.

import { BrowserWindow, net } from 'electron';
import { CLEAN_UA } from './userAgent';

/** Total page-load timeout (ms) before we give up and throw. */
const LOAD_TIMEOUT_MS = 25_000;

/** Timeout for raw HTTP fetch (used for RSS/Atom feeds). */
const RAW_FETCH_TIMEOUT_MS = 15_000;

/**
 * Extra settle time (ms) after `did-finish-load`.
 * Gives JS-rendered pages (React/Vue SPAs) time to mount content.
 */
const JS_SETTLE_MS = 1_500;

/**
 * Timeout (ms) for the inner `executeJavaScript` that serializes the DOM.
 * This call runs after the outer page-load timeout has been cleared, so without
 * its own guard a hung renderer (e.g. an unresponsive JS challenge page) would
 * leave the Promise unsettled and leak the off-screen window forever.
 */
const JS_EXEC_TIMEOUT_MS = 10_000;
const URL_PARSER_PARTITION = 'persist:url-parser';

/**
 * Fetches a URL via Electron's net.request() and returns the raw response body.
 * Used for RSS/Atom feeds where BrowserWindow innerHTML serialization loses
 * <link> text content (Chromium treats <link> as a void HTML element).
 */
export function fetchRawText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Raw fetch timed out after ${RAW_FETCH_TIMEOUT_MS / 1_000}s`)),
      RAW_FETCH_TIMEOUT_MS,
    );

    const request = net.request({ url, method: 'GET' });
    const chunks: Buffer[] = [];

    request.on('response', (response) => {
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
      response.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    request.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });

    request.end();
  });
}

/**
 * Spins up a hidden BrowserWindow, loads the URL with the parser Chromium
 * session, waits for load + JS settle,
 * then returns the full `innerHTML` of `<html>`.
 */
export function loadPageHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

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
        partition: URL_PARSER_PARTITION,
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
      if (settleTimer) clearTimeout(settleTimer);
      safeDestroy(win);
      reject(new Error(`Page load timed out after ${LOAD_TIMEOUT_MS / 1_000}s`));
    }, LOAD_TIMEOUT_MS);

    win.webContents.on('did-finish-load', () => {
      if (settled) return;
      // Give JS-rendered content (React/Vue/Next) time to mount
      settleTimer = setTimeout(async () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try {
          // Guard the DOM serialization with its own timeout: the outer page-load
          // timeout is already cleared by this point, so a hung renderer would
          // otherwise never settle and leak `win`. On timeout the catch below
          // destroys the window and rejects.
          let execTimer: ReturnType<typeof setTimeout> | undefined;
          const execTimeout = new Promise<never>((_, rej) => {
            execTimer = setTimeout(
              () => rej(new Error(`DOM serialization timed out after ${JS_EXEC_TIMEOUT_MS / 1_000}s`)),
              JS_EXEC_TIMEOUT_MS,
            );
          });
          const html = (await Promise.race([
            win.webContents.executeJavaScript('document.documentElement.innerHTML'),
            execTimeout,
          ]).finally(() => clearTimeout(execTimer))) as string;
          safeDestroy(win);
          resolve(html);
        } catch (err) {
          safeDestroy(win);
          reject(err);
        }
      }, JS_SETTLE_MS);
    });

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
      if (settled) return;
      // Only care about main-frame navigation failures.
      // Subresource failures (ads, tracking pixels, etc.) fire this event too
      // and should not abort the page fetch.
      if (!isMainFrame) return;
      // ERR_ABORTED (-3) fires for navigations cancelled by JS — page may still
      // have loaded (e.g. redirect via window.location). Let the settle path run.
      if (errorCode === -3) return;
      settled = true;
      clearTimeout(timeout);
      if (settleTimer) clearTimeout(settleTimer);
      safeDestroy(win);
      reject(new Error(`Failed to load page: ${errorDescription} (${errorCode})`));
    });

    win.loadURL(url).catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (settleTimer) clearTimeout(settleTimer);
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
