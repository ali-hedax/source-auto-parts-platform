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
        <RDialog.Overlay className="fixed inset-0 z-50 bg-carbon/60" />
        <RDialog.Content className="fixed inset-x-4 top-[8vh] z-50 mx-auto max-h-[84vh] max-w-lg overflow-y-auto rounded-[var(--radius-card)] bg-white p-6 shadow-xl focus:outline-none">
          <div className="mb-4 flex items-start justify-between gap-4">
            <RDialog.Title className="text-lg font-bold">{title}</RDialog.Title>
            <RDialog.Close className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-silver" aria-label={closeLabel}>
              <X aria-hidden className="size-5" />
            </RDialog.Close>
          </div>
          {description ? <RDialog.Description className="mb-4 text-steel">{description}</RDialog.Description> : <RDialog.Description className="sr-only">{title}</RDialog.Description>}
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
