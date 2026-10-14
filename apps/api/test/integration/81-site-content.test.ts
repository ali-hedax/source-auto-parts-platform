import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Staff, type TestApp, bootApp, inviteStaff, loginOwner, pngBytes } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Editable site content: the migration's initial values (today's texts), who may edit (owner and
 * manager yes, other roles and visitors no; the manager never manages staff), validation, versions,
 * the audit trail, FAQ and text pages, and picture uploads.
 */
let t: TestApp;
let owner: Client;
let manager: Staff;
let support: Staff;
const run = Date.now().toString(36);

type Section = { value: any; version: number };
const sections = async (c: Client) => (await c.get<Record<string, Section>>('/admin/content')).body;
const save = (c: Client, key: string, version: number, value: unknown) => c.put<{ version: number }>(`/admin/content/sections/${key}`, { version, value });

beforeAll(async () => {
  t = await bootApp();
  owner = await loginOwner(t);
  manager = await inviteStaff(t, owner, 'manager');
  support = await inviteStaff(t, owner, 'support');
});

afterAll(async () => {
  await t?.close();
});

describe('site content', () => {
  it('starts with the texts the site showed before (moved from code to the database)', async () => {
    const site = await new Client(t).get<any>('/site/content');
    expect(site.status).toBe(200);
    expect(site.body.brand.siteTitle.fa).toBe('سورس | قطعات خودرو و تأمین سفارشی');
    expect(site.body.brand.logoUrl).toBe('/brand/source/logo-dark.png');
    expect(site.body.contact.email).toBe('info@sourcebyhedax.ir');
    expect(site.body.contact.phones.map((p: any) => p.number)).toEqual(['+98 25 3666 6669', '+971 50 144 1797']);
    expect(site.body.home.sections.map((x: any) => x.type)).toEqual(['hero', 'brands', 'featured', 'faq']);
    expect(site.body.home.sections[0].steps).toHaveLength(4);
    expect(site.body.faq.length).toBeGreaterThanOrEqual(3);
    expect(site.body.announcement.enabled).toBe(false);
    // Social rows without an address are not sent to visitors.
    expect(site.body.social.links).toEqual([]);
    const about = await new Client(t).get<any>('/site/pages/about');
    expect(about.status).toBe(200);
    expect(about.body.title.fa).toBe('دربارهٔ سورس');
  });

  it('owner and manager edit content; other roles and visitors cannot; the manager cannot manage staff', async () => {
    expect((await new Client(t).get('/admin/content')).status).toBe(401);
    expect((await support.get('/admin/content')).status).toBe(403);
    const current = await sections(owner);
    expect((await save(support, 'announcement', current.announcement!.version, current.announcement!.value)).status).toBe(403);

    const announcement = { enabled: true, text: { fa: `ارسال رایگان ${run}`, en: '' }, linkLabel: { fa: 'جزئیات', en: 'Details' }, href: '/help/shipping', tone: 'info' };
    const byManager = await save(manager, 'announcement', current.announcement!.version, announcement);
    expect(byManager.status, JSON.stringify(byManager.body)).toBe(200);
    // Visible on the public bundle right away (the web cache is purged after the save).
    expect((await new Client(t).get<any>('/site/content')).body.announcement).toMatchObject({ enabled: true, text: { fa: `ارسال رایگان ${run}` } });

    // The owner edits too; a save based on an old version is refused instead of overwriting.
    const stale = await save(owner, 'announcement', current.announcement!.version, { ...announcement, enabled: false });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect((await save(owner, 'announcement', byManager.body.version, { ...announcement, enabled: false })).status).toBe(200);

    // Staff and roles stay with the owner.
    expect((await manager.get('/admin/staff')).status).toBe(403);
    expect((await manager.get('/admin/roles')).status).toBe(403);
    expect((await manager.post('/admin/staff/invitations', { email: `x.${run}@hedax.test`, fullName: 'تست', roleIds: [] })).status).toBe(403);
    expect((await owner.get('/admin/staff')).status).toBe(200);

    // History: who changed what and when.
    const audit = await owner.get<Array<{ action: string; entityId: string; actor: string; after: any }>>('/admin/audit?entityType=content&entityId=announcement');
    expect(audit.status).toBe(200);
    expect(audit.body.filter((a) => a.action === 'content.updated').length).toBeGreaterThanOrEqual(2);
    expect(audit.body.some((a) => a.after?.text?.fa === `ارسال رایگان ${run}`)).toBe(true);
  });

  it('validates e-mail, phone numbers, links and pictures before saving anything', async () => {
    const current = await sections(owner);
    const contact = current.contact!;
    const bad = async (value: unknown, path: string) => {
      const res = await save(owner, 'contact', contact.version, value);
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.error.fields.map((f: any) => f.path)).toContain(path);
    };
    await bad({ ...contact.value, email: 'not-an-email' }, 'email');
    await bad({ ...contact.value, phones: [{ ...contact.value.phones[0], number: 'call me' }] }, 'phones.0.number');
    await bad({ ...contact.value, mapUrl: 'javascript:alert(1)' }, 'mapUrl');
    const announcement = current.announcement!;
    const res = await save(owner, 'announcement', announcement.version, { ...announcement.value, href: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
    const brand = current.brand!;
    const img = await save(owner, 'brand', brand.version, { ...brand.value, logoUrl: 'https://evil.example/x.svg' });
    expect(img.status).toBe(400);
    // Nothing was written.
    expect((await sections(owner)).contact!.version).toBe(contact.version);

    const ok = await save(owner, 'contact', contact.version, {
      ...contact.value,
      phones: [...contact.value.phones, { label: { fa: 'تلفن دفتر', en: 'Office' }, number: '+98 21 1234 5678', numberFa: '', extension: '', whatsapp: false }],
      address: { fa: 'قم، خیابان نمونه', en: 'Qom' },
      mapLat: 34.64,
      mapLng: 50.88,
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const pub = (await new Client(t).get<any>('/site/content')).body.contact;
    expect(pub.phones).toHaveLength(3);
    expect(pub.address.fa).toBe('قم، خیابان نمونه');
  });

  it('home page sections can be reordered and hidden; hidden ones are not sent to visitors', async () => {
    const home = (await sections(manager)).home!;
    const reordered = [...home.value.sections].reverse().map((sec: any) => (sec.type === 'brands' ? { ...sec, visible: false } : sec));
    reordered.push({ id: 'note', type: 'text', visible: true, title: { fa: 'چرا سورس؟', en: '' }, body: { fa: 'متن آزمایشی', en: '' }, imageUrl: '', button: { label: { fa: '', en: '' }, href: '' } });
    const res = await save(manager, 'home', home.version, { sections: reordered });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const pub = (await new Client(t).get<any>('/site/content')).body.home.sections.map((x: any) => x.type);
    expect(pub).toEqual(['faq', 'featured', 'hero', 'text']);
    // Built-in blocks exist once.
    const dup = await save(manager, 'home', res.body.version, { sections: [...reordered, { ...reordered[0], id: 'faq-2' }] });
    expect(dup.status).toBe(400);
  });

  it('FAQ: add, edit, hide, reorder and delete', async () => {
    const created = await manager.post<any>('/admin/content/faq', { question: { fa: `سؤال ${run}`, en: '' }, answer: { fa: 'پاسخ', en: '' }, visible: true });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id;
    expect((await new Client(t).get<any>('/site/content')).body.faq.some((f: any) => f.id === id)).toBe(true);
    expect((await manager.put(`/admin/content/faq/${id}`, { question: { fa: `سؤال ${run}`, en: 'Q' }, answer: { fa: 'پاسخ تازه', en: '' }, visible: false })).status).toBe(200);
    expect((await new Client(t).get<any>('/site/content')).body.faq.some((f: any) => f.id === id)).toBe(false);

    const all = (await manager.get<Array<{ id: string }>>('/admin/content/faq')).body.map((f) => f.id);
    const reversed = [...all].reverse();
    expect((await manager.post('/admin/content/faq/order', { ids: reversed })).status).toBe(200);
    expect((await manager.get<Array<{ id: string }>>('/admin/content/faq')).body.map((f) => f.id)).toEqual(reversed);
    expect((await manager.post('/admin/content/faq/order', { ids: reversed.slice(1) })).body.error.code).toBe('ORDER_MISMATCH');

    expect((await manager.del(`/admin/content/faq/${id}`)).status).toBe(200);
    expect((await manager.get<Array<{ id: string }>>('/admin/content/faq')).body.some((f) => f.id === id)).toBe(false);
    expect((await support.post('/admin/content/faq', { question: { fa: 'x', en: '' }, answer: { fa: 'y', en: '' }, visible: true })).status).toBe(403);
  });

  it('text pages: drafts are private, published pages are public, built-in pages are protected', async () => {
    const slug = `warranty-${run}`;
    const page = { slug, title: { fa: 'گارانتی', en: 'Warranty' }, body: { fa: '## شرایط\n- مورد اول\n**مهم**', en: '' }, published: false, showInFooter: true, seoTitle: { fa: '', en: '' }, seoDescription: { fa: 'گارانتی قطعات', en: '' } };
    const created = await owner.post<any>('/admin/content/pages', page);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect((await new Client(t).get(`/site/pages/${slug}`)).status).toBe(404);
    expect((await owner.put(`/admin/content/pages/${created.body.id}`, { ...page, published: true })).status).toBe(200);
    const pub = await new Client(t).get<any>(`/site/pages/${slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body.body.fa).toContain('## شرایط');
    expect((await new Client(t).get<any>('/site/content')).body.footerPages.some((p: any) => p.slug === slug)).toBe(true);
    expect((await owner.post('/admin/content/pages', page)).body.error.code).toBe('SLUG_IN_USE');
    expect((await owner.post('/admin/content/pages', { ...page, slug: 'Bad Slug!' })).status).toBe(400);

    const pages = (await owner.get<Array<{ id: string; slug: string; isSystem: boolean }>>('/admin/content/pages')).body;
    const about = pages.find((p) => p.slug === 'about')!;
    expect(about.isSystem).toBe(true);
    expect((await owner.del(`/admin/content/pages/${about.id}`)).body.error.code).toBe('PAGE_PROTECTED');
    const full = (await owner.get<any>(`/admin/content/pages/${about.id}`)).body;
    expect((await owner.put(`/admin/content/pages/${about.id}`, { ...full, slug: 'about-us' })).body.error.code).toBe('PAGE_PROTECTED');

    expect((await owner.del(`/admin/content/pages/${created.body.id}`)).status).toBe(200);
    expect((await new Client(t).get(`/site/pages/${slug}`)).status).toBe(404);
  });

  it('pictures: only real images, re-encoded and size-limited; logo as WebP, browser icon as PNG', async () => {
    const png = await pngBytes();
    const logo = await manager.upload<any>('/admin/content/images?purpose=logo', {}, [{ name: 'logo.png', data: png, field: 'file', type: 'image/png' }]);
    expect(logo.status, JSON.stringify(logo.body)).toBe(201);
    expect(logo.body.url).toMatch(/\/content\/logo\/[0-9a-f-]+\.webp$/);
    const icon = await manager.upload<any>('/admin/content/images?purpose=favicon', {}, [{ name: 'icon.png', data: png, field: 'file', type: 'image/png' }]);
    expect(icon.body.url).toMatch(/\.png$/);
    expect(icon.body).toMatchObject({ width: 256, height: 256 });

    const fake = await manager.upload<any>('/admin/content/images', {}, [{ name: 'photo.jpg', data: new TextEncoder().encode('<script>alert(1)</script>'), field: 'file', type: 'image/jpeg' }]);
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('INVALID_IMAGE');
    const huge = await manager.upload<any>('/admin/content/images', {}, [{ name: 'big.png', data: new Uint8Array(5 * 1024 * 1024 + 10), field: 'file', type: 'image/png' }]);
    expect(huge.status).toBe(413);
    expect((await support.upload('/admin/content/images', {}, [{ name: 'logo.png', data: png, field: 'file', type: 'image/png' }])).status).toBe(403);

    // The uploaded address is accepted by the content fields.
    const brand = (await sections(manager)).brand!;
    expect((await save(manager, 'brand', brand.version, { ...brand.value, logoUrl: logo.body.url, faviconUrl: icon.body.url })).status).toBe(200);
  });
});
