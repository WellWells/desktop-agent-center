// src/main/flow/flowTriggers.ts — hotkey/cron trigger registration for flows

import { globalShortcut } from 'electron';
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import type { FlowDefinition } from '../../shared/types';
import { sendLog } from '../helpers';
import { normalizeCronTrigger, shouldExecuteCronTriggerNow, shouldNormalizeCronTrigger } from '../../shared/flowSchedule';

export class FlowTriggerRegistry {
  private cronJobs = new Map<string, ScheduledTask>();
  private flowHotkeys = new Map<string, string>();
  private onTrigger: (flowId: string) => void;

  constructor(onTrigger: (flowId: string) => void) {
    this.onTrigger = onTrigger;
  }

  registerAll(flows: FlowDefinition[]): void {
    for (const flow of flows) {
      if (flow.enabled) {
        this.register(flow);
      }
    }
  }

  register(flow: FlowDefinition): void {
    const trigger = shouldNormalizeCronTrigger(flow.trigger)
      ? normalizeCronTrigger(flow.trigger)
      : flow.trigger;

    if (trigger.type === 'hotkey' && trigger.keys) {
      // Check if another flow already occupies this hotkey
      for (const [existingFlowId, existingKeys] of this.flowHotkeys) {
        if (existingKeys === trigger.keys && existingFlowId !== flow.id) {
          sendLog(`⚠️ [AgentFlow] Hotkey "${trigger.keys}" already used by another flow — skipping for "${flow.name}"`);
          return;
        }
      }
      try {
        const ok = globalShortcut.register(trigger.keys, () => {
          this.onTrigger(flow.id);
        });
        if (ok) {
          this.flowHotkeys.set(flow.id, trigger.keys);
          sendLog(`⌨️ [AgentFlow] Hotkey "${trigger.keys}" registered for "${flow.name}"`);
        } else {
          sendLog(`❌ [AgentFlow] Failed to register hotkey "${trigger.keys}" for "${flow.name}"`);
        }
      } catch (err) {
        sendLog(`❌ [AgentFlow] Hotkey error for "${flow.name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (trigger.type === 'cron' && trigger.cronExpression) {
      if (!cron.validate(trigger.cronExpression)) {
        sendLog(`❌ [AgentFlow] Invalid cron expression "${trigger.cronExpression}" for "${flow.name}"`);
        return;
      }
      const task = cron.schedule(trigger.cronExpression, () => {
        if (!shouldExecuteCronTriggerNow(trigger)) return;
        this.onTrigger(flow.id);
      });
      this.cronJobs.set(flow.id, task);
      sendLog(`⏰ [AgentFlow] Cron "${trigger.cronExpression}" scheduled for "${flow.name}"`);
    }
  }

  unregister(flow: FlowDefinition): void {
    const hotkey = this.flowHotkeys.get(flow.id);
    if (hotkey) {
      try { globalShortcut.unregister(hotkey); } catch { /* ignore */ }
      this.flowHotkeys.delete(flow.id);
    }

    const cronJob = this.cronJobs.get(flow.id);
    if (cronJob) {
      cronJob.stop();
      cronJob.destroy();
      this.cronJobs.delete(flow.id);
    }
  }

  unregisterAll(flows: FlowDefinition[]): void {
    for (const flow of flows) {
      this.unregister(flow);
    }
  }
}
