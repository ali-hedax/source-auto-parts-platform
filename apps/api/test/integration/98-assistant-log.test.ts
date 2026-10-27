import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_ASSISTANT_SETTINGS, type AssistantConversationDetail, type AssistantConversationList, type AssistantSettingsView } from '@hedax/contracts';
import { bootApp, Client, inviteStaff, loginCustomer, loginOwner, services, type TestApp } from './helpers.js';

/**
 * The guide's conversation log: every question and answer is stored for the owner's review
 * (Admin → AI Chatbot → Messages), only staff with settings.manage can read or delete it,
 * and a deletion is audited without its content. The synthetic provider stands in for Arvan.
 */
let app: TestApp;
let owner: Client;
beforeAll(async () => {
  process.env.ASSISTANT_AI_PROVIDER = 'mock';
  app = await bootApp();
  owner = await loginOwner(app);
  const current = (await owner.get<AssistantSettingsView>('/admin/settings/assistant')).body;
  expect((await owner.put('/admin/settings/assistant', { ...current, enabled: true })).status).toBe(200);
});
afterAll(async () => {
  if (owner) {
    const current = (await owner.get<AssistantSettingsView>('/admin/settings/assistant')).body;
    await owner.put('/admin/settings/assistant', { ...DEFAULT_ASSISTANT_SETTINGS, version: current.version });
  }
  await app?.close();
});

describe('assistant conversation log', () => {
  const conversationId = randomUUID();

  it('records each question and the guide\'s answer under the visitor\'s chat session', async () => {
    const visitor = new Client(app);
    const first = await visitor.post<{ text: string }>('/assistant/messages', { locale: 'fa', message: 'لنت ترمز می‌خواهم', history: [], conversationId });
    expect(first.status).toBe(201);
    const second = await visitor.post<{ text: string }>('/assistant/messages', { locale: 'fa', message: 'فیلتر روغن هم دارید؟', history: [{ role: 'user', content: 'لنت ترمز می‌خواهم' }, { role: 'assistant', content: first.body.text }], conversationId });
    expect(second.status).toBe(201);

    const list = await owner.get<AssistantConversationList>('/admin/assistant/conversations');
    expect(list.status).toBe(200);
    expect(list.body.retentionDays).toBe(90);
    const row = list.body.items.find((c) => c.firstQuestion === 'لنت ترمز می‌خواهم');
    expect(row).toMatchObject({ locale: 'fa', signedIn: false, messageCount: 2, failedCount: 0, lastAnswer: second.body.text });
    expect(list.body.stats.messages7d).toBeGreaterThanOrEqual(2);

    const detail = await owner.get<AssistantConversationDetail>(`/admin/assistant/conversations/${row!.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.messages.map((m) => [m.question, m.answer, m.status])).toEqual([
      ['لنت ترمز می‌خواهم', first.body.text, 'ANSWERED'],
      ['فیلتر روغن هم دارید؟', second.body.text, 'ANSWERED'],
    ]);
    expect(detail.body.messages[0]).toMatchObject({ provider: 'mock' });
    // The visitor's IP is stored only as a hash and never returned.
    expect(JSON.stringify(detail.body)).not.toMatch(/ipHash|127\.0\.0\.1/);
  });

  it('searches question and answer text and filters conversations with errors', async () => {
    const found = await owner.get<AssistantConversationList>(`/admin/assistant/conversations?q=${encodeURIComponent('فیلتر روغن')}`);
    expect(found.body.items.some((c) => c.firstQuestion === 'لنت ترمز می‌خواهم')).toBe(true);
    const none = await owner.get<AssistantConversationList>(`/admin/assistant/conversations?q=${encodeURIComponent('هیچ‌چیز-نامرتبط-۱۲۳')}`);
    expect(none.body.total).toBe(0);
    const failed = await owner.get<AssistantConversationList>('/admin/assistant/conversations?status=failed');
    expect(failed.body.items.some((c) => c.firstQuestion === 'لنت ترمز می‌خواهم')).toBe(false);
    expect((await owner.get('/admin/assistant/conversations?page=0')).status).toBe(400);
  });

  it('a message without a chat session still gets its own conversation', async () => {
    const res = await new Client(app).post('/assistant/messages', { locale: 'en', message: 'Do you have spark plugs?', history: [] });
    expect(res.status).toBe(201);
    const list = await owner.get<AssistantConversationList>(`/admin/assistant/conversations?q=${encodeURIComponent('spark plugs')}`);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ locale: 'en', messageCount: 1 });
  });

  it('only staff with settings.manage can read or delete the log', async () => {
    const id = (await owner.get<AssistantConversationList>('/admin/assistant/conversations')).body.items[0]!.id;
    expect((await new Client(app).get('/admin/assistant/conversations')).status).toBe(401);
    const customer = await loginCustomer(app);
    expect((await customer.get('/admin/assistant/conversations')).status).toBe(403);
    const staff = await inviteStaff(app, owner, 'support');
    expect((await staff.get('/admin/assistant/conversations')).status).toBe(403);
    expect((await staff.get(`/admin/assistant/conversations/${id}`)).status).toBe(403);
    expect((await staff.del(`/admin/assistant/conversations/${id}`)).status).toBe(403);
    expect((await owner.get(`/admin/assistant/conversations/${randomUUID()}`)).status).toBe(404);
  });

  it('deletes a conversation with its messages and audits it without the content', async () => {
    const list = await owner.get<AssistantConversationList>(`/admin/assistant/conversations?q=${encodeURIComponent('لنت ترمز')}`);
    const id = list.body.items[0]!.id;
    expect((await owner.del(`/admin/assistant/conversations/${id}`)).status).toBe(200);
    expect((await owner.get(`/admin/assistant/conversations/${id}`)).status).toBe(404);
    const db = await services(app);
    expect(await db.prisma.assistantMessage.count({ where: { conversationId: id } })).toBe(0);
    const audit = await db.prisma.auditLog.findFirst({ where: { action: 'assistant.conversation_deleted', entityId: id } });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit)).not.toContain('لنت');
  });
});
