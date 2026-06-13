// action and single-fetch skills.
//
// shell, browser, llm, clipboard, comment, utility and loop. These either perform
// a side effect or fetch a single resource; stateless feed ingestion lives in feeds.ts.

import { clipboard } from 'electron';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { load } from 'cheerio';
import type { CaptureFormat, MarkdownCapturePayload } from '../../../shared/types';
import { getProviderLabel, preparePromptForProvider, runAutomation } from '../../providers';
import { fetchAndParse } from '../../urlParser';
import { sendLog } from '../../helpers';
import type { FlowExecutorDeps } from '../types';
import { inferTelegramSendAs, isCaptureFormat } from '../interpolation';

const execAsync = promisify(exec);

// Trust boundary: command content is user-defined in the flow editor.
// Context variables interpolated into the command are from prior step outputs.
// No additional escaping is applied — the shell skill is inherently powerful by design.
export async function execShell(config: Record<string, string>, timeoutMs: number): Promise<string> {
  const command = config.command ?? '';
  if (!command) return '';
  let shell: string | undefined;
  if (process.platform === 'win32') {
    // Support new unified 'shell' field and legacy 'windowsShell'.
    const selected = (config.shell ?? config.windowsShell ?? 'cmd').toLowerCase();
    shell = selected === 'powershell' ? 'powershell.exe' : 'cmd.exe';
  } else {
    // Support new unified 'shell' field and legacy 'unixShell'.
    const selected = config.shell ?? config.unixShell;
    if (selected && selected !== 'auto') {
      shell = selected;
    } else {
      shell = process.env.SHELL ?? (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
    }
  }
  const { stdout, stderr } = await execAsync(command, { timeout: timeoutMs, shell });
  return (stdout || stderr).trim();
}

// Fetches the entire page HTML, strips script/style tags, and returns the body's text content (trimmed/collapsed).
async function fetchEntirePageText(url: string): Promise<string> {
  const { cleanedText: html } = await fetchAndParse(url, { rawHtml: true });
  const $ = load(html);
  $('script, style, noscript, iframe').remove();
  const rawText = $('body').text() || $.text() || '';
  return rawText
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function execBrowser(config: Record<string, string>): Promise<string> {
  const url = config.url ?? '';
  if (!url) return '';

  const urlPreview = url.length > 120 ? `${url.slice(0, 120)}…` : url;
  sendLog(`🌐 [AgentFlow] Browser step URL: ${urlPreview}`);

  // Detect JSON array or newline/comma-separated URL list
  let urlArray: string[] | null = null;
  try {
    const parsed: unknown = JSON.parse(url);
    if (Array.isArray(parsed) && parsed.every((u): u is string => typeof u === 'string')) {
      urlArray = parsed.filter((u) => /^https?:\/\//i.test(u.trim()));
    }
  } catch {
    const candidates = url.split(/[\n\r,]+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s));
    if (candidates.length > 1) urlArray = candidates;
  }

  if (urlArray && urlArray.length > 0) {
    sendLog(`🌐 [AgentFlow] Batch URL input: ${urlArray.length} URLs detected`);
    const parts: string[] = [];
    for (let i = 0; i < urlArray.length; i++) {
      const batchUrl = urlArray[i];
      sendLog(`🌐 [${i + 1}/${urlArray.length}] Fetching: ${batchUrl}`);
      try {
        const text = await fetchEntirePageText(batchUrl);
        parts.push(text);
        sendLog(`✅ [${i + 1}/${urlArray.length}] OK — ${text.length} chars`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendLog(`❌ [${i + 1}/${urlArray.length}] Failed: ${msg}`);
      }
    }
    if (parts.length === 0) return '';
    sendLog(`🌐 [AgentFlow] Batch complete: ${parts.length}/${urlArray.length} succeeded`);
    return parts.join('\n\n---\n\n');
  }

  return await fetchEntirePageText(url);
}

export async function execLlm(
  config: Record<string, string>,
  deps: FlowExecutorDeps,
  timeoutMs: number,
): Promise<string> {
  const prompt = config.prompt ?? '';
  if (!prompt) return '';
  const workerWin = deps.getWorkerWin();
  if (!workerWin) throw new Error('Worker window not available');
  const providerUrl = config.provider || deps.getTargetUrl();
  const preparedPrompt = preparePromptForProvider(prompt, providerUrl);
  if (preparedPrompt.removedBlankLines) {
    sendLog(`✂️ [AgentFlow] Removed blank lines for ${getProviderLabel(providerUrl)} input`);
  }
  if (preparedPrompt.truncated) {
    sendLog(`✂️ [AgentFlow] Truncated ${getProviderLabel(providerUrl)} input to ${preparedPrompt.maxChars} chars`);
  }

  const { response } = await runAutomation(workerWin, preparedPrompt.prompt, timeoutMs, providerUrl);
  if (config.saveToHistory === 'true' && deps.onSaveHistory) {
    await deps.onSaveHistory({
      prompt: preparedPrompt.prompt,
      response,
      providerLabel: getProviderLabel(providerUrl),
    });
  }
  const exportFormat = config.exportFormat;
  if (!isCaptureFormat(exportFormat)) {
    return response;
  }
  if (!deps.captureMarkdown) {
    throw new Error('LLM export requires captureMarkdown dependency');
  }
  const title = config.exportTitle || 'AgentFlow LLM Export';
  const background = config.background || 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #334155 100%)';
  const exportOptions = {
    fileName: (config.exportFileName ?? '').trim(),
    showProvider: config.exportShowProvider !== 'false',
    showTimestamp: config.exportShowTimestamp !== 'false',
  };
  const payload: MarkdownCapturePayload = {
    title,
    prompt: preparedPrompt.prompt,
    content: response,
    summary: response.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_~\-`\[\]()]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220),
    provider: getProviderLabel(providerUrl),
    timestamp: new Date().toISOString(),
  };
  const filePath = await deps.captureMarkdown(payload, exportFormat, background, exportOptions);
  sendLog(`🖼️ [AgentFlow] LLM export generated: ${filePath}`);
  return filePath;
}

export function execClipboard(config: Record<string, string>): string {
  const action = config.action ?? 'read';
  if (action === 'write') {
    clipboard.writeText(config.text ?? '');
    return '';
  }
  return clipboard.readText();
}

export function execComment(config: Record<string, string>): string {
  return (config.note ?? '').trim();
}

export async function execUtility(config: Record<string, string>, deps: FlowExecutorDeps): Promise<string> {
  const action = config.action ?? 'delay';
  if (action === 'delay') {
    const ms = Math.min(Number(config.delayMs) || 1_000, 60_000);
    await new Promise((resolve) => setTimeout(resolve, ms));
    return `delayed ${ms}ms`;
  }
  if (action === 'notify') {
    const title = config.title ?? 'AgentFlow';
    const body = config.body ?? '';
    sendLog(`📢 [AgentFlow] ${title}: ${body}`);
    return body;
  }
  if (action === 'export') {
    if (!deps.captureMarkdown) throw new Error('Export action requires captureMarkdown dependency');
    const content = config.content ?? '';
    const format = (['png', 'webp', 'pdf'] as const).includes(config.format as CaptureFormat)
      ? (config.format as CaptureFormat)
      : 'png';
    const title = config.title || 'AgentFlow Export';
    const background = config.background || 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #334155 100%)';
    const payload: MarkdownCapturePayload = {
      title,
      prompt: '',
      content,
      summary: content.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_~\-`\[\]()]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220),
      provider: 'AgentFlow',
      timestamp: new Date().toISOString(),
    };
    const filePath = await deps.captureMarkdown(payload, format, background);
    sendLog(`🖼️ [AgentFlow] Snapshot exported: ${filePath}`);
    return filePath;
  }
  return '';
}

export async function execBot(
  config: Record<string, string>,
  deps: FlowExecutorDeps,
): Promise<string> {
  const message = config.message ?? '';
  const magicFilePath = (config.__magicUploadPath ?? '').trim();
  const magicCaption = (config.__magicUploadCaption ?? '').trim();

  // Resolve target chat IDs — chatIds (new multi-select) takes priority over chatId (legacy).
  // Telegram group chats use negative IDs; accept any non-zero integer.
  const chatIdsRaw = (config.chatIds ?? config.chatId ?? '').trim();
  const explicitIds = chatIdsRaw
    ? chatIdsRaw.split(',').map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => Number.isFinite(n) && n !== 0)
    : [];

  // Detect whether chatIds was configured as a template (e.g. {{bot.triggerChatId}}) but
  // resolved to empty because the flow was not triggered via Telegram.
  // In that case, skip sending rather than falling back to all paired users.
  const originalChatIdsTemplate = (config.__originalChatIdsTemplate ?? '').trim();
  const chatIdsWereConfiguredButEmpty = originalChatIdsTemplate !== '' && explicitIds.length === 0;

  if (chatIdsWereConfiguredButEmpty) {
    sendLog('⚠️ [Bot] chatIds resolved to empty (no trigger context) — skipping send');
    return message || magicFilePath;
  }

  // File upload mode (magic variable only)
  if (magicFilePath) {
    if (!deps.sendTelegramFile) throw new Error('sendTelegramFile not configured in FlowExecutorDeps');
    const sendAs = inferTelegramSendAs(magicFilePath);
    const caption = magicCaption || undefined;
    if (explicitIds.length > 0) {
      for (const chatId of explicitIds) {
        await deps.sendTelegramFile(chatId, magicFilePath, sendAs, caption);
        sendLog(`📤 [Bot] Sent ${sendAs} to chat ${chatId}: ${magicFilePath}`);
      }
    } else {
      const pairedUsers = deps.getPairedUsers?.() ?? [];
      if (pairedUsers.length === 0) throw new Error('No paired Telegram users found');
      for (const user of pairedUsers) {
        await deps.sendTelegramFile(user.userId, magicFilePath, sendAs, caption);
        sendLog(`📤 [Bot] Sent ${sendAs} to user ${user.userId}: ${magicFilePath}`);
      }
    }
    return magicFilePath;
  }

  // Text-only mode
  if (!message) return '';
  if (!deps.sendTelegramMessage) throw new Error('Telegram bot is not configured in FlowExecutorDeps');

  if (explicitIds.length > 0) {
    for (const chatId of explicitIds) {
      await deps.sendTelegramMessage(chatId, message);
      sendLog(`📤 [Bot] Sent to chat ${chatId}`);
    }
  } else {
    const pairedUsers = deps.getPairedUsers?.() ?? [];
    if (pairedUsers.length === 0) throw new Error('No paired Telegram users found');
    for (const user of pairedUsers) {
      await deps.sendTelegramMessage(user.userId, message);
      sendLog(`📤 [Bot] Sent to user ${user.userId} (${user.username ?? user.firstName ?? ''})`);
    }
  }
  return message;
}

export function execLoop(config: Record<string, string>): string {
  return config.input ?? '';
}
