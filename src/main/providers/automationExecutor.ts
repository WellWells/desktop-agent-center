// Shared Node-side helpers for provider automations
// These deduplicate the execute/timeout/baseline/focus patterns that every
// provider (gemini / chatgpt / perplexity / duckai) repeated verbatim.
import type { WebContents } from 'electron';

/**
 * Executes a provider automation script in the page, racing it against a
 * Node-side hard timeout so a hung renderer can never block the queue.
 *
 * Error semantics match the original per-provider implementations:
 * - timeout rejects with `"<label> automation timed out (Node side)"`
 * - any failure (including the timeout) is re-thrown as
 *   `"<label> automation failed: <message>"`
 *
 * @param nodeTimeoutMs Optional override for the hard timeout; defaults to
 *   `max(timeoutMs * 5, 300_000)` — the multiplier every provider used.
 */
export async function executeAutomationWithTimeout<T>(
  wc: WebContents,
  script: string,
  timeoutMs: number,
  providerLabel: string,
  nodeTimeoutMs?: number,
): Promise<T> {
  const hardTimeoutMs = nodeTimeoutMs ?? Math.max(timeoutMs * 5, 300_000);

  let nodeTimeoutId!: ReturnType<typeof setTimeout>;
  const nodeTimeout = new Promise<never>((_, reject) => {
    nodeTimeoutId = setTimeout(
      () => reject(new Error(`${providerLabel} automation timed out (Node side)`)),
      hardTimeoutMs,
    );
  });

  try {
    return (await Promise.race([wc.executeJavaScript(script, true), nodeTimeout])) as T;
  } catch (err: unknown) {
    throw new Error(`${providerLabel} automation failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(nodeTimeoutId);
  }
}

/**
 * Counts elements matching `selector` in the page. Used to snapshot a
 * baseline before sending a prompt so the automation script can detect the
 * NEW response node. Swallows executeJavaScript errors and returns 0.
 */
export async function countElements(wc: WebContents, selector: string): Promise<number> {
  try {
    return (await wc.executeJavaScript(
      `document.querySelectorAll(${JSON.stringify(selector)}).length`,
      false,
    )) as number;
  } catch {
    return 0;
  }
}

/**
 * Dispatches the focus events a browser would fire when a tab becomes active,
 * so the page does not throttle or ignore input in the hidden worker window.
 */
export async function dispatchFocusEvents(wc: WebContents): Promise<void> {
  await wc.executeJavaScript(`
    window.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
    document.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  `, false);
}
