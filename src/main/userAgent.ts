// src/main/userAgent.ts — Browser identity used for remote provider pages.

function getPlatformToken(): string {
  if (process.platform === 'darwin') {
    return 'Macintosh; Intel Mac OS X 10_15_7';
  }
  if (process.platform === 'linux') {
    return 'X11; Linux x86_64';
  }
  return 'Windows NT 10.0; Win64; x64';
}

export function buildCleanChromiumUserAgent(): string {
  const chromeVersion = process.versions.chrome;
  return `Mozilla/5.0 (${getPlatformToken()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
}

// Google's sign-in page applies Chrome-specific API checks (window.chrome.runtime,
// window.chrome.webstore, etc.) when the UA identifies as Chrome/Chromium.
// Electron does not expose these APIs, so Google flags it as an embedded/insecure
// browser. Using a Firefox UA bypasses these Chrome-only checks — Google accepts
// Firefox sign-in without requiring Chrome-specific APIs to be present.
function buildFirefoxUserAgent(): string {
  // Use a recent, plausible Firefox ESR version; platform token kept consistent.
  const ffPlatform = process.platform === 'darwin'
    ? 'Macintosh; Intel Mac OS X 10.15'
    : process.platform === 'linux'
      ? 'X11; Linux x86_64'
      : 'Windows NT 10.0; Win64; x64';
  return `Mozilla/5.0 (${ffPlatform}; rv:138.0) Gecko/20100101 Firefox/138.0`;
}

export const CLEAN_UA = buildCleanChromiumUserAgent();

// Firefox UA — use for Google services (Gemini) to avoid the Chrome embedded-browser check.
export const FIREFOX_UA = buildFirefoxUserAgent();
