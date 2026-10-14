'use client';

import { Bold, Heading2, Link2, List, ListOrdered } from 'lucide-react';
import { useRef, useState } from 'react';
import { RichText } from '@/components/content/rich-text';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { useL } from '../shell';
import { useFieldMessage } from './kit';

/**
 * Text editor for pages: a toolbar that inserts the light formatting (heading, list, bold, link)
 * around the selection, and a preview exactly as the site shows it. No HTML is ever stored.
 */
export function RichTextEditor({ id, label, value, onChange, lang, error, maxLength }: { id: string; label: string; value: string; onChange: (v: string) => void; lang: 'fa' | 'en'; error?: string | undefined; maxLength: number }) {
  const l = useL();
  const msg = useFieldMessage();
  const area = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const wrap = (before: string, after = '', placeholder = '') => {
    const el = area.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };
  const linePrefix = (prefix: string) => {
    const el = area.current;
    if (!el) return;
    const lineStart = value.lastIndexOf('\n', el.selectionStart - 1) + 1;
    onChange(value.slice(0, lineStart) + prefix + value.slice(lineStart));
    requestAnimationFrame(() => el.focus());
  };
  const link = () => {
    const url = window.prompt(l('نشانی لینک (مثل /parts یا https://…)', 'Link address (e.g. /parts or https://…)'));
    if (url) wrap('[', `](${url.trim()})`, l('متن لینک', 'link text'));
  };
  type Tool = 'heading' | 'bold' | 'list' | 'numbered' | 'link';
  const apply = (tool: Tool) => {
    if (tool === 'heading') linePrefix('## ');
    else if (tool === 'bold') wrap('**', '**', l('متن پررنگ', 'bold text'));
    else if (tool === 'list') linePrefix('- ');
    else if (tool === 'numbered') linePrefix('1. ');
    else link();
  };
  const tools: Array<{ tool: Tool; icon: typeof Bold; label: string }> = [
    { tool: 'heading', icon: Heading2, label: l('عنوان', 'Heading') },
    { tool: 'bold', icon: Bold, label: l('پررنگ', 'Bold') },
    { tool: 'list', icon: List, label: l('فهرست', 'List') },
    { tool: 'numbered', icon: ListOrdered, label: l('فهرست شماره‌دار', 'Numbered list') },
    { tool: 'link', icon: Link2, label: l('لینک', 'Link') },
  ];
  return (
    <Field id={id} label={label} {...(error ? { error: msg(error) } : {})}>
      <div className="rounded-[var(--radius-control)] border border-line">
        <div role="toolbar" aria-label={l('قالب‌بندی', 'Formatting')} className="flex flex-wrap items-center gap-1 border-b border-line-soft bg-surface p-1">
          {tools.map(({ tool, icon: Icon, label: name }) => (
            <Button key={tool} size="sm" variant="ghost" aria-label={name} title={name} disabled={preview} onClick={() => apply(tool)}><Icon aria-hidden className="size-4" /></Button>
          ))}
          <span className="ms-auto" />
          <Button size="sm" variant={preview ? 'secondary' : 'ghost'} aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? l('ویرایش', 'Edit') : l('پیش‌نمایش', 'Preview')}</Button>
        </div>
        {preview ? (
          <div dir={lang === 'fa' ? 'rtl' : 'ltr'} lang={lang} className="min-h-48 p-4">
            {value.trim() ? <RichText text={value} /> : <p className="text-sm text-steel">{l('متنی نوشته نشده است.', 'Nothing written yet.')}</p>}
          </div>
        ) : (
          <Textarea ref={area} id={id} rows={12} dir={lang === 'fa' ? 'rtl' : 'ltr'} lang={lang} maxLength={maxLength} invalid={!!error} value={value} onChange={(e) => onChange(e.target.value)} className="rounded-none border-0" />
        )}
      </div>
    </Field>
  );
}
