// src/main/telegram/messaging.ts — proactive and task result message delivery.
//
// Formats and sends flow/proactive outputs plus task success/error replies.
// Stateless by design: the runtime passes a messaging context (bot accessor,
// strings, reply mode, export registry) instead of being imported here.

import { InputFile } from 'grammy';
import type { TelegramReplyMode, TelegramReplyTarget } from '../../shared/types';
import { getLangCache, t } from '../i18n';
import { getErrorMessage } from './errors';
import {
  escapeTelegramHtml,
  extractResponseSection,
  formatResponseForTelegramHtml,
  truncateText,
} from './formatter';
import { buildExportCallbackData, type ExportTokenRegistry } from './exporter';
import {
  safeSendMessage,
  sendDirectExport,
  type TelegramSendContext,
} from './exportHandlers';

const TELEGRAM_MSG_LIMIT = 4096;
const TELEGRAM_RESULT_MAX = 2600;

/** Send context extended with the state needed for task result replies. */
export interface TelegramMessagingContext extends TelegramSendContext {
  isPollerActive: () => boolean;
  getDefaultReplyMode: () => TelegramReplyMode;
  registry: ExportTokenRegistry;
}

export interface TelegramTaskSuccessPayload {
  providerLabel: string;
  savedFileName: string;
  response: string;
  prompt: string;
  title: string;
  elapsedSeconds: string;
}

export async function sendProactive(
  mctx: TelegramMessagingContext,
  chatId: number,
  text: string,
): Promise<void> {
  const bot = mctx.getBot();
  if (!bot || !mctx.isPollerActive()) {
    throw new Error('Telegram bot is not running');
  }
  try {
    const s = mctx.getStrings();
    const responseSection = extractResponseSection(text, s);
    const responseText = truncateText(responseSection.trim(), TELEGRAM_RESULT_MAX);
    const body = formatResponseForTelegramHtml(responseText);
    const fallbackBody = `<i>${escapeTelegramHtml(t(s, 'telegram.msg.emptyResponse'))}</i>`;
    const message = body || fallbackBody;

    if (message.length > TELEGRAM_MSG_LIMIT) {
      const buffer = Buffer.from(responseSection || text, 'utf8');
      await bot.api.sendDocument(chatId, new InputFile(buffer, 'output.md'), {
        caption: t(getLangCache(), 'telegram.flowOutputTooLong', {}),
      });
    } else {
      await bot.api.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    }
  } catch (err: unknown) {
    mctx.onLog(`[telegram] sendProactive failed for chat ${chatId}: ${String(err)}`);
    throw err;
  }
}

export async function sendProactiveFile(
  mctx: TelegramMessagingContext,
  chatId: number,
  filePath: string,
  sendAs: 'photo' | 'document',
  caption?: string,
): Promise<void> {
  const bot = mctx.getBot();
  if (!bot || !mctx.isPollerActive()) {
    throw new Error('Telegram bot is not running');
  }
  const captionOpts = caption ? { caption } : {};
  try {
    if (sendAs === 'photo') {
      await bot.api.sendPhoto(chatId, new InputFile(filePath), captionOpts);
    } else {
      await bot.api.sendDocument(chatId, new InputFile(filePath), captionOpts);
    }
  } catch (err: unknown) {
    mctx.onLog(`[telegram] sendProactiveFile failed for chat ${chatId}: ${String(err)}`);
    throw err;
  }
}

export async function sendTaskSuccess(
  mctx: TelegramMessagingContext,
  target: TelegramReplyTarget,
  payload: TelegramTaskSuccessPayload,
): Promise<void> {
  if (!mctx.getBot() || !mctx.isPollerActive()) return;
  const s = mctx.getStrings();
  const responseSection = extractResponseSection(payload.response, s);
  const responseText = truncateText(responseSection.trim(), TELEGRAM_RESULT_MAX);
  const body = formatResponseForTelegramHtml(responseText);
  const defaultReplyMode = mctx.getDefaultReplyMode();
  const titleLine = escapeTelegramHtml(
    t(s, 'telegram.msg.completed', {
      command: target.command,
      provider: payload.providerLabel,
      elapsed: payload.elapsedSeconds,
    }),
  );
  const savedLine = escapeTelegramHtml(
    t(s, 'telegram.msg.saved', { file: payload.savedFileName }),
  );
  if (defaultReplyMode === 'markdown') {
    const exportToken = mctx.registry.issue({
      command: target.command,
      chatId: target.chatId,
      userId: target.userId,
      providerLabel: payload.providerLabel,
      savedFileName: payload.savedFileName,
      prompt: payload.prompt,
      response: payload.response,
      title: payload.title,
    });
    const message = [
      titleLine,
      savedLine,
      '',
      body || `<i>${escapeTelegramHtml(t(s, 'telegram.msg.emptyResponse'))}</i>`,
    ].join('\n');
    const keyboard = {
      inline_keyboard: [
        [
          { text: t(s, 'telegram.msg.downloadPng'), callback_data: buildExportCallbackData(exportToken, 'png') },
          { text: t(s, 'telegram.msg.downloadWebp'), callback_data: buildExportCallbackData(exportToken, 'webp') },
        ],
        [
          { text: t(s, 'telegram.msg.downloadPdf'), callback_data: buildExportCallbackData(exportToken, 'pdf') },
        ],
      ],
    };
    await safeSendMessage(mctx, target.chatId, message, target.requestMessageId, keyboard);
    await deleteQueuedMessage(mctx, target);
    return;
  }

  await sendDirectExport(mctx, {
    command: target.command,
    chatId: target.chatId,
    userId: target.userId,
    providerLabel: payload.providerLabel,
    savedFileName: payload.savedFileName,
    prompt: payload.prompt,
    response: payload.response,
    title: payload.title,
    format: defaultReplyMode,
    replyToMessageId: target.requestMessageId,
  });
  await deleteQueuedMessage(mctx, target);
}

export async function sendTaskError(
  mctx: TelegramMessagingContext,
  target: TelegramReplyTarget,
  payload: { providerLabel: string; message: string },
): Promise<void> {
  if (!mctx.getBot() || !mctx.isPollerActive()) return;
  const s = mctx.getStrings();
  const plainText = truncateText(
    t(s, 'telegram.msg.failed', {
      command: target.command,
      provider: payload.providerLabel,
    })+ '\n' + (payload.message || t(s, 'telegram.msg.unknownError')),
    TELEGRAM_MSG_LIMIT - 32,
  );
  const text = escapeTelegramHtml(plainText);
  await safeSendMessage(mctx, target.chatId, text, target.requestMessageId);
  await deleteQueuedMessage(mctx, target);
}

async function deleteQueuedMessage(
  mctx: TelegramMessagingContext,
  target: TelegramReplyTarget,
): Promise<void> {
  const bot = mctx.getBot();
  if (!bot || !target.queuedMessageId) return;
  try {
    await bot.api.deleteMessage(target.chatId, target.queuedMessageId);
  } catch (err: unknown) {
    mctx.onLog(`[telegram] failed to delete queued message: ${getErrorMessage(err)}`);
  }
}
