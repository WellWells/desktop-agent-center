// src/main/flow/flowManager.ts — AgentFlow flow CRUD and execution orchestration
//
// Persistence lives in flowPersistence.ts, trigger registration in
// flowTriggers.ts, and the serial execution queue in flowQueue.ts.

import type {
  FlowDefinition,
  FlowExecutionEvent,
  FlowExecutionLog,
  FlowExecutionResult,
  QueueTaskItem,
} from '../../shared/types';
import { executeFlow } from './executor';
import type { FlowExecutorDeps } from './types';
import { sendLog, sendToRenderer } from '../helpers';
import { IPC } from '../../shared/types';
import { normalizeCronTrigger, shouldNormalizeCronTrigger } from '../../shared/flowSchedule';
import { createEntityId, loadFlowsFromDisk, saveFlowsToDisk } from './flowPersistence';
import { FlowTriggerRegistry } from './flowTriggers';
import { FlowSerialQueue } from './flowQueue';

export interface FlowBotCommandDef {
  flowId: string;
  command: string;
  description: string;
  inputVariable: string;
}

type FlowExecutionSource = 'ui' | 'bot' | 'system';

export class FlowManager {
  private flows: FlowDefinition[] = [];
  private deps: FlowExecutorDeps;
  private _running = new Set<string>();
  private _onBotCommandsChanged: (() => void) | null = null;
  private triggers = new FlowTriggerRegistry((flowId) => {
    void this.queueExecution(flowId);
  });
  private queue = new FlowSerialQueue();

  constructor(deps: FlowExecutorDeps) {
    this.deps = deps;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    const loadedFlows = await loadFlowsFromDisk();
    this.flows = loadedFlows.map((flow) => this.normalizeFlow(flow));
    if (JSON.stringify(this.flows) !== JSON.stringify(loadedFlows)) {
      await saveFlowsToDisk(this.flows);
    }
    this.triggers.registerAll(this.flows);
    sendLog(`📋 [AgentFlow] Loaded ${this.flows.length} flow(s)`);
  }

  shutdown(): void {
    this.triggers.unregisterAll(this.flows);
    sendLog('🛑 [AgentFlow] Shut down — all triggers unregistered');
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  getAll(): FlowDefinition[] {
    return this.flows;
  }

  getBotCommands(): FlowBotCommandDef[] {
    return this.flows
      .filter((f) => f.enabled && f.trigger.type === 'bot' && f.trigger.botCommand?.trim())
      .map((f) => ({
        flowId: f.id,
        command: (f.trigger.botCommand ?? '').toLowerCase().trim(),
        description: f.trigger.botCommandDescription ?? '',
        inputVariable: f.trigger.botInputVariable?.trim() || 'input',
      }));
  }

  async save(flow: FlowDefinition): Promise<FlowDefinition> {
    const normalizedFlow = this.normalizeFlow(flow);
    const idx = this.flows.findIndex((f) => f.id === flow.id);
    normalizedFlow.updatedAt = new Date().toISOString();
    const oldTriggerType = idx >= 0 ? this.flows[idx].trigger.type : undefined;

    if (idx >= 0) {
      // Unregister old triggers before replacement
      this.triggers.unregister(this.flows[idx]);
      this.flows[idx] = normalizedFlow;
    } else {
      normalizedFlow.createdAt = normalizedFlow.createdAt || new Date().toISOString();
      this.flows.push(normalizedFlow);
    }

    if (normalizedFlow.enabled) {
      this.triggers.register(normalizedFlow);
    }

    await saveFlowsToDisk(this.flows);

    if (normalizedFlow.trigger.type === 'bot' || oldTriggerType === 'bot') {
      this._onBotCommandsChanged?.();
    }

    return normalizedFlow;
  }

  async delete(flowId: string): Promise<boolean> {
    const idx = this.flows.findIndex((f) => f.id === flowId);
    if (idx < 0) return false;
    const deletedTriggerType = this.flows[idx].trigger.type;
    this.triggers.unregister(this.flows[idx]);
    this.flows.splice(idx, 1);
    await saveFlowsToDisk(this.flows);
    if (deletedTriggerType === 'bot') {
      this._onBotCommandsChanged?.();
    }
    return true;
  }

  async duplicate(flowId: string): Promise<FlowDefinition | null> {
    const idx = this.flows.findIndex((f) => f.id === flowId);
    if (idx < 0) return null;
    const source = this.flows[idx];
    const duplicated: FlowDefinition = {
      ...source,
      id: createEntityId(),
      enabled: false,
      trigger: {
        ...source.trigger,
        weekdays: source.trigger.weekdays ? [...source.trigger.weekdays] : undefined,
      },
      steps: source.steps.map((step) => ({
        ...step,
        id: createEntityId(),
        config: { ...step.config },
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.flows.splice(idx + 1, 0, duplicated);
    await saveFlowsToDisk(this.flows);
    return duplicated;
  }

  async move(flowId: string, direction: 'up' | 'down'): Promise<FlowDefinition[]> {
    const idx = this.flows.findIndex((f) => f.id === flowId);
    if (idx < 0) return this.flows;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= this.flows.length) return this.flows;
    [this.flows[idx], this.flows[targetIdx]] = [this.flows[targetIdx], this.flows[idx]];
    await saveFlowsToDisk(this.flows);
    return this.flows;
  }

  // ── Queue integration ─────────────────────────────────────────────────────

  setQueueChangeCallback(cb: () => void): void {
    this.queue.setOnChange(cb);
  }

  setOnBotCommandsChanged(cb: () => void): void {
    this._onBotCommandsChanged = cb;
  }

  getPendingQueueItems(): QueueTaskItem[] {
    return this.queue.getPendingItems();
  }

  private failureResult(flowId: string, error: string, totalSteps: number): FlowExecutionResult {
    return {
      flowId,
      success: false,
      outputs: {},
      error,
      completedSteps: 0,
      totalSteps,
      completedAt: new Date().toISOString(),
    };
  }

  private createQueueExecution(
    flowId: string,
    extraContext?: Record<string, string>,
    source: FlowExecutionSource = 'ui',
  ): { taskId: string; result: Promise<FlowExecutionResult> } {
    const flow = this.flows.find((f) => f.id === flowId);
    const taskId = createEntityId();
    if (!flow) {
      return { taskId, result: Promise.resolve(this.failureResult(flowId, 'Flow not found', 0)) };
    }

    if (flow.trigger.type === 'bot' && source !== 'bot') {
      sendLog(`🚫 [AgentFlow] Flow "${flow.name}" requires a Telegram trigger — skipped (source: ${source})`);
      return {
        taskId,
        result: Promise.resolve(
          this.failureResult(flowId, 'Bot trigger flows must be invoked from Telegram', flow.steps.length),
        ),
      };
    }

    const result = this.queue.enqueue(
      taskId,
      flow.name || flowId,
      () => this.execute(flowId, extraContext),
      (err) => this.failureResult(
        flowId,
        err instanceof Error ? err.message : String(err),
        flow.steps.length,
      ),
    );
    return { taskId, result };
  }

  // Enqueues a flow execution onto the serial chain, returns the result when it runs.
  async queueExecution(
    flowId: string,
    extraContext?: Record<string, string>,
    source: FlowExecutionSource = 'ui',
  ): Promise<FlowExecutionResult> {
    return this.createQueueExecution(flowId, extraContext, source).result;
  }

  queueExecutionWithId(
    flowId: string,
    extraContext?: Record<string, string>,
    source: FlowExecutionSource = 'ui',
  ): { taskId: string; result: Promise<FlowExecutionResult> } {
    return this.createQueueExecution(flowId, extraContext, source);
  }

  // ── Execution ────────────────────────────────────────────────────────────

  async execute(flowId: string, extraContext?: Record<string, string>): Promise<FlowExecutionResult> {
    const flow = this.flows.find((f) => f.id === flowId);
    if (!flow) {
      return this.failureResult(flowId, 'Flow not found', 0);
    }

    if (this._running.has(flowId)) {
      return this.failureResult(flowId, 'Flow is already running', flow.steps.length);
    }

    this._running.add(flowId);
    const event: FlowExecutionEvent = { flowId, name: flow.name };
    sendToRenderer(IPC.FLOW_EXECUTION_STARTED, event);

    try {
      const onLog = (log: FlowExecutionLog): void => {
        sendToRenderer(IPC.FLOW_EXECUTION_LOG, log);
      };
      return await executeFlow(flow, this.deps, onLog, extraContext);
    } finally {
      this._running.delete(flowId);
      sendToRenderer(IPC.FLOW_EXECUTION_ENDED, { flowId, name: flow.name } satisfies FlowExecutionEvent);
      // Reload the worker window to the provider URL after every flow execution.
      // If the LLM kill-switch navigated it to about:blank, this restores it.
      // Even without a timeout, reloading clears residual renderer state between flows.
      const workerWin = this.deps.getWorkerWin();
      if (workerWin && !workerWin.isDestroyed()) {
        const targetUrl = this.deps.getTargetUrl();
        if (targetUrl) {
          workerWin.webContents.loadURL(targetUrl).catch(() => { /* ignore navigation errors on cleanup */ });
        }
      }
    }
  }

  private normalizeFlow(flow: FlowDefinition): FlowDefinition {
    if (!shouldNormalizeCronTrigger(flow.trigger)) return flow;
    return {
      ...flow,
      trigger: normalizeCronTrigger(flow.trigger),
    };
  }
}
