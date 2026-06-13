// shared types for the AgentFlow execution engine.

import type { BrowserWindow } from 'electron';
import type { CaptureFormat, FlowExecutionLog, MarkdownCapturePayload } from '../../shared/types';

export type LogCallback = (log: FlowExecutionLog) => void;

export interface SaveHistoryInfo {
  prompt: string;
  response: string;
  providerLabel: string;
}

export interface FlowExecutorDeps {
  getWorkerWin: () => BrowserWindow | null;
  getTargetUrl: () => string;
  getResponseTimeoutMs?: () => number;
  onSaveHistory?: (info: SaveHistoryInfo) => Promise<void>;
  sendTelegramMessage?: (chatId: number, text: string) => Promise<void>;
  getPairedUsers?: () => Array<{ userId: number; username?: string; firstName?: string }>;
  /** Renders markdown content as a snapshot and returns the saved file path. */
  captureMarkdown?: (
    payload: MarkdownCapturePayload,
    format: CaptureFormat,
    background: string,
    options?: {
      fileName?: string;
      showProvider?: boolean;
      showTimestamp?: boolean;
      showPrompt?: boolean;
      showContent?: boolean;
    },
  ) => Promise<string>;
  /** Sends a file to a Telegram chat as photo or document. */
  sendTelegramFile?: (
    chatId: number,
    filePath: string,
    sendAs: 'photo' | 'document',
    caption?: string,
  ) => Promise<void>;
}
