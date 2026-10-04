import { describe, expect, it } from 'vitest';
import {
  formatIsoDateAsJalali,
  gregorianToJalali,
  isJalaliLeapYear,
  isoDateToJalali,
  isValidJalaliDate,
  jalaliMonthLength,
  jalaliToGregorian,
  parseJalaliDateToIso,
} from '../src/index.js';

/** ICU's Persian calendar (what browsers use to display Shamsi dates) as the reference. */
const icu = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
function icuJalali(date: Date) {
  const parts = Object.fromEntries(icu.formatToParts(date).map((p) => [p.type, p.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

describe('Jalali calendar (holidays in the business calendar)', () => {
  it('agrees with the browser Persian calendar on every day from 1990 to 2060, both ways', () => {
    const mismatches: string[] = [];
    for (let t = Date.UTC(1990, 0, 1); t <= Date.UTC(2060, 11, 31); t += 86_400_000) {
      const d = new Date(t);
      const [gy, gm, gd] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
      const ours = gregorianToJalali(gy, gm, gd);
      const reference = icuJalali(d);
      if (ours.year !== reference.year || ours.month !== reference.month || ours.day !== reference.day) {
        mismatches.push(`${gy}-${gm}-${gd}: ${ours.year}/${ours.month}/${ours.day} ≠ ICU ${reference.year}/${reference.month}/${reference.day}`);
      }
      const back = jalaliToGregorian(ours.year, ours.month, ours.day);
      if (back.year !== gy || back.month !== gm || back.day !== gd) mismatches.push(`round trip ${gy}-${gm}-${gd}`);
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it('knows Nowruz, leap years and month lengths', () => {
    expect(jalaliToGregorian(1405, 1, 1)).toEqual({ year: 2026, month: 3, day: 21 });
    expect(jalaliToGregorian(1404, 1, 1)).toEqual({ year: 2025, month: 3, day: 21 });
    expect(isJalaliLeapYear(1403)).toBe(true);
    expect(isJalaliLeapYear(1404)).toBe(false);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
    expect(jalaliMonthLength(1404, 6)).toBe(31);
    expect(jalaliMonthLength(1404, 7)).toBe(30);
    expect(isValidJalaliDate(1404, 12, 30)).toBe(false);
    expect(isValidJalaliDate(1403, 12, 30)).toBe(true);
  });

  it('reads what people type: Persian, Arabic-Indic or ASCII digits and / - . separators', () => {
    expect(parseJalaliDateToIso('۱۴۰۵/۰۱/۰۱')).toBe('2026-03-21');
    expect(parseJalaliDateToIso('١٤٠٥/١/١٣')).toBe('2026-04-02');
    expect(parseJalaliDateToIso(' 1405-1-12 ')).toBe('2026-04-01');
    expect(parseJalaliDateToIso('1404.11.22')).toBe('2026-02-11');
  });

  it('rejects text that is not a real Shamsi date', () => {
    for (const bad of ['', '1404/12/30', '1405/13/01', '1405/00/10', '1405/07/31', '2026-03-21x', '14050101', 'فردا', '1405/1']) {
      expect(parseJalaliDateToIso(bad), bad).toBeNull();
    }
  });

  it('shows stored Gregorian dates as Shamsi with Persian digits', () => {
    expect(formatIsoDateAsJalali('2026-03-21')).toBe('۱۴۰۵/۰۱/۰۱');
    expect(formatIsoDateAsJalali('2026-03-21', 'latin')).toBe('1405/01/01');
    expect(isoDateToJalali('2026-02-30')).toBeNull();
    expect(formatIsoDateAsJalali('not a date')).toBe('not a date');
  });
});
