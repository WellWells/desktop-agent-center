import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button as MButton, Flex, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { useAppStore } from '../store/appStore';
import { useI18nStore } from '../store/i18nStore';
import { useUpdateStore } from '../store/useUpdateStore';
import type { View } from '../store/appStore';
import { Info, ListOrdered, LoaderCircle, MessageSquare, Minus, Plus, ScrollText, Settings, X } from 'lucide-react';

// ─── Brand icon mark ───────────────────────────────────────────────────────────
// Renders the app icon PNG loaded at runtime via IPC.
// Reserves a fixed-size slot while loading to prevent layout shift.
const BrandIcon: React.FC<{ dataUrl: string }> = ({ dataUrl }) => {
  if (!dataUrl) {
    return (
      <Box
        component="span"
        aria-hidden="true"
        w={18}
        h={18}
        style={{ display: 'inline-block', flexShrink: 0 }}
      />
    );
  }
  return (
    <Box
      component="img"
      src={dataUrl}
      w={18}
      h={18}
      draggable={false}
      aria-hidden="true"
      style={{ borderRadius: 4, flexShrink: 0, objectFit: 'contain' }}
    />
  );
};

// ─── Module-level statics (computed once, never change) ────────────────────────────
const noDrag: React.CSSProperties = { WebkitAppRegion: 'no-drag' };
const navigatorWithUserAgentData = navigator as Navigator & { userAgentData?: { platform?: string } };
const isMac = (navigatorWithUserAgentData.userAgentData?.platform ?? navigator.platform ?? '').toLowerCase().includes('mac');

function doWindowAction(action: 'minimize' | 'maximize' | 'close'): void {
  if (action === 'minimize') { window.electronAPI.minimizeWindow(); return; }
  if (action === 'maximize') { window.electronAPI.maximizeWindow(); return; }
  window.electronAPI.closeWindow();
}

function getWindowActionTitle(t: (k: string) => string, action: 'minimize' | 'maximize' | 'close'): string {
  if (action === 'minimize') return t('window.minimize');
  if (action === 'maximize') return t('window.maximize');
  return t('window.close');
}

const macWindowButtonDefs: Array<{ action: 'close' | 'minimize' | 'maximize'; color: string; icon: React.ReactNode }> = [
  { action: 'close', color: '#ff5f57', icon: <X size={9} strokeWidth={2.3} /> },
  { action: 'minimize', color: '#febc2e', icon: <Minus size={9} strokeWidth={2.3} /> },
  { action: 'maximize', color: '#28c840', icon: <Plus size={9} strokeWidth={2.3} /> },
];

const windowsMaximizeIcon = (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <rect x="1.25" y="1.25" width="7.5" height="7.5" fill="none" stroke="currentColor" strokeWidth="1.2" shapeRendering="crispEdges" />
  </svg>
);

// Mac window controls — group hover tracked via state to reveal icon opacity
const MacWindowControls = React.memo<{ t: (k: string) => string }>(({ t }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <Group
      gap={8}
      mr={10}
      ml={6}
      align="center"
      style={{ ...noDrag, display: 'inline-flex', flexShrink: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {macWindowButtonDefs.map((btn) => (
        <UnstyledButton
          key={btn.action}
          onClick={() => doWindowAction(btn.action)}
          title={getWindowActionTitle(t, btn.action)}
          style={{
            width: 12, height: 12,
            borderRadius: '50%',
            background: btn.color,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(0,0,0,0.58)',
            cursor: 'pointer',
            border: 'none',
            flexShrink: 0,
          }}
        >
          <Box
            component="span"
            style={{ opacity: hovered ? 1 : 0, display: 'inline-flex', transition: 'opacity 0.1s' }}
          >
            {btn.icon}
          </Box>
        </UnstyledButton>
      ))}
    </Group>
  );
});

// Windows window controls — hover tracked via state since UnstyledButton has no built-in hover color
const WindowsControls = React.memo<{ t: (k: string) => string }>(({ t }) => {
  const [hoveredBtn, setHoveredBtn] = useState<'minimize' | 'maximize' | 'close' | null>(null);
  return (
    <Group
      gap={0}
      align="stretch"
      style={{ ...noDrag, display: 'inline-flex', alignSelf: 'stretch', height: '100%' }}
    >
      <UnstyledButton
        onClick={() => doWindowAction('minimize')}
        title={getWindowActionTitle(t, 'minimize')}
        onMouseEnter={() => setHoveredBtn('minimize')}
        onMouseLeave={() => setHoveredBtn(null)}
        style={{
          width: 46, height: '100%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 0, transition: 'background 0.1s, color 0.1s',
          background: hoveredBtn === 'minimize' ? 'var(--mantine-color-bg-tertiary)' : 'transparent',
          color: hoveredBtn === 'minimize' ? 'var(--mantine-color-text)' : 'var(--mantine-color-dimmed)',
        }}
      >
        <Minus size={14} strokeWidth={2.1} />
      </UnstyledButton>
      <UnstyledButton
        onClick={() => doWindowAction('maximize')}
        title={getWindowActionTitle(t, 'maximize')}
        onMouseEnter={() => setHoveredBtn('maximize')}
        onMouseLeave={() => setHoveredBtn(null)}
        style={{
          width: 46, height: '100%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 0, transition: 'background 0.1s, color 0.1s',
          background: hoveredBtn === 'maximize' ? 'var(--mantine-color-bg-tertiary)' : 'transparent',
          color: hoveredBtn === 'maximize' ? 'var(--mantine-color-text)' : 'var(--mantine-color-dimmed)',
        }}
      >
        {windowsMaximizeIcon}
      </UnstyledButton>
      <UnstyledButton
        onClick={() => doWindowAction('close')}
        title={getWindowActionTitle(t, 'close')}
        onMouseEnter={() => setHoveredBtn('close')}
        onMouseLeave={() => setHoveredBtn(null)}
        style={{
          width: 46, height: '100%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 0, transition: 'background 0.1s, color 0.1s',
          background: hoveredBtn === 'close' ? '#e81123' : 'transparent',
          color: hoveredBtn === 'close' ? '#fff' : 'var(--mantine-color-dimmed)',
        }}
      >
        <X size={14} strokeWidth={2.1} />
      </UnstyledButton>
    </Group>
  );
});

export const TitleBar: React.FC = () => {
  const { currentView, setView, status, queue } = useAppStore();
  const { t, locale } = useI18nStore();
  const hasUpdate = useUpdateStore((state) => state.hasUpdate);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  const [queuePopoverOpen, setQueuePopoverOpen] = useState(false);
  const [cancelingTaskIds, setCancelingTaskIds] = useState<Record<string, boolean>>({});
  const [appIconDataUrl, setAppIconDataUrl] = useState('');
  const queuePopoverCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    window.electronAPI.getAppIconDataUrl().then(setAppIconDataUrl).catch(() => { });
  }, []);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => () => {
    if (queuePopoverCloseTimerRef.current) {
      window.clearTimeout(queuePopoverCloseTimerRef.current);
    }
  }, []);

  const isTight = windowWidth <= 760;
  const navItems = useMemo(() => [
    { id: 'chat' as View, label: t('nav.chat'), icon: <MessageSquare size={13} /> },
    { id: 'settings' as View, label: t('nav.settings'), icon: <Settings size={13} /> },
    { id: 'logs' as View, label: t('nav.logs'), icon: <ScrollText size={13} /> },
    { id: 'about' as View, label: t('nav.about'), icon: <Info size={13} /> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [locale]); // locale changes trigger re-translation; t is stable
  const isProcessing = status === 'processing';
  const hasQueueItems = queue.total > 0;
  const queuePending = Math.max(queue.total - queue.current, 0);

  useEffect(() => {
    if (!hasQueueItems) {
      setQueuePopoverOpen(false);
    }
  }, [hasQueueItems]);

  const openQueuePopover = (): void => {
    if (!hasQueueItems) return;
    if (queuePopoverCloseTimerRef.current) {
      window.clearTimeout(queuePopoverCloseTimerRef.current);
      queuePopoverCloseTimerRef.current = null;
    }
    setQueuePopoverOpen(true);
  };

  const closeQueuePopoverSoon = (): void => {
    if (queuePopoverCloseTimerRef.current) {
      window.clearTimeout(queuePopoverCloseTimerRef.current);
    }
    queuePopoverCloseTimerRef.current = window.setTimeout(() => {
      setQueuePopoverOpen(false);
      queuePopoverCloseTimerRef.current = null;
    }, 140);
  };

  const handleCancelQueueTask = useCallback(async (taskId: string): Promise<void> => {
    setCancelingTaskIds((prev) => ({ ...prev, [taskId]: true }));
    try {
      await window.electronAPI.cancelQueueTask(taskId);
    } finally {
      setCancelingTaskIds((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
    }
  }, []);

  const statusLabel = hasQueueItems
    ? isProcessing
      ? `${t('status.processing')} ${queue.current}/${queue.total}`
      : `${t('status.queuePending')}: ${queuePending}`
    : t('status.ready');

  const statusColor = hasQueueItems
    ? isProcessing ? 'var(--mantine-color-warning)' : 'var(--mantine-color-accent)'
    : 'var(--mantine-color-success)';

  const statusBackground = hasQueueItems
    ? isProcessing ? 'rgba(210,153,34,0.14)' : 'var(--mantine-color-accent-dim)'
    : 'rgba(63,185,80,0.14)';

  const statusBorder = hasQueueItems
    ? isProcessing ? 'rgba(210,153,34,0.32)' : 'rgba(56,139,253,0.35)'
    : 'rgba(63,185,80,0.32)';

  return (
    <Flex
      h={48}
      bg="var(--mantine-color-default)"
      align="center"
      style={{
        borderBottom: '1px solid var(--mantine-color-default-border)',
        flexShrink: 0,
        userSelect: 'none',
        padding: isMac ? '0 10px' : '0 0 0 10px',
        WebkitAppRegion: 'drag' as React.CSSProperties['WebkitAppRegion'],
        gap: 0,
      } as React.CSSProperties}
    >
      {isMac && <MacWindowControls t={t} />}

      <Group gap={7} px={10} style={{ flexShrink: 0 }}>
        <BrandIcon dataUrl={appIconDataUrl} />
        <Text component="span" fw={700} fz="var(--font-size-md)" c="var(--mantine-color-accent)" lts="0.2px">Desktop Agent Center</Text>
      </Group>

      <Flex gap={isTight ? 4 : 8} style={noDrag}>
        {navItems.map((item) => (
          <Box key={item.id} pos="relative" style={{ display: 'inline-flex' }}>
            <MButton
              onClick={() => setView(item.id)}
              variant={currentView === item.id ? 'filled' : 'subtle'}
              color={currentView === item.id ? undefined : 'gray'}
              size="compact-xs"
              radius={isTight ? 999 : 'xl'}
              leftSection={!isTight ? item.icon : undefined}
              style={{
                '--button-hover': currentView !== item.id ? 'var(--mantine-color-default-hover)' : undefined,
                padding: isTight ? '0' : '6px 12px',
                height: isTight ? 32 : 33,
                width: isTight ? 32 : undefined,
                minWidth: isTight ? 32 : undefined,
                flexShrink: 0,
              } as React.CSSProperties}
            >
              {isTight ? item.icon : item.label}
            </MButton>
            {item.id === 'settings' && hasUpdate && (
              <Box
                pos="absolute"
                top={4}
                right={4}
                w={7}
                h={7}
                bg="var(--mantine-color-orange-6)"
                style={{ borderRadius: '50%', pointerEvents: 'none', zIndex: 1 }}
              />
            )}
          </Box>
        ))}
      </Flex>

      <Box flex={1} miw={4} />

      <Box
        style={{ ...noDrag, position: 'relative', marginRight: 6, flexShrink: 0 }}
        onMouseEnter={openQueuePopover}
        onMouseLeave={closeQueuePopoverSoon}
      >
        <Group
          gap={6}
          fz="var(--font-size-sm)"
          fw={600}
          style={{
            padding: '0 12px',
            height: 32,
            borderRadius: 16,
            background: statusBackground,
            color: statusColor,
            border: `1px solid ${statusBorder}`,
            cursor: hasQueueItems ? 'pointer' : 'default',
            flexShrink: 0,
          }}
        >
          <Box
            component="span"
            style={{
              width: 7, height: 7,
              borderRadius: '50%',
              background: statusColor,
              boxShadow: `0 0 6px ${statusColor}`,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          {hasQueueItems && <ListOrdered size={12} />}
          {!isTight && statusLabel}
        </Group>

        {queuePopoverOpen && hasQueueItems && (
          <Box
            pos="absolute"
            top="100%"
            right={0}
            w={340}
            mah={320}
            bg="var(--mantine-color-default)"
            style={{
              overflow: 'hidden',
              zIndex: 220,
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-sm)',
              boxShadow: 'var(--shadow-md)',
            }}
            onMouseEnter={openQueuePopover}
            onMouseLeave={closeQueuePopoverSoon}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <Text
              p="10px 12px 8px"
              fz="var(--font-size-base)"
              c="var(--mantine-color-text)"
              fw={700}
              style={{ borderBottom: '1px solid var(--mantine-color-default-border)', display: 'block' }}
            >
              {t('queue.panel.title')}
            </Text>
            <Box mah={270} p={8} style={{ overflowY: 'auto' }}>
              {queue.items.map((item) => {
                const isRunningItem = item.status === 'running';
                const isCanceling = Boolean(cancelingTaskIds[item.id]);
                return (
                  <Stack
                    key={`${item.status}-${item.id}`}
                    gap={6}
                    p="8px 9px"
                    bg="var(--mantine-color-bg-tertiary)"
                    mb={6}
                    style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-xs)' }}
                  >
                    <Group justify="space-between" gap={8}>
                      <Text
                        component="span"
                        fz="var(--font-size-sm)"
                        ff="var(--font-mono)"
                        fw={600}
                        c={isRunningItem ? 'var(--mantine-color-warning)' : 'dimmed'}
                      >
                        {isRunningItem
                          ? t('queue.item.running')
                          : t('queue.item.queued')} #{item.id}
                      </Text>
                      {isRunningItem ? (
                        <Text component="span" fz="var(--font-size-sm)" c="var(--mantine-color-warning)" fw={600}>
                          {t('queue.running')}
                        </Text>
                      ) : (
                        <MButton
                          onClick={() => { void handleCancelQueueTask(item.id); }}
                          disabled={isCanceling}
                          variant="default"
                          size="compact-xs"
                          color="red"
                          leftSection={isCanceling ? <LoaderCircle size={11} /> : <X size={11} />}
                        >
                          {isCanceling ? t('queue.canceling') : t('queue.cancel')}
                        </MButton>
                      )}
                    </Group>
                    <Text
                      title={item.promptSummary}
                      fz="var(--font-size-base)"
                      c="var(--mantine-color-default-color)"
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {item.promptSummary}
                    </Text>
                  </Stack>
                );
              })}
            </Box>
          </Box>
        )}
      </Box>

      {!isMac && <WindowsControls t={t} />}
    </Flex>
  );
};


