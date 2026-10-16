import { toAsciiDigits } from './money.js';

/**
 * Bulk product photos: the file name carries the part's technical number (or SKU)
 * and optionally the photo's position: "0450102805.jpg", "0450102805-2.jpg",
 * "0450102805_3.webp", "0450102805 (4).png".
 *
 * A trailing "-N" is ambiguous ("ABC-12" may itself be a code), so this returns the
 * readings in order of preference: the whole name first, then the name without the
 * position suffix. The caller uses the first reading whose code matches a product.
 */
export interface PhotoCodeReading {
  code: string;
  /** Photo position (1 when the name has no suffix); photos of a part are uploaded in this order. */
  position: number;
}

const POSITION_SUFFIX = /^(.+?)\s*(?:[-_]\s*(\d{1,2})|\(\s*(\d{1,2})\s*\))$/;

export function photoCodeReadings(filename: string): PhotoCodeReading[] {
  // Folder uploads give "folder/sub/name.jpg"; only the last part is the name.
  const base = filename.split(/[\\/]/).pop() ?? '';
  const stem = toAsciiDigits(base.replace(/\.[A-Za-z0-9]{1,5}$/, '')).normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!stem) return [];
  const m = POSITION_SUFFIX.exec(stem);
  const code = (m?.[1] ?? '').trim();
  if (!m || !code) return [{ code: stem, position: 1 }];
  const position = Number(m[2] ?? m[3]);
  // "(N)" is never part of a code: it is how operating systems name copies.
  if (m[3] !== undefined) return [{ code, position }];
  return [{ code: stem, position: 1 }, { code, position }];
}

/** Most codes one lookup request may ask about. */
export const MAX_PHOTO_CODES_PER_LOOKUP = 500;
