import sharp from 'sharp';
import { IMAGE_KINDS, inspectFile } from '@hedax/domain';
import { badRequest } from '../../common/errors.js';
import type { MalwareScanner } from '../../common/storage/scanner.js';

/**
 * A photo for the public store, processed like product photos: the bytes must be a real JPG, PNG or
 * WebP, pass the malware scan, and are re-encoded to WebP (EXIF stripped, orientation applied, at
 * most 1600 px). Nothing of the original file is published.
 */
export async function processPublicImage(scanner: MalwareScanner, file: { originalname: string; buffer: Buffer }): Promise<{ data: Buffer; width: number; height: number }> {
  const inspection = inspectFile(file.originalname, new Uint8Array(file.buffer));
  if (inspection.verdict !== 'ACCEPT' || !inspection.kind || !IMAGE_KINDS.includes(inspection.kind)) {
    throw badRequest('INVALID_IMAGE', 'Only JPG, PNG or WebP images are accepted', { reason: inspection.reason ?? 'NOT_AN_IMAGE' });
  }
  const scan = await scanner.scan(file.buffer);
  if (!scan.clean) throw badRequest('FILE_REJECTED', 'The file did not pass the security scan');
  try {
    const { data, info } = await sharp(file.buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw badRequest('INVALID_IMAGE', 'The image could not be processed');
  }
}
