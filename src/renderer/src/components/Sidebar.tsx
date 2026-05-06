// src/renderer/src/components/Sidebar.tsx
import React, { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Box, Flex, Menu as MMenu, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { useAppStore } from '../store/appStore';
import { useI18nStore } from '../store/i18nStore';
import type { OutputFile } from '../../../shared/types';
import { WebDialog } from './WebDialog';
import { Circle, Edit3, FolderOpen, Search, Trash2 } from 'lucide-react';
import { isTypingTarget } from '../utils/domUtils';
import { fileApi } from '../api/electronApi';

type EditMode = 'filename' | 'h1' | null;

export const Sidebar: React.FC = () => {
  const { files, selectedFile, selectFile, setFileContent, setFiles, unreadFilePaths } = useAppStore();
  const { t, locale, isReady } = useI18nStore();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OutputFile[] | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingMode, setEditingMode] = useState<EditMode>(null);
  const [pendingDeleteFile, setPendingDeleteFile] = useState<OutputFile | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: OutputFile } | null>(null);
  const searchSeqRef = useRef(0);
  const fileItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevDeleteDialogOpenRef = useRef(false);

  const loadFiles = useCallback(async () => {
    const latest = await fileApi.getList();
    setFiles(latest);
    return latest;
  }, [setFiles]);

  useEffect(() => {
    void loadFiles();
    const unsub = window.electronAPI.onFileListUpdate((nextFiles) => {
      setFiles(nextFiles, { markUnread: true });
    });
    return unsub;
  }, [loadFiles, setFiles]);

  useEffect(() => {
    const keyword = query.trim();
    if (!keyword) {
      searchSeqRef.current += 1;
      setSearchResults(null);
      return;
    }
    const seq = ++searchSeqRef.current;
    const timer = setTimeout(async () => {
      const result = await fileApi.search(keyword);
      if (seq === searchSeqRef.current) {
        setSearchResults(result);
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [query, files]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const visibleFiles = searchResults ?? files;
  const historyCountLabel = query.trim() ? `${visibleFiles.length}/${files.length}` : `${files.length}`;

  const getFocusedFile = useCallback((): OutputFile | null => {
    const active = document.activeElement;
    if (!(active instanceof HTMLDivElement)) return null;

    for (const [path, node] of fileItemRefs.current.entries()) {
      if (node !== active) continue;
      return visibleFiles.find((file) => file.path === path)
        ?? files.find((file) => file.path === path)
        ?? null;
    }
    return null;
  }, [files, visibleFiles]);

  const handleSelect = async (file: OutputFile) => {
    selectFile(file);
    const content = await fileApi.getContent(file.path);
    startTransition(() => {
      setFileContent(content);
    });
  };

  const registerItemRef = useCallback((path: string, node: HTMLDivElement | null) => {
    if (node) {
      fileItemRefs.current.set(path, node);
      return;
    }
    fileItemRefs.current.delete(path);
  }, []);

  useEffect(() => {
    if (!selectedFile?.path || pendingDeleteFile || editingPath) return;
    const activeItem = fileItemRefs.current.get(selectedFile.path);
    if (!activeItem || document.activeElement === activeItem) return;
    window.requestAnimationFrame(() => activeItem.focus());
  }, [selectedFile?.path, pendingDeleteFile, editingPath]);

  useEffect(() => {
    const wasOpen = prevDeleteDialogOpenRef.current;
    const isOpen = Boolean(pendingDeleteFile);
    prevDeleteDialogOpenRef.current = isOpen;
    if (!wasOpen || isOpen || !selectedFile?.path || editingPath) return;
    const activeItem = fileItemRefs.current.get(selectedFile.path);
    if (!activeItem) return;
    window.requestAnimationFrame(() => activeItem.focus());
  }, [pendingDeleteFile, selectedFile?.path, editingPath]);

  const openContextMenu = (e: React.MouseEvent<HTMLElement>, file: OutputFile) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const startRenameFile = (file: OutputFile) => {
    setContextMenu(null);
    setEditingPath(file.path);
    setEditingMode('filename');
    setEditingText(file.name.replace(/\.md$/i, '') || file.preview || file.name);
  };

  const startEditH1 = async (file: OutputFile) => {
    setContextMenu(null);
    const content = await fileApi.getContent(file.path);
    const firstLine = content?.split('\n')[0]?.trim() || '';
    const h1 = firstLine.match(/^#\s+(.+)$/)?.[1] || file.preview || file.name.replace(/\.md$/i, '');
    setEditingPath(file.path);
    setEditingMode('h1');
    setEditingText(h1);
  };

  const startDelete = (file: OutputFile) => {
    setContextMenu(null);
    setPendingDeleteFile(file);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteFile) return;
    const target = pendingDeleteFile;
    const currentIdx = visibleFiles.findIndex((f) => f.path === target.path);
    const nextFile = visibleFiles[currentIdx + 1] ?? visibleFiles[currentIdx - 1] ?? null;
    setPendingDeleteFile(null);
    const ok = await fileApi.deleteFile(target.path);
    if (!ok) return;
    if (selectedFile?.path === target.path) {
      if (nextFile && nextFile.path !== target.path) {
        await handleSelect(nextFile);
      } else {
        selectFile(null);
        setFileContent(null);
      }
    }
  };

  const handleCommitEdit = async () => {
    if (!editingPath || !editingMode) return;
    const nextText = editingText.trim();
    const activePath = editingPath;
    const mode = editingMode;
    setEditingPath(null);
    setEditingMode(null);
    if (!nextText) return;

    if (mode === 'filename') {
      const result = await fileApi.updateTitle(activePath, nextText);
      if (!result.ok) return;
      const latest = await loadFiles();
      const nextSelected = latest.find((file) => file.path === result.updatedPath) ?? null;
      if (selectedFile?.path === activePath) {
        selectFile(nextSelected);
        if (!nextSelected) {
          setFileContent(null);
          return;
        }
        const updated = await fileApi.getContent(nextSelected.path);
        startTransition(() => {
          setFileContent(updated);
        });
      }
      return;
    }

    const ok = await fileApi.updateH1(activePath, nextText);
    if (!ok) return;
    await loadFiles();
    if (selectedFile?.path === activePath) {
      const updated = await fileApi.getContent(activePath);
      startTransition(() => {
        setFileContent(updated);
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingPath(null);
    setEditingMode(null);
    setEditingText('');
  };

  const formatTime = useCallback((ts: string) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60_000);
      const diffHours = Math.floor(diffMs / 3_600_000);
      const diffDays = Math.floor(diffMs / 86_400_000);

      // Less than 1 minute
      if (diffMins < 1) return t('sidebar.time.justNow');

      // Less than 60 minutes
      if (diffMins < 60) return t('sidebar.time.minutesAgo').replace('{{count}}', String(diffMins));

      // Less than 24 hours: Today HH:mm
      if (diffHours < 24) {
        const timeStr = new Intl.DateTimeFormat(locale, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(d);
        return t('sidebar.time.today').replace('{{time}}', timeStr);
      }

      // Yesterday
      if (diffDays === 1) {
        const timeStr = new Intl.DateTimeFormat(locale, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(d);
        return t('sidebar.time.yesterday').replace('{{time}}', timeStr);
      }

      // Within a week: weekday HH:mm
      if (diffDays < 7) {
        const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d);
        const timeStr = new Intl.DateTimeFormat(locale, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(d);
        return `${weekday} ${timeStr}`;
      }

      // Within a month or same year: M/D
      if (diffDays < 30 || d.getFullYear() === now.getFullYear()) {
        return new Intl.DateTimeFormat(locale, {
          month: 'numeric',
          day: 'numeric',
        }).format(d);
      }

      // Older: YYYY-MM-DD
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d).replace(/\//g, '-');
    } catch {
      return ts;
    }
    // isReady is included so FileItem (React.memo) re-renders once translations load.
  }, [t, locale, isReady]);
  const unreadLabel = t('sidebar.unread');

  return (
    <Stack
      gap={0}
      w={240}
      miw={180}
      maw={300}
      bg="var(--mantine-color-default)"
      style={{ borderRight: '1px solid var(--mantine-color-default-border)', overflow: 'hidden', position: 'relative' }}
    >
      <Box p="8px 10px" style={{ borderBottom: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}>
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('sidebar.searchPlaceholder')}
          leftSection={<Search size={13} />}
          rightSection={<Text c="dimmed" fz={11}>{historyCountLabel}</Text>}
          rightSectionWidth={64}
          variant="default"
          styles={{
            input: {
              background: 'var(--mantine-color-bg-tertiary)',
              borderColor: 'var(--mantine-color-default-border)',
              color: 'var(--mantine-color-text)',
            },
            section: {
              color: 'var(--mantine-color-dimmed)',
            },
          }}
          size="xs"
          radius="sm"
        />
      </Box>

      <Box flex={1} style={{ overflowY: 'auto', padding: '4px 0' }} onKeyDown={(e) => {
        if (editingPath || pendingDeleteFile || isTypingTarget(e.target)) return;

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const items = Array.from(fileItemRefs.current.values());
          const idx = items.indexOf(document.activeElement as HTMLDivElement);
          if (idx < 0) return;
          e.preventDefault();
          const next = e.key === 'ArrowDown' ? items[idx + 1] : items[idx - 1];
          next?.focus();
          return;
        }

        const focusedFile = getFocusedFile();
        if (!focusedFile) return;
        const key = e.key.toLowerCase();

        if (e.ctrlKey && !e.shiftKey && !e.altKey && key === '1') {
          e.preventDefault();
          void startEditH1(focusedFile);
          return;
        }

        if (
          (e.altKey && !e.ctrlKey && !e.shiftKey && key === 'r')
          || (e.ctrlKey && e.shiftKey && !e.altKey && key === 'o')
        ) {
          e.preventDefault();
          void window.electronAPI.showInFolder(focusedFile.path);
          setContextMenu(null);
          return;
        }

        if (e.key === 'Delete') {
          e.preventDefault();
          startDelete(focusedFile);
          return;
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          if (selectedFile?.path === focusedFile.path) {
            startRenameFile(focusedFile);
            return;
          }
          void handleSelect(focusedFile);
          return;
        }

        if (e.key === ' ') {
          e.preventDefault();
          void handleSelect(focusedFile);
        }
      }}
      >
        {visibleFiles.length === 0 ? (
          <Text
            p="20px 14px"
            c="dimmed"
            fz="var(--font-size-base)"
            ta="center"
          >
            {query
              ? t('sidebar.emptyFiltered')
              : t('sidebar.empty')}
          </Text>
        ) : (
          visibleFiles.map((file) => (
            <FileItem
              key={file.path}
              file={file}
              selected={selectedFile?.path === file.path}
              unread={Boolean(unreadFilePaths[file.path])}
              unreadLabel={unreadLabel}
              isEditing={editingPath === file.path}
              editingMode={editingMode}
              editingText={editingText}
              setEditingText={setEditingText}
              onSelect={handleSelect}
              onOpenMenu={openContextMenu}
              onCommitEdit={handleCommitEdit}
              onCancelEdit={handleCancelEdit}
              formatTime={formatTime}
              registerItemRef={registerItemRef}
            />
          ))
        )}
      </Box>

      {contextMenu && (
        <Box
          pos="fixed"
          top={contextMenu.y}
          left={contextMenu.x}
          style={{ zIndex: 2000 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <MMenu opened withinPortal={false} position="bottom-start" offset={0} zIndex={2000}
            styles={{
              dropdown: {
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border)',
              },
            }}
          >
            <MMenu.Target>
              <Box w={0} h={0} />
            </MMenu.Target>
            <MMenu.Dropdown>
              <MMenu.Item
                leftSection={<Edit3 size={13} />}
                rightSection={<Text component="span" fz="var(--font-size-xs)" c="var(--text-muted)" ff="var(--font-mono)">{t('context.shortcut.editH1')}</Text>}
                onClick={() => { void startEditH1(contextMenu.file); }}
              >
                {t('context.editH1')}
              </MMenu.Item>
              <MMenu.Item
                leftSection={<FolderOpen size={13} />}
                rightSection={<Text component="span" fz="var(--font-size-xs)" c="var(--text-muted)" ff="var(--font-mono)">{t('context.shortcut.showInFolder')}</Text>}
                onClick={() => { void window.electronAPI.showInFolder(contextMenu.file.path); setContextMenu(null); }}
              >
                {t('context.showInFolder')}
              </MMenu.Item>
              <MMenu.Divider />
              <MMenu.Item
                leftSection={<Trash2 size={13} />}
                color="red"
                rightSection={<Text component="span" fz="var(--font-size-xs)" c="var(--text-muted)" ff="var(--font-mono)">{t('context.shortcut.delete')}</Text>}
                onClick={() => startDelete(contextMenu.file)}
              >
                {t('context.delete')}
              </MMenu.Item>
            </MMenu.Dropdown>
          </MMenu>
        </Box>
      )}

      <WebDialog
        open={Boolean(pendingDeleteFile)}
        title={t('dialog.deleteFile.message')}
        description={t('dialog.deleteFile.detail').replace('{{file}}', pendingDeleteFile?.name || '')}
        confirmText={t('dialog.delete')}
        cancelText={t('dialog.cancel')}
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteFile(null)}
      />
    </Stack>
  );
};

interface FileItemProps {
  file: OutputFile;
  selected: boolean;
  unread: boolean;
  unreadLabel: string;
  isEditing: boolean;
  editingMode: EditMode;
  editingText: string;
  setEditingText: (title: string) => void;
  onSelect: (f: OutputFile) => void | Promise<void>;
  onOpenMenu: (e: React.MouseEvent<HTMLElement>, f: OutputFile) => void;
  onCommitEdit: () => Promise<void>;
  onCancelEdit: () => void;
  formatTime: (ts: string) => string;
  registerItemRef: (path: string, node: HTMLDivElement | null) => void;
}

const FileItem: React.FC<FileItemProps> = React.memo(({
  file, selected, unread, unreadLabel, isEditing, editingMode, editingText,
  setEditingText, onSelect, onOpenMenu, onCommitEdit, onCancelEdit, formatTime, registerItemRef,
}) => {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const bg = selected
    ? 'var(--mantine-color-accent-dim)'
    : hovered ? 'var(--mantine-color-default-hover)' : 'transparent';
  return (
    <Stack
      gap={6}
      ref={(node) => registerItemRef(file.path, node as HTMLDivElement | null)}
      tabIndex={0}
      onClick={() => { if (!isEditing) void onSelect(file); }}
      onContextMenu={(e) => onOpenMenu(e, file)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      aria-selected={selected}
      data-selected={String(selected)}
      data-editing={String(isEditing)}
      style={{
        padding: '6px 10px',
        borderRadius: 8,
        margin: '2px 8px',
        background: bg,
        borderLeft: `2px solid ${selected ? 'var(--mantine-color-accent)' : 'transparent'}`,
        cursor: 'pointer',
        outline: 'none',
        boxShadow: focused ? '0 0 0 2px var(--mantine-color-accent-dim)' : 'none',
        transition: 'background 0.1s ease',
      }}
    >
      <Flex align="center" gap={6}>
        {file.provider && (
          <Badge
            variant="outline"
            size="s"
            radius="xl"
            tt="none"
            fw={500} fz="var(--font-size-sm)" lh={1.6} px={6} py={1} opacity={selected ? 1 : 0.75} style={{
              borderColor: selected
                ? 'var(--mantine-color-accent)'
                : 'var(--mantine-color-default-border)',
              color: selected
                ? 'var(--mantine-color-accent)'
                : 'var(--mantine-color-dimmed)',
              background: 'transparent',
            }}
          >
            {file.provider}
          </Badge>
        )}
        <Text
          component="span"
          fz="var(--font-size-xs)"
          ff="var(--font-mono)"
          style={{ whiteSpace: 'nowrap' }}
          c={selected ? 'dimmed' : undefined}
          opacity={selected ? 1 : 0.65}
        >
          {formatTime(file.timestamp)}
        </Text>
        {unread && (
          <Box ml="auto">
            <Circle size={9} fill="var(--mantine-color-accent)" stroke="var(--mantine-color-accent)" strokeWidth={1.5} aria-label={unreadLabel} />
          </Box>
        )}
      </Flex>

      {isEditing && editingMode === 'h1' ? (
        <TextInput
          autoFocus
          value={editingText}
          onChange={(e) => setEditingText(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => { void onCommitEdit(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void onCommitEdit(); }
            else if (e.key === 'Escape') { e.preventDefault(); onCancelEdit(); }
          }}
          size="xs"
          styles={{ input: { background: 'var(--mantine-color-body)', border: '1px solid var(--mantine-color-accent)' } }}
        />
      ) : (
        <Text
          fz="var(--font-size-xs)"
          title={file.name}
          c="dimmed"
          style={{
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: 1.4,
          }}
        >
          {file.preview || '...'}
        </Text>
      )}
    </Stack>
  );
});

