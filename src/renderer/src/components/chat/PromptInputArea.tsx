import React, { useCallback, useImperativeHandle, useRef, useState } from 'react';
import { ActionIcon, Box, Flex, Paper, Stack, Textarea } from '@mantine/core';
import { ArrowUp } from 'lucide-react';
import { ModelDropdown } from './ModelDropdown';

interface PromptInputAreaProps {
  t: (key: string) => string;
  activeModelUrl: string;
  onChangeModel: (url: string) => void;
  onSend: (text: string) => void;
}

export interface PromptInputAreaHandle {
  focusPrompt: () => void;
}

export const PromptInputArea = React.forwardRef<PromptInputAreaHandle, PromptInputAreaProps>(({
  t,
  activeModelUrl,
  onChangeModel,
  onSend,
}, ref) => {
  const [promptInput, setPromptInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focusPrompt: () => promptInputRef.current?.focus(),
  }), []);

  const handleSendPrompt = useCallback(() => {
    const text = promptInput.trim();
    if (!text) return;
    onSend(text);
    setPromptInput('');
  }, [onSend, promptInput]);

  return (
    <Stack
      gap={8}
      bg="var(--mantine-color-body)"
      p="10px 12px"
      style={{ borderTop: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
    >
      <Paper
        shadow="none"
        radius="var(--radius-lg)"
        bg="var(--mantine-color-default)"
        withBorder
        onFocusCapture={() => setInputFocused(true)}
        onBlurCapture={() => setInputFocused(false)}
        style={{
          borderColor: inputFocused ? 'var(--mantine-color-accent)' : 'var(--mantine-color-default-border)',
          boxShadow: inputFocused ? '0 0 0 2px var(--mantine-color-accent-dim)' : 'none',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        }}
      >
        <Box p="8px 12px 2px">
          <Textarea
            ref={promptInputRef}
            value={promptInput}
            onChange={(event) => setPromptInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSendPrompt();
              }
            }}
            placeholder={t('input.placeholder.short')}
            autosize
            minRows={3}
            maxRows={3}
            styles={{
              input: {
                background: 'transparent',
                border: 'none',
                outline: 'none',
                boxShadow: 'none',
                color: 'var(--mantine-color-text)',
                fontSize: 'var(--font-size-xl)',
                fontFamily: 'var(--font-sans)',
                lineHeight: 1.55,
                userSelect: 'none',
                resize: 'none',
                padding: '2px 0',
              },
            }}
          />
        </Box>

        <Box h={1} bg="var(--mantine-color-default-border)" opacity={0.65} />

        <Flex align="center" justify="flex-end" gap={8} p="8px 10px">
          <ModelDropdown value={activeModelUrl} onChange={onChangeModel} />
          <ActionIcon
            onClick={handleSendPrompt}
            disabled={!promptInput.trim()}
            title={t('input.send')}
            radius="xl"
            size={34}
            style={{
              background: promptInput.trim() ? 'var(--mantine-color-accent)' : 'var(--mantine-color-default)',
              color: promptInput.trim() ? '#fff' : 'var(--mantine-color-dimmed)',
              transition: 'background 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </ActionIcon>
        </Flex>
      </Paper>
    </Stack>
  );
});

PromptInputArea.displayName = 'PromptInputArea';

