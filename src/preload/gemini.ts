// src/preload/gemini.ts — Visibility & Focus spoof for Gemini worker window
// Runs BEFORE any Gemini page JS so it cannot be undone by the page.
// This forces the page to always believe it is visible and focused,
// defeating Chromium's background-tab throttling and Gemini's focus guards.
//
// NOTE: This preload runs with contextIsolation: false so it executes in the
// same JS world as the page — that is what makes Object.defineProperty work.

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
