'use client';

import { AlertCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';

export interface SummaryError {
  fieldId: string;
  message: string;
}

/**
 * Focusable error summary shown after an invalid submit (spec §15): it takes
 * focus, is announced, and links to each field; inline errors stay in place.
 */
export function ErrorSummary({ title, errors, generalError }: { title: string; errors: SummaryError[]; generalError?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const signature = errors.map((e) => e.fieldId).join('|') + (generalError ?? '');
  useEffect(() => {
    if (errors.length || generalError) ref.current?.focus();
  }, [signature, errors.length, generalError]);
  if (!errors.length && !generalError) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" aria-labelledby="error-summary-title" className="rounded-[var(--radius-card)] border border-danger/40 border-s-4 border-s-danger bg-danger-soft px-4 py-3.5 focus-visible:outline-offset-4">
      <h2 id="error-summary-title" className="flex items-center gap-2 font-bold text-danger">
        <AlertCircle aria-hidden className="size-5" />
        {title}
      </h2>
      {generalError ? <p className="mt-1 leading-7 text-ink">{generalError}</p> : null}
      {errors.length ? (
        <ul className="mt-2 list-disc space-y-1 ps-6 leading-7">
          {errors.map((e) => (
            <li key={e.fieldId}>
              <a
                href={`#${e.fieldId}`}
                className="font-medium text-danger underline underline-offset-2"
                onClick={(ev) => {
                  ev.preventDefault();
                  document.getElementById(e.fieldId)?.focus();
                }}
              >
                {e.message}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
