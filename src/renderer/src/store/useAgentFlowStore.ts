// AgentFlow Zustand store
import { create } from 'zustand';
import { useI18nStore } from './i18nStore';
import type {
  FlowDefinition,
  FlowExecutionLog,
  FlowExecutionResult,
  SkillInstance,
  SkillType,
  TriggerConfig,
} from '../../../shared/types';
import { flowApi } from '../api/electronApi';
import { cloneFlow, createDefaultFlow, createDefaultStep, createId, findMatchingMarker } from './flowHelpers';

interface ActionState {
  flows: FlowDefinition[];
  savedFlows: Record<string, FlowDefinition>;
  selectedFlowId: string | null;
  executionLogs: FlowExecutionLog[];
  executionResult: FlowExecutionResult | null;
  isExecuting: boolean;
  runningFlowIds: string[];

  // Actions
  loadFlows: () => Promise<void>;
  selectFlow: (flowId: string | null) => void;
  createFlow: () => Promise<void>;
  updateFlow: (flow: FlowDefinition) => void;
  saveFlow: (flow: FlowDefinition) => Promise<void>;
  deleteFlow: (flowId: string) => Promise<void>;
  duplicateFlow: (flowId: string) => Promise<FlowDefinition | null>;
  moveFlow: (flowId: string, direction: 'up' | 'down') => Promise<boolean>;
  executeFlow: (flowId: string) => Promise<FlowExecutionResult | null>;
  restoreFlow: (flowId: string) => void;
  addStep: (flowId: string, type?: SkillType) => void;
  removeStep: (flowId: string, stepId: string) => void;
  updateStep: (flowId: string, stepId: string, patch: Partial<SkillInstance>) => void;
  moveStep: (flowId: string, stepId: string, direction: 'up' | 'down') => void;
  updateTrigger: (flowId: string, trigger: TriggerConfig) => void;
  appendExecutionLog: (log: FlowExecutionLog) => void;
  clearExecutionLogs: () => void;
  markFlowRunning: (flowId: string) => void;
  markFlowDone: (flowId: string) => void;
  importFlows: (flows: FlowDefinition[]) => Promise<void>;
}

export const useAgentFlowStore = create<ActionState>((set, get) => ({
  flows: [],
  savedFlows: {},
  selectedFlowId: null,
  executionLogs: [],
  executionResult: null,
  isExecuting: false,
  runningFlowIds: [],

  loadFlows: async () => {
    const flows = await flowApi.getAll();
    const savedFlows = Object.fromEntries(flows.map((flow) => [flow.id, cloneFlow(flow)]));
    set({ flows, savedFlows });
  },

  selectFlow: (flowId) => {
    set({ selectedFlowId: flowId, executionLogs: [], executionResult: null });
  },

  createFlow: async () => {
    const t = useI18nStore.getState().t;
    const flow = createDefaultFlow(t);
    // Optimistic update: show the flow immediately so the user sees it at once
    // and any concurrent operations (e.g. moveFlow) do not lose it.
    set((state) => ({
      flows: [...state.flows, flow],
      selectedFlowId: flow.id,
      executionLogs: [],
    }));
    // Persist to disk; update local entry with the server-confirmed copy.
    const saved = await flowApi.save(flow);
    if (saved) {
      set((state) => ({
        flows: state.flows.map((f) => (f.id === saved.id ? saved : f)),
        savedFlows: {
          ...state.savedFlows,
          [saved.id]: cloneFlow(saved),
        },
      }));
    }
  },

  updateFlow: (flow) => {
    set((state) => ({
      flows: state.flows.map((f) => (f.id === flow.id ? flow : f)),
    }));
  },

  saveFlow: async (flow) => {
    const saved = await flowApi.save(flow);
    if (saved) {
      set((state) => ({
        flows: state.flows.map((f) => (f.id === saved.id ? saved : f)),
        savedFlows: {
          ...state.savedFlows,
          [saved.id]: cloneFlow(saved),
        },
      }));
    }
  },

  deleteFlow: async (flowId) => {
    await flowApi.deleteFlow(flowId);
    set((state) => ({
      flows: state.flows.filter((f) => f.id !== flowId),
      selectedFlowId: state.selectedFlowId === flowId ? null : state.selectedFlowId,
      savedFlows: Object.fromEntries(Object.entries(state.savedFlows).filter(([id]) => id !== flowId)),
    }));
  },

  duplicateFlow: async (flowId) => {
    const duplicated = await flowApi.duplicateFlow(flowId);
    if (!duplicated) return null;
    set((state) => {
      const sourceIndex = state.flows.findIndex((f) => f.id === flowId);
      const nextFlows = [...state.flows];
      const insertAt = sourceIndex >= 0 ? sourceIndex + 1 : nextFlows.length;
      nextFlows.splice(insertAt, 0, duplicated);
      return {
        flows: nextFlows,
        selectedFlowId: duplicated.id,
        savedFlows: {
          ...state.savedFlows,
          [duplicated.id]: cloneFlow(duplicated),
        },
      };
    });
    return duplicated;
  },

  moveFlow: async (flowId, direction) => {
    const moved = await flowApi.moveFlow(flowId, direction);
    if (!Array.isArray(moved) || moved.length === 0) return false;
    const savedFlows = Object.fromEntries(moved.map((flow) => [flow.id, cloneFlow(flow)]));
    set((state) => ({
      flows: moved,
      selectedFlowId: state.selectedFlowId,
      savedFlows,
    }));
    return true;
  },

  executeFlow: async (flowId) => {
    set((state) => ({ isExecuting: true, executionLogs: [], executionResult: null, runningFlowIds: [...state.runningFlowIds.filter((id) => id !== flowId), flowId] }));
    try {
      const result = await flowApi.execute(flowId);
      set({ executionResult: result });
      return result;
    } finally {
      set((state) => ({ isExecuting: false, runningFlowIds: state.runningFlowIds.filter((id) => id !== flowId) }));
    }
  },

  restoreFlow: (flowId) => {
    const saved = get().savedFlows[flowId];
    if (!saved) return;
    set((state) => ({
      flows: state.flows.map((f) => (f.id === flowId ? cloneFlow(saved) : f)),
    }));
  },

  addStep: (flowId, type = 'shell') => {
    const t = useI18nStore.getState().t;
    const flow = get().flows.find(f => f.id === flowId);
    const sameTypeCount = flow?.steps.filter(s => s.type === type).length ?? 0;
    // Block openers and end markers carry no reusable output key.
    const isMarker = type === 'if' || type === 'end_if' || type === 'end_loop';
    const step = createDefaultStep(type, isMarker ? undefined : `${type}_${sameTypeCount + 1}`, t);
    // Auto-populate previous array variable if type is 'loop'
    if (type === 'loop' && flow && flow.steps.length > 0) {
      const lastOutputStep = [...flow.steps].reverse().find(s => {
        if (s.type === 'clipboard' || s.type === 'bot' || s.type === 'comment' || s.type === 'loop') return false;
        if (s.type === 'utility') return s.config.action === 'export';
        return true;
      });
      if (lastOutputStep) {
        step.config.input = `{{${lastOutputStep.outputKey}}}`;
      }
    }
    // Block-opening skills auto-create their matching end marker so blocks stay balanced.
    const newSteps: SkillInstance[] = [step];
    if (type === 'loop') newSteps.push(createDefaultStep('end_loop', undefined, t));
    else if (type === 'if') newSteps.push(createDefaultStep('end_if', undefined, t));
    set((state) => ({
      flows: state.flows.map((f) => {
        if (f.id !== flowId) return f;
        const steps = [...f.steps];
        // If the flow currently ends with a block-end marker, insert the new step(s)
        // just before it so steps added after a loop/if land inside that block.
        const last = steps[steps.length - 1];
        const insertAt = last && (last.type === 'end_loop' || last.type === 'end_if') ? steps.length - 1 : steps.length;
        steps.splice(insertAt, 0, ...newSteps);
        return { ...f, steps };
      }),
    }));
    // Auto-save immediately so the new step persists if the flow is moved
    // before the user manually triggers a save.
    const updatedFlow = get().flows.find(f => f.id === flowId);
    if (updatedFlow) void get().saveFlow(updatedFlow);
  },

  removeStep: (flowId, stepId) => {
    set((state) => ({
      flows: state.flows.map((f) => {
        if (f.id !== flowId) return f;
        const idx = f.steps.findIndex((s) => s.id === stepId);
        if (idx === -1) return f;
        // Removing a block marker also removes its matching marker (delete the whole block).
        const removeIds = new Set<string>([stepId]);
        const matchIdx = findMatchingMarker(f.steps, idx);
        if (matchIdx !== -1) removeIds.add(f.steps[matchIdx].id);
        return { ...f, steps: f.steps.filter((s) => !removeIds.has(s.id)) };
      }),
    }));
  },

  updateStep: (flowId, stepId, patch) => {
    set((state) => ({
      flows: state.flows.map((f) =>
        f.id === flowId
          ? {
              ...f,
              steps: f.steps.map((s) =>
                s.id === stepId ? { ...s, ...patch } : s,
              ),
            }
          : f,
      ),
    }));
  },

  moveStep: (flowId, stepId, direction) => {
    set((state) => ({
      flows: state.flows.map((f) => {
        if (f.id !== flowId) return f;
        const idx = f.steps.findIndex((s) => s.id === stepId);
        if (idx < 0) return f;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= f.steps.length) return f;
        const steps = [...f.steps];
        [steps[idx], steps[targetIdx]] = [steps[targetIdx], steps[idx]];
        return { ...f, steps };
      }),
    }));
  },

  updateTrigger: (flowId, trigger) => {
    set((state) => ({
      flows: state.flows.map((f) =>
        f.id === flowId ? { ...f, trigger } : f,
      ),
    }));
  },

  appendExecutionLog: (log) => {
    set((state) => ({
      // Cap at 500 entries to prevent unbounded memory growth in long-running sessions.
      executionLogs: [...state.executionLogs.slice(-499), log],
    }));
  },

  clearExecutionLogs: () => {
    set({ executionLogs: [] });
  },

  markFlowRunning: (flowId) => {
    set((state) => ({
      runningFlowIds: state.runningFlowIds.includes(flowId)
        ? state.runningFlowIds
        : [...state.runningFlowIds, flowId],
    }));
  },

  markFlowDone: (flowId) => {
    set((state) => ({
      runningFlowIds: state.runningFlowIds.filter((id) => id !== flowId),
    }));
  },

  importFlows: async (incoming) => {
    const existingNames = new Set(get().flows.map((f) => f.name));
    const preparedFlows: FlowDefinition[] = [];

    for (const raw of incoming) {
      const id = createId();
      let name = raw.name ?? 'Imported Flow';
      if (existingNames.has(name)) {
        name = `${name} Copy`;
      }
      existingNames.add(name);
      preparedFlows.push({
        ...raw,
        id,
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Single state update for all prepared flows (avoids N re-renders)
    const lastFlow = preparedFlows[preparedFlows.length - 1];
    set((state) => ({
      flows: [...state.flows, ...preparedFlows],
      selectedFlowId: lastFlow?.id ?? state.selectedFlowId,
      executionLogs: [],
    }));

    // Persist all flows in parallel, then batch-update saved snapshots
    const savedResults = await Promise.all(
      preparedFlows.map((flow) => flowApi.save(flow)),
    );
    const savedMap: Record<string, FlowDefinition> = {};
    const savedFlowsById: Record<string, FlowDefinition> = {};
    for (const saved of savedResults) {
      if (saved) {
        savedMap[saved.id] = saved;
        savedFlowsById[saved.id] = cloneFlow(saved);
      }
    }
    set((state) => ({
      flows: state.flows.map((f) => savedMap[f.id] ?? f),
      savedFlows: { ...state.savedFlows, ...savedFlowsById },
    }));
  },
}));
