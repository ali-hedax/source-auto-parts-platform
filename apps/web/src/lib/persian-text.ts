/**
 * Display clean-up for catalogue names typed or imported with Arabic letters: «ي» «ى» «ك» become the
 * Persian «ی» «ک», and a Persian word glued to a Latin code gets a space («چراغ05402068» →
 * «چراغ 05402068»). Only what is shown changes; the stored names, slugs and search are untouched.
 */
const PERSIAN_LETTER = '[\\u0621-\\u063A\\u0641-\\u064A\\u067E\\u0686\\u0698\\u06A9\\u06AF\\u06CC]';
const LATIN = '[A-Za-z0-9]';
const GLUED = new RegExp(`(${PERSIAN_LETTER})(${LATIN})|(${LATIN})(${PERSIAN_LETTER})`, 'g');

export function persianText(value: string): string;
export function persianText(value: string | null | undefined): string | null | undefined;
export function persianText(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  return value
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(GLUED, (_m, a, b, c, d) => (a ? `${a} ${b}` : `${c} ${d}`))
    .replace(/ {2,}/g, ' ');
}
