import React from 'react';

interface ResponseBlockProps {
  response: string;
  MarkdownRenderer: React.ComponentType<{ children: string }>;
}

export const ResponseBlock = React.memo<ResponseBlockProps>(({ response, MarkdownRenderer }) => (
  <div
    className="md-content md-response"
    style={{
      flex: 1,
      userSelect: 'text',
      fontSize: 'var(--font-size-md)',
      lineHeight: 1.75,
      color: 'var(--text-primary)',
    }}
  >
    <MarkdownRenderer>{response}</MarkdownRenderer>
  </div>
));

