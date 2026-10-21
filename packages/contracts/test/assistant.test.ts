import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSISTANT_SETTINGS as defaults, assistantSettingsSchema, assistantRespond, assistantReply, assistantRouteAllowed } from '../src/assistant.js';

describe('phase one assistant contract', () => {
  it('defaults off and accepts the bounded bilingual settings', () => {
    expect(assistantSettingsSchema.parse(defaults).enabled).toBe(false);
  });
  it.each([{ mobileSize: 200 }, { desktopSize: 1 }, { placement: 'custom' }, { name: { fa: '<script>x</script>', en: 'Guide' } }, { enabled: 'true' }, { url: 'https://external.invalid' }])('refuses invalid or executable settings %j', (change) => {
    expect(assistantSettingsSchema.safeParse({ ...defaults, ...change }).success).toBe(false);
  });
  it('uses the actual catalog q parameter with encoding and its 120 character limit', () => {
    const link = assistantRespond(defaults, 'fa', '000123 & لنت').links[0]!;
    expect(link.href).toBe('/parts?q=000123%20%26%20%D9%84%D9%86%D8%AA');
    expect(new URL(assistantRespond(defaults, 'en', 'x'.repeat(160)).links[0]!.href, 'http://local').searchParams.get('q')).toHaveLength(120);
    expect(assistantReply(defaults, 'en', 'order').links[0]!.href).toBe('/request-part');
    expect(assistantReply(defaults, 'en', 'support').links[0]!.href).toBe('/contact');
  });
  it('excludes purchase and private routes, without substring bypasses', () => {
    for (const path of ['/fa', '/en/parts', '/fa/request-part', '/en/contact']) expect(assistantRouteAllowed(path)).toBe(true);
    for (const path of ['/fa/checkout', '/en/payment/result', '/fa/staff/login', '/fa/admin', '/en/cart', '/fa/account', '/fa/parts/a-part', '/fa/parts-untrusted']) expect(assistantRouteAllowed(path)).toBe(false);
  });
});
