// src/main/flow/runtime.ts — step timeout, logging, stop signal and loop helpers.

import type { FlowExecutionLog, SkillInstance, SkillType } from '../../shared/types';
import type { FlowExecutorDeps, LogCallback } from './types';

const DEFAULT_STEP_TIMEOUT_MS = 60_000;
// Browser steps may batch-fetch multiple URLs sequentially (each up to 25s),
// so they get a generous timeout: 10 URLs × 25s = 250s + headroom.
const BROWSER_STEP_TIMEOUT_MS = 300_000;

function normalizeTimeoutMs(value: number | undefined, fallbackMs: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return fallbackMs;
  return Math.max(1_000, Math.trunc(value));
}

export function resolveStepTimeoutMs(type: SkillType, deps: FlowExecutorDeps): number {
  if (type === 'llm') {
    return normalizeTimeoutMs(deps.getResponseTimeoutMs?.(), DEFAULT_STEP_TIMEOUT_MS);
  }
  if (type === 'browser' || type === 'rss' || type === 'scraper') {
    return BROWSER_STEP_TIMEOUT_MS;
  }
  return DEFAULT_STEP_TIMEOUT_MS;
}

export function withStepTimeout<T>(work: Promise<T>, timeoutMs: number, stepType: SkillType, onTimeout?: () => void,): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // Fire cleanup callback (e.g. navigate worker window away) before rejecting
      // so that any zombie executeJavaScript calls are forcibly terminated.
      try { onTimeout?.(); } catch { /* ignore cleanup errors */ }
      reject(new Error(`${stepType} step timed out after ${Math.ceil(timeoutMs / 1_000)} seconds`));
    }, timeoutMs);

    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function emitLog(
  onLog: LogCallback | undefined,
  flowId: string,
  stepId: string,
  stepIndex: number,
  status: FlowExecutionLog['status'],
  output?: string,
  error?: string,
): void {
  onLog?.({
    flowId,
    stepId,
    stepIndex,
    status,
    output,
    error,
    timestamp: new Date().toISOString(),
  });
}

/** Sentinel thrown by the stop skill to gracefully halt the flow. */
export class StopFlowSignal extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'StopFlowSignal';
  }
}

/** Checks the resolved value and throws StopFlowSignal if the stop condition is met. */
export function execStop(config: Record<string, string>): string {
  const value = (config.value ?? '').trim();
  if (value === '' || value === '[]') {
    throw new StopFlowSignal(`Stop condition met: value is ${value === '' ? 'empty' : '[]'}`);
  }
  return value;
}

export function findLoopEndIndex(steps: SkillInstance[], startIdx: number): number {
  let depth = 1;
  for (let j = startIdx + 1; j < steps.length; j++) {
    if (steps[j].type === 'loop') depth++;
    if (steps[j].type === 'end_loop') {
      depth--;
      if (depth === 0) {
        return j;
      }
    }
  }
  return steps.length;
}

/** Finds the matching end_if for the if step at startIdx (depth-tracked, like findLoopEndIndex). */
export function findIfEndIndex(steps: SkillInstance[], startIdx: number): number {
  let depth = 1;
  for (let j = startIdx + 1; j < steps.length; j++) {
    if (steps[j].type === 'if') depth++;
    if (steps[j].type === 'end_if') {
      depth--;
      if (depth === 0) {
        return j;
      }
    }
  }
  return steps.length;
}

/** Treats empty / '0' / 'false' (case-insensitive) as falsy; everything else truthy. */
function isTruthyValue(value: string): boolean {
  const v = value.trim();
  return v !== '' && v !== '0' && v.toLowerCase() !== 'false';
}

/**
 * Evaluates an `if` step's condition (left/operator/right, already interpolated)
 * and returns 'true' or 'false'. The executor branches on this string.
 */
export function execIf(config: Record<string, string>): string {
  const left = (config.left ?? '').trim();
  const right = (config.right ?? '').trim();
  const operator = config.operator ?? 'is_true';
  let result: boolean;
  switch (operator) {
    case 'is_true':
      result = isTruthyValue(left);
      break;
    case 'is_false':
      result = !isTruthyValue(left);
      break;
    case 'equals':
      result = left === right;
      break;
    case 'not_equals':
      result = left !== right;
      break;
    case 'contains':
      result = right !== '' && left.includes(right);
      break;
    case 'is_empty':
      result = left === '';
      break;
    default:
      result = isTruthyValue(left);
  }
  return result ? 'true' : 'false';
}
