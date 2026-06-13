// platform window controls
import React from 'react';
import { Box, UnstyledButton } from '@mantine/core';
import {
  doWindowAction,
  getWindowActionTitle,
  macInactiveColor,
  macWindowButtonDefs,
  noDrag,
  winButtonDefs,
  winButtonIcons,
} from './constants';
import styles from '../TitleBar.module.css';

// Group hover is handled entirely by CSS: .macGroup:hover .macBtnIcon { opacity: 1 }
// `focused` mirrors OS window activation: native traffic lights gray out when the
// window is inactive and regain color when it becomes key again.
export const MacWindowControls = React.memo<{ t: (k: string) => string; focused: boolean }>(({ t, focused }) => (
  <Box className={styles.macGroup} style={noDrag}>
    {macWindowButtonDefs.map((btn) => (
      <UnstyledButton
        key={btn.action}
        onClick={() => doWindowAction(btn.action)}
        title={getWindowActionTitle(t, btn.action)}
        className={styles.macBtn}
        style={{ background: focused ? btn.color : macInactiveColor }}
      >
        <Box component="span" className={styles.macBtnIcon}>
          {btn.icon}
        </Box>
      </UnstyledButton>
    ))}
  </Box>
));

// Hover effects handled entirely by CSS: .winBtn:hover and .winClose:hover
// `focused` fades the caption controls when the window is inactive (native cue).
export const WindowsControls = React.memo<{ t: (k: string) => string; focused: boolean }>(({ t, focused }) => (
  <Box className={styles.winControls} style={{ ...noDrag, opacity: focused ? 1 : 0.5 }}>
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
