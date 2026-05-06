// src/renderer/src/components/LogPanel.tsx
import React, { useCallback, useEffect, useRef } from 'react';
import { Box, Button, Flex, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { useAppStore } from '../store/appStore';
import { useI18nStore } from '../store/i18nStore';
import { AlertCircle, AlertTriangle, CheckCircle2, Download, Info, ScrollText, Trash2, Zap } from 'lucide-react';

type LogLevel = 'error' | 'success' | 'warning' | 'active' | 'info';

function classifyLog(msg: string): LogLevel {
  if (msg.includes('❌') || msg.includes('Error') || msg.includes('failed')) return 'error';
  if (msg.includes('✅') || msg.includes('💾') || msg.includes('📋')) return 'success';
  if (msg.includes('⚠️') || msg.includes('Warning')) return 'warning';
  if (msg.includes('⏳') || msg.includes('📤') || msg.includes('🔥') || msg.includes('⌨️')) return 'active';
  return 'info';
}

const levelColorMap: Record<LogLevel, string> = {
  error: 'var(--mantine-color-error)',
  success: 'var(--mantine-color-success)',
  warning: 'var(--mantine-color-warning)',
  active: 'var(--mantine-color-accent)',
  info: 'var(--mantine-color-dimmed)',
};

const LevelIcon: React.FC<{ level: LogLevel }> = ({ level }) => {
  const size = 11;
  const color = levelColorMap[level];
  switch (level) {
    case 'error': return <Box component="span" mt={2} style={{ flexShrink: 0 }}><AlertCircle size={size} color={color} /></Box>;
    case 'success': return <Box component="span" mt={2} style={{ flexShrink: 0 }}><CheckCircle2 size={size} color={color} /></Box>;
    case 'warning': return <Box component="span" mt={2} style={{ flexShrink: 0 }}><AlertTriangle size={size} color={color} /></Box>;
    case 'active': return <Box component="span" mt={2} style={{ flexShrink: 0 }}><Zap size={size} color={color} /></Box>;
    default: return <Box component="span" mt={2} style={{ flexShrink: 0 }}><Info size={size} color={color} /></Box>;
  }
};

const LogEntry = React.memo<{ log: string; index: number }>(({ log, index }) => {
  const level = classifyLog(log);
  return (
    <Flex
      align="flex-start"
      gap={7}
      px={6}
      py={3}
      bg={index % 2 !== 0 ? 'rgba(255,255,255,0.02)' : undefined}
      style={{ borderRadius: 'var(--mantine-radius-sm)' }}
    >
      <LevelIcon level={level} />
      <Text
        component="span"
        size="sm"
        c={levelColorMap[level]}
        lh={1.6}
        style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', flex: 1 }}
      >
        {log}
      </Text>
    </Flex>
  );
});

export const LogPanel: React.FC = () => {
  const { logs, clearLogs } = useAppStore();
  const { t } = useI18nStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const handleClear = useCallback(() => clearLogs(), [clearLogs]);

  const handleExport = useCallback(() => {
    const content = logs.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `dac-logs-${now}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <Stack gap={0} h="100%" style={{ overflow: 'hidden' }}>
      <Group
        gap={8}
        px={16}
        py={8}
        bg="var(--mantine-color-default)"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
      >
        <ScrollText size={13} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
        <Text fz="var(--font-size-base)" fw={700} c="var(--mantine-color-text)" lts="-0.01em" flex={1}>{t('log.title')}</Text>
        <Text fz="var(--font-size-sm)" c="dimmed">{logs.length} {t('log.entries')}</Text>
        <Button variant="default" size="compact-xs" onClick={handleClear} leftSection={<Trash2 size={11} />}>
          {t('log.clear')}
        </Button>
        <Button
          variant="default"
          size="compact-xs"
          onClick={handleExport}
          disabled={logs.length === 0}
          leftSection={<Download size={11} />}
        >
          {t('log.export')}
        </Button>
      </Group>

      <ScrollArea
        flex={1}
        bg="var(--mantine-color-body)"
        px={14}
        py={10}
        ff="var(--font-mono)"
        fz="var(--font-size-sm)"
      >
        {logs.length === 0 ? (
          <Stack align="center" justify="center" gap={8} pt={40} c="dimmed" opacity={0.6}>
            <ScrollText size={28} />
            <Text fz="var(--font-size-base)">{t('log.empty')}</Text>
          </Stack>
        ) : (
          <Stack gap={2}>
            {logs.map((log, i) => (
              <LogEntry key={i} log={log} index={i} />
            ))}
            <Box ref={bottomRef} />
          </Stack>
        )}
      </ScrollArea>
    </Stack>
  );
};


