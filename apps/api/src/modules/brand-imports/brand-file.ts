import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { TextDecoder } from 'node:util';
import { createInflateRaw } from 'node:zlib';
import ExcelJS from 'exceljs';
import { CsvStreamParser, detectDelimiter, detectEncoding, type TextEncodingName } from '@hedax/domain';
import { zeroPaddedInteger } from '../imports/number-format.js';
import { legacyXlsRecords, MAX_XLS_BYTES } from './legacy-xls.js';

/**
 * Streaming CSV/XLSX readers; legacy XLS uses a bounded worker thread. Formulas are
 * never evaluated; only stored values are read. Archive workbooks are spooled one at a time.
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

/** The parts of ExcelJS's streaming WorkbookReader used below (they are not in its typings). */
interface ExcelReaderInternals {
  _parseStyles(entry: Readable): Promise<void>;
  _parseRels(entry: Readable): Promise<void>;
  _parseWorkbook(entry: Readable): Promise<void>;
  _parseSharedStrings(entry: Readable): AsyncGenerator<unknown>;
  _parseWorksheet(chunks: AsyncIterable<Buffer>, sheetNo: string): AsyncGenerator<{ eventType: string; value: unknown }>;
}

/**
 * xlsx rows, read in a fixed order with our own zip reader: first the sheet list, its links and the
 * shared strings (the small parts), then each sheet streamed with backpressure through ExcelJS's
 * sheet parser. ExcelJS's own whole-file streaming walks the zip in file order and, when a sheet
 * comes before the shared strings (as in files saved by Excel), sometimes loses entries: cells then
 * come back empty or the reader crashes. Reading by name avoids that.
 */
async function* xlsxRecords(path: string): AsyncGenerator<FileRecord> {
  const entries = await zipEntries(path);
  if (entries.reduce((s, e) => s + e.size, 0) > 3 * 1024 ** 3) throw new Error('ZIP_TOO_LARGE');
  const byName = new Map(entries.map((e) => [e.name, e]));
  if (byName.size !== entries.length || !byName.has('xl/workbook.xml')) throw new Error('XLSX_INVALID');
  if (entries.some((e) => /\/(sharedStrings|styles|workbook)\.xml$/.test(e.name) && e.size > 64 * 1024 * 1024)) throw new Error('XLSX_METADATA_TOO_LARGE');
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(path, { sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'cache', worksheets: 'emit', entries: 'ignore' });
  const internals = reader as unknown as ExcelReaderInternals & { sharedStrings?: unknown[]; model?: { sheets?: unknown[] } };
  const rels = byName.get('xl/_rels/workbook.xml.rels');
  if (rels) await internals._parseRels(entryStream(path, rels));
  const book = byName.get('xl/workbook.xml');
  if (book) await internals._parseWorkbook(entryStream(path, book));
  internals.model ??= { sheets: [] };
  const strings = byName.get('xl/sharedStrings.xml');
  if (strings) for await (const _ of internals._parseSharedStrings(entryStream(path, strings))) { /* filled into reader.sharedStrings */ }
  internals.sharedStrings ??= [];
  const styles = byName.get('xl/styles.xml');
  if (styles) await internals._parseStyles(entryStream(path, styles));
  const sheets = entries
    .map((e) => ({ e, no: /^xl\/worksheets\/sheet(\d+)\.xml$/.exec(e.name)?.[1] }))
    .filter((x): x is { e: ZipEntry; no: string } => !!x.no)
    .sort((a, b) => Number(a.no) - Number(b.no));
  let n = 0;
  for (const { e, no } of sheets) {
    for await (const ev of internals._parseWorksheet(entryStream(path, e), no)) {
      if (ev.eventType !== 'worksheet') continue;
      n += 1;
      const sheet = ev.value as AsyncIterable<ExcelJS.Row> & { name?: string };
      const source = sheet.name || `Sheet${n}`;
      yield* sheetRecords(sheet, source);
    }
  }
}

async function* sheetRecords(sheet: AsyncIterable<ExcelJS.Row>, source: string): AsyncGenerator<FileRecord> {
  for await (const row of sheet) {
    const values = Array.isArray(row.values) ? (row.values as unknown[]).slice(1) : [];
    if (values.length > 200) throw new Error('FILE_TOO_MANY_COLUMNS');
    // Array.from visits empty cells too (map skips the holes of a sparse row).
    const cells = Array.from(values, (v, i) => {
      const value = v && typeof v === 'object' && 'result' in v ? (v as { result: unknown }).result : v;
      return zeroPaddedInteger(value, row.getCell(i + 1).numFmt) ?? cellText(v);
    });
    if (cells.some((c) => c.trim() !== '')) yield { source, line: row.number, cells };
  }
}

/** One zip entry as a byte stream (stored or deflated), read with backpressure. */
function entryStream(path: string, e: ZipEntry): Readable {
  if (e.method !== 0 && e.method !== 8) throw new Error('ZIP_METHOD_NOT_SUPPORTED');
  if (e.compressedSize === 0) return Readable.from([]);
  const raw = createReadStream(path, { start: e.offset, end: e.offset + e.compressedSize - 1 });
  const decoded = e.method === 8 ? raw.pipe(createInflateRaw()) : raw;
  raw.on('error', (error) => decoded.destroy(error));
  // Do not trust the central directory's expansion claim. Enforce it while streaming.
  return Readable.from((async function* () {
    let size = 0;
    try {
      for await (const chunk of decoded) {
        size += (chunk as Buffer).length;
        if (size > e.size) throw new Error('ZIP_SIZE_MISMATCH');
        yield chunk;
      }
      if (size !== e.size) throw new Error('ZIP_SIZE_MISMATCH');
    } finally {
      decoded.destroy();
      raw.destroy();
    }
  })());
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
    // Bounds must be checked before allocating attacker-controlled sizes or reading offsets.
    const directoryEnd = size - tailLen + eocd;
    if (tail.readUInt16LE(eocd + 4) !== 0 || tail.readUInt16LE(eocd + 6) !== 0 ||
        tail.readUInt16LE(eocd + 8) !== count || cdSize > 16 * 1024 * 1024 ||
        cdSize < count * 46 || cdOffset + cdSize > directoryEnd) throw new Error('ZIP_INVALID');
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOffset);
    const out: ZipEntry[] = [];
    for (let p = 0, i = 0; i < count; i += 1) {
      if (p + 46 > cd.length) throw new Error('ZIP_INVALID');
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP_INVALID');
      if (cd.readUInt16LE(p + 8) & 1) throw new Error('ZIP_ENCRYPTED');
      const method = cd.readUInt16LE(p + 10);
      const compressedSize = cd.readUInt32LE(p + 20);
      const uncompressed = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const local = cd.readUInt32LE(p + 42);
      if (p + 46 + nameLen + extraLen + commentLen > cd.length || local + 30 > cdOffset) throw new Error('ZIP_INVALID');
      const rawName = cd.subarray(p + 46, p + 46 + nameLen);
      let name: string;
      try { name = new TextDecoder('utf-8', { fatal: true }).decode(rawName); }
      catch {
        // Old ZIP names do not declare their codepage reliably. Keep a stable identity
        // from the original bytes instead of guessing Persian text or merging replacements.
        const ext = /\.[a-z0-9]+$/i.exec(rawName.toString('latin1'))?.[0] ?? '';
        name = `legacy-${createHash('sha256').update(rawName).digest('hex').slice(0, 20)}${ext}`;
      }
      const rawPath = rawName.toString('latin1');
      if (/(^[/\\]|^[a-z]:|(^|[/\\])\.\.([/\\]|$)|\0)/i.test(rawPath) ||
          ((cd.readUInt32LE(p + 38) >>> 16) & 0xf000) === 0xa000) throw new Error('ZIP_INVALID_NAMES');
      p += 46 + nameLen + extraLen + commentLen;
      const lh = Buffer.alloc(30);
      await fh.read(lh, 0, 30, local);
      if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('ZIP_INVALID');
      const offset = local + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      if (offset + compressedSize > cdOffset || (compressedSize === 0 && uncompressed !== 0)) throw new Error('ZIP_INVALID');
      out.push({ name, method, compressedSize, size: uncompressed, offset });
    }
    return out;
  } finally {
    await fh.close();
  }
}

/** A bounded source identity also fits the database's 200-character row reference. */
function sourceName(name: string): string {
  return name.length <= 180 ? name : `${name.slice(0, 155)}~${createHash('sha256').update(name).digest('hex').slice(0, 20)}`;
}

/** CSV/XLSX/XLS files in ZIP order. Never extract an archive path onto the filesystem. */
async function* zipRecords(archivePath: string, encoding: 'auto' | TextEncodingName, info: (source: string, i: SourceInfo) => void): AsyncGenerator<FileRecord> {
  const all = (await zipEntries(archivePath)).filter(e => !e.name.endsWith('/') && !/(^|[/\\])(__MACOSX|\.)/.test(e.name));
  if (all.some(e => /\.(zip|xlsm|xlsb)$/i.test(e.name))) throw new Error('ZIP_UNSUPPORTED_SPREADSHEET');
  const entries = all.filter(e => /\.(csv|xlsx|xls)$/i.test(e.name));
  if (!entries.length) throw new Error('ZIP_HAS_NO_SPREADSHEET');
  if (new Set(entries.map((e) => e.name)).size !== entries.length) throw new Error('ZIP_INVALID_NAMES');
  // Zip-bomb guard: at most 3 GB of text in all, and no file 200 times larger than its compressed form.
  const total = entries.reduce((s, e) => s + e.size, 0);
  if (total > 3 * 1024 ** 3 || entries.some((e) => e.compressedSize > 0 && e.size / e.compressedSize > 200)) throw new Error('ZIP_TOO_LARGE');
  for (const e of entries) {
    if (e.method !== 0 && e.method !== 8) throw new Error('ZIP_METHOD_NOT_SUPPORTED');
    const extension = e.name.toLowerCase().split('.').pop()!;
    const source = sourceName(e.name);
    if (extension === 'csv') {
      yield* csvRecords(entryStream(archivePath, e), source, encoding, (i) => info(source, i));
      continue;
    }
    if (e.size > (extension === 'xls' ? MAX_XLS_BYTES : 150 * 1024 * 1024)) throw new Error('WORKBOOK_TOO_LARGE');
    const dir = await mkdtemp(path.join(tmpdir(), 'hedax-brand-workbook-'));
    const file = path.join(dir, `workbook.${extension}`);
    try {
      await pipeline(entryStream(archivePath, e), createWriteStream(file, { flags: 'wx' }));
      if (await brandFileKind(file, `workbook.${extension}`) !== extension) throw new Error('WORKBOOK_FORMAT_MISMATCH');
      const records = extension === 'xlsx' ? xlsxRecords(file) : legacyXlsRecords(file);
      for await (const rec of records) yield { ...rec, source: sourceName(`${source} / ${rec.source}`) };
    } finally {
      // dir is created by mkdtemp under the OS temporary directory, never from an archive name.
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
}

/**
 * All records of a brand database file. `info` receives each source's detected encoding and separator.
 * The first record of each source is its header row.
 */
export async function* readBrandFile(path: string, extension: string, encoding: 'auto' | TextEncodingName = 'auto', info: (source: string, i: SourceInfo) => void = () => undefined): AsyncGenerator<FileRecord> {
  if (extension === 'xlsx') yield* xlsxRecords(path);
  else if (extension === 'xls') {
    if (await brandFileKind(path, 'workbook.xls') !== 'xls') throw new Error('WORKBOOK_FORMAT_MISMATCH');
    yield* legacyXlsRecords(path);
  }
  else if (extension === 'zip') yield* zipRecords(path, encoding, info);
  else if (extension === 'csv') yield* csvRecords(createReadStream(path), 'file.csv', encoding, (i) => info('file.csv', i));
  else throw new Error('FORMAT_NOT_SUPPORTED');
}

/** File type from the first bytes: zip-based xlsx vs plain zip is decided by the name; csv is text. */
export async function brandFileKind(path: string, filename: string): Promise<'xlsx' | 'xls' | 'zip' | 'csv' | null> {
  const fh = await open(path, 'r');
  try {
    const head = Buffer.alloc(8);
    await fh.read(head, 0, 8, 0);
    const isZip = head.readUInt32LE(0) === 0x04034b50;
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'xls') return head.equals(Buffer.from('d0cf11e0a1b11ae1', 'hex')) ? 'xls' : null;
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
