// src/main/taskProcessor.ts — processes a single queued prompt task end-to-end.
//
// Drives provider automation, saves the markdown output, notifies the user and
// (for Telegram-sourced tasks) replies via the bot. Clipboard backup/restore and
// Perplexity site-data cleanup are kept in one linear flow so their ordering is
// preserved exactly.

import * as path from 'node:path';
import {
  runAutomation,
  getProviderLabel,
  preparePromptForProvider,
  isLoginRequiredError,
  getProviderLoginUrl,
} from './providers';
import { PERPLEXITY_CLOUDFLARE_ERROR_NAME } from './providers/perplexity';
import { saveOutput } from './output';
import { config } from './config';
import { IPC } from '../shared/types';
import type { Task } from '../shared/types';
import {
  sendLog,
  sendToRenderer,
  sendWebNotification,
  clearPerplexitySiteDataIfNeeded,
} from './helpers';
import { backupClipboard, restoreClipboard } from './clipboard';
import { listOutputFiles, getOutputDir } from './files';
import {
  loadLanguageData,
  getLangCache,
  buildTaskInstruction,
  buildCombinedPromptFromPrefs,
  localizeUserFacingError,
  stripSystemInstruction,
  t,
} from './i18n';
import {
  createWorkerWindow,
  getWorkerWin,
  showLoginWindowIfNeeded,
} from './windows';
import type { TelegramRuntime } from './telegram';

export interface TaskProcessorDeps {
  telegramRuntime: TelegramRuntime;
}

export async function processTask(task: Task, deps: TaskProcessorDeps): Promise<void> {
  const { telegramRuntime } = deps;
  const { id, prompt } = task;
  const promptForOutput = stripSystemInstruction(prompt);
  const targetUrl = task.targetUrl ?? config.targetUrl;
  const preview = prompt.length > 100 ? `${prompt.slice(0, 100)}…` : prompt;
  const providerLabel = getProviderLabel(targetUrl);

  sendLog(`[${id}] 📤 "${preview}"`);

  // Backup clipboard before provider automation (copy-button clicks write to system clipboard)
  const clipboardSnapshot = backupClipboard();
  let preservePerplexitySiteData = false;

  try {
    const workerWin = getWorkerWin();
    if (!workerWin || workerWin.isDestroyed()) {
      sendLog(`[${id}] 🔄 Relaunching worker window...`);
      createWorkerWindow(config.targetUrl);
      await new Promise((r) => setTimeout(r, 3_000));
    }

    const activeWorker = getWorkerWin();
    if (!activeWorker || activeWorker.isDestroyed()) {
      throw new Error('Worker window unavailable after relaunch attempt');
    }

    const t0 = Date.now();
    sendLog(`[${id}] ⏳ Sending to ${providerLabel}...`);

    const dynamicInstruction = buildCombinedPromptFromPrefs(config.promptPreferences, getLangCache());
    const instruction = buildTaskInstruction(dynamicInstruction, config.syncSystemLanguageToModel, config.locale);
    const fullPrompt = instruction ? `${instruction}\n\n${prompt}` : prompt;
    const preparedPrompt = preparePromptForProvider(fullPrompt, targetUrl);
    if (preparedPrompt.removedBlankLines) {
      sendLog(`[${id}] ✂️ Removed blank lines before sending to ${providerLabel}`);
    }
    if (preparedPrompt.truncated) {
      sendLog(`[${id}] ✂️ Prompt truncated to ${preparedPrompt.maxChars} chars for ${providerLabel}`);
    }

    const { response, title } = await runAutomation(
      activeWorker,
      preparedPrompt.prompt,
      config.responseTimeout,
      targetUrl,
    );

    const elapsed = ((Date.now() - t0) / 1_000).toFixed(1);
    sendLog(`[${id}] ✅ Response received in ${elapsed}s`);

    const outputDir = await getOutputDir();
    const langData = await loadLanguageData(config.locale);
    const providerHeaderLabel = langData?.['md.provider'] ?? 'Provider';
    const promptLabel = langData?.['md.prompt'] ?? 'Prompt';
    const responseLabel = langData?.['md.response'] ?? 'Response';
    const timestampLabel = langData?.['md.timestamp'] ?? 'Time';

    const geminiTitle = stripSystemInstruction(title?.trim() ?? '').replace(/\s+/g, ' ').trim();
    const fallbackTitle = promptForOutput.trim().replace(/\s+/g, ' ').slice(0, 70);
    const finalTitle = geminiTitle || fallbackTitle || 'Untitled';

    const filePath = await saveOutput({
      prompt: promptForOutput,
      response,
      outputDir,
      title: finalTitle,
      provider: providerLabel,
      providerLabel: providerHeaderLabel,
      promptLabel,
      responseLabel,
      timestampLabel,
    });
    const savedFileName = path.basename(filePath);
    sendLog(`[${id}] 💾 Saved: ${savedFileName}`);

    sendToRenderer(IPC.FILE_LIST, await listOutputFiles());

    const notifyTitle = langData?.['notify.completed.title'] ?? 'Desktop Agent Center';
    const notifyBodyTemplate = langData?.['notify.completed.body'] ?? '"{{prompt}}" saved as {{file}}';
    const compactPrompt = promptForOutput.replace(/\s+/g, ' ').trim().slice(0, 36);
    const displayPrompt = compactPrompt.length < promptForOutput.replace(/\s+/g, ' ').trim().length
      ? `${compactPrompt}…`
      : compactPrompt;
    sendWebNotification(
      notifyTitle,
      notifyBodyTemplate.replace('{{prompt}}', displayPrompt).replace('{{file}}', savedFileName),
    );

    if (task.replyTarget) {
      await telegramRuntime.sendTaskSuccess(task.replyTarget, {
        providerLabel,
        savedFileName,
        response,
        prompt: promptForOutput,
        title: finalTitle,
        elapsedSeconds: elapsed,
      });
    }
  } catch (err: unknown) {
    const strings = getLangCache();
    if (isLoginRequiredError(targetUrl, err)) {
      const loginUrl = getProviderLoginUrl(targetUrl);
      if (loginUrl) await showLoginWindowIfNeeded(providerLabel, loginUrl, config.targetUrl);
      sendLog(`[${id}] ⚠️ Login required before sending prompt`);
      if (task.replyTarget) {
        await telegramRuntime.sendTaskError(task.replyTarget, {
          providerLabel,
          message: t(strings, 'telegram.error.loginRequired'),
        });
      }
      return;
    }
    const error = err as Error;
    if (error.name === PERPLEXITY_CLOUDFLARE_ERROR_NAME) {
      preservePerplexitySiteData = true;
    }
    const rawMessage = error.message;
    sendLog(`[${id}] ❌ ${rawMessage}`);
    if (task.replyTarget) {
      await telegramRuntime.sendTaskError(task.replyTarget, {
        providerLabel,
        message: localizeUserFacingError(rawMessage, strings),
      });
    }
  } finally {
    // Restore clipboard to its original state before provider automation
    restoreClipboard(clipboardSnapshot);
    if (!preservePerplexitySiteData) {
      await clearPerplexitySiteDataIfNeeded(targetUrl);
    }
  }
}
