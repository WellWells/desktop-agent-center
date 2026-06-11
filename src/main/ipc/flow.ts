// src/main/ipcFlow.ts — AgentFlow CRUD and feed-checkpoint IPC handlers.

import { ipcMain, app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { IPC } from '../../shared/types';
import type { FlowDefinition } from '../../shared/types';
import { sendLog } from '../helpers';
import { getCheckpointPath } from '../flow';
import { showSaveDialogForWin } from './context';
import type { IpcContext } from './context';

/** Registers has/clear handlers for a feed checkpoint kind (rss or scraper). */
function registerCheckpointHandlers(
  kind: 'rss' | 'scraper',
  hasChannel: string,
  clearChannel: string,
  logTag: string,
): void {
  ipcMain.handle(hasChannel, async (_event, stepId: string) => {
    try {
      await fs.access(getCheckpointPath(kind, stepId));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle(clearChannel, async (_event, stepId: string) => {
    try {
      await fs.unlink(getCheckpointPath(kind, stepId));
      sendLog(`📡 [AgentFlow] ${logTag} checkpoint cleared for step: ${stepId}`);
      return true;
    } catch {
      return false;
    }
  });
}

export function registerFlowHandlers(ctx: IpcContext): void {
  const { flowManager } = ctx;

  ipcMain.handle(IPC.FLOW_GET_ALL, () => {
    return flowManager?.getAll() ?? [];
  });

  ipcMain.handle(IPC.FLOW_SAVE, async (_event, flow: FlowDefinition) => {
    if (!flowManager) return null;
    return flowManager.save(flow);
  });

  ipcMain.handle(IPC.FLOW_DELETE, async (_event, flowId: string) => {
    if (!flowManager) return false;
    return flowManager.delete(flowId);
  });

  ipcMain.handle(IPC.FLOW_DUPLICATE, async (_event, flowId: string) => {
    if (!flowManager) return null;
    return flowManager.duplicate(flowId);
  });

  ipcMain.handle(IPC.FLOW_MOVE, async (_event, flowId: string, direction: 'up' | 'down') => {
    if (!flowManager) return [];
    return flowManager.move(flowId, direction);
  });

  ipcMain.handle(IPC.FLOW_EXECUTE, async (_event, flowId: string) => {
    if (!flowManager) return { flowId, success: false, outputs: {}, error: 'FlowManager not available', completedSteps: 0, totalSteps: 0, completedAt: new Date().toISOString() };
    return flowManager.queueExecution(flowId);
  });

  ipcMain.handle(IPC.FLOW_EXPORT, async (_event, flow: FlowDefinition) => {
    try {
      const safeName = (flow.name ?? 'flow').replace(/[^\w\-. ]/g, '_').trim() || 'flow';
      const defaultPath = path.join(app.getPath('documents'), `${safeName}.json`);
      const result = await showSaveDialogForWin(ctx.getMainWin(), {
        defaultPath,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return false;
      const payload = { type: 'agentflow-export', version: 1, flow };
      await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf-8');
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown export error';
      sendLog(`⚠️ Failed to export flow: ${message}`);
      return false;
    }
  });

  registerCheckpointHandlers('rss', IPC.RSS_HAS_CHECKPOINT, IPC.RSS_CLEAR_CHECKPOINT, 'RSS');
  registerCheckpointHandlers('scraper', IPC.SCRAPER_HAS_CHECKPOINT, IPC.SCRAPER_CLEAR_CHECKPOINT, 'Scraper');
}
