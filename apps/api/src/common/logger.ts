import type { LoggerService } from '@nestjs/common';
import { currentRequestId } from './request-context.js';

const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug'] as const;
type Level = (typeof LEVELS)[number];

const MOBILE_RE = /(\+?98|0)9\d{9}/g;
const SECRET_KEYS = /password|secret|token|otp|code|cookie|authorization|card/i;

/** Masks phone numbers and secret-looking fields before anything is written to logs. */
export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (typeof value === 'string') return value.replace(MOBILE_RE, (m) => `${m.slice(0, 4)}***${m.slice(-2)}`);
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) && k !== 'code' ? '[redacted]' : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** JSON-lines logger with request id correlation (spec §14). */
export class JsonLogger implements LoggerService {
  private readonly threshold: number;

  constructor(level: Level = 'info') {
    this.threshold = LEVELS.indexOf(level);
  }

  private write(level: Level, message: unknown, context?: string): void {
    if (LEVELS.indexOf(level) > this.threshold) return;
    const entry = {
      t: new Date().toISOString(),
      level,
      ctx: context,
      requestId: currentRequestId() ?? undefined,
      msg: scrub(message),
    };
    const line = JSON.stringify(entry);
    if (level === 'error' || level === 'fatal') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  }

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }
  error(message: unknown, _trace?: string, context?: string): void {
    this.write('error', message, context);
  }
  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }
  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }
  verbose(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }
  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context);
  }
}
