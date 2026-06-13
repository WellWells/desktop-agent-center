// skill dispatcher.
//
// Maps a SkillType to its handler. To add a skill: implement the handler in
// actions.ts (or feeds.ts) and add a case below.

import type { SkillType } from '../../../shared/types';
import type { FlowExecutorDeps } from '../types';
import { execIf, execStop } from '../runtime';
import { execRss, execScraper } from './feeds';
import {
  execBot,
  execBrowser,
  execClipboard,
  execComment,
  execLlm,
  execLoop,
  execShell,
  execUtility,
} from './actions';

export async function executeSkill(
  type: SkillType,
  stepId: string,
  config: Record<string, string>,
  deps: FlowExecutorDeps,
  timeoutMs: number,
): Promise<string> {
  switch (type) {
    case 'shell':
      return execShell(config, timeoutMs);
    case 'browser':
      return execBrowser(config);
    case 'llm':
      return execLlm(config, deps, timeoutMs);
    case 'clipboard':
      return execClipboard(config);
    case 'utility':
      return execUtility(config, deps);
    case 'bot':
      return execBot(config, deps);
    case 'rss':
      return execRss(config, stepId, deps.getTargetUrl());
    case 'scraper':
      return execScraper(config, stepId);
    case 'stop':
      return execStop(config);
    case 'comment':
      return execComment(config);
    case 'loop':
      return execLoop(config);
    case 'end_loop':
      return '';
    case 'if':
      return execIf(config);
    case 'end_if':
      return '';
    default:
      throw new Error(`Unknown skill type: ${type as string}`);
  }
}
