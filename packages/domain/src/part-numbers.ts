import { toAsciiDigits } from './money.js';
import { compactSearchText } from './search-normalize.js';
import { splitVehicleList } from './vehicles.js';

/**
 * Technical numbers of a part («شمارهٔ فنی»): compared by a key that ignores how people type them —
 * spaces, dashes, dots and slashes, case, and Persian/Arabic digits («۰۴۵۰-۱۰۲ ۸۰۵» = «0450102805» =
 * «0450.102.805»). Also the list, specs and fitment cells shared by the Excel and brand imports.
 */
export function partNumberKey(raw: string): string {
  return compactSearchText(raw).toUpperCase().slice(0, 80);
}

/** A list cell («A-1, B 2؛ C3») → unique numbers in order (compared by partNumberKey). */
export function parseNumberList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[،,؛;\n|]+/)) {
    const item = part.replace(/\s+/g, ' ').trim();
    const key = partNumberKey(item);
    if (!item || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.slice(0, 80));
  }
  return out;
}

export interface SpecPair {
  label: string;
  value: string;
}

/** «ولتاژ: 12V؛ قطر: 40mm» (or one per line) → [{label: 'ولتاژ', value: '12V'}, …]; parts without «:» are reported. */
export function parseSpecs(text: string): { specs: SpecPair[]; invalid: string[] } {
  const specs: SpecPair[] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[؛;\n]+/)) {
    const item = part.trim();
    if (!item) continue;
    const at = item.search(/[:：]/);
    const label = at > 0 ? item.slice(0, at).trim() : '';
    const value = at > 0 ? item.slice(at + 1).trim() : '';
    if (!label || !value) invalid.push(item.slice(0, 60));
    else specs.push({ label: label.slice(0, 80), value: value.slice(0, 200) });
  }
  return { specs, invalid };
}

export interface FitmentItem {
  /** The vehicle (and model) as written: «پژو 405». */
  text: string;
  yearFrom: number | null;
  yearTo: number | null;
}

const YEARS = /\(\s*([0-9۰-۹٠-٩]{4})\s*(?:[-–—]|تا)?\s*([0-9۰-۹٠-٩]{4})?\s*\)\s*$/;
const digits = (s: string) => Number(toAsciiDigits(s));

/** A year of manufacture: Persian (1300–1500) or Gregorian (1950–2100). */
export function isPlausibleYear(year: number): boolean {
  return (year >= 1300 && year <= 1500) || (year >= 1950 && year <= 2100);
}

/** «پژو 405 (1390-1400)، سمند، دنا (1398)» → vehicle texts with optional years. */
export function parseFitmentList(text: string): { items: FitmentItem[]; invalid: string[] } {
  const items: FitmentItem[] = [];
  const invalid: string[] = [];
  for (const raw of splitVehicleList(text)) {
    const m = YEARS.exec(raw);
    const name = (m ? raw.slice(0, m.index) : raw).trim();
    const from = m?.[1] ? digits(m[1]) : null;
    const to = m?.[2] ? digits(m[2]) : from;
    if (!name || (from !== null && (!isPlausibleYear(from) || !isPlausibleYear(to as number) || (to as number) < from))) {
      invalid.push(raw.slice(0, 60));
      continue;
    }
    items.push({ text: name, yearFrom: from, yearTo: to });
  }
  return { items, invalid };
}
