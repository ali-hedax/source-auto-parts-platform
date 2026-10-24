/**
 * Shown only where a part has no photo: a SOURCE "technical drawing" tile (blueprint grid, a hub
 * drawn in signal blue, the brand mark) with an honest «no image» label. Inline SVG and CSS only — no
 * download, and never a stand-in that could pass for the real part.
 */
export function PartPlaceholder({ label, variant = 'card' }: { label: string; variant?: 'card' | 'hero' | 'thumb' }) {
  const thumb = variant === 'thumb';
  return (
    <div className={`part-placeholder flex h-full w-full flex-col items-center justify-center ${thumb ? 'gap-0' : 'gap-2'}`} data-variant={variant}>
      <svg viewBox="0 0 120 120" aria-hidden className={thumb ? 'size-9' : variant === 'hero' ? 'size-32 sm:size-40' : 'size-16 sm:size-20'} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <circle cx="60" cy="56" r="44" opacity=".55" />
        <circle cx="60" cy="56" r="33" opacity=".35" strokeDasharray="2 4" />
        <circle cx="60" cy="56" r="15" />
        <circle cx="60" cy="56" r="6" opacity=".7" />
        {[0, 72, 144, 216, 288].map((a) => {
          const r = (a * Math.PI) / 180;
          return <circle key={a} cx={60 + 24 * Math.cos(r)} cy={56 + 24 * Math.sin(r)} r="3.2" />;
        })}
        {thumb ? null : <>
          <path d="M16 112h88" opacity=".5" />
          <path d="M16 108v8M104 108v8" opacity=".5" />
          <path d="M60 4v8M60 100v8M4 56h8M108 56h8" opacity=".4" />
        </>}
      </svg>
      {thumb ? <span className="sr-only">{label}</span> : <>
        <span className="part-placeholder-mark" dir="ltr">SOURCE</span>
        <span className="text-xs font-medium text-mist">{label}</span>
      </>}
    </div>
  );
}
