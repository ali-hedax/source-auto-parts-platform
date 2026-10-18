import { z } from 'zod';
import { contentImageSchema, contentLinkSchema, homeSectionSchema, localizedSchema } from './content.js';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const size = (max: number) => z.number().int().min(0).max(max);
export const builderLayoutSchema = z.object({
  width: size(100).min(10).optional(), height: size(1400).optional(),
  columns: z.number().int().min(1).max(6).optional(), gap: size(100).optional(),
  padding: size(160).optional(), margin: size(160).optional(), hidden: z.boolean().optional(),
}).strict();
export const builderStyleSchema = z.object({
  desktop: builderLayoutSchema.optional(), tablet: builderLayoutSchema.optional(), mobile: builderLayoutSchema.optional(),
  background: color.optional(), foreground: color.optional(), borderColor: color.optional(),
  borderWidth: size(12).optional(), radius: size(80).optional(),
  shadow: z.enum(['none', 'soft', 'raised']).optional(), align: z.enum(['start', 'center', 'end']).optional(),
  imageFit: z.enum(['cover', 'contain']).optional(), focalX: size(100).optional(), focalY: size(100).optional(),
  template: z.enum(['classic', 'compact', 'horizontal', 'outlined']).optional(),
  imageHeight: size(700).optional(), titleSize: size(60).min(12).optional(), priceSize: size(48).min(12).optional(),
}).strict();
export type BuilderStyle = z.infer<typeof builderStyleSchema>;
export const BUILDER_KINDS = ['legacy', 'hero', 'slider', 'categories', 'search', 'vehicle-brands', 'vehicle-models', 'brands', 'new-products', 'bestsellers', 'discounts', 'offers', 'selected-products', 'vehicle-products', 'image-categories', 'services', 'benefits', 'notice', 'banners', 'text-image', 'custom', 'technical-catalog'] as const;
export const builderItemSchema = z.object({
  title: localizedSchema(160), text: localizedSchema(1000), imageUrl: contentImageSchema, mobileImageUrl: contentImageSchema,
  alt: localizedSchema(160), href: contentLinkSchema, button: localizedSchema(60), visible: z.boolean(),
}).strict();
export const builderBlockSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/), kind: z.enum(BUILDER_KINDS), visible: z.boolean(),
  title: localizedSchema(160), body: localizedSchema(8000), imageUrl: contentImageSchema, mobileImageUrl: contentImageSchema,
  alt: localizedSchema(160), href: contentLinkSchema, button: localizedSchema(60),
  style: builderStyleSchema, items: z.array(builderItemSchema).max(20),
  startsAt: z.iso.datetime().nullable(), endsAt: z.iso.datetime().nullable(),
  interval: z.number().int().min(3000).max(30000),
  query: z.object({ category: z.string().max(64), brand: z.string().max(64), vehicle: z.string().max(80), model: z.string().max(80),
    productSlugs: z.array(z.string().regex(/^[a-z0-9-]{1,120}$/)).max(24), limit: z.number().int().min(1).max(24) }).strict(),
  legacy: homeSectionSchema.optional(),
}).strict().superRefine((b, ctx) => {
  if (b.kind === 'legacy' && !b.legacy) ctx.addIssue({ code: 'custom', path: ['legacy'], message: 'REQUIRED' });
  if (b.startsAt && b.endsAt && b.startsAt >= b.endsAt) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'INVALID_DATE_RANGE' });
});
export type BuilderBlock = z.infer<typeof builderBlockSchema>;
export const builderThemeSchema = z.object({
  primary: color, background: color, foreground: color, card: color, border: color,
  button: color, link: color, contentWidth: z.number().int().min(640).max(1920), radius: size(48), spacing: size(120),
  font: z.enum(['brand', 'system']), fontSize: z.number().int().min(14).max(22), headingWeight: z.enum(['600', '700', '800']),
}).strict();
export const builderChromeSchema = z.object({
  headerBackground: color, footerBackground: color, logoWidth: z.number().int().min(70).max(280),
  logoPosition: z.enum(['start', 'end']), searchRounded: z.boolean(), footerColumns: z.number().int().min(1).max(4),
  menu: z.array(z.object({ label: localizedSchema(60), href: contentLinkSchema, visible: z.boolean() }).strict()).max(12),
}).strict();
export const builderDocumentSchema = z.object({
  schemaVersion: z.literal(1), title: localizedSchema(120), description: localizedSchema(170),
  sections: z.array(builderBlockSchema).max(40), theme: builderThemeSchema, chrome: builderChromeSchema,
}).strict().superRefine((doc, ctx) => {
  if (new Set(doc.sections.map(b => b.id)).size !== doc.sections.length) ctx.addIssue({ code: 'custom', path: ['sections'], message: 'DUPLICATE_SECTION' });
});
export type BuilderDocument = z.infer<typeof builderDocumentSchema>;
export const builderSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(60);
export const builderSaveSchema = z.object({ version: z.number().int().min(0), document: builderDocumentSchema }).strict();
export const builderVersionSchema = z.object({ version: z.number().int().min(0) }).strict();
export const builderRestoreSchema = builderVersionSchema.extend({ revisionId: z.uuid() });
export const builderMediaUpdateSchema = z.object({ name: z.string().trim().min(1).max(160), alt: localizedSchema(160), category: z.string().trim().max(60) }).strict();
export interface BuilderState { slug: string; version: number; document: BuilderDocument; publishedAt: string | null; publishedBy: string | null }
export interface BuilderRevision { id: string; createdAt: string; actorName: string; action: string }
export interface BuilderMedia { id: string; url: string; name: string; alt: { fa: string; en: string }; category: string; width: number; height: number; bytes: number }

export const DEFAULT_BUILDER_THEME: BuilderDocument['theme'] = { primary: '#096ce5', background: '#f7faff', foreground: '#15243a', card: '#ffffff', border: '#e1eaf5', button: '#096ce5', link: '#096ce5', contentWidth: 1280, radius: 16, spacing: 48, font: 'brand', fontSize: 16, headingWeight: '700' };
export const DEFAULT_BUILDER_CHROME: BuilderDocument['chrome'] = { headerBackground: '#09182e', footerBackground: '#101b2b', logoWidth: 130, logoPosition: 'start', searchRounded: true, footerColumns: 3, menu: [] };
export function newBuilderBlock(kind: BuilderBlock['kind'], id: string): BuilderBlock {
  const text = () => ({ fa: '', en: '' });
  return { id, kind, visible: true, title: text(), body: text(), imageUrl: '', mobileImageUrl: '', alt: text(), href: '', button: text(), style: {}, items: [], startsAt: null, endsAt: null, interval: 6000, query: { category: '', brand: '', vehicle: '', model: '', productSlugs: [], limit: 8 } };
}
