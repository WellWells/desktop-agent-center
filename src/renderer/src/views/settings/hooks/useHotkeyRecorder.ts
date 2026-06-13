import { useCallback, useEffect, useState } from 'react';
import type React from 'react';
import { settingsApi } from '../../../api/electronApi';
import { useAppStore } from '../../../store/appStore';

// Computed once at module load; stable for the lifetime of the renderer process.
const IS_MAC = navigator.platform.toLowerCase().startsWith('mac');

/**
 * Extract a normalized key name from a keyboard event for use as an Electron accelerator key.
 * Uses e.code for letters/digits to avoid macOS Option-key character substitution
 * (e.g., Option+G fires e.key="©" but e.code="KeyG").
 */
function getKeyFromEvent(e: React.KeyboardEvent<HTMLInputElement>): string {
  if (e.code.startsWith('Key')) return e.code.slice(3);    // KeyG → G
  if (e.code.startsWith('Digit')) return e.code.slice(5);  // Digit1 → 1
  if (e.key === 'ArrowUp') return 'Up';
  if (e.key === 'ArrowDown') return 'Down';
  if (e.key === 'ArrowLeft') return 'Left';
  if (e.key === 'ArrowRight') return 'Right';
  if (e.key === 'Enter') return 'Return';
  if (e.key === ' ') return 'Space';
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

export function useHotkeyRecorder() {
  const setHotkey = useAppStore((s) => s.setHotkey);

  const [currentHotkey, setCurrentHotkey] = useState('');
  const [hotkeyInput, setHotkeyInput] = useState('');
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    void settingsApi.getHotkey().then((hk) => {
      setCurrentHotkey(hk);
      setHotkeyInput(hk);
    });
  }, []);

  // Sync recording state to main process: pause global hotkeys while recording.
  useEffect(() => {
    void settingsApi.setHotkeyPaused(recording);
  }, [recording]);

  const saveHotkey = useCallback(async (nextHotkey: string) => {
    if (!nextHotkey.trim() || nextHotkey === currentHotkey) return;
    await settingsApi.updateHotkey(nextHotkey);
    setCurrentHotkey(nextHotkey);
    setHotkeyInput(nextHotkey);
    setHotkey(nextHotkey);
  }, [currentHotkey, setHotkey]);

  const handleHotkeyKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!recording) return;
    e.preventDefault();
    if (e.key === 'Escape') {
      setRecording(false);
      (e.currentTarget as HTMLInputElement).blur();
      return;
    }
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push(IS_MAC ? 'Command' : 'Meta');

    const modifierKeys = ['Control', 'Alt', 'Shift', 'Meta', 'OS'];
    if (!modifierKeys.includes(e.key)) {
      const key = getKeyFromEvent(e);
      parts.push(key);
      if (parts.length > 1 || key.startsWith('F')) {
        const next = parts.join('+');
        setHotkeyInput(next);
        void saveHotkey(next);
        setRecording(false);
        (e.currentTarget as HTMLInputElement).blur();
      }
    } else {
      setHotkeyInput(parts.join('+'));
    }
  }, [recording, saveHotkey]);

  const handleClearHotkey = useCallback(async () => {
    const defaultHotkey = IS_MAC ? 'Command+G' : 'Alt+G';
    await settingsApi.updateHotkey(defaultHotkey);
    setCurrentHotkey(defaultHotkey);
    setHotkeyInput(defaultHotkey);
    setHotkey(defaultHotkey);
  }, [setHotkey]);

  /** Called externally (handleResetSettings) to force-apply the post-reset value. */
  const applyHotkeyReset = useCallback((hotkey: string) => {
    setCurrentHotkey(hotkey);
    setHotkeyInput(hotkey);
    setHotkey(hotkey);
  }, [setHotkey]);

  return {
    currentHotkey,
    hotkeyInput,
    recording,
    setRecording,
    setHotkeyInput,
    handleHotkeyKeyDown,
    handleClearHotkey,
    applyHotkeyReset,
  };
}

