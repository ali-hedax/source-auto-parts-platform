import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AssistantSettingsView, VehicleBrandView } from '@hedax/contracts';
import { bootApp, Client, inviteStaff, loginOwner, pngBytes, services, type TestApp } from './helpers.js';

let app: TestApp;
let owner: Client;
beforeAll(async () => { app = await bootApp(); owner = await loginOwner(app); });
afterAll(async () => {
  // Files share one database: leave the assistant settings as "never saved", as other files expect.
  if (app) await (await services(app)).prisma.siteSetting.deleteMany({ where: { key: 'assistant.phase1' } });
  await app?.close();
});

interface AdminBrand { id: string; code: string; slug: string; nameFa: string; nameEn: string | null; logoUrl: string | null; isFeatured: boolean; sortOrder: number; active: boolean }

describe('panel-managed brand logos and guide avatar (release fixes)', () => {
  it('stores a vehicle-brand logo and names, shows them publicly, and keeps the old logo on a rejected save', async () => {
    const upload = await owner.upload<{ url: string }>('/admin/content/images?purpose=logo', {}, [{ name: 'brand.png', data: await pngBytes(), field: 'file', type: 'image/png' }]);
    expect(upload.status).toBe(201);
    const code = `TB${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
    const created = await owner.post<AdminBrand>('/admin/vehicle-brands', { code, nameFa: 'برند آزمایشی', nameEn: 'Test Make', isFeatured: true, sortOrder: 0, active: true });
    expect(created.status).toBe(201);
    const id = created.body.id;
    const body = { code, nameFa: 'برند آزمایشی', nameEn: 'Test Make', isFeatured: true, sortOrder: 0, active: true };
    expect((await owner.put(`/admin/vehicle-brands/${id}`, { ...body, logoUrl: upload.body.url })).status).toBe(200);
    // Reload: the stored value comes back from the admin list and the public catalog.
    const admin = (await owner.get<{ vehicleBrands: AdminBrand[] }>('/admin/taxonomy')).body.vehicleBrands.find((b) => b.id === id)!;
    expect(admin.logoUrl).toBe(upload.body.url);
    const pub = (await new Client(app).get<VehicleBrandView[]>('/catalog/vehicle-brands')).body.find((b) => b.code === code)!;
    expect(pub).toMatchObject({ logoUrl: upload.body.url, name: { fa: 'برند آزمایشی', en: 'Test Make' } });
    // Unsafe or foreign addresses are refused and the stored logo stays.
    for (const logoUrl of ['javascript:alert(1)', '//evil.example/x.png', 'https://evil.example/x.svg', '/media/x.html']) {
      expect((await owner.put(`/admin/vehicle-brands/${id}`, { ...body, logoUrl })).status, logoUrl).toBe(400);
    }
    expect((await owner.get<{ vehicleBrands: AdminBrand[] }>('/admin/taxonomy')).body.vehicleBrands.find((b) => b.id === id)!.logoUrl).toBe(upload.body.url);
    // Saving without the field keeps the logo; an empty value removes it.
    expect((await owner.put(`/admin/vehicle-brands/${id}`, body)).status).toBe(200);
    expect((await owner.get<{ vehicleBrands: AdminBrand[] }>('/admin/taxonomy')).body.vehicleBrands.find((b) => b.id === id)!.logoUrl).toBe(upload.body.url);
    expect((await owner.put(`/admin/vehicle-brands/${id}`, { ...body, logoUrl: '' })).status).toBe(200);
    expect((await new Client(app).get<VehicleBrandView[]>('/catalog/vehicle-brands')).body.find((b) => b.code === code)!.logoUrl).toBeNull();
    // Files share one database: leave the catalog as other files expect it.
    await (await services(app)).prisma.vehicleBrand.delete({ where: { id } });
  });

  it('allows brand edits only with products.write, enforced by the API', async () => {
    const brand = (await owner.get<{ vehicleBrands: AdminBrand[] }>('/admin/taxonomy')).body.vehicleBrands[0]!;
    const body = { code: brand.code, nameFa: brand.nameFa, nameEn: brand.nameEn, sortOrder: brand.sortOrder, active: brand.active, logoUrl: '' };
    expect((await new Client(app).put(`/admin/vehicle-brands/${brand.id}`, body)).status).toBe(401);
    const support = await inviteStaff(app, owner, 'support');
    expect((await support.put(`/admin/vehicle-brands/${brand.id}`, body)).status).toBe(403);
    expect((await owner.get<{ vehicleBrands: AdminBrand[] }>('/admin/taxonomy')).body.vehicleBrands[0]!.logoUrl).toBe(brand.logoUrl);
  });

  it('stores the guide avatar, publishes it, and refuses unsafe addresses and unauthorised staff', async () => {
    const upload = await owner.upload<{ url: string }>('/admin/content/images?purpose=image', {}, [{ name: 'avatar.png', data: await pngBytes(), field: 'file', type: 'image/png' }]);
    expect(upload.status).toBe(201);
    const base = (await owner.get<AssistantSettingsView>('/admin/settings/assistant')).body;
    expect(base.avatarUrl).toBe('');
    const saved = await owner.put<AssistantSettingsView>('/admin/settings/assistant', { ...base, avatarUrl: upload.body.url });
    expect(saved.status).toBe(200);
    expect((await owner.get<AssistantSettingsView>('/admin/settings/assistant')).body.avatarUrl).toBe(upload.body.url);
    expect((await new Client(app).get<{ avatarUrl: string }>('/site/assistant')).body.avatarUrl).toBe(upload.body.url);
    const current = (await owner.get<AssistantSettingsView>('/admin/settings/assistant')).body;
    for (const avatarUrl of ['javascript:alert(1)', 'https://evil.example/a.gif', '//evil.example/a.png']) {
      expect((await owner.put('/admin/settings/assistant', { ...current, avatarUrl })).status, avatarUrl).toBe(400);
    }
    const support = await inviteStaff(app, owner, 'support');
    expect((await support.put('/admin/settings/assistant', { ...current, avatarUrl: '' })).status).toBe(403);
    expect((await new Client(app).get<{ avatarUrl: string }>('/site/assistant')).body.avatarUrl).toBe(upload.body.url);
    // Settings saved before this field existed still load (the stored row simply lacks it).
    const db = await services(app);
    const { version: _version, avatarUrl: _avatar, ...legacy } = current;
    await db.prisma.siteSetting.update({ where: { key: 'assistant.phase1' }, data: { value: legacy as never } });
    expect((await owner.get<AssistantSettingsView>('/admin/settings/assistant')).body.avatarUrl).toBe('');
  });
});
