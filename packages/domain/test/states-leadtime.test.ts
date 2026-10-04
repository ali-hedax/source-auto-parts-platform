import { describe, expect, it } from 'vitest';
import {
  type BusinessCalendar,
  addLeadTime,
  assertTransition,
  canTransition,
  computeQuoteSchedule,
  formatDateTime,
  isTerminal,
  localDateKey,
} from '../src/index.js';

describe('state machines (§10)', () => {
  it('rejects impossible transitions', () => {
    expect(canTransition('payment', 'SUCCEEDED', 'FAILED')).toBe(false);
    expect(canTransition('stockOrder', 'AWAITING_PAYMENT', 'SHIPPED')).toBe(false);
    expect(canTransition('procurement', 'AWAITING_PAYMENT', 'SOURCING')).toBe(false);
    expect(() => assertTransition('quoteVersion', 'SUPERSEDED', 'ACCEPTED')).toThrow(/INVALID_TRANSITION|not allowed/);
  });

  it('A13: a superseded quote version is terminal', () => {
    expect(isTerminal('quoteVersion', 'SUPERSEDED')).toBe(true);
    expect(canTransition('quoteVersion', 'SENT', 'SUPERSEDED')).toBe(true);
  });

  it('A14: procurement cannot start before payment', () => {
    expect(canTransition('procurement', 'AWAITING_PAYMENT', 'PROCUREMENT_PENDING')).toBe(true);
    expect(canTransition('procurement', 'AWAITING_PAYMENT', 'PURCHASED')).toBe(false);
  });

  it('requires reasons for cancellation, hold and exceptions', () => {
    expect(() => assertTransition('stockOrder', 'CONFIRMED', 'CANCELLED')).toThrow(/REASON_REQUIRED|reason/);
    expect(() => assertTransition('stockOrder', 'CONFIRMED', 'CANCELLED', 'customer request')).not.toThrow();
    expect(() => assertTransition('procurement', 'SOURCING', 'ON_HOLD', '  ')).toThrow();
  });
});

describe('lead time and schedule (§10, A15)', () => {
  const tehranCalendar: BusinessCalendar = {
    id: 'default',
    timeZone: 'Asia/Tehran',
    weekendDays: [5], // Friday
    holidays: ['2026-10-05'],
  };

  it('adds hours and calendar days', () => {
    const origin = new Date('2026-10-01T06:30:00Z'); // 10:00 Tehran, Thursday
    expect(addLeadTime(origin, 48, 'HOURS', 'CALENDAR', null).toISOString()).toBe('2026-10-03T06:30:00.000Z');
    expect(addLeadTime(origin, 3, 'DAYS', 'CALENDAR', null).toISOString()).toBe('2026-10-04T06:30:00.000Z');
  });

  it('skips configured weekend days and holidays for business days', () => {
    const origin = new Date('2026-10-01T06:30:00Z'); // Thu
    // Fri 2 (weekend) skip, Sat 3 = 1, Sun 4 = 2, Mon 5 holiday skip, Tue 6 = 3
    const result = addLeadTime(origin, 3, 'DAYS', 'BUSINESS', tehranCalendar);
    expect(localDateKey(result, 'Asia/Tehran')).toBe('2026-10-06');
  });

  it('refuses business days without a calendar instead of guessing holidays', () => {
    expect(() => addLeadTime(new Date(), 2, 'DAYS', 'BUSINESS', null)).toThrow(/BUSINESS_CALENDAR_REQUIRED|calendar/);
  });

  it('ships multi-item quotes together, governed by the slowest item, with shipping separate', () => {
    const origin = new Date('2026-10-01T06:30:00Z');
    const schedule = computeQuoteSchedule(
      origin,
      [
        { itemId: 'a', leadTime: { min: 48, max: 48, unit: 'HOURS', dayKind: 'CALENDAR' } },
        { itemId: 'b', leadTime: { min: 4, max: 7, unit: 'DAYS', dayKind: 'CALENDAR' } },
      ],
      { min: 1, max: 2, unit: 'DAYS', dayKind: 'CALENDAR' },
      null,
    );
    expect(schedule.governingItemIds).toEqual(['b']);
    expect(schedule.readyToShip.earliest.toISOString()).toBe('2026-10-05T06:30:00.000Z');
    expect(schedule.readyToShip.latest.toISOString()).toBe('2026-10-08T06:30:00.000Z');
    expect(schedule.delivery?.latest.toISOString()).toBe('2026-10-10T06:30:00.000Z');
  });

  it('shows Jalali dates in Persian and Gregorian in English for the same instant', () => {
    const instant = new Date('2026-10-01T06:30:00Z');
    expect(formatDateTime(instant, 'en', false)).toContain('2026');
    const fa = formatDateTime(instant, 'fa', false);
    expect(fa).toContain('۱۴۰۵');
    expect(fa).toContain('مهر');
  });
});
