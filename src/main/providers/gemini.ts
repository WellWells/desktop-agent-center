// src/main/providers/gemini.ts — Electron DOM-injection automation for Gemini web
import type { BrowserWindow } from 'electron';
import { sleep, navigateAndWait, INJECTED_SLEEP_JS, INJECTED_WAIT_FOR_JS, INJECTED_INTERCEPT_COPY_JS } from './common';
import { PROVIDER_URLS } from '../../shared/types';

export async function runGeminiAutomation(
  workerWin: BrowserWindow,
  prompt: string,
  timeoutMs = 60_000,
  targetUrl: string = PROVIDER_URLS.gemini,
): Promise<{ response: string; title: string }> {
  const wc = workerWin.webContents;

  await navigateAndWait(wc, targetUrl);
  await sleep(500);

  // ── Focus & visibility spoofing ──────────────────────────────────────────
  // The worker window is kept hidden (off-screen + opacity:0) to avoid
  // stealing OS focus from the main window on macOS. Gemini's JS, however,
  // can check document.hasFocus() / document.visibilityState / document.hidden
  // and may refuse to accept input or throttle rendering when it detects
  // an invisible context.
  //
  // Strategy: patch the APIs in-page so Gemini always sees a focused,
  // visible document, then dispatch the expected browser events.
  await wc.executeJavaScript(`
    (function patchVisibility() {
      // 1. Override document.hidden / visibilityState
      try {
        Object.defineProperty(document, 'hidden', { get: function() { return false; }, configurable: true });
        Object.defineProperty(document, 'visibilityState', { get: function() { return 'visible'; }, configurable: true });
      } catch(e) {}
      // 2. Override document.hasFocus so it always returns true
      try {
        document.hasFocus = function() { return true; };
      } catch(e) {}
      // 3. Suppress visibilitychange + blur events so they can't un-focus the page
      document.addEventListener('visibilitychange', function(e) { e.stopImmediatePropagation(); }, true);
      window.addEventListener('blur', function(e) { e.stopImmediatePropagation(); }, true);
      // 4. Fire visibility + focus events the browser would send when a tab becomes active
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
      window.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
      document.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    })();
    void 0;
  `, false);

  let baseline = 0;
  try {
    baseline = await wc.executeJavaScript(
      `document.querySelectorAll('copy-button button[data-test-id="copy-button"]').length`,
      false,
    );
  } catch {
    baseline = 0;
  }

  // Focus the Chromium renderer process (not the OS window) so keyboard events work.
  // This is different from BrowserWindow.focus() which would steal OS focus.
  wc.focus();

  const autoScript = buildGeminiAutomationScript(prompt, baseline, timeoutMs);

  let nodeTimeoutId!: ReturnType<typeof setTimeout>;
  const nodeTimeout = new Promise<never>((_, reject) => {
    nodeTimeoutId = setTimeout(
      () => reject(new Error('Gemini automation timed out (Node side)')),
      Math.max(timeoutMs * 5, 300_000),
    );
  });

  let result: { response: string; title: string };
  try {
    result = await Promise.race([wc.executeJavaScript(autoScript, true), nodeTimeout]);
  } catch (err: unknown) {
    throw new Error(`Gemini automation failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(nodeTimeoutId);
  }

  if (!result || !result.response || result.response.trim() === '') {
    throw new Error('Clipboard interceptor returned empty text');
  }

  return {
    response: result.response.trim(),
    title: (result.title || '').trim(),
  };
}

function buildGeminiAutomationScript(
  prompt: string,
  baselineCopyCount: number,
  timeoutMs: number,
): string {
  const escapedPrompt = JSON.stringify(prompt);

  return `
(async function geminiAutomate() {
  var TIMEOUT  = ${timeoutMs};
  var BASELINE = ${baselineCopyCount};
  var startedAt = Date.now();
  ${INJECTED_SLEEP_JS}
  ${INJECTED_WAIT_FOR_JS}
  ${INJECTED_INTERCEPT_COPY_JS}

  var INPUT_SELECTORS = [
    'rich-textarea div[contenteditable="true"]',
    'div.ql-editor[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
  ];

  var input = null;
  await waitFor(function() {
    for (var i = 0; i < INPUT_SELECTORS.length; i++) {
      var el = document.querySelector(INPUT_SELECTORS[i]);
      if (el) { input = el; return true; }
    }
    return false;
  }, 'input area', 15000, 300);

  if (!input) throw new Error('Gemini input area not found — is the page logged in?');

  input.focus();
  input.dispatchEvent(new FocusEvent('focusin',  { bubbles: true }));
  input.dispatchEvent(new FocusEvent('focus',    { bubbles: false }));
  input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  input.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true, composed: true }));
  await sleep(200);

  document.execCommand('selectAll', false, null);
  await sleep(100);
  var dt = new DataTransfer();
  dt.setData('text/plain', ${escapedPrompt});
  input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  if (!(input.innerText || '').trim()) {
    document.execCommand('insertText', false, ${escapedPrompt});
  }

  input.dispatchEvent(new InputEvent('input', {
    bubbles: true, cancelable: true, inputType: 'insertText'
  }));
  await sleep(600);

  var SEND_SELECTORS = [
    'button[aria-label="Send message"]',
    'button[mattooltip="Send message"]',
    'button[data-test-id="send-button"]',
    'button.send-button',
    '[jsname="Jh9lGc"]',
  ];

  var sent = false;
  for (var s = 0; s < SEND_SELECTORS.length; s++) {
    var btn = document.querySelector(SEND_SELECTORS[s]);
    if (btn && !btn.disabled) {
      btn.click();
      sent = true;
      break;
    }
  }

  if (!sent) {
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13,
      bubbles: true, cancelable: true
    }));
    await sleep(50);
    input.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
    }));
  }

  await sleep(1000);

  // Wait for generation to complete using content-change detection.
  // Timeout only starts after response content stops changing (30 s of inactivity).
  var NO_CHANGE_LIMIT = 30000;
  var geminiLastLen = -1;
  var geminiLastChangeAt = null;
  while (true) {
    var copyBtns = document.querySelectorAll('copy-button button[data-test-id="copy-button"]');
    if (copyBtns.length > BASELINE) break;
    var respEls = document.querySelectorAll('model-response, message-content');
    var respLen = 0;
    if (respEls.length > 0) {
      respLen = (respEls[respEls.length - 1].innerText || '').length;
    }
    if (respLen === 0) {
      var mainEl = document.querySelector('main');
      respLen = mainEl ? (mainEl.innerText || '').length : (document.body.innerText || '').length;
    }
    if (respLen !== geminiLastLen) {
      geminiLastLen = respLen;
      geminiLastChangeAt = Date.now();
    }
    if (geminiLastChangeAt !== null && Date.now() - geminiLastChangeAt > NO_CHANGE_LIMIT) {
      throw new Error('Timeout: Gemini response had no changes for 30 seconds');
    }
    await sleep(500);
  }

  await sleep(400);

  var title = '';
  try {
    var titleEl = document.querySelector('span[data-test-id="conversation-title"]');
    if (titleEl) title = titleEl.innerText;
  } catch(e) {}

  var allCopyBtns = document.querySelectorAll('copy-button button[data-test-id="copy-button"]');
  var lastCopyBtn = allCopyBtns[allCopyBtns.length - 1];
  if (!lastCopyBtn) throw new Error('Copy button vanished unexpectedly');

  var response = await interceptCopy(lastCopyBtn);
  if (!response) throw new Error('Clipboard interceptor got nothing after copy click');
  return { response: response, title: title };
})()`;
}
