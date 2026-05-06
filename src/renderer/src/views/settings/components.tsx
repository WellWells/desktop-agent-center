// src/renderer/src/views/settings/components.tsx
// Shared UI sub-components extracted from SettingsView
import React from 'react';
import {
  Switch, Select, Paper, Divider, NavLink,
  Group, Stack, Text, Box,
} from '@mantine/core';
import { AppSegmentedControl } from '../../components/AppSegmentedControl';

// ── ToggleSwitch ─────────────────────────────────────────────────────────
export const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: () => void;
}> = ({ checked, onChange }) => (
  <Switch
    checked={checked}
    onChange={onChange}
    color="teal"
    size="md"
    thumbIcon={<></>}
    styles={{
      track: {
        cursor: 'pointer',
        borderColor: checked ? 'var(--mantine-color-success)' : 'var(--mantine-color-default-border)',
        backgroundColor: checked ? 'var(--mantine-color-success)' : 'var(--mantine-color-default-border)',
      },
    }}
  />
);

// ── SectionCard ──────────────────────────────────────────────────────────
export const SectionCard: React.FC<{
  children: React.ReactNode;
  danger?: boolean;
  style?: React.CSSProperties;
}> = ({ children, danger, style }) => (
  <Paper
    withBorder
    shadow="xs"
    radius="md"
    p="md"
    bg={danger
      ? 'linear-gradient(180deg, rgba(248,81,73,0.08), rgba(248,81,73,0.03))'
      : 'var(--mantine-color-default)'}
    style={{ ...(danger ? { borderColor: 'rgba(248,81,73,0.45)' } : {}), ...style }}
  >
    {children}
  </Paper>
);

// ── GroupHeader ──────────────────────────────────────────────────────────
export const GroupHeader: React.FC<{ label: string }> = ({ label }) => (
  <Divider
    label={label}
    labelPosition="left"
    mb={10}
    mt={6}
    styles={{
      label: {
        fontSize: 'var(--font-size-sm)',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--mantine-color-dimmed)',
      },
    }}
  />
);

// ── SelectDropdown ───────────────────────────────────────────────────────
export const SelectDropdown: React.FC<{
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}> = ({ value, options, onChange, disabled }) => (
  <Select
    value={value}
    data={options}
    onChange={(v) => { if (v) onChange(v); }}
    disabled={disabled}
    allowDeselect={false}
    withCheckIcon
    comboboxProps={{ zIndex: 200 }}
    styles={{
      input: {
        background: 'var(--mantine-color-bg-tertiary)',
        borderColor: 'var(--mantine-color-default-border)',
        color: disabled ? 'var(--mantine-color-dimmed)' : 'var(--mantine-color-text)',
        fontSize: 'var(--font-size-base)',
        minWidth: 180,
      },
      dropdown: {
        background: 'var(--mantine-color-default)',
        borderColor: 'var(--mantine-color-default-border)',
      },
      option: { fontSize: 'var(--font-size-base)' },
    }}
  />
);

// ── SegmentedControl ─────────────────────────────────────────────────────
export { AppSegmentedControl as SegmentedControl } from '../../components/AppSegmentedControl';

// ── NavItem ──────────────────────────────────────────────────────────────
export const NavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  hasMatch: boolean;
  onClick: () => void;
}> = ({ icon, label, active, hasMatch, onClick }) => (
  <NavLink
    label={label}
    leftSection={icon}
    active={active}
    onClick={onClick}
    rightSection={hasMatch ? <Box w={5} h={5} bg="var(--mantine-color-accent)" style={{ borderRadius: '50%', flexShrink: 0 }} /> : undefined}
    styles={{
      root: {
        borderRadius: 'var(--radius)',
        fontSize: 'var(--font-size-base)',
        color: active ? 'var(--mantine-color-accent)' : 'var(--mantine-color-default-color)',
        background: active ? 'var(--mantine-color-accent-dim)' : undefined,
      },
    }}
  />
);

// ── SettingRow ───────────────────────────────────────────────────────────
export const SettingRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  hint?: string;
  control: React.ReactNode;
  alignStart?: boolean;
}> = ({ icon, label, hint, control, alignStart }) => (
  <Group justify="space-between" align={alignStart ? 'flex-start' : 'center'} gap={12} wrap="nowrap">
    <Stack gap={0} flex={1} style={{ minWidth: 0 }}>
      <Group gap={6} wrap="nowrap" mb={hint ? 3 : 0}>
        <Box c="dimmed" style={{ flexShrink: 0 }}>{icon}</Box>
        <Text fz="var(--font-size-base)" fw={600} c="var(--mantine-color-default-color)">{label}</Text>
      </Group>
      {hint && <Text fz="var(--font-size-sm)" c="dimmed" lh={1.6}>{hint}</Text>}
    </Stack>
    <Box style={{ flexShrink: 0 }}>{control}</Box>
  </Group>
);

// ── SectionTitle ─────────────────────────────────────────────────────────
// Consistent section heading used across all settings sections.
export const SectionTitle: React.FC<{
  icon: React.ReactNode;
  label: string;
  mb?: number;
  c?: string;
}> = ({ icon, label, mb = 10, c }) => (
  <Group
    gap={8}
    mb={mb}
    fz="var(--font-size-md)"
    fw={700}
    c={c ?? 'var(--mantine-color-text)'}
    align="center"
  >
    {icon}
    {label}
  </Group>
);
