import { Bot, Compass, Sparkles, type LucideIcon } from 'lucide-react';
import { PROVIDER_LABELS, PROVIDER_URLS } from '../../../shared/types';

export interface ModelOption {
  label: string;
  url: string;
  icon: LucideIcon;
}

export const MODELS: ModelOption[] = [
  { label: PROVIDER_LABELS.gemini, url: PROVIDER_URLS.gemini, icon: Sparkles },
  { label: PROVIDER_LABELS.perplexity, url: PROVIDER_URLS.perplexity, icon: Compass },
  { label: PROVIDER_LABELS.chatgpt, url: PROVIDER_URLS.chatgpt, icon: Bot },
];

export const DEFAULT_MODEL_URL = MODELS[0].url;

const MODEL_ICON_BY_URL: Record<string, LucideIcon> = {
  [PROVIDER_URLS.gemini]: Sparkles,
  [PROVIDER_URLS.perplexity]: Compass,
  [PROVIDER_URLS.chatgpt]: Bot,
} as const;

export function getModelOptionByUrl(url: string): ModelOption {
  return MODELS.find((model) => model.url === url) ?? MODELS[0];
}

export function getModelIconByUrl(url: string): LucideIcon {
  return MODEL_ICON_BY_URL[url] ?? Sparkles;
}
