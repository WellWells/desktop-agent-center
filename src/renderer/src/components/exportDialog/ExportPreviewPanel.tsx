// right preview column of ExportDialog
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Box, Group, Stack, Text } from '@mantine/core';
import { Clock3, Cpu } from 'lucide-react';
import type { MarkdownCapturePayload } from '../../../../shared/types';
import { REHYPE_PLUGINS } from '../../utils/shikiPlugins';
import { SharedCodeBlock, SharedPreBlock, remarkPlugins } from '../../utils/markdownConfig';
import { SectionLabel } from './SectionLabel';

export interface ExportPreviewPanelProps {
  background: string;
  showPrompt: boolean;
  showProvider: boolean;
  showTimestamp: boolean;
  preview: MarkdownCapturePayload | null;
  t: (key: string) => string;
}

const previewMdComponents = { pre: SharedPreBlock, code: SharedCodeBlock } as const;

const PreviewMarkdown: React.FC<{ children: string }> = ({ children }) => (
  <ReactMarkdown
    remarkPlugins={remarkPlugins}
    rehypePlugins={REHYPE_PLUGINS}
    components={previewMdComponents}
  >
    {children}
  </ReactMarkdown>
);

export const ExportPreviewPanel: React.FC<ExportPreviewPanelProps> = ({
  background,
  showPrompt,
  showProvider,
  showTimestamp,
  preview,
  t,
}) => (
  <Stack
    gap={12}
    p={16}
    flex={1}
    bg="var(--bg-tertiary)"
    style={{ minHeight: 0, overflowY: 'auto' }}
  >
    <SectionLabel>{t('capture.preview')}</SectionLabel>
    <Box style={{ borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
      <Box p={10} style={{ background }}>
        <Box
          bg="var(--bg-secondary)"
          p={12}
          style={{ border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.5 }}
        >
          <Text fw={700} c="var(--text-primary)" mb={6} fz="var(--font-size-base)">
            {preview?.title || t('capture.noTitle')}
          </Text>
          {(showProvider || showTimestamp) && (
            <Group gap={8} wrap="wrap" mb={6} c="var(--text-muted)" fz="var(--font-size-xs)">
              {showProvider && preview?.provider && (
                <Group component="span" gap={4}>
                  <Cpu size={10} />
                  {preview.provider}
                </Group>
              )}
              {showTimestamp && preview?.timestamp && (
                <Group component="span" gap={4}>
                  <Clock3 size={10} />
                  {preview.timestamp}
                </Group>
              )}
            </Group>
          )}
          {showPrompt && preview?.prompt && (
            <Box
              bg="var(--bg-tertiary)"
              p="5px 8px"
              mb={6}
              style={{ border: '1px solid var(--border)', borderRadius: 6, fontSize: 'var(--font-size-xs)' }}
            >
              <Box className="md-content" style={{ maxHeight: 96, overflowY: 'auto', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                <PreviewMarkdown>{preview.prompt}</PreviewMarkdown>
              </Box>
            </Box>
          )}
          <Box className="md-content" style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
            <PreviewMarkdown>{preview?.content || preview?.summary || ''}</PreviewMarkdown>
          </Box>
        </Box>
      </Box>
    </Box>
  </Stack>
);
