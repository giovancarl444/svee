import type { ReactNode } from 'react';

// A tiny, safe Markdown renderer for the nightly brief — headings, bullet lists,
// bold, paragraphs. Emits React text nodes only (no dangerouslySetInnerHTML), so
// nothing the model returns can inject markup.

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold">
          {bold[1]}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

export function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let key = 0;

  const flushList = () => {
    if (list.length === 0) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={`ul-${key++}`} className="my-3 flex flex-col gap-2">
        {items.map((li, i) => (
          <li key={i} className="flex gap-2 leading-snug">
            <span className="text-signal" aria-hidden>
              —
            </span>
            <span>{renderInline(li, `li-${key}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    );
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#\s+/.test(line)) {
      flushList();
      blocks.push(
        <h2 key={key++} className="mt-6 mb-2 text-2xl font-semibold tracking-tight">
          {renderInline(line.replace(/^#\s+/, ''), `h-${key}`)}
        </h2>,
      );
    } else if (/^#{2,}\s+/.test(line)) {
      flushList();
      blocks.push(
        <p key={key++} className="tab-index mt-6 mb-1">
          {line.replace(/^#{2,}\s+/, '')}
        </p>,
      );
    } else if (/^[-*]\s+/.test(line)) {
      list.push(line.replace(/^[-*]\s+/, ''));
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      blocks.push(
        <p key={key++} className="my-2 leading-relaxed">
          {renderInline(line, `p-${key}`)}
        </p>,
      );
    }
  }
  flushList();

  return <div>{blocks}</div>;
}
