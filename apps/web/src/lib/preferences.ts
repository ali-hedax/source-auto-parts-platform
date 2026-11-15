import 'server-only';
import { cookies } from 'next/headers';

export const CURRENCY_PREF_COOKIE = 'hedax_currency';

/** Display currency is independent from language (FA+AED and EN+IRR both work, spec §9.1). */
export async function displayCurrency(): Promise<'IRR' | 'AED'> {
  const value = (await cookies()).get(CURRENCY_PREF_COOKIE)?.value;
  return value === 'AED' ? 'AED' : 'IRR';
}
