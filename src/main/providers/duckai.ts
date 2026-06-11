// src/main/providers/duckai.ts — Electron DOM-injection automation for Duck AI web
import type { BrowserWindow } from 'electron';
import { navigateAndWait, sleep } from './common';
import { executeAutomationWithTimeout, countElements, dispatchFocusEvents } from './automationExecutor';
import {
  buildDuckaiAutomationScript,
  injectDuckaiLocalStorage,
  setupDuckaiLocalStorageOnDomReady,
} from './duckaiScript';
import { PROVIDER_URLS } from '../../shared/types';
import type { DuckaiModelInfo } from '../../shared/types';

const DUCKAI_HOME = PROVIDER_URLS.duckai;

export type { DuckaiModelInfo };
export { buildDuckaiAutomationScript };

/**
 * Fetches the list of models available on duck.ai by reading the model
 * selector radio inputs from the DOM. Opens and immediately closes the
 * model picker dialog if it is not already open.
 *
 * Navigation is skipped when the worker window is already on the duck.ai
 * origin (e.g., ensureWorkerWindow already loaded it as the initial URL).
 * Navigating twice in quick succession doubles the /duckchat/v1/status calls
 * and triggers 429 rate-limit errors from duck.ai.
 */
export async function fetchDuckaiModels(workerWin: BrowserWindow): Promise<DuckaiModelInfo[]> {
  const wc = workerWin.webContents;

  const alreadyOnDuckAi = wc.getURL().includes('duck.ai');

  if (!alreadyOnDuckAi) {
    // Worker is on a different URL — navigate cleanly.
    // setupDuckaiLocalStorageOnDomReady must be registered BEFORE loadURL fires.
    const lsReady = setupDuckaiLocalStorageOnDomReady(wc);
    await navigateAndWait(wc, DUCKAI_HOME);
    await lsReady;
    await sleep(1_500);
  } else {
    // Worker was already navigated to duck.ai (e.g., by ensureWorkerWindow).
    // If still loading, wait for it to settle; otherwise just inject LS.
    if (wc.isLoading()) {
      await new Promise<void>((resolve) => { wc.once('did-finish-load', () => resolve()); });
    }
    await injectDuckaiLocalStorage(wc);
    // Give React time to mount after the existing navigation completes.
    await sleep(1_000);
  }

  return wc.executeJavaScript(`
    (async function() {
        // Wait for either model inputs (dialog open) or the model-select button
        // to appear, giving React up to 15 seconds to finish rendering.
        let menuBtn = null;
        let inputs = document.querySelectorAll('input[name="model"]');
        let waited = 0;
        while (inputs.length === 0 && !menuBtn && waited < 15000) {
            await new Promise(function(r) { setTimeout(r, 300); });
            waited += 300;
            inputs = document.querySelectorAll('input[name="model"]');
            menuBtn = document.querySelector('[data-testid="model-select-button"]');
        }
        let wasClosedByScript = false;
        if (inputs.length === 0) {
            if (!menuBtn) throw new Error("Cannot find model interface after waiting");
            menuBtn.click();
            wasClosedByScript = true;
            await new Promise(function(r) { setTimeout(r, 300); });
            inputs = document.querySelectorAll('input[name="model"]');
        }
        if (inputs.length === 0) throw new Error("Cannot fetch model list");
        const modelList = Array.from(inputs).map(function(input) {
            const label = document.querySelector('label[for="' + input.id + '"]');
            const nameNode = label ? label.querySelector('.J58ouJfofMIxA2Ukt6lA') : null;
            const strongNode = nameNode ? nameNode.querySelector('strong') : null;
            const fullName = strongNode
                ? strongNode.textContent.trim()
                : (nameNode ? nameNode.textContent.trim() : "Unknown");
            return {
                id: input.value,
                label: fullName || "Unknown",
                isActive: input.checked || input.getAttribute('aria-checked') === 'true'
            };
        });
        if (wasClosedByScript) {
            const closeBtn = document.querySelector('button[aria-label="close dialog"]');
            if (closeBtn) closeBtn.click();
        }
        return modelList;
    })()
  `, false);
}

/**
 * Runs the full Duck AI automation: injects the prompt, waits for the
 * response to complete, and returns the extracted text.
 *
 * Model selection is passed via the `targetUrl` query param as an internal
 * encoding (`?model=<id>`). The ID is extracted, stripped from the URL before
 * navigation, then applied via DOM: open the model picker dialog, select the
 * matching radio input, and click "Start New Chat".
 */
export async function runDuckaiAutomation(
  workerWin: BrowserWindow,
  prompt: string,
  timeoutMs = 60_000,
  targetUrl: string = DUCKAI_HOME,
): Promise<{ response: string; title: string }> {
  const wc = workerWin.webContents;

  // Extract model ID from ?model= query param; empty string = use current selection.
  let modelId = '';
  let navigateUrl: string = DUCKAI_HOME;
  try {
    const parsed = new URL(targetUrl);
    modelId = parsed.searchParams.get('model') ?? '';

    modelId = modelId.replace(/\/$/, '').trim();

    parsed.searchParams.delete('model');
    navigateUrl = parsed.toString();
  } catch {
    navigateUrl = DUCKAI_HOME;
  }

  // Inject localStorage at dom-ready so the onboarding modal never mounts.
  const lsReady = setupDuckaiLocalStorageOnDomReady(wc);
  await navigateAndWait(wc, navigateUrl);
  await lsReady;

  // Dispatch focus events so duck.ai doesn't throttle the hidden worker window.
  await dispatchFocusEvents(wc);

  const baseline = await countElements(wc, 'div[id*="assistant-message"]');

  const autoScript = buildDuckaiAutomationScript(prompt, baseline, timeoutMs, modelId);
  const result = await executeAutomationWithTimeout<{ response: string; title: string }>(
    wc,
    autoScript,
    timeoutMs,
    'Duck AI',
  );

  if (!result || !result.response || result.response.trim() === '') {
    throw new Error('Duck AI returned empty response');
  }

  return {
    response: result.response.trim(),
    title: (result.title || '').trim(),
  };
}
