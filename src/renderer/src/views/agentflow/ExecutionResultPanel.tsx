// per-step execution result list
import React from 'react';
import { Box, Code, Group, Stack, Text } from '@mantine/core';
import { CheckCircle2, History, XCircle } from 'lucide-react';
import { SectionCard } from '../../components/SectionCard';
import { stepHasOutput } from './StepCard';
import type { FlowExecutionLog, SkillInstance } from '../../../../shared/types';

export interface ExecutionResultPanelProps {
  steps: SkillInstance[];
  executionLogs: FlowExecutionLog[];
  t: (k: string) => string;
}

export const ExecutionResultPanel: React.FC<ExecutionResultPanelProps> = ({ steps, executionLogs, t }) => (
  <SectionCard>
    <Stack gap="sm">
      <Group gap="xs">
        <History size={16} />
        <Text fz="sm" fw={600}>{t('agentflow.execution.result')}</Text>
      </Group>
      <Stack gap="sm">
        {steps.map((step) => {
          const log = [...executionLogs].reverse().find((l) => l.stepId === step.id);
          if (!log) return null;
          return (
            <Box key={step.id}>
              <Group gap="xs" wrap="nowrap">
                {log.status === 'completed' && <CheckCircle2 size={14} color="var(--mantine-color-green-6)" />}
                {log.status === 'error' && <XCircle size={14} color="var(--mantine-color-red-6)" />}
                <Text fz="xs" fw={500}>{step.label}</Text>
                {stepHasOutput(step) && <Code fz="xs">{`{{${step.outputKey}}}`}</Code>}
              </Group>
              {log.output && <Text fz="xs" c="dimmed" mt={2} lineClamp={5} ff="monospace">{log.output}</Text>}
              {log.error && <Text fz="xs" c="red" mt={2}>{log.error}</Text>}
            </Box>
          );
        })}
      </Stack>
    </Stack>
  </SectionCard>
);
