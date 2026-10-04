import { clsx } from 'clsx';
import { AlertTriangle, CheckCircle2, CircleDot, Clock, Info, Loader2, PackageX, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

/** Isolates LTR tokens (SKU, codes, emails, tracking numbers, VIN) inside RTL text. */
export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={clsx('ltr', className)}>
      {children}
    </bdi>
  );
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-silver/70 text-ink border-line',
  success: 'bg-success-soft text-success border-success/30',
  warning: 'bg-warning-soft text-warning border-warning/30',
  danger: 'bg-danger-soft text-danger border-danger/30',
  info: 'bg-info-soft text-info border-info/30',
};

const toneIcon: Record<Tone, ReactNode> = {
  neutral: <CircleDot aria-hidden className="size-3.5" />,
  success: <CheckCircle2 aria-hidden className="size-3.5" />,
  warning: <Clock aria-hidden className="size-3.5" />,
  danger: <XCircle aria-hidden className="size-3.5" />,
  info: <Info aria-hidden className="size-3.5" />,
};

/** Status is conveyed by text + icon, never by colour alone. */
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', toneClass[tone], className)}>
      {toneIcon[tone]}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  IN_STOCK: 'success', LOW_STOCK: 'warning', OUT_OF_STOCK: 'danger',
  SUCCEEDED: 'success', PAID: 'success', DELIVERED: 'success', CONFIRMED: 'success', ACCEPTED: 'success', COMPLETED: 'success', READY: 'success', CONVERTED: 'success', APPROVED: 'success', RESOLVED: 'success', ACTIVE: 'success',
  FAILED: 'danger', CANCELLED: 'danger', REJECTED: 'danger', EXCEPTION: 'danger', EXPIRED: 'danger', SUSPENDED: 'danger',
  AWAITING_PAYMENT: 'warning', PENDING: 'warning', PENDING_VERIFICATION: 'warning', NEEDS_CUSTOMER_INFO: 'warning', ON_HOLD: 'warning', SCANNING: 'warning', REQUESTED: 'warning', UNPAID: 'warning', OPEN: 'warning', PARTIALLY_REFUNDED: 'warning',
  SENT: 'info', QUOTED: 'info', SHIPPED: 'info', PREPARING: 'info', READY_TO_SHIP: 'info', SOURCING: 'info', PURCHASED: 'info', IN_TRANSIT_TO_WAREHOUSE: 'info', RECEIVED: 'info', PROCUREMENT_PENDING: 'info', UNDER_REVIEW: 'info', SUBMITTED: 'info', PROCESSING: 'info',
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{label}</Badge>;
}

export function Alert({ tone = 'info', title, children, className }: { tone?: Exclude<Tone, 'neutral'>; title?: ReactNode; children?: ReactNode; className?: string }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? XCircle : tone === 'warning' ? AlertTriangle : Info;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={clsx('flex gap-3 rounded-[var(--radius-card)] border p-4', toneClass[tone], className)}>
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 text-ink">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={clsx(title && 'mt-1', 'text-sm')}>{children}</div> : null}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-steel">
      <Loader2 aria-hidden className="size-5 animate-spin" />
      <span>{label}</span>
    </span>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line bg-surface px-6 py-12 text-center">
      <span className="text-steel">{icon ?? <PackageX aria-hidden className="size-10" />}</span>
      <p className="text-lg font-semibold">{title}</p>
      {children ? <div className="max-w-prose text-steel">{children}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight text-ink md:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-steel">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** Wide tables scroll inside their own container, never the whole page (spec §15). */
export function TableScroll({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="card overflow-x-auto" role="region" aria-label={caption} tabIndex={0}>
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export const th = 'border-b border-line bg-surface px-3 py-2.5 text-start font-semibold text-steel';
export const td = 'border-b border-line-soft px-3 py-2.5 align-top';

export function Section({ title, children, actions, id }: { title: ReactNode; children: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="card p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="text-lg font-bold">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function DefinitionList({ items }: { items: Array<{ term: ReactNode; value: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[minmax(8rem,auto)_1fr]">
      {items.map((item, i) => (
        <div key={i} className="contents">
          <dt className="text-sm text-steel">{item.term}</dt>
          <dd className="font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
