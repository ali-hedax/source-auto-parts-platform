import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Every application connection runs with TimeZone=UTC.
 *
 * The driver adapter exchanges timestamps as UTC wall-clock values without an
 * offset. On a server whose TimeZone is anything else (e.g. Asia/Tehran, a
 * common default for servers in Iran) PostgreSQL would read those values in
 * its own zone, shifting every comparison with now() and every
 * database-defaulted timestamp by the zone offset (reservation expiry,
 * payment reconciliation, quote validity). Pinning the session zone makes the
 * behaviour independent of the server configuration.
 */
export function createPgAdapter(connectionString: string, poolSize?: number): PrismaPg {
  return new PrismaPg({ connectionString, options: '-c TimeZone=UTC', ...(poolSize ? { max: poolSize } : {}) });
}
