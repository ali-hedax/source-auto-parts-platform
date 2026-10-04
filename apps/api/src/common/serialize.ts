import type { MoneyDto } from '@hedax/contracts';
import type { CurrencyCode } from '@hedax/domain';

/** Money always leaves the API as { currency, amountMinor: string } — never a JS number. */
export function moneyDto(currency: CurrencyCode | 'IRR' | 'AED', minor: bigint): MoneyDto {
  return { currency, amountMinor: minor.toString() };
}

export function irr(minor: bigint): MoneyDto {
  return moneyDto('IRR', minor);
}

export function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

/** Prisma Decimal → canonical string (no float conversion). */
export function decimalString(value: { toString(): string } | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toString();
}

/** JSON-safe conversion for snapshots stored in Json columns (bigint → string). */
export function toJsonSafe<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}
