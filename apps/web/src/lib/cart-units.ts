import { formatQuantity } from '@hedax/domain';

/** Total units across the lines (2 of one part and 3 of another = 5). Summed in thousandths, so 0.1 + 0.2 stays exact. */
export function cartUnitCount(lines: ReadonlyArray<{ quantity: number }>): number {
  return lines.reduce((sum, line) => sum + Math.round(line.quantity * 1000), 0) / 1000;
}

/** The text on the cart icon; large totals stop at 99+ so the badge keeps its size. */
export function cartBadgeText(count: number, locale: 'fa' | 'en'): string {
  return count > 99 ? `${formatQuantity(99, locale)}+` : formatQuantity(count, locale);
}
