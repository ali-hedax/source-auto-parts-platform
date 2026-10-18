import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {
  CONTENT_SECTIONS,
  CONTENT_SECTION_KEYS,
  type ContentImagePurpose,
  type ContentPageInput,
  type ContentPageView,
  type ContentSectionKey,
  type ContentSections,
  type FaqItemView,
  type PublicContentPage,
  type SiteContentView,
} from '@hedax/contracts';
import { IMAGE_KINDS, inspectFile } from '@hedax/domain';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { Prisma, PrismaService, type Tx } from '../../common/prisma.service.js';
import { SCANNER, type MalwareScanner } from '../../common/storage/scanner.js';
import { STORAGE, type StorageDriver } from '../../common/storage/storage.js';

const settingKey = (section: ContentSectionKey) => `content.${section}`;
const empty = { fa: '', en: '' };

/**
 * Used only when a section row is missing (it is created by the content migration): the site then
 * shows nothing for that part rather than invented text.
 */
const EMPTY_SECTIONS: ContentSections = {
  brand: { siteName: { fa: 'Source', en: 'Source' }, siteTitle: { fa: 'Source', en: 'Source' }, tagline: empty, footerAbout: empty, copyright: empty, logoUrl: '', logoAlt: empty, faviconUrl: '' },
  contact: { displayName: '', phones: [], email: '', address: empty, mapUrl: '', mapLat: null, mapLng: null, hours: empty, supportChat: false },
  social: { links: [] },
  home: { sections: [] },
  announcement: { enabled: false, text: empty, linkLabel: empty, href: '', tone: 'brand' },
  seo: {
    defaultDescription: empty,
    defaultImageUrl: '',
    pages: Object.fromEntries(['home', 'parts', 'brands', 'imported', 'requestPart', 'contact'].map((p) => [p, { title: empty, description: empty, imageUrl: '' }])) as ContentSections['seo']['pages'],
  },
};

/** How each kind of picture is stored: always re-encoded (metadata stripped), never the uploaded bytes. */
const IMAGE_RULES: Record<ContentImagePurpose, { width: number; height: number; format: 'webp' | 'png'; fit: 'inside' | 'contain' }> = {
  image: { width: 2000, height: 2000, format: 'webp', fit: 'inside' },
  logo: { width: 1200, height: 600, format: 'webp', fit: 'inside' },
  // Square, transparent padding: browsers show it at 16–64 px.
  favicon: { width: 256, height: 256, format: 'png', fit: 'contain' },
};

type FaqRow = { id: string; questionFa: string; questionEn: string; answerFa: string; answerEn: string; visible: boolean; sortOrder: number; updatedAt: Date };
type PageRow = {
  id: string; slug: string; isSystem: boolean; titleFa: string; titleEn: string; bodyFa: string; bodyEn: string; published: boolean; showInFooter: boolean;
  seoTitleFa: string; seoTitleEn: string; seoDescriptionFa: string; seoDescriptionEn: string; sortOrder: number; updatedAt: Date;
};

const faqView = (r: FaqRow): FaqItemView => ({
  id: r.id, question: { fa: r.questionFa, en: r.questionEn }, answer: { fa: r.answerFa, en: r.answerEn }, visible: r.visible, sortOrder: r.sortOrder, updatedAt: r.updatedAt.toISOString(),
});

const pageView = (r: PageRow): ContentPageView => ({
  id: r.id, slug: r.slug, isSystem: r.isSystem, title: { fa: r.titleFa, en: r.titleEn }, body: { fa: r.bodyFa, en: r.bodyEn }, published: r.published, showInFooter: r.showInFooter,
  seoTitle: { fa: r.seoTitleFa, en: r.seoTitleEn }, seoDescription: { fa: r.seoDescriptionFa, en: r.seoDescriptionEn }, sortOrder: r.sortOrder, updatedAt: r.updatedAt.toISOString(),
});

const pageData = (p: ContentPageInput) => ({
  titleFa: p.title.fa, titleEn: p.title.en, bodyFa: p.body.fa, bodyEn: p.body.en, published: p.published, showInFooter: p.showInFooter,
  seoTitleFa: p.seoTitle.fa, seoTitleEn: p.seoTitle.en, seoDescriptionFa: p.seoDescription.fa, seoDescriptionEn: p.seoDescription.en,
});

/**
 * Editable site content. Every save is validated by the shared contract, versioned against
 * concurrent edits, and written to the audit log (who, what, when, before/after). Public pages
 * read one cached bundle; the web cache is purged after each save (PublicCacheInterceptor).
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE) private readonly storage: StorageDriver,
    @Inject(SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  // ---- Sections ----

  async sections(): Promise<{ [K in ContentSectionKey]: { value: ContentSections[K]; version: number; updatedAt: string | null } }> {
    const rows = await this.prisma.siteSetting.findMany({ where: { key: { in: CONTENT_SECTION_KEYS.map(settingKey) } } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const out = {} as { [K in ContentSectionKey]: { value: ContentSections[K]; version: number; updatedAt: string | null } };
    for (const key of CONTENT_SECTION_KEYS) {
      const row = byKey.get(settingKey(key));
      const parsed = row ? CONTENT_SECTIONS[key].safeParse(row.value) : null;
      (out as Record<string, unknown>)[key] = {
        value: parsed?.success ? parsed.data : EMPTY_SECTIONS[key],
        version: row?.version ?? 0,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    }
    return out;
  }

  async updateSection(section: ContentSectionKey, version: number, input: unknown, actorId: string) {
    // Throws a ZodError (400 with the failing fields) before anything is written.
    const value = CONTENT_SECTIONS[section].parse(input);
    return this.prisma.tx(async (tx) => {
      const key = settingKey(section);
      const current = await tx.siteSetting.findUnique({ where: { key } });
      if ((current?.version ?? 0) !== version) throw conflict('VERSION_CONFLICT', 'This section was changed by someone else; reload it');
      const saved = await tx.siteSetting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, version: 1, updatedById: actorId },
        update: { value: value as Prisma.InputJsonValue, version: { increment: 1 }, updatedById: actorId },
      });
      await this.audit.record(tx, { action: 'content.updated', entityType: 'content', entityId: section, before: current?.value ?? null, after: value });
      return { section, version: saved.version, updatedAt: saved.updatedAt.toISOString() };
    });
  }

  /** Everything the public layout and home page need, in one request. */
  async publicBundle(): Promise<SiteContentView> {
    const [sections, faq, pages] = await Promise.all([
      this.sections(),
      this.prisma.faqItem.findMany({ where: { visible: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.contentPage.findMany({ where: { published: true, showInFooter: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { slug: true, titleFa: true, titleEn: true } }),
    ]);
    return {
      brand: sections.brand.value,
      contact: sections.contact.value,
      social: { links: sections.social.value.links.filter((l) => l.visible && l.url) },
      // Hidden sections are sent too (other pages reuse their texts); the home page skips them.
      home: sections.home.value,
      announcement: sections.announcement.value,
      seo: sections.seo.value,
      faq: faq.map((f) => ({ id: f.id, question: { fa: f.questionFa, en: f.questionEn }, answer: { fa: f.answerFa, en: f.answerEn } })),
      footerPages: pages.map((p) => ({ slug: p.slug, title: { fa: p.titleFa, en: p.titleEn } })),
    };
  }

  // ---- FAQ ----

  async faqList(): Promise<FaqItemView[]> {
    const rows = await this.prisma.faqItem.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    return rows.map(faqView);
  }

  async faqCreate(input: { question: { fa: string; en: string }; answer: { fa: string; en: string }; visible: boolean }, actorId: string) {
    return this.prisma.tx(async (tx) => {
      const last = await tx.faqItem.aggregate({ _max: { sortOrder: true } });
      const row = await tx.faqItem.create({
        data: { questionFa: input.question.fa, questionEn: input.question.en, answerFa: input.answer.fa, answerEn: input.answer.en, visible: input.visible, sortOrder: (last._max.sortOrder ?? 0) + 1, updatedById: actorId },
      });
      await this.audit.record(tx, { action: 'content.faq.created', entityType: 'faq_item', entityId: row.id, after: input });
      return faqView(row);
    });
  }

  async faqUpdate(id: string, input: { question: { fa: string; en: string }; answer: { fa: string; en: string }; visible: boolean }, actorId: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.faqItem.findUnique({ where: { id } });
      if (!before) throw notFound();
      const row = await tx.faqItem.update({
        where: { id },
        data: { questionFa: input.question.fa, questionEn: input.question.en, answerFa: input.answer.fa, answerEn: input.answer.en, visible: input.visible, updatedById: actorId },
      });
      await this.audit.record(tx, { action: 'content.faq.updated', entityType: 'faq_item', entityId: id, before: faqView(before), after: input });
      return faqView(row);
    });
  }

  async faqDelete(id: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.faqItem.findUnique({ where: { id } });
      if (!before) throw notFound();
      await tx.faqItem.delete({ where: { id } });
      await this.audit.record(tx, { action: 'content.faq.deleted', entityType: 'faq_item', entityId: id, before: faqView(before) });
      return { id, deleted: true };
    });
  }

  /** New order of all questions (the full list, so nothing is silently left out). */
  async faqReorder(ids: string[]) {
    return this.prisma.tx(async (tx) => {
      const existing = await tx.faqItem.findMany({ select: { id: true } });
      const known = new Set(existing.map((r) => r.id));
      if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) throw badRequest('ORDER_MISMATCH', 'Send every question exactly once');
      for (const [i, id] of ids.entries()) await tx.faqItem.update({ where: { id }, data: { sortOrder: i + 1 } });
      await this.audit.record(tx, { action: 'content.faq.reordered', entityType: 'faq_item', after: { ids } });
      return { ids };
    });
  }

  // ---- Text pages ----

  async pageList(): Promise<ContentPageView[]> {
    const rows = await this.prisma.contentPage.findMany({ orderBy: [{ isSystem: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] });
    return rows.map(pageView);
  }

  async pageGet(id: string): Promise<ContentPageView> {
    const row = await this.prisma.contentPage.findUnique({ where: { id } });
    if (!row) throw notFound();
    return pageView(row);
  }

  async pageCreate(input: ContentPageInput, actorId: string) {
    return this.prisma.tx(async (tx) => {
      if (await tx.contentPage.findUnique({ where: { slug: input.slug }, select: { id: true } })) throw conflict('SLUG_IN_USE', 'Another page already uses this address');
      const last = await tx.contentPage.aggregate({ _max: { sortOrder: true } });
      const row = await tx.contentPage.create({ data: { slug: input.slug, ...pageData(input), sortOrder: (last._max.sortOrder ?? 0) + 1, updatedById: actorId } });
      await this.audit.record(tx, { action: 'content.page.created', entityType: 'content_page', entityId: row.id, after: input });
      return pageView(row);
    });
  }

  async pageUpdate(id: string, input: ContentPageInput, actorId: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.contentPage.findUnique({ where: { id } });
      if (!before) throw notFound();
      // Built-in pages are linked from the site's own menus: their address stays.
      if (before.isSystem && input.slug !== before.slug) throw forbidden('PAGE_PROTECTED', 'The address of a built-in page cannot change');
      if (input.slug !== before.slug && (await tx.contentPage.findUnique({ where: { slug: input.slug }, select: { id: true } }))) throw conflict('SLUG_IN_USE', 'Another page already uses this address');
      const row = await tx.contentPage.update({ where: { id }, data: { slug: input.slug, ...pageData(input), updatedById: actorId } });
      await this.audit.record(tx, { action: 'content.page.updated', entityType: 'content_page', entityId: id, before: pageView(before), after: input });
      return pageView(row);
    });
  }

  async pageDelete(id: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.contentPage.findUnique({ where: { id } });
      if (!before) throw notFound();
      if (before.isSystem) throw forbidden('PAGE_PROTECTED', 'Built-in pages cannot be deleted; unpublish it instead');
      await tx.contentPage.delete({ where: { id } });
      await this.audit.record(tx, { action: 'content.page.deleted', entityType: 'content_page', entityId: id, before: pageView(before) });
      return { id, deleted: true };
    });
  }

  async publicPage(slug: string): Promise<PublicContentPage> {
    const row = await this.prisma.contentPage.findUnique({ where: { slug } });
    if (!row || !row.published) throw notFound('PAGE_NOT_FOUND', 'This page does not exist or is not published');
    const v = pageView(row);
    return { slug: v.slug, title: v.title, body: v.body, seoTitle: v.seoTitle, seoDescription: v.seoDescription, updatedAt: v.updatedAt };
  }

  // ---- Images ----

  /**
   * A picture for the site (logo, browser icon, home page or share image). Only real JPG/PNG/WebP
   * files pass; they are scanned, then re-encoded (size limited, metadata removed) before being
   * stored publicly. The returned address is what the content fields save.
   */
  async uploadImage(purpose: ContentImagePurpose, file: { originalname: string; buffer: Buffer }) {
    const inspection = inspectFile(file.originalname, new Uint8Array(file.buffer));
    if (inspection.verdict !== 'ACCEPT' || !inspection.kind || !IMAGE_KINDS.includes(inspection.kind)) {
      throw badRequest('INVALID_IMAGE', 'Only JPG, PNG or WebP images are accepted', { reason: inspection.reason ?? 'NOT_AN_IMAGE' });
    }
    const scan = await this.scanner.scan(file.buffer);
    if (!scan.clean) throw badRequest('FILE_REJECTED', 'The file did not pass the security scan');
    const rule = IMAGE_RULES[purpose];
    let output: Buffer;
    let width: number;
    let height: number;
    try {
      const pipeline = sharp(file.buffer, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: rule.width, height: rule.height, fit: rule.fit, withoutEnlargement: rule.fit === 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } });
      const result = await (rule.format === 'png' ? pipeline.png({ compressionLevel: 9 }) : pipeline.webp({ quality: purpose === 'logo' ? 90 : 82 })).toBuffer({ resolveWithObject: true });
      output = result.data;
      ({ width, height } = result.info);
    } catch {
      throw badRequest('INVALID_IMAGE', 'The image could not be processed');
    }
    const key = `content/${purpose}/${randomUUID()}.${rule.format}`;
    const url = await this.storage.putPublic(key, output, rule.format === 'png' ? 'image/png' : 'image/webp');
    await this.prisma.visualMedia.create({ data: { url, name: file.originalname.slice(0, 160), alt: { fa: '', en: '' }, width, height, bytes: output.length } });
    await this.prisma.tx((tx: Tx) => this.audit.record(tx, { action: 'content.image.uploaded', entityType: 'content_image', entityId: key, after: { purpose, url, width, height, bytes: output.length } }));
    return { url, width, height, bytes: output.length };
  }
}
