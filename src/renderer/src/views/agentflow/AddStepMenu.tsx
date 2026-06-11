// src/renderer/src/views/agentflow/AddStepMenu.tsx — categorized "add step" dropdown menu
import React, { useMemo } from 'react';
import { Button, Menu, SimpleGrid, Stack, Text } from '@mantine/core';
import { Plus } from 'lucide-react';
import { SKILL_ICON } from './skills';
import type { SkillType } from '../../../../shared/types';

export interface AddStepMenuProps {
  position?: 'top' | 'bottom';
  t: (k: string) => string;
  onAdd: (type: SkillType) => void;
}

export const AddStepMenu: React.FC<AddStepMenuProps> = ({ position = 'bottom', t, onAdd }) => {
  const categorizedSkills = useMemo(() => [
    {
      category: t('agentflow.category.extraction'),
      items: ['scraper', 'browser', 'rss'] as SkillType[],
    },
    {
      category: t('agentflow.category.control'),
      items: ['loop', 'if', 'stop'] as SkillType[],
    },
    {
      category: t('agentflow.category.actions'),
      items: ['llm', 'bot', 'clipboard'] as SkillType[],
    },
    {
      category: t('agentflow.category.tools'),
      items: ['shell', 'utility', 'comment'] as SkillType[],
    },
  ], [t]);

  return (
    <Menu position={position} withArrow shadow="md">
      <Menu.Target>
        <Button
          variant={position === 'top' ? 'light' : 'default'}
          size="sm"
          leftSection={<Plus size={14} />}
          fullWidth={position === 'bottom'}
          style={position === 'bottom' ? { borderStyle: 'dashed' } : undefined}
        >
          {t('agentflow.addStep')}
        </Button>
      </Menu.Target>
      <Menu.Dropdown p="xs" style={{ width: 440 }}>
        <SimpleGrid cols={2} spacing="xs" verticalSpacing="md">
          {categorizedSkills.map((cat) => (
            <Stack key={cat.category} gap={4}>
              <Text
                size="xs"
                fw={700}
                c="dimmed"
                px={8}
                py={4}
                style={{ letterSpacing: '0.5px', textTransform: 'uppercase' }}
              >
                {cat.category}
              </Text>
              {cat.items.map((type) => (
                <Menu.Item
                  key={type}
                  leftSection={SKILL_ICON[type]}
                  onClick={() => onAdd(type)}
                  style={{ height: 32 }}
                >
                  {t(`agentflow.skill.${type}`)}
                </Menu.Item>
              ))}
            </Stack>
          ))}
        </SimpleGrid>
      </Menu.Dropdown>
    </Menu>
  );
};
