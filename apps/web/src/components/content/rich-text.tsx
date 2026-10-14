import type { ReactNode } from 'react';

/**
 * Light formatting for texts written in the panel, rendered as React elements (never raw HTML):
 *   ## heading   ### smaller heading   - list item   1. numbered item   **bold**   [text](link)
 * Every other line is a paragraph. Links must point to this site (/…), http(s), mailto: or tel:;
 * anything else is shown as plain text.
 */
const SAFE_LINK = /^(\/(?!\/)[^\s]*|https?:\/\/[^\s]+|mailto:[^\s]+|tel:\+?[0-9,]+)$/i;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let i = 0;
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={`${key}-${i}`}>{m[1]}</strong>);
    else if (m[2] !== undefined && m[3] !== undefined && SAFE_LINK.test(m[3])) {
      const external = /^https?:/i.test(m[3]);
      out.push(
        <a key={`${key}-${i}`} href={m[3]} className="text-action underline underline-offset-4" {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {m[2]}
        </a>,
      );
    } else out.push(m[0]);
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const k = `l${blocks.length}`;
    const items = list.items.map((item, i) => <li key={i}>{inline(item, `${k}-${i}`)}</li>);
    blocks.push(list.ordered ? <ol key={k} className="list-decimal space-y-1 ps-6">{items}</ol> : <ul key={k} className="list-disc space-y-1 ps-6">{items}</ul>);
    list = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
      continue;
    }
    flush();
    if (!line) continue;
    const k = `b${blocks.length}`;
    if (line.startsWith('### ')) blocks.push(<h3 key={k} className="mt-2 text-lg font-bold">{inline(line.slice(4), k)}</h3>);
    else if (line.startsWith('## ')) blocks.push(<h2 key={k} className="mt-3 text-xl font-bold">{inline(line.slice(3), k)}</h2>);
    else blocks.push(<p key={k}>{inline(line, k)}</p>);
  }
  flush();
  return <div className={className ?? 'space-y-3 leading-8'}>{blocks}</div>;
}
