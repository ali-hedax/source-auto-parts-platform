import { toAsciiDigits } from './money.js';

/**
 * Search normalization for Persian/Arabic/English part names.
 * The original text is stored untouched; this function produces the
 * comparison form written to `search_text` and applied to queries.
 */
const CHAR_MAP: Record<string, string> = {
  'ي': 'ی', // Arabic yeh ي → Persian yeh ی
  'ى': 'ی', // alef maksura ى → ی
  'ك': 'ک', // Arabic kaf ك → Persian keheh ک
  'ة': 'ه', // teh marbuta ة → ه
  'ۀ': 'ه', // heh with yeh above ۀ → ه
  'أ': 'ا', // أ → ا
  'إ': 'ا', // إ → ا
  'آ': 'ا', // آ → ا (users often omit the madda)
  'ٱ': 'ا', // ٱ → ا
  'ؤ': 'و', // ؤ → و
};

// Harakat, superscript alef, tatweel.
const STRIP_RE = /[\u064B-\u065F\u0670\u0640]/g;
// ZWNJ, ZWJ, and every other kind of whitespace/joiner become a plain space.
const SPACE_RE = /[\s\u200B-\u200F\u202A-\u202E\u2066-\u2069\u00A0\uFEFF]+/g;
// Punctuation that should separate words (keeps letters/digits/spaces).
const PUNCT_RE = /[.,;:!?()[\]{}"'`\u00AB\u00BB\u060C\u061B\u061F_\\/|+*=<>~^#@&%$-]+/g;

export function normalizeSearchText(input: string): string {
  let text = input.normalize('NFKC');
  text = Array.from(text, (ch) => CHAR_MAP[ch] ?? ch).join('');
  text = text.replace(STRIP_RE, '');
  text = toAsciiDigits(text);
  text = text.toLocaleLowerCase('en-US');
  text = text.replace(PUNCT_RE, ' ');
  text = text.replace(SPACE_RE, ' ').trim();
  return text;
}

/** Same as normalizeSearchText but without spaces: matches "لنت‌ترمز" with "لنت ترمز" and "لنتترمز". */
export function compactSearchText(input: string): string {
  return normalizeSearchText(input).replace(/ /g, '');
}

/** Builds the stored search document from all names, aliases and codes of a product. */
export function buildSearchDocument(parts: ReadonlyArray<string | null | undefined>): { text: string; compact: string } {
  const text = parts
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map(normalizeSearchText)
    .join(' ');
  return { text, compact: text.replace(/ /g, '') };
}

/** Query tokens used for AND-matching; single characters are dropped as noise. */
export function searchTokens(query: string): string[] {
  const unique = new Set(normalizeSearchText(query).split(' ').filter((t) => t.length >= 2));
  return [...unique].slice(0, 8);
}
