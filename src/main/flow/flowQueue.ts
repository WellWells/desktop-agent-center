// src/main/flow/flowQueue.ts — serial execution queue for flow runs
//
// Chains executions on a single promise so concurrent flow triggers never race
// on shared resources (worker window, clipboard, etc.).

import type { FlowExecutionResult, QueueTaskItem } from '../../shared/types';

interface PendingEntry {
  id: string;
  name: string;
  status: 'running' | 'queued';
}

export class FlowSerialQueue {
  private chain: Promise<void> = Promise.resolve();
  private pending: PendingEntry[] = [];
  private onChange: (() => void) | null = null;

  setOnChange(cb: () => void): void {
    this.onChange = cb;
  }

  getPendingItems(): QueueTaskItem[] {
    return this.pending.map((item) => ({
      id: item.id,
      promptSummary: `[Flow] ${item.name}`,
      status: item.status,
    }));
  }

  // Appends a run to the serial chain; `makeErrorResult` converts thrown errors
  // into a failure result so the returned promise never rejects.
  enqueue(
    taskId: string,
    name: string,
    run: () => Promise<FlowExecutionResult>,
    makeErrorResult: (err: unknown) => FlowExecutionResult,
  ): Promise<FlowExecutionResult> {
    this.pending.push({ id: taskId, name, status: 'queued' });
    this.onChange?.();

    let resolveResult!: (result: FlowExecutionResult) => void;
    const resultPromise = new Promise<FlowExecutionResult>((res) => { resolveResult = res; });

    this.chain = this.chain.then(async () => {
      const idx = this.pending.findIndex((e) => e.id === taskId);
      if (idx >= 0) {
        this.pending[idx] = { ...this.pending[idx], status: 'running' };
        this.onChange?.();
      }
      try {
        resolveResult(await run());
      } catch (err) {
        resolveResult(makeErrorResult(err));
      } finally {
        const removeIdx = this.pending.findIndex((e) => e.id === taskId);
        if (removeIdx >= 0) this.pending.splice(removeIdx, 1);
        this.onChange?.();
        // Reset chain reference when queue is empty to allow GC of resolved closures
        if (this.pending.length === 0) {
          this.chain = Promise.resolve();
        }
      }
    });

    return resultPromise;
  }
}
