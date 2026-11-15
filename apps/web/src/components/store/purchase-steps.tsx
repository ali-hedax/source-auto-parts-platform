import { Check } from 'lucide-react';

/** The purchase path at a glance (cart → address and delivery → payment), shown in the chapter band. */
export function PurchaseSteps({ current, labels, label, locale }: { current: 1 | 2 | 3; labels: [string, string, string]; label: string; locale: string }) {
  const digits = (n: number) => n.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US');
  return (
    <ol aria-label={label} className="mt-6 flex flex-nowrap items-center gap-x-1.5 whitespace-nowrap text-[0.8125rem] sm:gap-x-2 sm:text-sm">
      {labels.map((text, i) => {
        const step = i + 1;
        const done = step < current;
        const now = step === current;
        return (
          <li key={text} aria-current={now ? 'step' : undefined} className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            {i ? <span aria-hidden className={`h-px w-3 shrink-0 sm:w-10 ${done || now ? 'bg-signal' : 'bg-white/20'}`} /> : null}
            <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold sm:size-7 ${now ? 'bg-paper text-stage' : done ? 'bg-[#2a1c16] text-[#fbf8f3]' : 'border border-white/25 text-mist'}`}>
              {done ? <Check className="size-4" /> : digits(step)}
            </span>
            <span className={now ? 'font-bold text-white' : 'text-mist'}>{text}</span>
          </li>
        );
      })}
    </ol>
  );
}
