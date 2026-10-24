import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_ASSISTANT_SETTINGS, type AssistantSettingsView } from '@hedax/contracts';
import { bootApp, Client, inviteStaff, loginCustomer, loginOwner, services, type TestApp } from './helpers.js';

let app: TestApp;
let owner: Client;
beforeAll(async () => { app = await bootApp(); owner = await loginOwner(app); });
afterAll(async () => { await app?.close(); });

describe('isolated persisted assistant settings', () => {
  it('defaults off and exposes only the safe projection', async () => {
    const response = await new Client(app).get('/site/assistant');
    expect(response.status).toBe(200);
    const { ai: _ai, ...publicDefaults } = DEFAULT_ASSISTANT_SETTINGS;
    expect(response.body).toEqual(publicDefaults);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.body).not.toHaveProperty('ai');
    expect(response.body).not.toHaveProperty('version');
    expect(response.body).not.toHaveProperty('updatedById');
  });
  it('rejects anonymous, customer and staff without settings.manage', async () => {
    const guest = new Client(app);
    expect((await guest.put('/admin/settings/assistant', { ...DEFAULT_ASSISTANT_SETTINGS, version: 0 })).status).toBe(401);
    const customer = await loginCustomer(app);
    expect((await customer.put('/admin/settings/assistant', { ...DEFAULT_ASSISTANT_SETTINGS, version: 0 })).status).toBe(403);
    const staff = await inviteStaff(app, owner, 'support');
    expect((await staff.get('/admin/settings/assistant')).status).toBe(403);
    expect((await staff.put('/admin/settings/assistant', { ...DEFAULT_ASSISTANT_SETTINGS, version: 0 })).status).toBe(403);
  });
  it('persists atomically, audits and resolves concurrent first saves as one success and one conflict', async () => {
    const base = (await owner.get<AssistantSettingsView>('/admin/settings/assistant')).body;
    const db = await services(app);
    // The audit log is append-only and shared by every file in the run, so count from here.
    const audited = await db.prisma.auditLog.count({ where: { action: 'assistant.settings_updated', entityId: 'assistant.phase1' } });
    const candidate = { ...base, enabled: true, name: { fa: 'راهنمای نمونه', en: 'Sample guide' } };
    const responses = await Promise.all([owner.put('/admin/settings/assistant', candidate), owner.put('/admin/settings/assistant', candidate)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const current = (await owner.get<AssistantSettingsView>('/admin/settings/assistant')).body;
    expect(current.enabled).toBe(true);
    expect(current.name.en).toBe('Sample guide');
    expect(current.ai.systemPrompt.fa).toBe(DEFAULT_ASSISTANT_SETTINGS.ai.systemPrompt.fa);
    expect(current.version).toBe(base.version + 1);
    expect((await db.prisma.siteSetting.findUnique({ where: { key: 'assistant.phase1' } })).value.name.en).toBe('Sample guide');
    expect(await db.prisma.auditLog.count({ where: { action: 'assistant.settings_updated', entityId: 'assistant.phase1' } })).toBe(audited + 1);
    expect((await new Client(app).get('/site/assistant')).body.name.en).toBe('Sample guide');
    expect((await owner.put('/admin/settings/assistant', candidate)).status).toBe(409);
  });
  it('rejects invalid size, markup, unknown URLs and does not modify persisted values', async () => {
    const current = (await owner.get<AssistantSettingsView>('/admin/settings/assistant')).body;
    for (const change of [{ mobileSize: 500 }, { placement: 'arbitrary-css' }, { name: { fa: '<img src=x>', en: 'Guide' } }, { providerKey: 'not-allowed' }]) {
      expect((await owner.put('/admin/settings/assistant', { ...current, ...change })).status).toBe(400);
    }
    expect((await owner.get('/admin/settings/assistant')).body).toEqual(current);
    expect((await owner.put('/admin/settings/assistant', { ...DEFAULT_ASSISTANT_SETTINGS, version: current.version })).status).toBe(200);
    expect((await new Client(app).get('/site/assistant')).body.enabled).toBe(false);
  });
});
