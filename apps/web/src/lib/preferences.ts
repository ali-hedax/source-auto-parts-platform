import 'server-only';
import { cookies } from 'next/headers';
import type { MoneyUnit } from './money-unit';

export const CURRENCY_PREF_COOKIE = 'hedax_currency';

/**
 * The viewer's price unit (independent of language, spec §9.1): Toman by default, rial or dirham
 * when chosen in the unit picker. Toman is a display form of rial (÷10), never a currency of its own.
 */
export async function displayUnit(): Promise<MoneyUnit> {
  const value = (await cookies()).get(CURRENCY_PREF_COOKIE)?.value;
  return value === 'AED' ? 'AED' : value === 'IRR' ? 'IRR' : 'IRT';
}

/** The currency the API prices in for this viewer (Toman is computed from IRR). */
export async function displayCurrency(): Promise<'IRR' | 'AED'> {
  return (await displayUnit()) === 'AED' ? 'AED' : 'IRR';
}
