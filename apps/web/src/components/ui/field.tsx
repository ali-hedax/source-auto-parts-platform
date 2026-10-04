import { clsx } from 'clsx';
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const control =
  'block w-full rounded-[var(--radius-control)] border border-line bg-white px-3 text-ink placeholder:text-steel/70 transition-colors duration-150 hover:border-steel focus-visible:border-action aria-[invalid=true]:border-danger disabled:bg-surface disabled:text-steel';

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
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required ? <span aria-hidden className="ms-1 text-danger">*</span> : optionalLabel ? <span className="ms-1 font-normal text-steel">({optionalLabel})</span> : null}
      </label>
      {children}
      {hint ? <p id={`${id}-hint`} className="text-sm text-steel">{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {error}
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
  return <textarea ref={ref} rows={rows} aria-invalid={invalid || undefined} className={clsx(control, 'py-2.5', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, invalid, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} aria-invalid={invalid || undefined} className={clsx(control, 'min-h-11 pe-8', className)} {...rest}>
      {children}
    </select>
  );
});

export function Checkbox({ id, label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: ReactNode }) {
  return (
    <label htmlFor={id} className={clsx('flex min-h-11 cursor-pointer items-center gap-3', className)}>
      <input id={id} type="checkbox" className="size-5 shrink-0 cursor-pointer rounded border-line accent-[var(--color-action)]" {...rest} />
      <span>{label}</span>
    </label>
  );
}
