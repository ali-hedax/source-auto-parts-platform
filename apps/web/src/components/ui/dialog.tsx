'use client';

import * as RDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Accessible dialog (Radix): traps focus, closes on Escape, returns focus to
 * the trigger, and labels itself with its title.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  closeLabel,
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  closeLabel: string;
  trigger?: ReactNode;
}) {
  return (
    <RDialog.Root {...(open !== undefined ? { open } : {})} {...(onOpenChange ? { onOpenChange } : {})}>
      {trigger ? <RDialog.Trigger asChild>{trigger}</RDialog.Trigger> : null}
      <RDialog.Portal>
        <RDialog.Overlay className="overlay-fade fixed inset-0 z-50 bg-carbon/60" />
        <RDialog.Content className="dialog-pop fixed inset-x-4 top-[8vh] z-50 mx-auto max-h-[84vh] max-w-lg overflow-y-auto rounded-[var(--radius-panel)] border border-line-soft bg-white p-5 shadow-[var(--shadow-overlay)] focus:outline-none sm:p-6">
          <div className="-mt-1 mb-4 flex items-start justify-between gap-4 border-b border-line-soft pb-3">
            <RDialog.Title className="pt-2 text-lg font-bold">{title}</RDialog.Title>
            <RDialog.Close className="-me-2 grid size-11 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-control)] text-steel hover:bg-surface hover:text-ink" aria-label={closeLabel}>
              <X aria-hidden className="size-5" />
            </RDialog.Close>
          </div>
          {description ? <RDialog.Description className="mb-4 leading-7 text-steel">{description}</RDialog.Description> : <RDialog.Description className="sr-only">{title}</RDialog.Description>}
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
