// src/main/files.ts — Output file management (list, search, build metadata)
import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fdir } from 'fdir';
import dayjs from 'dayjs';
import type { OutputFile } from '../shared/types';

type MarkdownHeadingAliases = {
  provider: Set<string>;
  timestamp: Set<string>;
};

export async function getOutputDir(): Promise<string> {
  const dir = app.isPackaged
    ? path.join(app.getPath('userData'), 'outputs')
    : path.resolve('./outputs');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function getLanguageDir(): string {
  // Works in both dev (out/main/ → out/language/) and packaged (app.asar/out/main/ → app.asar/out/language/)
  return path.join(__dirname, '..', 'language');
}

export async function listOutputFiles(): Promise<OutputFile[]> {
  const dir = await getOutputDir();
  try {
    const headingAliases = await loadMarkdownHeadingAliases();
    const filePaths = getOutputMarkdownPaths(dir);
    return await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          return buildOutputFile(filePath, content, headingAliases);
        } catch {
          return buildOutputFile(filePath, '', headingAliases);
        }
      }),
    );
  } catch {
    return [];
  }
}

export async function searchOutputFiles(query: string): Promise<OutputFile[]> {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return listOutputFiles();

  const dir = await getOutputDir();
  try {
    const headingAliases = await loadMarkdownHeadingAliases();
    const filePaths = getOutputMarkdownPaths(dir);
    const matches: OutputFile[] = [];
    for (const filePath of filePaths) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const searchable = `${path.basename(filePath)}\n${content}`.toLowerCase();
        if (!searchable.includes(keyword)) continue;
        matches.push(buildOutputFile(filePath, content, headingAliases));
      } catch {
        // skip unreadable file
      }
    }
    return matches;
  } catch {
    return [];
  }
}

function getOutputMarkdownPaths(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return new fdir()
    .withFullPaths()
    .filter((entryPath, isDirectory) => isDirectory || entryPath.endsWith('.md'))
    .crawl(dir)
    .sync()
    .sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
}

function createEmptyHeadingAliases(): MarkdownHeadingAliases {
  return {
    provider: new Set<string>(),
    timestamp: new Set<string>(),
  };
}

function addHeadingAlias(aliasSet: Set<string>, value: unknown): void {
  if (typeof value !== 'string') return;
  const normalized = value.trim();
  if (!normalized) return;
  aliasSet.add(normalized);
}

async function loadMarkdownHeadingAliases(): Promise<MarkdownHeadingAliases> {
  const aliases = createEmptyHeadingAliases();
  const langDir = getLanguageDir();
  try {
    const files = await fs.readdir(langDir);
    const langFiles = files.filter((fileName) => fileName.endsWith('.json'));
    await Promise.all(
      langFiles.map(async (fileName) => {
        try {
          const filePath = path.join(langDir, fileName);
          const raw = await fs.readFile(filePath, 'utf-8');
          const translations = JSON.parse(raw) as Record<string, unknown>;
          addHeadingAlias(aliases.provider, translations['md.provider']);
          addHeadingAlias(aliases.timestamp, translations['md.timestamp']);
        } catch {
          // skip malformed locale files
        }
      }),
    );
  } catch {
    // fallback to empty aliases when locale directory is unavailable
  }
  return aliases;
}

function extractMetaByAliases(content: string, headingAliases: Set<string>): string | null {
  if (headingAliases.size === 0) return null;
  const normalized = content.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const headingMatch = lines[i].trim().match(/^##\s+(.+)$/);
    if (!headingMatch) continue;
    if (!headingAliases.has(headingMatch[1].trim())) continue;
    const sectionLines: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^##\s+/.test(lines[j])) break;
      sectionLines.push(lines[j]);
    }
    const sectionValue = sectionLines.join('\n').trim();
    return sectionValue || null;
  }
  return null;
}

function buildOutputFile(filePath: string, content: string, headingAliases: MarkdownHeadingAliases): OutputFile {
  const name = path.basename(filePath);
  const firstLine = content.split('\n')[0]?.trim() ?? '';
  const h1Match = firstLine.match(/^#\s+(.+)$/);
  const provider = extractMetaByAliases(content, headingAliases.provider);
  const timestampFromName = extractTimestampFromFileName(name);
  const timestampFromContent = extractTimestampFromContent(content, headingAliases.timestamp);
  const preview = h1Match
    ? h1Match[1]
    : (content.slice(0, 200).replace(/\n/g, ' ').trim() || name);

  return {
    name,
    path: filePath,
    timestamp: timestampFromContent || timestampFromName,
    preview,
    provider: provider || undefined,
  };
}

export function buildSafeFileNameFromTitle(title: string): string {
  const sanitized = title
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return sanitized || 'untitled';
}

export async function getUniquePath(desiredPath: string, originalPath: string): Promise<string> {
  if (desiredPath.toLowerCase() === originalPath.toLowerCase()) return originalPath;
  const dir = path.dirname(desiredPath);
  const ext = path.extname(desiredPath);
  const stem = path.basename(desiredPath, ext);
  let candidate = desiredPath;
  let idx = 2;
  while (existsSync(candidate) && candidate.toLowerCase() !== originalPath.toLowerCase()) {
    candidate = path.join(dir, `${stem} (${idx})${ext}`);
    idx += 1;
  }
  return candidate;
}

function extractTimestampFromFileName(name: string): string {
  const match = name.match(/(\d{4})-(\d{2})-(\d{2})[-_](\d{2})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const [, year, month, day, hour, minute, second] = match;
  return toIsoTimestamp(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
}

function extractTimestampFromContent(content: string, timestampHeadingAliases: Set<string>): string {
  const raw = extractMetaByAliases(content, timestampHeadingAliases);
  return toIsoTimestamp(raw ?? '');
}

function toIsoTimestamp(raw: string): string {
  const normalized = raw.trim();
  if (!normalized) return '';
  const parsed = dayjs(normalized);
  if (parsed.isValid()) return parsed.toISOString();
  const fallbackParsed = dayjs(normalized.replace(' ', 'T'));
  return fallbackParsed.isValid() ? fallbackParsed.toISOString() : '';
}

export function buildSnapshotFileName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
    '-snapshot',
  ].join('');
}
