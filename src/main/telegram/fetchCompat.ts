// src/main/telegram/fetchCompat.ts — fetch shim for grammy on Node.js 18+.
//
// Patches request init for streaming bodies (duplex) and relays grammy's
// non-native abort signals onto a native AbortController so undici accepts them.

export function telegramFetchCompat(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): ReturnType<typeof fetch> {
  // Node.js 18+ requires duplex: 'half' when sending a request body (e.g. multipart/form-data for sendDocument)
  const patchedInit = init?.body != null
    ? ({ ...init, duplex: 'half' } as Parameters<typeof fetch>[1])
    : init;

  const signal = patchedInit?.signal;
  if (!signal || isNativeAbortSignal(signal)) return fetch(input, patchedInit);

  const source = signal as {
    aborted?: boolean;
    addEventListener?: (type: 'abort', listener: () => void) => void;
    removeEventListener?: (type: 'abort', listener: () => void) => void;
  };
  const controller = new AbortController();

  const relayAbort = (): void => {
    controller.abort();
    source.removeEventListener?.('abort', relayAbort);
  };
  if (source.aborted) relayAbort();
  else source.addEventListener?.('abort', relayAbort);

  const result = fetch(input, { ...patchedInit, signal: controller.signal });
  result.finally(() => {
    source.removeEventListener?.('abort', relayAbort);
  });
  return result;
}

function isNativeAbortSignal(value: unknown): value is AbortSignal {
  if (typeof AbortSignal === 'undefined') return false;
  return value instanceof AbortSignal;
}
