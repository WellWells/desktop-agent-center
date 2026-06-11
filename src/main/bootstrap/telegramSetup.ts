// src/main/bootstrap/telegramSetup.ts — Telegram runtime initialization wiring
//
// Builds the TelegramRuntime with all config/queue/flow callbacks. The
// FlowManager is created later in app.whenReady(), so it is accessed through
// a getter to avoid a value-level circular dependency.

import { IPC } from '../../shared/types';
import { config, saveConfig } from '../config';
import { sendLog, sendToRenderer, createTaskId } from '../helpers';
import { getLangCache } from '../i18n';
import { TelegramRuntime, normalizePairingState } from '../telegram';
import {
  isTelegramAdminUser,
  buildTelegramStatusText,
  getTelegramRuntimeSnapshot,
  setTelegramRuntimeSnapshot,
  exportTelegramResultDocument,
} from '../telegramBridge';
import type { QueueManager } from '../queueManager';
import type { FlowManager } from '../flow';

/** Creates the TelegramRuntime wired to the shared queue and FlowManager. */
export function createTelegramRuntime(deps: {
  queue: QueueManager;
  getFlowManager: () => FlowManager | null;
}): TelegramRuntime {
  const { queue, getFlowManager } = deps;

  return new TelegramRuntime({
    getEnabled: () => config.telegram.enabled,
    getToken: () => config.telegram.botToken,
    getAllowGroupCommands: () => config.telegram.allowGroupCommands,
    getDefaultReplyMode: () => config.telegram.defaultReplyMode,
    getPairing: () => config.telegram.pairing,
    savePairing: (next) => {
      config.telegram.pairing = normalizePairingState(next);
      saveConfig({ telegram: config.telegram });
      // Notify renderer to refresh Telegram pairing/admin snapshot immediately.
      sendToRenderer(IPC.TELEGRAM_RUNTIME, getTelegramRuntimeSnapshot());
    },
    isAdminUser: (userId) => isTelegramAdminUser(userId),
    onTaskRequest: async (request) => {
      const id = createTaskId();
      queue.enqueue({
        id,
        prompt: request.prompt,
        targetUrl: request.targetUrl,
        source: 'telegram',
        replyTarget: request.replyTarget,
      });
      sendLog(`[${id}] Telegram /${request.command} queued`);
      return { taskId: id };
    },
    onStatusRequest: () => buildTelegramStatusText(queue),
    onUpdateDefaultReplyMode: (mode) => {
      if (mode !== 'markdown' && mode !== 'png' && mode !== 'webp' && mode !== 'pdf') return false;
      config.telegram.defaultReplyMode = mode;
      saveConfig({ telegram: config.telegram });
      return true;
    },
    onExportRequest: (request) => exportTelegramResultDocument(request),
    onLog: (message) => sendLog(message),
    onRuntime: (snapshot) => {
      setTelegramRuntimeSnapshot(snapshot);
      sendToRenderer(IPC.TELEGRAM_RUNTIME, snapshot);
    },
    getStrings: () => getLangCache(),
    getFlowCommands: () => getFlowManager()?.getBotCommands() ?? [],
    onFlowCommand: async (flowId, inputVariable, input, userId, chatId) => {
      const extraContext: Record<string, string> = {
        [inputVariable]: input,
        'bot.triggerChatId': String(chatId),
        'bot.triggerUserId': String(userId),
      };
      const flowManager = getFlowManager();
      if (!flowManager) {
        return {
          taskId: createTaskId(),
          result: Promise.resolve({
            flowId,
            success: false,
            outputs: {},
            error: 'FlowManager not available',
            completedSteps: 0,
            totalSteps: 0,
            completedAt: new Date().toISOString(),
          }),
        };
      }
      const execution = flowManager.queueExecutionWithId(flowId, extraContext, 'bot');
      sendLog(`[AgentFlow] Bot command triggered flow ${flowId} for user ${userId} with input: ${input}`);
      return execution;
    },
  });
}
