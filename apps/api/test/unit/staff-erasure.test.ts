import { describe, expect, it } from 'vitest';
import { ERASED, redactIdentity } from '../../src/modules/admin/staff-erasure.service.js';

const who = { emails: ['ali.h@example.test'], names: ['علی حسینی'] };

describe('audit redaction of an erased person', () => {
  it('clears every identity field in rows about the person, keeping the rest of the event', () => {
    expect(redactIdentity({ email: 'ali.h@example.test', fullName: 'نام قدیمی', roles: ['support'], emailQueued: true }, who, true))
      .toEqual({ email: ERASED, fullName: ERASED, roles: ['support'], emailQueued: true });
  });

  it('in other rows replaces only the address (any case, inside text) and the exact name', () => {
    expect(redactIdentity({ to: 'Ali <ALI.H@example.test>', note: 'علی حسینی', other: 'علی حسینی‌پور', fullName: 'مریم', n: 3, x: null }, who, false))
      .toEqual({ to: `Ali <${ERASED}>`, note: ERASED, other: 'علی حسینی‌پور', fullName: 'مریم', n: 3, x: null });
  });

  it('walks arrays and nested objects, and treats the address as text, not a pattern', () => {
    expect(redactIdentity([{ a: { b: ['ali.h@example.test'] } }], who, false)).toEqual([{ a: { b: [ERASED] } }]);
    expect(redactIdentity('alixh@example.test', who, false)).toBe('alixh@example.test');
  });
});
