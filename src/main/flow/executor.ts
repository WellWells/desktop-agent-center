// src/main/flow/executor.ts — AgentFlow flow execution engine.
//
// Executes a FlowDefinition step-by-step, maintaining a context pool for variable
// interpolation between steps. A single recursive `runRange` drives both the
// top-level pass (depth 0) and nested loop bodies (depth > 0); the only behavioural
// differences are gated on `depth`.

import { clipboard } from 'electron';
import type { FlowDefinition, FlowExecutionResult, SkillInstance } from '../../shared/types';
import { sendLog } from '../helpers';
import type { FlowExecutorDeps, LogCallback } from './types';
import {
  escapeRegExp,
  interpolate,
  interpolateConfig,
  isFileOutputStep,
  resolveMagicUploadFile,
} from './interpolation';
import {
  StopFlowSignal,
  emitLog,
  findIfEndIndex,
  findLoopEndIndex,
  resolveStepTimeoutMs,
  withStepTimeout,
} from './runtime';
import { executeSkill } from './skills';

/** Mutable progress shared across the whole flow execution (top-level only). */
interface RunProgress {
  completed: number;
  stopped: boolean;
  error?: string;
}

/** Interpolates a step's config and resolves bot magic-upload metadata. */
async function resolveStepConfig(
  step: SkillInstance,
  context: Map<string, string>,
): Promise<Record<string, string>> {
  const resolvedConfig = interpolateConfig(step.config, context);
  if (step.type === 'bot') {
    const messageTemplate = step.config.message ?? '';
    const magicFile = await resolveMagicUploadFile(messageTemplate, context);
    if (magicFile) {
      const placeholderPattern = new RegExp(`\\{\\{\\s*${escapeRegExp(magicFile.variable)}\\s*\\}\\}`, 'g');
      const captionTemplate = messageTemplate.replace(placeholderPattern, '').trim();
      resolvedConfig.__magicUploadPath = magicFile.filePath;
      resolvedConfig.__magicUploadCaption = interpolate(captionTemplate, context).trim();
    }
    // Preserve the original chatIds template so execBot can detect
    // whether it was configured but resolved to empty (e.g. {{bot.triggerChatId}} with no bot context).
    resolvedConfig.__originalChatIdsTemplate = (step.config.chatIds ?? step.config.chatId ?? '').trim();
  }
  return resolvedConfig;
}

/** Runs a single non-loop step under its skill-specific timeout. */
async function runStep(
  step: SkillInstance,
  resolvedConfig: Record<string, string>,
  deps: FlowExecutorDeps,
): Promise<string> {
  const stepTimeoutMs = resolveStepTimeoutMs(step.type, deps);
  // For LLM steps: navigate the worker window to about:blank on timeout to
  // forcibly terminate any zombie executeJavaScript call in the renderer.
  // Without this, the stuck JS keeps the GPU IPC alive and deadlocks the process.
  const onStepTimeout =
    step.type === 'llm'
      ? () => {
          // A pending navigation often rejects this loadURL with ERR_ABORTED
          // during teardown — swallow it so it doesn't surface as a stray
          // unhandledRejection.
          deps.getWorkerWin()?.webContents.loadURL('about:blank').catch(() => { /* expected during teardown */ });
        }
      : undefined;
  return withStepTimeout(
    executeSkill(step.type, step.id, resolvedConfig, deps, stepTimeoutMs),
    stepTimeoutMs,
    step.type,
    onStepTimeout,
  );
}

/**
 * Expands a loop step over its body steps (the range until the matching end_loop).
 * Returns the new outer index (the loop body is consumed here, so the caller skips it).
 */
async function expandLoop(
  flow: FlowDefinition,
  loopIndex: number,
  rangeEnd: number,
  step: SkillInstance,
  output: string,
  context: Map<string, string>,
  deps: FlowExecutorDeps,
  onLog: LogCallback | undefined,
  progress: RunProgress,
  depth: number,
): Promise<number> {
  const loopVar = (step.config.loopVar ?? 'item').trim() || 'item';
  const limitIterations = step.config.limitIterations !== 'false';
  const limit = parseInt(step.config.maxIterations ?? '5', 10) || 5;
  let items: any[] = [];
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) {
      items = parsed;
    }
  } catch {
    // ignore
  }

  if (limitIterations && limit > 0) {
    items = items.slice(0, limit);
  }

  // Clamp the loop body to the enclosing range so nested loops never run past their parent.
  const bodyEnd = Math.min(findLoopEndIndex(flow.steps, loopIndex), rangeEnd);
  const nested = depth > 0;

  if (items.length > 0) {
    sendLog(`🔄 [AgentFlow] Looping subsequent steps for ${items.length} items${nested ? ' (nested)' : ''} using variable "${loopVar}"`);
    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      sendLog(`🔄 [AgentFlow] Loop iteration ${j + 1}/${items.length}${nested ? ' (nested)' : ''}`);
      const loopContext = new Map(context);
      if (typeof item === 'object' && item !== null) {
        for (const [k, v] of Object.entries(item)) {
          const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
          if (step.outputKey) {
            loopContext.set(`${step.outputKey}.${k}`, valStr);
          }
          loopContext.set(`${loopVar}.${k}`, valStr);
        }
        const itemStr = JSON.stringify(item);
        if (step.outputKey) {
          loopContext.set(step.outputKey, itemStr);
        }
        loopContext.set(loopVar, itemStr);
      } else {
        const valStr = String(item);
        if (step.outputKey) {
          loopContext.set(step.outputKey, valStr);
        }
        loopContext.set(loopVar, valStr);
      }
      await runRange(flow, loopIndex + 1, bodyEnd, loopContext, deps, onLog, progress, depth + 1);
    }
    // Mark loop body steps as completed in the flat progress count (top-level only).
    if (depth === 0) {
      for (let j = loopIndex + 1; j < bodyEnd; j++) {
        progress.completed++;
      }
    }
    if (!nested) sendLog(`🔄 [AgentFlow] Loop complete`);
  } else {
    // Skip loop body
    for (let j = loopIndex + 1; j < bodyEnd; j++) {
      emitLog(onLog, flow.id, flow.steps[j].id, j, 'skipped');
      if (depth === 0) progress.completed++;
    }
    if (!nested) sendLog(`🔄 [AgentFlow] No items to loop, skipped loop body steps`);
  }

  return bodyEnd - 1; // skip body in outer execution flow
}

/**
 * Executes steps in [startIndex, endIndex). At depth 0 this is the whole flow and
 * records progress/results; at depth > 0 it is a loop body and propagates errors upward.
 */
async function runRange(
  flow: FlowDefinition,
  startIndex: number,
  endIndex: number,
  context: Map<string, string>,
  deps: FlowExecutorDeps,
  onLog: LogCallback | undefined,
  progress: RunProgress,
  depth: number,
): Promise<void> {
  for (let i = startIndex; i < endIndex; i++) {
    const step = flow.steps[i];
    emitLog(onLog, flow.id, step.id, i, 'running');
    if (depth === 0) {
      sendLog(`⏳ Step ${i + 1}/${flow.steps.length}: [${step.type}] ${step.label}`);
    }

    try {
      const resolvedConfig = await resolveStepConfig(step, context);
      const output = await runStep(step, resolvedConfig, deps);

      // Persist step outputs into the active context at every depth so chained
      // references (e.g. {{browser_1}}, {{llm_1}}) resolve for later steps within
      // the same loop iteration. At depth > 0 the context is a per-iteration
      // loopContext copy, so these writes never leak across iterations.
      if (step.outputKey) {
        context.set(step.outputKey, output);
      }
      context.set(`${step.id}.output`, output);
      if (isFileOutputStep(step.type, resolvedConfig) && output) {
        context.set('file', output);
      }
      // LLM failure flag: on success expose {{<outputKey>.isFailed}} = '0' so a
      // downstream `if` can branch. Written at every depth like the output writes.
      if (step.type === 'llm' && step.config.emitFailFlag === 'true' && step.outputKey) {
        context.set(`${step.outputKey}.isFailed`, '0');
      }

      // Progress accounting and the completion log stay top-level only; loop body
      // steps are accounted for once in expandLoop to preserve the flat progress model.
      if (depth === 0) {
        progress.completed++;
        emitLog(onLog, flow.id, step.id, i, 'completed', output);
        sendLog(`✅ Step ${i + 1} completed (${output.length} chars)`);
      }

      // If step is a 'loop' step, we loop over the subsequent steps!
      if (step.type === 'loop' && i + 1 < endIndex) {
        i = await expandLoop(flow, i, endIndex, step, output, context, deps, onLog, progress, depth);
      }

      // If step is an 'if' step, skip its body (up to the matching end_if) when the
      // condition is false. When true, fall through so the body runs in this same
      // range/context — no recursion, so output writes and progress behave normally.
      if (step.type === 'if') {
        const conditionMet = output === 'true';
        const bodyEnd = Math.min(findIfEndIndex(flow.steps, i), endIndex);
        if (!conditionMet) {
          for (let j = i + 1; j < bodyEnd; j++) {
            emitLog(onLog, flow.id, flow.steps[j].id, j, 'skipped');
            if (depth === 0) progress.completed++;
          }
          if (depth === 0) sendLog(`↪️ [AgentFlow] If condition false — skipped ${Math.max(0, bodyEnd - i - 1)} step(s)`);
          i = bodyEnd - 1; // jump to just before end_if; the for-loop's i++ runs end_if (no-op)
        }
      }
    } catch (err) {
      // StopFlowSignal is a graceful halt — not an error.
      if (err instanceof StopFlowSignal) {
        emitLog(onLog, flow.id, step.id, i, 'skipped', undefined, err.message);
        if (depth === 0) sendLog(`⏹️ Step ${i + 1} stopped flow: ${err.message}`);
        for (let j = i + 1; j < flow.steps.length; j++) {
          emitLog(onLog, flow.id, flow.steps[j].id, j, 'skipped');
        }
        if (depth === 0) {
          sendLog(`⏹️ [AgentFlow] Flow "${flow.name}" stopped early (${progress.completed}/${flow.steps.length} steps)`);
          progress.stopped = true;
          return;
        }
        // Nested loop body: halt this body but let the enclosing loop continue.
        break;
      }

      // Non-fatal LLM failure: when the failure flag is enabled, don't abort the
      // flow — expose {{<outputKey>.isFailed}} = '1' and continue so a downstream
      // `if` can branch on the failure.
      if (step.type === 'llm' && step.config.emitFailFlag === 'true') {
        const msg = err instanceof Error ? err.message : String(err);
        if (step.outputKey) {
          context.set(step.outputKey, '');
          context.set(`${step.outputKey}.isFailed`, '1');
        }
        context.set(`${step.id}.output`, '');
        emitLog(onLog, flow.id, step.id, i, 'completed', '', msg);
        if (depth === 0) {
          progress.completed++;
          sendLog(`⚠️ Step ${i + 1} LLM failed (isFailed=1), continuing: ${msg}`);
        }
        continue;
      }

      const errorMsg = err instanceof Error ? err.message : String(err);
      emitLog(onLog, flow.id, step.id, i, 'error', undefined, errorMsg);
      if (depth === 0) sendLog(`❌ Step ${i + 1} failed: ${errorMsg}`);

      // Mark remaining steps as skipped
      for (let j = i + 1; j < flow.steps.length; j++) {
        emitLog(onLog, flow.id, flow.steps[j].id, j, 'skipped');
      }

      if (depth === 0) {
        progress.error = `Step "${step.label}" failed: ${errorMsg}`;
        return;
      }
      throw err;
    }
  }
}

export async function executeFlow(
  flow: FlowDefinition,
  deps: FlowExecutorDeps,
  onLog?: LogCallback,
  initialContext?: Record<string, string>,
): Promise<FlowExecutionResult> {
  const context = new Map<string, string>();

  // Seed built-in variables
  context.set('clipboard', clipboard.readText());
  context.set('timestamp', new Date().toISOString());
  context.set('flow.name', flow.name);

  // Seed caller-provided initial context (e.g. bot trigger input variables)
  if (initialContext) {
    for (const [k, v] of Object.entries(initialContext)) {
      context.set(k, v);
    }
  }

  const progress: RunProgress = { completed: 0, stopped: false };

  sendLog(`▶️ [AgentFlow] Executing flow: ${flow.name} (${flow.steps.length} steps)`);

  await runRange(flow, 0, flow.steps.length, context, deps, onLog, progress, 0);

  if (progress.error) {
    return {
      flowId: flow.id,
      success: false,
      outputs: Object.fromEntries(context),
      error: progress.error,
      completedSteps: progress.completed,
      totalSteps: flow.steps.length,
      completedAt: new Date().toISOString(),
    };
  }

  if (!progress.stopped) {
    sendLog(`✅ [AgentFlow] Flow "${flow.name}" completed (${progress.completed}/${flow.steps.length} steps)`);
  }

  return {
    flowId: flow.id,
    success: true,
    outputs: Object.fromEntries(context),
    completedSteps: progress.completed,
    totalSteps: flow.steps.length,
    completedAt: new Date().toISOString(),
  };
}
