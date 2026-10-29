/**
 * Hand-drawn style contact icons for the footer: a soft painted blob behind an ink line drawing,
 * slightly offset like a brush illustration. Colours follow the theme (currentColor + --ci-paint).
 * Generic glyphs only (no third-party logos).
 */
export type ContactIconName = 'phone' | 'mobile' | 'whatsapp' | 'telegram' | 'bale' | 'instagram' | 'email' | 'hours' | 'address';

const BLOBS = [
  'M12 2.6c4.9-.3 9.6 3.3 9.4 8.8-.2 5.4-4.3 10-9.7 10C6.3 21.4 2.4 17.2 2.6 12 2.8 6.6 6.9 2.9 12 2.6Z',
  'M11.2 2.4c5.4-.6 10.3 2.8 10.4 8.3.1 5.7-4.1 10.6-9.9 10.7-5.4.1-9.4-4.1-9.5-9.3-.1-5.1 3.6-9.1 9-9.7Z',
  'M12.6 2.5c5 .4 9.2 4 8.9 9.4-.3 5.6-4.7 9.8-10 9.6-5.2-.2-9-4.6-8.9-9.7.1-5.3 4.6-9.7 10-9.3Z',
];

const PATHS: Record<ContactIconName, string[]> = {
  phone: ['M7.6 4.8c.6-.5 1.5-.4 2 .2l1.6 2.3c.4.6.3 1.4-.2 1.9l-1 .9c.8 1.9 2.2 3.4 4.1 4.3l.9-1c.5-.5 1.3-.6 1.9-.2l2.3 1.6c.6.5.8 1.4.2 2l-1.1 1.3c-.7.8-1.8 1.1-2.8.8C10.9 17.6 6.5 13.2 5.2 8.7c-.3-1 0-2.1.8-2.8l1.6-1.1Z'],
  mobile: ['M8.4 3.4h7.2c.9 0 1.6.7 1.6 1.6v14c0 .9-.7 1.6-1.6 1.6H8.4c-.9 0-1.6-.7-1.6-1.6V5c0-.9.7-1.6 1.6-1.6Z', 'M10.6 5.8h2.8', 'M11.9 17.9h.2'],
  whatsapp: ['M4.6 19.6l1.1-3.6A8 8 0 1 1 8.6 19l-4 .6Z', 'M9.3 8.2c-.2 2.9 2.3 6 5.6 6.5l1-1.5-1.6-1-1 .7c-1-.5-1.8-1.3-2.3-2.3l.7-1-1-1.6-1.4.2Z'],
  telegram: ['M20.4 4.4 3.7 11c-.6.2-.6 1.1 0 1.3l4.1 1.4 1.6 4.8c.2.6 1 .7 1.4.2l2.3-2.6 4.1 3c.5.4 1.2.1 1.3-.5l2.8-13.2c.1-.6-.5-1.2-.9-1Z', 'M7.8 13.7 17 7.4l-6.5 7.4'],
  bale: ['M12 3.6c4.7 0 8.4 3.4 8.4 7.6s-3.7 7.6-8.4 7.6c-1 0-2-.2-2.9-.5L4.8 20l1.2-3.5C4.5 15.1 3.6 13.3 3.6 11.2c0-4.2 3.7-7.6 8.4-7.6Z', 'M8.6 10.4c.6 2.3 5.9 2.3 6.8 0', 'M12 14.4h.1'],
  instagram: ['M7.6 3.6h8.8c2.2 0 4 1.8 4 4v8.8c0 2.2-1.8 4-4 4H7.6c-2.2 0-4-1.8-4-4V7.6c0-2.2 1.8-4 4-4Z', 'M12 8.3a3.7 3.7 0 1 1 0 7.4 3.7 3.7 0 0 1 0-7.4Z', 'M16.9 7h.1'],
  email: ['M4.4 6.4h15.2c.6 0 1 .4 1 1v9.2c0 .6-.4 1-1 1H4.4c-.6 0-1-.4-1-1V7.4c0-.6.4-1 1-1Z', 'm4 7.2 8 6 8-6'],
  hours: ['M12 3.8a8.2 8.2 0 1 1 0 16.4 8.2 8.2 0 0 1 0-16.4Z', 'M12 7.6V12l3 1.8'],
  address: ['M12 21s-6.4-5.6-6.4-10.6a6.4 6.4 0 1 1 12.8 0C18.4 15.4 12 21 12 21Z', 'M12 8.1a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8Z'],
};

export function ContactIcon({ name, className }: { name: ContactIconName; className?: string }) {
  const blob = BLOBS[Object.keys(PATHS).indexOf(name) % BLOBS.length]!;
  return (
    <span className={`contact-icon ${className ?? ''}`} aria-hidden>
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
        <path d={blob} fill="var(--ci-paint, #e8dfd1)" opacity=".95" />
        <g transform="translate(.35 .3)" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" opacity=".28">
          {PATHS[name].map((d, i) => <path key={i} d={d} />)}
        </g>
        <g stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round">
          {PATHS[name].map((d, i) => <path key={i} d={d} />)}
        </g>
      </svg>
    </span>
  );
}
