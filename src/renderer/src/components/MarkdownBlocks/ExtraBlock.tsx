import React from 'react';

interface ExtraBlockProps {
  heading: string;
  content: string;
  MarkdownRenderer: React.ComponentType<{ children: string }>;
}

export const ExtraBlock = React.memo<ExtraBlockProps>(({ heading, content, MarkdownRenderer }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{
      fontSize: 'var(--font-size-base)',
      fontWeight: 600,
      color: 'var(--text-muted)',
      marginBottom: 6,
      borderLeft: '2px solid var(--border)',
      paddingLeft: 8,
    }}>
      {heading}
    </div>
    <div className="md-content" style={{ userSelect: 'text', fontSize: 'var(--font-size-md)' }}>
      <MarkdownRenderer>{content}</MarkdownRenderer>
    </div>
  </div>
));

