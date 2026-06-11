// src/main/hotkeyBinding.ts — registers the global capture hotkey.
//
// On trigger: captures the selected text, resolves it (URL → analysis prompt when
// applicable) and enqueues a task. On macOS, guards against the missing
// Accessibility permission that would otherwise make keystroke simulation fail.

import { registerHotkey } from './hotkey';
import { config } from './config';
import { getProviderLabel } from './providers';
import { sendLog, sendWebNotification, createTaskId } from './helpers';
import {
  captureSelectedText,
  checkMacosAccessibility,
  promptMacosAccessibility,
} from './clipboard';
import { getLangCache } from './i18n';
import { resolveUrlPrompt } from './urlParser';
import type { QueueManager } from './queueManager';

export interface HotkeyDeps {
  queue: QueueManager;
}

let _accessibilityPrompted = false;

export function bindHotkey(deps: HotkeyDeps): void {
  const { queue } = deps;
  const ok = registerHotkey(config.hotkey, async () => {
    // macOS: Accessibility permission is required for keystroke simulation via osascript.
    // Without it, the simulated Cmd+C silently fails, leaving the clipboard empty.
    if (process.platform === 'darwin' && !checkMacosAccessibility()) {
      const langData = getLangCache();
      const errorMsg = langData['hotkey.error.accessibility'] ??
        'Accessibility permission required. Go to System Preferences → Privacy & Security → Accessibility and enable this app.';
      sendLog(`❌ ${errorMsg}`);
      sendWebNotification('Desktop Agent Center', errorMsg, 'warning');
      if (!_accessibilityPrompted) {
        _accessibilityPrompted = true;
        promptMacosAccessibility();
      }
      return;
    }

    const rawText = await captureSelectedText();
    if (!rawText) {
      sendLog('⚠️  Clipboard is empty — nothing to send');
      return;
    }

    const langData = getLangCache();
    const prompt = await resolveUrlPrompt(rawText, {
      langData,
      onLog: sendLog,
      onNotify: (title, body) => sendWebNotification(title, body, 'info'),
    });

    const id = createTaskId();
    queue.enqueue({
      id,
      prompt,
      targetUrl: config.targetUrl,
      source: 'hotkey',
    });
    sendLog(`[${id}] 🔥 Queued for ${getProviderLabel(config.targetUrl)} (queue size: ${queue.size + 1})`);

    const notifyTitle = langData['notify.queued.title'] ?? 'Desktop Agent Center';
    const notifyBodyTemplate = langData['notify.queued.body'] ?? 'Queued: "{{prompt}}"';
    const compactPrompt = prompt.replace(/\s+/g, ' ').trim().slice(0, 36);
    const displayPrompt = compactPrompt.length < prompt.replace(/\s+/g, ' ').trim().length
      ? `${compactPrompt}…`
      : compactPrompt;
    sendWebNotification(notifyTitle, notifyBodyTemplate.replace('{{prompt}}', displayPrompt), 'info');
  });

  if (ok) {
    sendLog(`⌨️  Hotkey registered: ${config.hotkey}`);
  } else {
    sendLog(`❌ Failed to register hotkey ${config.hotkey}`);
  }
}
