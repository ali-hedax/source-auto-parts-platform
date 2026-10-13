import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'onDark';
type Size = 'md' | 'sm' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold leading-tight transition-colors duration-150 ease-[var(--ease-standard)] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer select-none whitespace-nowrap';

const variants: Record<Variant, string> = {
  // action-blue (#2467A9) keeps ≥ 5.8:1 with white text; hover goes darker, never lighter.
  primary: 'bg-action text-white hover:bg-action-hover active:bg-carbon disabled:hover:bg-action',
  // Neutral by design: blue is kept for the one main action on a screen (brand ratio ~15%).
  secondary: 'border border-line-strong bg-white text-ink hover:border-ink hover:bg-surface active:bg-silver/60',
  ghost: 'text-ink hover:bg-silver/60 active:bg-silver',
  danger: 'bg-danger text-white hover:bg-[#8f1c13]',
  onDark: 'border border-white/25 bg-transparent text-silver hover:border-white/50 hover:bg-white/10',
};

const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-[0.9375rem]',
  lg: 'min-h-12 px-5 text-base',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string): string {
  return clsx(base, variants[variant], sizes[size], extra);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading = false, icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

type LinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode };

export function ButtonLink({ variant = 'primary', size = 'md', icon, className, children, ...rest }: LinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
