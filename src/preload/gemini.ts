// src/preload/gemini.ts
//
// NOTE: This preload runs with contextIsolation: false so it executes in the
// same JS world as the page — that is what makes Object.defineProperty work.

// ── Google Chrome identity stub ───────────────────────────────────────────────
// When a Chromium-based UA is used, Google's sign-in page checks for
// window.chrome.runtime to confirm it is running in a genuine Chrome context.
// Electron does not expose a full window.chrome object, which causes Google to
// flag the session as an "embedded insecure browser" and block sign-in.
// Injecting a minimal stub here (before any page JS runs) satisfies the check.
{
  type ChromeRuntime = {
    id: undefined;
    connect: () => { disconnect: () => void; onMessage: { addListener: () => void; removeListener: () => void }; postMessage: () => void };
    sendMessage: () => void;
    getURL: (p: string) => string;
    reload: () => void;
    onMessage: { addListener: () => void; removeListener: () => void };
    onConnect: { addListener: () => void; removeListener: () => void };
  };
  type ChromeStub = { runtime?: ChromeRuntime };
  const w = window as Window & { chrome?: ChromeStub };
  if (!w.chrome) {
    Object.defineProperty(window, 'chrome', { value: {}, writable: true, configurable: true });
  }
  const chrome = w.chrome as ChromeStub;
  if (!chrome.runtime) {
    Object.defineProperty(chrome, 'runtime', {
      value: {
        id: undefined,
        connect: () => ({ disconnect: () => {}, onMessage: { addListener: () => {}, removeListener: () => {} }, postMessage: () => {} }),
        sendMessage: () => {},
        getURL: (p: string) => p,
        reload: () => {},
        onMessage: { addListener: () => {}, removeListener: () => {} },
        onConnect: { addListener: () => {}, removeListener: () => {} },
      } satisfies ChromeRuntime,
      writable: true,
      configurable: true,
    });
  }
}

Object.defineProperty(document, 'visibilityState', {
  get: () => 'visible',
  configurable: true,
});

Object.defineProperty(document, 'hidden', {
  get: () => false,
  configurable: true,
});

Object.defineProperty(document, 'hasFocus', {
  value: () => true,
  configurable: true,
  writable: true,
});

// Swallow visibilitychange so Gemini never receives a "hidden" transition
document.addEventListener(
  'visibilitychange',
  (e) => e.stopImmediatePropagation(),
  true,
);
