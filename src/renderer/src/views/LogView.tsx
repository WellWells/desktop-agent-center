// src/renderer/src/views/LogView.tsx
import React from 'react';
import { Box } from '@mantine/core';
import { LogPanel } from '../components/LogPanel';

export const LogView: React.FC = () => {
  return (
    <Box display="flex" style={{ flex: 1, flexDirection: 'column', overflow: 'hidden', background: 'var(--mantine-color-body)' }}>
      <LogPanel />
    </Box>
  );
};
