import { DomainError } from './errors.js';

export const DISPLAY_TIME_ZONE = 'Asia/Tehran';

export type LeadTimeUnit = 'HOURS' | 'DAYS';
export type DayKind = 'CALENDAR' | 'BUSINESS';

export interface LeadTimeRange {
  min: number;
  max: number;
  unit: LeadTimeUnit;
  dayKind: DayKind;
}

/**
 * Business calendar configured by the owner. Holidays are never guessed:
 * only dates listed here (local YYYY-MM-DD in `timeZone`) are skipped.
 * weekendDays uses 0 = Sunday … 6 = Saturday (Friday = 5).
 */
export interface BusinessCalendar {
  id: string;
  timeZone: string;
  weekendDays: readonly number[];
  holidays: readonly string[];
}

export function validateLeadTimeRange(range: LeadTimeRange): void {
  if (!Number.isSafeInteger(range.min) || !Number.isSafeInteger(range.max) || range.min < 0 || range.max < range.min) {
    throw new DomainError('INVALID_LEAD_TIME', 'Lead time must be whole numbers with 0 ≤ min ≤ max');
  }
  if (range.unit === 'HOURS' && range.dayKind === 'BUSINESS') {
    throw new DomainError('INVALID_LEAD_TIME', 'Business-day counting is only supported with DAYS');
  }
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function localParts(instant: Date, timeZone: string): LocalParts {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

function offsetMs(instant: Date, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Converts a local wall-clock time in `timeZone` to the UTC instant. */
export function zonedWallTimeToUtc(p: LocalParts, timeZone: string): Date {
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  let guess = wall - offsetMs(new Date(wall), timeZone);
  guess = wall - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

export function localDateKey(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function isWorkingDay(p: LocalParts, calendar: BusinessCalendar): boolean {
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  if (calendar.weekendDays.includes(weekday)) return false;
  const key = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  return !calendar.holidays.includes(key);
}

function addLocalDays(p: LocalParts, days: number): LocalParts {
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return { ...p, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Adds an amount of lead time to a UTC instant. Calendar days keep the local
 * wall-clock time; business days step over weekend days and configured holidays.
 */
export function addLeadTime(
  origin: Date,
  amount: number,
  unit: LeadTimeUnit,
  dayKind: DayKind,
  calendar: BusinessCalendar | null,
): Date {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new DomainError('INVALID_LEAD_TIME');
  if (unit === 'HOURS') {
    if (dayKind === 'BUSINESS') throw new DomainError('INVALID_LEAD_TIME', 'Business counting requires DAYS');
    return new Date(origin.getTime() + amount * 3_600_000);
  }
  const tz = calendar?.timeZone ?? DISPLAY_TIME_ZONE;
  const start = localParts(origin, tz);
  // Wall-clock parts have whole seconds; keep the origin's milliseconds so N days is exactly N days.
  const subSecond = origin.getTime() - Math.floor(origin.getTime() / 1000) * 1000;
  const at = (p: LocalParts) => new Date(zonedWallTimeToUtc(p, tz).getTime() + subSecond);
  if (dayKind === 'CALENDAR') return at(addLocalDays(start, amount));
  if (!calendar) throw new DomainError('BUSINESS_CALENDAR_REQUIRED', 'Business-day lead time needs a configured calendar');
  if (calendar.weekendDays.length >= 7) throw new DomainError('INVALID_BUSINESS_CALENDAR');
  let cursor = start;
  let remaining = amount;
  let guard = 0;
  while (remaining > 0) {
    cursor = addLocalDays(cursor, 1);
    if (isWorkingDay(cursor, calendar)) remaining -= 1;
    guard += 1;
    if (guard > 3660) throw new DomainError('INVALID_BUSINESS_CALENDAR', 'Calendar has no working days in range');
  }
  return at(cursor);
}

export interface ItemLeadTime {
  itemId: string;
  leadTime: LeadTimeRange;
}

export interface ScheduleWindow {
  earliest: Date;
  latest: Date;
}

export interface QuoteSchedule {
  /** When all items are sourced and ready to ship together (governed by the slowest item). */
  readyToShip: ScheduleWindow;
  /** readyToShip plus the shipping duration; null when shipping time is not known yet. */
  delivery: ScheduleWindow | null;
  governingItemIds: string[];
}

/**
 * Computes the single-shipment schedule for a multi-item quote (spec §10):
 * items ship together, so readiness is the max over items for both bounds.
 * Shipping time is added separately so the customer sees sourcing vs delivery.
 */
export function computeQuoteSchedule(
  origin: Date,
  items: readonly ItemLeadTime[],
  shipping: LeadTimeRange | null,
  calendar: BusinessCalendar | null,
): QuoteSchedule {
  if (items.length === 0) throw new DomainError('EMPTY_QUOTE', 'A schedule needs at least one item');
  let earliest = origin;
  let latest = origin;
  let governing: string[] = [];
  for (const item of items) {
    validateLeadTimeRange(item.leadTime);
    const e = addLeadTime(origin, item.leadTime.min, item.leadTime.unit, item.leadTime.dayKind, calendar);
    const l = addLeadTime(origin, item.leadTime.max, item.leadTime.unit, item.leadTime.dayKind, calendar);
    if (e > earliest) earliest = e;
    if (l > latest) {
      latest = l;
      governing = [item.itemId];
    } else if (l.getTime() === latest.getTime()) {
      governing.push(item.itemId);
    }
  }
  let delivery: ScheduleWindow | null = null;
  if (shipping) {
    validateLeadTimeRange(shipping);
    delivery = {
      earliest: addLeadTime(earliest, shipping.min, shipping.unit, shipping.dayKind, calendar),
      latest: addLeadTime(latest, shipping.max, shipping.unit, shipping.dayKind, calendar),
    };
  }
  return { readyToShip: { earliest, latest }, delivery, governingItemIds: governing };
}

/** Preset choices offered in the quote editor; they are options, never a site-wide promise. */
export const LEAD_TIME_PRESETS: readonly LeadTimeRange[] = [
  { min: 48, max: 48, unit: 'HOURS', dayKind: 'CALENDAR' },
  { min: 3, max: 3, unit: 'DAYS', dayKind: 'CALENDAR' },
  { min: 4, max: 4, unit: 'DAYS', dayKind: 'CALENDAR' },
  { min: 7, max: 7, unit: 'DAYS', dayKind: 'CALENDAR' },
];

/** Jalali (fa) or Gregorian (en) display in Asia/Tehran without changing the instant. */
export function formatDateTime(instant: Date, locale: 'fa' | 'en', withTime = true): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
  };
  const tag = locale === 'fa' ? 'fa-IR-u-ca-persian-nu-arabext' : 'en-GB-u-ca-gregory';
  return new Intl.DateTimeFormat(tag, options).format(instant);
}
