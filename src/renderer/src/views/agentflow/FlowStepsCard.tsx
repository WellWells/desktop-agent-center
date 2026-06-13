// steps section with nesting guidelines
import React, { useMemo } from 'react';
import { Box, Code, Flex, Stack, Text } from '@mantine/core';
import { BookOpen, ChevronRight } from 'lucide-react';
import { SectionCard } from '../../components/SectionCard';
import { StepCard, stepHasOutput } from './StepCard';
import { AddStepMenu } from './AddStepMenu';
import type { FlowDefinition, SkillType } from '../../../../shared/types';

export interface FlowStepsCardProps {
  flow: FlowDefinition;
  t: (k: string) => string;
  onAddStep: (type: SkillType) => void;
}

export const FlowStepsCard: React.FC<FlowStepsCardProps> = ({ flow, t, onAddStep }) => {
  const nestingLevels = useMemo(() => {
    let currentLevel = 0;
    const levels: number[] = [];
    for (let i = 0; i < flow.steps.length; i++) {
      const type = flow.steps[i].type;
      if (type === 'end_loop' || type === 'end_if') {
        levels.push(currentLevel);
        currentLevel = Math.max(0, currentLevel - 1);
      } else {
        levels.push(currentLevel);
        if (type === 'loop' || type === 'if') {
          currentLevel++;
        }
      }
    }
    return levels;
  }, [flow.steps]);

  return (
    <SectionCard>
      <Stack gap="sm">
        <Text fw={600} fz="sm" c="var(--mantine-color-default-color)">{t('agentflow.steps')}</Text>
        {flow.steps.length === 0 ? (
          <Box
            p="xl"
            style={{
              background: 'var(--mantine-color-bg-tertiary)',
              borderRadius: 'var(--mantine-radius-md)',
              border: '1px dashed var(--mantine-color-default-border)',
              textAlign: 'center',
            }}
          >
            <Stack align="center" gap="sm">
              <BookOpen size={32} color="var(--mantine-color-dimmed)" />
              <Text c="dimmed" fz="sm">{t('agentflow.steps.empty')}</Text>
              <AddStepMenu position="top" t={t} onAdd={onAddStep} />
            </Stack>
          </Box>
        ) : (
          <Stack gap="sm">
            {flow.steps.map((step, index) => {
              const level = nestingLevels[index] ?? 0;
              const prevLevel = index > 0 ? (nestingLevels[index - 1] ?? 0) : 0;
              const indentPx = level * 24;
              const loopVars: string[] = [];
              {
                const loopStack: string[] = [];
                for (let k = 0; k < index; k++) {
                  if (flow.steps[k].type === 'loop') {
                    loopStack.push(flow.steps[k].config.loopVar || 'item');
                  } else if (flow.steps[k].type === 'end_loop') {
                    loopStack.pop();
                  }
                }
                loopVars.push(...loopStack);
              }
              return (
                <Box key={step.id} style={{ position: 'relative' }}>
                  {/* Render guidelines for this step */}
                  {Array.from({ length: level }).map((_, lIdx) => (
                    <Box
                      key={lIdx}
                      style={{
                        position: 'absolute',
                        left: `${(lIdx + 0.5) * 24}px`,
                        top: 0,
                        bottom: 0,
                        width: '2px',
                        borderLeft: '2px dashed var(--mantine-color-teal-filled)',
                        opacity: 0.6,
                        zIndex: 1,
                      }}
                    />
                  ))}

                  {index > 0 && (
                    <Flex direction="column" align="center" py={2} gap={2} style={{ position: 'relative' }}>
                      {/* Separator nesting guidelines */}
                      {Array.from({ length: Math.min(level, prevLevel) }).map((_, lIdx) => (
                        <Box
                          key={lIdx}
                          style={{
                            position: 'absolute',
                            left: `${(lIdx + 0.5) * 24}px`,
                            top: 0,
                            bottom: 0,
                            width: '2px',
                            borderLeft: '2px dashed var(--mantine-color-teal-filled)',
                            opacity: 0.6,
                            zIndex: 1,
                          }}
                        />
                      ))}

                      <Box style={{ paddingLeft: `${Math.max(level, prevLevel) * 24}px`, zIndex: 2 }}>
                        <Flex direction="column" align="center" gap={2}>
                          {stepHasOutput(flow.steps[index - 1]) && (
                            <Code fz="xs" c="dimmed">{`{{${flow.steps[index - 1].outputKey}}}`}</Code>
                          )}
                          <ChevronRight size={14} color="var(--mantine-color-dimmed)" style={{ transform: 'rotate(90deg)' }} />
                        </Flex>
                      </Box>
                    </Flex>
                  )}

                  <Box style={{ paddingLeft: `${indentPx}px`, zIndex: 2, position: 'relative' }}>
                    <StepCard
                      step={step}
                      index={index}
                      total={flow.steps.length}
                      flowId={flow.id}
                      prevSteps={flow.steps.slice(0, index).filter(stepHasOutput)}
                      flowTrigger={flow.trigger}
                      loopVars={loopVars}
                      t={t}
                    />
                  </Box>
                </Box>
              );
            })}
            <AddStepMenu position="bottom" t={t} onAdd={onAddStep} />
          </Stack>
        )}
      </Stack>
    </SectionCard>
  );
};
