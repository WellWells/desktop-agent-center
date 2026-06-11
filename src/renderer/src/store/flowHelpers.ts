// src/renderer/src/store/flowHelpers.ts — AgentFlow factory/helper functions
import type { FlowDefinition, SkillInstance, SkillType } from '../../../shared/types';

export function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultStep(type: SkillType = 'shell', outputKey?: string, t: (key: string) => string = (k) => k): SkillInstance {
  const id = createId();
  const configMap: Record<SkillType, Record<string, string>> = {
    shell: { command: '', windowsShell: 'cmd' },
    browser: { url: '' },
    llm: {
      prompt: '',
      provider: '',
      saveToHistory: 'false',
      emitFailFlag: 'false',
      exportFormat: '',
      exportTitle: '',
      exportFileName: '',
      exportShowProvider: 'false',
      exportShowTimestamp: 'false',
    },
    clipboard: { action: 'read', text: '' },
    utility: { action: 'delay', delayMs: '1000', title: '', body: '', format: 'png', content: '' },
    bot: { chatId: '', message: '' },
    rss: { url: '', fetchContent: 'false', checkpoint: '', lastLinks: '' },
    stop: { value: '' },
    comment: { note: '' },
    scraper: { url: '', itemSelector: '', titleSelector: '', linkSelector: '', maxItems: '5' },
    loop: { input: '', loopVar: 'item', limitIterations: 'true', maxIterations: '5' },
    end_loop: {},
    if: { left: '', operator: 'is_true', right: '' },
    end_if: {},
  };
  const labelMap: Record<SkillType, string> = {
    shell: t('agentflow.skill.shell'),
    browser: t('agentflow.skill.browser'),
    llm: t('agentflow.skill.llm'),
    clipboard: t('agentflow.skill.clipboard'),
    utility: t('agentflow.skill.utility'),
    bot: t('agentflow.skill.bot'),
    rss: t('agentflow.skill.rss'),
    stop: t('agentflow.skill.stop'),
    comment: t('agentflow.skill.comment'),
    scraper: t('agentflow.skill.scraper'),
    loop: t('agentflow.skill.loop'),
    end_loop: t('agentflow.skill.end_loop'),
    if: t('agentflow.skill.if'),
    end_if: t('agentflow.skill.end_if'),
  };
  const noOutputKey = type === 'comment' || type === 'end_loop' || type === 'if' || type === 'end_if';
  return {
    id,
    type,
    label: labelMap[type],
    config: configMap[type],
    outputKey: outputKey ?? (noOutputKey ? '' : `${type}_1`),
  };
}

export function createDefaultFlow(t: (key: string) => string = (k) => k): FlowDefinition {
  return {
    id: createId(),
    name: t('agentflow.newFlow'),
    description: t('agentflow.newFlow.desc'),
    enabled: true,
    trigger: { type: 'manual' },
    steps: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function cloneFlow(flow: FlowDefinition): FlowDefinition {
  return JSON.parse(JSON.stringify(flow)) as FlowDefinition;
}

/**
 * Given an index pointing at a block marker (loop/if opener or end_loop/end_if
 * closer), returns the index of its matching marker, or -1 if none. Depth-tracked
 * so nested blocks of the same kind pair correctly.
 */
export function findMatchingMarker(steps: SkillInstance[], index: number): number {
  const type = steps[index]?.type;
  const pair: Partial<Record<SkillType, { other: SkillType; dir: 1 | -1 }>> = {
    loop: { other: 'end_loop', dir: 1 },
    if: { other: 'end_if', dir: 1 },
    end_loop: { other: 'loop', dir: -1 },
    end_if: { other: 'if', dir: -1 },
  };
  const entry = type ? pair[type] : undefined;
  if (!type || !entry) return -1;
  let depth = 1;
  for (let j = index + entry.dir; j >= 0 && j < steps.length; j += entry.dir) {
    if (steps[j].type === type) depth++;
    else if (steps[j].type === entry.other) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}
