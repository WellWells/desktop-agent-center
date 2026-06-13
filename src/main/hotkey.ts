// Global hotkey registration via Electron globalShortcut
import { globalShortcut } from 'electron';

let _currentAccelerator: string | null = null;
let _paused = false;

export function setHotkeyPaused(paused: boolean): void {
  _paused = paused;
}

/**
 * Register a global hotkey with built-in debounce.
 */
export function registerHotkey(
  accelerator: string,
  handler: () => void,
  debounceMs: number = 1000,
): boolean {
  // Unregister old binding first
  if (_currentAccelerator) {
    try {
      globalShortcut.unregister(_currentAccelerator);
    } catch {
      // ignore
    }
  }

  let lastTrigger = 0;

  const ok = globalShortcut.register(accelerator, () => {
    if (_paused) return;
    const now = Date.now();
    if (now - lastTrigger < debounceMs) return;
    lastTrigger = now;
    handler();
  });

  if (ok) {
    _currentAccelerator = accelerator;
  }

  return ok;
}

export function unregisterAll(): void {
  globalShortcut.unregisterAll();
  _currentAccelerator = null;
}
