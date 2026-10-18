import { vehicleKey } from '@hedax/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Services, type TestApp, bootApp, createProduct, inviteStaff, loginOwner, services } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Vehicle fitment («کاربرد در خودرو»): categories, vehicles and models managed in the panel by
 * owners and managers; product editors only add missing ones quickly; names compared after
 * normalization; merge of duplicates; no direct delete of a vehicle in use; «مناسب برای» on the
 * product, the vehicle filter (a vehicle includes its models), text search and vehicle pages.
 */
let t: TestApp;
let s: Services;
let owner: Client;
const run = Date.now().toString(36);
const SEEDED = ['سوزوکی', 'سمند', 'رنو', 'رانا', 'دنا', 'دنا پلاس', 'هایما', 'پژو', 'پیکان وانت', 'آردی', 'دانگ‌فنگ', 'آریسان', 'تارا', 'ری‌را', 'خودروهای برقی', 'سفیر'];
const list = async () => (await owner.get<any>('/admin/vehicles')).body as { categories: any[]; vehicles: any[] };
const vehicle = async (name: string) => (await list()).vehicles.find((v) => v.name === name);
const anon = () => new Client(t);
const slugsOf = async (qs: string) => (await anon().get<any>(`/catalog/products?${qs}&pageSize=60`)).body.items.map((p: any) => p.sku) as string[];

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
});

afterAll(async () => {
  await t?.close();
});

describe('starting list', () => {
  it('has the sixteen vehicles, without a category, each with its normalized key and its own page address', async () => {
    const { vehicles } = await list();
    for (const name of SEEDED) {
      const v = vehicles.find((x) => x.name === name);
      expect(v, name).toBeTruthy();
      expect(v.categoryId).toBeNull();
    }
    const rows = await s.prisma.vehicle.findMany({ where: { name: { in: SEEDED } } });
    for (const r of rows) expect(r.nameKey, r.name).toBe(vehicleKey(r.name));
    expect((await anon().get<any[]>('/catalog/vehicles')).body.map((v) => v.slug)).toEqual(expect.arrayContaining(['peugeot', 'dena-plus', 'rira']));
  });
});

describe('who manages vehicles', () => {
  it('owner and manager manage; a product editor only adds quickly; other staff cannot', async () => {
    const manager = await inviteStaff(t, owner, 'manager');
    const catalog = await inviteStaff(t, owner, 'catalog_warehouse');
    const support = await inviteStaff(t, owner, 'support');
    const made = await manager.post<any>('/admin/vehicles', { name: `کوییک ${run}`, nameEn: `Quick ${run}` });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect((await manager.patch(`/admin/vehicles/${made.body.id}`, { active: false })).status).toBe(200);
    for (const [method, path, body] of [
      ['POST', '/admin/vehicles', { name: `نفوذی ${run}` }],
      ['PATCH', `/admin/vehicles/${made.body.id}`, { name: 'x' }],
      ['DELETE', `/admin/vehicles/${made.body.id}`, undefined],
      ['POST', '/admin/vehicle-categories', { name: 'سواری نفوذی' }],
      ['POST', '/admin/vehicles/reorder', { ids: [made.body.id] }],
    ] as Array<[string, string, unknown]>) {
      expect((await catalog.req(method, path, body)).status, `catalog ${method} ${path}`).toBe(403);
      expect((await support.req(method, path, body)).status, `support ${method} ${path}`).toBe(403);
    }
    const quick = await catalog.post<any>('/admin/vehicles/quick', { name: `جک ${run}` });
    expect(quick.status, JSON.stringify(quick.body)).toBe(201);
    expect(quick.body.created).toBe(true);
    expect((await support.post('/admin/vehicles/quick', { name: `نیسان ${run}` })).status).toBe(403);
    expect((await manager.del(`/admin/vehicles/${made.body.id}`)).status).toBe(200);
    const audit = await s.prisma.auditLog.findMany({ where: { entityId: made.body.id }, select: { action: true } });
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['vehicle.created', 'vehicle.updated', 'vehicle.deleted']));
  });
});

describe('names are compared after normalization', () => {
  it('spaces, half-spaces, dashes and Arabic letters do not create duplicates; very similar names are suggested', async () => {
    const dup = await owner.post<any>('/admin/vehicles', { name: 'دناپلاس' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('VEHICLE_EXISTS');
    const same = await owner.post<any>('/admin/vehicles/quick', { name: 'دنا‌پلاس' });
    expect(same.body).toMatchObject({ created: false, name: 'دنا پلاس' });
    expect((await owner.post<any>('/admin/vehicles/quick', { name: 'ري را' })).body).toMatchObject({ created: false, name: 'ری‌را' });
    const similar = await owner.post<any>('/admin/vehicles/quick', { name: 'سوزکی' });
    expect(similar.status).toBe(409);
    expect(similar.body.error).toMatchObject({ code: 'VEHICLE_SIMILAR', details: { name: 'سوزوکی' } });
    expect((await owner.post<any>('/admin/vehicles/quick', { name: 'سوزکی', confirmNew: true })).body.created).toBe(true);
  });
});

describe('products, «مناسب برای», filter and search', () => {
  let peugeot: any;
  it('a product fits a whole vehicle or a model; the filter of a vehicle includes its models', { timeout: 120_000 }, async () => {
    peugeot = await vehicle('پژو');
    const m206 = await owner.post<any>(`/admin/vehicles/${peugeot.id}/models`, { name: `۲۰۶ ${run}` });
    const m405 = await owner.post<any>(`/admin/vehicles/${peugeot.id}/models`, { name: `405 ${run}` });
    expect(m206.status).toBe(201);
    const dena = await vehicle('دنا');
    const a = await createProduct(owner, { sku: `FIT-A-${run}`, nameFa: 'لنت جلو آزمایشی', onHand: 3, vehicles: [{ vehicleId: peugeot.id, modelId: m206.body.id }] });
    const b = await createProduct(owner, { sku: `FIT-B-${run}`, nameFa: 'فیلتر روغن آزمایشی', onHand: 3, vehicles: [{ vehicleId: peugeot.id, modelId: null }] });
    await createProduct(owner, { sku: `FIT-C-${run}`, nameFa: `لنت عقب آزمایشی ${run}`, onHand: 3, vehicles: [{ vehicleId: dena.id, modelId: null }] });

    const detail = (await anon().get<any>(`/catalog/products/${a.slug}`)).body;
    expect(detail.fitments).toEqual([{ vehicle: { slug: 'peugeot', name: { fa: 'پژو', en: 'Peugeot' } }, model: { slug: expect.any(String), name: { fa: `۲۰۶ ${run}`, en: null } }, yearFrom: null, yearTo: null, note: null }]);
    expect((await anon().get<any>(`/catalog/products/${b.slug}`)).body.fitments[0]).toMatchObject({ vehicle: { slug: 'peugeot' }, model: null });

    const all = await slugsOf('vehicle=peugeot');
    expect(all).toEqual(expect.arrayContaining([`FIT-A-${run}`, `FIT-B-${run}`]));
    expect(all).not.toContain(`FIT-C-${run}`);
    const model206 = (await owner.get<any>('/admin/vehicles')).body.vehicles.find((v: any) => v.id === peugeot.id).models.find((m: any) => m.id === m206.body.id);
    expect(await slugsOf(`vehicle=peugeot&model=${model206.slug}`)).toEqual(expect.arrayContaining([`FIT-A-${run}`, `FIT-B-${run}`]));
    const m405Slug = (await owner.get<any>('/admin/vehicles')).body.vehicles.find((v: any) => v.id === peugeot.id).models.find((m: any) => m.id === m405.body.id).slug;
    const only405 = await slugsOf(`vehicle=peugeot&model=${m405Slug}`);
    expect(only405).toContain(`FIT-B-${run}`);
    expect(only405).not.toContain(`FIT-A-${run}`);

    // Text search by vehicle name: «لنت دنا» finds the Dena brake pad.
    expect(await slugsOf(`q=${encodeURIComponent(`لنت دنا ${run}`)}`)).toContain(`FIT-C-${run}`);
    expect(await slugsOf(`q=${encodeURIComponent('لنت پژو 206')}`)).toContain(`FIT-A-${run}`);

    // Vehicle page data.
    const page = (await anon().get<any>('/catalog/vehicles/peugeot')).body;
    expect(page).toMatchObject({ slug: 'peugeot', name: { fa: 'پژو' } });
    expect(page.productCount).toBeGreaterThanOrEqual(2);
    expect(page.models.map((m: any) => m.name.fa)).toEqual(expect.arrayContaining([`۲۰۶ ${run}`, `405 ${run}`]));
  });

  it('a vehicle with products is not deleted directly; deactivating hides it; a used model is not deleted either', async () => {
    const del = await owner.del<any>(`/admin/vehicles/${peugeot.id}`);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('VEHICLE_IN_USE');
    expect(del.body.error.details.products).toBeGreaterThanOrEqual(2);
    const usedModel = (await vehicle('پژو')).models.find((m: any) => m.productCount > 0);
    expect((await owner.del<any>(`/admin/vehicles/${peugeot.id}/models/${usedModel.id}`)).body.error.code).toBe('MODEL_IN_USE');

    expect((await owner.patch(`/admin/vehicles/${peugeot.id}`, { active: false })).status).toBe(200);
    try {
      expect((await anon().get('/catalog/vehicles/peugeot')).status).toBe(404);
      expect(await slugsOf('vehicle=peugeot')).toEqual([]);
      const fitA = (await anon().get<any>(`/catalog/products/${(await s.prisma.product.findUniqueOrThrow({ where: { sku: `FIT-A-${run}` } })).slug}`)).body.fitments;
      expect(fitA).toEqual([]);
      // An inactive vehicle cannot be newly linked to a product.
      const tax = (await owner.get<any>('/admin/taxonomy')).body;
      const res = await owner.post<any>('/admin/products', {
        sku: `FIT-X-${run}`, nameFa: 'کالای آزمایشی', categoryId: tax.categories[0].id, unitId: tax.units.find((u: any) => u.name === 'عدد' && u.active).id, partType: 'GENUINE', condition: 'NEW', origin: 'DOMESTIC',
        basePrice: { currency: 'IRR', amountMinor: '1000000' }, vehicles: [{ vehicleId: peugeot.id, modelId: null }],
      });
      expect(res.body.error.code).toBe('VEHICLE_INACTIVE');
    } finally {
      // Other test files use «پژو»: it is active again whatever happened above.
      expect((await owner.patch(`/admin/vehicles/${peugeot.id}`, { active: true })).status).toBe(200);
    }
  });

  it('merges a duplicate: its products and models move over (same model joined), the duplicate is deleted', async () => {
    const dup = await owner.post<any>('/admin/vehicles', { name: `پژو تکراری ${run}` });
    const dupModel = await owner.post<any>(`/admin/vehicles/${dup.body.id}/models`, { name: `206 ${run}` });
    const extraModel = await owner.post<any>(`/admin/vehicles/${dup.body.id}/models`, { name: `پارس ${run}` });
    const d = await createProduct(owner, { sku: `FIT-D-${run}`, nameFa: 'تسمه آزمایشی', onHand: 1, vehicles: [{ vehicleId: dup.body.id, modelId: dupModel.body.id }, { vehicleId: dup.body.id, modelId: extraModel.body.id }] });
    const res = await owner.post<any>(`/admin/vehicles/${peugeot.id}/merge`, { sourceId: dup.body.id });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.mergedProducts).toBe(1);
    expect(await s.prisma.vehicle.findUnique({ where: { id: dup.body.id } })).toBeNull();
    const after = await vehicle('پژو');
    // «206 run» and «۲۰۶ run» are the same model: joined, not doubled; «پارس» moved over.
    expect(after.models.filter((m: any) => vehicleKey(m.name) === vehicleKey(`206 ${run}`))).toHaveLength(1);
    expect(after.models.some((m: any) => m.name === `پارس ${run}`)).toBe(true);
    const links = await s.prisma.productVehicle.findMany({ where: { productId: d.id } });
    expect(links.every((l) => l.vehicleId === peugeot.id)).toBe(true);
    expect(links).toHaveLength(2);
    expect(await slugsOf(`q=${encodeURIComponent('تسمه پژو')}`)).toContain(`FIT-D-${run}`);
    const audit = await s.prisma.auditLog.findMany({ where: { entityId: peugeot.id, action: 'vehicle.merged' } });
    expect(audit).toHaveLength(1);
    expect((await owner.post<any>(`/admin/vehicles/${peugeot.id}/merge`, { sourceId: peugeot.id })).body.error.code).toBe('MERGE_SAME_VEHICLE');
  });
});

describe('order and categories', () => {
  it('drag-and-drop order is saved; a deleted category leaves its vehicles uncategorized', async () => {
    const before = (await list()).vehicles.map((v) => v.id);
    const reversed = [...before].reverse();
    expect((await owner.post('/admin/vehicles/reorder', { ids: reversed })).status).toBe(200);
    expect((await list()).vehicles.map((v) => v.id)).toEqual(reversed);
    expect((await owner.post('/admin/vehicles/reorder', { ids: before })).status).toBe(200);

    const cat = await owner.post<any>('/admin/vehicle-categories', { name: `سواری ${run}`, nameEn: `Passenger ${run}` });
    expect(cat.status).toBe(201);
    const samand = await vehicle('سمند');
    expect((await owner.patch(`/admin/vehicles/${samand.id}`, { categoryId: cat.body.id })).status).toBe(200);
    expect((await anon().get<any[]>('/catalog/vehicles')).body.find((v) => v.slug === 'samand').category.name.fa).toBe(`سواری ${run}`);
    expect((await owner.del(`/admin/vehicle-categories/${cat.body.id}`)).status).toBe(200);
    expect((await vehicle('سمند')).categoryId).toBeNull();
  });
});
