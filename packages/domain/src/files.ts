/**
 * Server-side file inspection (spec §11). Operates on raw bytes; never trusts the
 * browser's Content-Type. A passing verdict only makes a file *eligible for
 * malware scanning*; it stays in quarantine until the scanner marks it clean.
 */

export const MB = 1024 * 1024;

export interface UploadPolicy {
  maxFileBytes: number;
  maxFilesPerBatch: number;
  maxBatchBytes: number;
  allowCsv: boolean;
  allowLegacyOffice: boolean;
  /** OOXML zip-bomb limits. */
  maxZipEntries: number;
  maxZipUncompressedBytes: number;
  maxZipCompressionRatio: number;
}

export const DEFAULT_UPLOAD_POLICY: UploadPolicy = {
  maxFileBytes: 20 * MB,
  maxFilesPerBatch: 10,
  maxBatchBytes: 50 * MB,
  allowCsv: true,
  allowLegacyOffice: true,
  maxZipEntries: 5000,
  maxZipUncompressedBytes: 150 * MB,
  maxZipCompressionRatio: 250,
};

export type FileKind = 'jpeg' | 'png' | 'webp' | 'pdf' | 'docx' | 'xlsx' | 'csv' | 'doc' | 'xls';

export const KIND_MIME: Record<FileKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
};

const EXTENSION_KIND: Record<string, FileKind> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
  pdf: 'pdf',
  docx: 'docx',
  xlsx: 'xlsx',
  csv: 'csv',
  doc: 'doc',
  xls: 'xls',
};

export const IMAGE_KINDS: readonly FileKind[] = ['jpeg', 'png', 'webp'];

export type RejectReason =
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'EXTENSION_NOT_ALLOWED'
  | 'CONTENT_MISMATCH'
  | 'EXECUTABLE_CONTENT'
  | 'MARKUP_CONTENT'
  | 'MACRO_CONTENT'
  | 'EMBEDDED_OBJECTS'
  | 'ENCRYPTED_OR_UNREADABLE'
  | 'ZIP_LIMITS_EXCEEDED'
  | 'ZIP_INVALID'
  | 'PDF_ACTIVE_CONTENT'
  | 'INVALID_TEXT_ENCODING';

export interface FileInspection {
  verdict: 'ACCEPT' | 'REJECT';
  kind: FileKind | null;
  mime: string | null;
  extension: string;
  reason?: RejectReason;
  flags: {
    legacyOffice: boolean;
    hasExternalLinks: boolean;
  };
}

export function fileExtension(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/**
 * Display-safe filename: strips paths, control and bidi-override characters
 * (e.g. "invoice‮fdp.exe"), and limits length. Storage keys are random and
 * never derived from this value.
 */
export function sanitizeDisplayFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? 'file';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001F\u007F‎‏‪-‮⁦-⁩]/g, '').trim();
  const safe = cleaned.length > 0 ? cleaned : 'file';
  if (safe.length <= 150) return safe;
  const ext = fileExtension(safe);
  return `${safe.slice(0, 140)}${ext ? `.${ext}` : ''}`;
}

export function checkBatch(files: ReadonlyArray<{ size: number }>, policy: UploadPolicy = DEFAULT_UPLOAD_POLICY):
  | { ok: true }
  | { ok: false; reason: 'TOO_MANY_FILES' | 'BATCH_TOO_LARGE' | 'FILE_TOO_LARGE' } {
  if (files.length > policy.maxFilesPerBatch) return { ok: false, reason: 'TOO_MANY_FILES' };
  let total = 0;
  for (const f of files) {
    if (f.size > policy.maxFileBytes) return { ok: false, reason: 'FILE_TOO_LARGE' };
    total += f.size;
  }
  if (total > policy.maxBatchBytes) return { ok: false, reason: 'BATCH_TOO_LARGE' };
  return { ok: true };
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < Math.min(end, bytes.length); i += 1) s += String.fromCharCode(bytes[i] ?? 0);
  return s;
}

const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP = [0x50, 0x4b, 0x03, 0x04];

function isExecutable(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, [0x4d, 0x5a]) || // MZ (PE)
    startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46]) || // ELF
    startsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe]) ||
    startsWith(bytes, [0xce, 0xfa, 0xed, 0xfe]) ||
    startsWith(bytes, [0xca, 0xfe, 0xba, 0xbe]) || // Mach-O / Java class
    startsWith(bytes, [0x23, 0x21]) // #!
  );
}

function looksLikeMarkup(bytes: Uint8Array): boolean {
  let i = 0;
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) i = 3;
  while (i < bytes.length && i < 512 && [0x20, 0x09, 0x0a, 0x0d].includes(bytes[i] ?? 0)) i += 1;
  return bytes[i] === 0x3c; // '<'
}

function readU16(b: Uint8Array, o: number): number {
  return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
}
function readU32(b: Uint8Array, o: number): number {
  return ((b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16) | ((b[o + 3] ?? 0) << 24)) >>> 0;
}

export interface ZipEntryInfo {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  encrypted: boolean;
}

/** Reads the ZIP central directory without decompressing anything. ZIP64 is rejected. */
export function readZipDirectory(bytes: Uint8Array): ZipEntryInfo[] | null {
  const minEocd = 22;
  if (bytes.length < minEocd) return null;
  const searchStart = Math.max(0, bytes.length - (minEocd + 0xffff));
  let eocd = -1;
  for (let i = bytes.length - minEocd; i >= searchStart; i -= 1) {
    if (readU32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const total = readU16(bytes, eocd + 10);
  const cdSize = readU32(bytes, eocd + 12);
  const cdOffset = readU32(bytes, eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return null;
  if (cdOffset + cdSize > bytes.length) return null;
  const entries: ZipEntryInfo[] = [];
  let p = cdOffset;
  const decoder = new TextDecoder('utf-8', { fatal: false });
  for (let n = 0; n < total; n += 1) {
    if (readU32(bytes, p) !== 0x02014b50) return null;
    const flags = readU16(bytes, p + 8);
    const compressedSize = readU32(bytes, p + 20);
    const uncompressedSize = readU32(bytes, p + 24);
    const nameLen = readU16(bytes, p + 28);
    const extraLen = readU16(bytes, p + 30);
    const commentLen = readU16(bytes, p + 32);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) return null;
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, compressedSize, uncompressedSize, encrypted: (flags & 0x1) === 0x1 });
    p += 46 + nameLen + extraLen + commentLen;
    if (p > bytes.length) return null;
  }
  return entries;
}

function inspectOoxml(bytes: Uint8Array, expected: 'docx' | 'xlsx', policy: UploadPolicy): {
  reason?: RejectReason;
  hasExternalLinks: boolean;
} {
  const entries = readZipDirectory(bytes);
  if (!entries) return { reason: 'ZIP_INVALID', hasExternalLinks: false };
  if (entries.length > policy.maxZipEntries) return { reason: 'ZIP_LIMITS_EXCEEDED', hasExternalLinks: false };
  let totalUncompressed = 0;
  let hasExternalLinks = false;
  const names = new Set<string>();
  for (const e of entries) {
    if (e.encrypted) return { reason: 'ENCRYPTED_OR_UNREADABLE', hasExternalLinks };
    if (e.name.startsWith('/') || e.name.includes('..') || e.name.includes('\\')) return { reason: 'ZIP_INVALID', hasExternalLinks };
    totalUncompressed += e.uncompressedSize;
    if (e.compressedSize > 0 && e.uncompressedSize / e.compressedSize > policy.maxZipCompressionRatio) {
      return { reason: 'ZIP_LIMITS_EXCEEDED', hasExternalLinks };
    }
    const lower = e.name.toLowerCase();
    if (lower.endsWith('vbaproject.bin') || lower.endsWith('vbadata.xml')) return { reason: 'MACRO_CONTENT', hasExternalLinks };
    if (lower.includes('/activex/') || lower.includes('/embeddings/')) return { reason: 'EMBEDDED_OBJECTS', hasExternalLinks };
    if (lower.startsWith('xl/externallinks/')) hasExternalLinks = true;
    names.add(lower);
  }
  if (totalUncompressed > policy.maxZipUncompressedBytes) return { reason: 'ZIP_LIMITS_EXCEEDED', hasExternalLinks };
  if (!names.has('[content_types].xml')) return { reason: 'CONTENT_MISMATCH', hasExternalLinks };
  const marker = expected === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
  if (!names.has(marker)) return { reason: 'CONTENT_MISMATCH', hasExternalLinks };
  return { hasExternalLinks };
}

function containsAscii(bytes: Uint8Array, needle: string): boolean {
  const n = needle.length;
  outer: for (let i = 0; i + n <= bytes.length; i += 1) {
    for (let j = 0; j < n; j += 1) if (bytes[i + j] !== needle.charCodeAt(j)) continue outer;
    return true;
  }
  return false;
}

function containsUtf16le(bytes: Uint8Array, needle: string): boolean {
  const encoded: number[] = [];
  for (const ch of needle) encoded.push(ch.charCodeAt(0), 0);
  outer: for (let i = 0; i + encoded.length <= bytes.length; i += 1) {
    for (let j = 0; j < encoded.length; j += 1) if (bytes[i + j] !== encoded[j]) continue outer;
    return true;
  }
  return false;
}

export function inspectFile(filename: string, bytes: Uint8Array, policy: UploadPolicy = DEFAULT_UPLOAD_POLICY): FileInspection {
  const extension = fileExtension(filename);
  const flags = { legacyOffice: false, hasExternalLinks: false };
  const reject = (reason: RejectReason, kind: FileKind | null = null): FileInspection => ({
    verdict: 'REJECT', kind, mime: kind ? KIND_MIME[kind] : null, extension, reason, flags,
  });
  if (bytes.length === 0) return reject('EMPTY_FILE');
  if (bytes.length > policy.maxFileBytes) return reject('FILE_TOO_LARGE');
  const kind = EXTENSION_KIND[extension];
  if (!kind) return reject('EXTENSION_NOT_ALLOWED');
  if ((kind === 'csv' && !policy.allowCsv) || ((kind === 'doc' || kind === 'xls') && !policy.allowLegacyOffice)) {
    return reject('EXTENSION_NOT_ALLOWED', kind);
  }
  if (isExecutable(bytes)) return reject('EXECUTABLE_CONTENT', kind);

  const accept = (): FileInspection => ({ verdict: 'ACCEPT', kind, mime: KIND_MIME[kind], extension, flags });

  switch (kind) {
    case 'jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]) ? accept() : reject('CONTENT_MISMATCH', kind);
    case 'png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? accept() : reject('CONTENT_MISMATCH', kind);
    case 'webp':
      return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP' ? accept() : reject('CONTENT_MISMATCH', kind);
    case 'pdf': {
      if (ascii(bytes, 0, 5) !== '%PDF-') return reject('CONTENT_MISMATCH', kind);
      if (containsAscii(bytes, '/Encrypt')) return reject('ENCRYPTED_OR_UNREADABLE', kind);
      // Heuristic only: compressed object streams can hide these; the malware scanner is authoritative.
      if (containsAscii(bytes, '/JavaScript') || containsAscii(bytes, '/JS ') || containsAscii(bytes, '/JS(') ||
          containsAscii(bytes, '/Launch') || containsAscii(bytes, '/EmbeddedFile')) {
        return reject('PDF_ACTIVE_CONTENT', kind);
      }
      return accept();
    }
    case 'docx':
    case 'xlsx': {
      if (startsWith(bytes, OLE2)) return reject('ENCRYPTED_OR_UNREADABLE', kind); // password-protected OOXML
      if (!startsWith(bytes, ZIP)) return reject('CONTENT_MISMATCH', kind);
      const result = inspectOoxml(bytes, kind, policy);
      flags.hasExternalLinks = result.hasExternalLinks;
      return result.reason ? reject(result.reason, kind) : accept();
    }
    case 'doc':
    case 'xls': {
      if (!startsWith(bytes, OLE2)) return reject('CONTENT_MISMATCH', kind);
      if (containsUtf16le(bytes, '_VBA_PROJECT') || containsUtf16le(bytes, 'Macros')) return reject('MACRO_CONTENT', kind);
      if (containsUtf16le(bytes, 'EncryptionInfo') || containsUtf16le(bytes, 'EncryptedPackage')) {
        return reject('ENCRYPTED_OR_UNREADABLE', kind);
      }
      flags.legacyOffice = true;
      return accept();
    }
    case 'csv': {
      if (looksLikeMarkup(bytes)) return reject('MARKUP_CONTENT', kind);
      if (bytes.includes(0)) return reject('INVALID_TEXT_ENCODING', kind);
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        return reject('INVALID_TEXT_ENCODING', kind);
      }
      return accept();
    }
    default:
      return reject('EXTENSION_NOT_ALLOWED');
  }
}

/** Spreadsheet export guard against formula injection (=, +, -, @, tab, CR). */
export function neutralizeSpreadsheetText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
