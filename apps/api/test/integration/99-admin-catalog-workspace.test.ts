import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Services, type TestApp, bootApp, createProduct, drainOutbox, loginCustomer, loginOwner, services, simplePdf } from './helpers.js';

let app: TestApp; let db: Services; let owner: Client;
const suffix = Date.now().toString(36).toUpperCase();
beforeAll(async () => { app = await bootApp(); db = await services(app); owner = await loginOwner(app); });
afterAll(async () => { await app?.close(); });

async function reference(title = `Reference ${suffix}`) {
  const uploaded = await owner.upload('/attachments', { purpose: 'KNOWLEDGE_CATALOG' }, [{ name: 'catalog.pdf', data: simplePdf('Test catalog') }]);
  expect(uploaded.status).toBe(201);
  await drainOutbox(db, ['attachment.scan'], uploaded.body[0].id);
  const created = await owner.post('/admin/knowledge-catalog', { attachmentId: uploaded.body[0].id, title, version: '1' });
  expect(created.status).toBe(201);
  return { ...created.body, attachmentId: uploaded.body[0].id };
}

describe('catalog administration workflows with real persistence', () => {
  it('edits metadata, rejects stale edits/deletes and removes only an unused reference', async () => {
    const doc = await reference();
    const edited = await owner.patch(`/admin/knowledge-catalog/${doc.id}`, { title: `Edited ${suffix}`, version: '2', expectedUpdatedAt: doc.updatedAt });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect((await owner.get(`/admin/knowledge-catalog?q=Edited%20${suffix}`)).body[0]).toMatchObject({ id: doc.id, version: '2' });
    expect((await owner.patch(`/admin/knowledge-catalog/${doc.id}`, { title: 'Stale edit', version: '3', expectedUpdatedAt: doc.updatedAt })).status).toBe(409);
    expect((await owner.req('DELETE', `/admin/knowledge-catalog/${doc.id}`, { expectedUpdatedAt: doc.updatedAt })).status).toBe(409);
    await db.prisma.catalogDocumentChunk.create({ data: { documentId: doc.id, ordinal: 0, contentText: 'sample' } });
    expect((await owner.req('DELETE', `/admin/knowledge-catalog/${doc.id}`, { expectedUpdatedAt: edited.body.updatedAt })).status).toBe(200);
    expect(await db.prisma.catalogDocument.findUnique({ where: { id: doc.id } })).toBeNull();
    expect(await db.prisma.catalogDocumentChunk.count({ where: { documentId: doc.id } })).toBe(0);
    expect((await db.prisma.attachment.findUnique({ where: { id: doc.attachmentId } })).deletedAt).toBeTruthy();
    expect(await db.prisma.auditLog.count({ where: { entityId: doc.id, action: 'catalog_document.deleted' } })).toBe(1);
  });

  it('protects processing/linked references and never pretends a PDF can be extracted', async () => {
    const doc = await reference(`Protected ${suffix}`);
    expect((await owner.post(`/admin/knowledge-catalog/${doc.id}/extract`, {})).body.error.code).toBe('CATALOG_EXTRACTION_UNSUPPORTED');
    expect((await owner.patch(`/admin/knowledge-catalog/${doc.id}/status`, { status: 'PENDING_PROCESSING' })).body.error.code).toBe('CATALOG_USE_EXTRACTION');
    const pending = await db.prisma.catalogDocument.update({ where: { id: doc.id }, data: { status: 'PENDING_PROCESSING' } });
    expect((await owner.req('DELETE', `/admin/knowledge-catalog/${doc.id}`, { expectedUpdatedAt: pending.updatedAt.toISOString() })).body.error.code).toBe('CATALOG_PROCESSING');
    expect((await owner.patch(`/admin/knowledge-catalog/${doc.id}/status`, { status: 'APPROVED' })).status).toBe(409);
    const ready = await db.prisma.catalogDocument.update({ where: { id: doc.id }, data: { status: 'NEEDS_REVIEW' } });
    await db.prisma.catalogEntry.create({ data: { slug: `reference-${suffix}`, partNumber: `REF-${suffix}`, partNumberKey: `REF${suffix}`, nameFa: 'مرجع آزمایشی', sourceDocumentId: doc.id } });
    expect((await owner.req('DELETE', `/admin/knowledge-catalog/${doc.id}`, { expectedUpdatedAt: ready.updatedAt.toISOString() })).body.error.code).toBe('CATALOG_IN_USE');
    expect((await db.prisma.attachment.findUnique({ where: { id: doc.attachmentId } })).deletedAt).toBeNull();
  });

  it('loads extracted rows beyond the previous first-100 limit', async () => {
    const doc = await reference(`Many rows ${suffix}`);
    await db.prisma.catalogDocumentChunk.createMany({ data: Array.from({ length: 105 }, (_, ordinal) => ({ documentId: doc.id, ordinal, contentText: `row ${ordinal}` })) });
    const first = await owner.get(`/admin/knowledge-catalog/${doc.id}/preview`);
    expect(first.body).toHaveLength(100);
    const next = await owner.get(`/admin/knowledge-catalog/${doc.id}/preview?after=99`);
    expect(next.body).toHaveLength(5); expect(next.body[0].ordinal).toBe(100);
    expect((await owner.get('/admin/knowledge-catalog?page=0')).status).toBe(400);
  });

  it('edits/deactivates manufacturers and deletes only unused setup entries', async () => {
    const created = await owner.post('/admin/manufacturer-brands', { nameFa: `سازنده ${suffix}`, nameEn: `Maker ${suffix}` });
    expect(created.status).toBe(201);
    const updated = await owner.put(`/admin/manufacturer-brands/${created.body.id}`, { nameFa: `سازنده ویرایش ${suffix}`, nameEn: `Maker updated ${suffix}`, active: false, countryCode: 'DE' });
    expect(updated.body).toMatchObject({ active: false, countryCode: 'DE' });
    expect((await owner.req('DELETE', `/admin/taxonomy/manufacturer-brands/${created.body.id}`)).status).toBe(200);
    const parent = await owner.post('/admin/categories', { code: `P_${suffix}`, nameFa: 'دستهٔ والد' });
    const child = await owner.post('/admin/categories', { code: `C_${suffix}`, nameFa: 'دستهٔ فرزند', parentId: parent.body.id });
    expect((await owner.put(`/admin/categories/${parent.body.id}`, { code: `P_${suffix}`, nameFa: 'دستهٔ والد', parentId: child.body.id })).body.error.code).toBe('INVALID_PARENT');
    expect((await owner.req('DELETE', `/admin/taxonomy/categories/${parent.body.id}`)).body.error.code).toBe('TAXONOMY_IN_USE');
    expect((await owner.req('DELETE', `/admin/taxonomy/categories/${child.body.id}`)).status).toBe(200);
    expect((await owner.req('DELETE', `/admin/taxonomy/categories/${parent.body.id}`)).status).toBe(200);
  });

  it('archives/restores without removing history or automatically restarting sales', async () => {
    const part = await createProduct(owner, { sku: `RESTORE-${suffix}`, nameFa: 'قطعهٔ بازگشت آزمایشی', onHand: 7 });
    const before = (await owner.get(`/admin/products/${part.id}`)).body;
    expect((await owner.post(`/admin/products/${part.id}/archive`, { version: before.version })).status).toBe(201);
    const archived = (await owner.get(`/admin/products/${part.id}`)).body;
    expect((await owner.post(`/admin/products/${part.id}/restore`, { version: before.version })).status).toBe(409);
    expect((await owner.post(`/admin/products/${part.id}/restore`, { version: archived.version })).status).toBe(201);
    const restored = (await owner.get(`/admin/products/${part.id}`)).body;
    expect(restored).toMatchObject({ archived: false, published: false, isSellable: false });
    expect(restored.inventory.onHand).toBe(7);
    expect((await owner.req('DELETE', `/admin/taxonomy/categories/${before.categoryId}`)).body.error.code).toBe('TAXONOMY_IN_USE');
  });

  it('manages a finder vehicle and cited trim years through the panel API', async () => {
    const group = await owner.post('/admin/vehicle-brands', { code: `F_${suffix}`, nameFa: 'گروه آزمایشی خودرو' });
    const vehicle = await owner.post('/admin/vehicles', { name: `خودروی ${suffix}`, nameEn: `Test vehicle ${suffix}`, makeFa: 'برند اصلی آزمایشی', aliases: ['نام جایگزین آزمایشی'], finderVisible: true, finderGroupIds: [group.body.id] });
    expect(vehicle.status, JSON.stringify(vehicle.body)).toBe(201);
    const listed = (await new Client(app).get(`/catalog/vehicle-finder/vehicles?group=${group.body.slug}`)).body;
    expect(listed).toEqual(expect.arrayContaining([expect.objectContaining({ slug: vehicle.body.slug, aliases: ['نام جایگزین آزمایشی'] })]));
    const trim = await owner.post(`/admin/vehicles/${vehicle.body.id}/models`, { name: 'تیپ آزمایشی' });
    expect(trim.status).toBe(201);
    const path = `/admin/vehicles/${vehicle.body.id}/models/${trim.body.id}`;
    expect((await owner.patch(path, { yearFrom: 1395, yearTo: 1400, yearCalendar: 'jalali' })).body.error.code).toBe('VEHICLE_YEAR_SOURCE_REQUIRED');
    expect((await owner.patch(path, { yearFrom: 1395, yearTo: 2020, yearCalendar: 'jalali', sourceUrl: 'https://example.com/spec' })).body.error.code).toBe('VEHICLE_YEARS_INVALID');
    expect((await owner.patch(path, { yearFrom: 1395, yearTo: 1400, yearCalendar: 'jalali', supply: 'assembled', supplierFa: 'عرضه‌کنندهٔ نمونه', sourceUrl: 'https://example.com/spec' })).status).toBe(200);
    const models = (await new Client(app).get(`/catalog/vehicle-finder/models?vehicle=${vehicle.body.slug}`)).body;
    expect(models[0]).toMatchObject({ years: { from: 1395, to: 1400, calendar: 'jalali' }, supply: 'assembled' });
    expect(await db.prisma.vehicleSource.count({ where: { modelId: trim.body.id, url: 'https://example.com/spec' } })).toBe(1);
    expect((await owner.patch(`/admin/vehicles/${vehicle.body.id}`, { finderVisible: false })).status).toBe(200);
    expect((await new Client(app).get(`/catalog/vehicle-finder/vehicles?group=${group.body.slug}`)).body).toHaveLength(0);
  });

  it('rejects customers and exposes configuration facts without claiming live AI or RAG', async () => {
    const customer = await loginCustomer(app);
    expect((await customer.get('/admin/knowledge-catalog')).status).toBe(403);
    const status = await owner.get('/admin/assistant/status');
    expect(status.body).toMatchObject({ connectionVerified: false, referenceDocumentsConnected: false, knowledgeSource: 'catalog_products', configurationReady: false });
    expect(JSON.stringify(status.body)).not.toContain('ARVAN_AI_API_KEY');
  });
});
