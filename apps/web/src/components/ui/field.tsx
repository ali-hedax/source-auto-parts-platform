import { clsx } from 'clsx';
import { ChevronDown, CircleAlert } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

// line-strong keeps the control edge at ≥ 3:1 against white (WCAG 1.4.11); the focus ring adds the blue.
const control =
  'block w-full rounded-[var(--radius-control)] border border-line-strong bg-white px-3 text-ink placeholder:text-steel/80 transition-colors duration-150 hover:border-ink focus-visible:border-action aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-soft/40 disabled:cursor-not-allowed disabled:border-line disabled:bg-surface disabled:text-steel';

export interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  required?: boolean;
  optionalLabel?: string;
  children: ReactNode;
  className?: string;
}

/** Visible label, helper text and an inline error tied to the control via aria-describedby. */
export function Field({ id, label, hint, error, required, optionalLabel, children, className }: FieldProps) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold leading-6 text-ink">
        {label}
        {required ? <span aria-hidden className="ms-1 text-danger">*</span> : optionalLabel ? <span className="ms-1 font-normal text-steel">({optionalLabel})</span> : null}
      </label>
      {children}
      {hint ? <p id={`${id}-hint`} className="text-[0.8125rem] leading-6 text-steel">{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm font-medium leading-6 text-danger">
          <CircleAlert aria-hidden className="mt-1 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, hint?: unknown, error?: unknown): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={clsx(control, 'min-h-11', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, rows = 4, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} aria-invalid={invalid || undefined} className={clsx(control, 'py-2.5 leading-7', className)} {...rest} />;
});

/** Native select (keeps the platform picker on phones) with one chevron that mirrors in RTL. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, invalid, children, ...rest },
  ref,
) {
  return (
    <span className="relative block">
      <select ref={ref} aria-invalid={invalid || undefined} className={clsx(control, 'min-h-11 cursor-pointer appearance-none pe-10', className)} {...rest}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-steel" />
    </span>
  );
});

export function Checkbox({ id, label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: ReactNode }) {
  return (
    <label htmlFor={id} className={clsx('flex min-h-11 cursor-pointer items-center gap-3', className)}>
      <input id={id} type="checkbox" className="size-5 shrink-0 cursor-pointer rounded border-line-strong accent-[var(--color-action)]" {...rest} />
      <span>{label}</span>
    </label>
  );
}
