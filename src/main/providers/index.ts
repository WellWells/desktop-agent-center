// src/main/providers/index.ts — Provider dispatcher
// Add new AI providers here; runAutomation resolves the right one by URL.
import type { BrowserWindow } from 'electron';
import { runGeminiAutomation } from './gemini';
import { runPerplexityAutomation } from './perplexity';
import { CHATGPT_LOGIN_URL, isChatgptLoginRequiredError, runChatgptAutomation } from './chatgpt';
import { PROVIDER_URLS, PROVIDER_LABELS } from '../../shared/types';
import type { Provider } from '../../shared/types';

export type { Provider };

const PROVIDER_RUNNER: Record<
  Provider,
  (workerWin: BrowserWindow, prompt: string, timeoutMs: number, targetUrl: string) => Promise<{ response: string; title: string }>
> = {
  gemini: runGeminiAutomation,
  perplexity: runPerplexityAutomation,
  chatgpt: runChatgptAutomation,
};

export function detectProvider(url: string): Provider {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('perplexity.ai')) return 'perplexity';
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
  } catch {
    // fall through
  }
  return 'gemini';
}

export function getProviderLabel(url: string): string {
  return PROVIDER_LABELS[detectProvider(url)];
}

export async function runAutomation(
  workerWin: BrowserWindow,
  prompt: string,
  timeoutMs: number,
  targetUrl: string,
): Promise<{ response: string; title: string }> {
  const provider = detectProvider(targetUrl);
  return PROVIDER_RUNNER[provider](workerWin, prompt, timeoutMs, targetUrl);
}

export function isLoginRequiredError(targetUrl: string, err: unknown): boolean {
  const provider = detectProvider(targetUrl);
  if (provider === 'chatgpt') {
    return isChatgptLoginRequiredError(err);
  }
  return false;
}

export function getProviderLoginUrl(targetUrl: string): string | null {
  const provider = detectProvider(targetUrl);
  if (provider === 'chatgpt') return CHATGPT_LOGIN_URL;
  return null;
}
