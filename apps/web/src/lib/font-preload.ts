import 'server-only';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { preload } from 'react-dom';

/**
 * The Vazirmatn faces the first screen of every storefront page is set in (body 400, labels 500, headings
 * 600–800, which use the 700 file) and, on the home page, the typed headline's code font. The browser
 * otherwise finds these fonts only after it has read the stylesheet. The bundler gives the @fontsource
 * files a content hash, so the names are looked up in the build output once; a name not found there
 * (a development server, a renamed file) is simply not preloaded. The headline font is not hashed.
 */
const FIRST_SCREEN = ['vazirmatn-arabic-400-normal', 'vazirmatn-arabic-500-normal', 'vazirmatn-arabic-700-normal'];

let found: string[] | null = null;

function hashedFonts(): string[] {
  if (found) return found;
  try {
    const files = readdirSync(join(process.cwd(), '.next', 'static', 'media'));
    found = FIRST_SCREEN.flatMap((base) => {
      const file = files.find((f) => f.startsWith(`${base}.`) && f.endsWith('.woff2'));
      return file ? [`/_next/static/media/${file}`] : [];
    });
  } catch {
    found = [];
  }
  return found;
}

const asFont = { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' } as const;

export function preloadFirstScreenFonts(): void {
  for (const href of hashedFonts()) preload(href, asFont);
}

/** The typed home headline: Vazir Code in Persian, JetBrains Mono in English (atelier-refinements.css). */
export function preloadHeadlineFont(locale: string): void {
  preload(locale === 'fa' ? '/fonts/atelier/vazir-code.woff2' : '/fonts/atelier/jetbrains-mono.woff2', asFont);
}
