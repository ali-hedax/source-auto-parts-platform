import { toAsciiDigits, toPersianDigits } from './money.js';

/**
 * Jalali (Solar Hijri, Iran's official calendar) ↔ Gregorian for date-only
 * values such as business-calendar holidays (spec: Persian screens show Shamsi
 * dates). Instants are displayed with Intl's Persian calendar; this module is
 * for reading what people type. Algorithm: Kazimierz Borkowski's, the one used
 * by the jalaali-js library; valid for Jalali years 1–3177. Checked day by day
 * against ICU's Persian calendar in the unit tests.
 */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

/** Leap state of a Jalali year (0 = leap), its Gregorian year and the March day of 1 Farvardin. */
function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0] as number;
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i] as number;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

/** Julian day number of a Gregorian date. */
function g2d(gy: number, gm: number, gd: number): number {
  const d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

function d2g(jdn: number): CalendarDate {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const day = div(mod(i, 153), 5) + 1;
  const month = mod(div(i, 153), 12) + 1;
  const year = div(j, 1461) - 100100 + div(8 - month, 6);
  return { year, month, day };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): CalendarDate {
  const gy = d2g(jdn).year;
  let year = gy - 621;
  const r = jalCal(year);
  let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { year, month: 1 + div(k, 31), day: mod(k, 31) + 1 };
    k -= 186;
  } else {
    year -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { year, month: 7 + div(k, 30), day: mod(k, 30) + 1 };
}

const inRange = (jy: number) => Number.isInteger(jy) && jy >= 1 && jy < 3178;

export function isJalaliLeapYear(jy: number): boolean {
  return inRange(jy) && jalCal(jy).leap === 0;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}

export function isValidJalaliDate(jy: number, jm: number, jd: number): boolean {
  return inRange(jy) && Number.isInteger(jm) && jm >= 1 && jm <= 12 && Number.isInteger(jd) && jd >= 1 && jd <= jalaliMonthLength(jy, jm);
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): CalendarDate {
  if (!isValidJalaliDate(jy, jm, jd)) throw new RangeError(`Invalid Jalali date ${jy}/${jm}/${jd}`);
  return d2g(j2d(jy, jm, jd));
}

export function gregorianToJalali(gy: number, gm: number, gd: number): CalendarDate {
  return d2j(g2d(gy, gm, gd));
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** "2026-03-21" → { year: 1405, month: 1, day: 1 }; null when the text is not a real Gregorian date. */
export function isoDateToJalali(iso: string): CalendarDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [gy, gm, gd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const back = d2g(g2d(gy, gm, gd));
  if (back.year !== gy || back.month !== gm || back.day !== gd) return null;
  return gregorianToJalali(gy, gm, gd);
}

/** "2026-03-21" → "۱۴۰۵/۰۱/۰۱" (or "1405/01/01" with latin digits); the input itself when it is not a date. */
export function formatIsoDateAsJalali(iso: string, digits: 'fa' | 'latin' = 'fa'): string {
  const j = isoDateToJalali(iso);
  if (!j) return iso;
  const text = `${pad(j.year, 4)}/${pad(j.month)}/${pad(j.day)}`;
  return digits === 'fa' ? toPersianDigits(text) : text;
}

/**
 * Reads a typed Shamsi date — «۱۴۰۵/۰۱/۰۱», "1405-1-1", Arabic-Indic or ASCII
 * digits, "/" "-" or "." between year, month and day — and returns the
 * Gregorian date as "YYYY-MM-DD"; null when it is not a real Jalali date.
 */
export function parseJalaliDateToIso(text: string): string | null {
  const m = /^\s*(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*$/.exec(toAsciiDigits(text));
  if (!m) return null;
  const [jy, jm, jd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isValidJalaliDate(jy, jm, jd)) return null;
  const g = jalaliToGregorian(jy, jm, jd);
  return `${pad(g.year, 4)}-${pad(g.month)}-${pad(g.day)}`;
}
