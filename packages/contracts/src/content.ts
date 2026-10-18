import { z } from 'zod';
import { idSchema } from './common.js';
import { SOCIAL_NETWORKS, type Localized } from './constants.js';

/**
 * Editable site content (admin panel → «محتوای سایت»). Everything a visitor reads that is not
 * interface wording (buttons, errors) lives in the database: texts, images, contact details,
 * social links, home page sections, FAQ, text pages, the notice bar and SEO. Every text exists
 * in both languages; an empty English text falls back to the Persian one on the English site.
 */

export const localizedSchema = (max: number) => z.object({ fa: z.string().trim().max(max), en: z.string().trim().max(max) });
/** The Persian text is required (the site's main language); English stays optional. */
export const localizedRequiredSchema = (max: number) => z.object({ fa: z.string().trim().min(1).max(max), en: z.string().trim().max(max) });

/** A link target: a page of this site (/parts), an http(s) address, mailto: or tel:. Empty = no link. */
export const contentLinkSchema = z
  .string()
  .trim()
  .max(500)
  .refine(v => !v.includes('\\') && Array.from(v).every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127), { message: 'INVALID_LINK' })
  .refine(
    (v) => v === '' || /^\/(?!\/)[^\s]*$/.test(v) || /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(v) || /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(v) || /^tel:\+?[0-9,]+$/.test(v),
    { message: 'INVALID_LINK' },
  );

/** An uploaded image (/media/…), a built-in brand file (/brand/…) or the media host (https). Empty = none. */
export const contentImageSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^\/[A-Za-z0-9/_.-]+\.(png|webp|jpe?g|svg|ico)$/i.test(v) || /^https:\/\/[^\s]+\.(png|webp|jpe?g)$/i.test(v), { message: 'INVALID_IMAGE' });

/** Only https addresses for profiles on other sites. */
const externalUrlSchema = z.string().trim().max(500).refine((v) => v === '' || /^https:\/\/[^\s/$.?#][^\s]*$/i.test(v), { message: 'INVALID_URL' });

/** +, digits, spaces, dashes and brackets, as people write numbers (e.g. "+98 25 3666 6669"). */
export const phoneNumberSchema = z.string().trim().regex(/^\+?[0-9][0-9 ()-]{5,24}$/, { message: 'INVALID_PHONE' });

// ---- General ----

export const brandContentSchema = z.object({
  /** Short name used after every page title ("… | سورس"). */
  siteName: localizedRequiredSchema(60),
  /** Title of the home page and the default title of the site. */
  siteTitle: localizedRequiredSchema(120),
  tagline: localizedSchema(160),
  /** One line under the logo in the footer. */
  footerAbout: localizedSchema(400),
  /** Footer copyright; {year} becomes the current year. */
  copyright: localizedSchema(120),
  /** Logo on the dark header and footer; empty = the built-in Source logo. */
  logoUrl: contentImageSchema,
  /** What a screen reader says for the logo. */
  logoAlt: localizedSchema(120),
  /** Browser tab icon; empty = the built-in icon. */
  faviconUrl: contentImageSchema,
});
export type BrandContent = z.infer<typeof brandContentSchema>;

// ---- Contact ----

export const contactPhoneSchema = z.object({
  label: localizedRequiredSchema(60),
  /** Written as dialled from abroad, e.g. "+98 25 3666 6669"; also used for the call link. */
  number: phoneNumberSchema,
  /** Optional Persian way of writing it, e.g. "۰۲۵-۳۶۶۶۶۶۶۹"; empty = the number in Persian digits. */
  numberFa: z.string().trim().max(30).regex(/^[+۰-۹0-9 ()-]*$/, { message: 'INVALID_PHONE' }),
  extension: z.string().trim().regex(/^[0-9]{0,6}$/, { message: 'INVALID_PHONE' }),
  /** The number also answers on WhatsApp (shows a WhatsApp link). */
  whatsapp: z.boolean(),
});
export type ContactPhone = z.infer<typeof contactPhoneSchema>;

export const contactContentSchema = z.object({
  /** Business name shown on the contact page. */
  displayName: z.string().trim().max(80),
  phones: z.array(contactPhoneSchema).max(8),
  email: z.union([z.literal(''), z.email({ message: 'INVALID_EMAIL' }).max(200)]),
  address: localizedSchema(300),
  /** A map link (Google Maps, Neshan, Balad, OpenStreetMap…); or the coordinates below. */
  mapUrl: externalUrlSchema,
  mapLat: z.number().min(-90).max(90).nullable(),
  mapLng: z.number().min(-180).max(180).nullable(),
  hours: localizedSchema(200),
  /** The on-site support chat text and button on the contact page. */
  supportChat: z.boolean(),
});
export type ContactContent = z.infer<typeof contactContentSchema>;

// ---- Social ----

export const socialContentSchema = z.object({
  links: z
    .array(z.object({ network: z.enum(SOCIAL_NETWORKS), label: localizedSchema(40), url: externalUrlSchema, visible: z.boolean() }))
    .max(16),
});
export type SocialContent = z.infer<typeof socialContentSchema>;

// ---- Home page ----

export const contentButtonSchema = z.object({ label: localizedSchema(60), href: contentLinkSchema });
export type ContentButton = z.infer<typeof contentButtonSchema>;

const sectionBase = { id: z.string().regex(/^[a-z0-9-]{1,40}$/), visible: z.boolean() };

export const homeSectionSchema = z.discriminatedUnion('type', [
  z.object({
    ...sectionBase,
    type: z.literal('hero'),
    title: localizedRequiredSchema(160),
    text: localizedSchema(500),
    searchButton: localizedRequiredSchema(40),
    /** Optional background picture behind the dark first section. */
    imageUrl: contentImageSchema,
    showCategories: z.boolean(),
    categoriesTitle: localizedSchema(80),
    showProcess: z.boolean(),
    processTitle: localizedSchema(80),
    steps: z.array(z.object({ title: localizedRequiredSchema(80), text: localizedSchema(300) })).max(8),
    processButton: contentButtonSchema,
  }),
  z.object({ ...sectionBase, type: z.literal('brands'), title: localizedSchema(80), otherTitle: localizedSchema(80), otherText: localizedSchema(160), otherHref: contentLinkSchema }),
  z.object({ ...sectionBase, type: z.literal('featured'), title: localizedSchema(80), emptyText: localizedSchema(200), emptyButton: contentButtonSchema }),
  z.object({ ...sectionBase, type: z.literal('faq'), title: localizedSchema(80) }),
  z.object({ ...sectionBase, type: z.literal('text'), title: localizedSchema(120), body: localizedSchema(4000), imageUrl: contentImageSchema, button: contentButtonSchema }),
]);
export type HomeSection = z.infer<typeof homeSectionSchema>;
export type HomeSectionType = HomeSection['type'];

export const homeContentSchema = z
  .object({ sections: z.array(homeSectionSchema).max(20) })
  .superRefine((home, ctx) => {
    const ids = new Set<string>();
    const fixed = new Set<string>();
    for (const [i, s] of home.sections.entries()) {
      if (ids.has(s.id)) ctx.addIssue({ code: 'custom', path: ['sections', i, 'id'], message: 'DUPLICATE_SECTION' });
      ids.add(s.id);
      // Built-in blocks exist once; free text blocks can repeat.
      if (s.type !== 'text') {
        if (fixed.has(s.type)) ctx.addIssue({ code: 'custom', path: ['sections', i, 'type'], message: 'DUPLICATE_SECTION' });
        fixed.add(s.type);
      }
    }
  });
export type HomeContent = z.infer<typeof homeContentSchema>;

// ---- Notice bar ----

export const announcementContentSchema = z
  .object({
    enabled: z.boolean(),
    text: localizedSchema(200),
    linkLabel: localizedSchema(40),
    href: contentLinkSchema,
    tone: z.enum(['brand', 'info', 'warning']),
  })
  .superRefine((a, ctx) => {
    if (a.enabled && !a.text.fa) ctx.addIssue({ code: 'custom', path: ['text', 'fa'], message: 'REQUIRED' });
  });
export type AnnouncementContent = z.infer<typeof announcementContentSchema>;

// ---- SEO ----

const seoEntrySchema = z.object({ title: localizedSchema(70), description: localizedSchema(170), imageUrl: contentImageSchema });
export type SeoEntry = z.infer<typeof seoEntrySchema>;

export const seoContentSchema = z.object({
  defaultDescription: localizedSchema(170),
  /** Picture shown when a page is shared (Telegram, WhatsApp, LinkedIn…) unless the page has its own. */
  defaultImageUrl: contentImageSchema,
  pages: z.object({
    home: seoEntrySchema,
    parts: seoEntrySchema,
    brands: seoEntrySchema,
    imported: seoEntrySchema,
    requestPart: seoEntrySchema,
    contact: seoEntrySchema,
  }),
});
export type SeoContent = z.infer<typeof seoContentSchema>;

// ---- Sections saved as a whole (optimistic version) ----

export const CONTENT_SECTIONS = {
  brand: brandContentSchema,
  contact: contactContentSchema,
  social: socialContentSchema,
  home: homeContentSchema,
  announcement: announcementContentSchema,
  seo: seoContentSchema,
} as const;
export type ContentSectionKey = keyof typeof CONTENT_SECTIONS;
export const CONTENT_SECTION_KEYS = Object.keys(CONTENT_SECTIONS) as ContentSectionKey[];

export interface ContentSections {
  brand: BrandContent;
  contact: ContactContent;
  social: SocialContent;
  home: HomeContent;
  announcement: AnnouncementContent;
  seo: SeoContent;
}

export const contentSectionUpdateSchema = z.object({ version: z.number().int().min(0), value: z.unknown() });

// ---- FAQ ----

export const faqItemSchema = z.object({ question: localizedRequiredSchema(200), answer: localizedRequiredSchema(2000), visible: z.boolean() });
export const faqOrderSchema = z.object({ ids: z.array(idSchema).min(1).max(200) });

export interface FaqItemView {
  id: string;
  question: Localized;
  answer: Localized;
  visible: boolean;
  sortOrder: number;
  updatedAt: string;
}

// ---- Text pages ----

export const contentPageSchema = z.object({
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'INVALID_SLUG' }),
  title: localizedRequiredSchema(120),
  /** Simple formatting: "## heading", "- list item", **bold**, [text](link); never raw HTML. */
  body: localizedSchema(20000),
  published: z.boolean(),
  showInFooter: z.boolean(),
  seoTitle: localizedSchema(70),
  seoDescription: localizedSchema(170),
});
export type ContentPageInput = z.infer<typeof contentPageSchema>;

export interface ContentPageView extends ContentPageInput {
  id: string;
  isSystem: boolean;
  sortOrder: number;
  updatedAt: string;
}

// ---- What every public page receives (one cached request) ----

export interface SiteContentView {
  brand: BrandContent;
  contact: ContactContent;
  social: SocialContent;
  home: HomeContent;
  announcement: AnnouncementContent;
  seo: SeoContent;
  faq: Array<{ id: string; question: Localized; answer: Localized }>;
  footerPages: Array<{ slug: string; title: Localized }>;
}

export interface PublicContentPage {
  slug: string;
  title: Localized;
  body: Localized;
  seoTitle: Localized;
  seoDescription: Localized;
  updatedAt: string;
}
