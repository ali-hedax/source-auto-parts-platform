import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OperatorRequestCreated, OperatorRequestDetail, OperatorRequestList, OperatorThreadView } from '@hedax/contracts';
import { bootApp, Client, inviteStaff, loginCustomer, loginOwner, services, type TestApp } from './helpers.js';

/** "Talk to an operator" from the guide: guest message → owner notified → staff reply → guest reads it with their key. */
let app: TestApp;
let owner: Client;
beforeAll(async () => { app = await bootApp(); owner = await loginOwner(app); });
afterAll(async () => { await app?.close(); });

describe('operator requests', () => {
  let created: OperatorRequestCreated;

  it('a guest leaves a message (Persian digits accepted) and owners are notified', async () => {
    const guest = new Client(app);
    const res = await guest.post<OperatorRequestCreated>('/assistant/operator', { locale: 'fa', name: 'رضا', phone: '۰۹۱۲ ۳۴۵ ۶۷۸۹', message: 'برای پژو ۲۰۶ لنت مناسب می‌خواهم، مشاوره می‌دهید؟' });
    expect(res.status).toBe(201);
    created = res.body;
    expect(created.key.length).toBeGreaterThanOrEqual(20);
    const db = await services(app);
    const row = await db.prisma.operatorRequest.findUnique({ where: { id: created.id } });
    expect(row.phone).toBe('0912 345 6789');
    expect(row.accessKeyHash).not.toContain(created.key);
    expect(await db.prisma.notification.count({ where: { type: 'operator.request', linkPath: '/admin/assistant?tab=operator' } })).toBeGreaterThanOrEqual(1);
    expect((await guest.post('/assistant/operator', { locale: 'fa', name: 'x', phone: 'abc', message: 'm' })).status).toBe(400);
  });

  it('only the right key opens the thread', async () => {
    const guest = new Client(app);
    const ok = await guest.get<OperatorThreadView>(`/assistant/operator/${created.id}?key=${encodeURIComponent(created.key)}`);
    expect(ok.status).toBe(200);
    expect(ok.body.messages).toHaveLength(1);
    expect(ok.body).not.toHaveProperty('phone');
    expect((await guest.get(`/assistant/operator/${created.id}?key=${'x'.repeat(32)}`)).status).toBe(404);
  });

  it('staff see it as unread, reply, and the guest reads the reply', async () => {
    const list = await owner.get<OperatorRequestList>('/admin/operator-requests');
    expect(list.status).toBe(200);
    const item = list.body.items.find((i) => i.id === created.id)!;
    expect(item).toMatchObject({ name: 'رضا', status: 'OPEN', unreadByStaff: true, signedIn: false });
    expect(list.body.openCount).toBeGreaterThanOrEqual(1);
    const opened = await owner.get<OperatorRequestDetail>(`/admin/operator-requests/${created.id}`);
    expect(opened.body.unreadByStaff).toBe(false);
    const replied = await owner.post<OperatorRequestDetail>(`/admin/operator-requests/${created.id}/reply`, { message: 'سلام رضا جان، لنت جلو موجود است.' });
    expect(replied.status).toBe(201);
    expect(replied.body.status).toBe('ANSWERED');
    const thread = await new Client(app).get<OperatorThreadView>(`/assistant/operator/${created.id}?key=${encodeURIComponent(created.key)}`);
    expect(thread.body.messages.map((m) => m.sender)).toEqual(['VISITOR', 'STAFF']);
    const follow = await new Client(app).post<OperatorThreadView>(`/assistant/operator/${created.id}/messages`, { key: created.key, message: 'ممنون، قیمتش چند است؟' });
    expect(follow.status).toBe(201);
    expect(follow.body.status).toBe('OPEN');
  });

  it('closing stops guest follow-ups; access is limited to staff with conversations.write', async () => {
    expect((await owner.post(`/admin/operator-requests/${created.id}/status`, { status: 'CLOSED' })).status).toBe(201);
    expect((await new Client(app).post(`/assistant/operator/${created.id}/messages`, { key: created.key, message: 'سلام؟' })).status).toBe(409);
    expect((await new Client(app).get('/admin/operator-requests')).status).toBe(401);
    const customer = await loginCustomer(app);
    expect((await customer.get('/admin/operator-requests')).status).toBe(403);
    // Support staff answer customers' conversations, so they can answer operator messages too.
    const support = await inviteStaff(app, owner, 'support');
    expect((await support.get('/admin/operator-requests')).status).toBe(200);
  });

  it('a signed-in customer sees their own requests in the account', async () => {
    const customer = await loginCustomer(app);
    const res = await customer.post<OperatorRequestCreated>('/assistant/operator', { locale: 'en', name: 'Sara', phone: '+98 912 000 1111', message: 'Need advice on oil filters' });
    expect(res.status).toBe(201);
    const mine = await customer.get<OperatorThreadView[]>('/account/operator-requests');
    expect(mine.status).toBe(200);
    expect(mine.body.map((r) => r.id)).toContain(res.body.id);
    await owner.post(`/admin/operator-requests/${res.body.id}/reply`, { message: 'Hi Sara!' });
    const db = await services(app);
    expect(await db.prisma.notification.count({ where: { type: 'operator.reply' } })).toBeGreaterThanOrEqual(1);
  });
});
