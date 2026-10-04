import { describe, expect, it } from 'vitest';
import { composeSystemText, productListQuerySchema, quoteDraftSchema, sendMessageSchema, sourcingRequestCreateSchema, systemTextFor } from '../src/index.js';

describe('API contracts', () => {
  it('accepts a list-file-only sourcing request for any brand (A03)', () => {
    const parsed = sourcingRequestCreateSchema.safeParse({
      title: 'قطعات بدنه کیا سراتو',
      attachmentIds: ['0192f3a0-0000-7000-8000-000000000001'],
      clientRequestId: 'draft-1234567890abcdef',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a sourcing request with neither items nor files', () => {
    const parsed = sourcingRequestCreateSchema.safeParse({ title: 'درخواست', clientRequestId: 'draft-1234567890abcdef' });
    expect(parsed.success).toBe(false);
  });

  it('keeps VIN optional', () => {
    const parsed = sourcingRequestCreateSchema.safeParse({
      title: 'درخواست',
      items: [{ partName: 'چراغ جلو', quantity: 1, vehicleBrandText: 'Chery', vin: '' }],
      clientRequestId: 'draft-1234567890abcdef',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects business-day counting with hours in quotes', () => {
    const r = quoteDraftSchema.safeParse({
      items: [{ description: 'x item', quantity: 1, partType: 'GENUINE', condition: 'NEW', compatibility: 'CONFIRMED', availability: 'AVAILABLE',
        unitPrice: { currency: 'IRR', amountMinor: '10' }, leadTime: { min: 1, max: 2, unit: 'HOURS', dayKind: 'BUSINESS' } }],
      termsPolicyVersionId: '0192f3a0-0000-7000-8000-000000000001',
    });
    expect(r.success).toBe(false);
  });

  it('does not accept money as a JS number', () => {
    const r = quoteDraftSchema.safeParse({
      items: [{ description: 'x item', quantity: 1, partType: 'GENUINE', condition: 'NEW', compatibility: 'CONFIRMED', availability: 'AVAILABLE',
        unitPrice: { currency: 'IRR', amountMinor: 10.5 }, leadTime: { min: 1, max: 2, unit: 'DAYS', dayKind: 'CALENDAR' } }],
      termsPolicyVersionId: '0192f3a0-0000-7000-8000-000000000001',
    });
    expect(r.success).toBe(false);
  });

  it('defaults catalog query and rejects empty messages', () => {
    expect(productListQuerySchema.parse({})).toMatchObject({ sort: 'relevance', page: 1, pageSize: 24 });
    expect(sendMessageSchema.safeParse({ conversationId: '0192f3a0-0000-7000-8000-000000000001', clientMessageId: 'abcdefghijklmnop', body: '  ' }).success).toBe(false);
  });

  it('stores system messages in both languages and shows each reader their own', () => {
    const body = composeSystemText('درخواست HX-R-AB12 ثبت شد.', 'Request HX-R-AB12 received.');
    expect(systemTextFor(body, 'fa')).toBe('درخواست HX-R-AB12 ثبت شد.');
    expect(systemTextFor(body, 'en')).toBe('Request HX-R-AB12 received.');
    expect(systemTextFor('plain text', 'en')).toBe('plain text');
  });
});
