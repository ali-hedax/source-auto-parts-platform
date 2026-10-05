import { describe, expect, it } from 'vitest';
import { parseClamVersion } from '../../src/common/storage/scanner.js';

describe('clamd VERSION reply (signature age in readiness)', () => {
  it('reads the database version and its time', () => {
    // Reply of the clamav/clamav 1.5.4 container used in docker-compose (2026-10-05).
    expect(parseClamVersion('ClamAV 1.5.4/28136/Sun Sep 27 06:26:12 2026')).toEqual({ version: '28136', builtAt: new Date('2026-09-27T06:26:12Z') });
    expect(parseClamVersion('ClamAV 1.5.4/28137/Fri Oct  3 08:12:01 2026')).toEqual({ version: '28137', builtAt: new Date('2026-10-03T08:12:01Z') });
    expect(parseClamVersion('ClamAV 1.5.4/28140/Mon Sep 28 17:05:00 2026\n')?.builtAt.toISOString()).toBe('2026-09-28T17:05:00.000Z');
  });

  it('gives null without a loaded database or for any other reply', () => {
    expect(parseClamVersion('ClamAV 1.5.4')).toBeNull();
    expect(parseClamVersion('')).toBeNull();
    expect(parseClamVersion('ClamAV 1.5.4/28136/Fri Foo  3 08:12:01 2026')).toBeNull();
    expect(parseClamVersion('UNKNOWN COMMAND')).toBeNull();
  });
});
