import { createRequire } from 'node:module';
import { stat } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { zeroPaddedInteger } from '../imports/number-format.js';
import type { FileRecord } from './brand-file.js';

export const MAX_XLS_BYTES = 32 * 1024 * 1024;

// Fixed application code, never constructed from spreadsheet content. Parsing is
// isolated from the job's event loop, with a heap/time budget and one batch in flight.
const READER = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const XLSX = require(workerData.modulePath);
try {
  const book = XLSX.readFile(workerData.file, {
    dense: true, cellNF: true, cellDates: true, cellText: false,
    cellHTML: false, cellFormula: false, bookVBA: false, WTF: true,
  });
  if (book.SheetNames.length > 100) throw new Error('XLS_TOO_MANY_SHEETS');
  let cellsRead = 0;
  let textSize = 0;
  function* records() {
    for (const source of book.SheetNames) {
      const sheet = book.Sheets[source];
      const rows = sheet['!data'] || [];
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        if (row.length > 200) throw new Error('FILE_TOO_MANY_COLUMNS');
        const cells = Array.from(row, cell => {
          if (!cell || cell.t === 'e' || cell.v == null) return { value: '' };
          if (++cellsRead > 2000000) throw new Error('XLS_TOO_MANY_CELLS');
          let value = cell.v;
          if (value instanceof Date) value = value.toISOString().slice(0, 10);
          if (!['string', 'number', 'boolean'].includes(typeof value)) value = '';
          textSize += String(value).length;
          if (textSize > 32 * 1024 * 1024 || String(value).length > 32768) throw new Error('XLS_TOO_LARGE');
          return { value, format: cell.z };
        });
        if (cells.some(c => String(c.value).trim())) yield { source, line: r + 1, cells };
      }
    }
  }
  const iterator = records();
  const pump = () => {
    try {
      const batch = [];
      for (let i = 0; i < 100; i++) {
        const item = iterator.next();
        if (item.done) { parentPort.postMessage({ rows: batch, done: true }); parentPort.close(); return; }
        batch.push(item.value);
      }
      parentPort.postMessage({ rows: batch });
      parentPort.once('message', pump);
    } catch (error) { parentPort.postMessage({ error: /^[A-Z_]+$/.test(error.message) ? error.message : 'XLS_UNREADABLE' }); parentPort.close(); }
  };
  pump();
} catch (error) {
  parentPort.postMessage({ error: /^[A-Z_]+$/.test(error.message) ? error.message : 'XLS_UNREADABLE' });
  parentPort.close();
}
`;

interface Batch {
  rows?: Array<{ source: string; line: number; cells: Array<{ value: string | number | boolean; format?: string }> }>;
  error?: string;
  done?: boolean;
}

/** BIFF/OLE XLS only (the caller checks its signature). Macros/formulas are never executed. */
export async function* legacyXlsRecords(file: string): AsyncGenerator<FileRecord> {
  if ((await stat(file)).size > MAX_XLS_BYTES) throw new Error('XLS_TOO_LARGE');
  const worker = new Worker(READER, {
    eval: true,
    workerData: { file, modulePath: createRequire(import.meta.url).resolve('xlsx') },
    resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },
  });
  let pending: { resolve: (b: Batch) => void; reject: (e: Error) => void } | undefined;
  let buffered: Batch | undefined;
  let failure: Error | undefined;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fail = (e: Error) => { failure = e; pending?.reject(e); pending = undefined; };
  const armTimer = () => { timer = setTimeout(() => { fail(new Error('XLS_TIME_LIMIT')); void worker.terminate(); }, 60_000); };
  worker.on('message', (batch: Batch) => {
    clearTimeout(timer); // The caller may spend time writing this batch to its database.
    if (batch.done || batch.error) finished = true;
    if (pending) { pending.resolve(batch); pending = undefined; } else buffered = batch;
  });
  worker.on('error', () => fail(new Error('XLS_PROCESSING_LIMIT')));
  worker.on('exit', () => { if (!finished) fail(new Error('XLS_PROCESSING_LIMIT')); });
  armTimer();
  try {
    while (true) {
      if (failure) throw failure;
      const batch = buffered ?? await new Promise<Batch>((resolve, reject) => { pending = { resolve, reject }; });
      buffered = undefined;
      if (batch.error) throw new Error(batch.error);
      for (const row of batch.rows ?? []) {
        yield { ...row, cells: row.cells.map(c => zeroPaddedInteger(c.value, c.format) ?? String(c.value)) };
      }
      if (batch.done) break;
      armTimer();
      worker.postMessage('next');
    }
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
}
