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

/** A part code, SKU, VIN or reference number: isolated LTR and set in the code face (tabular figures). */
export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={clsx('code', className)}>
      {children}
    </bdi>
  );
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-surface text-ink border-line',
  success: 'bg-success-soft text-success border-success/30',
  warning: 'bg-warning-soft text-warning border-warning/30',
  danger: 'bg-danger-soft text-danger border-danger/30',
  info: 'bg-info-soft text-info border-info/30',
};

const toneIcon: Record<Tone, ReactNode> = {
  neutral: <CircleDot aria-hidden className="size-3.5 shrink-0" />,
  success: <CheckCircle2 aria-hidden className="size-3.5 shrink-0" />,
  warning: <Clock aria-hidden className="size-3.5 shrink-0" />,
  danger: <XCircle aria-hidden className="size-3.5 shrink-0" />,
  info: <Info aria-hidden className="size-3.5 shrink-0" />,
};

/** Status is conveyed by text + icon, never by colour alone. */
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] border px-2 py-px text-xs font-semibold leading-5', toneClass[tone], className)}>
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
    <div role={tone === 'danger' ? 'alert' : 'status'} className={clsx('flex gap-3 rounded-[var(--radius-card)] border px-4 py-3.5', toneClass[tone], className)}>
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1 text-ink">
        {title ? <p className="font-semibold leading-7">{title}</p> : null}
        {children ? <div className={clsx(title && 'mt-0.5', 'text-sm leading-7')}>{children}</div> : null}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 py-2 text-sm text-steel">
      <Loader2 aria-hidden className="size-5 animate-spin text-tech" />
      <span>{label}</span>
    </span>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-line-soft bg-white px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-canvas text-steel [&>svg]:size-7">{icon ?? <PackageX aria-hidden className="size-7" />}</span>
      <p className="max-w-prose text-lg font-bold leading-8">{title}</p>
      {children ? <div className="flex max-w-prose flex-col items-center text-steel">{children}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 md:mb-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-ink md:text-[1.75rem]">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl leading-7 text-steel">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** Wide tables scroll inside their own container, never the whole page (spec §15); below lg the first column stays pinned. */
export function TableScroll({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="card overflow-x-auto" role="region" aria-label={caption} tabIndex={0}>
      <table className="data-table w-full min-w-[40rem] border-separate border-spacing-0 text-sm [&_tbody_tr:hover>td]:bg-surface [&_tbody_tr:last-child>td]:border-b-0">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export const th = 'whitespace-nowrap border-b border-line bg-surface px-4 py-2.5 text-start text-[0.8125rem] font-semibold text-steel first:rounded-ss-[var(--radius-card)] last:rounded-se-[var(--radius-card)]';
export const td = 'border-b border-line-soft px-4 py-3 align-top transition-colors duration-100';

export function Section({ title, children, actions, id }: { title: ReactNode; children: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="card p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line-soft pb-3">
        <h2 id={id} className="text-lg font-bold">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Ruled specification rows: term on the start side, value beside it; stacked whenever the list itself is narrow (container query, so it also holds at large text sizes). */
export function DefinitionList({ items }: { items: Array<{ term: ReactNode; value: ReactNode }> }) {
  return (
    <dl className="@container w-full divide-y divide-line-soft">
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-1 gap-x-6 gap-y-0.5 py-2.5 first:pt-0 last:pb-0 @sm:grid-cols-[minmax(8rem,auto)_minmax(0,1fr)]">
          <dt className="text-sm leading-7 text-steel">{item.term}</dt>
          <dd className="min-w-0 font-medium leading-7 [&_.code]:whitespace-normal [&_.code]:[overflow-wrap:anywhere]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
