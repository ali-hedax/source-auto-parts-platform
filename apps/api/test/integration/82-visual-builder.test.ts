import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newBuilderBlock, type BuilderState, type BuilderDocument, type BuilderMedia, type BuilderRevision } from '@hedax/contracts';
import { Client, type Staff, type TestApp, bootApp, inviteStaff, loginOwner, pngBytes } from './helpers.js';
let t: TestApp; let owner: Client; let manager: Staff; let support: Staff; let editor: Staff;
const slug = `builder-${Date.now().toString(36)}`;
const endpoint = `/admin/content/builder/${slug}`;
const state = async () => (await owner.get<BuilderState>(endpoint)).body;
beforeAll(async () => { t = await bootApp(); owner = await loginOwner(t); manager = await inviteStaff(t, owner, 'manager'); support = await inviteStaff(t, owner, 'support');
  // A custom role that may edit site content but not publish it.
  const key = `builder_editor_${Date.now().toString(36)}`.slice(0, 40);
  const role = await owner.post('/admin/roles', { key, nameFa: 'ویرایشگر محتوا', nameEn: 'Content editor', permissions: ['dashboard.view', 'content.manage'] });
  if (role.status !== 201) throw new Error(`role failed ${role.status} ${JSON.stringify(role.body)}`);
  editor = await inviteStaff(t, owner, key); });
afterAll(async () => { await t?.close(); });
describe('visual builder with real PostgreSQL and authentication', () => {
  it('protects private drafts and separates edit and publication permissions', async () => {
    expect((await new Client(t).get(endpoint)).status).toBe(401);
    expect((await support.get(endpoint)).status).toBe(403);
    const draft = await state(); draft.document.title.fa = 'پیش‌نویس خصوصی';
    expect((await editor.put(endpoint, { version: 0, document: draft.document })).status).toBe(200);
    expect((await new Client(t).get(`/site/builder/${slug}`)).body).toBe(null);
    const saved = await state();
    expect((await editor.post(`${endpoint}/publish`, { version: saved.version })).status).toBe(403);
    // The built-in manager role runs the site's content, publication included (only staff and roles are owner-only).
    expect((await manager.post(`${endpoint}/publish`, { version: saved.version })).status).toBe(201);
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
  it('serves builder product collections publicly and validates their input', async () => {
    const guest = new Client(t);
    for (const kind of ['bestsellers', 'discounts', 'selected-products', 'offers']) {
      const res = await guest.get(`/catalog/collections/${kind}?limit=4`);
      expect(res.status, kind).toBe(200);
      expect(Array.isArray(res.body), kind).toBe(true);
    }
    expect((await guest.get('/catalog/collections/unknown')).status).toBe(400);
    expect((await guest.get('/catalog/collections/selected-products?slugs=' + encodeURIComponent("x';--"))).status).toBe(400);
  });
  it('rejects fake images and prevents archiving media used in drafts or revisions', async () => {
    const bad = await owner.upload('/admin/content/media', {}, [{ name: 'bad.jpg', data: new TextEncoder().encode('<script>evil</script>'), field: 'file', type: 'image/jpeg' }]);
    expect(bad.status).toBe(400);
    const upload = await owner.upload<BuilderMedia>('/admin/content/media', {}, [{ name: 'builder.png', data: await pngBytes(), field: 'file', type: 'image/png' }]);
    expect(upload.status).toBe(201);
    const draft = await state(); draft.document.description.fa = upload.body.url;
    expect((await owner.put(endpoint, { version: draft.version, document: draft.document })).status).toBe(200);
    expect((await owner.del(`/admin/content/media/${upload.body.id}`)).status).toBe(409);
  });
  it('accepts only real hero videos and publishes a hero film only with release-cleared media', async () => {
    // Synthetic 1 s colour bars (packages/domain/test/fixtures), never third-party footage.
    const video = (name: string) => new Uint8Array(readFileSync(new URL(`../../../../packages/domain/test/fixtures/video/${name}`, import.meta.url)));
    const fake = await owner.upload('/admin/content/media/video', {}, [{ name: 'hero.mp4', data: new TextEncoder().encode('<html><script>evil</script></html>'), field: 'file', type: 'video/mp4' }]);
    expect(fake.status).toBe(400);
    expect((await owner.upload('/admin/content/media/video', {}, [{ name: 'hero.mp4', data: video('audio-only.mp4'), field: 'file', type: 'video/mp4' }])).status).toBe(400);
    expect((await support.upload('/admin/content/media/video', {}, [{ name: 'hero.mp4', data: video('tiny-faststart.mp4'), field: 'file', type: 'video/mp4' }])).status).toBe(403);
    const mp4 = await owner.upload<BuilderMedia>('/admin/content/media/video', {}, [{ name: 'hero.mp4', data: video('tiny-faststart.mp4'), field: 'file', type: 'video/mp4' }]);
    expect(mp4.status).toBe(201);
    expect(mp4.body).toMatchObject({ kind: 'video', mime: 'video/mp4', width: 64, height: 64, releaseCleared: false });
    expect(mp4.body.url).toMatch(/\.mp4$/);
    const webm = await owner.upload<BuilderMedia>('/admin/content/media/video', {}, [{ name: 'hero.webm', data: video('tiny.webm'), field: 'file', type: 'video/webm' }]);
    expect(webm.status).toBe(201);
    expect(webm.body.kind).toBe('video');

    const draft = await state();
    const hero = { ...newBuilderBlock('cinematic-hero', 'film'),
      film: { clips: [{ id: 'main', active: true, desktop: mp4.body.url, desktopWebm: webm.body.url, mobile: '', poster: '', mobilePoster: '' }], playback: 'once' as const, logoAt: 0.5, logoUrl: '/brand/source/logo-dark.png', logoWidth: 28, discovery: true } };
    // The owner's own logo (an ordinary content image) is not film footage and needs no clearance.
    const document = { ...draft.document, sections: [hero, ...draft.document.sections.filter(b => b.id !== 'film')] };
    expect((await owner.put(endpoint, { version: draft.version, document })).status).toBe(200);
    let version = (await state()).version;
    const blocked = await owner.post<{ error: { code: string; details: { urls: string[] } } }>(`${endpoint}/publish`, { version });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('MEDIA_NOT_CLEARED');
    expect(blocked.body.error.details.urls).toEqual([mp4.body.url, webm.body.url]);
    // Clearance is an attestation of the owner or a publisher only.
    expect((await editor.post(`/admin/content/media/${mp4.body.id}/clearance`, { cleared: true })).status).toBe(403);
    for (const m of [mp4.body, webm.body]) expect((await owner.post(`/admin/content/media/${m.id}/clearance`, { cleared: true })).status).toBe(201);
    expect((await owner.post(`${endpoint}/publish`, { version })).status).toBe(201);
    const live = (await new Client(t).get<BuilderDocument>(`/site/builder/${slug}`)).body;
    expect(live.sections[0]!.film!.clips[0]!.desktop).toBe(mp4.body.url);
    // A live file cannot lose its clearance or be archived.
    expect((await owner.post(`/admin/content/media/${mp4.body.id}/clearance`, { cleared: false })).status).toBe(409);
    expect((await owner.del(`/admin/content/media/${mp4.body.id}`)).status).toBe(409);
    // Files outside the library (e.g. local review encodes) never go public.
    version = (await state()).version;
    const outside = { ...document, sections: [{ ...hero, film: { ...hero.film, clips: [{ ...hero.film.clips[0]!, mobile: '/review-media/source-hero/v2/hero-mobile.mp4' }] } }, ...document.sections.slice(1)] };
    expect((await owner.put(endpoint, { version, document: outside })).status).toBe(200);
    version = (await state()).version;
    expect((await owner.post(`${endpoint}/publish`, { version })).status).toBe(409);
    expect((await new Client(t).get<BuilderDocument>(`/site/builder/${slug}`)).body.sections[0]!.film!.clips[0]!.mobile).toBe('');
  });
});
