import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { TextDecoder } from 'node:util';
import { createInflateRaw } from 'node:zlib';
import ExcelJS from 'exceljs';
import { CsvStreamParser, detectDelimiter, detectEncoding, type TextEncodingName } from '@hedax/domain';

/**
 * Streaming readers for brand databases: memory stays bounded by one row (plus ExcelJS's shared
 * strings for xlsx), whatever the file size. Formulas are never evaluated; only stored values are read.
 */
export interface FileRecord {
  /** Sheet name, or the csv file's name (inside a zip). */
  source: string;
  /** Row number in the sheet / line number in the csv file. */
  line: number;
  cells: string[];
}

export interface SourceInfo {
  encoding: TextEncodingName | null;
  delimiter: string | null;
}

/** Text of an ExcelJS cell value: rich text, hyperlinks, formula results and dates become plain text. */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { richText?: Array<{ text: string }>; text?: unknown; result?: unknown; error?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join('');
    if (o.text !== undefined) return cellText(o.text);
    if (o.result !== undefined) return cellText(o.result);
  }
  return '';
}

async function* xlsxRecords(path: string): AsyncGenerator<FileRecord> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(path, { sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'ignore', worksheets: 'emit', entries: 'emit' });
  let n = 0;
  for await (const sheet of reader as AsyncIterable<AsyncIterable<ExcelJS.Row> & { name?: string }>) {
    n += 1;
    const source = sheet.name || `Sheet${n}`;
    for await (const row of sheet) {
      const values = Array.isArray(row.values) ? (row.values as unknown[]).slice(1) : [];
      const cells = values.map(cellText);
      if (cells.some((c) => c.trim() !== '')) yield { source, line: row.number, cells };
    }
  }
}

/** CSV records from a byte stream: encoding from the first 64 KB (or as chosen), separator from the header line. */
async function* csvRecords(bytes: AsyncIterable<Buffer>, source: string, encoding: 'auto' | TextEncodingName, info: (i: SourceInfo) => void): AsyncGenerator<FileRecord> {
  let head = Buffer.alloc(0);
  let state: { decoder: TextDecoder; parser: CsvStreamParser; persian: boolean } | null = null;
  // Windows-1256 has only the Arabic forms of ی and ک (what Persian Excel files contain): use the Persian letters.
  const text = (s: string) => (state?.persian ? s.replace(/ي/g, 'ی').replace(/ك/g, 'ک') : s);
  const start = (sample: Buffer): string => {
    const enc = encoding === 'auto' ? detectEncoding(sample) : encoding;
    const decoder = new TextDecoder(enc);
    let first = decoder.decode(sample, { stream: true });
    if (first.charCodeAt(0) === 0xfeff) first = first.slice(1);
    const delimiter = detectDelimiter(first.split('\n')[0] ?? '');
    state = { decoder, parser: new CsvStreamParser(delimiter), persian: enc === 'windows-1256' };
    info({ encoding: enc, delimiter });
    return first;
  };
  for await (const chunk of bytes) {
    let pending: string;
    if (!state) {
      head = Buffer.concat([head, chunk]);
      if (head.length < 64 * 1024) continue;
      pending = start(head);
    } else {
      pending = (state as { decoder: TextDecoder }).decoder.decode(chunk, { stream: true });
    }
    const s = state as unknown as { parser: CsvStreamParser };
    for (const r of s.parser.push(text(pending))) yield { source, ...r };
  }
  const tail = state ? (state as { decoder: TextDecoder }).decoder.decode() : start(head);
  const s = state as unknown as { parser: CsvStreamParser };
  for (const r of s.parser.push(text(tail))) yield { source, ...r };
  for (const r of s.parser.finish()) yield { source, ...r };
}

interface ZipEntry { name: string; method: number; compressedSize: number; size: number; offset: number }

/** Entries of a zip file from its central directory (no ZIP64; brand databases are well below 4 GB). */
async function zipEntries(path: string): Promise<ZipEntry[]> {
  const fh = await open(path, 'r');
  try {
    const { size } = await fh.stat();
    const tailLen = Math.min(size, 66 * 1024);
    const tail = Buffer.alloc(tailLen);
    await fh.read(tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i -= 1) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('ZIP_INVALID');
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (count > 500) throw new Error('ZIP_TOO_MANY_FILES');
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOffset);
    const out: ZipEntry[] = [];
    for (let p = 0, i = 0; i < count; i += 1) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP_INVALID');
      const method = cd.readUInt16LE(p + 10);
      const compressedSize = cd.readUInt32LE(p + 20);
      const uncompressed = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const local = cd.readUInt32LE(p + 42);
      const name = cd.subarray(p + 46, p + 46 + nameLen).toString('utf8');
      p += 46 + nameLen + extraLen + commentLen;
      const lh = Buffer.alloc(30);
      await fh.read(lh, 0, 30, local);
      if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('ZIP_INVALID');
      const offset = local + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      out.push({ name, method, compressedSize, size: uncompressed, offset });
    }
    return out;
  } finally {
    await fh.close();
  }
}

/** Every CSV inside a zip (folders, hidden and macOS files are skipped), in the zip's order. */
async function* zipRecords(path: string, encoding: 'auto' | TextEncodingName, info: (source: string, i: SourceInfo) => void): AsyncGenerator<FileRecord> {
  const entries = (await zipEntries(path)).filter((e) => /\.csv$/i.test(e.name) && !e.name.endsWith('/') && !/(^|\/)(__MACOSX|\.)/.test(e.name));
  if (!entries.length) throw new Error('ZIP_HAS_NO_CSV');
  // Zip-bomb guard: at most 3 GB of text in all, and no file 200 times larger than its compressed form.
  const total = entries.reduce((s, e) => s + e.size, 0);
  if (total > 3 * 1024 ** 3 || entries.some((e) => e.compressedSize > 0 && e.size / e.compressedSize > 200)) throw new Error('ZIP_TOO_LARGE');
  for (const e of entries) {
    if (e.method !== 0 && e.method !== 8) throw new Error('ZIP_METHOD_NOT_SUPPORTED');
    const raw: Readable = createReadStream(path, e.compressedSize ? { start: e.offset, end: e.offset + e.compressedSize - 1 } : { start: e.offset, end: e.offset });
    const bytes = e.compressedSize === 0 ? (async function* () {})() : e.method === 8 ? raw.pipe(createInflateRaw()) : raw;
    const source = e.name.split('/').pop() as string;
    yield* csvRecords(bytes as AsyncIterable<Buffer>, source, encoding, (i) => info(source, i));
  }
}

/**
 * All records of a brand database file. `info` receives each source's detected encoding and separator.
 * The first record of each source is its header row.
 */
export async function* readBrandFile(path: string, extension: string, encoding: 'auto' | TextEncodingName = 'auto', info: (source: string, i: SourceInfo) => void = () => undefined): AsyncGenerator<FileRecord> {
  if (extension === 'xlsx') yield* xlsxRecords(path);
  else if (extension === 'zip') yield* zipRecords(path, encoding, info);
  else if (extension === 'csv') yield* csvRecords(createReadStream(path), 'file.csv', encoding, (i) => info('file.csv', i));
  else throw new Error('FORMAT_NOT_SUPPORTED');
}

/** File type from the first bytes: zip-based xlsx vs plain zip is decided by the name; csv is text. */
export async function brandFileKind(path: string, filename: string): Promise<'xlsx' | 'zip' | 'csv' | null> {
  const fh = await open(path, 'r');
  try {
    const head = Buffer.alloc(4);
    await fh.read(head, 0, 4, 0);
    const isZip = head.readUInt32LE(0) === 0x04034b50;
    const ext = filename.toLowerCase().split('.').pop();
    if (isZip) return ext === 'xlsx' ? 'xlsx' : ext === 'zip' ? 'zip' : null;
    if (ext !== 'csv' && ext !== 'txt') return null;
    // A text file: no NUL bytes in the first 64 KB.
    const sample = Buffer.alloc(Math.min(64 * 1024, (await stat(path)).size));
    await fh.read(sample, 0, sample.length, 0);
    return sample.includes(0) ? null : 'csv';
  } finally {
    await fh.close();
  }
}
