'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * How storefront prices are shown. «IRT» (Toman) is a display unit only: amounts stay IRR (rial)
 * everywhere in the contract, payment and admin, and are divided by ten just before they are printed.
 * Without a provider (admin, staff pages) prices keep their own currency.
 */
export type MoneyUnit = 'IRT' | 'IRR' | 'AED';

const MoneyUnitContext = createContext<MoneyUnit | null>(null);

export function MoneyUnitProvider({ unit, children }: { unit: MoneyUnit; children: ReactNode }) {
  return <MoneyUnitContext.Provider value={unit}>{children}</MoneyUnitContext.Provider>;
}

export function useMoneyUnit(): MoneyUnit | null {
  return useContext(MoneyUnitContext);
}
