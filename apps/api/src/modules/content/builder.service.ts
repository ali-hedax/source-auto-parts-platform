import { Injectable } from '@nestjs/common';
import { builderDocumentSchema, DEFAULT_BUILDER_CHROME, DEFAULT_BUILDER_THEME, newBuilderBlock, type BuilderDocument, type BuilderState, type BuilderMedia, type builderMediaUpdateSchema } from '@hedax/contracts';
import type { z } from 'zod';
import { Prisma, PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { conflict, forbidden, notFound } from '../../common/errors.js';
import type { Actor } from '../../common/request-context.js';
import { ContentService } from './content.service.js';

/** Every file a cinematic hero can show publicly: movies, posters, its stills and a custom logo. */
export function heroMediaUrls(document: BuilderDocument): string[] {
  const urls = new Set<string>();
  for (const block of document.sections) {
    if (block.kind !== 'cinematic-hero' || !block.film) continue;
    for (const clip of block.film.clips) for (const url of [clip.desktop, clip.desktopWebm, clip.mobile, clip.poster, clip.mobilePoster]) if (url) urls.add(url);
    // Stills are frames of the film; the logo is the owner's own brand image (uploaded as a content image), not footage.
    for (const url of [block.imageUrl, block.mobileImageUrl]) if (url) urls.add(url);
  }
  return [...urls];
}

/** Minimum gap between two automatic «previous draft» snapshots of one page. */
const DRAFT_SNAPSHOT_INTERVAL_MS = 5 * 60_000;

@Injectable()
export class BuilderService {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly audit: AuditService) {}

  private async initial(slug: string): Promise<BuilderDocument> {
    const doc: BuilderDocument = { schemaVersion: 1, title: { fa: slug === 'home' ? 'صفحه اصلی' : slug, en: slug }, description: { fa: '', en: '' }, sections: [], theme: DEFAULT_BUILDER_THEME, chrome: DEFAULT_BUILDER_CHROME };
    if (slug === 'home') {
      const sections = await this.content.sections();
      doc.title = sections.seo.value.pages.home.title.fa ? sections.seo.value.pages.home.title : sections.brand.value.siteTitle;
      doc.description = sections.seo.value.pages.home.description;
      doc.sections = sections.home.value.sections.map(s => ({ ...newBuilderBlock('legacy', s.id), visible: s.visible, title: s.title, legacy: s, style: { desktop: { padding: 0, ...(s.type === 'brands' ? { columns: 5 } : s.type === 'featured' ? { columns: 4 } : {}) }, tablet: { padding: 0, ...(s.type === 'brands' || s.type === 'featured' ? { columns: 3 } : {}) }, mobile: { padding: 0, ...(s.type === 'brands' ? { columns: 2 } : {}) } } }));
      // Same place as the storefront: part makers after the vehicle brands (or after the hero, without them).
      const brands = doc.sections.findIndex(b => b.legacy?.type === 'brands');
      doc.sections.splice(brands >= 0 ? brands + 1 : doc.sections.findIndex(b => b.legacy?.type === 'hero') + 1, 0, { ...newBuilderBlock('makers', 'makers'), title: { fa: 'مرور بر اساس برند سازنده', en: 'Browse by part brand' } });
    }
    return builderDocumentSchema.parse(doc);
  }

  async state(slug: string): Promise<BuilderState> {
    const page = await this.prisma.visualPage.findUnique({ where: { slug } });
    return { slug, version: page?.version ?? 0, document: page ? builderDocumentSchema.parse(page.draft) : await this.initial(slug), publishedAt: page?.publishedAt?.toISOString() ?? null, publishedBy: page?.publishedBy ?? null };
  }

  async list() {
    return this.prisma.visualPage.findMany({ select: { slug: true, version: true, publishedAt: true, publishedBy: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 200 });
  }

  async published(slug: string): Promise<BuilderDocument | null> {
    const page = await this.prisma.visualPage.findUnique({ where: { slug }, select: { published: true } });
    return page?.published ? builderDocumentSchema.parse(page.published) : null;
  }

  async save(slug: string, version: number, input: BuilderDocument, actor: Actor) {
    const document = builderDocumentSchema.parse(input);
    const baseline = version === 0 ? await this.initial(slug) : document;
    return this.prisma.tx(async tx => {
      // INSERT ON CONFLICT + row lock also serializes the first save from two browsers.
      await tx.visualPage.createMany({ data: [{ slug, draft: baseline as Prisma.InputJsonValue }], skipDuplicates: true });
      await tx.$queryRaw`SELECT slug FROM visual_page WHERE slug = ${slug} FOR UPDATE`;
      const page = await tx.visualPage.findUniqueOrThrow({ where: { slug } });
      if (page.version !== version) throw conflict('VERSION_CONFLICT', 'Reload the latest draft before saving');
      const saved = await tx.visualPage.update({ where: { slug }, data: { draft: document as Prisma.InputJsonValue, version: { increment: 1 } } });
      // Keep the previous draft as well, so a saved accidental deletion can be recovered. The editor autosaves
      // about a second after each change, so a snapshot is taken at most every few minutes per page; otherwise
      // typing would fill the history (and the table) with near-identical copies and push publications out of view.
      const lastDraft = await tx.visualRevision.findFirst({ where: { pageSlug: slug, action: 'draft' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      if (!lastDraft || Date.now() - lastDraft.createdAt.getTime() >= DRAFT_SNAPSHOT_INTERVAL_MS) {
        await tx.visualRevision.create({ data: { pageSlug: slug, document: page.draft as Prisma.InputJsonValue, action: 'draft', actorId: actor.userId, actorName: actor.displayName ?? 'مدیر' } });
      }
      await this.audit.record(tx, { action: 'content.builder.saved', entityType: 'visual_page', entityId: slug, after: { version: saved.version } });
      return { version: saved.version };
    });
  }

  async publish(slug: string, version: number, actor: Actor, revisionId?: string) {
    // Existing managers can edit; only the owner or an explicitly authorised publisher publishes.
    if (!actor.isOwner && !actor.permissions.has('content.publish')) throw forbidden();
    return this.prisma.tx(async tx => {
      await tx.$queryRaw`SELECT slug FROM visual_page WHERE slug = ${slug} FOR UPDATE`;
      const page = await tx.visualPage.findUnique({ where: { slug } });
      if (!page) throw notFound();
      if (page.version !== version) throw conflict('VERSION_CONFLICT', 'The draft has changed');
      const revision = revisionId ? await tx.visualRevision.findFirst({ where: { id: revisionId, pageSlug: slug } }) : null;
      if (revisionId && !revision) throw notFound();
      const document = builderDocumentSchema.parse(revision?.document ?? page.draft);
      // Hero films go public only from the library and only when cleared (watermark-free, rights confirmed).
      const heroUrls = heroMediaUrls(document);
      if (heroUrls.length) {
        const cleared = new Set((await tx.visualMedia.findMany({ where: { url: { in: heroUrls }, archived: false, releaseCleared: true }, select: { url: true } })).map(m => m.url));
        const blocked = heroUrls.filter(url => !cleared.has(url));
        if (blocked.length) throw conflict('MEDIA_NOT_CLEARED', 'The hero film uses media that is not cleared for public release', { urls: blocked.slice(0, 20) });
      }
      // A permanent snapshot of the live page before publication is the rollback target.
      if (page.published) await tx.visualRevision.create({ data: { pageSlug: slug, document: page.published as Prisma.InputJsonValue, action: 'previous-publication', actorId: actor.userId, actorName: actor.displayName ?? 'مدیر' } });
      const saved = await tx.visualPage.update({ where: { slug }, data: { published: document as Prisma.InputJsonValue, ...(revisionId ? { draft: document as Prisma.InputJsonValue } : {}), version: { increment: 1 }, publishedAt: new Date(), publishedBy: actor.displayName ?? 'مدیر' } });
      await tx.visualRevision.create({ data: { pageSlug: slug, document: document as Prisma.InputJsonValue, action: revisionId ? 'rollback' : 'publish', actorId: actor.userId, actorName: actor.displayName ?? 'مدیر' } });
      await this.audit.record(tx, { action: revisionId ? 'content.builder.rollback' : 'content.builder.published', entityType: 'visual_page', entityId: slug, after: { version: saved.version, revisionId: revisionId ?? null } });
      return { version: saved.version, publishedAt: saved.publishedAt?.toISOString() };
    });
  }

  async history(slug: string) {
    return this.prisma.visualRevision.findMany({ where: { pageSlug: slug }, select: { id: true, createdAt: true, actorName: true, action: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 });
  }

  async media(q: string) {
    return this.prisma.visualMedia.findMany({ where: { archived: false, OR: [{ name: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } }] }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async registerImage(file: { originalname: string; buffer: Buffer }): Promise<BuilderMedia> {
    const image = await this.content.uploadImage('image', file);
    return await this.prisma.visualMedia.findUniqueOrThrow({ where: { url: image.url } }) as unknown as BuilderMedia;
  }

  async registerVideo(file: { originalname: string; buffer: Buffer }): Promise<BuilderMedia> {
    return await this.content.uploadVideo(file) as unknown as BuilderMedia;
  }

  /** Only the owner or a publisher may attest that a file is watermark-free and cleared for public release. */
  async setClearance(id: string, cleared: boolean, actor: Actor) {
    if (!actor.isOwner && !actor.permissions.has('content.publish')) throw forbidden();
    return this.prisma.tx(async tx => {
      const media = await tx.visualMedia.findUnique({ where: { id } });
      if (!media || media.archived) throw notFound();
      if (!cleared) {
        // Revoking must not silently leave an uncleared file on a live page.
        const live = await tx.visualPage.findMany({ where: { publishedAt: { not: null } }, select: { slug: true, published: true } });
        const using = live.filter(p => p.published && heroMediaUrls(builderDocumentSchema.parse(p.published)).includes(media.url)).map(p => p.slug);
        if (using.length) throw conflict('MEDIA_IN_USE', 'Replace this file on the live page before revoking its clearance', { pages: using });
      }
      const updated = await tx.visualMedia.update({ where: { id }, data: cleared ? { releaseCleared: true, clearedBy: actor.displayName ?? 'مدیر', clearedAt: new Date() } : { releaseCleared: false, clearedBy: null, clearedAt: null } });
      await this.audit.record(tx, { action: cleared ? 'content.media.cleared' : 'content.media.clearance_revoked', entityType: 'visual_media', entityId: id, after: { url: media.url, kind: media.kind } });
      return updated;
    });
  }

  async updateMedia(id: string, input: z.infer<typeof builderMediaUpdateSchema>) {
    return this.prisma.tx(async tx => {
      const media = await tx.visualMedia.update({ where: { id }, data: { ...input, alt: input.alt as Prisma.InputJsonValue } });
      await this.audit.record(tx, { action: 'content.media.updated', entityType: 'visual_media', entityId: id, after: input });
      return media;
    });
  }

  async archiveMedia(id: string) {
    return this.prisma.tx(async tx => {
      const media = await tx.visualMedia.findUnique({ where: { id } });
      if (!media) throw notFound();
      const [pages, revisions, settings, contentPages] = await Promise.all([
        tx.visualPage.findMany({ select: { draft: true, published: true } }),
        tx.visualRevision.findMany({ select: { document: true } }),
        tx.siteSetting.findMany({ where: { key: { startsWith: 'content.' } }, select: { value: true } }),
        tx.contentPage.findMany({ select: { bodyFa: true, bodyEn: true } }),
      ]);
      if ([pages, revisions, settings, contentPages].some(rows => JSON.stringify(rows).includes(media.url))) throw conflict('MEDIA_IN_USE', 'This file is used by a page or a saved revision');
      // Soft archive only; retain bytes, including for an in-flight draft not yet saved.
      await tx.visualMedia.update({ where: { id }, data: { archived: true } });
      await this.audit.record(tx, { action: 'content.media.archived', entityType: 'visual_media', entityId: id });
      return { archived: true };
    });
  }
}
