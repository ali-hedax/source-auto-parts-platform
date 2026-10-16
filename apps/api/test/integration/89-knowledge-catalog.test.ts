import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Client, type Services, type TestApp, bootApp, drainOutbox, loginCustomer, loginOwner, services, simplePdf,
} from './helpers.js';

let t: TestApp;
let s: Services;
let owner: Client;

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
});
afterAll(async () => { await t?.close(); });

describe('knowledge catalog phase one', () => {
  it('stores a scanned private PDF with uploader, version and workflow status', async () => {
    const uploaded = await owner.upload('/attachments', { purpose: 'KNOWLEDGE_CATALOG' }, [
      { name: 'brakes-v2.pdf', data: simplePdf('brake catalog') },
    ]);
    expect(uploaded.status).toBe(201);
    const attachmentId = uploaded.body[0].id as string;
    await drainOutbox(s, ['attachment.scan'], attachmentId);

    const created = await owner.post('/admin/knowledge-catalog', { attachmentId, title: 'کاتالوگ ترمز', version: '2.0' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({ title: 'کاتالوگ ترمز', version: '2.0', status: 'UPLOADED', filename: 'brakes-v2.pdf', extension: 'pdf' });
    expect(created.body.sha256).toMatch(/^[a-f0-9]{64}$/);

    const pending = await owner.patch(`/admin/knowledge-catalog/${created.body.id}/status`, { status: 'PENDING_PROCESSING' });
    expect(pending.status).toBe(200);
    const approved = await owner.patch(`/admin/knowledge-catalog/${created.body.id}/status`, { status: 'APPROVED' });
    expect(approved.body.status).toBe('APPROVED');
    expect(approved.body.approvedAt).toBeTruthy();

    const list = await owner.get('/admin/knowledge-catalog');
    expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.id, status: 'APPROVED' })]));
    expect(await s.prisma.catalogDocumentChunk.count({ where: { documentId: created.body.id } })).toBe(0);
  });

  it('rejects unsupported files and denies customers', async () => {
    const wrong = await owner.upload('/attachments', { purpose: 'KNOWLEDGE_CATALOG' }, [
      { name: 'notes.docx', data: new Uint8Array([1, 2, 3, 4]) },
    ]);
    expect(wrong.body[0]).toMatchObject({ status: 'REJECTED' });

    const customer = await loginCustomer(t);
    const denied = await customer.upload('/attachments', { purpose: 'KNOWLEDGE_CATALOG' }, [
      { name: 'catalog.pdf', data: simplePdf() },
    ]);
    expect(denied.status).toBe(403);
  });
});
