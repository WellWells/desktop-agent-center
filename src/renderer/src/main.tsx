// src/renderer/src/main.tsx — React entry point
import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { App } from './App';
import { useThemeStore } from './store/themeStore';
import './styles/globals.css';
import '@mantine/core/styles.css';

function Root() {
  const { mantineTheme, colorScheme, cssVariablesResolver } = useThemeStore();

  return (
    <MantineProvider
      theme={mantineTheme}
      forceColorScheme={colorScheme}
      cssVariablesResolver={cssVariablesResolver}
    >
      <ModalsProvider>
        <App />
      </ModalsProvider>
    </MantineProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
