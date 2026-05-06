import React, { useState } from 'react';
import { PencilLine } from 'lucide-react';

interface PromptBlockProps {
  prompt: string;
  isSideBySide?: boolean;
  label: string;
  expandText: string;
  collapseText: string;
  MarkdownRenderer: React.ComponentType<{ children: string }>;
}

export const PromptBlock = React.memo<PromptBlockProps>(({
  prompt,
  isSideBySide = false,
  label,
  expandText,
  collapseText,
  MarkdownRenderer,
}) => {
  const [expanded, setExpanded] = useState(false);

  const lineCount = prompt.split('\n').length;
  const needsClamp = lineCount > 3 || prompt.length > 180;

  return (
    <div style={{
      background: 'var(--bg-tertiary)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '10px 14px',
      marginBottom: 12,
      position: 'relative',
    }}>
      <div style={{
        fontSize: 'var(--font-size-xs)',
        fontWeight: 700,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.8px',
        marginBottom: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
      }}>
        <PencilLine size={12} />
        {label}
      </div>

      <div
        className="md-content md-prompt"
        style={{
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: expanded ? 'unset' : 3,
          userSelect: 'text',
          fontSize: 'var(--font-size-md)',
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
          transition: 'max-height 0.2s ease',
          overflowWrap: isSideBySide ? 'anywhere' : undefined,
          wordBreak: isSideBySide ? 'break-word' : undefined,
        } as React.CSSProperties}
      >
        <MarkdownRenderer>{prompt}</MarkdownRenderer>
      </div>

      {needsClamp && (
        <button
          onClick={() => setExpanded((value) => !value)}
          style={{
            marginTop: 6,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--accent)',
            padding: '2px 0',
            fontWeight: 600,
          }}
        >
          {expanded ? collapseText : expandText}
        </button>
      )}
    </div>
  );
});

