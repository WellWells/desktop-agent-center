// src/main/clipboard.ts — Clipboard capture via simulated OS copy
import { clipboard, systemPreferences } from 'electron';
import { execFile } from 'node:child_process';

// ── macOS Accessibility permission helpers ────────────────────────────────────

/**
 * Returns true if the app has been granted Accessibility permission on macOS.
 * Always returns true on non-macOS platforms.
 */
export function checkMacosAccessibility(): boolean {
  if (process.platform !== 'darwin') return true;
  return systemPreferences.isTrustedAccessibilityClient(false);
}

/**
 * Triggers the macOS system prompt asking the user to grant Accessibility access.
 * No-op on non-macOS platforms.
 */
export function promptMacosAccessibility(): void {
  if (process.platform !== 'darwin') return;
  systemPreferences.isTrustedAccessibilityClient(true);
}

// ── Clipboard Backup & Restore ────────────────────────────────────────────────

interface ClipboardSnapshot {
  format: 'text' | 'image' | 'html' | 'empty';
  text?: string;
  html?: string;
  image?: Electron.NativeImage;
  rtf?: string;
}

/**
 * Snapshot the current system clipboard contents (text, HTML, RTF, image).
 * Returns a `ClipboardSnapshot` that can be passed to `restoreClipboard()`.
 */
export function backupClipboard(): ClipboardSnapshot {
  const formats = clipboard.availableFormats();

  const hasImage = formats.some((f) => f.startsWith('image/'));
  const hasHtml = formats.includes('text/html');
  const hasText = formats.includes('text/plain');
  const hasRtf = formats.includes('text/rtf');

  if (hasImage) {
    return {
      format: 'image',
      image: clipboard.readImage(),
      text: hasText ? clipboard.readText() : undefined,
      html: hasHtml ? clipboard.readHTML() : undefined,
      rtf: hasRtf ? clipboard.readRTF() : undefined,
    };
  }

  if (hasHtml || hasText) {
    return {
      format: hasHtml ? 'html' : 'text',
      text: hasText ? clipboard.readText() : undefined,
      html: hasHtml ? clipboard.readHTML() : undefined,
      rtf: hasRtf ? clipboard.readRTF() : undefined,
    };
  }

  return { format: 'empty' };
}

/**
 * Restore the system clipboard to a previously captured snapshot.
 */
export function restoreClipboard(snapshot: ClipboardSnapshot): void {
  if (snapshot.format === 'empty') {
    clipboard.clear();
    return;
  }

  if (snapshot.format === 'image' && snapshot.image && !snapshot.image.isEmpty()) {
    clipboard.write({
      image: snapshot.image,
      text: snapshot.text ?? '',
      html: snapshot.html ?? '',
      rtf: snapshot.rtf ?? '',
    });
    return;
  }

  // text / html
  clipboard.write({
    text: snapshot.text ?? '',
    html: snapshot.html ?? '',
    rtf: snapshot.rtf ?? '',
  });
}

// ── Selected-text capture via OS-level simulated copy ────────────────────────

// Poll clipboard after a simulated Cmd/Ctrl+C.
// Checks immediately (Cmd+C may already be done when osascript exits),
// then every 20ms for up to 3s.
function pollClipboard(snapshot: ClipboardSnapshot, resolve: (v: string) => void): void {
  const check = () => clipboard.readText().trim();

  // Immediate check — osascript blocks until keystroke is delivered, so the
  // target app may have already written to clipboard by the time we get here.
  const immediate = check();
  if (immediate) {
    restoreClipboard(snapshot);
    resolve(immediate);
    return;
  }

  let attempts = 0;
  const MAX_ATTEMPTS = 150; // 150 × 20ms = 3 000ms timeout
  const poll = setInterval(() => {
    attempts++;
    if (attempts > MAX_ATTEMPTS) {
      clearInterval(poll);
      restoreClipboard(snapshot);
      resolve('');
      return;
    }
    const text = check();
    if (text) {
      clearInterval(poll);
      restoreClipboard(snapshot);
      resolve(text);
    }
  }, 20);
}

export function captureSelectedText(): Promise<string> {
  return new Promise((resolve) => {
    // Backup & clear clipboard so polling can detect new clipboard writes.
    const snapshot = backupClipboard();
    clipboard.clear();

    switch (process.platform) {
      case 'darwin': {
        // Strategy:
        // 1. Try reading AXSelectedText from the focused UI element via Accessibility API.
        //    This is instantaneous and doesn't touch the clipboard.
        // 2. If that returns empty (e.g. browser page text, non-standard apps), fall back to
        //    simulating Cmd+C on the frontmost process.
        //
        // globalShortcut fires in the main process WITHOUT stealing focus from the source app,
        // so "first application process whose frontmost is true" is always the source app.
        const script = [
          'tell application "System Events"',
          '    set frontProc to first application process whose frontmost is true',
          '    try',
          '        set sel to value of attribute "AXSelectedText" of (value of attribute "AXFocusedUIElement" of frontProc)',
          '        if sel is not "" then return sel',
          '    end try',
          '    tell frontProc to keystroke "c" using {command down}',
          '    return ""',
          'end tell',
        ].join('\n');

        execFile('/usr/bin/osascript', ['-e', script], (err, stdout) => {
          if (err) {
            // osascript failed — likely Accessibility permission not granted.
            restoreClipboard(snapshot);
            resolve('');
            return;
          }
          const axText = stdout.trim();
          if (axText) {
            // AXSelectedText succeeded — use it directly, no clipboard poll needed.
            restoreClipboard(snapshot);
            resolve(axText);
            return;
          }
          // Script returned empty: Cmd+C was simulated, poll clipboard for the result.
          pollClipboard(snapshot, resolve);
        });
        break;
      }
      case 'linux':
        execFile('xdotool', ['key', 'ctrl+c'], () => pollClipboard(snapshot, resolve));
        break;
      default:
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command',
            'Add-Type -A System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^c")'],
          () => pollClipboard(snapshot, resolve),
        );
    }
  });
}
