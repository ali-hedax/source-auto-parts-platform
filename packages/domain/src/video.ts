/**
 * Content inspection for site videos (visual builder → hero film). Deliberately separate from
 * `inspectFile`: other upload paths (attachments, imports) must never start accepting video.
 * The container is parsed from its bytes — the declared name or MIME type is not trusted.
 */
import { MB } from './files.js';

export type VideoKind = 'mp4' | 'webm';
export const VIDEO_MIME: Record<VideoKind, string> = { mp4: 'video/mp4', webm: 'video/webm' };
export const VIDEO_LIMITS = { maxBytes: 50 * MB, maxDurationMs: 120_000, maxWidth: 3840, maxHeight: 2160, minSide: 64 } as const;

export type VideoRejectReason =
  | 'EXTENSION_NOT_ALLOWED' | 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'CONTENT_MISMATCH' | 'NO_VIDEO_TRACK'
  | 'UNREADABLE_CONTAINER' | 'DURATION_OUT_OF_RANGE' | 'DIMENSIONS_OUT_OF_RANGE';

export interface VideoInspection {
  verdict: 'ACCEPT' | 'REJECT';
  kind: VideoKind | null;
  mime: string | null;
  reason?: VideoRejectReason;
  width: number; height: number; durationMs: number;
  /** MP4 only: the index precedes the media data, so playback can start before the download ends. */
  fastStart: boolean;
}

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
const u32 = (b: Uint8Array, at: number) => ((b[at]! << 24) >>> 0) + (b[at + 1]! << 16) + (b[at + 2]! << 8) + b[at + 3]!;
const u64 = (b: Uint8Array, at: number) => u32(b, at) * 2 ** 32 + u32(b, at + 4);
const MP4_BRANDS = new Set(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'dash', 'M4V ', 'mmp4']);
const MP4_CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts']);

interface Mp4Facts { durationMs: number; width: number; height: number; video: boolean; moovAt: number; mdatAt: number }
function walkMp4(b: Uint8Array, start: number, end: number, facts: Mp4Facts, depth: number): boolean {
  let at = start;
  while (at + 8 <= end) {
    let size = u32(b, at); const type = ascii(b, at + 4, at + 8); let header = 8;
    if (size === 1) { if (at + 16 > end) return false; size = u64(b, at + 8); header = 16; } else if (size === 0) size = end - at;
    if (size < header || at + size > end) {
      // Truncated tail inside the top level is tolerated only for the media data itself.
      if (depth === 0 && type === 'mdat') { if (facts.mdatAt < 0) facts.mdatAt = at; return true; }
      return false;
    }
    const body = at + header;
    if (depth === 0 && type === 'moov' && facts.moovAt < 0) facts.moovAt = at;
    if (depth === 0 && type === 'mdat' && facts.mdatAt < 0) facts.mdatAt = at;
    if (type === 'mvhd' && body + 20 <= at + size) {
      const v1 = b[body] === 1;
      const scale = v1 ? u32(b, body + 20) : u32(b, body + 12);
      const duration = v1 ? u64(b, body + 24) : u32(b, body + 16);
      if (scale > 0) facts.durationMs = Math.round((duration / scale) * 1000);
    } else if (type === 'tkhd' && size >= header + 84) {
      const w = u32(b, at + size - 8) / 65536; const h = u32(b, at + size - 4) / 65536;
      if (w > 0 && h > 0) { facts.width = Math.max(facts.width, Math.round(w)); facts.height = Math.max(facts.height, Math.round(h)); }
    } else if (type === 'hdlr' && body + 12 <= at + size && ascii(b, body + 8, body + 12) === 'vide') facts.video = true;
    else if (MP4_CONTAINERS.has(type) && depth < 6 && !walkMp4(b, body, at + size, facts, depth + 1)) return false;
    at += size;
  }
  return true;
}

// EBML (WebM): variable-length integers; master elements we descend into.
function vint(b: Uint8Array, at: number, keepMarker: boolean): { value: number; length: number } | null {
  const first = b[at];
  if (first === undefined || first === 0) return null;
  let length = 1; while (!(first & (0x80 >> (length - 1)))) length++;
  if (length > 8 || at + length > b.length) return null;
  let value = keepMarker ? first : first & (0xff >> length);
  for (let i = 1; i < length; i++) value = value * 256 + b[at + i]!;
  // All-ones size = unknown length (live streams); treat as "to the end".
  if (!keepMarker && value === 2 ** (7 * length) - 1) value = Number.POSITIVE_INFINITY;
  return { value, length };
}
const EBML = { Header: 0x1a45dfa3, DocType: 0x4282, Segment: 0x18538067, Info: 0x1549a966, TimecodeScale: 0x2ad7b1, Duration: 0x4489, Tracks: 0x1654ae6b, TrackEntry: 0xae, Video: 0xe0, PixelWidth: 0xb0, PixelHeight: 0xba, Cluster: 0x1f43b675 };
const EBML_MASTERS = new Set([EBML.Segment, EBML.Info, EBML.Tracks, EBML.TrackEntry, EBML.Video]);
interface WebmFacts { docType: string; scale: number; duration: number; width: number; height: number; video: boolean }
function uint(b: Uint8Array, at: number, len: number) { let v = 0; for (let i = 0; i < len; i++) v = v * 256 + b[at + i]!; return v; }
function walkWebm(b: Uint8Array, start: number, end: number, facts: WebmFacts, depth: number): boolean {
  let at = start;
  while (at < end) {
    const id = vint(b, at, true); if (!id) return false;
    const size = vint(b, at + id.length, false); if (!size) return false;
    const body = at + id.length + size.length;
    const stop = Math.min(end, body + size.value);
    if (id.value === EBML.Cluster) return true; // media data: the headers we need come first
    if (stop > b.length) return false;
    if (id.value === EBML.Header) { if (!walkWebmHeader(b, body, stop, facts)) return false; }
    else if (EBML_MASTERS.has(id.value)) {
      if (id.value === EBML.Video) facts.video = true;
      if (depth > 5 || !walkWebm(b, body, stop, facts, depth + 1)) return false;
    } else if (id.value === EBML.TimecodeScale) facts.scale = uint(b, body, size.value);
    else if (id.value === EBML.Duration) facts.duration = size.value === 8 ? new DataView(b.buffer, b.byteOffset + body, 8).getFloat64(0) : size.value === 4 ? new DataView(b.buffer, b.byteOffset + body, 4).getFloat32(0) : 0;
    else if (id.value === EBML.PixelWidth) facts.width = uint(b, body, size.value);
    else if (id.value === EBML.PixelHeight) facts.height = uint(b, body, size.value);
    if (!Number.isFinite(size.value)) return true;
    at = body + size.value;
  }
  return true;
}
function walkWebmHeader(b: Uint8Array, start: number, end: number, facts: WebmFacts): boolean {
  let at = start;
  while (at < end) {
    const id = vint(b, at, true); const size = id && vint(b, at + id.length, false);
    if (!id || !size || !Number.isFinite(size.value)) return false;
    const body = at + id.length + size.length;
    if (id.value === EBML.DocType) facts.docType = ascii(b, body, body + size.value);
    at = body + size.value;
  }
  return true;
}

export function inspectVideo(filename: string, bytes: Uint8Array): VideoInspection {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  const kind: VideoKind | null = ext === 'mp4' || ext === 'm4v' ? 'mp4' : ext === 'webm' ? 'webm' : null;
  const base = { kind, mime: kind ? VIDEO_MIME[kind] : null, width: 0, height: 0, durationMs: 0, fastStart: false };
  const reject = (reason: VideoRejectReason, extra: Partial<VideoInspection> = {}): VideoInspection => ({ ...base, ...extra, verdict: 'REJECT', reason });
  if (!kind) return reject('EXTENSION_NOT_ALLOWED');
  if (!bytes.length) return reject('EMPTY_FILE');
  if (bytes.length > VIDEO_LIMITS.maxBytes) return reject('FILE_TOO_LARGE');
  let facts: { width: number; height: number; durationMs: number; video: boolean; fastStart: boolean };
  if (kind === 'mp4') {
    if (bytes.length < 16 || ascii(bytes, 4, 8) !== 'ftyp' || !MP4_BRANDS.has(ascii(bytes, 8, 12))) return reject('CONTENT_MISMATCH');
    const f: Mp4Facts = { durationMs: 0, width: 0, height: 0, video: false, moovAt: -1, mdatAt: -1 };
    if (!walkMp4(bytes, 0, bytes.length, f, 0) || f.moovAt < 0) return reject('UNREADABLE_CONTAINER');
    facts = { ...f, fastStart: f.mdatAt < 0 || f.moovAt < f.mdatAt };
  } else {
    if (u32(bytes, 0) !== EBML.Header) return reject('CONTENT_MISMATCH');
    const f: WebmFacts = { docType: '', scale: 1_000_000, duration: 0, width: 0, height: 0, video: false };
    if (!walkWebm(bytes, 0, bytes.length, f, 0)) return reject('UNREADABLE_CONTAINER');
    if (f.docType !== 'webm') return reject('CONTENT_MISMATCH');
    facts = { width: f.width, height: f.height, video: f.video, durationMs: Math.round((f.duration * f.scale) / 1e6), fastStart: true };
  }
  const measured = { width: facts.width, height: facts.height, durationMs: facts.durationMs, fastStart: facts.fastStart };
  if (!facts.video || !facts.width || !facts.height) return reject('NO_VIDEO_TRACK', measured);
  if (facts.durationMs <= 0 || facts.durationMs > VIDEO_LIMITS.maxDurationMs) return reject('DURATION_OUT_OF_RANGE', measured);
  if (facts.width > VIDEO_LIMITS.maxWidth || facts.height > VIDEO_LIMITS.maxHeight || Math.min(facts.width, facts.height) < VIDEO_LIMITS.minSide) return reject('DIMENSIONS_OUT_OF_RANGE', measured);
  return { ...base, ...measured, verdict: 'ACCEPT' };
}
