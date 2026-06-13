// shared filesystem paths for AgentFlow data.
//
// Centralizes the "userData when packaged, cwd otherwise" base directory and the
// flow-checkpoints path convention, previously duplicated across flowExecutor,
// flowManager and ipcHandlers.

import { app } from 'electron';
import * as path from 'node:path';

/** Base directory for persisted AgentFlow data (flows.json, checkpoints, …). */
export function getFlowDataDir(): string {
  return app.isPackaged ? app.getPath('userData') : path.resolve('.');
}

/** Resolves the on-disk path for a per-step RSS/scraper checkpoint file. */
export function getCheckpointPath(kind: 'rss' | 'scraper', stepId: string): string {
  return path.join(getFlowDataDir(), 'flow-checkpoints', `${kind}-${stepId}.json`);
}
