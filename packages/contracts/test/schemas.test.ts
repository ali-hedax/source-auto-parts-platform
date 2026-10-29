import { describe, expect, it } from 'vitest';
import { catalogDocumentCreateSchema, catalogDocumentStatusSchema, composeSystemText, productListQuerySchema, quoteDraftSchema, sendMessageSchema, sourcingRequestCreateSchema, staffMfaSchema, systemTextFor } from '../src/index.js';

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

  it('accepts a staff authenticator code typed with Persian digits', () => {
    const challengeId = 'challenge-1234567890';
    expect(staffMfaSchema.safeParse({ challengeId, code: '۱۲۳۴۵۶' }).success).toBe(true);
    expect(staffMfaSchema.safeParse({ challengeId, code: '123456' }).success).toBe(true);
    expect(staffMfaSchema.safeParse({ challengeId, code: 'AB۱۲-CD34' }).success).toBe(true);
    expect(staffMfaSchema.safeParse({ challengeId, code: '۱۲۳۴۵' }).success).toBe(false);
  });

  it('stores system messages in both languages and shows each reader their own', () => {
    const body = composeSystemText('درخواست HX-R-AB12 ثبت شد.', 'Request HX-R-AB12 received.');
    expect(systemTextFor(body, 'fa')).toBe('درخواست HX-R-AB12 ثبت شد.');
    expect(systemTextFor(body, 'en')).toBe('Request HX-R-AB12 received.');
    expect(systemTextFor('plain text', 'en')).toBe('plain text');
  });

  it('validates knowledge catalog metadata and every phase-one status', () => {
    const attachmentId = '0192f3a0-0000-7000-8000-000000000001';
    expect(catalogDocumentCreateSchema.parse({ attachmentId, title: ' کاتالوگ ترمز ', version: '2.0' })).toMatchObject({ title: 'کاتالوگ ترمز', version: '2.0' });
    expect(catalogDocumentCreateSchema.safeParse({ attachmentId, title: '', version: '' }).success).toBe(false);
    for (const status of ['UPLOADED', 'PENDING_PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED']) {
      expect(catalogDocumentStatusSchema.safeParse({ status }).success).toBe(true);
    }
    expect(catalogDocumentStatusSchema.safeParse({ status: 'EMBEDDED' }).success).toBe(false);
  });
});

import { contactContentSchema } from '../src/content.js';
import { channelHref, channelText, resolveContactChannels, whatsappNumber } from '../src/constants.js';

describe('footer contact channels', () => {
  const live = {
    phones: [
      { label: { fa: 'تلفن', en: 'Phone' }, number: '02536668006', numberFa: '', extension: '119', whatsapp: false },
      { label: { fa: 'واتس‌اپ', en: 'WhatsApp' }, number: '+971 50 144 1797', numberFa: '', extension: '', whatsapp: false },
      { label: { fa: 'موبایل', en: 'Mobile' }, number: '00989121531797', numberFa: '', extension: '', whatsapp: true },
    ],
  };
  it('reads older content without duplicating WhatsApp', () => {
    expect(resolveContactChannels(live, [{ network: 'instagram', url: 'https://instagram.com/hedax.73' }])).toEqual({ phone: '02536668006', phoneExtension: '119', mobile: '00989121531797', whatsapp: '+971 50 144 1797', telegram: '', bale: '', instagram: 'https://instagram.com/hedax.73' });
  });
  it('saved channels win', () => {
    const channels = { phone: '025', phoneExtension: '', mobile: '', whatsapp: '', telegram: '@src', bale: '', instagram: '' };
    expect(resolveContactChannels({ ...live, channels }).telegram).toBe('@src');
  });
  it('builds links and labels', () => {
    expect(whatsappNumber('00989121531797')).toBe('989121531797');
    expect(whatsappNumber('09121531797')).toBe('989121531797');
    expect(whatsappNumber('+971 50 144 1797')).toBe('971501441797');
    expect(channelHref('bale', '@sourcebyhedax')).toBe('https://ble.ir/sourcebyhedax');
    expect(channelHref('telegram', 'https://t.me/abc')).toBe('https://t.me/abc');
    expect(channelHref('phone', '025 3666 8006', '119')).toBe('tel:02536668006,119');
    expect(channelHref('instagram', '')).toBeNull();
    expect(channelText('instagram', 'https://instagram.com/hedax.73')).toBe('@hedax.73');
  });
  it('validates channel fields and accepts Persian digits', () => {
    const base = { displayName: '', phones: [], email: '', address: { fa: '', en: '' }, mapUrl: '', mapLat: null, mapLng: null, hours: { fa: '', en: '' }, supportChat: false };
    const ok = contactContentSchema.parse({ ...base, channels: { phone: '۰۲۵۳۶۶۶۸۰۰۶', phoneExtension: '۱۱۹', mobile: '', whatsapp: '', telegram: '@source_hedax', bale: 'https://ble.ir/source', instagram: 'hedax.73' } });
    expect(ok.channels.phone).toBe('02536668006');
    expect(ok.channels.phoneExtension).toBe('119');
    expect(contactContentSchema.parse(base).channels.phone).toBe('');
    expect(contactContentSchema.safeParse({ ...base, channels: { ...ok.channels, bale: 'https://evil.example/ble.ir/x' } }).success).toBe(false);
    expect(contactContentSchema.safeParse({ ...base, channels: { ...ok.channels, mobile: 'abc' } }).success).toBe(false);
  });
});
