import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BuilderState, BuilderDocument, BuilderMedia, BuilderRevision } from '@hedax/contracts';
import { Client, type Staff, type TestApp, bootApp, inviteStaff, loginOwner, pngBytes } from './helpers.js';
let t: TestApp; let owner: Client; let manager: Staff; let support: Staff;
const slug = `builder-${Date.now().toString(36)}`;
const endpoint = `/admin/content/builder/${slug}`;
const state = async () => (await owner.get<BuilderState>(endpoint)).body;
beforeAll(async () => { t = await bootApp(); owner = await loginOwner(t); manager = await inviteStaff(t, owner, 'manager'); support = await inviteStaff(t, owner, 'support'); });
afterAll(async () => { await t?.close(); });
describe('visual builder with real PostgreSQL and authentication', () => {
  it('protects private drafts and separates edit and publication permissions', async () => {
    expect((await new Client(t).get(endpoint)).status).toBe(401);
    expect((await support.get(endpoint)).status).toBe(403);
    const draft = await state(); draft.document.title.fa = 'پیش‌نویس خصوصی';
    expect((await manager.put(endpoint, { version: 0, document: draft.document })).status).toBe(200);
    expect((await new Client(t).get(`/site/builder/${slug}`)).body).toBe(null);
    const saved = await state();
    expect((await manager.post(`${endpoint}/publish`, { version: saved.version })).status).toBe(403);
    expect((await owner.post(`${endpoint}/publish`, { version: saved.version })).status).toBe(201);
    expect((await new Client(t).get<BuilderDocument>(`/site/builder/${slug}`)).body.title.fa).toBe('پیش‌نویس خصوصی');
  });
  it('rejects simultaneous edits atomically and never leaks saved drafts', async () => {
    const draft = await state();
    const results = await Promise.all(['first', 'second'].map(title => owner.put(endpoint, { version: draft.version, document: { ...draft.document, title: { fa: title, en: '' } } })));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await new Client(t).get<BuilderDocument>(`/site/builder/${slug}`)).body.title.fa).toBe('پیش‌نویس خصوصی');
  });
  it('validates before writing and restores a retained publication', async () => {
    const draft = await state();
    expect((await owner.put(endpoint, { version: draft.version, document: { ...draft.document, schemaVersion: 999 } })).status).toBe(400);
    const history = (await owner.get<BuilderRevision[]>(`${endpoint}/history`)).body;
    const published = history.find(r => r.action === 'publish')!;
    expect(published).toBeDefined();
    expect((await owner.post(`${endpoint}/restore`, { version: draft.version, revisionId: published.id })).status).toBe(201);
    expect((await state()).document.title.fa).toBe('پیش‌نویس خصوصی');
    expect((await owner.post(`${endpoint}/publish`, { version: draft.version })).status).toBe(409);
  });
  it('rejects fake images and prevents archiving media used in drafts or revisions', async () => {
    const bad = await owner.upload('/admin/content/media', {}, [{ name: 'bad.jpg', data: new TextEncoder().encode('<script>evil</script>'), field: 'file', type: 'image/jpeg' }]);
    expect(bad.status).toBe(400);
    const upload = await owner.upload<BuilderMedia>('/admin/content/media', {}, [{ name: 'builder.png', data: await pngBytes(), field: 'file', type: 'image/png' }]);
    expect(upload.status).toBe(201);
    const draft = await state(); draft.document.description.fa = upload.body.url;
    expect((await owner.put(endpoint, { version: draft.version, document: draft.document })).status).toBe(200);
    expect((await owner.delete(`/admin/content/media/${upload.body.id}`)).status).toBe(409);
  });
});
