/** Preserve explicit zero padding in Excel identifiers without guessing lost digits.
 * Only a plain integer zero mask is supported; money/date/scientific formats stay numeric.
 */
export function zeroPaddedInteger(value: unknown, numFmt: string | undefined): string | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || !numFmt || !/^0{2,80}$/.test(numFmt)) return null;
  return String(value).padStart(numFmt.length, '0');
}
