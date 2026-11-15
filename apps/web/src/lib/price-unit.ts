/** The default sales unit: a price per piece needs no «/ عدد» beside it (owner, 2026-11-15). */
export const PIECE_UNIT = 'عدد';

/** Whether a price shows its unit («/ دست», «/ لیتر»); a price per «عدد» does not. */
export function showsPriceUnit(unit: { name: string } | null | undefined): boolean {
  return !!unit && unit.name.trim() !== PIECE_UNIT;
}
