import React from 'react';
import { Box, Group, Stack, Text, Button as MButton } from '@mantine/core';
import { Download, FolderOpen, RotateCcw, ShieldAlert, Trash2, Upload } from 'lucide-react';
import { SectionCard, GroupHeader, SectionTitle } from '../components';
import { WebDialog } from '../../../components/WebDialog';
import { TAG_SETS } from '../hooks/useSettingsNav';

export type DangerAction = 'reset' | 'clear-history' | null;

interface Props {
  dangerAction: DangerAction;
  setDangerAction: (action: DangerAction) => void;
  onConfirmDangerAction: () => Promise<void>;
  onOpenConfigDir: () => Promise<void>;
  onExportConfig: () => Promise<void>;
  onImportConfig: () => Promise<void>;
  t: (key: string) => string;
  showSection: (tags: readonly string[], category: 'system') => boolean;
  isSearching: boolean;
  sectionGap: number;
}

export const SystemSection: React.FC<Props> = ({
  dangerAction, setDangerAction, onConfirmDangerAction,
  onOpenConfigDir, onExportConfig, onImportConfig,
  t, showSection, isSearching, sectionGap,
}) => {
  const isMac = navigator.userAgent.includes('Macintosh');
  const revealLabel = isMac ? t('settings.config.reveal.mac') : t('settings.config.reveal.win');

  return (
    <Box>
      {isSearching && <GroupHeader label={t('settings.group.system')} />}

      <Box display={showSection(TAG_SETS.config, 'system') ? 'block' : 'none'}>
        <SectionCard style={{ marginBottom: sectionGap }}>
          <SectionTitle icon={<FolderOpen size={15} />} label={t('settings.config.title')} />
          <Stack gap={12}>
            <Group justify="space-between" align="center" wrap="nowrap">
              <Group gap={8} align="center" wrap="nowrap" flex={1} miw={0}>
                <Box c="dimmed">
                  <FolderOpen size={14} />
                </Box>
                <Stack gap={2}>
                  <Text fz="var(--font-size-md)" fw={600} c="var(--mantine-color-default-color)">
                    {t('settings.config.openDir')}
                  </Text>
                  <Text fz="var(--font-size-sm)" c="dimmed" lh={1.5}>
                    {t('settings.config.openDirHint')}
                  </Text>
                </Stack>
              </Group>
              <MButton
                variant="default"
                leftSection={<FolderOpen size={13} />}
                onClick={() => { void onOpenConfigDir(); }}
              >
                {revealLabel}
              </MButton>
            </Group>

            <Group justify="space-between" align="center" wrap="nowrap">
              <Stack gap={2}>
                <Text fz="var(--font-size-md)" fw={600} c="var(--mantine-color-default-color)">
                  {t('settings.config.backupRestore')}
                </Text>
              </Stack>
              <Group gap={8} wrap="nowrap">
                <MButton
                  variant="default"
                  leftSection={<Download size={13} />}
                  onClick={() => { void onExportConfig(); }}
                >
                  {t('settings.config.export')}
                </MButton>
                <MButton
                  variant="default"
                  leftSection={<Upload size={13} />}
                  onClick={() => { void onImportConfig(); }}
                >
                  {t('settings.config.import')}
                </MButton>
              </Group>
            </Group>
          </Stack>
        </SectionCard>
      </Box>

      {isSearching && <GroupHeader label={t('settings.group.danger')} />}

      <Box display={showSection(TAG_SETS.danger, 'system') ? 'block' : 'none'}>
        <SectionCard danger style={{ marginBottom: 24 }}>
          <SectionTitle icon={<ShieldAlert size={15} />} label={t('settings.danger.title')} c="var(--mantine-color-error)" />

          <Group
            justify="space-between"
            align="center"
            wrap="nowrap"
            gap={12}
            mb={12}
            pb={12}
            style={{ borderBottom: '1px solid rgba(248,81,73,0.15)' }}
          >
            <Stack gap={2} flex={1} miw={0}>
              <Text fz="var(--font-size-md)" fw={600} c="var(--mantine-color-default-color)">
                {t('settings.danger.clearHistory')}
              </Text>
              <Text fz="var(--font-size-sm)" c="dimmed" lh={1.5}>
                {t('settings.danger.clearHistoryHint')}
              </Text>
            </Stack>
            <MButton
              variant="filled"
              color="red"
              leftSection={<Trash2 size={13} />}
              style={{ flexShrink: 0 }}
              miw={96}
              onClick={() => setDangerAction('clear-history')}
            >
              {t('common.delete')}
            </MButton>
          </Group>

          <Group justify="space-between" align="center" wrap="nowrap" gap={12}>
            <Stack gap={2} flex={1} miw={0}>
              <Text fz="var(--font-size-md)" fw={600} c="var(--mantine-color-default-color)">
                {t('settings.reset')}
              </Text>
              <Text fz="var(--font-size-sm)" c="dimmed" lh={1.5}>
                {t('settings.reset.hint')}
              </Text>
            </Stack>
            <MButton
              variant="outline"
              color="red"
              leftSection={<RotateCcw size={13} />}
              style={{ flexShrink: 0 }}
              miw={96}
              onClick={() => setDangerAction('reset')}
            >
              {t('settings.reset.button')}
            </MButton>
          </Group>
        </SectionCard>
      </Box>

      <WebDialog
        open={dangerAction !== null}
        title={
          dangerAction === 'clear-history'
            ? t('settings.danger.clearHistoryTitle')
            : t('settings.danger.resetTitle')
        }
        description={
          dangerAction === 'clear-history'
            ? t('settings.danger.clearHistoryDetail')
            : t('settings.danger.resetDetail')
        }
        confirmText={
          dangerAction === 'clear-history'
            ? t('dialog.deleteAll')
            : t('settings.reset.button')
        }
        cancelText={t('dialog.cancel')}
        danger={dangerAction === 'clear-history'}
        onConfirm={onConfirmDangerAction}
        onCancel={() => setDangerAction(null)}
      />
    </Box>
  );
};
