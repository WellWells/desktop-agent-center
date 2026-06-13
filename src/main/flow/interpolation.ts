// template/variable utilities for flow steps.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CaptureFormat, SkillType } from '../../shared/types';

export function interpolate(template: string, context: Map<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, varName: string) => {
    return context.get(varName.trim()) ?? '';
  });
}

export function interpolateConfig(
  config: Record<string, string>,
  context: Map<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    result[key] = interpolate(value, context);
  }
  return result;
}

export function isCaptureFormat(value: string | undefined): value is CaptureFormat {
  return value === 'png' || value === 'webp' || value === 'pdf';
}

export function inferTelegramSendAs(filePath: string): 'photo' | 'document' {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.gif') {
    return 'photo';
  }
  return 'document';
}

export function isFileOutputStep(type: SkillType, config: Record<string, string>): boolean {
  if (type === 'utility') return (config.action ?? 'delay') === 'export';
  if (type === 'llm') return isCaptureFormat(config.exportFormat);
  return false;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractTemplateVariables(template: string): string[] {
  const vars = new Set<string>();
  const matches = template.matchAll(/\{\{([^}]+)\}\}/g);
  for (const match of matches) {
    const varName = match[1]?.trim();
    if (varName) vars.add(varName);
  }
  return [...vars];
}

async function isExistingFilePath(value: string): Promise<boolean> {
  const filePath = value.trim();
  if (!filePath) return false;
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function resolveMagicUploadFile(
  template: string,
  context: Map<string, string>,
): Promise<{ variable: string; filePath: string } | null> {
  const variables = extractTemplateVariables(template);
  for (const variable of variables) {
    const value = context.get(variable)?.trim() ?? '';
    if (!value) continue;
    if (await isExistingFilePath(value)) {
      return { variable, filePath: value };
    }
  }
  return null;
}
