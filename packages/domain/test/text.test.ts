import { describe, expect, it } from 'vitest';
import { buildSearchDocument, compactSearchText, maskPhone, normalizeIranMobile, normalizeSearchText, searchTokens } from '../src/index.js';

describe('Persian search normalization (A04)', () => {
  it('maps Arabic yeh/kaf to Persian forms', () => {
    expect(normalizeSearchText('لنت ترمز جلو پيكان')).toBe(normalizeSearchText('لنت ترمز جلو پیکان'));
    expect(normalizeSearchText('كمك فنر')).toBe('کمک فنر');
  });

  it('treats ZWNJ, extra spaces and joined words consistently', () => {
    const a = compactSearchText('لنت‌ترمز');
    const b = compactSearchText('لنت   ترمز');
    const c = compactSearchText('لنتترمز');
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(normalizeSearchText('لنت‌ترمز')).toBe('لنت ترمز');
  });

  it('normalizes digits, diacritics, tatweel and latin case', () => {
    expect(normalizeSearchText('فيلتر روغن ۲۰۶')).toBe('فیلتر روغن 206');
    expect(normalizeSearchText('فیلــتر')).toBe('فیلتر');
    expect(normalizeSearchText('Brake PAD')).toBe('brake pad');
    expect(normalizeSearchText('آینه')).toBe(normalizeSearchText('اینه'));
  });

  it('builds a search document from names, aliases and SKU', () => {
    const doc = buildSearchDocument(['لنت ترمز جلو', 'Front brake pad', null, 'HX-00123']);
    expect(doc.text).toContain('لنت ترمز جلو');
    expect(doc.text).toContain('front brake pad');
    expect(doc.compact).toContain('hx00123');
    expect(searchTokens('لنت ي  ترمز')).toEqual(['لنت', 'ترمز']);
  });
});

describe('Iranian mobile normalization', () => {
  it.each([
    ['09121234567'],
    ['+989121234567'],
    ['00989121234567'],
    ['989121234567'],
    ['9121234567'],
    ['۰۹۱۲۱۲۳۴۵۶۷'],
    ['0912 123 4567'],
    ['0912-123-4567'],
  ])('accepts %s', (input) => {
    expect(normalizeIranMobile(input)).toEqual({ ok: true, e164: '+989121234567', national: '09121234567' });
  });

  it.each([['0212345678'], ['091212345'], ['+14155550100'], ['']])('rejects %s', (input) => {
    expect(normalizeIranMobile(input).ok).toBe(false);
  });

  it('masks numbers for logs', () => {
    expect(maskPhone('+989121234567')).toBe('+98912***4567');
  });
});
