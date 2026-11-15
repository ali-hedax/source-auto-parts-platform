import 'server-only';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The Vazirmatn faces the first screen of every storefront page is set in (body 400, labels 500, headings
 * 600–800, which use the 700 file) and, on the home page, the typed headline's code font. The browser
 * otherwise finds these fonts only after it has read the stylesheet. The bundler gives the @fontsource
 * files a content hash, so the names are looked up in the build output once; a name not found there
 * (a development server, a renamed file) is simply not preloaded. The headline font is not hashed.
 *
 * They are rendered as <link rel="preload"> elements, which React places in the document head. A
 * ReactDOM.preload() call from a server component only reached the page as a hint inside the streamed
 * page data, which the browser reads after the stylesheet, so it preloaded nothing (seen on 2026-11-15).
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

/** Addresses of the first-screen Vazirmatn files in this build (empty when they cannot be found). */
export function firstScreenFonts(): string[] {
  return hashedFonts();
}

/** The typed home headline: Vazir Code in Persian, JetBrains Mono in English (atelier-refinements.css). */
export function headlineFont(locale: string): string {
  return locale === 'fa' ? '/fonts/atelier/vazir-code.woff2' : '/fonts/atelier/jetbrains-mono.woff2';
}
