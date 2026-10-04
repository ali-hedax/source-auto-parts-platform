import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, type TestApp, bootApp, loginCustomer, loginOwner, services, type Services } from './helpers.js';

/**
 * Spec §5.3 "تنظیمات اعلان" and §17: in-app notifications are always recorded;
 * the owner can switch off the SMS copy per notification type.
 */
let t: TestApp;
let s: Services;
let owner: Client;
const run = Date.now().toString(36);

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
});

afterAll(async () => {
  await t?.close();
});

async function saveSettings(change: Record<string, unknown>) {
  const { version, ...current } = (await owner.get<Record<string, unknown> & { version: number }>('/admin/settings')).body;
  const res = await owner.put('/admin/settings', { ...current, ...change, version });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

describe('notification settings', () => {
  it('an SMS copy switched off by the owner is not queued; the in-app notification and other SMS types stay', async () => {
    const { NotificationsService } = await import('../../dist/modules/notifications/notifications.service.js');
    const notifications = t.get<InstanceType<typeof NotificationsService>>(NotificationsService);
    const customer = await loginCustomer(t);
    const userId = (await customer.get<{ id: string }>('/me')).body.id;

    await saveSettings({ smsDisabledTypes: ['quote.sent'] });
    expect((await owner.get('/admin/settings')).body.smsDisabledTypes).toEqual(['quote.sent']);
    // An unknown type is refused by the settings contract.
    const { version, ...current } = (await owner.get<Record<string, unknown> & { version: number }>('/admin/settings')).body;
    expect((await owner.put('/admin/settings', { ...current, smsDisabledTypes: ['no.such.type'], version })).status).toBe(400);

    await notifications.deliver({ userId, type: 'quote.sent', params: { reference: 'HX-Q-TEST' }, linkPath: null, sms: true }, `test:sms-off:${run}`);
    await notifications.deliver({ userId, type: 'order.paid', params: { reference: 'HX-O-TEST' }, linkPath: null, sms: true }, `test:sms-on:${run}`);
    const channels = async (dedupeKey: string) =>
      (await s.prisma.notification.findUniqueOrThrow({ where: { dedupeKey }, include: { deliveries: true } })).deliveries.map((d) => d.channel).sort();
    expect(await channels(`test:sms-off:${run}`)).toEqual(['IN_APP']);
    expect(await channels(`test:sms-on:${run}`)).toEqual(['IN_APP', 'SMS']);

    await saveSettings({ smsDisabledTypes: [] });
  });
});
