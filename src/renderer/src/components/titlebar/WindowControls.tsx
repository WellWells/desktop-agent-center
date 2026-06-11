// src/renderer/src/components/titlebar/WindowControls.tsx — brand icon and platform window controls
import React from 'react';
import { Box, UnstyledButton } from '@mantine/core';
import {
  brandIconEmptyStyle,
  brandIconImgStyle,
  doWindowAction,
  getWindowActionTitle,
  macWindowButtonDefs,
  noDrag,
  winButtonDefs,
  winButtonIcons,
} from './constants';
import styles from '../TitleBar.module.css';

// ─── Brand icon ─────────────────────────────────────────────────────────────────
// Renders the app icon PNG loaded at runtime via IPC.
// Reserves a fixed-size slot while loading to prevent layout shift.
export const BrandIcon: React.FC<{ dataUrl: string }> = ({ dataUrl }) => {
  if (!dataUrl) {
    return (
      <Box
        component="span"
        aria-hidden="true"
        w={18}
        h={18}
        display="inline-block"
        style={brandIconEmptyStyle}
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
      style={brandIconImgStyle}
    />
  );
};

// ─── Mac window controls ────────────────────────────────────────────────────────
// Group hover is handled entirely by CSS: .macGroup:hover .macBtnIcon { opacity: 1 }
// No useState needed — no hover state tracked in JS.
export const MacWindowControls = React.memo<{ t: (k: string) => string }>(({ t }) => (
  <Box className={styles.macGroup} style={noDrag}>
    {macWindowButtonDefs.map((btn) => (
      <UnstyledButton
        key={btn.action}
        onClick={() => doWindowAction(btn.action)}
        title={getWindowActionTitle(t, btn.action)}
        className={styles.macBtn}
        style={{ background: btn.color }}
      >
        <Box component="span" className={styles.macBtnIcon}>
          {btn.icon}
        </Box>
      </UnstyledButton>
    ))}
  </Box>
));

// ─── Windows window controls ────────────────────────────────────────────────────
// Hover effects handled entirely by CSS: .winBtn:hover and .winClose:hover
// No useState needed — no hover state tracked in JS.
export const WindowsControls = React.memo<{ t: (k: string) => string }>(({ t }) => (
  <Box className={styles.winControls} style={noDrag}>
    {winButtonDefs.map(({ action }) => (
      <UnstyledButton
        key={action}
        onClick={() => doWindowAction(action)}
        title={getWindowActionTitle(t, action)}
        className={`${styles.winBtn}${action === 'close' ? ` ${styles.winClose}` : ''}`}
      >
        {winButtonIcons[action]}
      </UnstyledButton>
    ))}
  </Box>
));
